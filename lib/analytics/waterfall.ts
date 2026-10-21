// MRR waterfall per MSK calendar month (D-15) — PURE module over paid orders.
//
// Model: take a month-end snapshot S(m) of every key's per-key MRR (the SAME
// mrrAt the KPI uses — one derivation, never a second math), classify each key
// in the union of S(m−1) and S(m), and reconcile:
//
//   before == 0 && after > 0              → new        += after
//   before > 0 && after > before          → expansion  += after − before
//   before > 0 && after > 0 && after < b  → contraction += before − after
//   before > 0 && after == 0              → churned    += before
//   before == after > 0                   → neither bucket (a stable month)
//
//   net = new + expansion − contraction − churned
//   identity: new + expansion − contraction − churned === Σ S(m) − Σ S(m−1)
//   exactly, for every month — asserted by test (T-07-04-03), not commented.
//
// Contraction truth (there is NO downgrade OrderKind — kinds are new /
// renew / upgrade, and upgrades only ADD devices): any contraction observed
// by this module is pricing/promo-driven — a renewal at a lower monthly
// equivalent (shorter term, promo discount) or a balance-covered renewal
// (cashOf = 0 → the segment equivalent drops to/near 0, D-03). A future
// reader must not go looking for a missing downgrade order type.
//
// Snapshots use the last instant of the MSK month:
//   endOfMonth("2026-07-01") = mskDayStartInstant("2026-08-01") − 1ms.
// Keys whose MRR is 0 in a snapshot are simply absent (missing = 0).
import { keyRefOf, mrrAt } from "./mrr";
import type { PaidOrderRow } from "./series";
import { addMonths, mskDayStartInstant } from "./time";

export interface WaterfallRow {
  label: string; // first-of-month MSK label as passed in ("2026-07-01")
  new: number;
  expansion: number;
  contraction: number;
  churned: number;
  net: number;
}

/** Last instant of the MSK month following `monthLabel`. */
function endOfMonth(monthLabel: string): Date {
  return new Date(mskDayStartInstant(addMonths(monthLabel, 1)).getTime() - 1);
}

/** S(m): per-key MRR at the month's end instant — mrrAt per key (one engine). */
function snapshot(orders: PaidOrderRow[], at: Date): Map<string, number> {
  const groups = new Map<string, PaidOrderRow[]>();
  for (const op of orders) {
    const ref = keyRefOf(op);
    if (!ref) continue;
    const group = groups.get(ref);
    if (group) group.push(op);
    else groups.set(ref, [op]);
  }
  const map = new Map<string, number>();
  for (const [ref, ops] of groups) map.set(ref, mrrAt(ops, at));
  return map;
}

/**
 * One waterfall row. `prevLabel` = the previous first-of-month MSK label;
 * pass null for an all-zero baseline (period start — every active key counts
 * as new, there is no earlier snapshot to diff against).
 */
export function waterfallForMonth(
  monthLabel: string,
  prevLabel: string | null,
  orders: PaidOrderRow[],
): WaterfallRow {
  const after = snapshot(orders, endOfMonth(monthLabel));
  const before = prevLabel === null ? new Map<string, number>() : snapshot(orders, endOfMonth(prevLabel));

  let added = 0;
  let expansion = 0;
  let contraction = 0;
  let churned = 0;
  for (const ref of new Set([...before.keys(), ...after.keys()])) {
    const b = before.get(ref) ?? 0;
    const a = after.get(ref) ?? 0;
    if (b === 0 && a > 0) added += a;
    else if (b > 0 && a > b) expansion += a - b;
    else if (b > 0 && a > 0 && a < b) contraction += b - a;
    else if (b > 0 && a === 0) churned += b;
    // b === a > 0 → neither bucket: a stable month for this key.
  }
  return {
    label: monthLabel,
    new: added,
    expansion,
    contraction,
    churned,
    net: added + expansion - contraction - churned,
  };
}

/**
 * Consecutive month pairs; the FIRST month diffs against an all-zero baseline
 * (keys carried in from before the window count as new — the only honest
 * reading when no earlier snapshot exists inside the derivation window).
 */
export function waterfallForMonths(monthLabels: string[], orders: PaidOrderRow[]): WaterfallRow[] {
  const rows: WaterfallRow[] = [];
  let prev: string | null = null;
  for (const label of monthLabels) {
    rows.push(waterfallForMonth(label, prev, orders));
    prev = label;
  }
  return rows;
}
