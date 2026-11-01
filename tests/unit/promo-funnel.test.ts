import { describe, expect, it } from "vitest";
import { computeFunnel } from "../../lib/analytics/promo-funnel";

describe("promo-funnel", () => {
  it("computes funnel correctly", () => {
    const result = computeFunnel({ clicks: 100, registers: 10, pays: 2 });
    expect(result.clicks).toBe(100);
    expect(result.registers).toBe(10);
    expect(result.pays).toBe(2);
    expect(result.cvr1).toBe(10);
    expect(result.cvr2).toBe(20);
  });

  it("handles zero clicks", () => {
    const result = computeFunnel({ clicks: 0, registers: 0, pays: 0 });
    expect(result.cvr1).toBe(0);
    expect(result.cvr2).toBe(0);
  });
});
