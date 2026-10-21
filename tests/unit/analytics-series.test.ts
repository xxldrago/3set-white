// Pure unit vectors for lib/analytics/series.ts (ANL-15, no DB): exact MSK-day
// bucketing of paid orders / new users / goodwill days, the per-key term chain
// (new starts at paidAt, renew extends, upgrade rides along), end-of-day
// activity (t >= termEnd → inactive), and the [fromDay, toDay] window.
import { describe, expect, it } from "vitest";
import {
  buildDailySeries,
  buildKeyTerms,
  cashOf,
  nextDayLabel,
  type PaidOrderRow,
} from "../../lib/analytics/series";

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

// Fixture spans MSK days 2026-05-10 … 2026-05-12 plus out-of-range flanks.
function fixtureOrders(): PaidOrderRow[] {
  return [
    // Before the window: key k0 bought a month earlier, still active through
    // the whole window — activeKeys must see it, money counters must not emit.
    row({
      id: "o0",
      days: 365,
      provisionedKeyId: "k0",
      finalAmount: 3000,
      paidAt: new Date("2026-04-12T09:00:00.000Z"),
    }),
    // Day 1: new key k1, cash 700 (1000 − 300), cost known.
    row({
      id: "o1",
      kind: "new",
      provisionedKeyId: "k1",
      finalAmount: 1000,
      balanceUsed: 300,
      providerCost: 400,
      paidAt: new Date("2026-05-10T09:00:00.000Z"),
    }),
    // Day 1: one-day key k5 — termEnd passes before the NEXT day's end.
    row({
      id: "o6",
      kind: "new",
      provisionedKeyId: "k5",
      days: 1,
      finalAmount: 100,
      paidAt: new Date("2026-05-10T05:00:00.000Z"),
    }),
    // Day 2: k1 renewal, fully balance-covered → cash 0.
    row({
      id: "o2",
      kind: "renew",
      keyId: "k1",
      finalAmount: 800,
      balanceUsed: 800,
      providerCost: null,
      paidAt: new Date("2026-05-11T12:00:00.000Z"),
    }),
    // Day 2: upgrade on k1 — days NULL, cash 500, cost known.
    row({
      id: "o3",
      kind: "upgrade",
      keyId: "k1",
      days: null,
      finalAmount: 500,
      providerCost: 150,
      paidAt: new Date("2026-05-11T14:00:00.000Z"),
    }),
    // Day 3: new key k2, cash 2000, cost NOT known (pre-capture order, D-08).
    row({
      id: "o4",
      kind: "new",
      provisionedKeyId: "k2",
      days: 90,
      finalAmount: 2000,
      paidAt: new Date("2026-05-12T09:00:00.000Z"),
    }),
    // After the window: emitted nowhere, never active on in-range days.
    row({
      id: "o5",
      provisionedKeyId: "k3",
      paidAt: new Date("2026-05-13T09:00:00.000Z"),
    }),
  ];
}

const FROM_DAY = "2026-05-10";
const TO_DAY = "2026-05-12";

