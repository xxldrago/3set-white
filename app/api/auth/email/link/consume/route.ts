// POST /api/auth/email/link/consume — finish the bot link (session-gated).
//
// The token must belong to the caller and carry a bot-bound Telegram id.
// Consumes atomically and re-mints the session with the tid claim
// (privilege change, same follow-through as the widget route). Outcomes:
// `forbidden` (another account's token), `not_ready` (bot step pending), `invalid`
// (expired/consumed/malformed) — the first two are caller errors (400/403),
// never an oracle beyond the caller's own tokens.
import { z } from "zod";
import { buildSessionCookie, signSession } from "../../../../../../lib/auth";
import { env } from "../../../../../../lib/env";
import { consumeLinkToken } from "../../../../../../lib/telegram-link";
import { logger } from "../../../../../../lib/logger";
import { SessionError, requireSession } from "../../../../../../lib/session";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  token: z.string().min(1).max(256),
});

export async function POST(req: Request): Promise<Response> {
  let userId: number;
  try {
    ({ userId } = await requireSession());
  } catch (err) {
    if (err instanceof SessionError) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    logger.error({ route: "email-link-consume", outcome: "session_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  try {
    const result = await consumeLinkToken(userId, parsed.data.token);
    if (result.kind === "forbidden") {
      return Response.json({ error: "forbidden" }, { status: 403 });
    }
    if (result.kind === "not_ready") {
      return Response.json({ error: "not_ready" }, { status: 409 });
    }
    if (result.kind === "invalid") {
      return Response.json({ error: "invalid_token" }, { status: 400 });
    }
    const session = await signSession(result.userId, result.telegramId, env.SESSION_SECRET);
    logger.info({ route: "email-link-consume", outcome: "linked" });
    return Response.json(
      { ok: true },
      {
        headers: {
          "Set-Cookie": buildSessionCookie(session, env.NODE_ENV === "production"),
        },
      },
    );
  } catch {
    logger.error({ route: "email-link-consume", outcome: "consume_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
