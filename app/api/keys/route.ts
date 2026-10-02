// GET /api/keys — session-gated BFF read of the user's subscriptions.
//
// Cache-first (D-29): the response is served instantly from `keys_cache`, then
// `after()` schedules a background refresh from ARTEMIDA `GET /keys` so the
// mirror catches up without ever blocking the response. Every read is scoped by
// the session telegram id (T-02-13 IDOR); provider failures in the background
// callback are logged and swallowed so they can never surface to the response
// (T-02-16).
import { after } from "next/server";
import { ArtemidaError } from "../../../lib/artemida";
import { listKeys, revalidateKeys } from "../../../lib/keys-service";
import { logger } from "../../../lib/logger";
import { requireSession, SessionError } from "../../../lib/session";

export const dynamic = "force-dynamic";

const unauthorized = () => Response.json({ error: "unauthorized" }, { status: 401 });

export async function GET(): Promise<Response> {
  let telegramId: number;
  try {
    telegramId = await requireSession();
  } catch (err) {
    if (err instanceof SessionError) return unauthorized();
    logger.error({ route: "keys", outcome: "session_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }

  let cached;
  try {
    cached = await listKeys(BigInt(telegramId));
  } catch {
    logger.error({ route: "keys", outcome: "cache_read_failed" });
    return Response.json({ error: "internal" }, { status: 500 });
  }

  // Runs after the response is sent and survives a response failure.
  after(async () => {
    try {
      await revalidateKeys(BigInt(telegramId));
    } catch (err) {
      if (err instanceof ArtemidaError) {
        logger.warn({ route: "keys", code: err.code, requestId: err.requestId, outcome: "revalidate_failed" });
      } else {
        logger.warn({ route: "keys", outcome: "revalidate_failed" });
      }
    }
  });

  return Response.json({ keys: cached });
}
