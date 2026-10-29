// Cohort retention & revenue matrices — PURE module (no Prisma, no next/*,
// no React). Every number the Phase 10 cohort blocks display derives from
// these functions; the DB loaders (service.ts) own user/order filtering and
// hand this layer plain rows.
//
// Decisions (10-CONTEXT.md):
//   D-01  Registration cohort = all users registered in the MSK month M
//         (User.createdAt). Retention in relative month N: user has >=1 paid
//         (non-trial) key whose coverage (paidAt + days) intersects calendar
//         month M+N. Trial keys excluded. Gaps stay empty ("—", null).
//   D-02  Payer cohort month = MSK month of first paid order (min paidAt among
//         paid/provisioning/provisioned). Membership fixed forever.
//   D-03  Revenue retention = Σ cash of orders paid in month M+N by cohort
//         members ÷ Σ cash of orders paid in the first paid month (M0) of the
//         same cohort. cash = finalAmount − balanceUsed. All orders of the
//         cohort (new/renew/upgrade). Denominator = first paid month.
//   D-04  Matrix size = 12 cohort months × 12 relative offsets (M0..M11).
//   D-05  Return after a gap: only months with active coverage are retained;
//         gaps empty; payer cohort never moves.
//   D-06  Only paid keys (isTrial = false) count.
//   D-07/D-08/D-09  Channel derived on the fly: referral > promo > organic.
//   D-10/D-11/D-12 Device count = Order.devices of first paid order; buckets
//         1/2/3/4/5+; applies only to payer matrices.
//   D-13  Matrices independent of ?period — always 12×12.
//   D-17  Month/cohort boundaries in Europe/Moscow (+03:00).
//
// Coverage granularity (A1): use buildKeyTermEvents-style individual spans
// (one per chain op) so gaps between renewals stay unmarked — NOT the
// KeyTerm aggregate span, which collapses gaps.
import { addMonths, mskDayLabel, mskMonthLabel } from "./time";

/** D-04 — fixed matrix size on both axes. */
export const COHORT_MONTHS = 12;

/** Acquisition channel (D-07/D-08/D-09). */
export type Channel = "referral" | "promo" | "organic";
export type ChannelFilter = "all" | Channel;

/** Device-count bucket (D-11). */
export type DeviceBucket = "1" | "2" | "3" | "4" | "5+";
export type DeviceFilter = "all" | DeviceBucket;

/** The user slice the loaders hand to these pure derivations. */
export interface CohortUser {
  id: number;
  createdAt: Date;
  referredById: number | null;
  pendingPromo: string | null;
}

/**
 * Channel classification (D-07/D-08/D-09). Priority referral > promo: a user
 * with referredById != null is referral even if they also have a promo order.
 * `hasPromoOrder` is true when any of the user's paid orders carries a
 * promoCode.
 */
export function channelOf(user: CohortUser, hasPromoOrder: boolean): Channel {
  if (user.referredById != null) return "referral"; // D-08 priority
  if (user.pendingPromo != null || hasPromoOrder) return "promo";
  return "organic";
}

/** Device-count bucket from a raw device count (D-10/D-11). */
export function deviceBucketOf(devices: number): DeviceBucket {
  if (devices <= 1) return "1";
  if (devices === 2) return "2";
  if (devices === 3) return "3";
  if (devices === 4) return "4";
  return "5+";
}

/** One registration cohort row: month + size + 12 retained counts (null = gap/unreachable). */
export interface RegistrationCohort {
  month: string; // "YYYY-MM-01" MSK
  size: number;
  retained: (number | null)[]; // length COHORT_MONTHS; null = not reachable or no data
}

export interface RegistrationCohortInput {
  users: CohortUser[];
  // paid non-trial coverage spans (one per chain op, from buildKeyTermEvents)
  terms: { userId: number; termStart: Date; termEnd: Date }[];
  // paid orders (any status in paid/provisioning/provisioned) — used for promo detection
  orders: { userId: number; promoCode: string | null }[];
  now: Date;
}

