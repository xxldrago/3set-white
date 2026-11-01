// lib/analytics/compare.ts
// Pure comparison flow for Phase 12 - WoW/MoM/delta calculation.
// D-03: zero base → "—" + "нет базы", absolute delta still visible, no ∞%, no "новое"
// D-05: incomparable coverage → no number shown, muted marker, not partial
// No division by zero, explicit signs.

export type CompareStatus = 'ok' | 'no-base' | 'incomparable';

export interface CompareResultOk {
  status: 'ok';
  abs: number;      // absolute delta (current - base)
  pct: number;      // percentage, max one fractional digit
  baseline: string; // baseline label
}

export interface CompareResultNoBase {
  status: 'no-base';
  abs: number;
  pct: null;
  reason: 'zero';
}

export interface CompareResultIncomparable {
  status: 'incomparable';
  reason: string;
}

export type CompareResult = CompareResultOk | CompareResultNoBase | CompareResultIncomparable;

export interface CompareInput {
  current: number;
  base: number;
  baseCoverageOk?: boolean;
  currentCoverageOk?: boolean;
  baselineLabel?: string;
}

export function compareFlow(input: CompareInput): CompareResult {
  const { current = 0, base = 0, baseCoverageOk = true, currentCoverageOk = true, baselineLabel = '' } = input;
  
  // Incomparable if coverage is insufficient
  if (baseCoverageOk === false || currentCoverageOk === false) {
    return {
      status: 'incomparable',
      reason: 'coverage',
    };
  }
  
  // Zero base
  if (base === 0 && current === 0) {
    return {
      status: 'no-base',
      abs: 0,
      pct: null,
      reason: 'zero',
    };
  }
  
  if (base === 0 && current > 0) {
    // New data with zero base
    return {
      status: 'no-base',
      abs: current,
      pct: null,
      reason: 'zero',
    };
  }
  
  if (base === 0 && current < 0) {
    return {
      status: 'no-base',
      abs: current,
      pct: null,
      reason: 'zero',
    };
  }
  
  const abs = current - base;
  const pct = Math.round((abs / base) * 1000) / 10; // max one fractional digit
  
  return {
    status: 'ok',
    abs,
    pct,
    baseline: baselineLabel,
  };
}

export function formatDelta(abs: number): string {
  if (abs >= 0) {
    return `+${abs.toLocaleString('ru-RU')}`;
  }
  return abs.toLocaleString('ru-RU');
}

export function formatPct(pct: number | null): string {
  if (pct === null || pct === undefined) {
    return '—';
  }
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct}%`;
}
