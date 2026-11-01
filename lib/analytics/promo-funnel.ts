// Pure promo funnel calculations
export interface FunnelInput {
  clicks: number;
  registers: number;
  pays: number;
}

export interface FunnelResult {
  clicks: number;
  registers: number;
  pays: number;
  cvr1: number; // click -> register
  cvr2: number; // register -> pay
}

export function computeFunnel(input: FunnelInput): FunnelResult {
  const { clicks, registers, pays } = input;
  const cvr1 = clicks > 0 ? (registers / clicks) * 100 : 0;
  const cvr2 = registers > 0 ? (pays / registers) * 100 : 0;
  return {
    clicks,
    registers,
    pays,
    cvr1: Math.round(cvr1 * 100) / 100,
    cvr2: Math.round(cvr2 * 100) / 100,
  };
}
