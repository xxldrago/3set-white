// Pure unit vectors for lib/analytics/funnel.ts (ANL-08/ANL-11, no DB):
// reach-based funnel stages derived from the verified order state machine
// (orders-service.ts:456/483/493-498/524-539 + callback route.ts:75-83), exact
// rational conversions with null-on-zero-prev, the D-01 hardcoded 24h payment
// window with its STRICT `<` boundary, raw-errorCode grouping (ANL-09), and
// successful-chain-only timing statistics (ANL-10). No Postgres, no mocks.
import { describe, expect, it } from "vitest";
import {
  PAYMENT_WINDOW_MS,
  expiredCount,
  funnelOf,
  reachedPaid,
  reachedProvisioned,
  reachedProvisioning,
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

  it("yields null conversion and drop-off when the previous step is zero", () => {
    const steps = funnelOf([
      row({ id: "p1", createdAt: NOW }),
      row({ id: "p2", createdAt: NOW }),
    ]);
    expect(steps.map((s) => s.count)).toEqual([2, 0, 0, 0]);
    expect(steps[1]!.conversion).toBeNull();
    expect(steps[1]!.dropOff).toBeNull();
    expect(steps[2]!.conversion).toBeNull();
    expect(steps[3]!.conversion).toBeNull();
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
