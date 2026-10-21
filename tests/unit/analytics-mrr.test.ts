// Pure unit vectors for lib/analytics/mrr.ts (ANL-01, no DB): the per-key MRR
// term chain — keyRefOf's COALESCE(keyId, provisionedKeyId) join (Pitfall 3),
// renew EXTENSION semantics (A3), the expiry → 0 boundary, upgrade spread
// through ARTEMIDA's own max(1, remainingDays / 30) rule (Pitfall 4), one key
// = one MRR row renewals never double-count (D-01), cashOf excluding
// balance-covered bonus renewals (D-03) and order-less trials contributing
// nothing (A1).
import { describe, expect, it } from "vitest";
import {
  activeKeysAt,
  arrAt,
  keyRefOf,
  mrrAt,
  totalMrrAt,
} from "../../lib/analytics/mrr";
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

describe("analytics/mrr — keyRefOf (COALESCE join, Pitfall 3)", () => {
  it("resolves keyId ?? provisionedKeyId and null when neither is set", () => {
    expect(keyRefOf({ keyId: "k1", provisionedKeyId: null })).toBe("k1");
    expect(keyRefOf({ keyId: null, provisionedKeyId: "kP" })).toBe("kP");
    expect(keyRefOf({ keyId: null, provisionedKeyId: null })).toBeNull();
  });
});

describe("analytics/mrr — new-via-provisionedKeyId (ANL-01)", () => {
  it("counts a key whose only order is kind=new with keyId still NULL — a strict keyId join would drop it", () => {
    const orders = [
      row({
        id: "o1",
        kind: "new",
        keyId: null,
        provisionedKeyId: "kN",
        days: 30,
        finalAmount: 3000,
        paidAt: new Date("2026-06-10T09:00:00.000Z"),
      }),
    ];
    const t = new Date("2026-06-20T09:00:00.000Z"); // inside the 30-day term
    expect(totalMrrAt(orders, t)).toBe(3000); // 3000 × 30/30
    expect(mrrAt(orders, t)).toBe(3000);
    expect(activeKeysAt(orders, t)).toBe(1);
  });
});

describe("analytics/mrr — renew extension (A3)", () => {
  it("extends the term from the CURRENT expiry, never from the renew's own paidAt", () => {
    const T0 = new Date("2026-06-10T09:00:00.000Z"); // 30-day base → 2026-07-10
    const orders = [
      row({
        id: "o1",
        kind: "new",
        provisionedKeyId: "kR",
        days: 30,
        finalAmount: 3000,
        paidAt: T0,
      }),
      // renew bought 20 days in; same monthly equivalent (cash 3000 / 30d)
      row({
        id: "o2",
        kind: "renew",
        keyId: "kR",
        days: 30,
        finalAmount: 3000,
        paidAt: new Date("2026-06-30T09:00:00.000Z"),
      }),
    ];
    // A RESTART would end the term on 2026-07-30 (renew paidAt + 30d);
    // EXTENSION runs to T0 + 60d = 2026-08-09T09:00Z — active at 08-05.
    const insideExtended = new Date("2026-08-05T09:00:00.000Z");
    expect(totalMrrAt(orders, insideExtended)).toBe(3000); // mrr stays on the base term, single row
    expect(activeKeysAt(orders, insideExtended)).toBe(1);

    const insideFirstMonth = new Date("2026-06-15T09:00:00.000Z");
    expect(activeKeysAt(orders, insideFirstMonth)).toBe(1);

    // after the extended expiry the key is gone
    expect(activeKeysAt(orders, new Date("2026-08-09T09:00:00.001Z"))).toBe(0);
  });
});

describe("analytics/mrr — expiry boundary (ANL-01)", () => {
  it("t === termEnd → 0; termEnd − 1ms → full equivalent; t < termStart → 0", () => {
    const orders = [
      row({
        id: "o1",
        kind: "new",
        provisionedKeyId: "kB",
        days: 30,
        finalAmount: 3000,
        paidAt: new Date("2026-06-10T09:00:00.000Z"),
      }),
    ];
    const termEnd = new Date("2026-07-10T09:00:00.000Z");
    expect(totalMrrAt(orders, termEnd)).toBe(0);
    expect(activeKeysAt(orders, termEnd)).toBe(0);
    expect(totalMrrAt(orders, new Date(termEnd.getTime() - 1))).toBe(3000);
    expect(activeKeysAt(orders, new Date(termEnd.getTime() - 1))).toBe(1);
    // not yet paid for
    expect(totalMrrAt(orders, new Date("2026-06-10T08:59:59.999Z"))).toBe(0);
    expect(activeKeysAt(orders, new Date("2026-06-10T08:59:59.999Z"))).toBe(0);
  });
});

