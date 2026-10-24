// LTV / margin / cost-per-key / burn / runway arithmetic — PURE module
// (no Prisma, no next/*, no React). Every number Phase 8 unit-economics
// cards display derives from these functions.
//
// Money bases:
//   - LTV gross / net / margin use cash = cashOf (series.ts) — imported, never
//     re-derived (D-01/D-13). Callers pass pre-aggregated sums; this module
//     never walks rows except lostMrrOf's single-op finalAmount base.
//   - lostMrr / revenue-churn money base is the D-07 literal
//     finalAmount × 30 / days (A1), DISTINCT from cashOf. A fully
//     wallet-covered churned term still contributes its finalAmount
//     equivalent.
//
// Division guards follow mrr.ts house style (`denominator === 0 ? null : …`);
// never `value || 0` (erases a real zero). No rounding anywhere — whole-ruble
// Math.round and ×100 percent formatting live only in render components
// (Pitfall 7).
//
// Burn/runway gates (D-14/D-15): burn is null unless windowOrders > 0 AND
// costedOrders === windowOrders AND distinctDays >= 7 (inclusive). A real
// zero cost sum yields burn = 0, not null. runwayDays floors balance ÷ the
// exact burnPerDay (never a display-rounded value); reasons: 'no-burn' when
// burn null or <= 0, 'no-balance' when balance null.
//
// providerCost nulls are NEVER zero-filled here — callers filter the costed
// subset before summing; zero costedOrders propagates null (D-11/D-12).

/** LTV gross historical: Σ cash / DISTINCT payers. null when payers = 0 (D-01). */
export function ltvGrossHistorical(cashTotal: number, payers: number): number | null {
  return payers === 0 ? null : cashTotal / payers;
}

/**
 * LTV predictive: ARPPU(30) ÷ logo churn rate(30). null when either input is
 * null or churnRate30 === 0 — «—», never ∞ (D-02).
 */
export function ltvPredictive(
  arppu30: number | null,
  churnRate30: number | null,
): number | null {
  if (arppu30 === null || churnRate30 === null || churnRate30 === 0) return null;
  return arppu30 / churnRate30;
}

/** LTV net: Σ(cash − cost) / costed payers. null when costedPayers = 0 (D-03). */
export function ltvNet(cashMinusCost: number, costedPayers: number): number | null {
  return costedPayers === 0 ? null : cashMinusCost / costedPayers;
}

/**
 * Gross margin over the costed subset: cashSum − costSum. null when no costed
 * orders (D-11). Wallet-only rows (cash 0, cost > 0) yield a legal negative.
 */
export function grossMarginOf(
  cashSum: number,
  costSum: number,
  costedOrders: number,
): number | null {
  return costedOrders === 0 ? null : cashSum - costSum;
}

/**
 * Margin % = (cash − cost) / cash over the costed subset. null when no costed
 * orders OR costed Σcash === 0 (D-11) — a wallet-only window has no % base.
 */
export function marginPctOf(
  cashSum: number,
  costSum: number,
  costedOrders: number,
): number | null {
  if (costedOrders === 0 || cashSum === 0) return null;
  return (cashSum - costSum) / cashSum;
}

/** Average provider cost per costed order (D-12). null when costedOrders = 0. */
export function costPerKeyOf(costSum: number, costedOrders: number): number | null {
  return costedOrders === 0 ? null : costSum / costedOrders;
}

/**
 * Burn per day over a fixed 30-MSK-day window (D-14). null unless the window
 * has orders, 100 % cost coverage, and ≥ 7 distinct costed days (inclusive).
 * Real zero cost sum → 0 (not null).
 */
export function burnPerDayOf(
  costSum: number,
  windowOrders: number,
  costedOrders: number,
  distinctDays: number,
): number | null {
  if (!(windowOrders > 0 && costedOrders === windowOrders && distinctDays >= 7)) {
    return null;
  }
  return costSum / 30;
}

export type RunwayReason = "no-burn" | "no-balance" | null;

/**
 * Runway in whole days: floor(balance / exact burnPerDay) (D-15, Pitfall 7).
 * reason 'no-burn' when burn null or ≤ 0; 'no-balance' when balance null.
 */
export function runwayDaysOf(
  balance: number | null,
  burnPerDay: number | null,
): { days: number | null; reason: RunwayReason } {
  if (burnPerDay === null || burnPerDay <= 0) {
    return { days: null, reason: "no-burn" };
  }
  if (balance === null) {
    return { days: null, reason: "no-balance" };
  }
  return { days: Math.floor(balance / burnPerDay), reason: null };
}

/**
 * Lost-MRR contribution of one churned term op (A1 / D-07 literal):
 * finalAmount × 30 / days. Never cashOf — wallet-covered terms still count.
 */
export function lostMrrOf(op: { finalAmount: number; days: number | null }): number {
  return (op.finalAmount * 30) / (op.days as number);
}
