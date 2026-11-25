// GET /api/admin/referrals/top-refs — administrator.
//
// Top-5 inviters by earned referral money (T5): real `walletTx` sums from
// lib/admin-service.adminTopRefs + the per-user referral counts.
import { requireRole } from "../../../../../lib/admin-auth";
import { adminTopRefs } from "../../../../../lib/admin-service";
import { logger } from "../../../../../lib/logger";
import { AdminError, SessionError } from "../../../../../lib/session";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    await requireRole("administrator");
  } catch (err) {
    if (err instanceof SessionError) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    if (err instanceof AdminError) {
      return Response.json({ error: "not_found" }, { status: 404 });
    }
    logger.error({ route: "admin-refs-top", outcome: "session_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }
  try {
    return Response.json({ refs: await adminTopRefs(5) });
  } catch {
    logger.error({ route: "admin-refs-top", outcome: "list_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
