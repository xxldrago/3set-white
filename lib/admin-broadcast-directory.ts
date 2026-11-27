// Admin broadcast (/admin/broadcast) — server-only read model.
//
// One round-trip per view for the campaign history + the aggregate panels, so
// the page makes a single request for KPIs / chart / list instead of N+1
// queries. Every field is read from our own `broadcasts` table; nothing is
// synthesised:
//   * status / totals — `broadcasts` (status, total, sent, failed, timestamps)
//   * search — the message body
//   * series — real daily buckets of campaigns created and messages delivered
//
// The schema has no name, subject, segment, scheduled-for or tracking columns,
// so this module never invents them. The UI shows delivery counts (which are
// real) instead of open/click rates (which are not tracked).
//
// The caller must have passed `requireRole` first (the BFF does that); this
// module performs no authorization of its own.
import { prisma } from "./prisma";

export type BroadcastStatus = "queued" | "sending" | "sent" | "failed";

export const BROADCAST_FILTERS: readonly BroadcastStatus[] = [
  "queued",
  "sending",
  "sent",
  "failed",
] as const;

/** Queue filters backed by the real `status` column. */
export type BroadcastFilter = "all" | BroadcastStatus;

export const BROADCAST_QUEUE_FILTERS: readonly BroadcastFilter[] = [
  "all",
  ...BROADCAST_FILTERS,
] as const;

export const BROADCAST_DEFAULT_PAGE_SIZE = 20;
export const BROADCAST_MAX_PAGE_SIZE = 100;

/** How far back the daily series looks. */
const SERIES_DAYS = 30;

export interface BroadcastRow {
  id: string;
  /** Full message body — the detail modal shows it verbatim. */
  body: string;
  /** Single-line body excerpt for the table. */
  preview: string;
  status: BroadcastStatus;
  total: number;
  sent: number;
  failed: number;
  /** Recipients not yet processed (`total - sent - failed`, floored at 0). */
  pending: number;
  createdAt: string;
  finishedAt: string | null;
  authorTelegramId: string;
  /** `sent / (sent + failed)` as a percentage, or null when nothing ran yet. */
  deliveryRate: number | null;
}

export interface BroadcastSeriesPoint {
  /** `YYYY-MM-DD` in the server timezone. */
  day: string;
  campaigns: number;
  delivered: number;
}

/**
 * Real per-type counters over the `notifications` outbox. These are the
 * automated dispatchers the worker actually runs — not a user-configurable
 * trigger builder, which the schema has no table for.
 */
export interface AutomationRow {
  /** Raw `notifications.type` value. */
  type: string;
  total: number;
  pending: number;
  done: number;
  failed: number;
}

export interface BroadcastStats {
  /** Campaigns matching no filter (all-time). */
  campaigns: number;
  messagesSent: number;
  messagesFailed: number;
  /** Campaigns currently queued or sending. */
  inFlight: number;
  /** Percentage of processed messages that were delivered, or null. */
  deliverability: number | null;
  /** Campaigns created in the last 30 days. */
  last30d: number;
  /** Users with a Telegram chat — the ceiling for an "all" broadcast. */
  reachable: number;
}

export interface BroadcastDirectory {
  rows: BroadcastRow[];
  stats: BroadcastStats;
  series: BroadcastSeriesPoint[];
  /** Real automation dispatch counters by notification type. */
  automation: AutomationRow[];
  /** Rows matching the current filter + search, before pagination. */
  total: number;
  page: number;
  pageSize: number;
  filter: BroadcastFilter;
  q: string;
}

function previewOf(body: string): string {
  const flat = body.replace(/\s+/g, " ").trim();
  return flat.length > 140 ? `${flat.slice(0, 137)}…` : flat;
}

function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function toStatus(value: string): BroadcastStatus {
  return (BROADCAST_FILTERS as readonly string[]).includes(value)
    ? (value as BroadcastStatus)
    : "queued";
}

export interface BroadcastQuery {
  q?: string;
  filter?: BroadcastFilter;
  page?: number;
  pageSize?: number;
}

