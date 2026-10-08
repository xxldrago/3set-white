// POST /api/platega/callback — public, header-verified payment callback (D-34/D-35/D-38).
//
// This route is the public internet boundary: it holds NO session and is
// authenticated ONLY by the X-MerchantId/X-Secret headers (Platega has no
// signature). The order of operations is load-bearing:
//   1. verify headers (timing-safe) BEFORE body parse → 401 on mismatch
//   2. zod-parse the body (CHARGEBACKED accepted)
//   3. resolve our order (plategaTxId first, else payload=orderId)
//   4. D-34 server-side re-query GET /transaction/{id} — the callback is never
//      the source of truth
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
} from "../../../../lib/orders-service";
import { PlategaError, platega, verifyPlategaHeaders } from "../../../../lib/platega";

export const dynamic = "force-dynamic";

const callbackSchema = z.object({
  id: z.string().min(1),
  amount: z.number(),
  currency: z.string().min(1),
  status: z.enum(["PENDING", "CONFIRMED", "CANCELED", "CHARGEBACKED"]),
  paymentMethod: z.number().optional(),
  payload: z.string().optional(),
});

/** Terminal acknowledgment — Platega requires a fast 2xx (never a throw). */
function ack(): Response {
  return new Response("OK", { status: 200 });
}

export async function POST(req: Request): Promise<Response> {
  // 1. Header authentication is mandatory and precedes any body read (T-03-forge).
  if (!verifyPlategaHeaders(req.headers)) {
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

    // 4. D-34: independently re-query Platega. The callback body is a hint only.
    const tx = await platega.getTransaction(parsed.data.id);

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

    // 5. CONFIRMED + amount/currency equality are both mandatory (D-35).
    if (tx.status !== "CONFIRMED") {
      return ack(); // PENDING/CANCELED: nothing to issue, ack anyway
    }
    // Charged amount is the post-promo/balance finalAmount. Pre-promo legacy
    // rows carry finalAmount=0 (backfilled default) — those fall back to the
    // list amount. Fully covered orders never reach Platega, so a zero
    // finalAmount here always means legacy.
    const expected = order.finalAmount > 0 ? order.finalAmount : order.amount;
    if (tx.amount !== expected || tx.currency !== order.currency) {
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
