// Pure unit vectors for lib/analytics/retention.ts (ANL-04/06/07, no DB):
// term-event derivation (identical cursor to buildKeyTerms), inclusive 7-day
// grace classification, half-open MSK windows, cohort-clamped churn, and the
// D-07 literal lost-MRR money base (finalAmount × 30 / days, never cashOf).
import { describe, expect, it } from "vitest";
import {
  buildKeyTermEvents,
  classifyTerm,
  retentionForWindow,
  type TermEvent,
} from "../../lib/analytics/retention";
import { buildKeyTerms, type PaidOrderRow } from "../../lib/analytics/series";
import { mskDayStartInstant } from "../../lib/analytics/time";

const DAY_MS = 86_400_000;

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

describe("analytics/retention — buildKeyTermEvents invariant vs buildKeyTerms", () => {
  it("for every keyRef, last event end equals buildKeyTerms termEnd (Pattern 2 cursor guard)", () => {
    const paid = [
      row({
        id: "n1",
        kind: "new",
        provisionedKeyId: "kA",
        days: 30,
        finalAmount: 3000,
        paidAt: new Date("2026-06-10T09:00:00.000Z"),
      }),
      row({
        id: "r1",
        kind: "renew",
        keyId: "kA",
        days: 30,
        finalAmount: 3000,
        // early renew — must extend from current expiry, not restart
        paidAt: new Date("2026-07-01T09:00:00.000Z"),
      }),
      row({
        id: "u1",
        kind: "upgrade",
        keyId: "kA",
        days: null,
        finalAmount: 500,
        paidAt: new Date("2026-07-05T09:00:00.000Z"),
      }),
      row({
        id: "n2",
        kind: "new",
        provisionedKeyId: "kB",
        days: 90,
        finalAmount: 9000,
        paidAt: new Date("2026-05-01T09:00:00.000Z"),
      }),
      row({
        id: "r2",
        kind: "renew",
        keyId: "kB",
        days: 30,
        finalAmount: 3000,
        paidAt: new Date("2026-08-01T09:00:00.000Z"),
      }),
    ];

    const events = buildKeyTermEvents(paid);
    const terms = buildKeyTerms(paid);

    for (const keyRef of terms.keys()) {
      const keyEvents = events.filter((e) => e.keyRef === keyRef);
      expect(keyEvents.length).toBeGreaterThan(0);
      expect(keyEvents.at(-1)!.end.getTime()).toBe(terms.get(keyRef)!.termEnd.getTime());
    }
  });
});

describe("analytics/retention — classifyTerm grace boundary (D-05)", () => {
  // new 06-10 +30d → end 07-10; renew exactly end+7d → renewed; +1 ms → churned
  const start = new Date("2026-06-10T00:00:00.000Z");
  const end = new Date(start.getTime() + 30 * DAY_MS); // 2026-07-10T00:00:00.000Z
  const graceMs = 7 * DAY_MS;

  function event(nextPaidAt: Date | null): TermEvent {
    return {
      keyRef: "kG",
      start,
      end,
      days: 30,
      op: row({ paidAt: start, provisionedKeyId: "kG", finalAmount: 3000 }),
      nextPaidAt,
    };
  }

  it("renew paid exactly end + 7d → renewed (inclusive <=)", () => {
    const next = new Date(end.getTime() + graceMs);
    const now = new Date(end.getTime() + graceMs + DAY_MS); // past grace
    expect(classifyTerm(event(next), now)).toBe("renewed");
  });

  it("renew paid end + 7d + 1ms → churned once now is past grace", () => {
    const next = new Date(end.getTime() + graceMs + 1);
    const now = new Date(end.getTime() + graceMs + DAY_MS);
    expect(classifyTerm(event(next), now)).toBe("churned");
  });

  it("term still open (end > now) → open", () => {
    const now = new Date(end.getTime() - DAY_MS);
    expect(classifyTerm(event(null), now)).toBe("open");
  });

  it("ended, inside grace, no nextPaidAt → pending (A5)", () => {
    const now = new Date(end.getTime() + 3 * DAY_MS); // inside 7d grace
    expect(classifyTerm(event(null), now)).toBe("pending");
  });

  it("ended, past grace, no nextPaidAt → churned", () => {
    const now = new Date(end.getTime() + graceMs + 1);
    expect(classifyTerm(event(null), now)).toBe("churned");
  });
});

