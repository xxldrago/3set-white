// /admin/analytics read model — one snapshot for the template-styled page.
//
// Every number is derived from real tables: users / orders / keys_cache /
// promo_codes / referral_clicks / wallet_tx / withdrawals / daily_metrics, plus
// the existing derivation core in lib/analytics (MRR, LTV, margin, funnel,
// timings, cohorts). No fixtures, no fabricated series.
//
// Window contract: the same MSK comparison window the rest of the analytics
// page uses (lib/analytics/windows.ts) — 7/90 = the last complete MSK days,
// 30 = the previous MSK calendar month. Today's incomplete day is excluded
// from aggregates, exactly like loadKpis.
//
// Channel classification mirrors lib/analytics/cohorts.ts: referral >
// promo (pendingPromo or a paid order with a promo code) > organic.
import { prisma } from "./prisma";
import { cashOf } from "./analytics/series";
import { comparisonWindows } from "./analytics/windows";
import { mskDateKey, mskDayLabel, mskDayStartInstant, shiftDays } from "./analytics/time";
import type { ChannelFilter } from "./analytics/cohorts";
import {
  loadErrorBreakdown,
  loadExpired,
  loadFunnel,
  loadKpis,
  loadLtv,
  loadMargin,
  loadRegistrationCohorts,
  loadTimeToPay,
  loadTimeToProvision,
  loadWaterfall,
} from "./analytics/service";

const PAID = ["paid", "provisioning", "provisioned"] as const;

export type AnalyticsPeriod = 7 | 30 | 90;

export interface DayRegistrations {
  day: string;
  organic: number;
  referral: number;
  promo: number;
  total: number;
}

export interface DayRevenue {
  day: string;
  cash: number;
  cumulative: number;
}

export interface PartnerRow {
  id: number;
  name: string;
  code: string | null;
  clicks: number;
  regs: number;
  payers: number;
  revenue: number;
}

export interface PromoRow {
  code: string;
  discount: number;
  type: string;
  uses: number;
  revenue: number;
  discountSum: number;
}

export interface TrialRow {
  keyId: string;
  user: string;
  expiresAt: string | null;
  devices: number;
  deviceLimit: number | null;
  status: string;
  active: boolean;
}

export interface CohortRow {
  month: string;
  size: number;
  retained: (number | null)[];
}

export interface AdminAnalytics {
  period: AnalyticsPeriod;
  channel: ChannelFilter;
  window: { from: string; to: string };
  generatedAt: string;

  kpi: {
    registrations: number;
    prevRegistrations: number;
    revenue: number;
    prevRevenue: number;
    activeKeys: number;
    activeUsers: number;
    totalUsers: number;
    devices: number;
    deviceSlots: number;
    arppu: number | null;
    partnerRevenue: number;
    referrals: number;
    refClicks: number;
    promoUses: number;
    promoDiscount: number;
    trialIssued: number;
    trialActive: number;
    trialConverted: number;
    trialTotal: number;
    overdue: number;
    ordersCreated: number;
    ordersPaid: number;
    paidOrdersInWindow: number;
  };

  money: {
    mrr: number;
    arr: number;
    arpu: number | null;
    coverageKnown: number;
    coverageTotal: number;
  } | null;

  unit: {
    ltvGross: number | null;
    ltvPredictive: number | null;
    ltvNet: number | null;
    margin: number | null;
    marginPct: number | null;
    costPerKey: number | null;
    activePayers: number;
    payers: number;
  } | null;

  mrrMove: {
    month: string;
    added: number;
    expansion: number;
    contraction: number;
    churned: number;
    net: number;
  } | null;

  regSeries: DayRegistrations[];
  activeSeries: { day: string; keys: number }[];
  revenueSeries: DayRevenue[];

  partners: {
    clicks: number;
    regs: number;
    payers: number;
    revenue: number;
    accrued: number;
    pendingWithdrawals: number;
    rows: PartnerRow[];
  };

  promos: {
    uses: number;
    discount: number;
    revenue: number;
    ordersWithPromo: number;
    rows: PromoRow[];
  };

