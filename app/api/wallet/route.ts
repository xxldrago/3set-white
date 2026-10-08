// GET /api/wallet — referral summary for the cabinet (session-gated).
// Returns the public code, referral count, lifetime earnings, and spendable
// balance. The code is ensured lazily so pre-program accounts get one on
// first open. Never leaks other users' rows.
import { getReferralSettings, getReferralSummary } from "../../../lib/referrals";
import { logger } from "../../../lib/logger";
import { SessionError, requireSession } from "../../../lib/session";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  let userId: number;
  try {
    ({ userId } = await requireSession());
  } catch (err) {
    if (err instanceof SessionError) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    logger.error({ route: "wallet", outcome: "session_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }
  try {
    const [summary, settings] = await Promise.all([
      getReferralSummary(userId),
      getReferralSettings(),
    ]);
    return Response.json({ ...summary, minWithdraw: settings.minWithdraw });
  } catch {
    logger.error({ route: "wallet", outcome: "summary_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
