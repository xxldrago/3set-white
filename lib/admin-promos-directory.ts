// Admin promos (/admin/promos) — server-only read model.
//
// One round-trip per view for the registry + the aggregate panels, so the page
// makes a single request for KPIs / charts / list instead of N+1 queries. Every
// field is read from our own tables; nothing is synthesised:
//   * code / discount / type / maxUses / usedCount / expiresAt / ownerUserId —
//     `promo_codes`
//   * redemptions, revenue and discount given — `orders` rows that carry a
//     `promoCode` snapshot (the code string is copied onto the order at
//     checkout, so history survives code deletion)
//   * owner display names — `users`
//
// There is no `active` column and no edit endpoint, so a code's status is
// DERIVED exactly the way checkout derives it (lib/promo.ts validatePromo):
// exhausted is checked before expired, so an admin sees the same reason the
// buyer would hit. Nothing is stored that we do not have.
//
// The caller must have passed `requireRole` first (the BFF does that); this
// module performs no authorization of its own.
import { prisma } from "./prisma";

/** Mirrors the order state machine: these count as realised revenue. */
const PAID_ORDER_STATUSES = ["paid", "provisioning", "provisioned"] as const;

/** How far back the daily chart looks. */
const SERIES_DAYS = 30;

/** Rows in the redemption journal. */
const JOURNAL_LIMIT = 20;

/**
 * Hard ceiling on codes scanned. The status filter is derived (no column), so
 * filtering happens in memory; a cap keeps one bad dataset from loading the
 * whole table into a request.
 */
const MAX_CODES = 5_000;

export type PromoStatus = "active" | "soon" | "expired" | "exhausted";

export const PROMO_STATUSES: readonly PromoStatus[] = [
  "active",
  "soon",
  "expired",
  "exhausted",
] as const;

/** Chips the registry offers. `personal` is the owner filter, not a status. */
export type PromoFilter = "all" | PromoStatus | "personal";

export const PROMO_FILTERS: readonly PromoFilter[] = [
  "all",
  "active",
  "soon",
  "expired",
  "exhausted",
  "personal",
] as const;

export type PromoSort = "created" | "code" | "used" | "expires" | "revenue" | "clicks";

export const PROMO_SORTS: readonly PromoSort[] = [
  "created",
  "code",
  "used",
  "expires",
  "revenue",
  "clicks",
] as const;

export const PROMO_DEFAULT_PAGE_SIZE = 10;
export const PROMO_MAX_PAGE_SIZE = 100;

/** Days before expiry at which a code is flagged as "soon". */
const SOON_DAYS = 7;

export interface PromoRow {
  id: string;
  code: string;
  /** "percentage" | "fixed" — the raw `type` column. */
  type: string;
  /** Percent for `percentage`, whole RUB for `fixed`. */
  discount: number;
  maxUses: number | null;
  usedCount: number;
  /** ISO, null = never expires. */
  expiresAt: string | null;
  createdAt: string;
  ownerUserId: number | null;
  ownerName: string | null;
  /** Derived with the same precedence checkout uses. */
  status: PromoStatus;
  /** Uses left, or null when the code is unlimited. */
  remaining: number | null;
  /** `usedCount / maxUses` as 0-100, or null when unlimited. */
  usagePct: number | null;
  /** Orders carrying this code, all statuses. */
  redemptions: number;
  /** Orders in a paid state. */
  paidOrders: number;
  /** Captured cash: `sum(finalAmount - balanceUsed)` over paid orders. */
  revenue: number;
  /** Sum of `amount - finalAmount` over paid orders, whole RUB. */
  discountGiven: number;
  /**
   * Link clicks recorded by the public beacon (`referral_clicks`, kind=promo).
   * Only codes that are actually shared as links have any; the beacon dedupes
   * per IP per hour, so this is a lower bound, never an inflated estimate.
   */
  clicks: number;
}

export interface PromoSeriesPoint {
  /** `YYYY-MM-DD` in the server timezone. */
  day: string;
  redemptions: number;
  discount: number;
}

export interface PromoTopRow {
  code: string;
  redemptions: number;
}

export interface PromoJournalRow {
  orderId: string;
  code: string;
  createdAt: string;
  paidAt: string | null;
  status: string;
  /** Quoted price before the code, whole RUB. */
  amount: number;
  finalAmount: number;
  discount: number;
  userLabel: string;
  userId: number;
}

