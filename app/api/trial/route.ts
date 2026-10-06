// POST /api/trial — session-gated one-tap trial (D-21..D-24, TRIAL-01).
//
// The identity is resolved server-side from the signed httpOnly cookie; no
// client-supplied id is ever trusted (T-02-12). Phase 6 (D-82) sessions carry
// a userId and an optional telegramId: a linked Telegram session keeps the
// exact pre-Phase-6 TG path (customerRef = telegram id), an email-only session
// takes the userId path (customerRef = email:{userId}, D-80). The DB claim in
// lib/keys-service is the single source of trial truth. A repeat attempt gets
// a clean `{ok:false, reason:"trial_used"}` — the provider message/code is
// never proxied (D-24 / T-02-11).
import { ArtemidaError } from "../../../lib/artemida";
import { startTrial, startTrialByUserId } from "../../../lib/keys-service";
import { logger } from "../../../lib/logger";
import { requireSession, SessionError } from "../../../lib/session";

export const dynamic = "force-dynamic";

export async function POST(): Promise<Response> {
  let userId: number;
  let telegramId: number | null;
  try {
    ({ userId, telegramId } = await requireSession());
  } catch (err) {
    if (err instanceof SessionError) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    logger.error({ route: "trial", outcome: "session_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }

  try {
    // TG-linked sessions keep the byte-for-byte pre-Phase-6 path; email-only
    // sessions use the userId-keyed claim + `email:{userId}` customerRef.
    const result =
      telegramId !== null
        ? await startTrial(BigInt(telegramId))
        : await startTrialByUserId(userId);
    if (result.kind === "already_used") {
      // Clean RU response; the UI maps this to the "already used" copy + CTA.
      return Response.json({ ok: false, reason: "trial_used" }, { status: 409 });
    }
    return Response.json({ ok: true, key: result.key });
  } catch (err) {
    if (err instanceof ArtemidaError) {
      logger.warn({ route: "trial", code: err.code, requestId: err.requestId });
      const status =
        err.code === "rate_limited"
          ? 429
          : err.code === "payment_required"
            ? 402
            : err.code === "bad_gateway" || err.code === "unavailable"
              ? 502
              : err.code === "conflict"
                ? 409
                : 500;
      return Response.json({ error: err.code, retryAfter: err.retryAfterSec }, { status });
    }
    logger.error({ route: "trial", outcome: "unexpected_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
