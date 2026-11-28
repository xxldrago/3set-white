// /admin overview read model — one aggregated snapshot for the dashboard.
//
// Every number here is a real query over our own tables (users, keys_cache,
// orders, tickets, promo_codes, broadcasts, alert_events, outbox). The ARTEMIDA
// balance is the provider's prepaid account and is read through the shared
// short-TTL cache in `admin-stats`; a provider failure renders as `null`
// instead of taking the dashboard down.
//
// The caller must have passed `requireRole` first (the BFF does that); this
// module performs no authorization of its own.
import { loadArtemidaStats } from "./admin-stats";
import { env } from "./env";
import { prisma } from "./prisma";
import { funnelStats } from "./referral-stats";

/** Paid states that count as revenue (mirrors the order state machine). */
const PAID_STATUSES = ["paid", "provisioning", "provisioned"] as const;

export type OverviewPeriod = 7 | 30 | 90;

export interface OverviewPoint {
  /** `dd.mm` label for the chart axis. */
  label: string;
  /** `YYYY-MM-DD` (UTC). */
  date: string;
  revenue: number;
  orders: number;
}

export interface OverviewEvent {
  id: string;
  kind: "payment" | "signup" | "ticket" | "alert";
  title: string;
  detail: string;
  at: string;
}

export interface AdminOverview {
  period: OverviewPeriod;
  generatedAt: string;
  users: { total: number; newInPeriod: number; telegram: number; emailOnly: number };
  keys: { total: number; active: number; trial: number; devices: number; expiring7: number };
  orders: {
    paid: number;
    revenue: number;
    avgCheck: number;
    newCount: number;
    renewCount: number;
    upgradeCount: number;
    failed: number;
    refunded: number;
  };
  series: OverviewPoint[];
  expiryBuckets: { label: string; count: number }[];
  tickets: { open: number; answered: number; closed: number; unread: number; stale: number };
  alerts: { firing: number; latest: { type: string; message: string; severity: string; firedAt: string }[] };
  promos: { code: string; type: string; discount: number; usedCount: number; maxUses: number | null; expiresAt: string | null }[];
  referrers: { userId: number; name: string | null; email: string | null; referrals: number; revenue: number }[];
  funnel: { clicks: number; registrations: number; purchases: number; revenue: number; devices: number };
  wallet: { balance: number; currency: string; unlimited: boolean; degraded: boolean } | null;
  walletThreshold: number;
  outbox: { pending: number; failed: number };
  broadcasts: { body: string; status: string; total: number; sent: number; failed: number; createdAt: string }[];
  events: OverviewEvent[];
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function isoDay(date: Date): string {
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

function dayLabel(date: Date): string {
  return `${pad2(date.getUTCDate())}.${pad2(date.getUTCMonth() + 1)}`;
}

function displayName(row: {
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  email: string | null;
}): string | null {
  const full = [row.firstName, row.lastName]
    .map((part) => part?.trim() ?? "")
    .filter((part) => part.length > 0)
    .join(" ")
    .trim();
  if (full.length > 0) return full;
  if (row.username && row.username.trim().length > 0) return row.username;
  return row.email;
}

function clampPeriod(value: number): OverviewPeriod {
  return value === 7 || value === 90 ? value : 30;
}

const ALERT_LABELS: Record<string, string> = {
  payment_drop: "Падение оплат",
  failed_spike: "Всплеск ошибок",
  ticket_spike: "Всплеск обращений",
  runway_low: "Низкий баланс API",
};

/** Bucket a key's remaining lifetime into the donut slices. */
function expiryBucketLabel(daysLeft: number | null): string {
  if (daysLeft === null) return "Без срока";
  if (daysLeft <= 7) return "≤ 7 дней";
  if (daysLeft <= 30) return "8–30 дней";
  if (daysLeft <= 90) return "31–90 дней";
  if (daysLeft <= 180) return "91–180 дней";
  return "> 180 дней";
}

export async function loadAdminOverview(periodInput: number): Promise<AdminOverview> {
  const period = clampPeriod(periodInput);
  const now = new Date();
  const from = startOfUtcDay(new Date(now.getTime() - (period - 1) * 86_400_000));
  const staleBefore = new Date(now.getTime() - 24 * 3_600_000);
  const inSevenDays = new Date(now.getTime() + 7 * 86_400_000);

  const [
    usersTotal,
    usersNew,
    telegramUsers,
    keysTotal,
    keysActive,
    keysTrial,
    devicesAgg,
    expiring7,
    paidOrders,
    failedOrders,
    refundedOrders,
    promos,
    ticketsOpen,
    ticketsAnswered,
    ticketsClosed,
    ticketsUnread,
    ticketsStale,
    alertsFiring,
    alertRows,
    outboxGroups,
    broadcasts,
    funnel,
    artemida,
    recentOrders,
    recentUsers,
    recentTickets,
    activeKeyExpiries,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gte: from } } }),
    prisma.user.count({ where: { telegramId: { not: null } } }),
    prisma.keyCache.count(),
    prisma.keyCache.count({ where: { isTrial: false, expiresAt: { gt: now } } }),
    prisma.keyCache.count({ where: { isTrial: true } }),
    prisma.keyCache.aggregate({ _sum: { devices: true } }),
    prisma.keyCache.count({
      where: { isTrial: false, expiresAt: { gt: now, lte: inSevenDays } },
    }),
    prisma.order.findMany({
      where: { paidAt: { gte: from }, status: { in: [...PAID_STATUSES] } },
      select: { kind: true, finalAmount: true, balanceUsed: true, paidAt: true },
    }),
    prisma.order.count({ where: { status: "failed", createdAt: { gte: from } } }),
    prisma.order.count({ where: { status: "refunded", createdAt: { gte: from } } }),
    prisma.promoCode.findMany({
      orderBy: { usedCount: "desc" },
      take: 5,
      select: { code: true, type: true, discount: true, usedCount: true, maxUses: true, expiresAt: true },
    }),
    prisma.ticket.count({ where: { status: "open" } }),
    prisma.ticket.count({ where: { status: "answered" } }),
    prisma.ticket.count({ where: { status: "closed" } }),
    prisma.ticket.count({ where: { unreadForAdmin: { gt: 0 } } }),
    prisma.ticket.count({ where: { status: "open", lastMessageAt: { lt: staleBefore } } }),
    prisma.alertEvent.count({ where: { status: "firing" } }),
    prisma.alertEvent.findMany({
      orderBy: { firedAt: "desc" },
      take: 3,
      select: { type: true, message: true, severity: true, firedAt: true },
    }),
    prisma.outbox.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.broadcast.findMany({
      orderBy: { createdAt: "desc" },
      take: 3,
      select: { body: true, status: true, total: true, sent: true, failed: true, createdAt: true },
    }),
    funnelStats({}, from, now),
    loadArtemidaStats(),
    prisma.order.findMany({
      where: { status: { in: [...PAID_STATUSES] } },
      orderBy: { paidAt: "desc" },
      take: 5,
      select: {
        id: true,
        finalAmount: true,
        balanceUsed: true,
        paidAt: true,
        user: { select: { firstName: true, lastName: true, username: true, email: true } },
      },
    }),
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, firstName: true, lastName: true, username: true, email: true, createdAt: true },
    }),
    prisma.ticket.findMany({
      orderBy: { lastMessageAt: "desc" },
      take: 5,
      select: {
        id: true,
        subject: true,
        status: true,
        lastMessageAt: true,
        user: { select: { firstName: true, lastName: true, username: true, email: true } },
      },
    }),
    prisma.keyCache.findMany({
      where: { isTrial: false, expiresAt: { gt: now } },
      select: { expiresAt: true },
    }),
  ]);

  const revenue = paidOrders.reduce(
    (sum, order) => sum + Math.max(0, order.finalAmount - order.balanceUsed),
    0,
  );
  const byKind = { new: 0, renew: 0, upgrade: 0 };
  for (const order of paidOrders) byKind[order.kind] += 1;

  // Daily buckets — the window always renders `period` points, zeros included.
  const buckets = new Map<string, OverviewPoint>();
  for (let index = 0; index < period; index += 1) {
    const day = new Date(from.getTime() + index * 86_400_000);
    buckets.set(isoDay(day), { label: dayLabel(day), date: isoDay(day), revenue: 0, orders: 0 });
  }
  for (const order of paidOrders) {
    if (!order.paidAt) continue;
    const point = buckets.get(isoDay(order.paidAt));
    if (!point) continue;
    point.revenue += Math.max(0, order.finalAmount - order.balanceUsed);
    point.orders += 1;
  }

  const expiryCounts = new Map<string, number>();
  for (const key of activeKeyExpiries) {
    const daysLeft =
      key.expiresAt === null
        ? null
        : Math.ceil((key.expiresAt.getTime() - now.getTime()) / 86_400_000);
    const label = expiryBucketLabel(daysLeft);
    expiryCounts.set(label, (expiryCounts.get(label) ?? 0) + 1);
  }
  const EXPIRY_ORDER = ["≤ 7 дней", "8–30 дней", "31–90 дней", "91–180 дней", "> 180 дней"];
  const expiryBuckets = EXPIRY_ORDER.filter((label) => (expiryCounts.get(label) ?? 0) > 0).map(
    (label) => ({ label, count: expiryCounts.get(label) ?? 0 }),
  );

  // Top referrers: count referred accounts, then their captured cash.
  const referrerGroups = await prisma.user.groupBy({
    by: ["referredById"],
    where: { referredById: { not: null } },
    _count: { _all: true },
  });
  const topReferrerIds = referrerGroups
    .map((row) => ({ referredById: row.referredById, count: row._count._all }))
    .filter(
      (row): row is { referredById: number; count: number } => row.referredById !== null,
    )
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  let referrers: AdminOverview["referrers"] = [];
  if (topReferrerIds.length > 0) {
    const ids = topReferrerIds.map((row) => row.referredById);
    const [referrerUsers, referredRows] = await Promise.all([
      prisma.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, firstName: true, lastName: true, username: true, email: true },
      }),
      prisma.user.findMany({
        where: { referredById: { in: ids } },
        select: { id: true, referredById: true },
      }),
    ]);
    const referredOwner = new Map(referredRows.map((row) => [row.id, row.referredById]));
    const referredOrders =
      referredRows.length === 0
        ? []
        : await prisma.order.findMany({
            where: {
              userId: { in: referredRows.map((row) => row.id) },
              status: { in: [...PAID_STATUSES] },
            },
            select: { userId: true, finalAmount: true, balanceUsed: true },
          });
    const cashByReferrer = new Map<number, number>();
    for (const order of referredOrders) {
      const owner = referredOwner.get(order.userId);
      if (owner == null) continue;
      cashByReferrer.set(
        owner,
        (cashByReferrer.get(owner) ?? 0) + Math.max(0, order.finalAmount - order.balanceUsed),
      );
    }
    const byId = new Map(referrerUsers.map((row) => [row.id, row]));
    referrers = topReferrerIds.map((row) => {
      const user = byId.get(row.referredById);
      return {
        userId: row.referredById,
        name: user ? displayName(user) : null,
        email: user?.email ?? null,
        referrals: row.count,
        revenue: cashByReferrer.get(row.referredById) ?? 0,
      };
    });
  }

  const outbox = { pending: 0, failed: 0 };
  for (const group of outboxGroups) {
    const count = group._count._all;
    if (group.status === "pending" || group.status === "processing") outbox.pending += count;
    if (group.status === "failed") outbox.failed += count;
  }

  // Unified activity feed: payments, signups and tickets, newest first.
  const events: OverviewEvent[] = [
    ...recentOrders.map((order) => ({
      id: `order-${order.id}`,
      kind: "payment" as const,
      title: `Оплата ${Math.max(0, order.finalAmount - order.balanceUsed)} ₽`,
      detail: order.user ? displayName(order.user) ?? "Клиент" : "Клиент",
      at: (order.paidAt ?? now).toISOString(),
    })),
    ...recentUsers.map((user) => ({
      id: `user-${user.id}`,
      kind: "signup" as const,
      title: "Новая регистрация",
      detail: displayName(user) ?? `#${user.id}`,
      at: user.createdAt.toISOString(),
    })),
    ...recentTickets.map((ticket) => ({
      id: `ticket-${ticket.id}`,
      kind: "ticket" as const,
      title: `Обращение: ${ticket.subject}`,
      detail: ticket.user ? displayName(ticket.user) ?? "Клиент" : "Клиент",
      at: ticket.lastMessageAt.toISOString(),
    })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 10);

  return {
    period,
    generatedAt: now.toISOString(),
    users: {
      total: usersTotal,
      newInPeriod: usersNew,
      telegram: telegramUsers,
      emailOnly: usersTotal - telegramUsers,
    },
    keys: {
      total: keysTotal,
      active: keysActive,
      trial: keysTrial,
      devices: devicesAgg._sum.devices ?? 0,
      expiring7,
    },
    orders: {
      paid: paidOrders.length,
      revenue,
      avgCheck: paidOrders.length > 0 ? Math.round(revenue / paidOrders.length) : 0,
      newCount: byKind.new,
      renewCount: byKind.renew,
      upgradeCount: byKind.upgrade,
      failed: failedOrders,
      refunded: refundedOrders,
    },
    series: Array.from(buckets.values()),
    expiryBuckets,
    tickets: {
      open: ticketsOpen,
      answered: ticketsAnswered,
      closed: ticketsClosed,
      unread: ticketsUnread,
      stale: ticketsStale,
    },
    alerts: {
      firing: alertsFiring,
      latest: alertRows.map((row) => ({
        type: row.type,
        message: ALERT_LABELS[row.type] ?? row.message,
        severity: row.severity,
        firedAt: row.firedAt.toISOString(),
      })),
    },
    promos: promos.map((promo) => ({
      code: promo.code,
      type: promo.type,
      discount: promo.discount,
      usedCount: promo.usedCount,
      maxUses: promo.maxUses,
      expiresAt: promo.expiresAt ? promo.expiresAt.toISOString() : null,
    })),
    referrers,
    funnel,
    wallet: artemida.balance
      ? {
          balance: artemida.balance.balance,
          currency: artemida.balance.currency,
          unlimited: artemida.balance.unlimited,
          degraded: artemida.degraded,
        }
      : null,
    walletThreshold: env.ARTEMIDA_LOW_BALANCE_RUB,
    outbox,
    broadcasts: broadcasts.map((row) => ({
      body: row.body,
      status: row.status,
      total: row.total,
      sent: row.sent,
      failed: row.failed,
      createdAt: row.createdAt.toISOString(),
    })),
    events,
  };
}
