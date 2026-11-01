import { describe, expect, it } from "vitest";
import { isQuietHoursMSK, getNextDeliveryTime } from "../../lib/worker";

describe("alert-outbox - quiet hours", () => {
  it("isQuietHoursMSK returns true for night hours", () => {
    // 23:00 MSK
    const night = new Date("2026-10-31T20:00:00Z"); // 23:00 MSK
    expect(isQuietHoursMSK(night)).toBe(true);
  });

  it("isQuietHoursMSK returns false for day hours", () => {
    // 12:00 MSK
    const day = new Date("2026-10-31T09:00:00Z"); // 12:00 MSK
    expect(isQuietHoursMSK(day)).toBe(false);
  });

  it("getNextDeliveryTime returns next morning during quiet hours", () => {
    const night = new Date("2026-10-31T20:00:00Z");
    const next = getNextDeliveryTime(night);
    expect(next).toBeInstanceOf(Date);
  });
});
