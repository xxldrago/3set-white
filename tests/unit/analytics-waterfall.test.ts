// Pure unit vectors for lib/analytics/waterfall.ts (ANL-02, no DB): the
// month-end snapshot model over MSK calendar months (D-15), deterministic
// classification (new / expansion / contraction / churned / neither), the
// exact reconciliation identity new + expansion − contraction − churned =
// ΔMRR asserted for EVERY sampled month pair, an empty month yielding a
// truthful all-zero row, and an upgrade landing exactly in the month its
// paidAt falls.
import { describe, expect, it } from "vitest";
import { waterfallForMonth, waterfallForMonths } from "../../lib/analytics/waterfall";
import { totalMrrAt } from "../../lib/analytics/mrr";
import { addMonths, mskDayStartInstant } from "../../lib/analytics/time";
import type { PaidOrderRow } from "../../lib/analytics/series";

function row(overrides: Partial<PaidOrderRow> & Pick<PaidOrderRow, "paidAt">): PaidOrderRow {
  return {
    id: "o",
    userId: 1,
    kind: "new",
    days: 30,
    devices: 2,
    finalAmount: 1000,
    balanceUsed: 0,
    providerCost: null,
    keyId: null,
    provisionedKeyId: "k",
    status: "paid",
    ...overrides,
  };
}

/**
 * Fixture spanning MSK months 2026-05 … 2026-11 with every classification
 * exercised. All monthly-equivalent values are exact integers (terms of 30/90/
 * 180 days, upgrade remainders of 15/60 days), so the reconciliation identity
 * holds EXACTLY in IEEE float, no epsilon safety needed.
 *
 *  kA new 06-15, 30d, 3000 → 3000/mo, dies 07-15        → new 06, churned 07
 *  kB new 06-20, 90d, 5400 → 1800/mo; renew 08-10, 30d, 2700
 *      → new 06, neither 07, expansion 08 (1800→2700), churned 10 (dies 10-18)
 *  kC new 07-05, 30d, 3000; upgrade 07-20 cash 1500 (15 days left → ×1)
 *      → new 07 after=4500, churned 08 (dies 08-04)
 *  kD new 08-08, 30d, 3000; renew 09-05 final 3000 / balance 2700 (cash 300)
 *      → new 08, contraction 09 (3000→300), churned 10 (dies 10-07)
 *  kE new 06-10, 90d, 9000 → 3000/mo; promo renew 09-01, 30d, cash 90
 *      → new 06, contraction 09 (3000→90), churned 10 (dies 10-08)
 *  kF new 05-20, 180d, 18000 → 3000/mo, dies 11-16      → new 06 (zero
 *      baseline of the first sampled month), neither 07/08/09/10
 */
function fixtureOrders(): PaidOrderRow[] {
  return [
    row({ id: "fA", kind: "new", provisionedKeyId: "kA", days: 30, finalAmount: 3000, paidAt: new Date("2026-06-15T09:00:00.000Z") }),
    row({ id: "fB1", kind: "new", provisionedKeyId: "kB", days: 90, finalAmount: 5400, paidAt: new Date("2026-06-20T09:00:00.000Z") }),
    row({ id: "fB2", kind: "renew", keyId: "kB", days: 30, finalAmount: 2700, paidAt: new Date("2026-08-10T09:00:00.000Z") }),
    row({ id: "fC1", kind: "new", provisionedKeyId: "kC", days: 30, finalAmount: 3000, paidAt: new Date("2026-07-05T09:00:00.000Z") }),
    row({ id: "fC2", kind: "upgrade", keyId: "kC", days: null, finalAmount: 1500, paidAt: new Date("2026-07-20T09:00:00.000Z") }),
    row({ id: "fD1", kind: "new", provisionedKeyId: "kD", days: 30, finalAmount: 3000, paidAt: new Date("2026-08-08T09:00:00.000Z") }),
    row({ id: "fD2", kind: "renew", keyId: "kD", days: 30, finalAmount: 3000, balanceUsed: 2700, paidAt: new Date("2026-09-05T09:00:00.000Z") }),
    row({ id: "fE1", kind: "new", provisionedKeyId: "kE", days: 90, finalAmount: 9000, paidAt: new Date("2026-06-10T09:00:00.000Z") }),
    row({ id: "fE2", kind: "renew", keyId: "kE", days: 30, finalAmount: 90, paidAt: new Date("2026-09-01T09:00:00.000Z") }),
    row({ id: "fF", kind: "new", provisionedKeyId: "kF", days: 180, finalAmount: 18000, paidAt: new Date("2026-05-20T09:00:00.000Z") }),
  ];
}

const LABELS = ["2026-06-01", "2026-07-01", "2026-08-01", "2026-09-01", "2026-10-01"];

/** Last instant of the MSK month, mirroring the module's own window math. */
function endOf(monthLabel: string): Date {
  return new Date(mskDayStartInstant(addMonths(monthLabel, 1)).getTime() - 1);
}

