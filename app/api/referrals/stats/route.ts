// GET /api/referrals/stats — own funnel numbers + series (session-gated).
// Same shape as the admin endpoint, scope forced to the caller. Powers the
// partner dashboard charts; regular accounts see their own link stats too.
import { z } from "zod";
import { logger } from "../../../../lib/logger";
import { funnelSeries, funnelStats, type Granularity } from "../../../../lib/referral-stats";
import { SessionError, requireSession } from "../../../../lib/session";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  granularity: z.enum(["day", "week", "month", "year"]).default("day"),
});

export async function GET(req: Request): Promise<Response> {
  let userId: number;
  try {
    ({ userId } = await requireSession());
  } catch (err) {
    if (err instanceof SessionError) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    logger.error({ route: "refstats", outcome: "session_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }
  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
    granularity: url.searchParams.get("granularity") ?? undefined,
  });
  if (!parsed.success) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  try {
    const now = new Date();
    const to = parsed.data.to ? new Date(parsed.data.to) : now;
    const from = parsed.data.from
      ? new Date(parsed.data.from)
      : new Date(now.getTime() - 30 * 86_400_000);
    const safeTo = Number.isNaN(to.getTime()) ? now : to;
    const safeFrom = Number.isNaN(from.getTime()) ? new Date(now.getTime() - 30 * 86_400_000) : from;
    const scope = { ownerUserId: userId };
    const [stats, series] = await Promise.all([
      funnelStats(scope, safeFrom, safeTo),
      funnelSeries(scope, safeFrom, safeTo, parsed.data.granularity as Granularity),
    ]);
    return Response.json({ stats, series, granularity: parsed.data.granularity });
  } catch {
    logger.error({ route: "refstats", outcome: "stats_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