describe("analytics/mrr — upgrade spread (Pitfall 4)", () => {
  it("spreads upgrade cash over the months it covers via ARTEMIDA's own rule; never NaN/Infinity", () => {
    const T0 = new Date("2026-06-10T09:00:00.000Z"); // 30-day base → termEnd 2026-07-10
    const orders = [
      row({
        id: "o1",
        kind: "new",
        provisionedKeyId: "kU",
        days: 30,
        finalAmount: 3000,
        paidAt: T0,
      }),
      // upgrade with days = NULL, 15 remaining days → max(1, 0.5) = 1 → full cash
      row({
        id: "o2",
        kind: "upgrade",
        keyId: "kU",
        days: null,
        finalAmount: 1500,
        paidAt: new Date("2026-06-25T09:00:00.000Z"),
      }),
    ];
    const t = new Date("2026-07-01T09:00:00.000Z"); // upgrade already paid, term alive
    const mrr = totalMrrAt(orders, t);
    expect(Number.isFinite(mrr)).toBe(true);
    expect(mrr).toBe(4500); // base 3000 + 1500 / 1

    // a longer remainder spreads thinner: 75-day base (1200/mo), upgrade with
    // 45 remaining days → 1500 / 1.5 = 1000
    const wide = [
      row({
        id: "w1",
        kind: "new",
        provisionedKeyId: "kW",
        days: 75,
        finalAmount: 3000,
        paidAt: new Date("2026-06-10T09:00:00.000Z"), // termEnd 2026-08-24
      }),
      row({
        id: "w2",
        kind: "upgrade",
        keyId: "kW",
        days: null,
        finalAmount: 1500,
        paidAt: new Date("2026-07-10T09:00:00.000Z"), // 45 remaining days
      }),
    ];
    expect(totalMrrAt(wide, new Date("2026-07-20T09:00:00.000Z"))).toBe(2200); // 1200 + 1000

    // an upgrade paid BEFORE t contributes nothing yet
    expect(totalMrrAt(orders, new Date("2026-06-24T09:00:00.000Z"))).toBe(3000);
  });
});

describe("analytics/mrr — one key = one MRR row (D-01)", () => {
  it("two renewals + one upgrade count the key once", () => {
    const T0 = new Date("2026-06-10T09:00:00.000Z");
    const orders = [
      row({ id: "m1", kind: "new", provisionedKeyId: "kM", days: 30, finalAmount: 3000, paidAt: T0 }),
      row({ id: "m2", kind: "renew", keyId: "kM", days: 30, finalAmount: 3000, paidAt: new Date("2026-06-20T09:00:00.000Z") }),
      row({ id: "m3", kind: "upgrade", keyId: "kM", days: null, finalAmount: 1500, paidAt: new Date("2026-06-25T09:00:00.000Z") }),
      row({ id: "m4", kind: "renew", keyId: "kM", days: 30, finalAmount: 3000, paidAt: new Date("2026-07-01T09:00:00.000Z") }),
    ];
    const t = new Date("2026-07-05T09:00:00.000Z");
    // chain: T0+30 = 07-10; renew1 → 08-09; renew2 → 09-08. At t the segment
    // base is the FIRST op (t < 07-10): 3000. The upgrade (paid 06-25) spreads
    // cash / max(1, (termEnd 09-08 − 06-25)/30 days) = 1500 / 2.5 = 600.
    expect(activeKeysAt(orders, t)).toBe(1); // ONE key = one row — renewals never double-count
    expect(totalMrrAt(orders, t)).toBe(3600); // 3000 + 600, counted once
    expect(arrAt(orders, t)).toBe(43_200); // MRR × 12
  });
});

describe("analytics/mrr — trials & bonus renewals (A1, D-03)", () => {
  it("an order-less trial contributes nothing and totalMrrAt ignores it", () => {
    // trials have no paid order at all — the pure chain never sees them
    expect(totalMrrAt([], new Date())).toBe(0);
    expect(activeKeysAt([], new Date())).toBe(0);
    expect(arrAt([], new Date())).toBe(0);
  });

  it("a fully balance-covered renewal (cash 0) contributes 0 MRR while the chain lives", () => {
    const orders = [
      row({ id: "b1", kind: "new", provisionedKeyId: "kG", days: 30, finalAmount: 3000, paidAt: new Date("2026-06-10T09:00:00.000Z") }),
      // bonus-day renewal: finalAmount == balanceUsed → cashOf = 0 (D-03)
      row({ id: "b2", kind: "renew", keyId: "kG", days: 30, finalAmount: 500, balanceUsed: 500, paidAt: new Date("2026-06-20T09:00:00.000Z") }),
    ];
    const t = new Date("2026-07-05T09:00:00.000Z");
    expect(totalMrrAt(orders, t)).toBe(0);
    // MRR-positive active-key semantics: a 0 ₽ key is not a paying subscription
    expect(activeKeysAt(orders, t)).toBe(0);
    // before the renew paid its balance-covered leg the base order still carries
    expect(totalMrrAt(orders, new Date("2026-06-15T09:00:00.000Z"))).toBe(3000);
  });
});
