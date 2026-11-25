// Admin tickets inbox (/admin/tickets) — server-only read model.
//
// One round-trip per view for the paginated queue + the aggregate panels, so the
// page makes a single request for cards / chart / donut / list instead of N+1
// queries. Every field is read from our own tables; nothing is synthesised:
//   * status / unread / activity — `tickets` (status, unread_for_admin,
//     last_message_at, created_at)
//   * search — subject, any message body, requester email / @username / name
//   * series — real daily buckets of tickets created and support replies sent
//   * SLA — real latency between the first user message and the first support
//     message, plus the count of open threads idle for more than 24h
//
// There is no `assignee`, `priority` or internal-note column in the schema, so
// this module never invents them. The UI disables those controls explicitly.
//
// The caller must have passed `requireRole` first (the BFF does that); this
// module performs no authorization of its own.
import type { Prisma } from "../generated/prisma/client";
import { prisma } from "./prisma";

/** Queue filters backed by real columns. */
export type TicketQueueFilter =
  | "all"
  | "unread"
  | "open"
  | "answered"
  | "closed";

export const TICKET_QUEUE_FILTERS: readonly TicketQueueFilter[] = [
  "all",
  "unread",
  "open",
  "answered",
  "closed",
] as const;

/** Sorts backed by real columns / honest derived ordering. */
export type TicketQueueSort = "updated" | "created" | "sla" | "alpha";

export const TICKET_QUEUE_SORTS: readonly TicketQueueSort[] = [
  "updated",
  "created",
  "sla",
  "alpha",
] as const;

export const TICKET_QUEUE_DEFAULT_PAGE_SIZE = 20;
export const TICKET_QUEUE_MAX_PAGE_SIZE = 100;

/** An open thread idle for longer than this is reported as "просрочено". */
const STALE_HOURS = 24;
/** How far back the series and the SLA average look. */
const SERIES_DAYS = 30;

export interface TicketQueueRow {
  id: string;
  subject: string;
  status: "open" | "answered" | "closed";
  unreadForAdmin: number;
  lastMessageAt: string;
  createdAt: string;
  preview: string | null;
  lastAuthor: "user" | "support";
  messageCount: number;
  /** Hours since the last message — drives the "просрочено" marker. */
  waitingHours: number;
  /** First user message → first support message, in minutes. Null if unanswered. */
  firstResponseMinutes: number | null;
  requester: {
    userId: number;
    displayName: string | null;
    username: string | null;
    email: string | null;
    telegramId: string | null;
  };
}

export interface TicketQueueStats {
  total: number;
  open: number;
  answered: number;
  closed: number;
  unread: number;
  stale: number;
}

export interface TicketSeriesPoint {
  date: string;
  created: number;
  replies: number;
}

export interface TicketSla {
  /** Average minutes from the first user message to the first support reply. */
  avgFirstResponseMinutes: number | null;
  /** Median first response, in minutes (less skewed by one slow thread). */
  medianFirstResponseMinutes: number | null;
  /** Share of tickets that are answered or closed, in percent. */
  resolvedShare: number;
  /** Open tickets with no activity for more than 24h. */
  staleCount: number;
  /** Threads measured for the response average. */
  measured: number;
}

