// Pure anomaly detection functions for Phase 13
// Uses Phase 12 compareFlow and comparisonWindows
import { compareFlow } from "./compare";

export interface AlertPayload {
  type: "payment_drop" | "failed_spike" | "ticket_spike" | "runway_low";
  severity: "warning" | "critical";
  message: string;
  actualValue: number;
  thresholdAtFiring: number;
}

export function detectPaymentDrop(
  currentPaidCash: number,
  basePaidCash: number,
  thresholdPercent: number,
): AlertPayload | null {
  const result = compareFlow({ current: currentPaidCash, base: basePaidCash });
  if (result.status !== "ok") return null;
  if (result.pct < -thresholdPercent) {
    return {
      type: "payment_drop",
      severity: Math.abs(result.pct) >= 50 ? "critical" : "warning",
      message: `Падение оплат ${result.pct}% (WoW)`,
      actualValue: result.pct,
      thresholdAtFiring: -thresholdPercent,
    };
  }
  return null;
}

export function detectFailedSpike(
  failedCount: number,
  totalCount: number,
  thresholdRatio: number,
): AlertPayload | null {
  if (totalCount === 0) return null;
  const ratio = (failedCount / totalCount) * 100;
  if (ratio > thresholdRatio) {
    return {
      type: "failed_spike",
      severity: ratio >= 30 ? "critical" : "warning",
      message: `Рост доли failed-платежей ${ratio.toFixed(1)}%`,
      actualValue: ratio,
      thresholdAtFiring: thresholdRatio,
    };
  }
  return null;
}

export function detectTicketSpike(
  currentTickets: number,
  baseTickets: number,
  thresholdPercent: number,
): AlertPayload | null {
  const result = compareFlow({ current: currentTickets, base: baseTickets });
  if (result.status !== "ok") return null;
  if (result.pct > thresholdPercent) {
    return {
      type: "ticket_spike",
      severity: result.pct >= 100 ? "critical" : "warning",
      message: `Всплеск тикетов +${result.pct}% (WoW)`,
      actualValue: result.pct,
      thresholdAtFiring: thresholdPercent,
    };
  }
  return null;
}

export function detectRunwayLow(
  avgBalanceRub: number,
  dailyBurnRub: number,
  thresholdDays: number,
): AlertPayload | null {
  if (dailyBurnRub <= 0) return null;
  const runwayDays = avgBalanceRub / dailyBurnRub;
  if (runwayDays < thresholdDays) {
    return {
      type: "runway_low",
      severity: runwayDays < 2 ? "critical" : "warning",
      message: `Runway баланса ARTEMIDA ${runwayDays.toFixed(1)} дней`,
      actualValue: runwayDays,
      thresholdAtFiring: thresholdDays,
    };
  }
  return null;
}
