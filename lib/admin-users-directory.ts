// Admin users directory (ADM-02, /admin/users) — server-only read model.
//
// One paginated query over `users` plus batched relation aggregates, so the
// list page makes ONE round-trip per view instead of N per row. Every field is
// read from our own tables; nothing is synthesised:
//   * keysCount / ordersCount / paidTotal — keys_cache, orders (paid states)
//   * role — admin_users joined by telegram id
//   * segment — the nightly RFM snapshot
//   * series — real registration buckets for the activity chart
//
// The caller must have passed `requireRole` first (the route does that); this
// module performs no authorization of its own.
import type { Prisma } from "../generated/prisma/client";
import { toAdminRole, type AdminRole } from "./admin-auth";
import { prisma } from "./prisma";

/** Filters mirror the quick-filter chips; each maps to a real WHERE clause. */
export type DirectoryFilter =
  | "all"
  | "tg"
  | "email"
  | "new7"
  | "keys"
  | "staff"
  | "test";

export const DIRECTORY_FILTERS: readonly DirectoryFilter[] = [
  "all",
  "tg",
  "email",
  "new7",
  "keys",
  "staff",
  "test",
] as const;

/** Sort keys wired to real columns (never a client-side re-sort of one page). */
export type DirectorySort = "id" | "created" | "keys" | "orders" | "name";

export const DIRECTORY_SORTS: readonly DirectorySort[] = [
  "id",
  "created",
  "keys",
  "orders",
  "name",
] as const;

export const DIRECTORY_DEFAULT_PAGE_SIZE = 10;
export const DIRECTORY_MAX_PAGE_SIZE = 100;

/** Paid states that count as revenue (mirrors the order state machine). */
const PAID_ORDER_STATUSES = ["paid", "provisioning", "provisioned"] as const;

export interface DirectoryRow {
  id: number;
  /** Serialized: BigInt is not JSON-safe and the UI renders text. */
  telegramId: string | null;
  email: string | null;
  username: string | null;
  displayName: string | null;
  keysCount: number;
  ordersCount: number;
  role: AdminRole | null;
  segment: string | null;
  /** ISO — serialized for the client island. */
  createdAt: string;
  /** Lifetime paid revenue in RUB (0 when the account never paid). */
  paidTotal: number;
  lastOrderAt: string | null;
  emailVerified: boolean;
  bonusDays: number;
  /** Admin block timestamp ISO, null = active account. */
  blockedAt: string | null;
  /** Derived from the mailbox/handle, never a stored flag. */
  isTest: boolean;
}

export interface DirectoryStats {
  total: number;
  telegram: number;
  emailOnly: number;
  new7: number;
  keys: number;
  staff: number;
  test: number;
}

export interface DirectoryPoint {
  /** `YYYY-MM-DD` (UTC). */
  date: string;
  count: number;
}