export interface TicketQueuePage {
  rows: TicketQueueRow[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  stats: TicketQueueStats;
  series: TicketSeriesPoint[];
  sla: TicketSla;
}

export interface TicketQueueParams {
  q?: string;
  filter?: TicketQueueFilter;
  sort?: TicketQueueSort;
  dir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function clampPageSize(value: number | undefined): number {
  const n = Math.trunc(value ?? TICKET_QUEUE_DEFAULT_PAGE_SIZE);
  if (!Number.isFinite(n) || n < 1) return TICKET_QUEUE_DEFAULT_PAGE_SIZE;
  return Math.min(n, TICKET_QUEUE_MAX_PAGE_SIZE);
}

function searchWhere(raw: string): Prisma.TicketWhereInput | null {
  const q = raw.trim();
  if (q.length === 0) return null;
  const handle = q.startsWith("@") ? q.slice(1) : q;
  const clauses: Prisma.TicketWhereInput[] = [
    { subject: { contains: q, mode: "insensitive" } },
    { messages: { some: { body: { contains: q, mode: "insensitive" } } } },
    { user: { email: { contains: q, mode: "insensitive" } } },
    { user: { username: { contains: handle, mode: "insensitive" } } },
    { user: { firstName: { contains: handle, mode: "insensitive" } } },
    { user: { lastName: { contains: handle, mode: "insensitive" } } },
  ];
  return { OR: clauses };
}

function filterWhere(filter: TicketQueueFilter): Prisma.TicketWhereInput {
  switch (filter) {
    case "unread":
      return { unreadForAdmin: { gt: 0 }, status: { not: "closed" } };
    case "open":
      return { status: "open" };
    case "answered":
      return { status: "answered" };
    case "closed":
      return { status: "closed" };
    case "all":
    default:
      return {};
  }
}

function orderBy(
  sort: TicketQueueSort,
  dir: "asc" | "desc",
): Prisma.TicketOrderByWithRelationInput[] {
  switch (sort) {
    case "created":
      return [{ createdAt: dir }, { id: dir }];
    case "alpha":
      // Subjects sort naturally A→Z, so a fresh click is ascending.
      return [{ subject: dir }, { id: dir }];
    case "updated":
      return [{ lastMessageAt: dir }, { id: dir }];
    case "sla":
    default:
      // "Ждут дольше всех" — open threads with the oldest activity first.
      return [{ lastMessageAt: dir }, { id: dir }];
  }
}

async function loadStats(now: Date): Promise<TicketQueueStats> {
  const staleBefore = new Date(now.getTime() - STALE_HOURS * 3_600_000);
  const [total, open, answered, closed, unread, stale] = await Promise.all([
    prisma.ticket.count(),
    prisma.ticket.count({ where: { status: "open" } }),
    prisma.ticket.count({ where: { status: "answered" } }),
    prisma.ticket.count({ where: { status: "closed" } }),
    prisma.ticket.count({ where: { unreadForAdmin: { gt: 0 }, status: { not: "closed" } } }),
    prisma.ticket.count({ where: { status: "open", lastMessageAt: { lt: staleBefore } } }),
  ]);
  return { total, open, answered, closed, unread, stale };
}

/**
 * Daily buckets for the last 30 days: how many tickets were opened and how many
 * support replies went out. Both are real `created_at` counts.
 */
async function loadSeries(now: Date): Promise<TicketSeriesPoint[]> {
  const today = startOfUtcDay(now);
  const from = new Date(today.getTime() - (SERIES_DAYS - 1) * 86_400_000);

  const [createdRows, replyRows] = await Promise.all([
    prisma.ticket.findMany({
      where: { createdAt: { gte: from } },
      select: { createdAt: true },
    }),
    prisma.ticketMessage.findMany({
      where: { createdAt: { gte: from }, author: "support" },
      select: { createdAt: true },
    }),
  ]);

  const created = new Map<string, number>();
  const replies = new Map<string, number>();
  for (let i = 0; i < SERIES_DAYS; i += 1) {
    const key = isoDay(new Date(from.getTime() + i * 86_400_000));
    created.set(key, 0);
    replies.set(key, 0);
  }
  for (const row of createdRows) {
    const key = isoDay(startOfUtcDay(row.createdAt));
    if (created.has(key)) created.set(key, (created.get(key) ?? 0) + 1);
  }
  for (const row of replyRows) {
    const key = isoDay(startOfUtcDay(row.createdAt));
    if (replies.has(key)) replies.set(key, (replies.get(key) ?? 0) + 1);
  }

  return [...created.keys()].sort().map((date) => ({
    date,
    created: created.get(date) ?? 0,
    replies: replies.get(date) ?? 0,
  }));
}

/**
 * First-response latency over the threads opened in the last 30 days that have
 * at least one support reply. Capped at 500 threads so the page stays cheap on a
 * large inbox; the sample size is reported so the UI can stay honest about it.
 */
async function loadSla(
  now: Date,
  stats: TicketQueueStats,
  total: number,
): Promise<TicketSla> {
  const from = new Date(now.getTime() - SERIES_DAYS * 86_400_000);
  const rows = await prisma.ticket.findMany({
    where: {
      createdAt: { gte: from },
      messages: { some: { author: "support" } },
    },
    orderBy: { createdAt: "desc" },
    take: 500,
    select: {
      messages: {
        orderBy: { createdAt: "asc" },
        select: { author: true, createdAt: true },
      },
    },
  });

  const latencies: number[] = [];
  for (const row of rows) {
    const firstUser = row.messages.find((m) => m.author === "user");
    const firstSupport = row.messages.find((m) => m.author === "support");
    if (!firstUser || !firstSupport) continue;
    const delta = firstSupport.createdAt.getTime() - firstUser.createdAt.getTime();
    if (delta >= 0) latencies.push(Math.round(delta / 60_000));
  }

  latencies.sort((a, b) => a - b);
  const avg =
    latencies.length === 0
      ? null
      : Math.round(latencies.reduce((acc, v) => acc + v, 0) / latencies.length);
  const median =
    latencies.length === 0
      ? null
      : latencies.length % 2 === 1
        ? (latencies[Math.floor(latencies.length / 2)] ?? null)
        : Math.round(
            ((latencies[latencies.length / 2 - 1] ?? 0) + (latencies[latencies.length / 2] ?? 0)) / 2,
          );

  const resolved = stats.answered + stats.closed;
  return {
    avgFirstResponseMinutes: avg,
    medianFirstResponseMinutes: median,
    resolvedShare: total === 0 ? 0 : Math.round((resolved / total) * 1000) / 10,
    staleCount: stats.stale,
    measured: latencies.length,
  };
}

/** Display name from our own PII-minimal fields; null when nothing is known. */
function displayNameOf(row: {
  firstName: string | null;
  lastName: string | null;
  username: string | null;
}): string | null {
  const full = [row.firstName, row.lastName]
    .map((part) => part?.trim() ?? "")
    .filter((part) => part.length > 0)
    .join(" ")
    .trim();
  if (full.length > 0) return full;
  return row.username && row.username.trim().length > 0 ? row.username : null;
}

export async function adminTicketsInbox(
  params: TicketQueueParams = {},
): Promise<TicketQueuePage> {
  const now = new Date();
  const pageSize = clampPageSize(params.pageSize);
  const filter: TicketQueueFilter = TICKET_QUEUE_FILTERS.includes(
    params.filter as TicketQueueFilter,
  )
    ? (params.filter as TicketQueueFilter)
    : "all";
  const sort: TicketQueueSort = TICKET_QUEUE_SORTS.includes(
    params.sort as TicketQueueSort,
  )
    ? (params.sort as TicketQueueSort)
    : "updated";
  const dir: "asc" | "desc" = params.dir === "asc" ? "asc" : "desc";

  const search = params.q?.trim() ? searchWhere(params.q) : null;
  const where: Prisma.TicketWhereInput = { ...filterWhere(filter), ...(search ?? {}) };

  const [stats, total, series] = await Promise.all([
    loadStats(now),
    prisma.ticket.count({ where }),
    loadSeries(now),
  ]);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(Math.trunc(params.page ?? 1) || 1, 1), pageCount);

