// Partner earnings read-model: balance + period analytics split by channel.
//
// Attribution: a buyer is pinned to the partner via `users.referredById` —
// both the referral link and the partner's promo codes pin it (see
// orders-service: a personal promo attributes the buyer to its owner). The
// channel split therefore comes from `orders.promoCode`: a partner-owned code
// is the "promo" channel, everything else is the "link" channel.
//
// Earnings are `wallet_tx.referral_bonus` rows (money only; bonus days carry
// amount 0). Partner credits are order-scoped: refId is `<buyerId>:<orderId>`
// for the direct leg and `<buyerId>:<orderId>:up` for the upline residual, so
// each credit can be attributed to the order that produced it.
import { prisma } from './prisma';
import { walletBalance } from './referrals';

const PAID = ['paid', 'provisioning', 'provisioned'] as const;

export type EarningsPeriod = 7 | 30 | 90 | 0;

export interface PartnerSourceRow {
  key: string;
  label: string;
  kind: 'link' | 'promo';
  clicks: number;
  purchases: number;
  revenue: number;
  earned: number;
}

export interface PartnerSeriesPoint {
  label: string;
  revenue: number;
  earned: number;
}

export interface PartnerEarnings {
  from: Date | null;
  to: Date;
  balance: number;
  totals: {
    clicks: number;
    registrations: number;
    purchases: number;
    revenue: number;
    earned: number;
    avgCheck: number;
    conversion: number;
  };
  sources: PartnerSourceRow[];
  series: PartnerSeriesPoint[];
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

const MONTHS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

/** Order id encoded in a wallet credit refId (`buyer:order[:up]`). */
function orderIdOf(refId: string): string | null {
  const parts = refId.split(':');
  return parts.length >= 2 && parts[1].length > 0 ? parts[1] : null;
}

function buildBuckets(
  period: EarningsPeriod,
  to: Date,
): { start: Date; end: Date; label: string }[] {
  const buckets: { start: Date; end: Date; label: string }[] = [];
  if (period === 0) {
    // Last 12 calendar months.
    for (let i = 11; i >= 0; i -= 1) {
      const start = new Date(to.getFullYear(), to.getMonth() - i, 1);
      const end = new Date(to.getFullYear(), to.getMonth() - i + 1, 1);
      buckets.push({ start, end, label: MONTHS[start.getMonth()] });
    }
    return buckets;
  }
  if (period === 90) {
    // 13 weeks ending today.
    const endDay = startOfDay(to);
    for (let i = 12; i >= 0; i -= 1) {
      const end = new Date(endDay.getTime() + 86_400_000 - (i * 7 * 86_400_000));
      const start = new Date(end.getTime() - 7 * 86_400_000);
      buckets.push({
        start,
        end,
        label: `${pad2(start.getDate())}.${pad2(start.getMonth() + 1)}`,
      });
    }
    return buckets;
  }
  const endDay = startOfDay(to);
  for (let i = period - 1; i >= 0; i -= 1) {
    const start = new Date(endDay.getTime() - i * 86_400_000);
    const end = new Date(start.getTime() + 86_400_000);
    buckets.push({
      start,
      end,
      label: `${pad2(start.getDate())}.${pad2(start.getMonth() + 1)}`,
    });
  }
  return buckets;
}

function bucketIndex(buckets: { start: Date; end: Date }[], at: Date): number {
  for (let i = 0; i < buckets.length; i += 1) {
    if (at >= buckets[i].start && at < buckets[i].end) return i;
  }
  return -1;
}

export async function loadPartnerEarnings(
  userId: number,
  period: EarningsPeriod,
): Promise<PartnerEarnings> {
  const to = new Date();
  const from = period === 0 ? null : startOfDay(new Date(to.getTime() - (period - 1) * 86_400_000));
  const range = from ? { gte: from, lte: to } : undefined;

  const [promos, orders, credits, clickGroups, registrations, balance] = await Promise.all([
    prisma.promoCode.findMany({
      where: { ownerUserId: userId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, code: true },
    }),
    prisma.order.findMany({
      where: {
        ...(range ? { createdAt: range } : {}),
        status: { in: [...PAID] },
        user: { referredById: userId },
      },
      select: {
        id: true,
        promoCode: true,
        finalAmount: true,
        balanceUsed: true,
        createdAt: true,
      },
    }),
    prisma.walletTx.findMany({
      where: {
        userId,
        reason: 'referral_bonus',
        ...(range ? { createdAt: range } : {}),
      },
      select: { amount: true, refId: true, createdAt: true },
    }),
    prisma.referralClick.groupBy({
      by: ['kind', 'promoCodeId'],
      where: { ownerUserId: userId, ...(range ? { createdAt: range } : {}) },
      _count: { _all: true },
    }),
    prisma.user.count({
      where: { referredById: userId, ...(range ? { createdAt: range } : {}) },
    }),
    walletBalance(userId),
  ]);

  const promoByCode = new Map(promos.map((row) => [row.code, row.id]));

  const earnedByOrder = new Map<string, number>();
  for (const tx of credits) {
    const orderId = orderIdOf(tx.refId);
    if (orderId) earnedByOrder.set(orderId, (earnedByOrder.get(orderId) ?? 0) + tx.amount);
  }

  const linkClicks = clickGroups
    .filter((row) => row.kind !== 'promo' && row.promoCodeId === null)
    .reduce((sum, row) => sum + row._count._all, 0);
  const promoClickById = new Map<string, number>();
  for (const row of clickGroups) {
    if (row.promoCodeId) {
      promoClickById.set(row.promoCodeId, (promoClickById.get(row.promoCodeId) ?? 0) + row._count._all);
    }
  }

  const sources = new Map<string, PartnerSourceRow>();
  const linkSource: PartnerSourceRow = {
    key: 'link',
    label: 'Реферальная ссылка',
    kind: 'link',
    clicks: linkClicks,
    purchases: 0,
    revenue: 0,
    earned: 0,
  };
  sources.set('link', linkSource);
  for (const promo of promos) {
    sources.set(promo.code, {
      key: promo.code,
      label: promo.code,
      kind: 'promo',
      clicks: promoClickById.get(promo.id) ?? 0,
      purchases: 0,
      revenue: 0,
      earned: 0,
    });
  }

  const buckets = buildBuckets(period, to);
  const series: PartnerSeriesPoint[] = buckets.map((bucket) => ({
    label: bucket.label,
    revenue: 0,
    earned: 0,
  }));

  let revenue = 0;
  let earnedTotal = 0;
  for (const order of orders) {
    const net = Math.max(0, order.finalAmount - order.balanceUsed);
    const earned = earnedByOrder.get(order.id) ?? 0;
    const key =
      order.promoCode && promoByCode.has(order.promoCode) ? order.promoCode : 'link';
    const source = sources.get(key) ?? linkSource;
    source.purchases += 1;
    source.revenue += net;
    source.earned += earned;
    revenue += net;
    earnedTotal += earned;
    const idx = bucketIndex(buckets, order.createdAt);
    if (idx >= 0) {
      series[idx].revenue += net;
      series[idx].earned += earned;
    }
  }

  // Credits not tied to a paid order in range (e.g. legacy first-payment refId)
  // still count towards the period total and the link channel.
  const attributed = [...earnedByOrder.values()].reduce((sum, value) => sum + value, 0);
  const unattributed = credits.reduce((sum, tx) => sum + tx.amount, 0) - attributed;
  if (unattributed > 0) {
    linkSource.earned += unattributed;
    earnedTotal += unattributed;
  }

  const purchases = orders.length;
  const totals = {
    clicks: clickGroups.reduce((sum, row) => sum + row._count._all, 0),
    registrations,
    purchases,
    revenue,
    earned: earnedTotal,
    avgCheck: purchases > 0 ? Math.round(revenue / purchases) : 0,
    conversion: registrations > 0 ? Math.round((purchases / registrations) * 100) : 0,
  };

  const orderedSources = [linkSource, ...promos.map((promo) => sources.get(promo.code)!)];

  return { from, to, balance, totals, sources: orderedSources, series };
}
