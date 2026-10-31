// Pure unit vectors for lib/analytics/rfm.ts (SEG-01..05, no DB).
import { describe, expect, it } from "vitest";
import {
  DEFAULT_THRESHOLDS,
  SEGMENT_SLUGS,
  TRAILING_12M_MONTHS,
  assignSegment,
  buildSnapshot,
  buildSnapshots,
  daysBetweenMsk,
  frequencyOf,
  monetaryOf,
  recencyDaysOf,
  vipThresholdValue,
  vipUserIds,
  type AssignSegmentArgs,
  type RfmThresholds,
  type RfmUserInput,
} from "../../lib/analytics/rfm";
import { mskDayLabel, mskMonthLabel } from "../../lib/analytics/time";

const NOW = new Date("2026-07-15T10:00:00.000Z");

function input(overrides: Partial<RfmUserInput> & Pick<RfmUserInput, "userId" | "createdAt">): RfmUserInput {
  return {
    trialUsed: false,
    paidOrders: [],
    coverageActive: false,
    ...overrides,
  };
}

describe("analytics/rfm — SEGMENT_SLUGS", () => {
  it("has exactly the 7 slugs in D-06 priority order", () => {
    expect(SEGMENT_SLUGS).toEqual([
      "trial-only", "new payer", "VIP", "active", "at-risk", "churned", "sleeping",
    ]);
  });
  it("DEFAULT_THRESHOLDS match D-07", () => {
    expect(DEFAULT_THRESHOLDS).toEqual({
      newPayerDays: 30, activeDays: 30, atRiskDays: 60, churnedDays: 60, vipPercent: 5,
    });
  });
  it("TRAILING_12M_MONTHS = 12", () => {
    expect(TRAILING_12M_MONTHS).toBe(12);
  });
});

describe("analytics/rfm — daysBetweenMsk", () => {
  it("MSK calendar-day diff, never negative", () => {
    const a = new Date("2026-07-10T10:00:00.000Z");
    const b = new Date("2026-07-15T10:00:00.000Z");
    expect(daysBetweenMsk(a, b)).toBe(5);
    expect(daysBetweenMsk(b, a)).toBe(0);
  });
  it("same instant → 0", () => {
    expect(daysBetweenMsk(NOW, NOW)).toBe(0);
  });
});

describe("analytics/rfm — recencyDaysOf", () => {
  it("trial-only (no paid orders) → days from createdAt", () => {
    const i = input({ userId: 1, createdAt: new Date("2026-07-01T10:00:00.000Z") });
    expect(recencyDaysOf(i, NOW)).toBe(14);
  });
  it("payer → days from last paidAt", () => {
    const i = input({
      userId: 2,
      createdAt: new Date("2026-01-01T10:00:00.000Z"),
      paidOrders: [{ paidAt: new Date("2026-07-10T10:00:00.000Z"), cash: 100 }],
    });
    expect(recencyDaysOf(i, NOW)).toBe(5);
  });
});

describe("analytics/rfm — frequencyOf", () => {
  it("counts only orders within trailing 12 MSK months", () => {
    const recent = new Date("2026-07-10T10:00:00.000Z");
    const old = new Date("2025-01-10T10:00:00.000Z");
    const i = input({
      userId: 1,
      createdAt: new Date("2024-01-01T10:00:00.000Z"),
      paidOrders: [
        { paidAt: recent, cash: 100 },
        { paidAt: old, cash: 50 },
      ],
    });
    expect(frequencyOf(i, NOW)).toBe(1);
  });
});

describe("analytics/rfm — monetaryOf", () => {
  it("null when no paid orders", () => {
    const i = input({ userId: 1, createdAt: NOW });
    expect(monetaryOf(i)).toBeNull();
  });
  it("sum of cash otherwise", () => {
    const i = input({
      userId: 1,
      createdAt: NOW,
      paidOrders: [
        { paidAt: NOW, cash: 100 },
        { paidAt: NOW, cash: 250 },
      ],
    });
    expect(monetaryOf(i)).toBe(350);
  });
});

describe("analytics/rfm — vipUserIds", () => {
  it("empty → empty set", () => {
    expect(vipUserIds([], 5).size).toBe(0);
  });
  it("top-N with tie-break by userId asc", () => {
    const entries = [
      { userId: 1, monetary: 100 },
      { userId: 2, monetary: 200 },
      { userId: 3, monetary: 200 },
      { userId: 4, monetary: 50 },
    ];
    // 4 users * 5% = 0.2 → round → 0 → max(1,0)=1? Actually round(0.2)=0, max(1,0)=1
    const vips = vipUserIds(entries, 5);
    expect(vips.size).toBe(1);
    // top monetary 200 tie between users 2 and 3; tie-break userId asc → user 2
    expect(vips.has(2)).toBe(true);
  });
  it("min 1 even for tiny percent", () => {
    const entries = [{ userId: 1, monetary: 10 }];
    expect(vipUserIds(entries, 1).size).toBe(1);
  });
});

describe("analytics/rfm — vipThresholdValue", () => {
  it("returns min monetary among VIPs", () => {
    const entries = [
      { userId: 1, monetary: 100 },
      { userId: 2, monetary: 200 },
    ];
    // 2 * 5% = 0.1 → round 0 → max(1,0)=1 → top 1 = user 2 (200)
    expect(vipThresholdValue(entries, 5)).toBe(200);
  });
  it("empty → null", () => {
    expect(vipThresholdValue([], 5)).toBeNull();
  });
});

