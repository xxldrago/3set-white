// GET /api/admin/wallet — provider API balance (administrator-only).
//
// The API balance is OUR prepaid account with ARTEMIDA: key creation, renewals
// and device upgrades charge it (a 402 means it ran dry and the operation did
// not happen). It is separate from the Platega balance customers pay into, so
// it is an operator-only surface — never rendered to a customer.
import { artemida, ArtemidaError } from "../../../../lib/artemida";
import { requireRole } from "../../../../lib/admin-auth";
import { gateErrorResponse, mapArtemidaStatus } from "../../../../lib/admin-wallet";
import { logger } from "../../../../lib/logger";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    await requireRole("administrator");
  } catch (err) {
    const mapped = gateErrorResponse(err);
    if (mapped) return mapped;
    logger.error({ route: "admin-wallet", outcome: "session_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }

  try {
    const balance = await artemida.getBalance();
    return Response.json({ balance });
  } catch (err) {
    if (err instanceof ArtemidaError) {
      logger.warn({ route: "admin-wallet", code: err.code, requestId: err.requestId });
      return Response.json({ error: err.code }, { status: mapArtemidaStatus(err.code) });
    }
    logger.error({ route: "admin-wallet", outcome: "balance_failed" });
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
