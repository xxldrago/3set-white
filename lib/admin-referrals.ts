// /admin/referrals read model — one snapshot for the template-styled page.
//
// Reuses the program's own modules for settings, withdrawals and the funnel
// (lib/referrals.ts, lib/referral-stats.ts) and adds what the template needs:
// a per-partner table (clicks / registrations / purchases / turnover /
// accrued / wallet balance / effective rate), the wallet journal and the
// weekly money accruals. Every number comes from real rows — no fixtures.
//
// The funnel series is NOT loaded here: the client fetches
// /api/admin/referrals/stats per period/granularity (30 buckets × 3 queries
// is a client-side concern, same as the existing FunnelCharts island).
import { prisma } from "./prisma";
import { getReferralSettings, type ReferralSettings } from "./referrals";
import { funnelStats, type FunnelStats } from "./referral-stats";
import { mskDayLabel } from "./analytics/time";

const PAID = ["paid", "provisioning", "provisioned"] as const;
const DAY_MS = 86_400_000;

export type WithdrawalStatus = "pending" | "approved" | "rejected";

export interface AdminReferralPartner {
  id: number;
  name: string;
  contact: string;
  code: string | null;
  clicks: number;
  regs: number;
  purchases: number;
  revenue: number;
  accrued: number;
  balance: number;
  customReward: number | null;
  customKind: string | null;
  payoutContact: string | null;
}

export interface AdminReferralWithdrawal {
  id: string;
  userId: number;
  userName: string;
  contact: string | null;
  amount: number;
  status: string;
  createdAt: string;
}

export interface AdminReferralAccrual {
  id: string;
  createdAt: string;
  userName: string;
  reason: string;
  amount: number;
}

export interface AdminReferrals {
  settings: ReferralSettings;
  generatedAt: string;
  stats: FunnelStats;
  partners: AdminReferralPartner[];
  withdrawals: AdminReferralWithdrawal[];
  withdrawalTotals: Record<"pending" | "approved" | "rejected", { count: number; sum: number }>;
  accruals: AdminReferralAccrual[];
  weekly: { week: string; money: number }[];
  sources: { referral: number; promo: number; organic: number };
  totals: {
    accrued: number;
    balances: number;
    daysOnBalances: number;
  };
}

function nameOf(user: {
  firstName: string | null;
  username: string | null;
  email: string | null;
  telegramId: bigint | null;
}): string {
  return user.firstName || user.username || user.email || (user.telegramId ? `tg:${user.telegramId}` : "Без имени");
}

function contactOf(user: {
  username: string | null;
  email: string | null;
  telegramId: bigint | null;
}): string {
  if (user.username) return `@${user.username}`;
  if (user.email) return user.email;
  if (user.telegramId) return `tg:${user.telegramId}`;
  return "—";
}

/** Monday 00:00 (MSK label) of the week containing `at`. */
function weekStartLabel(at: Date): string {
  const label = mskDayLabel(at);
  const day = new Date(`${label}T00:00:00.000Z`).getUTCDay(); // 0 = Sunday
  const offset = (day + 6) % 7;
  return mskDayLabel(new Date(at.getTime() - offset * DAY_MS));
}

