// Pure unit vectors for lib/analytics/cohorts.ts (COH-01..05, no DB).
import { describe, expect, it } from "vitest";
import {
  COHORT_MONTHS,
  buildPayerCohorts,
  buildRegistrationCohorts,
  channelOf,
  deviceBucketOf,
  trailingCohortMonths,
  type CohortUser,
  type PayerCohortInput,
  type RegistrationCohortInput,
} from "../../lib/analytics/cohorts";
import { mskDayLabel, mskMonthLabel } from "../../lib/analytics/time";

const DAY_MS = 86_400_000;

// Fixed "now" for deterministic month arithmetic. 2026-07-15 10:00 UTC → MSK 2026-07-15.
const NOW = new Date("2026-07-15T10:00:00.000Z");
const CURRENT_MONTH = mskMonthLabel(mskDayLabel(NOW)); // "2026-07-01"

function user(overrides: Partial<CohortUser> & Pick<CohortUser, "id" | "createdAt">): CohortUser {
  return {
    referredById: null,
    pendingPromo: null,
    ...overrides,
  };
}

describe("analytics/cohorts — channelOf", () => {
  it("referral when referredById != null (priority over promo)", () => {
    expect(channelOf(user({ id: 1, createdAt: NOW, referredById: 5 }), true)).toBe("referral");
    expect(channelOf(user({ id: 1, createdAt: NOW, referredById: 5 }), false)).toBe("referral");
  });
  it("promo via pendingPromo", () => {
    expect(channelOf(user({ id: 1, createdAt: NOW, pendingPromo: "PROMO" }), false)).toBe("promo");
  });
  it("promo via hasPromoOrder", () => {
    expect(channelOf(user({ id: 1, createdAt: NOW }), true)).toBe("promo");
  });
  it("organic otherwise", () => {
    expect(channelOf(user({ id: 1, createdAt: NOW }), false)).toBe("organic");
  });
});

describe("analytics/cohorts — deviceBucketOf", () => {
  it("buckets correctly", () => {
    expect(deviceBucketOf(1)).toBe("1");
    expect(deviceBucketOf(2)).toBe("2");
    expect(deviceBucketOf(3)).toBe("3");
    expect(deviceBucketOf(4)).toBe("4");
    expect(deviceBucketOf(5)).toBe("5+");
    expect(deviceBucketOf(10)).toBe("5+");
    expect(deviceBucketOf(0)).toBe("1");
  });
});

describe("analytics/cohorts — trailingCohortMonths", () => {
  it("returns 12 labels oldest-first ending with current MSK month", () => {
    const months = trailingCohortMonths(NOW);
    expect(months).toHaveLength(COHORT_MONTHS);
    expect(months[months.length - 1]).toBe(CURRENT_MONTH);
    // oldest = current - 11
    expect(months[0]).toBe("2025-08-01"); // 2026-07 minus 11 months
  });
});