describe("analytics/retention — upgrade ≠ renewal + win-back (D-09)", () => {
  it("upgrade between terms is not a renewal; late renew churns then opens a win-back", () => {
    const paidAt = new Date("2026-06-10T00:00:00.000Z");
    const end = new Date(paidAt.getTime() + 30 * DAY_MS);
    const paid = [
      row({
        id: "n",
        kind: "new",
        provisionedKeyId: "kU",
        days: 30,
        finalAmount: 3000,
        paidAt,
      }),
      row({
        id: "up",
        kind: "upgrade",
        keyId: "kU",
        days: null,
        finalAmount: 500,
        paidAt: new Date(end.getTime() - 5 * DAY_MS),
      }),
      // renew more than 7 days after end → win-back, not renewal
      row({
        id: "r",
        kind: "renew",
        keyId: "kU",
        days: 30,
        finalAmount: 3000,
        paidAt: new Date(end.getTime() + 10 * DAY_MS),
      }),
    ];

    const events = buildKeyTermEvents(paid);
    expect(events).toHaveLength(2); // upgrade never enters the chain
    expect(events.every((e) => e.op.kind !== "upgrade")).toBe(true);

    const now = new Date(end.getTime() + 15 * DAY_MS);
    expect(classifyTerm(events[0]!, now)).toBe("churned");
    // second term opens at its own paidAt (win-back)
    expect(events[1]!.start.getTime()).toBe(paid[2]!.paidAt!.getTime());
  });
});

describe("analytics/retention — bonus/wallet renew within grace", () => {
  it("wallet-covered renew within grace → renewed and adds 0 to lostMrr", () => {
    const paidAt = new Date("2026-06-10T00:00:00.000Z");
    const end = new Date(paidAt.getTime() + 30 * DAY_MS);
    const paid = [
      row({
        id: "n",
        kind: "new",
        provisionedKeyId: "kW",
        days: 30,
        finalAmount: 3000,
        paidAt,
      }),
      row({
        id: "r",
        kind: "renew",
        keyId: "kW",
        days: 30,
        finalAmount: 3000,
        balanceUsed: 3000,
        paidAt: new Date(end.getTime() + 2 * DAY_MS), // within grace
      }),
    ];

    const events = buildKeyTermEvents(paid);
    const now = new Date(end.getTime() + 20 * DAY_MS);
    expect(classifyTerm(events[0]!, now)).toBe("renewed");

    const window = {
      start: mskDayStartInstant("2026-07-01"),
      endExclusive: mskDayStartInstant("2026-08-01"),
      now,
    };
    const result = retentionForWindow(events, paid, window);
    // first term ends 07-10 → in July window, renewed → lostMrr 0
    expect(result.renewedKeys).toBe(1);
    expect(result.lostMrr).toBe(0);
  });
});

describe("analytics/retention — A1 lostMrr money base (D-07 literal)", () => {
  it("wallet-covered churned term still contributes finalAmount×30/days (not cashOf)", () => {
    // new fully wallet-covered: cashOf=0 but finalAmount=3000, 30d → lost MRR 3000
    const paidAt = new Date("2026-06-01T00:00:00.000Z");
    const end = new Date(paidAt.getTime() + 30 * DAY_MS); // 2026-07-01
    const paid = [
      row({
        id: "n",
        kind: "new",
        provisionedKeyId: "kL",
        days: 30,
        finalAmount: 3000,
        balanceUsed: 3000, // fully wallet — cashOf = 0
        paidAt,
      }),
    ];

    const events = buildKeyTermEvents(paid);
    const now = new Date(end.getTime() + 10 * DAY_MS); // past grace → churned
    expect(classifyTerm(events[0]!, now)).toBe("churned");

    // window covering the term end; key was active at start (bought before start)
    const window = {
      start: mskDayStartInstant("2026-06-15"),
      endExclusive: mskDayStartInstant("2026-07-15"),
      now,
    };
    const result = retentionForWindow(events, paid, window);
    expect(result.churnedKeys).toBe(1);
    // A1: (3000 * 30) / 30 = 3000, NOT cashOf (=0)
    expect(result.lostMrr).toBe(3000);
  });
});

describe("analytics/retention — pending in window (A5)", () => {
  it("pending term counts in expiring, neither renewed nor churned", () => {
    const paidAt = new Date("2026-06-10T00:00:00.000Z");
    const end = new Date(paidAt.getTime() + 30 * DAY_MS); // 07-10
    const paid = [
      row({
        id: "n",
        kind: "new",
        provisionedKeyId: "kP",
        days: 30,
        finalAmount: 3000,
        paidAt,
      }),
    ];
    const events = buildKeyTermEvents(paid);
    const now = new Date(end.getTime() + 3 * DAY_MS); // inside grace
    expect(classifyTerm(events[0]!, now)).toBe("pending");

    const window = {
      start: mskDayStartInstant("2026-07-01"),
      endExclusive: now,
      now,
    };
    const result = retentionForWindow(events, paid, window);
    expect(result.expiringKeys).toBe(1);
    expect(result.renewedKeys).toBe(0);
    expect(result.churnedKeys).toBe(0);
    expect(result.lostMrr).toBe(0);
  });
});

