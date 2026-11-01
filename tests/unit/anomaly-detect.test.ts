import { describe, expect, it } from "vitest";
import { detectPaymentDrop, detectFailedSpike, detectTicketSpike, detectRunwayLow } from "../../lib/analytics/detect";

describe("anomaly-detect - payment drop", () => {
  it("detects payment drop when WoW delta < -threshold", () => {
    const alert = detectPaymentDrop(6000, 10000, 30);
    expect(alert).not.toBeNull();
    expect(alert?.type).toBe("payment_drop");
    expect(alert?.severity).toBe("warning");
  });

  it("returns null when within threshold", () => {
    const alert = detectPaymentDrop(9000, 10000, 30);
    expect(alert).toBeNull();
  });
});

describe("anomaly-detect - failed spike", () => {
  it("detects failed spike when ratio > threshold", () => {
    const alert = detectFailedSpike(20, 100, 15);
    expect(alert).not.toBeNull();
    expect(alert?.type).toBe("failed_spike");
  });

  it("returns null when ratio <= threshold", () => {
    const alert = detectFailedSpike(10, 100, 15);
    expect(alert).toBeNull();
  });
});

describe("anomaly-detect - ticket spike", () => {
  it("detects ticket spike when WoW delta > threshold", () => {
    const alert = detectTicketSpike(160, 100, 50);
    expect(alert).not.toBeNull();
    expect(alert?.type).toBe("ticket_spike");
  });

  it("returns null when within threshold", () => {
    const alert = detectTicketSpike(120, 100, 50);
    expect(alert).toBeNull();
  });
});

describe("anomaly-detect - runway low", () => {
  it("detects runway low when days < threshold", () => {
    const alert = detectRunwayLow(2000, 1000, 3);
    expect(alert).not.toBeNull();
    expect(alert?.type).toBe("runway_low");
  });

  it("returns null when days >= threshold", () => {
    const alert = detectRunwayLow(5000, 1000, 3);
    expect(alert).toBeNull();
  });
});
