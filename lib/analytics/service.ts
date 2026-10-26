// Server-side page loaders for /admin/analytics (UI-SPEC §5.6 data
// contract) — the ONLY DB read module for that page. The page adds zero new
// data sources on top of the rollup foundation (07-02) and the derivation
// core (07-04): MRR/ARR/active-keys come from mrr.ts, the waterfall from
// waterfall.ts, and daily_metrics supplies the covered windows.
//
// Live-today contract (D-12): MRR/ARR are POINT-IN-TIME and are derived from
// raw paid orders with `t = now` — never the last nightly daily_metrics row,
// so a metric formula change or a missed cron night never leaves the page
// reading stale values. Past windows read daily_metrics for EXISTENCE (and
// cost coverage) only; the sparkline's per-day values are derived through the
// same mrrAt engine (raw derivation on the fly, D-12).
//
// MSK discipline (D-15): window bounds are MSK day labels computed in JS and
// converted with mskDayStartInstant (timestamp windows) / mskDateKey (@db.Date)
// — never SQL-side day logic. Raw SQL receives pgTimestamp(...) strings for
// timestamp columns and `${label}::date` for date columns, TZ-independent.
//
// Serialization guard (Pitfall 8): every aggregate leaving this module is a
// JS number — raw-SQL counts/sums are cast ::int with COALESCE(...,0), because
// a stray BigInt would break the RSC payload.
//
// Unbounded-query guard (T-07-05-04): the waterfall renders at most 6 MSK
// months, KPI/sparkline windows are at most 90 MSK days, and daily_metrics
// holds one row per day. The PAID-order loads are the derivation core's own
// unbounded-below source (rollup.ts rationale: term chains need each key's
// full history) — a few thousand rows at MVP scale.
//
// Phase 8 loaders (LTV/margin/burn/retention/churn) derive on the fly from
// orders + keys_cache and one live GET /balance (loadBurnRunway only).
// daily_metrics and artemida_balance_snapshots stay Phase 7's rollup (D-16).
import { prisma } from "../prisma";
import { artemida } from "../artemida";
import {
  activeKeysAt,
  arrAt,
  computeArpu,
  computeArppu,
  computeCoverage,
  keyRefOf,
  totalMrrAt,
} from "./mrr";
import { waterfallForMonths, type WaterfallRow } from "./waterfall";
import { cashOf, nextDayLabel, type PaidOrderRow } from "./series";
import {
  addMonths,
  mskDateKey,
  mskDayLabel,
  mskDayStartInstant,
  mskMonthLabel,
  pgTimestamp,
} from "./time";
import {
  buildKeyTermEvents,
  classifyTerm,
  retentionForWindow,
} from "./retention";
import {
  burnPerDayOf,
  costPerKeyOf,
  grossMarginOf,
  ltvGrossHistorical,
  ltvNet,
  ltvPredictive,
  marginPctOf,
  runwayDaysOf,
} from "./economics";
import { PAYMENT_WINDOW_MS, funnelOf, type FunnelRow, type FunnelStep } from "./funnel";

// Mirrors lib/revenue.ts:10 / rollup.ts:32 — the same money pipeline, never a
// second enum. The PAID-status filter belongs HERE (the DB layer); the pure
// derivation modules trust their input rows.
const PAID = ["paid", "provisioning", "provisioned"] as const;

const DAY_MS = 86_400_000;

/** The PaidOrderRow slice mrr.ts / waterfall.ts consume (rollup.ts's select). */
const ORDER_SELECT = {
  id: true,
  userId: true,
  kind: true,
  days: true,
  devices: true,
  finalAmount: true,
  balanceUsed: true,
  providerCost: true,
  keyId: true,
  provisionedKeyId: true,
  paidAt: true,
  status: true,
} as const;

