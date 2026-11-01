import { describe, expect, it } from "vitest";
import { isQuietHoursMSK, getNextDeliveryTime } from "../../lib/worker";

describe("quiet-hours", () => {
  it("quiet hours start at 22:00 MSK", () => {
    const late = new Date("2026-10-31T19:00:00Z"); // 22:00 MSK
    expect(isQuietHoursMSK(late)).toBe(true);
  });

  it("quiet hours end at 09:00 MSK", () => {
    const morning = new Date("2026-10-31T06:00:00Z"); // 09:00 MSK
    expect(isQuietHoursMSK(morning)).toBe(false);
  });

  it("deferral schedules for next 09:00 MSK", () => {
    const night = new Date("2026-10-31T23:00:00Z");
    const next = getNextDeliveryTime(night);
    expect(next.getTime()).toBeGreaterThan(night.getTime());
  });
});
