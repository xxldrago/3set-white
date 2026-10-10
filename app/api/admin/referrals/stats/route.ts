// GET /api/admin/referrals/stats — funnel numbers + series (administrator).
//
// Query: `from`/`to` ISO dates (defaults: last 30d, capped at 366d),
// `granularity` day|week|month|year (default day), optional `userId`
// (internal id) to scope one partner. Buckets cap at 366 (service-enforced).
import { z } from "zod";
import { requireRole } from "../../../../../lib/admin-auth";
import { logger } from "../../../../../lib/logger";
import { funnelSeries, funnelStats, type Granularity } from "../../../../../lib/referral-stats";
import { AdminError, SessionError } from "../../../../../lib/session";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  granularity: z.enum(["day", "week", "month", "year"]).default("day"),
  userId: z.coerce.number().int().positive().optional(),
});

function range(search: URLSearchParams): { from: Date; to: Date } {
  const now = new Date();
  const to = new Date(search.get("to") ?? now.toISOString());
  const from = new Date(
    search.get("from") ?? new Date(now.getTime() - 30 * 86_400_000).toISOString(),
  );
  const safeTo = Number.isNaN(to.getTime()) ? now : to;
  const safeFrom = Number.isNaN(from.getTime())
    ? new Date(now.getTime() - 30 * 86_400_000)
    : from;
  // Cap the window at 366 days; clamp inversions to a single day.
  const capped =
    safeTo.getTime() - safeFrom.getTime() > 366 * 86_400_000
      ? new Date(safeTo.getTime() - 366 * 86_400_000)
      : safeFrom;
  const ordered = capped.getTime() > safeTo.getTime() ? safeTo : capped;
  return { from: ordered, to: safeTo };
}

export async function GET(req: Request): Promise<Response> {
  try {
    await requireRole("administrator");
  } catch (err) {
    if (err instanceof SessionError) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    if (err instanceof AdminError) {
      return Response.json({ error: "not_found" }, { status: 404 });
    }
    logger.error({ route: "admin-refstats", outcome: "session_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }
  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
    granularity: url.searchParams.get("granularity") ?? undefined,
    userId: url.searchParams.get("userId") ?? undefined,
  });
  if (!parsed.success) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  try {
    const { from, to } = range(url.searchParams);
    const scope =
      parsed.data.userId === undefined ? {} : { ownerUserId: parsed.data.userId };
    const [stats, series] = await Promise.all([
      funnelStats(scope, from, to),
      funnelSeries(scope, from, to, parsed.data.granularity as Granularity),
    ]);
    return Response.json({ stats, series, granularity: parsed.data.granularity });
  } catch {
    logger.error({ route: "admin-refstats", outcome: "stats_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