/** The KPI row's §5.6 payload. Ratios carry EXACT rationals or null — the UI renders «—» on null, never 0. */
export interface KpisData {
  mrr: number;
  arr: number;
  activeKeys: number;
  arpu: number | null;
  arppu: number | null;
  arpuDenominator: number;
  arppuDenominator: number;
  coverageKnown: number;
  coverageTotal: number;
}

/** First MSK day label of the inclusive window of `period` days ending today. */
function windowStartDay(period: 7 | 30 | 90): string {
  return mskDayLabel(new Date(Date.now() - (period - 1) * DAY_MS));
}

async function loadPaidOrders(): Promise<PaidOrderRow[]> {
  return prisma.order.findMany({ where: { status: { in: [...PAID] } }, select: ORDER_SELECT });
}

/**
 * KPI row for /admin/analytics (§5.3). MRR/ARR/active keys are point-in-time
 * (t = now); ARPU/ARPPU/window cash and the cost-coverage sums are windowed
 * over the LAST `period` MSK days (inclusive of today). D-05 "без
 * заблокированных" is a documented no-op: the User model has no blocked field
 * (07-04), so the ARPU denominator is plain prisma.user.count().
 */
export async function loadKpis(period: 7 | 30 | 90): Promise<KpisData> {
  const now = new Date();
  const fromDay = windowStartDay(period);
  const fromInstant = mskDayStartInstant(fromDay);

  const [history, windowOrders, userCount, payerRows] = await Promise.all([
    loadPaidOrders(),
    prisma.order.findMany({
      where: { status: { in: [...PAID] }, paidAt: { gte: fromInstant } },
      select: { finalAmount: true, balanceUsed: true, providerCost: true },
    }),
    prisma.user.count(),
    // COUNT returns bigint → ::int cast keeps it a JS number (never a BigInt
    // crossing the RSC payload). Payers = DISTINCT user_id over the SAME
    // window — order count would be a different (wrong) denominator.
    prisma.$queryRaw<{ payers: number }[]>`
      SELECT COUNT(DISTINCT user_id)::int AS payers
      FROM orders
      WHERE status IN ('paid', 'provisioning', 'provisioned')
        AND paid_at >= ${pgTimestamp(fromInstant)}
    `,
  ]);

  let windowCash = 0;
  for (const row of windowOrders) windowCash += cashOf(row);

  // Coverage from the same live window orders (includes today)
  const coverageTotal = windowOrders.length;
  const coverageKnown = windowOrders.filter(o => o.providerCost !== null).length;

  const arpuDenominator = userCount;
  const arppuDenominator = payerRows[0]?.payers ?? 0;

  return {
    mrr: totalMrrAt(history, now),
    arr: arrAt(history, now),
    activeKeys: activeKeysAt(history, now),
    arpu: computeArpu(windowCash, arpuDenominator),
    arppu: computeArppu(windowCash, arppuDenominator),
    arpuDenominator,
    arppuDenominator,
    coverageKnown,
    coverageTotal,
  };
}

/**
 * Trailing MSK calendar-month labels ending with the CURRENT month — the
 * exact month-slot math loadWaterfall used inline. Shared with loadChurnTable
 * so the two 6-month blocks can never disagree (08-02 D-extraction).
 */
export function trailingMonthLabels(orders: PaidOrderRow[], now: Date): string[] {
  const currentMonth = mskMonthLabel(mskDayLabel(now));

  let firstPaidMonth: string | null = null;
  for (const order of orders) {
    if (!order.paidAt) continue;
    const label = mskMonthLabel(mskDayLabel(order.paidAt));
    if (firstPaidMonth === null || label < firstPaidMonth) firstPaidMonth = label;
  }

  let slots = 1;
  if (firstPaidMonth !== null) {
    const span =
      (Number(currentMonth.slice(0, 4)) - Number(firstPaidMonth.slice(0, 4))) * 12 +
      (Number(currentMonth.slice(5, 7)) - Number(firstPaidMonth.slice(5, 7))) +
      1;
    slots = Math.min(6, Math.max(1, span));
  }

  const labels: string[] = [];
  for (let i = slots - 1; i >= 0; i--) labels.push(mskMonthLabel(addMonths(currentMonth, -i)));
  return labels;
}

