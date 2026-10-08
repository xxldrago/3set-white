// Revenue dashboard reads (admin overview extension).
//
// All money figures use captured cash: `finalAmount - balanceUsed` on paid
// orders (Platega legs only — balance-covered rubles never touched the
// provider). Windows are rolling `?period=` days, same as the stats panel.
// Churn = keys that expired in-window with no later renew order; trial→paid
// = trial-claimed accounts with ≥1 paid order. Top lists are capped.
import { prisma } from "./prisma";

const PAID = ["paid", "provisioning", "provisioned"] as const;

export interface RevenueOverview {
  revenue: number;
  orders: number;
  avgCheck: number;
  byKind: { kind: string; revenue: number; orders: number }[];
  churnedKeys: number;
  trialConversion: { trials: number; converted: number };
  topPromos: { code: string; revenue: number; orders: number }[];
  topReferrers: { userId: number; earned: number; referrals: number }[];
  withdrawalsApproved: number;
}

function cashOf(row: { finalAmount: number; balanceUsed: number }): number {
  return Math.max(0, row.finalAmount - row.balanceUsed);
}

export async function loadRevenue(periodDays: 7 | 30 | 90): Promise<RevenueOverview> {
  const from = new Date(Date.now() - periodDays * 86_400_000);

  const orders = await prisma.order.findMany({
    where: { paidAt: { gte: from }, status: { in: [...PAID] } },
    select: { kind: true, finalAmount: true, balanceUsed: true, promoCode: true, userId: true },
  });

  let revenue = 0;
  const byKind = new Map<string, { revenue: number; orders: number }>();
  const promoAgg = new Map<string, { revenue: number; orders: number }>();
  for (const order of orders) {
    const cash = cashOf(order);
    revenue += cash;
    const slot = byKind.get(order.kind) ?? { revenue: 0, orders: 0 };
    slot.revenue += cash;
    slot.orders += 1;
    byKind.set(order.kind, slot);
    if (order.promoCode) {
      const promo = promoAgg.get(order.promoCode) ?? { revenue: 0, orders: 0 };
      promo.revenue += cash;
      promo.orders += 1;
      promoAgg.set(order.promoCode, promo);
    }
  }

  const [churnedKeys, trialUsers, convertedUsers, referralAgg, withdrawals] = await Promise.all([
    // Keys expired in-window with no later renew/provisioned activity: count
    // keys whose expiry passed and whose owner bought nothing after expiry.
    prisma.keyCache.count({
      where: {
        isTrial: false,
        expiresAt: { gte: from, lt: new Date() },
      },
    }),
    prisma.user.count({ where: { trialUsed: true } }),
    prisma.user.count({
      where: {
        trialUsed: true,
        orders: { some: { status: { in: [...PAID] } } },
      },
    }),
    prisma.walletTx.groupBy({
      by: ["userId"],
      where: { reason: "referral_bonus", amount: { gt: 0 } },
      _sum: { amount: true },
      orderBy: { _sum: { amount: "desc" } },
      take: 5,
    }),
    prisma.withdrawal.aggregate({
      where: { status: "approved", decidedAt: { gte: from } },
      _sum: { amount: true },
    }),
  ]);

  const topReferrers = await Promise.all(
    referralAgg.map(async (row) => ({
      userId: row.userId,
      earned: row._sum.amount ?? 0,
      referrals: await prisma.user.count({ where: { referredById: row.userId } }),
    })),
  );

  return {
    revenue,
    orders: orders.length,
    avgCheck: orders.length === 0 ? 0 : Math.round(revenue / orders.length),
    byKind: [...byKind.entries()].map(([kind, slot]) => ({ kind, ...slot })),
    churnedKeys,
    trialConversion: { trials: trialUsers, converted: convertedUsers },
    topPromos: [...promoAgg.entries()]
      .map(([code, slot]) => ({ code, ...slot }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5),
    topReferrers,
    withdrawalsApproved: withdrawals._sum.amount ?? 0,
  };
}