export async function loadAdminReferrals(): Promise<AdminReferrals> {
  const now = new Date();
  const statsFrom = new Date(now.getTime() - 29 * DAY_MS);

  const [
    settings,
    stats,
    withdrawalRows,
    withdrawalGroups,
    clickGroups,
    regGroups,
    bonusGroups,
    balanceGroups,
    referredOrders,
    accrualRows,
    dayRows,
    recentUsers,
    daysAgg,
  ] = await Promise.all([
    getReferralSettings(),
    funnelStats({}, statsFrom, now),
    prisma.withdrawal.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        userId: true,
        amount: true,
        status: true,
        contact: true,
        createdAt: true,
        user: {
          select: { firstName: true, username: true, email: true, telegramId: true },
        },
      },
    }),
    prisma.withdrawal.groupBy({
      by: ["status"],
      _count: { _all: true },
      _sum: { amount: true },
    }),
    prisma.referralClick.groupBy({
      by: ["ownerUserId"],
      where: { ownerUserId: { not: null } },
      _count: { _all: true },
    }),
    prisma.user.groupBy({
      by: ["referredById"],
      where: { referredById: { not: null } },
      _count: { _all: true },
    }),
    prisma.walletTx.groupBy({
      by: ["userId"],
      where: { reason: "referral_bonus" },
      _sum: { amount: true },
    }),
    prisma.walletTx.groupBy({
      by: ["userId"],
      _sum: { amount: true },
    }),
    prisma.order.findMany({
      where: { status: { in: [...PAID] }, user: { referredById: { not: null } } },
      select: {
        finalAmount: true,
        balanceUsed: true,
        user: { select: { referredById: true } },
      },
    }),
    prisma.walletTx.findMany({
      where: {
        reason: { in: ["referral_bonus", "referral_days", "withdrawal_hold", "withdrawal_refund"] },
      },
      orderBy: { createdAt: "desc" },
      take: 14,
      select: {
        id: true,
        userId: true,
        amount: true,
        reason: true,
        createdAt: true,
        user: { select: { firstName: true, username: true, email: true, telegramId: true } },
      },
    }),
    prisma.walletTx.findMany({
      where: { reason: "referral_bonus", createdAt: { gte: new Date(now.getTime() - 56 * DAY_MS) } },
      select: { amount: true, createdAt: true },
    }),
    prisma.user.findMany({
      where: { createdAt: { gte: new Date(now.getTime() - 30 * DAY_MS) } },
      select: { referredById: true, pendingPromo: true },
    }),
    prisma.user.aggregate({ _sum: { bonusDays: true } }),
  ]);

  // ---------------------------------------------------------------- owners --
  const ownerIds = new Set<number>();
  for (const row of clickGroups) if (row.ownerUserId != null) ownerIds.add(row.ownerUserId);
  for (const row of regGroups) if (row.referredById != null) ownerIds.add(row.referredById);
  for (const row of bonusGroups) ownerIds.add(row.userId);

  const owners = ownerIds.size
    ? await prisma.user.findMany({
        where: { id: { in: [...ownerIds] } },
        select: {
          id: true,
          firstName: true,
          username: true,
          email: true,
          telegramId: true,
          referralCode: true,
          customInviterReward: true,
          customInviterKind: true,
        },
      })
    : [];

  const clicksById = new Map<number, number>();
  for (const row of clickGroups) {
    if (row.ownerUserId != null) clicksById.set(row.ownerUserId, row._count._all);
  }
  const regsById = new Map<number, number>();
  for (const row of regGroups) {
    if (row.referredById != null) regsById.set(row.referredById, row._count._all);
  }
  const accruedById = new Map<number, number>();
  for (const row of bonusGroups) accruedById.set(row.userId, row._sum.amount ?? 0);
  const balanceById = new Map<number, number>();
  for (const row of balanceGroups) balanceById.set(row.userId, row._sum.amount ?? 0);

  const purchasesById = new Map<number, number>();
  const revenueById = new Map<number, number>();
  for (const order of referredOrders) {
    const ownerId = order.user?.referredById ?? null;
    if (ownerId == null) continue;
    purchasesById.set(ownerId, (purchasesById.get(ownerId) ?? 0) + 1);
    revenueById.set(ownerId, (revenueById.get(ownerId) ?? 0) + Math.max(0, order.finalAmount - order.balanceUsed));
  }

  const payoutById = new Map<number, string>();
  for (const row of withdrawalRows) {
    if (row.contact && !payoutById.has(row.userId)) payoutById.set(row.userId, row.contact);
  }

  const partners: AdminReferralPartner[] = owners
    .map((owner) => ({
      id: owner.id,
      name: nameOf(owner),
      contact: contactOf(owner),
      code: owner.referralCode,
      clicks: clicksById.get(owner.id) ?? 0,
      regs: regsById.get(owner.id) ?? 0,
      purchases: purchasesById.get(owner.id) ?? 0,
      revenue: revenueById.get(owner.id) ?? 0,
      accrued: accruedById.get(owner.id) ?? 0,
      balance: balanceById.get(owner.id) ?? 0,
      customReward: owner.customInviterReward,
      customKind: owner.customInviterKind,
      payoutContact: payoutById.get(owner.id) ?? null,
    }))
    .sort((a, b) => b.accrued - a.accrued || b.revenue - a.revenue || b.clicks - a.clicks);

  // ------------------------------------------------------------ withdrawals --
  const withdrawalTotals: AdminReferrals["withdrawalTotals"] = {
    pending: { count: 0, sum: 0 },
    approved: { count: 0, sum: 0 },
    rejected: { count: 0, sum: 0 },
  };
  for (const row of withdrawalGroups) {
    if (row.status === "pending" || row.status === "approved" || row.status === "rejected") {
      withdrawalTotals[row.status] = { count: row._count._all, sum: row._sum.amount ?? 0 };
    }
  }

  // --------------------------------------------------------------- accruals --
  const accruals: AdminReferralAccrual[] = accrualRows.map((row) => ({
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    userName: nameOf(row.user),
    reason: row.reason,
    amount: row.amount,
  }));

  const weeklyMap = new Map<string, number>();
  for (let i = 7; i >= 0; i -= 1) {
    weeklyMap.set(weekStartLabel(new Date(now.getTime() - i * 7 * DAY_MS)), 0);
  }
  for (const row of dayRows) {
    const key = weekStartLabel(row.createdAt);
    if (weeklyMap.has(key)) weeklyMap.set(key, (weeklyMap.get(key) ?? 0) + row.amount);
  }
  const weekly = [...weeklyMap.entries()].map(([week, money]) => ({ week, money }));

  // ----------------------------------------------------------------- sources --
  let referral = 0;
  let promo = 0;
  let organic = 0;
  for (const user of recentUsers) {
    if (user.referredById != null) referral += 1;
    else if (user.pendingPromo != null) promo += 1;
    else organic += 1;
  }

  let accruedTotal = 0;
  for (const value of accruedById.values()) accruedTotal += value;
  let balanceTotal = 0;
  for (const value of balanceById.values()) balanceTotal += value;

  return {
    settings,
    generatedAt: now.toISOString(),
    stats,
    partners,
    withdrawals: withdrawalRows.map((row) => ({
      id: row.id,
      userId: row.userId,
      userName: nameOf(row.user),
      contact: row.contact,
      amount: row.amount,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
    })),
    withdrawalTotals,
    accruals,
    weekly,
    sources: { referral, promo, organic },
    totals: {
      accrued: accruedTotal,
      balances: balanceTotal,
      daysOnBalances: Math.max(0, daysAgg._sum.bonusDays ?? 0),
    },
  };
}
