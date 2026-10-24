// Pure unit vectors for lib/analytics/economics.ts (ANL-05/13/14, no DB):
// LTV gross/predictive/net, margin / margin% / cost-per-key, burn/runway
// gates, and the A1 lost-MRR money base. Exact rationals — no rounding.
import { describe, expect, it } from "vitest";
import {
  burnPerDayOf,
  costPerKeyOf,
  grossMarginOf,
  lostMrrOf,
  ltvGrossHistorical,
  ltvNet,
  ltvPredictive,
  marginPctOf,
  runwayDaysOf,
} from "../../lib/analytics/economics";

describe("analytics/economics — LTV gross historical (D-01)", () => {
  it("ltvGrossHistorical(21000, 3) → 7000; (0, 0) → null; (5000, 1) → 5000", () => {
    expect(ltvGrossHistorical(21000, 3)).toBe(7000);
    expect(ltvGrossHistorical(0, 0)).toBeNull();
    expect(ltvGrossHistorical(5000, 1)).toBe(5000);
  });
});

describe("analytics/economics — LTV predictive (D-02)", () => {
  it("ltvPredictive(900, 0.04) → 22500; null/0 churn → null (never ∞)", () => {
    expect(ltvPredictive(900, 0.04)).toBe(22500);
    expect(ltvPredictive(900, null)).toBeNull();
    expect(ltvPredictive(900, 0)).toBeNull();
    expect(ltvPredictive(null, 0.04)).toBeNull();
  });
});

describe("analytics/economics — LTV net (D-03)", () => {
  it("ltvNet(5600, 2) → 2800; (0, 0) → null", () => {
    expect(ltvNet(5600, 2)).toBe(2800);
    expect(ltvNet(0, 0)).toBeNull();
  });
});

describe("analytics/economics — gross margin (D-11/D-13)", () => {
  it("grossMarginOf: positive, wallet-only negative, zero-costed null", () => {
    expect(grossMarginOf(10000, 4000, 3)).toBe(6000);
    // fully wallet-covered order is a legal negative-margin row (D-13)
    expect(grossMarginOf(0, 3000, 1)).toBe(-3000);
    expect(grossMarginOf(0, 0, 0)).toBeNull();
  });
});

describe("analytics/economics — margin % (D-11)", () => {
  it("marginPctOf: 0.6; null when costed Σcash === 0; null when no costed", () => {
    expect(marginPctOf(10000, 4000, 3)).toBe(0.6);
    // wallet-only: cashSum === 0 → null (no % base), not −∞
    expect(marginPctOf(0, 3000, 1)).toBeNull();
    expect(marginPctOf(0, 0, 0)).toBeNull();
  });
});

describe("analytics/economics — cost per key (D-12)", () => {
  it("costPerKeyOf(9000, 3) → 3000; (0, 0) → null", () => {
    expect(costPerKeyOf(9000, 3)).toBe(3000);
    expect(costPerKeyOf(0, 0)).toBeNull();
  });
});

describe("analytics/economics — burn gates (D-14)", () => {
  it("full coverage + ≥7 days → burn; coverage/day/empty gates → null; real zero → 0", () => {
    expect(burnPerDayOf(93000, 30, 30, 30)).toBe(3100);
    expect(burnPerDayOf(93000, 30, 29, 30)).toBeNull(); // coverage < 100 %
    expect(burnPerDayOf(93000, 30, 30, 6)).toBeNull(); // distinctDays < 7
    expect(burnPerDayOf(93000, 30, 30, 7)).toBe(3100); // ≥ 7 inclusive
    expect(burnPerDayOf(0, 30, 30, 7)).toBe(0); // real zero, not null
    expect(burnPerDayOf(0, 0, 0, 0)).toBeNull(); // no window orders
  });
});

describe("analytics/economics — runway (D-15)", () => {
  it("floor on exact burn; no-burn / no-balance reasons", () => {
    expect(runwayDaysOf(412000, 3100)).toEqual({ days: 132, reason: null });
    expect(runwayDaysOf(412000, 0)).toEqual({ days: null, reason: "no-burn" });
    expect(runwayDaysOf(null, 3100)).toEqual({ days: null, reason: "no-balance" });
    expect(runwayDaysOf(412000, null)).toEqual({ days: null, reason: "no-burn" });
  });

  it("floor-on-exact-burn: 100000/3000 → 33 (not 30 from a display-rounded 3333)", () => {
    // Pitfall 7: runway must use the exact burn, never a pre-rounded display value.
    // floor(100000 / 3000) = 33; floor(100000 / 3333) = 30 — assert 33 pins exactness.
    expect(runwayDaysOf(100000, 3000)).toEqual({ days: 33, reason: null });
    expect(runwayDaysOf(100000, 3333).days).toBe(30); // contrast only
  });
});

describe("analytics/economics — lostMrrOf (A1 / D-07 literal)", () => {
  it("finalAmount × 30 / days — never cashOf", () => {
    expect(lostMrrOf({ finalAmount: 3000, days: 30 })).toBe(3000);
    expect(lostMrrOf({ finalAmount: 900, days: 90 })).toBe(300);
  });
});

describe("analytics/economics — providerCost null never zero-filled", () => {
  it("zero costedOrders propagates null through margin/cost helpers (D-11/D-12)", () => {
    // Callers filter providerCost !== null before summing; a pre-Phase-7
    // window yields costedOrders = 0 and every costed metric is null.
    expect(grossMarginOf(0, 0, 0)).toBeNull();
    expect(marginPctOf(0, 0, 0)).toBeNull();
    expect(costPerKeyOf(0, 0)).toBeNull();
    expect(ltvNet(0, 0)).toBeNull();
  });
});
