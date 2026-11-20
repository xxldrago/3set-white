// POST /api/platega/callback — public, header-verified payment callback (D-34/D-35/D-38).
//
// This route is the public internet boundary: it holds NO session and is
// authenticated ONLY by the X-MerchantId/X-Secret headers (Platega has no
// signature). Two merchant accounts exist (site + bot), so the header pair also
// selects WHICH merchant called. The order of operations is load-bearing:
//   1. verify headers (timing-safe) BEFORE body parse → 401 on mismatch
//   2. zod-parse the body (CHARGEBACKED accepted)
//   3. resolve our order (plategaTxId first, else payload=orderId) and require
//      the calling merchant to match the order's merchant
//   4. D-34 server-side re-query GET /transaction/{id} through that merchant's
//      client — the callback is never the source of truth
//   5. require CONFIRMED; D-35 compare re-queried amount+currency to the stored
//      order; mismatch → alert + 200, NO transition
//   6. atomic pending→paid claim + one outbox row
// It NEVER provisions a key (D-38) and ALWAYS returns 200 fast (≤60s contract);
// a thrown error would trigger Platega's 3×5min redelivery.
import { z } from "zod";
import { logger } from "../../../../lib/logger";
import {
  applyConfirmedPayment,
  resolveOrderByTxOrPayload,
  transitionOrder,
  amountMatches,
} from "../../../../lib/orders-service";
import {
  PlategaError,
  detectPlategaMerchant,
  plategaClientFor,
} from "../../../../lib/platega";

export const dynamic = "force-dynamic";

const callbackSchema = z.object({
  id: z.string().min(1),
  amount: z.number(),
  currency: z.string().min(1),
  // The provider's full callback enum. DISPUTED = payment under review;
  // PARTIALLY_REFUNDED = partial money returned. Both arrive here and must
  // parse — the D-34 re-query decides what actually happened, so an unknown
  // status must never be treated as "not successful yet" and silently ignored.
  status: z.enum([
    "PENDING",
    "CONFIRMED",
    "CANCELED",
    "CHARGEBACKED",
    "PARTIALLY_REFUNDED",
    "DISPUTED",
  ]),
  paymentMethod: z.number().optional(),
  payload: z.string().optional(),
  refundId: z.string().optional(),
  refundAmount: z.number().optional(),
  refundStatus: z.enum(["Succeeded", "Declined"]).optional(),
});

/** Terminal acknowledgment — Platega requires a fast 2xx (never a throw). */
function ack(): Response {
  return new Response("OK", { status: 200 });
}

export async function POST(req: Request): Promise<Response> {
  // 1. Header authentication is mandatory and precedes any body read (T-03-forge).
  // Two merchant accounts exist (site + bot): the pair identifies which one
  // called, and that merchant's client does the authoritative re-query.
  const merchant = detectPlategaMerchant(req.headers);
  if (merchant === null) {
    logger.warn({ route: "platega_callback", outcome: "unauthorized" });
    return new Response("Unauthorized", { status: 401 });
  }

  // 2. Body is untrusted regardless of headers — zod at the boundary.
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return ack(); // malformed body is not actionable; never trigger a retry storm
  }
  const parsed = callbackSchema.safeParse(body);
  if (!parsed.success) {
    logger.warn({ route: "platega_callback", outcome: "bad_body" });
    return ack();
  }

  try {
    // 3. Resolve our order — plategaTxId first, else the echoed payload.
    const order = await resolveOrderByTxOrPayload(parsed.data.id, parsed.data.payload ?? null);
    if (!order) {
      logger.warn({ route: "platega_callback", outcome: "order_not_found" });
      return ack();
    }

    // 3a. The calling merchant must own the order. Legacy rows carry no
    // merchant — they were all created on the site pair, so only a site
    // callback may settle them. A mismatch is a misrouted/forged call: ack
    // (never redeliver) but never transition.
    const orderMerchant = order.plategaMerchant ?? "site";
    if (orderMerchant !== merchant) {
      logger.error({
        route: "platega_callback",
        outcome: "merchant_mismatch",
        orderId: order.id,
      });
      return ack();
    }

    // 4. D-34: independently re-query Platega. The callback body is a hint only.
    const tx = await plategaClientFor(merchant).getTransaction(parsed.data.id);

    // CHARGEBACKED refunds an already-captured order; money is never in
    // question for a pending order (never captured), so only captured states
    // are eligible (first successful transition wins).
    if (tx.status === "CHARGEBACKED") {
      for (const from of ["paid", "provisioning", "provisioned"] as const) {
        if (await transitionOrder(order.id, from, "refunded")) {
          logger.warn({ route: "platega_callback", outcome: "chargeback_refunded" });
          break;
        }
      }
      return ack();
    }

    // DISPUTED: the provider parked the payment under review — money is not
    // ours yet. Never issue on it, and never touch an order that was already
    // settled (a review opened AFTER capture leaves the issued key alone; a
    // later CHARGEBACKED is what claws it back).
    if (tx.status === "DISPUTED") {
      logger.warn({ route: "platega_callback", outcome: "disputed", orderId: order.id });
      return ack();
    }

    // PARTIALLY_REFUNDED: part of the money went back but the payment still
    // stands. Keep the order settled — the full-return path is CHARGEBACKED.
    if (tx.status === "PARTIALLY_REFUNDED") {
      logger.warn({
        route: "platega_callback",
        outcome: "partially_refunded",
        orderId: order.id,
      });
      return ack();
    }

    // 5. CONFIRMED + amount/currency checks are both mandatory (D-35).
    if (tx.status !== "CONFIRMED") {
      return ack(); // PENDING/CANCELED: nothing to issue, ack anyway
    }
    // Charged amount is the post-promo/balance finalAmount. Pre-promo legacy
    // rows carry finalAmount=0 (backfilled default) — those fall back to the
    // list amount. Fully covered orders never reach Platega, so a zero
    // finalAmount here always means legacy.
    const expected = order.finalAmount > 0 ? order.finalAmount : order.amount;
    if (!amountMatches(tx.amount, expected) || tx.currency !== order.currency) {
      // Financial anomaly: never issue; flag for owner review, still ack.
      logger.error({
        route: "platega_callback",
        outcome: "amount_mismatch",
        orderId: order.id,
      });
      return ack();
    }

    // 6. Atomic pending→paid claim + one fulfill enqueue — the SAME shared
    // helper the hourly reconcile uses, so the two paths cannot diverge (D-39).
    const claimed = await applyConfirmedPayment(order.id);
    if (claimed) {
      logger.info({ route: "platega_callback", outcome: "paid", orderId: order.id });
    }
  } catch (err) {
    // A re-query failure must NOT fail the ack — Platega would redeliver, and a
    // retry is safe because the pending→paid claim is idempotent.
    if (err instanceof PlategaError) {
      logger.warn({ route: "platega_callback", code: err.code, outcome: "requery_failed" });
    } else {
      logger.error({ route: "platega_callback", outcome: "unexpected_error" });
    }
  }

  return ack();
}
