// DB access + alert creation for Phase 13 anomaly detection
import { prisma } from "../prisma";
import { mskDayLabel } from "./time";
import { comparisonWindows } from "./windows";
import { detectPaymentDrop, detectFailedSpike, detectTicketSpike, detectRunwayLow } from "./detect";
import { enqueueAnomalyAlert } from "../outbox";

const THRESHOLD_KEYS = {
  paymentDropPercent: "alert.threshold.paymentDropPercent",
  failedPaymentRatio: "alert.threshold.failedPaymentRatio",
  ticketSpikePercent: "alert.threshold.ticketSpikePercent",
  runwayDays: "alert.threshold.runwayDays",
} as const;

const DEFAULTS = {
  paymentDropPercent: 30,
  failedPaymentRatio: 15,
  ticketSpikePercent: 50,
  runwayDays: 3,
};

export async function loadAlertThresholds() {
  const rows = await prisma.setting.findMany({
    where: { key: { in: Object.values(THRESHOLD_KEYS) } },
  });
  const map = new Map(rows.map((r) => [r.key, parseInt(r.value)]));
  return {
    paymentDropPercent: map.get(THRESHOLD_KEYS.paymentDropPercent) ?? DEFAULTS.paymentDropPercent,
    failedPaymentRatio: map.get(THRESHOLD_KEYS.failedPaymentRatio) ?? DEFAULTS.failedPaymentRatio,
    ticketSpikePercent: map.get(THRESHOLD_KEYS.ticketSpikePercent) ?? DEFAULTS.ticketSpikePercent,
    runwayDays: map.get(THRESHOLD_KEYS.runwayDays) ?? DEFAULTS.runwayDays,
  };
}

async function createAlertEvent(input: {
  type: string;
  windowLabel: string;
  severity: string;
  message: string;
  actualValue: number;
  thresholdAtFiring: number;
}) {
  // Check if alert already exists for this type/windowLabel (dedupe)
  const existing = await prisma.alertEvent.findUnique({
    where: { type_windowLabel: { type: input.type, windowLabel: input.windowLabel } },
  });
  if (existing && existing.status === "firing") {
    return; // already firing, don't spam
  }
  await prisma.alertEvent.create({
    data: {
      type: input.type,
      windowLabel: input.windowLabel,
      status: "firing",
      severity: input.severity,
      message: input.message,
      firedAt: new Date(),
      thresholdAtFiring: String(input.thresholdAtFiring),
      actualValue: String(input.actualValue),
    },
  });
  // Enqueue notification for all admins
  try {
    const admins = await (prisma as any).adminUser?.findMany({
      where: { role: "administrator" },
      select: { telegramId: true },
    }) || [];
    const userIds = admins.map((a: any) => Number(a.telegramId)).filter((id: number) => !isNaN(id));
    if (userIds.length > 0) {
      await enqueueAnomalyAlert(input.type, input.windowLabel, userIds);
    }
  } catch (e) {
    // Best effort
  }
}

