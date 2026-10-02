// POST /api/trial — session-gated one-tap trial (D-21..D-24, TRIAL-01).
//
// The telegram id is resolved server-side from the signed httpOnly cookie; no
// client-supplied id is ever trusted (T-02-12). The DB claim in
// lib/keys-service is the single source of trial truth. A repeat attempt gets
// a clean `{ok:false, reason:"trial_used"}` — the provider message/code is
// never proxied (D-24 / T-02-11).
import { ArtemidaError } from "../../../lib/artemida";
import { startTrial } from "../../../lib/keys-service";
import { logger } from "../../../lib/logger";
import { requireSession, SessionError } from "../../../lib/session";

export const dynamic = "force-dynamic";

export async function POST(): Promise<Response> {
  let telegramId: number;
  try {
    telegramId = await requireSession();
  } catch (err) {
    if (err instanceof SessionError) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    logger.error({ route: "trial", outcome: "session_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }

  try {
    const result = await startTrial(BigInt(telegramId));
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
