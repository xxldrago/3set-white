import { describe, expect, it } from "vitest";
import { detectSelfDealing, detectMutualReferrals, detectIpClusters } from "../../lib/analytics/fraud";

describe("fraud", () => {
  it("detects self-dealing", () => {
    const signals = detectSelfDealing(
      [{ id: "p1", code: "TEST", ownerUserId: 5 }],
      [{ id: "o1", userId: 5, promoCodeId: "p1" }]
    );
    expect(signals.length).toBe(1);
    expect(signals[0].type).toBe("self_dealing");
    expect(signals[0].severity).toBe("высокий риск");
  });

  it("detects mutual referrals", () => {
    const signals = detectMutualReferrals([
      { id: 1, referredById: 2 },
      { id: 2, referredById: 1 },
    ]);
    expect(signals.length).toBe(1);
    expect(signals[0].type).toBe("mutual_referral");
  });

  it("detects ip clusters", () => {
    const signals = detectIpClusters([
      { id: 1, signupIpHash: "abc123", createdAt: new Date() },
      { id: 2, signupIpHash: "abc123", createdAt: new Date() },
      { id: 3, signupIpHash: "abc123", createdAt: new Date() },
    ]);
    expect(signals.length).toBe(1);
    expect(signals[0].type).toBe("ip_cluster");
  });
});
