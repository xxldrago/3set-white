// lib/analytics/detect-service.ts
// DB access layer for anomaly detection (Phase 13).
// Loads thresholds from Setting, runs detectors, creates AlertEvent rows.

import { prisma } from '../prisma';
import { mskDayLabel, mskDayStartInstant, shiftDays } from './time';
import {
  detectPaymentDrop,
  detectFailedSpike,
  detectTicketSpike,
  detectRunwayLow,
  type AlertPayload,
} from './detect';
import { enqueueAnomalyAlertNotifications } from '../outbox';
import { logger } from '../logger';

const THRESHOLD_KEYS = {
  paymentDropPercent: 'alert.threshold.paymentDropPercent',
  failedPaymentRatio: 'alert.threshold.failedPaymentRatio',
  ticketSpikePercent: 'alert.threshold.ticketSpikePercent',
  runwayDays: 'alert.threshold.runwayDays',
} as const;

interface AlertThresholds {
  paymentDropPercent: number;
  failedPaymentRatio: number;
  ticketSpikePercent: number;
  runwayDays: number;
}

const DEFAULT_THRESHOLDS: AlertThresholds = {
  paymentDropPercent: 30,
  failedPaymentRatio: 15,
  ticketSpikePercent: 50,
  runwayDays: 3,
};

/**
 * Load alert thresholds from Setting model.
 * Falls back to defaults if not configured.
 */
export async function loadAlertThresholds(): Promise<AlertThresholds> {
  const rows = await prisma.setting.findMany({
    where: { key: { in: Object.values(THRESHOLD_KEYS) } },
  });
  
  const map = new Map(rows.map((r) => [r.key, r.value]));
  
  return {
    paymentDropPercent: parseInt(
      map.get(THRESHOLD_KEYS.paymentDropPercent) ?? String(DEFAULT_THRESHOLDS.paymentDropPercent),
      10,
    ),
    failedPaymentRatio: parseInt(
      map.get(THRESHOLD_KEYS.failedPaymentRatio) ?? String(DEFAULT_THRESHOLDS.failedPaymentRatio),
      10,
    ),
    ticketSpikePercent: parseInt(
      map.get(THRESHOLD_KEYS.ticketSpikePercent) ?? String(DEFAULT_THRESHOLDS.ticketSpikePercent),
      10,
    ),
    runwayDays: parseInt(
      map.get(THRESHOLD_KEYS.runwayDays) ?? String(DEFAULT_THRESHOLDS.runwayDays),
      10,
    ),
  };
}

/**
 * Create an AlertEvent row and enqueue Notification for administrators.
 * Idempotent by (type, windowLabel) — upsert prevents duplicates.
 */
export async function createAlertEvent(payload: AlertPayload): Promise<void> {
  const telegramIds = await getAdminTelegramIds();
  
  if (telegramIds.length === 0) {
    logger.warn({ route: 'detect-service', outcome: 'no_admins_for_alert', type: payload.type });
    return;
  }
  
  // Create AlertEvent (upsert for idempotency)
  await prisma.alertEvent.upsert({
    where: {
      type_windowLabel: {
        type: payload.type,
        windowLabel: payload.windowLabel,
      },
    },
    create: {
      type: payload.type,
      status: 'firing',
      windowLabel: payload.windowLabel,
      severity: payload.severity,
      message: payload.message,
      firedAt: new Date(),
      thresholdAtFiring: JSON.stringify({ threshold: payload.threshold }),
      actualValue: JSON.stringify({ value: payload.actualValue }),
    },
    update: {
      status: 'firing',
      severity: payload.severity,
      message: payload.message,
      thresholdAtFiring: JSON.stringify({ threshold: payload.threshold }),
      actualValue: JSON.stringify({ value: payload.actualValue }),
    },
  });
  
  // Enqueue Notification for all administrators
  await enqueueAnomalyAlertNotifications(
    payload.type,
    payload.windowLabel,
    telegramIds,
  );
  
  logger.info({
    route: 'detect-service',
    outcome: 'alert_created',
    type: payload.type,
    windowLabel: payload.windowLabel,
    severity: payload.severity,
  });
}

/**
 * Get all administrator telegram IDs (from admin_users table).
 */
