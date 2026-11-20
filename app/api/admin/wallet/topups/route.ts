// POST /api/admin/wallet/topups — create a Platega invoice that tops up OUR
// ARTEMIDA API balance (administrator-only).
//
// The provider hosts the payment page; we only relay its URL. The amount is
// validated server-side (whole RUB, sane bounds) because the provider bills it
// straight to the operator's card/СБП account.
//
// Idempotency: the caller may pass a client key; otherwise the provider mints
// one. A retry with the same key must not create a second invoice, so the
// optional `idempotencyKey` is forwarded verbatim.
import { z } from "zod";
import { artemida, ArtemidaError } from "../../../../../lib/artemida";
import { requireRole } from "../../../../../lib/admin-auth";
import { gateErrorResponse, mapArtemidaStatus } from "../../../../../lib/admin-wallet";
import { logger } from "../../../../../lib/logger";

export const dynamic = "force-dynamic";

/** Whole RUB, at least 1. The provider enforces its own upper bound. */
const TOPUP_MIN = 1;
const TOPUP_MAX = 1_000_000;

const bodySchema = z.object({
  amount: z.number().int().min(TOPUP_MIN).max(TOPUP_MAX),
  idempotencyKey: z.string().min(1).max(200).optional(),
});

export async function POST(req: Request): Promise<Response> {
  try {
    await requireRole("administrator");
  } catch (err) {
    const mapped = gateErrorResponse(err);
    if (mapped) return mapped;
    logger.error({ route: "admin-wallet-topup", outcome: "session_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  try {
    const topup = await artemida.createWalletTopup(
      { amount: parsed.data.amount },
      parsed.data.idempotencyKey === undefined
        ? undefined
        : { idempotencyKey: parsed.data.idempotencyKey },
    );
    // A payment id is required to poll the invoice; without it the response is
    // unusable, so treat it as a provider failure rather than a success.
    if (topup.paymentId.length === 0) {
      logger.error({ route: "admin-wallet-topup", outcome: "missing_payment_id" });
      return Response.json({ error: "bad_gateway" }, { status: 502 });
    }
    logger.info({
      route: "admin-wallet-topup",
      outcome: "created",
      amount: topup.amount,
      paymentId: topup.paymentId,
    });
    return Response.json({ topup }, { status: 201 });
  } catch (err) {
    if (err instanceof ArtemidaError) {
      logger.warn({ route: "admin-wallet-topup", code: err.code, requestId: err.requestId });
      return Response.json({ error: err.code }, { status: mapArtemidaStatus(err.code) });
    }
    logger.error({ route: "admin-wallet-topup", outcome: "unexpected_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
