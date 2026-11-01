import { describe, expect, it } from "vitest";
import { computePromoRoi } from "../../lib/analytics/promo-roi";

describe("promo-roi", () => {
  it("computes ROI correctly", () => {
    const result = computePromoRoi({ revenue: 10000, discountCost: 1000, commissions: 500 });
    expect(result.contribution).toBe(8500);
    expect(result.roi).toBe(1700);
  });

  it("returns null roi when commissions zero", () => {
    const result = computePromoRoi({ revenue: 10000, discountCost: 1000, commissions: 0 });
    expect(result.roi).toBeNull();
  });
});
