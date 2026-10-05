// Outbox access layer (D-38/D-41) — the durable queue that makes fulfillment
// survive a process restart, an ARTEMIDA 502/429, or a lost callback.
//
// Every enqueue is idempotent on the UNIQUE `(orderId, type)` pair (D-38): a
// duplicate CONFIRMED delivery, a reconcile recovery, or a retry all collapse to
// one row. Claiming is atomic via a single conditional `updateMany` (mirrors
// `claimTrial`): `count === 1` means this tick won the row, `count === 0` means a
// concurrent drain already took it. The worker never mints a second job.
import type { Outbox } from "../generated/prisma/client";
import { prisma } from "./prisma";

/** Fulfillment job: provision the key for a paid order (the worker owns it). */
export const FULFILL_JOB = "fulfill-order";
/** Delivery job: push the provisioned key/sub-link to the user (plan 03-07). */
export const NOTIFY_PROVISIONED = "notify-provisioned";
/** Delivery job: push the terminal-failure message to the user (plan 03-07). */
export const NOTIFY_FAILED = "notify-failed";

/**
 * Idempotent enqueue of one outbox row keyed `(orderId, type)`. A second call
 * is a no-op (`update: {}`) so concurrent producers (callback + reconcile)
 * cannot create two rows for the same order+type (D-38).
 */
export async function enqueueOrderJob(orderId: string, type: string): Promise<Outbox> {
  return prisma.outbox.upsert({
    where: { orderId_type: { orderId, type } },
    update: {},
    create: { orderId, type },
  });
}

/** Canonical name for the fulfillment enqueue (D-38). */
export function enqueueFulfillJob(orderId: string): Promise<Outbox> {
  return enqueueOrderJob(orderId, FULFILL_JOB);
}

/** Enqueue the success delivery row (consumer wired in plan 03-07). */
export function enqueueNotifyProvisioned(orderId: string): Promise<Outbox> {
  return enqueueOrderJob(orderId, NOTIFY_PROVISIONED);
}

/**
 * Enqueue the terminal-failure delivery row — symmetric with
 * `notify-provisioned`, so the failed-push path always has a producer (D-41).
 */
export function enqueueNotifyFailed(orderId: string): Promise<Outbox> {
  return enqueueOrderJob(orderId, NOTIFY_FAILED);
}

export interface ClaimedJob {
  id: string;
  orderId: string;
  type: string;
  attempts: number;
}

/**
 * Atomically claim the next due job of `type` (default `fulfill-order`).
 *
 * A `findMany` is only a candidate read; the winner is decided by the
 * per-row conditional `updateMany` (`status: 'pending'`), exactly as
 * `claimTrial` (lib/keys-service.ts) decides a one-time claim. A lost race
 * falls through to the next candidate; no row is ever processed twice.
 */
export async function claimNextJob(type: string = FULFILL_JOB): Promise<ClaimedJob | null> {
  const candidates = await prisma.outbox.findMany({
    where: { status: "pending", type, nextAttemptAt: { lte: new Date() } },
    orderBy: { createdAt: "asc" },
    take: 10,
  });
  for (const job of candidates) {
    const { count } = await prisma.outbox.updateMany({
      where: { id: job.id, status: "pending" },
      data: { status: "processing" },
    });
    if (count === 1) {
      return { id: job.id, orderId: job.orderId, type: job.type, attempts: job.attempts };
    }
  }
  return null;
}

// All three job-state writes use `updateMany` (not `update`): a job row that
// vanished (order cascade-deleted, admin cleanup) must never throw into the
// worker loop — a missing row is a no-op.

/** Mark a claimed job terminal-success. */
export async function markJobDone(jobId: string): Promise<void> {
  await prisma.outbox.updateMany({
    where: { id: jobId },
    data: { status: "done", processedAt: new Date(), lastError: null },
  });
}

/**
 * Return a claimed job to the queue with a future `nextAttemptAt`. `reason` is a
 * typed code only (never provider text — D-19).
 */
export async function rescheduleJob(
  jobId: string,
  nextAttemptAt: Date,
  reason: string,
): Promise<void> {
  await prisma.outbox.updateMany({
    where: { id: jobId },
    data: {
      status: "pending",
      nextAttemptAt,
      attempts: { increment: 1 },
      lastError: reason,
    },
  });
}

/** Mark a claimed job terminal-failure (typed code only). */
export async function markJobFailed(jobId: string, reason: string): Promise<void> {
  await prisma.outbox.updateMany({
    where: { id: jobId },
    data: { status: "failed", processedAt: new Date(), lastError: reason },
  });
}

// ---------------------------------------------------------------------------
// Sibling Notification delivery queue (SUP-03, RESEARCH Open Q2 LOCKED).
//
// The order `Outbox` is money-path and its `(orderId, type)` uniqueness cannot
// carry support/reminder deliveries, so a sibling `Notification` table exists
// (plan 04-01) with a UNIQUE `dedupeKey`. The claim discipline is IDENTICAL to
// `claimNextJob`: a candidate read is only a candidate, the winner is decided by
// the per-row conditional `updateMany`, and every state write uses `updateMany`
// so a vanished row is a no-op. The order `Outbox` is never touched.
// ---------------------------------------------------------------------------

