// POST /api/cron/reconcile — optional, secret-gated manual reconcile trigger
// (A6 fallback / D-40). Session-less by design: it is a machine endpoint, not a
// user surface, and is authenticated ONLY by the shared `x-cron-secret` header
// compared timing-safe against `CRON_SECRET`.
//
// This exists because `instrumentation.ts` worker bootstrap (A6) is verified but
// not guaranteed in every standalone image; an external scheduler can hit this
// route hourly. It runs the SAME `reconcileOnce` pass and never provisions a key.
import { timingSafeEqual } from "node:crypto";
import { env } from "../../../../lib/env";
import { logger } from "../../../../lib/logger";
import { reconcileOnce } from "../../../../lib/worker";

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
  const expected = env.CRON_SECRET;
  // Unset secret → the route is closed rather than open (T-03-cronopen).
  if (!expected) {
    logger.warn({ route: "cron_reconcile", outcome: "disabled" });
    return Response.json({ error: "disabled" }, { status: 503 });
  }
  if (!safeEq(req.headers.get("x-cron-secret"), expected)) {
    logger.warn({ route: "cron_reconcile", outcome: "unauthorized" });
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await reconcileOnce();
  logger.info({ route: "cron_reconcile", outcome: "ok", ...result });
  return Response.json({ ok: true, ...result });
}