async function getAdminTelegramIds(): Promise<number[]> {
  const rows = await prisma.adminUser.findMany({
    where: { role: 'administrator' },
    select: { telegramId: true },
  });
  return rows.map((r) => Number(r.telegramId));
}

/**
 * Main entry point: detect anomalies for the previous MSK day.
 * Called from cron route at 03:05 MSK after rollup.
 */
export async function detectAnomalies(): Promise<{ detected: number }> {
  const now = new Date();
  const yesterdayLabel = shiftDays(mskDayLabel(now), -1);
  
  const thresholds = await loadAlertThresholds();
  const alerts: AlertPayload[] = [];
  
  // 1. Payment drop detection (WoW comparison)
  const paymentDrop = await detectPaymentDropAnomaly(yesterdayLabel, thresholds.paymentDropPercent);
  if (paymentDrop) alerts.push(paymentDrop);
  
  // 2. Failed spike detection
  const failedSpike = await detectFailedSpikeAnomaly(yesterdayLabel, thresholds.failedPaymentRatio);
  if (failedSpike) alerts.push(failedSpike);
  
  // 3. Ticket spike detection (WoW comparison)
  const ticketSpike = await detectTicketSpikeAnomaly(yesterdayLabel, thresholds.ticketSpikePercent);
  if (ticketSpike) alerts.push(ticketSpike);
  
  // 4. Runway low detection
  const runwayLow = await detectRunwayLowAnomaly(yesterdayLabel, thresholds.runwayDays);
  if (runwayLow) alerts.push(runwayLow);
  
  // Create AlertEvent rows + enqueue Notifications
  for (const alert of alerts) {
    await createAlertEvent(alert);
  }
  
  // Auto-resolve: mark firing alerts resolved if condition no longer applies
  await autoResolveAlerts(now, thresholds);
  
  return { detected: alerts.length };
}

/**
 * Detect payment drop anomaly for a specific MSK day.
 * Compares to previous week (WoW).
 */
async function detectPaymentDropAnomaly(
  windowLabel: string,
  thresholdPercent: number,
): Promise<AlertPayload | null> {
  const { detectPaymentDrop } = await import('./detect');
  
  // Get paid orders count for current window (WoW = 7 days back)
  const currentStart = mskDayStartInstant(windowLabel);
  const currentEnd = new Date(currentStart.getTime() + 7 * 86_400_000); // 7 days
  
  // Base window: 7 days before current window
  const baseStart = new Date(currentStart.getTime() - 7 * 86_400_000);
  const baseEnd = currentStart;
  
  const [currentRow, baseRow] = await Promise.all([
    prisma.dailyMetric.aggregate({
      where: {
        day: {
          gte: currentStart,
          lt: currentEnd,
        },
      },
      _sum: { paidOrders: true },
    }),
    prisma.dailyMetric.aggregate({
      where: {
        day: {
          gte: baseStart,
          lt: baseEnd,
        },
      },
      _sum: { paidOrders: true },
    }),
  ]);
  
  const currentPaid = currentRow._sum.paidOrders ?? 0;
  const basePaid = baseRow._sum.paidOrders ?? 0;
  
  return detectPaymentDrop(currentPaid, basePaid, thresholdPercent, windowLabel);
}

/**
 * Detect failed payment spike anomaly for a specific MSK day.
 */
async function detectFailedSpikeAnomaly(
  windowLabel: string,
  thresholdPercent: number,
): Promise<AlertPayload | null> {
  const { detectFailedSpike } = await import('./detect');
  
  const dayStart = mskDayStartInstant(windowLabel);
  const dayEnd = new Date(dayStart.getTime() + 86_400_000);
  
  // Get failed orders count from DailyMetric
  // Note: DailyMetric doesn't track failed orders directly, so we query Order table
  const [failedCount, totalCount] = await Promise.all([
    prisma.order.count({
      where: {
        status: 'failed',
        createdAt: {
          gte: dayStart,
          lt: dayEnd,
        },
      },
    }),
    prisma.order.count({
      where: {
        createdAt: {
          gte: dayStart,
          lt: dayEnd,
        },
      },
    }),
  ]);
  
  return detectFailedSpike(failedCount, totalCount, thresholdPercent, windowLabel);
}