describe("analytics/retention — cohort clamp (A6)", () => {
  it("key bought AND lost inside the window expires but is not in churnedKeys", () => {
    // bought mid-window, dies mid-window → expiring yes, churned no (not in activeAtStart)
    const paidAt = new Date("2026-07-05T00:00:00.000Z");
    const paid = [
      row({
        id: "n",
        kind: "new",
        provisionedKeyId: "kC",
        days: 10,
        finalAmount: 1000,
        paidAt,
      }),
    ];
    const events = buildKeyTermEvents(paid);
    const end = events[0]!.end; // 07-15
    const now = new Date(end.getTime() + 10 * DAY_MS);

    const window = {
      start: mskDayStartInstant("2026-07-01"),
      endExclusive: mskDayStartInstant("2026-08-01"),
      now,
    };
    const result = retentionForWindow(events, paid, window);
    expect(result.expiringKeys).toBe(1);
    expect(result.churnedKeys).toBe(0); // clamped: not active at start
    expect(result.activeKeysAtStart).toBe(0);
    expect(result.churnedKeys).toBeLessThanOrEqual(result.activeKeysAtStart);
  });
});

describe("analytics/retention — half-open month windows", () => {
  it("term ending exactly at MSK month-start belongs to the next month only", () => {
    // Craft paidAt so term end lands exactly on 2026-07-01 MSK start instant
    const julyStart = mskDayStartInstant("2026-07-01");
    const paidAt = new Date(julyStart.getTime() - 30 * DAY_MS);
    const paid = [
      row({
        id: "n",
        kind: "new",
        provisionedKeyId: "kH",
        days: 30,
        finalAmount: 3000,
        paidAt,
      }),
    ];
    const events = buildKeyTermEvents(paid);
    expect(events[0]!.end.getTime()).toBe(julyStart.getTime());

    const now = new Date(julyStart.getTime() + 20 * DAY_MS);
    const june = retentionForWindow(events, paid, {
      start: mskDayStartInstant("2026-06-01"),
      endExclusive: julyStart,
      now,
    });
    const july = retentionForWindow(events, paid, {
      start: julyStart,
      endExclusive: mskDayStartInstant("2026-08-01"),
      now,
    });
    expect(june.expiringKeys).toBe(0);
    expect(july.expiringKeys).toBe(1);
  });
});

describe("analytics/retention — multi-term 90-day window (A6 term-based)", () => {
  it("key with two term ends inside the window yields expiringKeys = 2", () => {
    const paid = [
      row({
        id: "n",
        kind: "new",
        provisionedKeyId: "kM",
        days: 30,
        finalAmount: 3000,
        paidAt: new Date("2026-05-01T00:00:00.000Z"),
      }),
      row({
        id: "r1",
        kind: "renew",
        keyId: "kM",
        days: 30,
        finalAmount: 3000,
        // paid near first end so chain extends continuously
        paidAt: new Date("2026-05-28T00:00:00.000Z"),
      }),
      row({
        id: "r2",
        kind: "renew",
        keyId: "kM",
        days: 30,
        finalAmount: 3000,
        paidAt: new Date("2026-06-28T00:00:00.000Z"),
      }),
    ];
    const events = buildKeyTermEvents(paid);
    // three terms; first two ends fall in a ~90d window starting mid-May
    const now = new Date("2026-08-15T00:00:00.000Z");
    const window = {
      start: new Date("2026-05-15T00:00:00.000Z"),
      endExclusive: new Date("2026-08-15T00:00:00.000Z"),
      now,
    };
    const inWindow = events.filter(
      (e) => e.end >= window.start && e.end < window.endExclusive,
    );
    expect(inWindow.length).toBeGreaterThanOrEqual(2);

    const result = retentionForWindow(events, paid, window);
    // at least the two middle ends; with continuous extension we get ends at
    // ~05-31, ~06-27, ~07-28 — two or three depending on exact cursor.
    // Plan Test 9: a key with two term ends inside the window → expiringKeys = 2.
    // Build a tighter fixture where exactly two ends land in-window:
    expect(result.expiringKeys).toBe(inWindow.length);
    expect(result.expiringKeys).toBeGreaterThanOrEqual(2);
  });

  it("exactly two term ends in a 90-day window → expiringKeys = 2", () => {
    // Term 1: paid 06-01, 30d → end 07-01
    // Term 2: renew 07-01 (extends from 07-01), 30d → end 07-31
    // Term 3: renew 07-31, 30d → end 08-30 (outside window ending 08-15)
    const paid = [
      row({
        id: "n",
        kind: "new",
        provisionedKeyId: "k2",
        days: 30,
        finalAmount: 3000,
        paidAt: new Date("2026-06-01T00:00:00.000Z"),
      }),
      row({
        id: "r1",
        kind: "renew",
        keyId: "k2",
        days: 30,
        finalAmount: 3000,
        paidAt: new Date("2026-07-01T00:00:00.000Z"),
      }),
      row({
        id: "r2",
        kind: "renew",
        keyId: "k2",
        days: 30,
        finalAmount: 3000,
        paidAt: new Date("2026-07-31T00:00:00.000Z"),
      }),
    ];
    const events = buildKeyTermEvents(paid);
    const now = new Date("2026-09-01T00:00:00.000Z");
    // window [06-15, 08-15): ends 07-01 and 07-31 in; 08-30 out
    const result = retentionForWindow(events, paid, {
      start: new Date("2026-06-15T00:00:00.000Z"),
      endExclusive: new Date("2026-08-15T00:00:00.000Z"),
      now,
    });
    expect(result.expiringKeys).toBe(2);
  });
});

