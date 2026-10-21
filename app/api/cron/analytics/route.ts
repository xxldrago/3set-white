// POST /api/cron/analytics — nightly rollup trigger (D-13). Session-less by
// design: it is a machine endpoint, not a user surface, and is authenticated
// ONLY by the shared `x-cron-secret` header compared timing-safe against
// `CRON_SECRET` (shape copied verbatim from app/api/cron/reconcile/route.ts).
// The host cron fires at 03:05 (03:00 belongs to pg_dump — docs/DEPLOY §7).
//
// The run re-rolls the LAST 7 MSK days (not just yesterday) so a 23:50 order
// provisioned at 00:10 self-heals its providerCost (Pitfall 9); the upsert
// is absolute-value, which makes re-rolling free. The response carries
// ids/outcomes only — never DATABASE_URL or provider payloads.
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
  // Lazy imports: keep lib/env + lib/analytics/rollup out of the build-time
  // module graph so `next build` never evaluates runtime secrets.
  const { env } = await import("../../../../lib/env");
  const { logger } = await import("../../../../lib/logger");
  const expected = env.CRON_SECRET;
  // Unset secret → the route is closed rather than open (T-03-cronopen).
  if (!expected) {
    logger.warn({ route: "cron_analytics", outcome: "disabled" });
    return Response.json({ error: "disabled" }, { status: 503 });
  }
  if (!safeEq(req.headers.get("x-cron-secret"), expected)) {
    logger.warn({ route: "cron_analytics", outcome: "unauthorized" });
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  // Re-roll window in JS (never SQL): today-7 … yesterday, MSK labels.
  const { mskDayLabel } = await import("../../../../lib/analytics/time");
  const now = new Date();
  const toDay = mskDayLabel(new Date(now.getTime() - 86_400_000));
  const fromDay = mskDayLabel(new Date(now.getTime() - 7 * 86_400_000));

  const { rollupDays } = await import("../../../../lib/analytics/rollup");
  const result = await rollupDays(fromDay, toDay);
  logger.info({ route: "cron_analytics", outcome: "rollup", ...result });
  return Response.json({ ok: true, ...result });
}
