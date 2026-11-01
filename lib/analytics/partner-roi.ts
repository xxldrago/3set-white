// Pure partner ROI calculations
export interface PartnerRoiInput {
  attributedRevenue: number;
  commissions: number;
  payoutsApproved: number;
  payoutsPending: number;
  providerCost: number | null;
}

export interface PartnerRoiResult {
  accrualRoi: number | null;
  cashPosition: number;
  contribution: number | null;
}

export function computePartnerRoi(input: PartnerRoiInput): PartnerRoiResult {
  const { attributedRevenue, commissions, payoutsApproved, payoutsPending, providerCost } = input;
  
  const cashPosition = commissions - payoutsApproved - payoutsPending;
  
  if (providerCost === null) {
    return {
      accrualRoi: null,
      cashPosition,
      contribution: null,
    };
  }
  
  const contribution = attributedRevenue - providerCost - commissions;
  
  if (commissions === 0) {
    return {
      accrualRoi: null,
      cashPosition,
      contribution,
    };
  }
  
  const accrualRoi = (contribution / commissions) * 100;
  return {
    accrualRoi: Math.round(accrualRoi * 100) / 100,
    cashPosition,
    contribution,
  };
}