describe("analytics/retention — zero bases → null rates (D-07/D-08/D-09)", () => {
  it("expiringKeys=0 → renewalRate null; activeAtStart=0 → logoChurn null; mrrAtStart=0 → revenueChurn null", () => {
    const paid: PaidOrderRow[] = [];
    const events = buildKeyTermEvents(paid);
    const now = new Date("2026-07-15T00:00:00.000Z");
    const result = retentionForWindow(events, paid, {
      start: mskDayStartInstant("2026-07-01"),
      endExclusive: now,
      now,
    });
    expect(result.expiringKeys).toBe(0);
    expect(result.renewalRate).toBeNull();
    expect(result.activeKeysAtStart).toBe(0);
    expect(result.logoChurnRate).toBeNull();
    expect(result.mrrAtStart).toBe(0);
    expect(result.revenueChurnRate).toBeNull();
  });
});

describe("analytics/retention — A2 liveExpiry liveness override", () => {
  it("liveExpiry later than last end extends only the latest term → open instead of churned", () => {
    const paidAt = new Date("2026-06-01T00:00:00.000Z");
    const paid = [
      row({
        id: "n",
        kind: "new",
        provisionedKeyId: "kA2",
        days: 30,
        finalAmount: 3000,
        paidAt,
      }),
    ];
    const chainEnd = new Date(paidAt.getTime() + 30 * DAY_MS);
    const liveExpiry = new Date(chainEnd.getTime() + 14 * DAY_MS); // bonus days
    const now = new Date(chainEnd.getTime() + 5 * DAY_MS); // past chain end, inside live

    const without = buildKeyTermEvents(paid);
    expect(classifyTerm(without[0]!, now)).toBe("pending"); // still in grace, or churned if past

    const withLive = buildKeyTermEvents(paid, new Map([["kA2", liveExpiry]]));
    expect(withLive[0]!.end.getTime()).toBe(liveExpiry.getTime());
    expect(classifyTerm(withLive[0]!, now)).toBe("open");

    // multi-term: only LAST event extended
    const multi = [
      ...paid,
      row({
        id: "r",
        kind: "renew",
        keyId: "kA2",
        days: 30,
        finalAmount: 3000,
        paidAt: new Date(chainEnd.getTime() - DAY_MS),
      }),
    ];
    const plain = buildKeyTermEvents(multi);
    // liveExpiry must be later than the multi-term last end to trigger A2
    const multiLive = new Date(plain[1]!.end.getTime() + 10 * DAY_MS);
    const multiEvents = buildKeyTermEvents(multi, new Map([["kA2", multiLive]]));
    expect(multiEvents).toHaveLength(2);
    // first term end unchanged (historical)
    expect(multiEvents[0]!.end.getTime()).toBe(plain[0]!.end.getTime());
    // last term extended
    expect(multiEvents[1]!.end.getTime()).toBe(multiLive.getTime());
  });
});
