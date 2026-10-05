// POST /api/auth/telegram-bot/consume — exchange a bound token for a session
// (G-06-4b, D-86). The claim cookie (set by /request) must match the HMAC of
// the token, so a stolen/replayed token cannot yield another browser's session
// (T-06-06-01). The service consumes the token atomically (single-use,
// T-06-06-02) and upserts the user row by Telegram id, then this route mints
// the SAME httpOnly session cookie every other auth method uses.
import { z } from "zod";
import { cookies } from "next/headers";
import { buildSessionCookie, signSession } from "../../../../../lib/auth";
import { env } from "../../../../../lib/env";
import { logger } from "../../../../../lib/logger";
import { consumeLoginToken, LOGIN_CLAIM_COOKIE } from "../../../../../lib/telegram-login";

export const dynamic = "force-dynamic";

const consumeSchema = z.object({
  token: z.string().min(1).max(256),
});

export async function POST(req: Request): Promise<Response> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const parsed = consumeSchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const { token } = parsed.data;
  const claim = (await cookies()).get(LOGIN_CLAIM_COOKIE)?.value;

  try {
    const result = await consumeLoginToken(token, claim);
    if (result.kind === "invalid") {
      logger.warn({ route: "telegram-bot-consume", outcome: "invalid" });
      return Response.json({ error: "bad_request" }, { status: 400 });
    }
    if (result.kind === "forbidden") {
      // Wrong/missing claim cookie → anti-fixation failure, no oracle.
      logger.warn({ route: "telegram-bot-consume", outcome: "forbidden" });
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    if (result.kind === "not_ready") {
      // Unknown/expired/unbound/already-consumed → retry-or-restart.
      logger.warn({ route: "telegram-bot-consume", outcome: "not_ready" });
      return Response.json({ error: "login_not_ready" }, { status: 409 });
    }
    const session = await signSession(result.userId, result.telegramId, env.SESSION_SECRET);
    logger.info({ route: "telegram-bot-consume", outcome: "issued" });
    return Response.json(
      { ok: true },
      {
        headers: {
          "Set-Cookie": buildSessionCookie(session, env.NODE_ENV === "production"),
        },
      },
    );
  } catch {
    logger.error({ route: "telegram-bot-consume", outcome: "internal" });
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
