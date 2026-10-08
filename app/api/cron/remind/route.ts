// POST /api/cron/remind — optional, secret-gated manual expiry-reminder trigger
// (A6 fallback / D-60). Session-less by design: it is a machine endpoint, not a
// user surface, and is authenticated ONLY by the shared `x-cron-secret` header
// compared timing-safe against `CRON_SECRET`.
//
// This exists because `instrumentation.ts` worker bootstrap (A6) is verified but
// not guaranteed in every standalone image; an external scheduler can hit this
// route daily. It runs the SAME `runReminderScan` pass the worker tick runs and
// never sends Telegram inline (it only enqueues `remind-expiry` rows).
import { timingSafeEqual } from "node:crypto";

export const dynamic = "force-dynamic";

/** Length-guarded constant-time compare (mirrors lib/platega.ts safeEq). */
function safeEq(received: string | null, expected: string): boolean {
  if (received === null) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export async function POST(req: Request): Promise<Response> {
  // Lazy imports: keep lib/env + lib/worker out of the build-time module graph
  // so `next build` never evaluates runtime secrets (mirrors instrumentation.ts).
  const { env } = await import("../../../../lib/env");
  const { logger } = await import("../../../../lib/logger");
  const expected = env.CRON_SECRET;
  // Unset secret → the route is closed rather than open (T-04-33).
  if (!expected) {
    logger.warn({ route: "cron_remind", outcome: "disabled" });
    return Response.json({ error: "disabled" }, { status: 503 });
  }
  if (!safeEq(req.headers.get("x-cron-secret"), expected)) {
    logger.warn({ route: "cron_remind", outcome: "unauthorized" });
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const { runReminderScan } = await import("../../../../lib/worker");
  const { runAutoRenewScan } = await import("../../../../lib/autorenew");
  const result = await runReminderScan();
  // Same pass, no sender: short-balance renewals land as pending orders in
  // the cabinet (the worker tick with a sender additionally DMs the link).
  const renew = await runAutoRenewScan(new Date());
  // Never log chat ids, sub-links, or key ids beyond the aggregate counts.
  logger.info({ route: "cron_remind", outcome: "ok", ...result, renew });
  return Response.json({ ok: true, ...result, renew });
}
