import { describe, expect, it } from "vitest";
import { computePartnerRoi } from "../../lib/analytics/partner-roi";

describe("partner-roi", () => {
  it("computes both accrual roi and cash position", () => {
    const result = computePartnerRoi({
      attributedRevenue: 10000,
      commissions: 1000,
      payoutsApproved: 300,
      payoutsPending: 200,
      providerCost: 5000,
    });
    expect(result.contribution).toBe(4000);
    expect(result.accrualRoi).toBe(400);
    expect(result.cashPosition).toBe(500);
  });
});