export async function adminBroadcastDirectory(
  query: BroadcastQuery = {},
): Promise<BroadcastDirectory> {
  const q = (query.q ?? "").trim().slice(0, 200);
  const filter: BroadcastFilter = (BROADCAST_QUEUE_FILTERS as readonly string[]).includes(
    query.filter ?? "",
  )
    ? (query.filter as BroadcastFilter)
    : "all";
  const page = Number.isInteger(query.page) && (query.page ?? 0) > 0 ? (query.page as number) : 1;
  const pageSize = Math.min(
    Math.max(1, query.pageSize ?? BROADCAST_DEFAULT_PAGE_SIZE),
    BROADCAST_MAX_PAGE_SIZE,
  );

  const where = {
    ...(filter === "all" ? {} : { status: filter }),
    ...(q ? { body: { contains: q, mode: "insensitive" as const } } : {}),
  };

  const seriesCutoff = new Date();
  seriesCutoff.setHours(0, 0, 0, 0);
  seriesCutoff.setDate(seriesCutoff.getDate() - (SERIES_DAYS - 1));

  const [rows, total, campaigns, sentAgg, failedAgg, inFlight, recent, seriesRows, reachable, automationRows] =
    await Promise.all([
      prisma.broadcast.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          body: true,
          status: true,
          total: true,
          sent: true,
          failed: true,
          createdAt: true,
          finishedAt: true,
          authorTelegramId: true,
        },
      }),
      prisma.broadcast.count({ where }),
      prisma.broadcast.count(),
      prisma.broadcast.aggregate({ _sum: { sent: true } }),
      prisma.broadcast.aggregate({ _sum: { failed: true } }),
      prisma.broadcast.count({ where: { status: { in: ["queued", "sending"] } } }),
      prisma.broadcast.count({ where: { createdAt: { gte: seriesCutoff } } }),
      prisma.broadcast.findMany({
        where: { createdAt: { gte: seriesCutoff } },
        select: { createdAt: true, sent: true },
      }),
      prisma.user.count({ where: { chatId: { not: null } } }),
      prisma.notification.groupBy({
        by: ["type", "status"],
        _count: { _all: true },
      }),
    ]);

  const messagesSent = sentAgg._sum.sent ?? 0;
  const messagesFailed = failedAgg._sum.failed ?? 0;
  const processed = messagesSent + messagesFailed;

  const automationMap = new Map<string, AutomationRow>();
  for (const row of automationRows) {
    const count = row._count._all;
    const entry =
      automationMap.get(row.type) ??
      { type: row.type, total: 0, pending: 0, done: 0, failed: 0 };
    entry.total += count;
    if (row.status === "done") entry.done += count;
    else if (row.status === "failed") entry.failed += count;
    else entry.pending += count;
    automationMap.set(row.type, entry);
  }
  const automation = [...automationMap.values()].sort((a, b) => b.total - a.total);

  const buckets = new Map<string, BroadcastSeriesPoint>();
  for (let i = 0; i < SERIES_DAYS; i += 1) {
    const d = new Date(seriesCutoff);
    d.setDate(seriesCutoff.getDate() + i);
    const key = dayKey(d);
    buckets.set(key, { day: key, campaigns: 0, delivered: 0 });
  }
  for (const row of seriesRows) {
    const point = buckets.get(dayKey(row.createdAt));
    if (!point) continue;
    point.campaigns += 1;
    point.delivered += row.sent;
  }

  return {
    rows: rows.map((row) => {
      const pending = Math.max(0, row.total - row.sent - row.failed);
      const done = row.sent + row.failed;
      return {
        id: row.id,
        body: row.body,
        preview: previewOf(row.body),
        status: toStatus(row.status),
        total: row.total,
        sent: row.sent,
        failed: row.failed,
        pending,
        createdAt: row.createdAt.toISOString(),
        finishedAt: row.finishedAt ? row.finishedAt.toISOString() : null,
        authorTelegramId: row.authorTelegramId.toString(),
        deliveryRate: done > 0 ? Math.round((row.sent / done) * 100) : null,
      };
    }),
    stats: {
      campaigns,
      messagesSent,
      messagesFailed,
      inFlight,
      deliverability: processed > 0 ? Math.round((messagesSent / processed) * 100) : null,
      last30d: recent,
      reachable,
    },
    series: [...buckets.values()],
    automation,
    total,
    page,
    pageSize,
    filter,
    q,
  };
}