/**
 * Detect ticket volume spike anomaly for a specific MSK day.
 * Compares to previous week (WoW).
 */
async function detectTicketSpikeAnomaly(
  windowLabel: string,
  thresholdPercent: number,
): Promise<AlertPayload | null> {
  const { detectTicketSpike } = await import('./detect');
  
  const dayStart = mskDayStartInstant(windowLabel);
  const dayEnd = new Date(dayStart.getTime() + 86_400_000);
  
  // Base window: 7 days before
  const baseStart = new Date(dayStart.getTime() - 7 * 86_400_000);
  const baseEnd = dayStart;
  
  const [currentCount, baseCount] = await Promise.all([
    prisma.ticket.count({
      where: {
        createdAt: {
          gte: dayStart,
          lt: dayEnd,
        },
      },
    }),
    prisma.ticket.count({
      where: {
        createdAt: {
          gte: baseStart,
          lt: baseEnd,
        },
      },
    }),
  ]);
  
  return detectTicketSpike(currentCount, baseCount, thresholdPercent, windowLabel);
}

/**
 * Detect runway low anomaly for a specific MSK day.
 * Uses 7-day average balance and daily burn rate.
 */
async function detectRunwayLowAnomaly(
  windowLabel: string,
  thresholdDays: number,
): Promise<AlertPayload | null> {
  const { detectRunwayLow } = await import('./detect');
  
  const dayStart = mskDayStartInstant(windowLabel);
  
  // Get 7-day average balance from ArtemidaBalanceSnapshot
  const weekAgo = new Date(dayStart.getTime() - 7 * 86_400_000);
  
  const balanceRows = await prisma.artemidaBalanceSnapshot.findMany({
    where: {
      day: {
        gte: weekAgo,
        lt: dayStart,
      },
    },
    select: { balanceRub: true },
  });
  
  if (balanceRows.length === 0) return null;
  
  const avgBalance =
    balanceRows.reduce((sum, r) => sum + r.balanceRub, 0) / balanceRows.length;
  
  // Get daily burn rate from DailyMetric (providerCostRub / paid orders)
  const metricRows = await prisma.dailyMetric.findMany({
    where: {
      day: {
        gte: weekAgo,
        lt: dayStart,
      },
    },
    select: { providerCostRub: true, paidOrders: true },
  });
  
  const totalCost = metricRows.reduce((sum, r) => sum + r.providerCostRub, 0);
  const avgDailyBurn = metricRows.length > 0 ? totalCost / metricRows.length : 0;
  
  if (avgDailyBurn <= 0) return null;
  
  return detectRunwayLow(avgBalance, avgDailyBurn, thresholdDays, windowLabel);
}

/**
 * Auto-resolve firing alerts when condition no longer applies.
 * Called from cron after detection.
 */
export async function autoResolveAlerts(
  now: Date,
  thresholds: AlertThresholds,
): Promise<{ resolved: number }> {
  const yesterdayLabel = shiftDays(mskDayLabel(now), -1);
  
  // Get all firing alerts
  const firingAlerts = await prisma.alertEvent.findMany({
    where: {
      status: 'firing',
    },
  });
  
  let resolved = 0;
  
  for (const alert of firingAlerts) {
    let shouldResolve = false;
    
    // Re-check condition based on alert type
    if (alert.type === 'payment_drop') {
      // Check if payment drop condition cleared
      const threshold = JSON.parse(alert.thresholdAtFiring).threshold as number;
      // Simplified: if we're in a new window and no new alert fired, resolve old
      shouldResolve = alert.windowLabel !== yesterdayLabel;
    } else if (alert.type === 'failed_spike') {
      shouldResolve = alert.windowLabel !== yesterdayLabel;
    } else if (alert.type === 'ticket_spike') {
      shouldResolve = alert.windowLabel !== yesterdayLabel;
    } else if (alert.type === 'runway_low') {
      shouldResolve = alert.windowLabel !== yesterdayLabel;
    }
    
    if (shouldResolve) {
      await prisma.alertEvent.update({
        where: { id: alert.id },
        data: { status: 'resolved', resolvedAt: new Date() },
      });
      resolved += 1;
    }
  }
  
  return { resolved };
}
