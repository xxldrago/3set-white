// POST /api/cron/rfm — nightly RFM snapshot recompute (D-11). Session-less
// machine endpoint, authenticated ONLY by x-cron-secret vs CRON_SECRET
// (shape copied verbatim from app/api/cron/analytics/route.ts).
import { timingSafeEqual } from "node:crypto";

export const dynamic = "force-dynamic";

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
  const { env } = await import("../../../../lib/env");
  const { logger } = await import("../../../../lib/logger");
  const expected = env.CRON_SECRET;
  if (!expected) {
    logger.warn({ route: "cron_rfm", outcome: "disabled" });
    return Response.json({ error: "disabled" }, { status: 503 });
  }
  if (!safeEq(req.headers.get("x-cron-secret"), expected)) {
    logger.warn({ route: "cron_rfm", outcome: "unauthorized" });
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const { recomputeAllRfm } = await import("../../../../lib/analytics/rfm-service");
    const result = await recomputeAllRfm();
    logger.info({ route: "cron_rfm", outcome: "recompute", ...result });
    return Response.json({ ok: true, ...result });
  } catch (error) {
    logger.error({ route: "cron_rfm", outcome: "unexpected_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
