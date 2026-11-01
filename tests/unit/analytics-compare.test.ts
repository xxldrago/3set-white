// tests/unit/analytics-compare.test.ts
import { describe, expect, it } from "vitest";
import { comparisonWindows, windowPair } from "../../lib/analytics/windows";
import { compareFlow, formatDelta, formatPct } from "../../lib/analytics/compare";
import { classifyDegraded, summarizeOpen } from "../../lib/analytics/quality";

const FIXED_NOW = new Date("2026-10-31T15:00:00.000Z"); // some time in MSK

describe("analytics/windows - WoW/MoM/90 days", () => {
  it("windowPair for period 7 returns current 7 complete MSK days and base 7 before (WoW)", () => {
    const w = comparisonWindows(7, FIXED_NOW);
    expect(w.fromDay).toBeTruthy();
    expect(w.toDay).toBeTruthy();
    expect(w.baseFromDay).toBeTruthy();
    expect(w.baseToDay).toBeTruthy();
    // today is excluded
    const today = "2026-10-31";
    expect(w.toDay).not.toBe(today);
    expect(w.baseToDay).not.toBe(today);
  });

  it("windowPair for period 30 returns previous MSK calendar month", () => {
    const w = comparisonWindows(30, FIXED_NOW);
    expect(w.fromDay).toMatch(/^\d{4}-\d{2}-01$/);
  });

  it("windowPair for period 90 returns previous 90 days", () => {
    const w = comparisonWindows(90, FIXED_NOW);
    expect(w.fromDay).toBeTruthy();
    expect(w.toDay).toBeTruthy();
  });

  it("today is excluded from both current and base windows (D-04)", () => {
    const w = comparisonWindows(7, FIXED_NOW);
    expect(w.toDay).not.toBe("2026-10-31");
    expect(w.baseToDay).not.toBe("2026-10-31");
  });

  it("current window upper bound is end-exclusive", () => {
    const w = comparisonWindows(7, FIXED_NOW);
    expect(w.toDay > w.fromDay).toBe(true);
  });
});

describe("analytics/compare - compareFlow", () => {
  it("compareFlow returns ok with absolute delta, percent delta for comparable pair", () => {
    const result = compareFlow({ current: 1200, base: 1000, baselineLabel: "к прошлой неделе" });
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.abs).toBe(200);
      expect(result.pct).toBe(20);
    }
  });

  it("compareFlow returns no-base for zero base with percent null and absolute delta visible", () => {
    const result = compareFlow({ current: 500, base: 0 });
    expect(result.status).toBe("no-base");
    if (result.status === "no-base") {
      expect(result.pct).toBe(null);
      expect(result.abs).toBe(500);
    }
  });

  it("compareFlow returns incomparable when base window has degraded events", () => {
    const result = compareFlow({ current: 1200, base: 1000, baseCoverageOk: false });
    expect(result.status).toBe("incomparable");
  });
});

describe("analytics/quality - classifyDegraded and summarizeOpen", () => {
  it("classifyDegraded true for timeout, 5xx after retries, 429 exhausted, 401, 402", () => {
    expect(classifyDegraded({ code: "timeout" })).toBe(true);
    expect(classifyDegraded({ status: 500 })).toBe(true);
    expect(classifyDegraded({ status: 502 })).toBe(true);
    expect(classifyDegraded({ status: 429 })).toBe(true);
    expect(classifyDegraded({ status: 401 })).toBe(true);
    expect(classifyDegraded({ status: 402 })).toBe(true);
  });

  it("classifyDegraded false for suspiciously empty response or 404/409 (D-06)", () => {
    expect(classifyDegraded({ status: 404 })).toBe(false);
    expect(classifyDegraded({ status: 409 })).toBe(false);
    expect(classifyDegraded({ code: "empty_response" })).toBe(false);
  });

  it("summarizeOpen returns excluded count and event details for open events in window", () => {
    const events = [
      { id: "1", source: "artemida", reason: "timeout", msk_day: "2026-10-30", createdAt: new Date() },
      { id: "2", source: "artemida", reason: "5xx", msk_day: "2026-10-29", createdAt: new Date(), resolvedAt: new Date() },
    ];
    const summary = summarizeOpen(events as any, "2026-10-25", "2026-10-31");
    expect(summary.excluded).toBe(1);
    expect(summary.events.length).toBe(1);
  });
});

describe("format helpers", () => {
  it("formatDelta adds sign", () => {
    expect(formatDelta(200)).toBe("+200");
    expect(formatDelta(-50)).toBe("-50");
  });

  it("formatPct shows — for null", () => {
    expect(formatPct(null)).toBe("—");
    expect(formatPct(20)).toBe("+20%");
  });
});