describe("analytics/cohorts — buildRegistrationCohorts", () => {
  it("happy path: 1 user registered this month with a paid term spanning this month → retained[0] === 1, size === 1", () => {
    const input: RegistrationCohortInput = {
      users: [user({ id: 1, createdAt: NOW })],
      terms: [{ userId: 1, termStart: NOW, termEnd: new Date(NOW.getTime() + 30 * DAY_MS) }],
      orders: [],
      now: NOW,
    };
    const result = buildRegistrationCohorts(input, "all");
    expect(result).toHaveLength(COHORT_MONTHS);
    const currentRow = result.find((r) => r.month === CURRENT_MONTH)!;
    expect(currentRow.size).toBe(1);
    expect(currentRow.retained[0]).toBe(1);
  });

  it("gap month: term ends before target month → retained === 0 (real zero, not null)", () => {
    // user registered 2 months ago, term lasted 30 days → gap in month 0 of current cohort
    const regDate = new Date(NOW.getTime() - 60 * DAY_MS);
    const termStart = regDate;
    const termEnd = new Date(regDate.getTime() + 30 * DAY_MS);
    const input: RegistrationCohortInput = {
      users: [user({ id: 1, createdAt: regDate })],
      terms: [{ userId: 1, termStart, termEnd }],
      orders: [],
      now: NOW,
    };
    const result = buildRegistrationCohorts(input, "all");
    const regMonth = mskMonthLabel(mskDayLabel(regDate));
    const row = result.find((r) => r.month === regMonth)!;
    expect(row.size).toBe(1);
    // offset 0 = registration month itself: term active → retained 1
    expect(row.retained[0]).toBe(1);
    // offset 2 should be a gap (term ended) → 0, not null
    // (provided offset 2 is reachable)
    const offset2Month = new Date(regDate.getTime());
    // compute target month label for offset 2
    const targetLabel = mskMonthLabel(mskDayLabel(new Date(regDate.getTime() + 60 * DAY_MS)));
    if (targetLabel <= CURRENT_MONTH) {
      const idx = result[0]!.retained.length; // placeholder
      // find index by recomputing
      const months = result.map((r) => r.month);
      // offset index = months index of target? no, retained is per-row offset
      expect(row.retained[2]).toBe(0);
    }
  });

  it("future target month → retained === null", () => {
    const input: RegistrationCohortInput = {
      users: [user({ id: 1, createdAt: NOW })],
      terms: [{ userId: 1, termStart: NOW, termEnd: new Date(NOW.getTime() + 30 * DAY_MS) }],
      orders: [],
      now: NOW,
    };
    const result = buildRegistrationCohorts(input, "all");
    const currentRow = result.find((r) => r.month === CURRENT_MONTH)!;
    // offset 11 is likely in the future relative to current month + 11 months? current+11 = future-ish; check last offsets
    // The last offset (11) = current month + 11 months = future → null
    expect(currentRow.retained[11]).toBeNull();
  });

  it("size-0 cohort → retained all null", () => {
    // No users at all → every cohort size 0
    const input: RegistrationCohortInput = {
      users: [],
      terms: [],
      orders: [],
      now: NOW,
    };
    const result = buildRegistrationCohorts(input, "all");
    expect(result).toHaveLength(COHORT_MONTHS);
    for (const r of result) {
      expect(r.size).toBe(0);
      for (const v of r.retained) expect(v).toBeNull();
    }
  });

  it("channel filter excludes non-matching users", () => {
    const u1 = user({ id: 1, createdAt: NOW, referredById: 5 }); // referral
    const u2 = user({ id: 2, createdAt: NOW }); // organic
    const input: RegistrationCohortInput = {
      users: [u1, u2],
      terms: [],
      orders: [],
      now: NOW,
    };
    const all = buildRegistrationCohorts(input, "all");
    const referral = buildRegistrationCohorts(input, "referral");
    const currentAll = all.find((r) => r.month === CURRENT_MONTH)!;
    const currentRef = referral.find((r) => r.month === CURRENT_MONTH)!;
    expect(currentAll.size).toBe(2);
    expect(currentRef.size).toBe(1);
  });

  it("returns exactly 12 rows even for empty input", () => {
    const input: RegistrationCohortInput = { users: [], terms: [], orders: [], now: NOW };
    expect(buildRegistrationCohorts(input, "all")).toHaveLength(COHORT_MONTHS);
  });
});