/**
 * The waterfall's window: trailing MSK calendar months ending with the
 * CURRENT month, at most 6 slots and never more MSK months than the business
 * has existed (months since the first paid order, minimum 1 — a brand-new
 * install renders a single current-month slot, which the UI turns into the
 * §5.4 empty state; a month with no activity inside the window keeps its
 * slot).
 */
export async function loadWaterfall(): Promise<{ months: WaterfallRow[] }> {
  const orders = await loadPaidOrders();
  const labels = trailingMonthLabels(orders, new Date());
  return { months: waterfallForMonths(labels, orders) };
}

/**
 * Daily MRR series for the sparkline (§5.5): one point per EXISTING
 * daily_metrics day in the window (defaults this is [fromDay, yesterday] —
 * the nightly job only writes through yesterday, so no point is ever
 * fabricated for a missing day) plus TODAY'S live value. x-spacing/gap
 * semantics (a gap = a longer segment) live in the component: the point's y
 * is derived through the same mrrAt engine at each day's end (endOfDay =
 * the next day's MSK-start instant — the series.ts boundary convention), so
 * the trend never depends on a nightly job having run (D-12).
 */
export async function loadSparkline(
  period: 7 | 30 | 90,
): Promise<{ points: { day: string; mrr: number }[] }> {
  const now = new Date();
  const today = mskDayLabel(now);
  const fromDay = windowStartDay(period);

  const [orders, rows] = await Promise.all([
    loadPaidOrders(),
    // Existing days only — the sparkline never invents a zero for a gap.
    // Day keys are UTC-midnight dates whose value IS the MSK label (07-01);
    // mskDayLabel of the returned UTC-midnight Date round-trips the label.
    prisma.dailyMetric.findMany({
      where: { day: { gte: mskDateKey(fromDay), lt: mskDateKey(today) } },
      orderBy: { day: "asc" },
      select: { day: true },
    }),
  ]);

  const points = rows.map((row) => {
    const label = mskDayLabel(row.day);
    const endOfDay = mskDayStartInstant(nextDayLabel(label));
    return { day: label, mrr: totalMrrAt(orders, endOfDay) };
  });
  points.push({ day: today, mrr: totalMrrAt(orders, now) });

  return { points };
}

// ---------------------------------------------------------------------------
// Phase 8 — unit economics + retention loaders (UI-SPEC §6.7)
// ---------------------------------------------------------------------------

/** LTV block payload (§6.7). No period — D-04 ignores ?period. */
export interface LtvData {
  grossHistorical: number | null;
  grossHistoricalPayers: number;
  grossPredictive: number | null;
  predictiveChurnRate: number | null;
  net: number | null;
  netPayers: number;
  coverageFrom: string | null;
  activePayers: number;
}

/** Margin block payload (§6.7). Windowed by ?period like loadKpis. */
export interface MarginData {
  grossMargin: number | null;
  marginPct: number | null;
  costPerKey: number | null;
  costedOrders: number;
  totalOrders: number;
}

/** Burn + runway payload (§6.7). Fixed 30 MSK days (D-14). */
export interface BurnRunwayData {
  burnPerDay: number | null;
  burnCostedOrders: number;
  burnTotalOrders: number;
  burnDaysCovered: number;
  balance: number | null;
  runwayDays: number | null;
  runwayReason: "no-burn" | "no-balance" | null;
}

/** Retention cards payload (§6.7). */
export interface RetentionData {
  renewalRate: number | null;
  renewedKeys: number;
  expiringKeys: number;
  logoChurnRate: number | null;
  churnedKeys: number;
  activeKeysAtStart: number;
  revenueChurnRate: number | null;
  lostMrr: number;
  mrrAtStart: number;
}

