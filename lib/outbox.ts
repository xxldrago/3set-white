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