export interface PromoStats {
  /** Codes scanned (all of them, before filtering). */
  codes: number;
  active: number;
  soon: number;
  expired: number;
  exhausted: number;
  personal: number;
  /** Sum of `usedCount` across every code — the real limit counter. */
  redemptions: number;
  /**
   * Sum of uses left across LIMITED codes only, or null when every code is
   * unlimited. Together with `redemptions` this gives the real fill ratio.
   */
  remaining: number | null;
  /** Paid orders that used a code. */
  paidOrders: number;
  /** Captured cash across paid promo orders, whole RUB (see lib/revenue.ts). */
  revenue: number;
  /** Sum of `amount - finalAmount` over paid promo orders, whole RUB. */
  discountGiven: number;
  /** `discountGiven / (revenue + discountGiven)` as a percentage, or null. */
  discountShare: number | null;
  /** Mean discount of PERCENTAGE codes only (a RUB code has no percent). */
  avgPercent: number | null;
  /** Beacon clicks recorded for promo codes. */
  clicks: number;
  /** True when the table held more than MAX_CODES rows and was capped. */
  truncated: boolean;
}

export interface PromoDirectory {
  rows: PromoRow[];
  stats: PromoStats;
  series: PromoSeriesPoint[];
  top: PromoTopRow[];
  journal: PromoJournalRow[];
  /** Rows matching the current filter + search, before pagination. */
  total: number;
  page: number;
  pageSize: number;
  filter: PromoFilter;
  sort: PromoSort;
  q: string;
}

export interface PromoQuery {
  q?: string;
  filter?: PromoFilter;
  sort?: PromoSort;
  page?: number;
  pageSize?: number;
}

function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function displayNameOf(user: {
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  email: string | null;
  telegramId: bigint | null;
}): string {
  const full = [user.firstName, user.lastName]
    .map((part) => part?.trim() ?? "")
    .filter((part) => part.length > 0)
    .join(" ")
    .trim();
  if (full.length > 0) return full;
  if (user.username && user.username.trim().length > 0) return `@${user.username}`;
  if (user.email) return user.email;
  if (user.telegramId !== null) return `TG ${user.telegramId.toString()}`;
  return 'Без имени';
}

/**
 * Status derivation, mirroring `validatePromo` in lib/promo.ts: the usage
 * ceiling is checked BEFORE expiry, so the badge names the reason checkout
 * would actually reject with.
 */
export function promoStatusOf(
  row: { maxUses: number | null; usedCount: number; expiresAt: Date | null },
  now: number,
): PromoStatus {
  if (row.maxUses !== null && row.usedCount >= row.maxUses) return "exhausted";
  if (row.expiresAt !== null && row.expiresAt.getTime() <= now) return "expired";
  if (row.expiresAt !== null && row.expiresAt.getTime() - now <= SOON_DAYS * 86_400_000) {
    return "soon";
  }
  return "active";
}

