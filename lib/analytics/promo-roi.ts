// Pure promo ROI calculations
export interface PromoRoiInput {
  revenue: number;
  discountCost: number;
  commissions: number;
}

export interface PromoRoiResult {
  roi: number | null;
  breakEven: boolean;
  contribution: number;
}

export function computePromoRoi(input: PromoRoiInput): PromoRoiResult {
  const { revenue, discountCost, commissions } = input;
  const contribution = revenue - discountCost - commissions;
  
  if (commissions === 0) {
    return {
      roi: null,
      breakEven: false,
      contribution,
    };
  }
  
  const roi = (contribution / commissions) * 100;
  return {
    roi: Math.round(roi * 100) / 100,
    breakEven: roi >= 0,
    contribution,
  };
}

export function splitByNewReturning<T extends { isNew: boolean }>(
  items: T[]
): { newItems: T[]; returningItems: T[] } {
  const newItems: T[] = [];
  const returningItems: T[] = [];
  for (const item of items) {
    if (item.isNew) {
      newItems.push(item);
    } else {
      returningItems.push(item);
    }
  }
  return { newItems, returningItems };
}
