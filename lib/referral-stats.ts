// Referral funnel stats: clicks → registrations → purchases → revenue,
// plus bound devices. Scoped by owner (partner dashboard) or global
// (admin). Time-bucketed series power the SVG charts.
//
// Clicks are public and deduped per (owner, ipHash) hourly; everything else
// derives from owned rows. Revenue is captured cash
// (`finalAmount - balanceUsed` on paid orders of referred accounts).
import { createHash } from "node:crypto";
import { prisma } from "./prisma";

export type Granularity = "day" | "week" | "month" | "year";

export interface FunnelStats {
  clicks: number;
  registrations: number;
  purchases: number;
  revenue: number;
  devices: number;
}

export interface FunnelBucket extends FunnelStats {
  start: string;
}

const PAID = ["paid", "provisioning", "provisioned"] as const;

function hashIp(ip: string): string {
  return createHash("sha256").update(ip).digest("hex");
}

/**
 * Record a landing click. Hourly per-IP dedupe keeps refresh-spam out;
 * returns false when deduped (still 200 to the caller — no oracle needed,
 * but the count stays honest).
 */
export async function recordClick(
  ownerUserId: number,
  code: string | null,
  ip: string,
  source: string,
): Promise<boolean> {
  const ipHash = hashIp(ip);
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recent = await prisma.referralClick.findFirst({
    where: { ownerUserId, ipHash, createdAt: { gt: hourAgo } },
    select: { id: true },
  });
  if (recent) return false;
  await prisma.referralClick.create({
    data: { ownerUserId, code, ipHash, source: source.slice(0, 32) },
  });
  return true;
}

interface Scope {
  ownerUserId?: number;
}

function referredWhere(scope: Scope, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return scope.ownerUserId === undefined
    ? { referredById: { not: null }, ...extra }
    : { referredById: scope.ownerUserId, ...extra };
}

export async function funnelStats(
  scope: Scope,
  from: Date,
  to: Date,
): Promise<FunnelStats> {
  const range = { gte: from, lte: to };
  const ownerFilter =
    scope.ownerUserId === undefined ? {} : { ownerUserId: scope.ownerUserId };

  const [clicks, referred] = await Promise.all([
    prisma.referralClick.count({ where: { ...ownerFilter, createdAt: range } }),
    prisma.user.findMany({
      where: { ...referredWhere(scope), createdAt: range },
      select: { id: true },
    }),
  ]);
  const referredIds = referred.map((row) => row.id);

  const [orders, devices] = await Promise.all([
    referredIds.length === 0
      ? []
      : prisma.order.findMany({
          where: {
            userId: { in: referredIds },
            status: { in: [...PAID] },
            paidAt: { gte: from, lte: to },
          },
          select: { finalAmount: true, balanceUsed: true },
        }),
    referredIds.length === 0
      ? { _sum: { devices: null as number | null } }
      : prisma.keyCache.aggregate({
          where: { userId: { in: referredIds } },
          _sum: { devices: true },
        }),
  ]);

  return {
    clicks,
    registrations: referredIds.length,
    purchases: orders.length,
    revenue: orders.reduce(
      (sum, order) => sum + Math.max(0, order.finalAmount - order.balanceUsed),
      0,
    ),
    devices: devices._sum.devices ?? 0,
  };
}

function bucketStart(date: Date, granularity: Granularity): Date {
  const copy = new Date(date);
  if (granularity === "day") {
    copy.setHours(0, 0, 0, 0);
    return copy;
  }
  if (granularity === "week") {
    // ISO week: Monday 00:00 local.
    const day = (copy.getDay() + 6) % 7;
    copy.setDate(copy.getDate() - day);
    copy.setHours(0, 0, 0, 0);
    return copy;
  }
  if (granularity === "month") {
    return new Date(copy.getFullYear(), copy.getMonth(), 1);
  }
  return new Date(copy.getFullYear(), 0, 1);
}

function stepBucket(start: Date, granularity: Granularity): Date {
  const next = new Date(start);
  if (granularity === "day") next.setDate(next.getDate() + 1);
  else if (granularity === "week") next.setDate(next.getDate() + 7);
  else if (granularity === "month") next.setMonth(next.getMonth() + 1);
  else next.setFullYear(next.getFullYear() + 1);
  return next;
}

/**
 * Funnel series split into buckets. Ranges are capped at 366 buckets to
 * bound query fan-out (a year of days is 365 builders running in sequence —
 * each bucket is 3 small indexed queries).
 */
export async function funnelSeries(
  scope: Scope,
  from: Date,
  to: Date,
  granularity: Granularity,
): Promise<FunnelBucket[]> {
  const buckets: { start: Date; end: Date }[] = [];
  let cursor = bucketStart(from, granularity);
  const end = to.getTime();
  while (cursor.getTime() <= end && buckets.length < 366) {
    const next = stepBucket(cursor, granularity);
    buckets.push({ start: cursor, end: new Date(Math.min(next.getTime(), end + 1)) });
    cursor = next;
  }
  const out: FunnelBucket[] = [];
  for (const bucket of buckets) {
    const stats = await funnelStats(scope, bucket.start, bucket.end);
    out.push({ start: bucket.start.toISOString(), ...stats });
  }
  return out;
}