  trials: {
    issuedInWindow: number;
    activeNow: number;
    converted: number;
    totalUsed: number;
    rows: TrialRow[];
  };

  funnel: {
    steps: { key: string; label: string; count: number; conversion: number | null }[];
    created: number;
    paid: number;
    errors: number;
    medianPayMs: number | null;
    medianProvisionMs: number | null;
  };

  cohorts: CohortRow[];
}

const FUNNEL_LABELS: Record<string, string> = {
  pending: "Создано",
  paid: "Оплачено",
  provisioning: "Выдача начата",
  provisioned: "Ключ выдан",
};

/** Day labels from `from` to `to` inclusive (MSK). */
function dayLabels(from: string, to: string): string[] {
  const out: string[] = [];
  let cursor = from;
  // Guard against a malformed range: never loop past a year of days.
  for (let i = 0; i < 400 && cursor <= to; i += 1) {
    out.push(cursor);
    cursor = shiftDays(cursor, 1);
  }
  return out;
}

function displayName(user: { firstName: string | null; username: string | null; email: string | null } | null): string {
  if (!user) return "—";
  return user.firstName || user.username || user.email || "Без имени";
}

export async function loadAdminAnalytics(
  period: AnalyticsPeriod,
  channel: ChannelFilter = "all",
): Promise<AdminAnalytics> {
  const now = new Date();
  const windows = comparisonWindows(period, now);
  const fromDay = windows.fromDay;
  const toDay = windows.toDay;
  const fromInstant = mskDayStartInstant(fromDay);
  const toEndInstant = mskDayStartInstant(shiftDays(toDay, 1));
  const labels = dayLabels(fromDay, toDay);

  const [
    kpis,
    ltv,
    margin,
    funnelData,
    payTiming,
    provTiming,
    expired,
    errorData,
    waterfall,
    cohortData,
  ] = await Promise.all([
    loadKpis(period).catch(() => null),
    loadLtv().catch(() => null),
    loadMargin(period).catch(() => null),
    loadFunnel(period).catch(() => null),
    loadTimeToPay(period).catch(() => null),
    loadTimeToProvision(period).catch(() => null),
    loadExpired().catch(() => null),
    loadErrorBreakdown(period).catch(() => null),
    loadWaterfall().catch(() => null),
    loadRegistrationCohorts(channel).catch(() => ({ cohorts: [] })),
  ]);

  const [
    windowUsers,
    prevUsers,
    windowOrders,
    prevRevenueAgg,
    totalUsers,
    liveKeys,
    promoOrderUsers,
    refClicksAgg,
    walletAccrued,
    pendingWithdrawals,
    trialKeys,
    trialUsedTotal,
    trialConvertedRows,
    promoMeta,
    dailyRows,
    referralClicksByOwner,
    referredByOwner,
  ] = await Promise.all([
    prisma.user.findMany({
      where: { createdAt: { gte: fromInstant, lt: toEndInstant } },
      select: { id: true, createdAt: true, referredById: true, pendingPromo: true },
    }),
    prisma.user.count({
      where: {
        createdAt: {
          gte: mskDayStartInstant(windows.baseFromDay),
          lt: mskDayStartInstant(shiftDays(windows.baseToDay, 1)),
        },
      },
    }),
    prisma.order.findMany({
      where: { status: { in: [...PAID] }, paidAt: { gte: fromInstant, lt: toEndInstant } },
      select: {
        userId: true,
        paidAt: true,
        amount: true,
        finalAmount: true,
        balanceUsed: true,
        promoCode: true,
        user: { select: { referredById: true } },
      },
    }),
    prisma.order.aggregate({
      where: {
        status: { in: [...PAID] },
        paidAt: {
          gte: mskDayStartInstant(windows.baseFromDay),
          lt: mskDayStartInstant(shiftDays(windows.baseToDay, 1)),
        },
      },
      _sum: { finalAmount: true, balanceUsed: true },
    }),
    prisma.user.count(),
    prisma.keyCache.findMany({
      where: { isTrial: false, expiresAt: { gt: now } },
      select: { userId: true, devices: true, deviceLimit: true },
    }),
    prisma.order.findMany({
      where: { promoCode: { not: null } },
      select: { userId: true },
    }),
    prisma.referralClick.count({
      where: { createdAt: { gte: fromInstant, lt: toEndInstant } },
    }),
    prisma.walletTx.aggregate({
      where: { reason: "referral_bonus", createdAt: { gte: fromInstant, lt: toEndInstant } },
      _sum: { amount: true },
    }),
    prisma.withdrawal.aggregate({ where: { status: "pending" }, _sum: { amount: true } }),
    prisma.keyCache.findMany({
      where: { isTrial: true },
      orderBy: { updatedAt: "desc" },
      take: 100,
      select: {
        keyId: true,
        expiresAt: true,
        devices: true,
        deviceLimit: true,
        status: true,
        user: { select: { firstName: true, username: true, email: true } },
      },
    }),
    prisma.user.count({ where: { trialUsed: true } }),
    prisma.$queryRaw<{ converted: number }[]>`
      SELECT COUNT(DISTINCT o.user_id)::int AS converted
      FROM orders o
      JOIN users u ON u.id = o.user_id
      WHERE u.trial_used = true
        AND o.status IN ('paid', 'provisioning', 'provisioned')
    `,
    prisma.promoCode.findMany({
      select: { code: true, discount: true, type: true, maxUses: true, usedCount: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.dailyMetric.findMany({
      where: { day: { gte: mskDateKey(fromDay), lte: mskDateKey(toDay) } },
      orderBy: { day: "asc" },
      select: { day: true, activeKeys: true },
    }),
    prisma.referralClick.groupBy({
      by: ["ownerUserId"],
      where: { ownerUserId: { not: null }, createdAt: { gte: fromInstant, lt: toEndInstant } },
      _count: { _all: true },
    }),
    prisma.user.groupBy({
      by: ["referredById"],
      where: { referredById: { not: null }, createdAt: { gte: fromInstant, lt: toEndInstant } },
      _count: { _all: true },
    }),
  ]);

  // ---------------------------------------------------------------- series --
  const promoUserIds = new Set(promoOrderUsers.map((o) => o.userId));
  const regBuckets = new Map<string, DayRegistrations>();
  for (const day of labels) {
    regBuckets.set(day, { day, organic: 0, referral: 0, promo: 0, total: 0 });
  }
  for (const user of windowUsers) {
    const bucket = regBuckets.get(mskDayLabel(user.createdAt));
    if (!bucket) continue;
    const ch: "referral" | "promo" | "organic" =
      user.referredById != null ? "referral" : user.pendingPromo != null || promoUserIds.has(user.id) ? "promo" : "organic";
    bucket[ch] += 1;
    bucket.total += 1;
  }
  const regSeries = labels.map((day) => regBuckets.get(day) as DayRegistrations);

  const revenueByDay = new Map<string, number>();
  let revenue = 0;
  let partnerRevenue = 0;
  let promoUses = 0;
  let promoDiscount = 0;
  let promoRevenue = 0;
  const promoAgg = new Map<string, { uses: number; revenue: number; discountSum: number }>();
  const partnerAgg = new Map<number, { revenue: number; payers: Set<number> }>();

  for (const order of windowOrders) {
    if (!order.paidAt) continue;
    const day = mskDayLabel(order.paidAt);
    const cash = cashOf(order);
    revenue += cash;
    revenueByDay.set(day, (revenueByDay.get(day) ?? 0) + cash);

    if (order.promoCode) {
      promoUses += 1;
      promoRevenue += cash;
      const discount = Math.max(0, order.amount - order.finalAmount);
      promoDiscount += discount;
      const agg = promoAgg.get(order.promoCode) ?? { uses: 0, revenue: 0, discountSum: 0 };
      agg.uses += 1;
      agg.revenue += cash;
      agg.discountSum += discount;
      promoAgg.set(order.promoCode, agg);
    }

    const ownerId = order.user?.referredById ?? null;
    if (ownerId != null) {
      partnerRevenue += cash;
      const agg = partnerAgg.get(ownerId) ?? { revenue: 0, payers: new Set<number>() };
      agg.revenue += cash;
      agg.payers.add(order.userId);
      partnerAgg.set(ownerId, agg);
    }
  }

  let running = 0;
  const revenueSeries: DayRevenue[] = labels.map((day) => {
    const cash = revenueByDay.get(day) ?? 0;
    running += cash;
    return { day, cash, cumulative: running };
  });

  const activeSeries = dailyRows.map((row) => ({ day: mskDayLabel(row.day), keys: row.activeKeys }));

  // --------------------------------------------------------------- devices --
  const deviceUserIds = new Set<number>();
  let devices = 0;
  let deviceSlots = 0;
  for (const key of liveKeys) {
    deviceUserIds.add(key.userId);
    const used = key.devices ?? 0;
    devices += used;
    deviceSlots += key.deviceLimit ?? used;
  }

  // -------------------------------------------------------------- partners --
  const ownerIds = new Set<number>([
    ...referralClicksByOwner.map((row) => row.ownerUserId).filter((id): id is number => id != null),
    ...referredByOwner.map((row) => row.referredById).filter((id): id is number => id != null),
    ...partnerAgg.keys(),
  ]);
  const owners = ownerIds.size
    ? await prisma.user.findMany({
        where: { id: { in: [...ownerIds] } },
        select: { id: true, firstName: true, username: true, email: true, referralCode: true },
      })
    : [];
  const ownerById = new Map(owners.map((owner) => [owner.id, owner]));

  const clicksByOwner = new Map(
    referralClicksByOwner
      .filter((row): row is typeof row & { ownerUserId: number } => row.ownerUserId != null)
      .map((row) => [row.ownerUserId, row._count._all]),
  );
  const regsByOwner = new Map(
    referredByOwner
      .filter((row): row is typeof row & { referredById: number } => row.referredById != null)
      .map((row) => [row.referredById, row._count._all]),
  );

  const partnerRows: PartnerRow[] = [...ownerIds]
    .map((id) => {
      const owner = ownerById.get(id);
      const agg = partnerAgg.get(id);
      return {
        id,
        name: owner ? displayName(owner) : `#${id}`,
        code: owner?.referralCode ?? null,
        clicks: clicksByOwner.get(id) ?? 0,
        regs: regsByOwner.get(id) ?? 0,
        payers: agg?.payers.size ?? 0,
        revenue: agg?.revenue ?? 0,
      };
    })
    .sort((a, b) => b.revenue - a.revenue || b.regs - a.regs || b.clicks - a.clicks)
    .slice(0, 8);

  const partnerPayers = new Set<number>();
  for (const agg of partnerAgg.values()) for (const userId of agg.payers) partnerPayers.add(userId);

  // ---------------------------------------------------------------- promos --
  const promoRows: PromoRow[] = promoMeta
    .map((code) => {
      const agg = promoAgg.get(code.code);
      return {
        code: code.code,
        discount: code.discount,
        type: code.type,
        uses: agg?.uses ?? 0,
        revenue: agg?.revenue ?? 0,
        discountSum: agg?.discountSum ?? 0,
      };
    })
    .sort((a, b) => b.uses - a.uses || b.revenue - a.revenue)
    .slice(0, 10);

  // ---------------------------------------------------------------- trials --
  const trialRows: TrialRow[] = trialKeys.slice(0, 8).map((key) => ({
    keyId: key.keyId,
    user: displayName(key.user),
    expiresAt: key.expiresAt ? mskDayLabel(key.expiresAt) : null,
    devices: key.devices ?? 0,
    deviceLimit: key.deviceLimit,
    status: key.status,
    active: key.expiresAt != null && key.expiresAt.getTime() > now.getTime(),
  }));
  const trialActiveNow = trialKeys.filter(
    (key) => key.expiresAt != null && key.expiresAt.getTime() > now.getTime(),
  ).length;
  const trialConverted = trialConvertedRows[0]?.converted ?? 0;
  const trialIssuedInWindow = windowUsers.length
    ? await prisma.user.count({
        where: { trialUsed: true, createdAt: { gte: fromInstant, lt: toEndInstant } },
      })
    : 0;

  // ---------------------------------------------------------------- funnel --
  const funnelSteps = (funnelData?.steps ?? []).map((step) => ({
    key: step.step,
    label: FUNNEL_LABELS[step.step] ?? step.step,
    count: step.count,
    conversion: step.conversion,
  }));
  const ordersPaid = funnelSteps.find((step) => step.key === "paid")?.count ?? 0;

  // --------------------------------------------------------------- cohorts --
  const cohorts: CohortRow[] = (cohortData.cohorts ?? [])
    .filter((cohort) => cohort.size > 0)
    .map((cohort) => ({ month: cohort.month, size: cohort.size, retained: cohort.retained }));

  const lastWaterfall = waterfall?.months?.length
    ? waterfall.months[waterfall.months.length - 1]
    : null;

  const prevRevenue =
    (prevRevenueAgg._sum.finalAmount ?? 0) - (prevRevenueAgg._sum.balanceUsed ?? 0);

  return {
    period,
    channel,
    window: { from: fromDay, to: toDay },
    generatedAt: now.toISOString(),
    kpi: {
      registrations: windowUsers.length,
      prevRegistrations: prevUsers,
      revenue,
      prevRevenue,
      activeKeys: kpis?.activeKeys ?? liveKeys.length,
      activeUsers: deviceUserIds.size,
      totalUsers,
      devices,
      deviceSlots,
      arppu: kpis?.arppu ?? null,
      partnerRevenue,
      referrals: regSeries.reduce((sum, day) => sum + day.referral, 0),
      refClicks: refClicksAgg,
      promoUses,
      promoDiscount,
      trialIssued: trialIssuedInWindow,
      trialActive: trialActiveNow,
      trialConverted,
      trialTotal: trialUsedTotal,
      overdue: expired?.count ?? 0,
      ordersCreated: funnelSteps[0]?.count ?? 0,
      ordersPaid,
      paidOrdersInWindow: windowOrders.length,
    },
    money: kpis
      ? {
          mrr: kpis.mrr,
          arr: kpis.arr,
          arpu: kpis.arpu,
          coverageKnown: kpis.coverageKnown,
          coverageTotal: kpis.coverageTotal,
        }
      : null,
    unit: ltv
      ? {
          ltvGross: ltv.grossHistorical,
          ltvPredictive: ltv.grossPredictive,
          ltvNet: ltv.net,
          margin: margin?.grossMargin ?? null,
          marginPct: margin?.marginPct ?? null,
          costPerKey: margin?.costPerKey ?? null,
          activePayers: ltv.activePayers,
          payers: ltv.grossHistoricalPayers,
        }
      : null,
    mrrMove: lastWaterfall
      ? {
          month: lastWaterfall.label,
          added: lastWaterfall.new,
          expansion: lastWaterfall.expansion,
          contraction: lastWaterfall.contraction,
          churned: lastWaterfall.churned,
          net: lastWaterfall.net,
        }
      : null,
    regSeries,
    activeSeries,
    revenueSeries,
    partners: {
      clicks: refClicksAgg,
      regs: regSeries.reduce((sum, day) => sum + day.referral, 0),
      payers: partnerPayers.size,
      revenue: partnerRevenue,
      accrued: walletAccrued._sum.amount ?? 0,
      pendingWithdrawals: pendingWithdrawals._sum.amount ?? 0,
      rows: partnerRows,
    },
    promos: {
      uses: promoUses,
      discount: promoDiscount,
      revenue: promoRevenue,
      ordersWithPromo: promoUses,
      rows: promoRows,
    },
    trials: {
      issuedInWindow: trialIssuedInWindow,
      activeNow: trialActiveNow,
      converted: trialConverted,
      totalUsed: trialUsedTotal,
      rows: trialRows,
    },
    funnel: {
      steps: funnelSteps,
      created: funnelSteps[0]?.count ?? 0,
      paid: ordersPaid,
      errors: errorData?.total ?? 0,
      medianPayMs: payTiming?.medianMs ?? null,
      medianProvisionMs: provTiming?.medianMs ?? null,
    },
    cohorts,
  };
}