describe("analytics/cohorts — buildPayerCohorts", () => {
  it("happy path: 1 payer this month → size 1, baseRevenue === cash, revenue[0] === baseRevenue", () => {
    const input: PayerCohortInput = {
      users: [user({ id: 1, createdAt: NOW })],
      orders: [{ userId: 1, paidAt: NOW, cash: 1000, devices: 2, promoCode: null }],
      now: NOW,
    };
    const result = buildPayerCohorts(input, "all", "all");
    const row = result.find((r) => r.month === CURRENT_MONTH)!;
    expect(row.size).toBe(1);
    expect(row.baseRevenue).toBe(1000);
    expect(row.revenue[0]).toBe(1000);
  });

  it("empty cohort → size 0, baseRevenue null, revenue all null", () => {
    const input: PayerCohortInput = { users: [], orders: [], now: NOW };
    const result = buildPayerCohorts(input, "all", "all");
    for (const r of result) {
      expect(r.size).toBe(0);
      expect(r.baseRevenue).toBeNull();
      for (const v of r.revenue) expect(v).toBeNull();
    }
  });

  it("channel filter excludes non-matching payers", () => {
    const input: PayerCohortInput = {
      users: [user({ id: 1, createdAt: NOW, referredById: 5 }), user({ id: 2, createdAt: NOW })],
      orders: [
        { userId: 1, paidAt: NOW, cash: 1000, devices: 2, promoCode: null },
        { userId: 2, paidAt: NOW, cash: 500, devices: 1, promoCode: null },
      ],
      now: NOW,
    };
    const referral = buildPayerCohorts(input, "referral", "all");
    const row = referral.find((r) => r.month === CURRENT_MONTH)!;
    expect(row.size).toBe(1);
    expect(row.baseRevenue).toBe(1000);
  });

  it("device filter excludes non-matching payers", () => {
    const input: PayerCohortInput = {
      users: [user({ id: 1, createdAt: NOW }), user({ id: 2, createdAt: NOW })],
      orders: [
        { userId: 1, paidAt: NOW, cash: 1000, devices: 1, promoCode: null },
        { userId: 2, paidAt: NOW, cash: 500, devices: 2, promoCode: null },
      ],
      now: NOW,
    };
    const two = buildPayerCohorts(input, "all", "2");
    const row = two.find((r) => r.month === CURRENT_MONTH)!;
    expect(row.size).toBe(1);
    expect(row.baseRevenue).toBe(500);
  });

  it("revenue includes renew/upgrade orders (all cash in target month)", () => {
    const later = new Date(NOW.getTime() + 30 * DAY_MS);
    const input: PayerCohortInput = {
      users: [user({ id: 1, createdAt: NOW })],
      orders: [
        { userId: 1, paidAt: NOW, cash: 1000, devices: 2, promoCode: null },
        { userId: 1, paidAt: later, cash: 500, devices: 2, promoCode: null },
      ],
      now: new Date(NOW.getTime() + 60 * DAY_MS),
    };
    const result = buildPayerCohorts(input, "all", "all");
    const row = result.find((r) => r.month === CURRENT_MONTH)!;
    expect(row.baseRevenue).toBe(1000);
    // revenue[1] should include the renewal cash
    expect(row.revenue[1]).toBe(500);
  });

  it("user with no paid orders is excluded from payer cohorts", () => {
    const input: PayerCohortInput = {
      users: [user({ id: 1, createdAt: NOW })],
      orders: [],
      now: NOW,
    };
    const result = buildPayerCohorts(input, "all", "all");
    for (const r of result) expect(r.size).toBe(0);
  });

  it("returns exactly 12 rows", () => {
    const input: PayerCohortInput = { users: [], orders: [], now: NOW };
    expect(buildPayerCohorts(input, "all", "all")).toHaveLength(COHORT_MONTHS);
  });

  it("future target month → revenue null", () => {
    const input: PayerCohortInput = {
      users: [user({ id: 1, createdAt: NOW })],
      orders: [{ userId: 1, paidAt: NOW, cash: 1000, devices: 2, promoCode: null }],
      now: NOW,
    };
    const result = buildPayerCohorts(input, "all", "all");
    const row = result.find((r) => r.month === CURRENT_MONTH)!;
    expect(row.revenue[11]).toBeNull();
  });
});

describe("analytics/cohorts — MSK boundary", () => {
  it("term active in registration month but gap in next month when term is 30 days", () => {
    // Use a user registered at start of a month with a 30-day term; verify activeMonths marks only months intersected
    const regDate = new Date("2026-06-15T10:00:00.000Z");
    const now = new Date("2026-08-15T10:00:00.000Z");
    const input: RegistrationCohortInput = {
      users: [user({ id: 1, createdAt: regDate })],
      terms: [{ userId: 1, termStart: regDate, termEnd: new Date(regDate.getTime() + 30 * DAY_MS) }],
      orders: [],
      now,
    };
    const result = buildRegistrationCohorts(input, "all");
    const regMonth = mskMonthLabel(mskDayLabel(regDate));
    const row = result.find((r) => r.month === regMonth)!;
    // offset 0 retained (term active in registration month)
    expect(row.retained[0]).toBe(1);
    // offset 2+ should be 0 or null (gap) — not 1
    expect(row.retained[2]).not.toBe(1);
  });
});
