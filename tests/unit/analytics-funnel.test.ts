// Pure unit vectors for lib/analytics/funnel.ts (ANL-08/ANL-11, no DB):
// reach-based funnel stages derived from the verified order state machine
// (orders-service.ts:456/483/493-498/524-539 + callback route.ts:75-83), exact
// rational conversions with null-on-zero-prev, the D-01 hardcoded 24h payment
// window with its STRICT `<` boundary, raw-errorCode grouping (ANL-09), and
// successful-chain-only timing statistics (ANL-10). No Postgres, no mocks.
import { describe, expect, it } from "vitest";
import {
  PAYMENT_WINDOW_MS,
  errorBreakdown,
  expiredCount,
  funnelOf,
  meanMs,
  medianMs,
  reachedPaid,
  reachedProvisioned,
  reachedProvisioning,
  timingStats,
  type FunnelRow,
} from "../../lib/analytics/funnel";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function row(overrides: Partial<FunnelRow> & Pick<FunnelRow, "createdAt">): FunnelRow {
  const base = {
    id: "o",
    status: "pending",
    paidAt: null,
    provisionedKeyId: null,
    errorCode: null,
  };
  const createdAt = overrides.createdAt;
  return {
    ...base,
    ...overrides,
    createdAt,
    // Default update instant is the creation instant unless a fixture pins it.
    updatedAt: overrides.updatedAt ?? createdAt,
  };
}

const NOW = new Date("2026-10-26T12:00:00.000Z");

describe("analytics/funnel — reach-based stage predicates", () => {
  it("counts each order only toward the stages it physically reached", () => {
    const pending = row({ createdAt: NOW });
    expect(reachedPaid(pending)).toBe(false);
    expect(reachedProvisioning(pending)).toBe(false);
    expect(reachedProvisioned(pending)).toBe(false);

    const paid = row({
      status: "paid",
      createdAt: NOW,
      paidAt: new Date("2026-10-26T12:05:00.000Z"),
    });
    expect(reachedPaid(paid)).toBe(true);
    expect(reachedProvisioning(paid)).toBe(false);
    expect(reachedProvisioned(paid)).toBe(false);

    const provisioning = row({
      status: "provisioning",
      createdAt: NOW,
      paidAt: new Date("2026-10-26T12:05:00.000Z"),
    });
    expect(reachedPaid(provisioning)).toBe(true);
    expect(reachedProvisioning(provisioning)).toBe(true);
    expect(reachedProvisioned(provisioning)).toBe(false);

    // DOCUMENTED APPROXIMATION — a failed row is assumed to have entered
    // provisioning. The paid→failed fallback (orders-service.ts:534) never
    // did, but the schema cannot distinguish the two paths.
    const failed = row({ status: "failed", createdAt: NOW, errorCode: "api_down" });
    expect(reachedPaid(failed)).toBe(false);
    expect(reachedProvisioning(failed)).toBe(true);
    expect(reachedProvisioned(failed)).toBe(false);

    const provisioned = row({
      status: "provisioned",
      createdAt: NOW,
      paidAt: new Date("2026-10-26T12:05:00.000Z"),
      provisionedKeyId: "k-1",
    });
    expect(reachedPaid(provisioned)).toBe(true);
    expect(reachedProvisioning(provisioned)).toBe(true);
    expect(reachedProvisioned(provisioned)).toBe(true);

    // Refunded WITH a key reached provisioning (key proves it).
    const refundedWithKey = row({
      status: "refunded",
      createdAt: NOW,
      paidAt: new Date("2026-10-26T12:05:00.000Z"),
      provisionedKeyId: "k-2",
    });
    expect(reachedPaid(refundedWithKey)).toBe(true);
    expect(reachedProvisioning(refundedWithKey)).toBe(true);
    expect(reachedProvisioned(refundedWithKey)).toBe(true);

    // DOCUMENTED APPROXIMATION — a keyless CHARGEBACKED-from-provisioning row
    // (callback route.ts:76-78) physically entered provisioning but is
    // excluded: accepted under-count, declared in the module header.
    const refundedWithoutKey = row({
      status: "refunded",
      createdAt: NOW,
      paidAt: new Date("2026-10-26T12:05:00.000Z"),
    });
    expect(reachedPaid(refundedWithoutKey)).toBe(true);
    expect(reachedProvisioning(refundedWithoutKey)).toBe(false);
    expect(reachedProvisioned(refundedWithoutKey)).toBe(false);

    const canceled = row({
      status: "canceled",
      createdAt: NOW,
      paidAt: new Date("2026-10-26T12:05:00.000Z"),
    });
    expect(reachedPaid(canceled)).toBe(true);
    expect(reachedProvisioning(canceled)).toBe(false);
    expect(reachedProvisioned(canceled)).toBe(false);
  });
});

