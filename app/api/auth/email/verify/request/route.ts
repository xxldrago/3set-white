// POST /api/auth/email/verify/request — (re)send the confirmation link
// (session-gated). Authenticated by definition, so no IP throttle: the
// mailbox is the caller's own, and re-issue supersedes prior tokens.
// Already-verified → 409 `already_verified`; accounts without an email → 400.
import { requestVerification } from "../../../../../../lib/email-verify";
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
    logger.error({ route: "email-verify-request", outcome: "session_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }
  try {
    const result = await requestVerification(userId);
    if (!result.ok) {
      if (result.reason === "already_verified") {
        return Response.json({ error: "already_verified" }, { status: 409 });
      }
      if (result.reason === "no_email") {
        return Response.json({ error: "bad_request" }, { status: 400 });
      }
      return Response.json({ error: "mail_error" }, { status: 500 });
    }
    return Response.json({ ok: true });
  } catch {
    logger.error({ route: "email-verify-request", outcome: "request_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
