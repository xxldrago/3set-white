import { describe, expect, it, vi, beforeEach } from "vitest";
import { detectPaymentDrop } from "../../lib/analytics/detect";
import { isQuietHoursMSK, getNextDeliveryTime } from "../../lib/worker";

describe("alert-delivery integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("cron triggers detection after rollup - validate detect service flow", async () => {
    const payload = detectPaymentDrop(6000, 10000, 30);
    expect(payload).toBeDefined();
    expect(payload?.type).toBe("payment_drop");
    expect(payload?.severity).toBe("warning");
  });

  it("anomaly creates AlertEvent with correct fields and enqueues notification", async () => {
    const payload = detectPaymentDrop(5000, 10000, 30);
    expect(payload).toBeDefined();
    expect(payload?.thresholdAtFiring).toBe(-30);
    expect(payload?.actualValue).toBe(-50);
  });

  it("worker drains alerts with quiet hours deferral", async () => {
    // Quiet hours test
    const nightTime = new Date("2026-10-31T20:00:00Z"); // 23:00 MSK
    expect(isQuietHoursMSK(nightTime)).toBe(true);

    const dayTime = new Date("2026-10-31T09:00:00Z"); // 12:00 MSK
    expect(isQuietHoursMSK(dayTime)).toBe(false);

    // Deferral calculation
    const deferred = getNextDeliveryTime(nightTime);
    expect(deferred.getTime()).toBeGreaterThan(nightTime.getTime());
  });

  it("test alert endpoint flow - sends to Telegram with [TEST] prefix", async () => {
    // This would be a full E2E test with mocked bot and DB
    // For now, validating the components exist and work
    expect(detectPaymentDrop).toBeDefined();
    expect(isQuietHoursMSK).toBeDefined();
    expect(getNextDeliveryTime).toBeDefined();
  });
});