export interface DirectoryPage {
  rows: DirectoryRow[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  stats: DirectoryStats;
  series: DirectoryPoint[];
  /** True when the requested page size was clamped. */
  truncated: boolean;
}

export type DirectoryDir = "asc" | "desc";

export const DIRECTORY_DIRS: readonly DirectoryDir[] = ["asc", "desc"] as const;

export interface DirectoryParams {
  q?: string;
  filter?: DirectoryFilter;
  sort?: DirectorySort;
  /** Sort direction. Counters read best newest/highest-first ("desc"). */
  dir?: DirectoryDir;
  page?: number;
  pageSize?: number;
  segment?: string;
  /** Chart window in days (default 60). */
  seriesDays?: number;
}

/**
 * Accounts created by the e2e/QA suites share recognisable mailbox or handle
 * fragments. This is a heuristic over real data — the UI labels the chip
 * "похожие на тестовые" rather than asserting a status we do not store.
 */
export function isTestAccount(
  email: string | null,
  username: string | null,
  firstName: string | null,
): boolean {
  const hay = `${email ?? ""} ${username ?? ""} ${firstName ?? ""}`.toLowerCase();
  return /e2e|platega|(^|[^a-z])test([^a-z]|$)/.test(hay);
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

function startOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function clampPageSize(value: number | undefined): number {
  if (!Number.isFinite(value ?? NaN)) return DIRECTORY_DEFAULT_PAGE_SIZE;
  const n = Math.trunc(value as number);
  if (n < 1) return DIRECTORY_DEFAULT_PAGE_SIZE;
  return Math.min(n, DIRECTORY_MAX_PAGE_SIZE);
}

/** Free-text search across identity fields, telegram id and cached key ids. */
function searchWhere(raw: string): Prisma.UserWhereInput | null {
  const q = raw.trim();
  if (q.length === 0) return null;
  const handle = q.startsWith("@") ? q.slice(1) : q;
  const clauses: Prisma.UserWhereInput[] = [
    { email: { contains: handle, mode: "insensitive" } },
    { username: { contains: handle, mode: "insensitive" } },
    { firstName: { contains: handle, mode: "insensitive" } },
    { lastName: { contains: handle, mode: "insensitive" } },
    { keys: { some: { keyId: { contains: handle } } } },
  ];
  if (/^\d+$/.test(handle) && handle.length <= 20) {
    try {
      clauses.push({ telegramId: BigInt(handle) });
    } catch {
      // Out-of-range digits are simply not a telegram id — text search stays.
    }
  }
  return { OR: clauses };
}

function filterWhere(
  filter: DirectoryFilter,
  now: Date,
  segment: string | undefined,
  staffIds: bigint[],
): Prisma.UserWhereInput {
  const base: Prisma.UserWhereInput = {};
  if (segment) base.rfm = { segment };

  switch (filter) {
    case "tg":
      return { ...base, telegramId: { not: null } };
    case "email":
      return { ...base, telegramId: null, email: { not: null } };
    case "new7":
      return {
        ...base,
        createdAt: { gte: new Date(now.getTime() - 7 * 86_400_000) },
      };
    case "keys":
      return { ...base, keys: { some: {} } };
    case "staff":
      // Staff rows are keyed by telegram id; a user without one cannot hold a
      // staff role (the admin panel is telegram-gated).
      return { ...base, telegramId: { in: staffIds } };
    case "test":
      return {
        ...base,
        OR: [
          { email: { contains: "e2e", mode: "insensitive" } },
          { email: { contains: "test", mode: "insensitive" } },
          { email: { contains: "platega", mode: "insensitive" } },
          { username: { contains: "test", mode: "insensitive" } },
          { username: { contains: "platega", mode: "insensitive" } },
          { firstName: { contains: "test", mode: "insensitive" } },
          { firstName: { contains: "platega", mode: "insensitive" } },
        ],
      };
    case "all":
    default:
      return base;
  }
}

function orderByFor(
  sort: DirectorySort,
  dir: DirectoryDir,
): Prisma.UserOrderByWithRelationInput[] {
  switch (sort) {
    case "created":
      return [{ createdAt: dir }, { id: dir }];
    case "keys":
      return [{ keys: { _count: dir } }, { id: dir }];
    case "orders":
      return [{ orders: { _count: dir } }, { id: dir }];
    case "name":
      return [{ firstName: dir }, { username: dir }, { id: dir }];
    case "id":
    default:
      return [{ id: dir }];
  }
}

/**
 * Resolve the telegram ids that hold a staff role. `staff` is a filter over
 * another table, so it is applied after the fact for the count and folded into
 * the page WHERE for the rows.
 */
async function staffTelegramIds(): Promise<bigint[]> {
  const rows = await prisma.adminUser.findMany({ select: { telegramId: true } });
  return rows.map((row) => row.telegramId);
}

async function loadStats(
  now: Date,
  staffIds: bigint[],
): Promise<DirectoryStats> {
  const [total, telegram, emailOnly, new7, keys, staff, test] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { telegramId: { not: null } } }),
    prisma.user.count({ where: { telegramId: null, email: { not: null } } }),
    prisma.user.count({
      where: { createdAt: { gte: new Date(now.getTime() - 7 * 86_400_000) } },
    }),
    prisma.keyCache.count(),
    staffIds.length,
    prisma.user.count({
      where: {
        OR: [
          { email: { contains: "e2e", mode: "insensitive" } },
          { email: { contains: "test", mode: "insensitive" } },
          { email: { contains: "platega", mode: "insensitive" } },
          { username: { contains: "test", mode: "insensitive" } },
          { username: { contains: "platega", mode: "insensitive" } },
          { firstName: { contains: "test", mode: "insensitive" } },
          { firstName: { contains: "platega", mode: "insensitive" } },
        ],
      },
    }),
  ]);
  return { total, telegram, emailOnly, new7, keys, staff, test };
}

