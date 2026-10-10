// POST /api/auth/email/link/request — issue a bot deep-link token for the
// session account (link-via-bot). Session-gated; per-user throttle mirrors
// the login flow. Returns `{ token, botUrl, expiresInSec }` — the client
// opens botUrl and polls `../status`.
import { issueLinkToken } from "../../../../../../lib/telegram-link";
import { logger } from "../../../../../../lib/logger";
import { SessionError, requireSession } from "../../../../../../lib/session";

export const dynamic = "force-dynamic";

export async function POST(): Promise<Response> {
  let userId: number;
  try {
    ({ userId } = await requireSession());
  } catch (err) {
    if (err instanceof SessionError) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    logger.error({ route: "email-link-request", outcome: "session_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }
  try {
    const issued = await issueLinkToken(userId);
    if (issued.kind === "throttled") {
      return Response.json(
        { error: "rate_limited", retryAfterSec: issued.retryAfterSec },
        { status: 429 },
      );
    }
    return Response.json({
      token: issued.token,
      botUrl: issued.botUrl,
      expiresInSec: issued.expiresInSec,
    });
  } catch {
    logger.error({ route: "email-link-request", outcome: "issue_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