/** Churn table payload (§6.7). */
export interface ChurnTableData {
  months: {
    month: string;
    expiring: number;
    renewed: number;
    renewalRate: number | null;
    churned: number;
    lostMrr: number;
  }[];
}

/**
 * Trial refs + live expiry map from keys_cache (A2/D-10). Single scan used by
 * loadLtv / loadRetention / loadChurnTable.
 */
async function loadKeyCacheState(): Promise<{
  trialRefs: Set<string>;
  liveExpiry: Map<string, Date>;
}> {
  const rows = await prisma.keyCache.findMany({
    select: { keyId: true, isTrial: true, expiresAt: true },
  });
  const trialRefs = new Set<string>();
  const liveExpiry = new Map<string, Date>();
  for (const row of rows) {
    if (row.isTrial) trialRefs.add(row.keyId);
    if (row.expiresAt) liveExpiry.set(row.keyId, row.expiresAt);
  }
  return { trialRefs, liveExpiry };
}

/** Drop trial-key orders (D-10). keyRefOf null rows are kept (no trial match). */
function withoutTrialOrders(
  orders: PaidOrderRow[],
  trialRefs: Set<string>,
): PaidOrderRow[] {
  if (trialRefs.size === 0) return orders;
  return orders.filter((o) => {
    const ref = keyRefOf(o);
    return !ref || !trialRefs.has(ref);
  });
}

/**
 * All-time LTV block (D-01..D-04). Trial-filtered orders; predictive uses the
 * same 30-MSK-day window as loadKpis(30). activePayers is the D-01
 * under-amortization marker (open terms at now).
 */
export async function loadLtv(): Promise<LtvData> {
  const now = new Date();
  const [ordersRaw, keyState] = await Promise.all([loadPaidOrders(), loadKeyCacheState()]);
  const orders = withoutTrialOrders(ordersRaw, keyState.trialRefs);

  let cashTotal = 0;
  const payers = new Set<number>();
  for (const o of orders) {
    cashTotal += cashOf(o);
    payers.add(o.userId);
  }
  const grossHistoricalPayers = payers.size;
  const grossHistorical = ltvGrossHistorical(cashTotal, grossHistoricalPayers);

  const from30 = mskDayStartInstant(windowStartDay(30));
  let cash30 = 0;
  const payers30 = new Set<number>();
  for (const o of orders) {
    if (!o.paidAt || o.paidAt.getTime() < from30.getTime()) continue;
    cash30 += cashOf(o);
    payers30.add(o.userId);
  }
  const arppu30 = computeArppu(cash30, payers30.size);

  const events = buildKeyTermEvents(orders, keyState.liveExpiry);
  const predictiveChurnRate = retentionForWindow(events, orders, {
    start: from30,
    endExclusive: now,
    now,
  }).logoChurnRate;
  const grossPredictive = ltvPredictive(arppu30, predictiveChurnRate);

  const activePayers = new Set(
    events.filter((e) => classifyTerm(e, now) === "open").map((e) => e.op.userId),
  ).size;

  const costed = orders.filter((o) => o.providerCost !== null);
  let cashMinusCost = 0;
  const costedPayers = new Set<number>();
  let earliestCosted: Date | null = null;
  for (const o of costed) {
    cashMinusCost += cashOf(o) - (o.providerCost as number);
    costedPayers.add(o.userId);
    if (o.paidAt && (earliestCosted === null || o.paidAt.getTime() < earliestCosted.getTime())) {
      earliestCosted = o.paidAt;
    }
  }
  const netPayers = costedPayers.size;
  const net = ltvNet(cashMinusCost, netPayers);
  const coverageFrom =
    costed.length === 0 || earliestCosted === null ? null : mskDayLabel(earliestCosted);

  return {
    grossHistorical,
    grossHistoricalPayers,
    grossPredictive,
    predictiveChurnRate,
    net,
    netPayers,
    coverageFrom,
    activePayers,
  };
}