/** One payer (revenue) cohort row. */
export interface PayerCohort {
  month: string; // "YYYY-MM-01" MSK
  size: number;
  baseRevenue: number | null; // cash of M0 (the denominator)
  revenue: (number | null)[]; // length COHORT_MONTHS; cash per offset month; null = unreachable
}

export interface PayerCohortInput {
  users: CohortUser[];
  orders: { userId: number; paidAt: Date; cash: number; devices: number; promoCode: string | null }[];
  now: Date;
}

/**
 * Trailing COHORT_MONTHS MSK month labels ending with the current month
 * (oldest first, current month last). Empty cohorts still occupy a slot so
 * the grid shape stays stable (UI-SPEC deviation from D-04's literal reading).
 */
export function trailingCohortMonths(now: Date): string[] {
  const current = mskMonthLabel(mskDayLabel(now));
  const out: string[] = [];
  for (let i = COHORT_MONTHS - 1; i >= 0; i--) {
    out.push(addMonths(current, -i));
  }
  return out; // oldest first, current month last
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Mark every MSK month label from termStart through termEnd-1ms inclusive. */
function activeMonths(termStart: Date, termEnd: Date): Set<string> {
  const out = new Set<string>();
  if (termEnd.getTime() <= termStart.getTime()) return out;
  const lastActive = new Date(termEnd.getTime() - 1);
  let cursor = mskMonthLabel(mskDayLabel(termStart));
  const last = mskMonthLabel(mskDayLabel(lastActive));
  while (cursor <= last) {
    out.add(cursor);
    cursor = addMonths(cursor, 1);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Registration cohorts (COH-01, COH-03)
// ---------------------------------------------------------------------------

export function buildRegistrationCohorts(
  input: RegistrationCohortInput,
  channelFilter: ChannelFilter,
): RegistrationCohort[] {
  const { users, terms, orders, now } = input;
  const currentMonth = mskMonthLabel(mskDayLabel(now));
  const months = trailingCohortMonths(now);

  // promo detection per user (D-07)
  const promoByUser = new Set<number>();
  for (const o of orders) {
    if (o.promoCode != null) promoByUser.add(o.userId);
  }

  // terms grouped by user
  const termsByUser = new Map<number, { termStart: Date; termEnd: Date }[]>();
  for (const t of terms) {
    const list = termsByUser.get(t.userId) ?? [];
    list.push({ termStart: t.termStart, termEnd: t.termEnd });
    termsByUser.set(t.userId, list);
  }

  // active-month set per user
  const userActiveMonths = new Map<number, Set<string>>();
  for (const u of users) {
    const spans = termsByUser.get(u.id) ?? [];
    const active = new Set<string>();
    for (const s of spans) {
      const am = activeMonths(s.termStart, s.termEnd);
      for (const m of am) active.add(m);
    }
    userActiveMonths.set(u.id, active);
  }

  function channelFor(u: CohortUser): Channel {
    return channelOf(u, promoByUser.has(u.id));
  }

  // group users by cohort month, applying channel filter
  const cohortUsersByMonth = new Map<string, CohortUser[]>();
  for (const u of users) {
    if (channelFilter !== "all" && channelFor(u) !== channelFilter) continue;
    const cm = mskMonthLabel(mskDayLabel(u.createdAt));
    const list = cohortUsersByMonth.get(cm) ?? [];
    list.push(u);
    cohortUsersByMonth.set(cm, list);
  }

  return months.map((month) => {
    const cohortUsers = cohortUsersByMonth.get(month) ?? [];
    const size = cohortUsers.length;
    if (size === 0) {
      return { month, size: 0, retained: Array(COHORT_MONTHS).fill(null) };
    }
    const retained: (number | null)[] = [];
    for (let o = 0; o < COHORT_MONTHS; o++) {
      const targetMonth = addMonths(month, o);
      if (targetMonth > currentMonth) {
        retained.push(null);
        continue;
      }
      let count = 0;
      for (const u of cohortUsers) {
        if (userActiveMonths.get(u.id)?.has(targetMonth)) count += 1;
      }
      retained.push(count);
    }
    return { month, size, retained };
  });
}

// ---------------------------------------------------------------------------
// Payer (revenue) cohorts (COH-02, COH-04, COH-05)
// ---------------------------------------------------------------------------

export function buildPayerCohorts(
  input: PayerCohortInput,
  channelFilter: ChannelFilter,
  deviceFilter: DeviceFilter,
): PayerCohort[] {
  const { users, orders, now } = input;
  const currentMonth = mskMonthLabel(mskDayLabel(now));
  const months = trailingCohortMonths(now);

  // group paid orders by user
  const ordersByUser = new Map<number, typeof orders>();
  for (const o of orders) {
    const list = ordersByUser.get(o.userId) ?? [];
    list.push(o);
    ordersByUser.set(o.userId, list);
  }

  // first paid order per user (by paidAt asc)
  const userFirstPaid = new Map<number, (typeof orders)[number]>();
  const userHasPromo = new Set<number>();
  for (const u of users) {
    const uOrders = ordersByUser.get(u.id);
    if (!uOrders || uOrders.length === 0) continue;
    const sorted = [...uOrders].sort((a, b) => a.paidAt.getTime() - b.paidAt.getTime());
    userFirstPaid.set(u.id, sorted[0]!);
    if (uOrders.some((o) => o.promoCode != null)) userHasPromo.add(u.id);
  }

  // channel + device bucket per user (only users with paid orders)
  const userChannel = new Map<number, Channel>();
  const userDeviceBucket = new Map<number, DeviceBucket>();
  const userFirstPaidMonth = new Map<number, string>();
  for (const [uid, first] of userFirstPaid) {
    const u = users.find((x) => x.id === uid);
    if (!u) continue;
    userChannel.set(uid, channelOf(u, userHasPromo.has(uid)));
    userDeviceBucket.set(uid, deviceBucketOf(first.devices));
    userFirstPaidMonth.set(uid, mskMonthLabel(mskDayLabel(first.paidAt)));
  }

  // filter user ids by channel + device
  const eligibleUsers = new Set<number>();
  for (const uid of userFirstPaid.keys()) {
    if (channelFilter !== "all" && userChannel.get(uid) !== channelFilter) continue;
    if (deviceFilter !== "all" && userDeviceBucket.get(uid) !== deviceFilter) continue;
    eligibleUsers.add(uid);
  }

  // group eligible users by first-paid month
  const cohortUsersByMonth = new Map<string, Set<number>>();
  for (const uid of eligibleUsers) {
    const fm = userFirstPaidMonth.get(uid)!;
    const set = cohortUsersByMonth.get(fm) ?? new Set<number>();
    set.add(uid);
    cohortUsersByMonth.set(fm, set);
  }

  // revenue per user-month: sum cash of paid orders by cohort members paid in that month
  // Build a lookup: for each cohort month, for each offset target month, sum cash.
  return months.map((month) => {
    const cohortUserSet = cohortUsersByMonth.get(month);
    if (!cohortUserSet || cohortUserSet.size === 0) {
      return { month, size: 0, baseRevenue: null, revenue: Array(COHORT_MONTHS).fill(null) };
    }
    const size = cohortUserSet.size;

    // baseRevenue = M0 cash
    let baseRevenue = 0;
    for (const uid of cohortUserSet) {
      const uOrders = ordersByUser.get(uid) ?? [];
      for (const o of uOrders) {
        if (mskMonthLabel(mskDayLabel(o.paidAt)) === month) baseRevenue += o.cash;
      }
    }

    const revenue: (number | null)[] = [];
    for (let o = 0; o < COHORT_MONTHS; o++) {
      const targetMonth = addMonths(month, o);
      if (targetMonth > currentMonth) {
        revenue.push(null);
        continue;
      }
      let sum = 0;
      for (const uid of cohortUserSet) {
        const uOrders = ordersByUser.get(uid) ?? [];
        for (const o of uOrders) {
          if (mskMonthLabel(mskDayLabel(o.paidAt)) === targetMonth) sum += o.cash;
        }
      }
      revenue.push(sum);
    }

    return { month, size, baseRevenue, revenue };
  });
}
