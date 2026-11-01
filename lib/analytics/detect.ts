// lib/analytics/detect.ts
// Pure anomaly detection functions for Phase 13 - no DB access, pure functions only.
// Reuses Phase 12 compareFlow for WoW/MoM delta-based detection.

import { compareFlow, type CompareResult } from './compare';

export type AlertType = 'payment_drop' | 'failed_spike' | 'ticket_spike' | 'runway_low';

export interface AlertPayload {
  type: AlertType;
  severity: 'warning' | 'critical';
  message: string;
  actualValue: number | string;
  threshold: number;
  windowLabel: string; // MSK day label (YYYY-MM-DD)
}

/**
 * Detect payment drop anomaly.
 * Fires when WoW delta < -threshold (e.g., -30% means payments dropped by 30%+).
 */
export function detectPaymentDrop(
  currentPaid: number,
  basePaid: number,
  thresholdPercent: number,
  windowLabel: string,
): AlertPayload | null {
  if (currentPaid < 0 || basePaid < 0) return null;
  
  const result = compareFlow({
    current: currentPaid,
    base: basePaid,
    baseCoverageOk: true,
    currentCoverageOk: true,
  });
  
  if (result.status !== 'ok') return null;
  
  // Check if drop exceeds threshold (negative delta)
  if (result.pct < -thresholdPercent) {
    const severity = result.pct < -(thresholdPercent * 2) ? 'critical' : 'warning';
    return {
      type: 'payment_drop',
      severity,
      message: `Падение оплат на ${Math.abs(result.pct)}% (WoW): ${basePaid} → ${currentPaid}`,
      actualValue: currentPaid,
      threshold: thresholdPercent,
      windowLabel,
    };
  }
  
  return null;
}

/**
 * Detect failed payment spike anomaly.
 * Fires when failed ratio > threshold (e.g., >15% of orders failed).
 */
export function detectFailedSpike(
  failedCount: number,
  totalCount: number,
  thresholdPercent: number,
  windowLabel: string,
): AlertPayload | null {
  if (totalCount <= 0 || failedCount < 0) return null;
  
  const failedRatio = (failedCount / totalCount) * 100;
  
  if (failedRatio > thresholdPercent) {
    const severity = failedRatio > (thresholdPercent * 2) ? 'critical' : 'warning';
    return {
      type: 'failed_spike',
      severity,
      message: `Рост доли failed-платежей: ${failedRatio.toFixed(1)}% (${failedCount}/${totalCount})`,
      actualValue: failedRatio,
      threshold: thresholdPercent,
      windowLabel,
    };
  }
  
  return null;
}

/**
 * Detect ticket volume spike anomaly.
 * Fires when WoW delta > threshold (e.g., +50% means tickets increased by 50%+).
 */
export function detectTicketSpike(
  currentTickets: number,
  baseTickets: number,
  thresholdPercent: number,
  windowLabel: string,
): AlertPayload | null {
  if (currentTickets < 0 || baseTickets < 0) return null;
  
  const result = compareFlow({
    current: currentTickets,
    base: baseTickets,
    baseCoverageOk: true,
    currentCoverageOk: true,
  });
  
  if (result.status !== 'ok') return null;
  
  // Check if spike exceeds threshold (positive delta)
  if (result.pct > thresholdPercent) {
    const severity = result.pct > (thresholdPercent * 2) ? 'critical' : 'warning';
    return {
      type: 'ticket_spike',
      severity,
      message: `Всплеск тикетов на ${result.pct}% (WoW): ${baseTickets} → ${currentTickets}`,
      actualValue: currentTickets,
      threshold: thresholdPercent,
      windowLabel,
    };
  }
  
  return null;
}

/**
 * Detect runway low anomaly (ARTEMIDA balance runway).
 * Fires when avgBalance / dailyBurn < thresholdDays.
 */
export function detectRunwayLow(
  avgBalanceRub: number,
  dailyBurnRub: number,
  thresholdDays: number,
  windowLabel: string,
): AlertPayload | null {
  if (avgBalanceRub < 0 || dailyBurnRub <= 0) return null;
  
  const runwayDays = avgBalanceRub / dailyBurnRub;
  
  if (runwayDays < thresholdDays) {
    const severity = runwayDays < (thresholdDays / 2) ? 'critical' : 'warning';
    return {
      type: 'runway_low',
      severity,
      message: `Низкий runway баланса: ${runwayDays.toFixed(1)} дн. (баланс ${avgBalanceRub} ₽ / сгорание ${dailyBurnRub} ₽/день)`,
      actualValue: runwayDays,
      threshold: thresholdDays,
      windowLabel,
    };
  }
  
  return null;
}