describe("analytics/series — buildDailySeries", () => {
  it("buckets paid orders, users and goodwill into exact MSK-day aggregates", () => {
    const series = buildDailySeries(
      fixtureOrders(),
      [
        { createdAt: new Date("2026-05-10T09:00:00.000Z") },
        { createdAt: new Date("2026-05-12T15:00:00.000Z") },
        // day outside the window — not emitted as newUsers
        { createdAt: new Date("2026-05-09T09:00:00.000Z") },
      ],
      [
        { at: new Date("2026-05-11T10:00:00.000Z"), days: 3 },
        { at: new Date("2026-05-12T10:00:00.000Z"), days: 1 },
      ],
      FROM_DAY,
      TO_DAY,
    );

    expect(series).toHaveLength(3);
    expect(series.map((d) => d.day)).toEqual([FROM_DAY, "2026-05-11", TO_DAY]);

    // Term ledger at end-of-day: k0 + k1 (+ k5 on day 1) (+ k2 from day 3).
    expect(series[0]).toEqual({
      day: FROM_DAY,
      paidOrders: 2, // o1 + o6
      paidCashRub: 700 + 100,
      newOrders: 2,
      renewOrders: 0,
      upgradeOrders: 0,
      providerCostRub: 400,
      providerCostOrders: 1,
      activeKeys: 3, // k0, k1, k5 (k5 expires 05-11T05:00Z — after day 1's end)
      newUsers: 1,
      goodwillDays: 0,
    });
    expect(series[1]).toEqual({
      day: "2026-05-11",
      paidOrders: 2, // o2 (cash 0) + o3
      paidCashRub: 500,
      newOrders: 0,
      renewOrders: 1,
      upgradeOrders: 1,
      providerCostRub: 150, // o2's NULL cost adds nothing
      providerCostOrders: 1,
      activeKeys: 2, // k0, k1 — k5 expired at 05:00Z, before end-of-day
      newUsers: 0,
      goodwillDays: 3,
    });
    expect(series[2]).toEqual({
      day: TO_DAY,
      paidOrders: 1,
      paidCashRub: 2000,
      newOrders: 1,
      renewOrders: 0,
      upgradeOrders: 0,
      providerCostRub: 0,
      providerCostOrders: 0, // o4's NULL coverage is visible, not faked
      activeKeys: 3, // k0, k1, k2 (active from its paidAt)
      newUsers: 1,
      goodwillDays: 1,
    });
  });

  it("never emits a day outside [fromDay, toDay] and rejects a reversed range", () => {
    const days = buildDailySeries(fixtureOrders(), [], [], FROM_DAY, TO_DAY).map((d) => d.day);
    expect(days).not.toContain("2026-05-09");
    expect(days).not.toContain("2026-05-13");
    expect(buildDailySeries(fixtureOrders(), [], [], TO_DAY, FROM_DAY)).toEqual([]);
  });

  it("counts a key bought before the window as active but not in its money counters", () => {
    const series = buildDailySeries(fixtureOrders(), [], [], FROM_DAY, FROM_DAY);
    expect(series[0]!.activeKeys).toBe(3); // includes o0 (k0, paid 04-12)
    expect(series[0]!.paidOrders).toBe(2); // o0's money stays on its own (unemitted) day
  });
});

describe("analytics/series — buildKeyTerms", () => {
  it("chains new → renew (extension, never restart) and records the upgrade", () => {
    const terms = buildKeyTerms(fixtureOrders());
    expect(terms.size).toBe(5); // k0..k3, k5 — orders without a key ref are skipped

    const k1 = terms.get("k1")!;
    expect(k1.base.id).toBe("o1"); // the kind=new op with keyId still NULL
    expect(k1.termStart).toEqual(new Date("2026-05-10T09:00:00.000Z"));
    // renew at 05-11T12:00 extends the 05-10T09:00 expiry: 06-09T09:00 + 30d.
    expect(k1.termEnd).toEqual(new Date("2026-07-09T09:00:00.000Z"));
    expect(k1.upgrades.map((u) => u.id)).toEqual(["o3"]); // days never lengthen the chain

    const k0 = terms.get("k0")!;
    expect(k0.termEnd).toEqual(new Date("2027-04-12T09:00:00.000Z"));
    expect(k0.upgrades).toEqual([]);
  });
});

describe("analytics/series — end-of-day activity", () => {
  it("marks t >= termEnd as inactive and a key active only from its paidAt", () => {
    const single = row({
      id: "solo",
      provisionedKeyId: "solo",
      days: 1,
      paidAt: new Date("2026-05-10T05:00:00.000Z"),
    });
    const s = buildDailySeries([single], [], [], "2026-05-10", "2026-05-11");
    expect(s.map((d) => d.activeKeys)).toEqual([1, 0]); // term passes at 05-11T05:00Z

    const future = row({
      id: "later",
      provisionedKeyId: "later",
      paidAt: new Date("2026-05-12T09:00:00.000Z"),
    });
    const f = buildDailySeries([future], [], [], "2026-05-11", "2026-05-12");
    expect(f.map((d) => d.activeKeys)).toEqual([0, 1]); // not active before it was paid
  });
});

describe("analytics/series — helpers", () => {
  it("keeps cash never negative and steps day labels", () => {
    expect(cashOf({ finalAmount: 100, balanceUsed: 400 })).toBe(0);
    expect(cashOf({ finalAmount: 700, balanceUsed: 300 })).toBe(400);
    expect(nextDayLabel("2026-05-10")).toBe("2026-05-11");
    expect(nextDayLabel("2026-12-31")).toBe("2027-01-01");
  });
});
