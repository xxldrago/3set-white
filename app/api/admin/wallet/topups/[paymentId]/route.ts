// GET /api/admin/wallet/topups/[paymentId] — poll a top-up invoice
// (administrator-only).
//
// The provider credits the API balance exactly once, when the payment is
// confirmed; polling an already-processed payment does NOT credit it again
// (provider-side guarantee). We therefore only relay the state and the
// resulting balance — no local bookkeeping that could double-count.
import { z } from "zod";
import { artemida, ArtemidaError } from "../../../../../../lib/artemida";
import { requireRole } from "../../../../../../lib/admin-auth";
import { gateErrorResponse, mapArtemidaStatus } from "../../../../../../lib/admin-wallet";
import { logger } from "../../../../../../lib/logger";

export const dynamic = "force-dynamic";

const paymentIdSchema = z.string().min(1).max(200);

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ paymentId: string }> },
): Promise<Response> {
  try {
    await requireRole("administrator");
  } catch (err) {
    const mapped = gateErrorResponse(err);
    if (mapped) return mapped;
    logger.error({ route: "admin-wallet-topup-status", outcome: "session_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }

  const { paymentId } = await params;
  const parsed = paymentIdSchema.safeParse(paymentId);
  if (!parsed.success) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  try {
    const status = await artemida.getWalletTopup(parsed.data);
    return Response.json({ status });
  } catch (err) {
    if (err instanceof ArtemidaError) {
      logger.warn({
        route: "admin-wallet-topup-status",
        code: err.code,
        requestId: err.requestId,
      });
      return Response.json({ error: err.code }, { status: mapArtemidaStatus(err.code) });
    }
    logger.error({ route: "admin-wallet-topup-status", outcome: "unexpected_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
