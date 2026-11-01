// tests/unit/alert-outbox.test.ts
// Unit tests for Phase 13 anomaly alert outbox enqueue (lib/outbox.ts).
// Tests cover enqueue + dedupe behavior.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { prisma } from '../../lib/prisma';
import { enqueueAnomalyAlertNotifications, ALERT_ANOMALY } from '../../lib/outbox';

describe('enqueueAnomalyAlertNotifications', () => {
  const type = 'payment_drop';
  const windowLabel = '2026-10-31';
  const telegramIds = [910000101, 910000102, 910000103];

  beforeEach(async () => {
    // Clean up any existing notifications
    await prisma.notification.deleteMany({
      where: { type: ALERT_ANOMALY },
    });
  });

  afterEach(async () => {
    await prisma.notification.deleteMany({
      where: { type: ALERT_ANOMALY },
    });
  });

  it('creates Notification with correct dedupeKey', async () => {
    const count = await enqueueAnomalyAlertNotifications(type, windowLabel, telegramIds);
    
    expect(count).toBe(3);
    
    const notifications = await prisma.notification.findMany({
      where: { type: ALERT_ANOMALY },
      orderBy: { createdAt: 'asc' },
    });
    
    expect(notifications).toHaveLength(3);
    expect(notifications[0].type).toBe(ALERT_ANOMALY);
    expect(notifications[0].dedupeKey).toBe(`alert:${type}:${windowLabel}:${telegramIds[0]}`);
    expect(notifications[0].userId).toBeNull(); // admin broadcast
  });

  it('skips duplicate enqueue with same dedupeKey', async () => {
    // First enqueue
    const count1 = await enqueueAnomalyAlertNotifications(type, windowLabel, telegramIds);
    expect(count1).toBe(3);
    
    // Second enqueue with same params (simulates retry/duplicate call)
    const count2 = await enqueueAnomalyAlertNotifications(type, windowLabel, telegramIds);
    
    // skipDuplicates should prevent duplicates
    expect(count2).toBe(0);
    
    const notifications = await prisma.notification.findMany({
      where: { type: ALERT_ANOMALY },
    });
    
    expect(notifications).toHaveLength(3); // Still 3, not 6
  });

  it('returns 0 when telegramIds is empty', async () => {
    const count = await enqueueAnomalyAlertNotifications(type, windowLabel, []);
    expect(count).toBe(0);
  });

  it('creates unique dedupeKeys per admin', async () => {
    const count = await enqueueAnomalyAlertNotifications(type, windowLabel, telegramIds);
    
    expect(count).toBe(3);
    
    const dedupeKeys = telegramIds.map((id) => `alert:${type}:${windowLabel}:${id}`);
    
    for (const key of dedupeKeys) {
      const exists = await prisma.notification.findUnique({
        where: { dedupeKey: key },
      });
      expect(exists).not.toBeNull();
    }
  });
});