describe("analytics/funnel — funnelOf counts and conversions", () => {
  // 10 created / 8 paid / 6 provisioning / 5 provisioned
  const mixed: FunnelRow[] = [
    row({ id: "p1", createdAt: NOW }),
    row({ id: "p2", createdAt: NOW }),
    row({
      id: "pd1",
      status: "paid",
      createdAt: NOW,
      paidAt: new Date("2026-10-26T12:05:00.000Z"),
    }),
    row({
      id: "c1",
      status: "canceled",
      createdAt: NOW,
      paidAt: new Date("2026-10-26T12:06:00.000Z"),
    }),
    row({
      id: "f1",
      status: "failed",
      createdAt: NOW,
      paidAt: new Date("2026-10-26T12:07:00.000Z"),
      errorCode: "api_down",
    }),
    row({
      id: "r1",
      status: "refunded",
      createdAt: NOW,
      paidAt: new Date("2026-10-26T12:08:00.000Z"),
      provisionedKeyId: "k-refund",
    }),
    row({
      id: "d1",
      status: "provisioned",
      createdAt: NOW,
      paidAt: new Date("2026-10-26T12:09:00.000Z"),
      provisionedKeyId: "k-1",
    }),
    row({
      id: "d2",
      status: "provisioned",
      createdAt: NOW,
      paidAt: new Date("2026-10-26T12:10:00.000Z"),
      provisionedKeyId: "k-2",
    }),
    row({
      id: "d3",
      status: "provisioned",
      createdAt: NOW,
      paidAt: new Date("2026-10-26T12:11:00.000Z"),
      provisionedKeyId: "k-3",
    }),
    row({
      id: "d4",
      status: "provisioned",
      createdAt: NOW,
      paidAt: new Date("2026-10-26T12:12:00.000Z"),
      provisionedKeyId: "k-4",
    }),
  ];

  it("emits reach-based counts 10/8/6/5 with exact-rational conversions", () => {
    const steps = funnelOf(mixed);
    expect(steps.map((s) => s.step)).toEqual([
      "pending",
      "paid",
      "provisioning",
      "provisioned",
    ]);
    expect(steps.map((s) => s.count)).toEqual([10, 8, 6, 5]);

    expect(steps[0]!.conversion).toBeNull();
    expect(steps[0]!.dropOff).toBeNull();
    expect(steps[1]!.conversion).toBe(0.8);
    expect(steps[1]!.dropOff).toBeCloseTo(0.2, 12);
    expect(steps[2]!.conversion).toBe(0.75);
    expect(steps[2]!.dropOff).toBe(0.25);
    expect(steps[3]!.conversion).toBe(5 / 6);
    expect(steps[3]!.dropOff).toBeCloseTo(1 / 6, 12);
  });

  it("yields null conversion when the previous step is zero (a real zero stays 0)", () => {
    const steps = funnelOf([
      row({ id: "p1", createdAt: NOW }),
      row({ id: "p2", createdAt: NOW }),
    ]);
    expect(steps.map((s) => s.count)).toEqual([2, 0, 0, 0]);
    // prev = 2 → 0/2 is a REAL zero, not an unknown.
    expect(steps[1]!.conversion).toBe(0);
    expect(steps[1]!.dropOff).toBe(1);
    // prev = 0 → null, never −∞ (ANL-08 boundary).
    expect(steps[2]!.conversion).toBeNull();
    expect(steps[2]!.dropOff).toBeNull();
    expect(steps[3]!.conversion).toBeNull();
    expect(steps[3]!.dropOff).toBeNull();
  });

  it("returns four zero steps with null rates for an empty funnel (ANL-08 empty)", () => {
    const steps = funnelOf([]);
    expect(steps).toHaveLength(4);
    expect(steps.map((s) => s.count)).toEqual([0, 0, 0, 0]);
    for (const s of steps) {
      expect(s.conversion).toBeNull();
      expect(s.dropOff).toBeNull();
    }
  });

  it("keeps the fixed pending→paid→provisioning→provisioned order for reversed input", () => {
    const reversed = [...mixed].reverse();
    const steps = funnelOf(reversed);
    expect(steps.map((s) => s.step)).toEqual([
      "pending",
      "paid",
      "provisioning",
      "provisioned",
    ]);
    expect(steps.map((s) => s.count)).toEqual([10, 8, 6, 5]);
  });
});