/** Deliver a support reply to the owning chat (fan-out from an admin reply). */
export const NOTIFY_TICKET_REPLY = "notify-ticket-reply";
/** Deliver an expiry reminder (produced by the reminder scan, plan 04-08). */
export const REMIND_EXPIRY = "remind-expiry";
/** Deliver one administrator broadcast to its owning user chat. */
export const BROADCAST = "broadcast";
/** Deliver a deduplicated low-balance alert to one configured administrator. */
export const BALANCE_ALERT = "balance-alert";

export interface NotificationInput {
  type: string;
  dedupeKey: string;
  userId?: number;
  ticketId?: string;
  ticketMessageId?: string;
  keyId?: string;
}

/**
 * Idempotent enqueue of one notification keyed by its UNIQUE `dedupeKey`. A
 * second call is a no-op (`update: {}`), so a retried reply route or a second
 * same-day reminder scan can never mint a duplicate delivery (T-04-11). The
 * producer chooses the key (reply: `ticket:{ticketId}:{messageId}`; reminder:
 * `remind:{keyId}:{YYYY-MM-DD}`).
 */
export async function enqueueNotification(input: NotificationInput): Promise<void> {
  await prisma.notification.upsert({
    where: { dedupeKey: input.dedupeKey },
    update: {},
    create: {
      type: input.type,
      dedupeKey: input.dedupeKey,
      userId: input.userId ?? null,
      ticketId: input.ticketId ?? null,
      ticketMessageId: input.ticketMessageId ?? null,
      keyId: input.keyId ?? null,
    },
  });
}

/** Bulk, idempotent fan-out for a broadcast. Never loop one upsert per user. */
export async function enqueueBroadcastNotifications(
  broadcastId: string,
  userIds: number[],
): Promise<number> {
  if (userIds.length === 0) return 0;
  const result = await prisma.notification.createMany({
    data: userIds.map((userId) => ({
      type: BROADCAST,
      dedupeKey: `broadcast:${broadcastId}:${userId}`,
      userId,
    })),
    skipDuplicates: true,
  });
  return result.count;
}

export async function enqueueBalanceAlertNotifications(
  date: string,
  band: 'low' | 'critical',
  telegramIds: number[],
): Promise<number> {
  if (telegramIds.length === 0) return 0;
  const result = await prisma.notification.createMany({
    data: telegramIds.map((telegramId) => ({
      type: BALANCE_ALERT,
      dedupeKey: `balance:${date}:${band}:${telegramId}`,
      userId: null,
    })),
    skipDuplicates: true,
  });
  return result.count;
}

export interface ClaimedNotification {
  id: string;
  type: string;
  dedupeKey: string;
  userId: number | null;
  ticketId: string | null;
  ticketMessageId: string | null;
  keyId: string | null;
  attempts: number;
}

/**
 * Atomically claim the next due notification of `type`. Mirrors `claimNextJob`:
 * a `findMany` is only a candidate read; the winner is decided by the per-row
 * conditional `updateMany` (`status: 'pending'`). A lost race falls through to
 * the next candidate; no row is ever delivered twice.
 */
export async function claimNextNotification(
  type: string,
): Promise<ClaimedNotification | null> {
  const candidates = await prisma.notification.findMany({
    where: { status: "pending", type, nextAttemptAt: { lte: new Date() } },
    orderBy: { createdAt: "asc" },
    take: 10,
  });
  for (const job of candidates) {
    const { count } = await prisma.notification.updateMany({
      where: { id: job.id, status: "pending" },
      data: { status: "processing" },
    });
    if (count === 1) {
      return {
        id: job.id,
        type: job.type,
        dedupeKey: job.dedupeKey,
        userId: job.userId,
        ticketId: job.ticketId,
        ticketMessageId: job.ticketMessageId,
        keyId: job.keyId,
        attempts: job.attempts,
      };
    }
  }
  return null;
}

// The three notification-state writes mirror `markJobDone`/`rescheduleJob`/
// `markJobFailed`: `updateMany` so a row that vanished is a no-op, never a
// throw into the worker loop.

/** Mark a claimed notification terminal-success. */
export async function markNotificationDone(id: string): Promise<void> {
  await prisma.notification.updateMany({
    where: { id },
    data: { status: "done", processedAt: new Date(), lastError: null },
  });
}

/** Return a claimed notification to the queue with a future `nextAttemptAt`. */
export async function rescheduleNotification(
  id: string,
  nextAttemptAt: Date,
  reason: string,
): Promise<void> {
  await prisma.notification.updateMany({
    where: { id },
    data: {
      status: "pending",
      nextAttemptAt,
      attempts: { increment: 1 },
      lastError: reason,
    },
  });
}

/** Mark a claimed notification terminal-failure (typed code only). */
export async function markNotificationFailed(id: string, reason: string): Promise<void> {
  await prisma.notification.updateMany({
    where: { id },
    data: { status: "failed", processedAt: new Date(), lastError: reason },
  });
}
