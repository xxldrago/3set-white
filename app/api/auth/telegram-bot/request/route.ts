// POST /api/auth/telegram-bot/request — issue a bot-redirect login token
// (G-06-4b, plan 06-06). No session required: this is the anonymous entry
// point. Returns the one-time token + t.me deep link, and sets an httpOnly
// claim cookie so ONLY the issuing browser can later consume the token
// (anti session-fixation, T-06-06-01). Per-IP throttle mirrors D-84: the
// server computes `retryAfterSec`, the client never fabricates it.
import {
  buildBotLoginUrl,
  buildClaimCookie,
  issueLoginToken,
  resolveBotUsername,
} from "../../../../../lib/telegram-login";
import { env } from "../../../../../lib/env";
import { logger } from "../../../../../lib/logger";

export const dynamic = "force-dynamic";

function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first && first.length > 0 ? first : "direct";
}

export async function POST(req: Request): Promise<Response> {
  const ip = clientIp(req);
  try {
    const issued = await issueLoginToken(ip);
    if (issued.kind === "throttled") {
      logger.warn({ route: "telegram-bot-request", outcome: "rate_limited" });
      return Response.json(
        { error: "rate_limited", retryAfterSec: issued.retryAfterSec },
        { status: 429 },
      );
    }
    const username = await resolveBotUsername();
    if (!username) {
      logger.error({ route: "telegram-bot-request", outcome: "no_bot_username" });
      return Response.json({ error: "internal" }, { status: 500 });
    }
    logger.info({ route: "telegram-bot-request", outcome: "issued" });
    return Response.json(
      {
        token: issued.token,
        botUrl: buildBotLoginUrl(username, issued.token),
        expiresInSec: issued.expiresInSec,
      },
      {
        headers: {
          "Set-Cookie": buildClaimCookie(issued.claim, env.NODE_ENV === "production"),
        },
      },
    );
  } catch {
    logger.error({ route: "telegram-bot-request", outcome: "internal" });
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