describe("analytics/funnel — expiredCount (D-01, point-in-time)", () => {
  it("counts only pending orders created strictly before now − 24h", () => {
    const rows = [
      row({ id: "25h", createdAt: new Date(NOW.getTime() - 25 * HOUR_MS) }),
      row({ id: "23h", createdAt: new Date(NOW.getTime() - 23 * HOUR_MS) }),
      // Exactly on the boundary: NOT expired (strict `<`).
      row({ id: "exact", createdAt: new Date(NOW.getTime() - DAY_MS) }),
      // ±1 ms pair pins the strict comparison.
      row({ id: "minus1ms", createdAt: new Date(NOW.getTime() - DAY_MS - 1) }),
      row({ id: "plus1ms", createdAt: new Date(NOW.getTime() - DAY_MS + 1) }),
      row({
        id: "paid-old",
        status: "paid",
        createdAt: new Date(NOW.getTime() - 25 * HOUR_MS),
        paidAt: new Date(NOW.getTime() - 24 * HOUR_MS),
      }),
    ];
    expect(expiredCount(rows, NOW)).toBe(2);
  });

  it("defaults to PAYMENT_WINDOW_MS and honors a custom window", () => {
    const rows = [
      row({ id: "25h", createdAt: new Date(NOW.getTime() - 25 * HOUR_MS) }),
      row({ id: "23h", createdAt: new Date(NOW.getTime() - 23 * HOUR_MS) }),
    ];
    expect(expiredCount(rows, NOW)).toBe(1);
    expect(
      expiredCount(
        [row({ id: "2h", createdAt: new Date(NOW.getTime() - 2 * HOUR_MS) })],
        NOW,
        HOUR_MS,
      ),
    ).toBe(1);
  });

  it("pins the 24h window as a hardcoded code constant (D-01)", () => {
    expect(PAYMENT_WINDOW_MS).toBe(86_400_000);
    expect(PAYMENT_WINDOW_MS).toBe(24 * 60 * 60 * 1000);
  });
});

describe("analytics/funnel — errorBreakdown (ANL-09, D-03)", () => {
  const at = new Date("2026-10-26T12:00:00.000Z");

  it("groups failed/canceled rows by raw errorCode, count desc", () => {
    const rows = [
      ...["f1", "f2", "f3"].map((id) =>
        row({ id, status: "failed", createdAt: at, errorCode: "api_down" }),
      ),
      ...["t1", "t2"].map((id) =>
        row({ id, status: "failed", createdAt: at, errorCode: "timeout" }),
      ),
      ...["n1", "n2"].map((id) =>
        row({ id, status: "failed", createdAt: at, errorCode: null }),
      ),
      row({ id: "m1", status: "canceled", createdAt: at, errorCode: "manual" }),
    ];

    // timeout(2) and null(2) tie → code ASC with null as '' puts null first.
    expect(errorBreakdown(rows)).toEqual([
      { code: "api_down", count: 3 },
      { code: null, count: 2 },
      { code: "timeout", count: 2 },
      { code: "manual", count: 1 },
    ]);
  });

  it("breaks equal-count ties by code asc, null treated as '' (sorts first)", () => {
    const rows = [
      ...["b1", "b2"].map((id) =>
        row({ id, status: "failed", createdAt: at, errorCode: "b_code" }),
      ),
      ...["a1", "a2"].map((id) =>
        row({ id, status: "failed", createdAt: at, errorCode: "a_code" }),
      ),
      ...["n1", "n2"].map((id) =>
        row({ id, status: "canceled", createdAt: at, errorCode: null }),
      ),
    ];
    expect(errorBreakdown(rows).map((r) => r.code)).toEqual([null, "a_code", "b_code"]);
  });

  it("considers only failed/canceled rows — other statuses never enter", () => {
    const rows = [
      row({
        id: "ok",
        status: "provisioned",
        createdAt: at,
        provisionedKeyId: "k",
        errorCode: "stale_code",
      }),
      row({ id: "p", status: "pending", createdAt: at, errorCode: "not_an_error" }),
      row({ id: "f", status: "failed", createdAt: at, errorCode: "api_down" }),
    ];
    expect(errorBreakdown(rows)).toEqual([{ code: "api_down", count: 1 }]);
  });

  it("returns [] when no failed/canceled rows exist", () => {
    expect(
      errorBreakdown([
        row({ id: "p", createdAt: at }),
        row({ id: "d", status: "provisioned", createdAt: at, provisionedKeyId: "k" }),
      ]),
    ).toEqual([]);
  });
});