/**
 * Windowed gross margin / margin % / cost-per-key over the costed subset
 * (D-11/D-12/D-13). Same fromInstant as loadKpis.
 */
export async function loadMargin(period: 7 | 30 | 90): Promise<MarginData> {
  const fromInstant = mskDayStartInstant(windowStartDay(period));
  const rows = await prisma.order.findMany({
    where: { status: { in: [...PAID] }, paidAt: { gte: fromInstant } },
    select: { finalAmount: true, balanceUsed: true, providerCost: true },
  });
  const costed = rows.filter((o) => o.providerCost !== null);
  let cash = 0;
  let cost = 0;
  for (const o of costed) {
    cash += cashOf(o);
    cost += o.providerCost as number;
  }
  return {
    grossMargin: grossMarginOf(cash, cost, costed.length),
    marginPct: marginPctOf(cash, cost, costed.length),
    costPerKey: costPerKeyOf(cost, costed.length),
    costedOrders: costed.length,
    totalOrders: rows.length,
  };
}

/**
 * Fixed 30-MSK-day burn + live ARTEMIDA balance runway (D-14/D-15/D-16).
 * getBalance is called exactly once here and never rejects the loader.
 */
export async function loadBurnRunway(): Promise<BurnRunwayData> {
  const fromInstant = mskDayStartInstant(windowStartDay(30));
  const [rows, balance] = await Promise.all([
    prisma.order.findMany({
      where: { status: { in: [...PAID] }, paidAt: { gte: fromInstant } },
      select: { providerCost: true, paidAt: true },
    }),
    artemida
      .getBalance()
      .then((b) => (b.unlimited ? null : b.balance))
      .catch(() => null),
  ]);

  const costed = rows.filter((o) => o.providerCost !== null && o.paidAt);
  let costSum = 0;
  const dayLabels = new Set<string>();
  for (const o of costed) {
    costSum += o.providerCost as number;
    dayLabels.add(mskDayLabel(o.paidAt as Date));
  }
  const distinctDays = dayLabels.size;
  const burnPerDay = burnPerDayOf(costSum, rows.length, costed.length, distinctDays);
  const { days: runwayDays, reason: runwayReason } = runwayDaysOf(balance, burnPerDay);

  return {
    burnPerDay,
    burnCostedOrders: costed.length,
    burnTotalOrders: rows.length,
    burnDaysCovered: distinctDays,
    balance,
    runwayDays,
    runwayReason,
  };
}

/**
 * Retention cards for the last `period` MSK days — window identical to
 * loadKpis (D-10 trial filter before event build).
 */
export async function loadRetention(period: 7 | 30 | 90): Promise<RetentionData> {
  const now = new Date();
  const [ordersRaw, keyState] = await Promise.all([loadPaidOrders(), loadKeyCacheState()]);
  const orders = withoutTrialOrders(ordersRaw, keyState.trialRefs);
  const events = buildKeyTermEvents(orders, keyState.liveExpiry);
  const result = retentionForWindow(events, orders, {
    start: mskDayStartInstant(windowStartDay(period)),
    endExclusive: now,
    now,
  });
  return {
    renewalRate: result.renewalRate,
    renewedKeys: result.renewedKeys,
    expiringKeys: result.expiringKeys,
    logoChurnRate: result.logoChurnRate,
    churnedKeys: result.churnedKeys,
    activeKeysAtStart: result.activeKeysAtStart,
    revenueChurnRate: result.revenueChurnRate,
    lostMrr: result.lostMrr,
    mrrAtStart: result.mrrAtStart,
  };
}

/**
 * 6-month churn table — month slots from trailingMonthLabels (shared with
 * loadWaterfall). Half-open [monthStart, min(nextMonthStart, now)).
 */