export async function adminPromosDirectory(
  query: PromoQuery = {},
): Promise<PromoDirectory> {
  const q = (query.q ?? "").trim().slice(0, 200);
  const filter: PromoFilter = (PROMO_FILTERS as readonly string[]).includes(
    query.filter ?? "",
  )
    ? (query.filter as PromoFilter)
    : "all";
  const sort: PromoSort = (PROMO_SORTS as readonly string[]).includes(query.sort ?? "")
    ? (query.sort as PromoSort)
    : "created";
  const page = Number.isInteger(query.page) && (query.page ?? 0) > 0 ? (query.page as number) : 1;
  const pageSize = Math.min(
    Math.max(1, query.pageSize ?? PROMO_DEFAULT_PAGE_SIZE),
    PROMO_MAX_PAGE_SIZE,
  );

  const seriesCutoff = new Date();
  seriesCutoff.setHours(0, 0, 0, 0);
  seriesCutoff.setDate(seriesCutoff.getDate() - (SERIES_DAYS - 1));

  const [codes, codeCount, allAgg, paidAgg, seriesRows, journalRows, clickAgg] = await Promise.all([
    prisma.promoCode.findMany({ orderBy: { createdAt: "desc" }, take: MAX_CODES }),
    prisma.promoCode.count(),
    prisma.order.groupBy({
      by: ["promoCode"],
      where: { promoCode: { not: null } },
      _count: { _all: true },
    }),
    prisma.order.groupBy({
      by: ["promoCode"],
      where: { promoCode: { not: null }, status: { in: [...PAID_ORDER_STATUSES] } },
      _count: { _all: true },
      _sum: { amount: true, finalAmount: true, balanceUsed: true },
    }),
    prisma.order.findMany({
      where: { promoCode: { not: null }, createdAt: { gte: seriesCutoff } },
      select: { promoCode: true, createdAt: true, amount: true, finalAmount: true, status: true },
    }),
    prisma.order.findMany({
      where: { promoCode: { not: null } },
      orderBy: { createdAt: "desc" },
      take: JOURNAL_LIMIT,
      select: {
        id: true,
        promoCode: true,
        createdAt: true,
        paidAt: true,
        status: true,
        amount: true,
        finalAmount: true,
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
      },
    }),
    // Beacon clicks are keyed by the code string, not the row id, so deleted
    // codes keep their history (same reason the order snapshot does).
    prisma.referralClick.groupBy({
      by: ["code"],
      where: { kind: "promo", code: { not: null } },
      _count: { _all: true },
    }),
  ]);

  // --- per-code order aggregates -------------------------------------------
  const allCount = new Map<string, number>();
  for (const row of allAgg) {
    if (row.promoCode) allCount.set(row.promoCode, row._count._all);
  }
  const paidMap = new Map<string, { count: number; amount: number; final: number; cash: number }>();
  for (const row of paidAgg) {
    if (!row.promoCode) continue;
    const final = row._sum.finalAmount ?? 0;
    paidMap.set(row.promoCode, {
      count: row._count._all,
      amount: row._sum.amount ?? 0,
      final,
      // Same cash definition as lib/revenue.ts: balance-covered rubles never
      // reached the provider, so they are not revenue.
      cash: Math.max(0, final - (row._sum.balanceUsed ?? 0)),
    });
  }

  const clickMap = new Map<string, number>();
  for (const row of clickAgg) {
    if (row.code) clickMap.set(row.code, row._count._all);
  }

  // --- owner names ---------------------------------------------------------
  const ownerIds = [...new Set(codes.map((c) => c.ownerUserId).filter((v): v is number => v !== null))];
  const owners =
    ownerIds.length === 0
      ? []
      : await prisma.user.findMany({
          where: { id: { in: ownerIds } },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            username: true,
            email: true,
            telegramId: true,
          },
        });
  const ownerName = new Map(owners.map((u) => [u.id, displayNameOf(u)]));

  // --- rows ---------------------------------------------------------------
  const now = Date.now();
  const allRows: PromoRow[] = codes.map((code) => {
    const status = promoStatusOf(code, now);
    const paid = paidMap.get(code.code);
    return {
      id: code.id,
      code: code.code,
      type: code.type,
      discount: code.discount,
      maxUses: code.maxUses,
      usedCount: code.usedCount,
      expiresAt: code.expiresAt ? code.expiresAt.toISOString() : null,
      createdAt: code.createdAt.toISOString(),
      ownerUserId: code.ownerUserId,
      ownerName: code.ownerUserId === null ? null : (ownerName.get(code.ownerUserId) ?? null),
      status,
      remaining: code.maxUses === null ? null : Math.max(0, code.maxUses - code.usedCount),
      usagePct:
        code.maxUses === null || code.maxUses <= 0
          ? null
          : Math.min(100, Math.round((code.usedCount / code.maxUses) * 100)),
      redemptions: allCount.get(code.code) ?? 0,
      paidOrders: paid?.count ?? 0,
      revenue: paid?.cash ?? 0,
      discountGiven: paid ? Math.max(0, paid.amount - paid.final) : 0,
      clicks: clickMap.get(code.code) ?? 0,
    };
  });

  // --- filter + search + sort (in memory: status is derived, not a column) --
  const needle = q.toLowerCase();
  const filtered = allRows.filter((row) => {
    if (filter === "personal" && row.ownerUserId === null) return false;
    if (filter !== "all" && filter !== "personal" && row.status !== filter) return false;
    if (!needle) return true;
    return `${row.code} ${row.ownerName ?? ""}`.toLowerCase().includes(needle);
  });

  filtered.sort((a, b) => {
    if (sort === "code") return a.code < b.code ? -1 : a.code > b.code ? 1 : 0;
    if (sort === "used") return b.usedCount - a.usedCount;
    if (sort === "revenue") return b.revenue - a.revenue;
    if (sort === "clicks") return b.clicks - a.clicks;
    if (sort === "expires") {
      // Never-expiring codes sort last: they are not "soon".
      const va = a.expiresAt ? Date.parse(a.expiresAt) : Number.POSITIVE_INFINITY;
      const vb = b.expiresAt ? Date.parse(b.expiresAt) : Number.POSITIVE_INFINITY;
      return va - vb;
    }
    return Date.parse(b.createdAt) - Date.parse(a.createdAt);
  });

  const total = filtered.length;
  const start = (page - 1) * pageSize;
  const rows = filtered.slice(start, start + pageSize);

  // --- series --------------------------------------------------------------
  const buckets = new Map<string, PromoSeriesPoint>();
  for (let i = 0; i < SERIES_DAYS; i += 1) {
    const d = new Date(seriesCutoff);
    d.setDate(seriesCutoff.getDate() + i);
    const key = dayKey(d);
    buckets.set(key, { day: key, redemptions: 0, discount: 0 });
  }
  const paidSet = new Set<string>(PAID_ORDER_STATUSES);
  for (const row of seriesRows) {
    const point = buckets.get(dayKey(row.createdAt));
    if (!point) continue;
    point.redemptions += 1;
    if (paidSet.has(row.status)) {
      point.discount += Math.max(0, row.amount - row.finalAmount);
    }
  }

  // --- top codes -----------------------------------------------------------
  const top: PromoTopRow[] = paidAgg
    .filter((row) => row.promoCode !== null && row._count._all > 0)
    .map((row) => ({ code: row.promoCode as string, redemptions: row._count._all }))
    .sort((a, b) => b.redemptions - a.redemptions || (a.code < b.code ? -1 : 1))
    .slice(0, 5);

  // --- journal -------------------------------------------------------------
  const journal: PromoJournalRow[] = journalRows.map((row) => ({
    orderId: row.id,
    code: row.promoCode as string,
    createdAt: row.createdAt.toISOString(),
    paidAt: row.paidAt ? row.paidAt.toISOString() : null,
    status: row.status,
    amount: row.amount,
    finalAmount: row.finalAmount,
    discount: Math.max(0, row.amount - row.finalAmount),
    userLabel: displayNameOf(row.user),
    userId: row.user.id,
  }));

  // --- stats ---------------------------------------------------------------
  let revenue = 0;
  let discountGiven = 0;
  let paidOrders = 0;
  for (const row of paidAgg) {
    const final = row._sum.finalAmount ?? 0;
    revenue += Math.max(0, final - (row._sum.balanceUsed ?? 0));
    discountGiven += Math.max(0, (row._sum.amount ?? 0) - final);
    paidOrders += row._count._all;
  }
  const percentCodes = allRows.filter((row) => row.type === "percentage");
  const grossBeforeDiscount = revenue + discountGiven;
  const limited = allRows.filter((row) => row.maxUses !== null);

  const stats: PromoStats = {
    codes: allRows.length,
    active: allRows.filter((row) => row.status === "active").length,
    soon: allRows.filter((row) => row.status === "soon").length,
    expired: allRows.filter((row) => row.status === "expired").length,
    exhausted: allRows.filter((row) => row.status === "exhausted").length,
    personal: allRows.filter((row) => row.ownerUserId !== null).length,
    redemptions: allRows.reduce((sum, row) => sum + row.usedCount, 0),
    remaining:
      limited.length === 0
        ? null
        : limited.reduce((sum, row) => sum + Math.max(0, (row.maxUses ?? 0) - row.usedCount), 0),
    paidOrders,
    revenue,
    discountGiven,
    discountShare:
      grossBeforeDiscount > 0 ? Math.round((discountGiven / grossBeforeDiscount) * 100) : null,
    avgPercent:
      percentCodes.length > 0
        ? Math.round(
            (percentCodes.reduce((sum, row) => sum + row.discount, 0) / percentCodes.length) * 10,
          ) / 10
        : null,
    clicks: allRows.reduce((sum, row) => sum + row.clicks, 0),
    truncated: codeCount > codes.length,
  };

  return {
    rows,
    stats,
    series: [...buckets.values()],
    top,
    journal,
    total,
    page,
    pageSize,
    filter,
    sort,
    q,
  };
}