describe("analytics/funnel — medianMs / meanMs (ANL-10)", () => {
  it("computes the median including the even-count mean of the two middles", () => {
    expect(medianMs([1])).toBe(1);
    expect(medianMs([1, 2, 3])).toBe(2);
    expect(medianMs([1, 2, 3, 4])).toBe(2.5);
    expect(medianMs([4, 1, 3, 2])).toBe(2.5);
    expect(medianMs([])).toBeNull();
  });

  it("computes the arithmetic mean, null on an empty sample", () => {
    expect(meanMs([1, 2, 3])).toBe(2);
    expect(meanMs([5])).toBe(5);
    expect(meanMs([])).toBeNull();
  });
});

describe("analytics/funnel — timingStats (ANL-10, D-04)", () => {
  const created = new Date("2026-10-01T00:00:00.000Z");

  it("measures successful chains only, with the updatedAt proxy", () => {
    const rows = [
      // created → paid 10min; paid → provisioned 10min (updatedAt proxy)
      row({
        id: "s1",
        status: "provisioned",
        createdAt: created,
        paidAt: new Date(created.getTime() + 10 * 60_000),
        updatedAt: new Date(created.getTime() + 20 * 60_000),
        provisionedKeyId: "k1",
      }),
      // created → paid 20min; paid → provisioned 30min
      row({
        id: "s2",
        status: "provisioned",
        createdAt: created,
        paidAt: new Date(created.getTime() + 20 * 60_000),
        updatedAt: new Date(created.getTime() + 50 * 60_000),
        provisionedKeyId: "k2",
      }),
      // created → paid 30min; paid → provisioned 15min
      row({
        id: "s3",
        status: "provisioned",
        createdAt: created,
        paidAt: new Date(created.getTime() + 30 * 60_000),
        updatedAt: new Date(created.getTime() + 45 * 60_000),
        provisionedKeyId: "k3",
      }),
      // excluded: failed
      row({
        id: "f1",
        status: "failed",
        createdAt: created,
        paidAt: new Date(created.getTime() + 5 * 60_000),
        errorCode: "api_down",
      }),
      // excluded defensively: provisioned without paidAt
      row({
        id: "d1",
        status: "provisioned",
        createdAt: created,
        paidAt: null,
        updatedAt: new Date(created.getTime() + 60 * 60_000),
        provisionedKeyId: "k4",
      }),
    ];

    const stats = timingStats(rows);
    expect(stats.orders).toBe(3);
    // created→paid: [10, 20, 30] min
    expect(stats.createdToPaid.medianMs).toBe(20 * 60_000);
    expect(stats.createdToPaid.meanMs).toBe(20 * 60_000);
    // paid→provisioned: [10, 30, 15] min → sorted [10, 15, 30]
    expect(stats.paidToProvisioned.medianMs).toBe(15 * 60_000);
    expect(stats.paidToProvisioned.meanMs).toBeCloseTo((10 + 30 + 15) / 3 * 60_000, 6);
  });

  it("returns orders 0 and all-null stats on an empty success sample", () => {
    const stats = timingStats([
      row({
        id: "f1",
        status: "failed",
        createdAt: new Date("2026-10-01T00:00:00.000Z"),
        paidAt: new Date("2026-10-01T00:10:00.000Z"),
        errorCode: "timeout",
      }),
      row({
        id: "r1",
        status: "refunded",
        createdAt: new Date("2026-10-01T00:00:00.000Z"),
        paidAt: new Date("2026-10-01T00:10:00.000Z"),
        provisionedKeyId: "k",
      }),
    ]);
    expect(stats).toEqual({
      createdToPaid: { medianMs: null, meanMs: null },
      paidToProvisioned: { medianMs: null, meanMs: null },
      orders: 0,
    });
  });
});