export async function loadChurnTable(): Promise<ChurnTableData> {
  const now = new Date();
  const [ordersRaw, keyState] = await Promise.all([loadPaidOrders(), loadKeyCacheState()]);
  const orders = withoutTrialOrders(ordersRaw, keyState.trialRefs);
  const events = buildKeyTermEvents(orders, keyState.liveExpiry);
  const labels = trailingMonthLabels(orders, now);

  const months = labels.map((label) => {
    const start = mskDayStartInstant(label);
    const nextStart = mskDayStartInstant(addMonths(label, 1));
    const endExclusive = new Date(Math.min(nextStart.getTime(), now.getTime()));
    const r = retentionForWindow(events, orders, { start, endExclusive, now });
    return {
      month: label,
      expiring: r.expiringKeys,
      renewed: r.renewedKeys,
      renewalRate: r.renewalRate,
      churned: r.churnedKeys,
      lostMrr: r.lostMrr,
    };
  });

  return { months };
}

// ---------------------------------------------------------------------------
// Phase 9 — payment funnel + failure analysis loaders (ANL-08..11)
//
// All four WINDOWED loaders (?period = 7 | 30 | 90 MSK days, D-06) share ONE
// createdAt cohort window — mskDayStartInstant(windowStartDay(period)), the same
// bound loadKpis uses. The funnel base is orders CREATED in the period:
// pending orders have no paidAt, so a paidAt window would silently drop them
// out of the funnel's first step. loadExpired is the ONLY point-in-time read
// (no period): pending AND created strictly before now − PAYMENT_WINDOW_MS.
//
// Stage membership, error grouping and timing statistics are NEVER re-derived
// here — lib/analytics/funnel.ts (09-01) owns every derivation; these loaders
// only build the SQL WHERE and pass plain rows through.
// ---------------------------------------------------------------------------

/** The FunnelRow slice the 09-01 derivation core consumes. */
const FUNNEL_ORDER_SELECT = {
  id: true,
  status: true,
  createdAt: true,
  paidAt: true,
  provisionedKeyId: true,
  updatedAt: true,
  errorCode: true,
} as const;

/** Funnel block payload (§9): four fixed steps, exact rationals or null. */
export interface FunnelData {
  steps: {
    step: FunnelStep;
    count: number;
    conversion: number | null;
    dropOff: number | null;
  }[];
}

/** Expired block payload — point-in-time, windowHours feeds the copy. */
export interface ExpiredData {
  count: number;
  windowHours: number;
}

/**
 * Every order CREATED inside the period window, any status — pending/paid/
 * provisioning/provisioned/failed/canceled/refunded all entered the funnel at
 * creation; the 09-01 stage predicates classify them (reach-based).
 */
async function loadFunnelOrderRows(period: 7 | 30 | 90): Promise<FunnelRow[]> {
  return prisma.order.findMany({
    where: { createdAt: { gte: mskDayStartInstant(windowStartDay(period)) } },
    select: FUNNEL_ORDER_SELECT,
    orderBy: { createdAt: "asc" },
  });
}

/**
 * Payment funnel over orders created in the last `period` MSK days (ANL-08,
 * D-06). Exact rationals cross the boundary — the component does ×100.
 */
export async function loadFunnel(period: 7 | 30 | 90): Promise<FunnelData> {
  const steps = funnelOf(await loadFunnelOrderRows(period));
  return { steps };
}

/**
 * Pending orders older than the 24h payment window (ANL-11/D-01). POINT-IN-
 * TIME, no period (D-06): a report window would hide today's stuck orders.
 * The bound is an INSTANT compared against the timestamp(3) createdAt column —
 * never a day label (time.ts:9-15 one-day trap). Strict `<`; no status
 * mutation, no enum change.
 */
export async function loadExpired(): Promise<ExpiredData> {
  const windowMs = PAYMENT_WINDOW_MS;
  const count = await prisma.order.count({
    where: { status: "pending", createdAt: { lt: new Date(Date.now() - windowMs) } },
  });
  return { count, windowHours: windowMs / 3_600_000 };
}