describe("analytics/rfm — assignSegment", () => {
  const thresholds: RfmThresholds = { ...DEFAULT_THRESHOLDS };
  function args(overrides: Partial<AssignSegmentArgs>): AssignSegmentArgs {
    return {
      trialUsed: false,
      paidOrderCount: 0,
      firstPaidAt: null,
      lastPaidAt: null,
      monetary: null,
      coverageActive: false,
      now: NOW,
      thresholds,
      isVip: false,
      ...overrides,
    };
  }

  it("no paid orders → trial-only", () => {
    expect(assignSegment(args({ paidOrderCount: 0 }))).toBe("trial-only");
  });

  it("new payer → first paid within newPayerDays", () => {
    const first = new Date("2026-07-10T10:00:00.000Z");
    expect(assignSegment(args({
      paidOrderCount: 1,
      firstPaidAt: first,
      lastPaidAt: first,
      monetary: 100,
      coverageActive: true,
    }))).toBe("new payer");
  });

  it("VIP → when isVip", () => {
    const first = new Date("2026-05-01T10:00:00.000Z");
    expect(assignSegment(args({
      paidOrderCount: 2,
      firstPaidAt: first,
      lastPaidAt: new Date("2026-06-01T10:00:00.000Z"),
      monetary: 1000,
      coverageActive: true,
      isVip: true,
    }))).toBe("VIP");
  });

  it("active → recent payment + coverage active", () => {
    const recent = new Date("2026-07-10T10:00:00.000Z");
    expect(assignSegment(args({
      paidOrderCount: 2,
      firstPaidAt: new Date("2026-05-01T10:00:00.000Z"),
      lastPaidAt: recent,
      monetary: 100,
      coverageActive: true,
    }))).toBe("active");
  });

  it("at-risk → aging but coverage active", () => {
    const aging = new Date("2026-06-01T10:00:00.000Z"); // ~44 days
    expect(assignSegment(args({
      paidOrderCount: 2,
      firstPaidAt: new Date("2026-04-01T10:00:00.000Z"),
      lastPaidAt: aging,
      monetary: 100,
      coverageActive: true,
    }))).toBe("at-risk");
  });

  it("churned → coverage expired", () => {
    const old = new Date("2026-04-01T10:00:00.000Z");
    expect(assignSegment(args({
      paidOrderCount: 2,
      firstPaidAt: new Date("2026-02-01T10:00:00.000Z"),
      lastPaidAt: old,
      monetary: 100,
      coverageActive: false,
    }))).toBe("churned");
  });

  it("sleeping → no recent payment but coverage active", () => {
    const old = new Date("2026-04-01T10:00:00.000Z");
    expect(assignSegment(args({
      paidOrderCount: 2,
      firstPaidAt: new Date("2026-02-01T10:00:00.000Z"),
      lastPaidAt: old,
      monetary: 100,
      coverageActive: true,
    }))).toBe("sleeping");
  });

  it("priority: new payer beats VIP", () => {
    const recent = new Date("2026-07-10T10:00:00.000Z");
    expect(assignSegment(args({
      paidOrderCount: 1,
      firstPaidAt: recent,
      lastPaidAt: recent,
      monetary: 1000,
      coverageActive: true,
      isVip: true,
    }))).toBe("new payer");
  });
});

describe("analytics/rfm — buildSnapshots", () => {
  it("resolves VIP across cohort before per-user segment", () => {
    const now = NOW;
    const inputs: RfmUserInput[] = [
      input({ userId: 1, createdAt: new Date("2026-01-01T10:00:00.000Z"), paidOrders: [{ paidAt: new Date("2026-06-01T10:00:00.000Z"), cash: 1000 }], coverageActive: true }),
      input({ userId: 2, createdAt: new Date("2026-01-01T10:00:00.000Z"), paidOrders: [{ paidAt: new Date("2026-06-01T10:00:00.000Z"), cash: 100 }], coverageActive: true }),
    ];
    const snaps = buildSnapshots(inputs, now, DEFAULT_THRESHOLDS);
    expect(snaps).toHaveLength(2);
    const vip = snaps.find((s) => s.segment === "VIP");
    expect(vip?.userId).toBe(1);
    const other = snaps.find((s) => s.userId === 2);
    expect(other?.monetary).toBe(100);
  });

  it("trial-only has monetary null", () => {
    const snaps = buildSnapshots(
      [input({ userId: 3, createdAt: new Date("2026-07-01T10:00:00.000Z") })],
      NOW,
      DEFAULT_THRESHOLDS,
    );
    expect(snaps[0].monetary).toBeNull();
    expect(snaps[0].segment).toBe("trial-only");
  });
});

describe("analytics/rfm — buildSnapshot", () => {
  it("single user snapshot", () => {
    const i = input({
      userId: 5,
      createdAt: new Date("2026-01-01T10:00:00.000Z"),
      paidOrders: [{ paidAt: new Date("2026-07-10T10:00:00.000Z"), cash: 200 }],
      coverageActive: true,
      trialUsed: true,
    });
    const s = buildSnapshot(i, NOW, DEFAULT_THRESHOLDS, false);
    expect(s.userId).toBe(5);
    expect(s.monetary).toBe(200);
    expect(s.frequency).toBe(1);
  });
});