export async function detectAnomalies() {
  const now = new Date();
  const windowLabel = mskDayLabel(new Date(now.getTime() - 86_400_000)); // yesterday
  const thresholds = await loadAlertThresholds();
  
  // Payment drop detection
  try {
    const windows = comparisonWindows(7, now);
    const currentCash = await prisma.order.aggregate({
      where: {
        status: { in: ["paid", "provisioning", "provisioned"] },
        paidAt: { gte: new Date(windows.fromDay + "T00:00:00.000Z"), lt: new Date(windows.toDay + "T00:00:00.000Z") },
      },
      _sum: { finalAmount: true, balanceUsed: true },
    });
    const baseCash = await prisma.order.aggregate({
      where: {
        status: { in: ["paid", "provisioning", "provisioned"] },
        paidAt: { gte: new Date(windows.baseFromDay + "T00:00:00.000Z"), lt: new Date(windows.baseToDay + "T00:00:00.000Z") },
      },
      _sum: { finalAmount: true, balanceUsed: true },
    });
    const current = (currentCash._sum.finalAmount || 0) - (currentCash._sum.balanceUsed || 0);
    const base = (baseCash._sum.finalAmount || 0) - (baseCash._sum.balanceUsed || 0);
    const alert = detectPaymentDrop(current, base, thresholds.paymentDropPercent);
    if (alert) {
      await createAlertEvent({ type: alert.type, windowLabel, severity: alert.severity, message: alert.message, actualValue: alert.actualValue, thresholdAtFiring: alert.thresholdAtFiring });
    }
  } catch (e) {
    console.error("Payment drop detection failed:", e);
  }
  
  // Failed spike detection
  try {
    const yesterday = new Date(now.getTime() - 86_400_000);
    const dayStart = new Date(yesterday.toISOString().slice(0, 10) + "T00:00:00.000Z");
    const dayEnd = new Date(yesterday.toISOString().slice(0, 10) + "T23:59:59.999Z");
    const failed = await prisma.order.count({
      where: { status: "failed", paidAt: { gte: dayStart, lte: dayEnd } },
    });
    const total = await prisma.order.count({
      where: { paidAt: { gte: dayStart, lte: dayEnd } },
    });
    const alert = detectFailedSpike(failed, total, thresholds.failedPaymentRatio);
    if (alert) {
      await createAlertEvent({ type: alert.type, windowLabel, severity: alert.severity, message: alert.message, actualValue: alert.actualValue, thresholdAtFiring: alert.thresholdAtFiring });
    }
  } catch (e) {
    console.error("Failed spike detection failed:", e);
  }
  
  // Ticket spike detection
  try {
    const windows = comparisonWindows(7, now);
    const currentTickets = await prisma.ticket.count({
      where: { createdAt: { gte: new Date(windows.fromDay + "T00:00:00.000Z"), lt: new Date(windows.toDay + "T00:00:00.000Z") } },
    });
    const baseTickets = await prisma.ticket.count({
      where: { createdAt: { gte: new Date(windows.baseFromDay + "T00:00:00.000Z"), lt: new Date(windows.baseToDay + "T00:00:00.000Z") } },
    });
    const alert = detectTicketSpike(currentTickets, baseTickets, thresholds.ticketSpikePercent);
    if (alert) {
      await createAlertEvent({ type: alert.type, windowLabel, severity: alert.severity, message: alert.message, actualValue: alert.actualValue, thresholdAtFiring: alert.thresholdAtFiring });
    }
  } catch (e) {
    console.error("Ticket spike detection failed:", e);
  }
  
  // Runway low detection
  try {
    const snapshots = await prisma.artemidaBalanceSnapshot.findMany({
      orderBy: { day: "desc" },
      take: 7,
    });
    if (snapshots.length > 0) {
      const avgBalance = snapshots.reduce((sum, s) => sum + s.balanceRub, 0) / snapshots.length;
      // Estimate daily burn from Phase 12 metrics
      const dailyBurn = 1000; // placeholder - should be calculated from provider costs
      const alert = detectRunwayLow(avgBalance, dailyBurn, thresholds.runwayDays);
      if (alert) {
        await createAlertEvent({ type: alert.type, windowLabel, severity: alert.severity, message: alert.message, actualValue: alert.actualValue, thresholdAtFiring: alert.thresholdAtFiring });
      }
    }
  } catch (e) {
    console.error("Runway detection failed:", e);
  }
  
  // Auto-resolve
  try {
    const firingAlerts = await prisma.alertEvent.findMany({
      where: { status: "firing", windowLabel: { lt: windowLabel } },
    });
    for (const alert of firingAlerts) {
      // Auto-resolve old firing alerts for now
      await prisma.alertEvent.update({
        where: { id: alert.id },
        data: { status: "resolved", resolvedAt: new Date() },
      });
    }
  } catch (e) {
    console.error("Auto-resolve failed:", e);
  }
}