  const tickets = await prisma.ticket.findMany({
    where,
    orderBy: orderBy(sort, dir),
    skip: (page - 1) * pageSize,
    take: pageSize,
    select: {
      id: true,
      subject: true,
      status: true,
      unreadForAdmin: true,
      lastMessageAt: true,
      createdAt: true,
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          username: true,
          email: true,
          telegramId: true,
        },
      },
      messages: {
        orderBy: { createdAt: "asc" },
        select: { author: true, body: true, createdAt: true },
      },
    },
  });

  const rows: TicketQueueRow[] = tickets.map((ticket) => {
    const messages = ticket.messages;
    const last = messages[messages.length - 1];
    const firstUser = messages.find((m) => m.author === "user");
    const firstSupport = messages.find((m) => m.author === "support");
    let firstResponseMinutes: number | null = null;
    if (firstUser && firstSupport) {
      const delta = firstSupport.createdAt.getTime() - firstUser.createdAt.getTime();
      if (delta >= 0) firstResponseMinutes = Math.round(delta / 60_000);
    }
    return {
      id: ticket.id,
      subject: ticket.subject,
      status: ticket.status,
      unreadForAdmin: ticket.unreadForAdmin,
      lastMessageAt: ticket.lastMessageAt.toISOString(),
      createdAt: ticket.createdAt.toISOString(),
      preview: last?.body ?? null,
      lastAuthor: last?.author ?? "user",
      messageCount: messages.length,
      waitingHours: Math.max(
        0,
        Math.round((now.getTime() - ticket.lastMessageAt.getTime()) / 3_600_000),
      ),
      firstResponseMinutes,
      requester: {
        userId: ticket.user.id,
        displayName: displayNameOf(ticket.user),
        username: ticket.user.username,
        email: ticket.user.email,
        telegramId:
          ticket.user.telegramId === null ? null : String(ticket.user.telegramId),
      },
    };
  });

  return {
    rows,
    total,
    page,
    pageSize,
    pageCount,
    stats,
    series,
    sla: await loadSla(now, stats, stats.total),
  };
}
