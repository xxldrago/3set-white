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
import { prisma } from "../prisma";
import {
  activeKeysAt,
  arrAt,
  computeArpu,
  computeArppu,
  computeCoverage,
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

  const [history, windowOrders, userCount, payerRows, coverageRows] = await Promise.all([
    loadPaidOrders(),
    prisma.order.findMany({
      where: { status: { in: [...PAID] }, paidAt: { gte: fromInstant } },
      select: { finalAmount: true, balanceUsed: true },
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
    // daily_metrics holds one row per MSK day; the sums are the window's
    // D-08 coverage ledger (NULL provider cost = unknown, never 0).
    prisma.$queryRaw<{ known: number; total: number }[]>`
      SELECT COALESCE(SUM(provider_cost_orders), 0)::int AS known,
             COALESCE(SUM(paid_orders), 0)::int AS total
      FROM daily_metrics
      WHERE day >= ${fromDay}::date
    `,
  ]);

  let windowCash = 0;
  for (const row of windowOrders) windowCash += cashOf(row);

  const arpuDenominator = userCount;
  const arppuDenominator = payerRows[0]?.payers ?? 0;
  const coverageKnown = coverageRows[0]?.known ?? 0;
  const coverageTotal = coverageRows[0]?.total ?? 0;

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
 * The waterfall's window: trailing MSK calendar months ending with the
 * CURRENT month, at most 6 slots and never more MSK months than the business
 * has existed (months since the first paid order, minimum 1 — a brand-new
 * install renders a single current-month slot, which the UI turns into the
 * §5.4 empty state; a month with no activity inside the window keeps its
 * slot).
 */
export async function loadWaterfall(): Promise<{ months: WaterfallRow[] }> {
  const orders = await loadPaidOrders();
  const currentMonth = mskMonthLabel(mskDayLabel(new Date()));

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