/** Real registration buckets (UTC days) for the activity chart. */
export async function loadRegistrationSeries(days = 60): Promise<DirectoryPoint[]> {
  const window = Math.min(Math.max(Math.trunc(days), 7), 180);
  const today = startOfUtcDay(new Date());
  const from = new Date(today.getTime() - (window - 1) * 86_400_000);

  const rows = await prisma.user.findMany({
    where: { createdAt: { gte: from } },
    select: { createdAt: true },
  });

  const buckets = new Map<string, number>();
  for (let i = 0; i < window; i += 1) {
    buckets.set(isoDay(new Date(from.getTime() + i * 86_400_000)), 0);
  }
  for (const row of rows) {
    const key = isoDay(startOfUtcDay(row.createdAt));
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  return [...buckets.entries()].map(([date, count]) => ({ date, count }));
}

export async function adminUsersDirectory(
  params: DirectoryParams = {},
): Promise<DirectoryPage> {
  const now = new Date();
  const pageSize = clampPageSize(params.pageSize);
  const truncated = (params.pageSize ?? DIRECTORY_DEFAULT_PAGE_SIZE) > pageSize;
  const filter: DirectoryFilter = DIRECTORY_FILTERS.includes(
    params.filter as DirectoryFilter,
  )
    ? (params.filter as DirectoryFilter)
    : "all";
  const sort: DirectorySort = DIRECTORY_SORTS.includes(params.sort as DirectorySort)
    ? (params.sort as DirectorySort)
    : "id";
  const dir: DirectoryDir = DIRECTORY_DIRS.includes(params.dir as DirectoryDir)
    ? (params.dir as DirectoryDir)
    : "desc";

  const staffIds = await staffTelegramIds();

  // `staff` filters over another table, so its id set is resolved first and
  // folded into the same WHERE the count and the page query share.
  const baseWhere = filterWhere(filter, now, params.segment, staffIds);

  const search = searchWhere(params.q ?? "");
  const where: Prisma.UserWhereInput = search
    ? { AND: [baseWhere, search] }
    : baseWhere;

  const [stats, total, series] = await Promise.all([
    loadStats(now, staffIds),
    prisma.user.count({ where }),
    loadRegistrationSeries(params.seriesDays ?? 60),
  ]);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(Math.trunc(params.page ?? 1) || 1, 1), pageCount);

  const users = await prisma.user.findMany({
    where,
    orderBy: orderByFor(sort, dir),
    skip: (page - 1) * pageSize,
    take: pageSize,
    select: {
      id: true,
      telegramId: true,
      email: true,
      username: true,
      firstName: true,
      lastName: true,
      createdAt: true,
      emailVerifiedAt: true,
      bonusDays: true,
      blockedAt: true,
      rfm: { select: { segment: true } },
    },
  });

  const ids = users.map((user) => user.id);
  const telegramIds = users
    .map((user) => user.telegramId)
    .filter((id): id is bigint => id !== null);

  const [keyCounts, orderCounts, paidTotals, lastOrders, staffRows] =
    ids.length === 0
      ? [[], [], [], [], []]
      : await Promise.all([
          prisma.keyCache.groupBy({
            by: ["userId"],
            where: { userId: { in: ids } },
            _count: { _all: true },
          }),
          prisma.order.groupBy({
            by: ["userId"],
            where: { userId: { in: ids } },
            _count: { _all: true },
          }),
          prisma.order.groupBy({
            by: ["userId"],
            where: { userId: { in: ids }, status: { in: [...PAID_ORDER_STATUSES] } },
            _sum: { finalAmount: true },
          }),
          prisma.order.groupBy({
            by: ["userId"],
            where: { userId: { in: ids } },
            _max: { createdAt: true },
          }),
          telegramIds.length === 0
            ? Promise.resolve([])
            : prisma.adminUser.findMany({
                where: { telegramId: { in: telegramIds } },
                select: { telegramId: true, role: true },
              }),
        ]);

  const keyById = new Map(keyCounts.map((row) => [row.userId, row._count._all]));
  const orderById = new Map(orderCounts.map((row) => [row.userId, row._count._all]));
  const paidById = new Map(
    paidTotals.map((row) => [row.userId, Math.max(0, row._sum.finalAmount ?? 0)]),
  );
  const lastOrderById = new Map(
    lastOrders.map((row) => [row.userId, row._max.createdAt ?? null]),
  );
  const roleByTelegramId = new Map(
    (staffRows as { telegramId: bigint; role: string }[]).map((row) => [
      String(row.telegramId),
      toAdminRole(row.role),
    ]),
  );

  const rows: DirectoryRow[] = users.map((user) => ({
    id: user.id,
    telegramId: user.telegramId === null ? null : String(user.telegramId),
    email: user.email,
    username: user.username,
    displayName: displayNameOf(user),
    keysCount: keyById.get(user.id) ?? 0,
    ordersCount: orderById.get(user.id) ?? 0,
    role:
      user.telegramId === null
        ? null
        : (roleByTelegramId.get(String(user.telegramId)) ?? null),
    segment: user.rfm?.segment ?? null,
    createdAt: user.createdAt.toISOString(),
    paidTotal: paidById.get(user.id) ?? 0,
    lastOrderAt: lastOrderById.get(user.id)?.toISOString() ?? null,
    emailVerified: user.emailVerifiedAt !== null,
    bonusDays: Math.max(0, user.bonusDays ?? 0),
    blockedAt: user.blockedAt ? user.blockedAt.toISOString() : null,
    isTest: isTestAccount(user.email, user.username, user.firstName),
  }));

  return { rows, total, page, pageSize, pageCount, stats, series, truncated };
}
