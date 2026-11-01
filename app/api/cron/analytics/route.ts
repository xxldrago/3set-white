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
//
// Phase 12: 3-day retry for open degraded events, event closure, 13-month click retention.
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
  const { prisma } = await import("../../../../lib/prisma");
  
  // Phase 12: find last 3 MSK days with open degraded events and retry
  try {
    const threeDaysAgo = mskDayLabel(new Date(now.getTime() - 3 * 86_400_000));
    const openEvents = await prisma.dataQualityEvent.findMany({
      where: {
        resolvedAt: null,
        mskDay: {
          gte: new Date(threeDaysAgo + "T00:00:00.000Z"),
        },
      },
    });
    
    if (openEvents.length > 0) {
      const retryDays = new Set<string>();
      for (const ev of openEvents) {
        const d = ev.mskDay;
        // mskDay is stored as Date
        const dayLabel = mskDayLabel(d);
        retryDays.add(dayLabel);
      }
      // Re-roll those specific days
      const retryArr = Array.from(retryDays).sort();
      if (retryArr.length > 0) {
        await rollupDays(retryArr[0], retryArr[retryArr.length - 1], "cron", {
          degradedDays: new Set(),
        });
        // Close events if successful
        await prisma.dataQualityEvent.updateMany({
          where: {
            resolvedAt: null,
            mskDay: {
              in: Array.from(retryDays).map(d => new Date(d + "T00:00:00.000Z")),
            },
          },
          data: { resolvedAt: new Date() },
        });
      }
    }
  } catch (e) {
    logger.warn({ route: "cron_analytics", outcome: "retry_failed", err: (e as any)?.message });
  }
  
  // 13-month click retention sweep
  try {
    const cutoff = new Date(now.getTime() - 13 * 30 * 86_400_000); // approx 13 months
    // More accurately ~395 days
    const cutoff13m = new Date(now.getTime() - 395 * 86_400_000);
    await (prisma as any).referralClick?.deleteMany({
      where: {
        createdAt: {
          lt: cutoff13m,
        },
      },
    });
  } catch (e) {
    logger.warn({ route: "cron_analytics", outcome: "retention_failed", err: (e as any)?.message });
  }
  
  const result = await rollupDays(fromDay, toDay);
  
  // Phase 13: anomaly detection
  try {
    const { detectAnomalies } = await import("../../../../lib/analytics/detect-service");
    await detectAnomalies();
  } catch (e) {
    logger.warn({ route: "cron_analytics", outcome: "detect_failed", err: (e as any)?.message });
  }
  
  logger.info({ route: "cron_analytics", outcome: "rollup", ...result });
  return Response.json({ ok: true, ...result });
}