describe("analytics/waterfall — reconciliation identity (ANL-02)", () => {
  it("new + expansion − contraction − churned equals ΔMRR EXACTLY for every sampled month pair", () => {
    const rows = waterfallForMonths(LABELS, fixtureOrders());
    let prevTotal = 0; // first month: all-zero baseline
    for (let i = 0; i < LABELS.length; i++) {
      const r = rows[i]!;
      expect(r.net).toBe(r.new + r.expansion - r.contraction - r.churned); // internal consistency
      const total = totalMrrAt(fixtureOrders(), endOf(LABELS[i]!));
      expect(r.net).toBe(total - prevTotal); // the identity, exact — a key in two buckets or none fails here
      prevTotal = total;
    }
    // Δ sums to the full-window trajectory
    expect(prevTotal).toBe(3000); // Oct end: only kF alive
  });

  it("waterfallForMonth with an explicit prev label reproduces the rolled month", () => {
    const july = waterfallForMonth("2026-07-01", "2026-06-01", fixtureOrders());
    expect(july).toEqual({
      label: "2026-07-01",
      new: 4500, // kC (base 3000 + upgrade spread 1500 rides into the new bucket)
      expansion: 0,
      contraction: 0,
      churned: 3000, // kA died 07-15
      net: 1500,
    });
  });
});

describe("analytics/waterfall — classification edges (ANL-02 adjacency)", () => {
  it("classifies new / expansion / contraction / churned / neither deterministically per month", () => {
    const rows = waterfallForMonths(LABELS, fixtureOrders());
    expect(rows).toEqual([
      { label: "2026-06-01", new: 10800, expansion: 0, contraction: 0, churned: 0, net: 10800 }, // kF, kE, kA, kB — carried-in kF counts as new vs the zero baseline
      { label: "2026-07-01", new: 4500, expansion: 0, contraction: 0, churned: 3000, net: 1500 }, // new kC; churned kA; kB/kE/kF neither
      { label: "2026-08-01", new: 3000, expansion: 900, contraction: 0, churned: 4500, net: -600 }, // new kD; expansion kB (renew 1800→2700); churned kC
      { label: "2026-09-01", new: 0, expansion: 0, contraction: 5610, churned: 0, net: -5610 }, // contraction kD (3000→300, balance-covered) + kE (3000→90, promo)
      { label: "2026-10-01", new: 0, expansion: 0, contraction: 0, churned: 3090, net: -3090 }, // churned kD + kE + kB; kF neither
    ]);
  });

  it("emits the neither bucket when before === after > 0 (no fabricated movement)", () => {
    // kB stays at 1800 between June and July: it must appear in NO bucket.
    const mid = waterfallForMonth("2026-07-01", "2026-06-01", [
      row({ id: "s1", kind: "new", provisionedKeyId: "sK", days: 90, finalAmount: 5400, paidAt: new Date("2026-06-20T09:00:00.000Z") }),
    ]);
    expect(mid).toEqual({ label: "2026-07-01", new: 0, expansion: 0, contraction: 0, churned: 0, net: 0 });
  });
});

describe("analytics/waterfall — empty month", () => {
  it("an empty month (or two) yields all-zero rows with net 0 — slot exists, no fabrication", () => {
    const one = waterfallForMonths(["2026-11-01"], []);
    expect(one).toEqual([{ label: "2026-11-01", new: 0, expansion: 0, contraction: 0, churned: 0, net: 0 }]);

    const pair = waterfallForMonths(["2026-11-01", "2026-12-01"], []);
    expect(pair.map((r) => r.net)).toEqual([0, 0]);
    expect(pair[1]!.new + pair[1]!.expansion - pair[1]!.contraction - pair[1]!.churned).toBe(0);
  });
});

describe("analytics/waterfall — upgrade month-end attribution", () => {
  it("an upgrade lands in the month its paidAt falls, never retroactively in a past month", () => {
    // kG new 08-15, 90d, 7200 (2400/mo, dies 11-13); upgrade 09-14 cash 1600,
    // 60 remaining days → spread 1600/2 = 800.
    const orders = [
      row({ id: "g1", kind: "new", provisionedKeyId: "kG", days: 90, finalAmount: 7200, paidAt: new Date("2026-08-15T09:00:00.000Z") }),
      row({ id: "g2", kind: "upgrade", keyId: "kG", days: null, finalAmount: 1600, paidAt: new Date("2026-09-14T09:00:00.000Z") }),
    ];
    const rows = waterfallForMonths(["2026-08-01", "2026-09-01", "2026-10-01"], orders);
    expect(rows[0]).toEqual({ label: "2026-08-01", new: 2400, expansion: 0, contraction: 0, churned: 0, net: 2400 });
    expect(rows[1]).toEqual({ label: "2026-09-01", new: 0, expansion: 800, contraction: 0, churned: 0, net: 800 });
    expect(rows[2]).toEqual({ label: "2026-10-01", new: 0, expansion: 0, contraction: 0, churned: 0, net: 0 });
  });
});
