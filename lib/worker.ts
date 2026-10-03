// Outbox fulfillment worker (D-38/D-40/D-41) — the async spine that turns a
// `paid` order into a delivered key, durably and exactly once.
//
// Design:
// - `startWorker()` is single-instance per server process via a `globalThis`
//   guard (mirrors lib/bot.ts:274-283): dev HMR re-imports the module but the
//   interval is created once.
// - `drainOutbox()` claims one due `fulfill-order` row at a time (atomic
//   `claimNextJob`), provisions, then marks done / reschedules / fails.
// - `processFulfillOrder()` branches on `order.kind`. Wave 3 adds renew/upgrade;
//   until then those kinds are terminal `not_implemented` (no order of those
//   kinds can be created by the BFF yet).
// - Every ARTEMIDA write carries a deterministic `Idempotency-Key`
//   `order:${id}:${kind}` (D-18/D-41) so a retry never mints a second key.
// - Retryable codes back off (honoring `Retry-After`); 402 or an exhausted
//   attempt budget is terminal `failed` + alert + one `notify-failed` row.
// - `startReconcileTick()` runs hourly: re-query pending orders against Platega
//   and recover a lost CONFIRMED callback through the SAME transition as the
//   callback (never provisioning inline).
//
// The loop is guarded everywhere: a rejected promise can never crash the server.
import { ArtemidaError, artemida } from "./artemida";
import { logger } from "./logger";
import {
  FULFILL_JOB,
  claimNextJob,
  enqueueNotifyFailed,
  enqueueNotifyProvisioned,
  markJobDone,
  markJobFailed,
  rescheduleJob,
} from "./outbox";
import {
  applyConfirmedPayment,
  listReconcilableOrders,
  markProvisionError,
  markProvisionFailed,
  markProvisioned,
  transitionToProvisioning,
} from "./orders-service";
import { upsertCachedKey } from "./keys-service";
import { PlategaError, platega } from "./platega";
import { prisma } from "./prisma";

const DRAIN_INTERVAL_MS = 5_000;
const RECONCILE_INTERVAL_MS = 60 * 60 * 1_000;
/** Max fulfillment attempts before a retryable order is declared failed. */
export const MAX_FULFILL_ATTEMPTS = 5;
const BACKOFF_BASE_MS = 5_000;
const BACKOFF_MAX_MS = 60 * 60 * 1_000;
/** A pending order younger than this is left for the callback to win first. */
export const RECONCILE_MIN_AGE_MS = 5 * 60 * 1_000;
/** Jobs processed per drain tick — bounds one tick's wall time. */
const DRAIN_BATCH = 10;

export type FulfillOutcome =
  | { outcome: "provisioned" }
  | { outcome: "retry"; nextAttemptAt: Date; code: string }
  | { outcome: "failed"; code: string }
  | { outcome: "skipped" };

/** Exponential backoff, capped; a 429's `Retry-After` wins when present. */
export function backoffMs(attempt: number, retryAfterSec?: number): number {
  if (retryAfterSec !== undefined && retryAfterSec > 0) {
    return Math.min(retryAfterSec * 1_000, BACKOFF_MAX_MS);
  }
  const exp = BACKOFF_BASE_MS * 2 ** Math.max(0, attempt - 1);
  return Math.min(exp, BACKOFF_MAX_MS);
}

function isRetryable(code: ArtemidaError["code"]): boolean {
  return code === "rate_limited" || code === "bad_gateway" || code === "unavailable";
}

/**
 * Provision one order. Returns the outcome so the caller can update the outbox
 * row; the order's own state is transitioned here (single writer).
 */
export async function processFulfillOrder(orderId: string): Promise<FulfillOutcome> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { user: { select: { telegramId: true } } },
  });
  if (!order) return { outcome: "skipped" };

  // Idempotency guard: only `paid` (first attempt) or `provisioning` (retry)
  // are fulfillable. provisioned/failed/refunded/canceled are terminal here.
  if (order.status !== "paid" && order.status !== "provisioning") {
    return { outcome: "skipped" };
  }

  if (order.status === "paid") {
    const claimed = await transitionToProvisioning(order.id);
    if (!claimed) {
      const fresh = await prisma.order.findUnique({
        where: { id: order.id },
        select: { status: true },
      });
      if (fresh?.status !== "provisioning") return { outcome: "skipped" };
    }
  }

  const customerRef = String(order.user.telegramId);

  try {
    if (order.kind !== "new") {
      // Wave 3 wires renew/upgrade (plan 03-04/03-07). No such order can be
      // created by the BFF yet (`POST /api/orders` accepts only kind:'new').
      throw new Error("worker:fulfill_kind_not_implemented");
    }
    const key = await artemida.createKey(
      { customerRef, days: order.days ?? 30, devices: order.devices },
      { idempotencyKey: `order:${order.id}:new` },
    );
    await upsertCachedKey(order.userId, key);
    await markProvisioned(order.id, key.id);
    await enqueueNotifyProvisioned(order.id);
    logger.info({ route: "worker", outcome: "provisioned", orderId: order.id });
    return { outcome: "provisioned" };
  } catch (err) {
    return handleFulfillError(order.id, order.kind, order.attempts, err);
  }
}

async function handleFulfillError(
  orderId: string,
  kind: string,
  priorAttempts: number,
  err: unknown,
): Promise<FulfillOutcome> {
  if (!(err instanceof ArtemidaError)) {
    // A programming/runtime error (or the Wave-3 not-implemented branch):
    // terminal, so a paid order is never left in provisioning forever.
    const code = kind === "new" ? "unknown" : "not_implemented";
    await failOrder(orderId, code);
    return { outcome: "failed", code };
  }

  if (isRetryable(err.code)) {
    const attempts = priorAttempts + 1;
    if (attempts >= MAX_FULFILL_ATTEMPTS) {
      await failOrder(orderId, "attempts_exhausted");
      return { outcome: "failed", code: "attempts_exhausted" };
    }
    const nextAttemptAt = new Date(Date.now() + backoffMs(attempts, err.retryAfterSec));
    await markProvisionError(orderId, err.code, attempts, nextAttemptAt);
    logger.warn({ route: "worker", outcome: "retry", orderId, code: err.code, attempts });
    return { outcome: "retry", nextAttemptAt, code: err.code };
  }

  // Terminal provider error (402 wallet-dry, unauthorized, conflict, unknown).
  await failOrder(orderId, err.code);
  return { outcome: "failed", code: err.code };
}

/** Terminal failure + alert + exactly one `notify-failed` row (idempotent). */
async function failOrder(orderId: string, code: string): Promise<void> {
  const moved = await markProvisionFailed(orderId, code);
  if (!moved) return;
  logger.error({ route: "worker", outcome: "provision_failed", orderId, code });
  await enqueueNotifyFailed(orderId);
}

/**
 * One drain pass. Claims and processes up to `DRAIN_BATCH` due jobs. A claimed
 * job is marked done on success/terminal, rescheduled on retry, and marked
 * failed on an unexpected throw — never left in `processing`.
 */
export async function drainOutbox(): Promise<void> {
  for (let i = 0; i < DRAIN_BATCH; i += 1) {
    const job = await claimNextJob(FULFILL_JOB);
    if (!job) return;
    try {
      const result = await processFulfillOrder(job.orderId);
      if (result.outcome === "retry") {
        await rescheduleJob(job.id, result.nextAttemptAt, result.code);
      } else {
        await markJobDone(job.id);
      }
    } catch (err) {
      // The process must survive any single job failure.
      logger.error({ route: "worker", outcome: "drain_job_error", jobId: job.id });
      await markJobFailed(job.id, "unexpected");
    }
  }
}

export type ReconcileOutcome = { scanned: number; recovered: number };

/**
 * One hourly reconcile pass (D-40): for each aged pending order, re-query
 * Platega and, when it is CONFIRMED with matching amount/currency, apply the
 * SAME `pending→paid` + enqueue transition as the callback. Never provisions.
 */
export async function reconcileOnce(
  olderThanMs: number = RECONCILE_MIN_AGE_MS,
  now: Date | number = Date.now(),
): Promise<ReconcileOutcome> {
  const orders = await listReconcilableOrders(olderThanMs, now);
  let recovered = 0;
  for (const order of orders) {
    // listReconcilableOrders already excludes null tx ids; guard for type-safety.
    if (!order.plategaTxId) continue;
    try {
      const tx = await platega.getTransaction(order.plategaTxId);
      if (tx.status !== "CONFIRMED") continue;
      if (tx.amount !== order.amount || tx.currency !== order.currency) {
        logger.error({
          route: "worker",
          outcome: "reconcile_amount_mismatch",
          orderId: order.id,
        });
        continue;
      }
      if (await applyConfirmedPayment(order.id)) recovered += 1;
    } catch (err) {
      if (err instanceof PlategaError) {
        logger.warn({ route: "worker", outcome: "reconcile_requery_failed", code: err.code });
      } else {
        logger.error({ route: "worker", outcome: "reconcile_error", orderId: order.id });
      }
    }
  }
  if (recovered > 0) logger.info({ route: "worker", outcome: "reconcile_recovered", recovered });
  return { scanned: orders.length, recovered };
}

function guard(label: string, fn: () => Promise<unknown>): () => void {
  return () => {
    void fn().catch(() => logger.error({ route: "worker", outcome: `${label}_failed` }));
  };
}

function unref(timer: NodeJS.Timeout): NodeJS.Timeout {
  // Do not keep the Node process alive solely for the worker (tests, CLI).
  if (typeof timer.unref === "function") timer.unref();
  return timer;
}

/** Hourly reconcile interval (started by `startWorker`). */
export function startReconcileTick(): NodeJS.Timeout {
  return unref(setInterval(guard("reconcile", () => reconcileOnce()), RECONCILE_INTERVAL_MS));
}

export interface WorkerHandle {
  started: boolean;
  /** Run one drain pass on demand (tests / manual reconcile route). */
  drain: () => Promise<void>;
  /** Run one reconcile pass on demand (tests / manual reconcile route). */
  reconcile: () => Promise<ReconcileOutcome>;
  stop: () => void;
}

interface WorkerGlobal {
  __setwhiteWorker?: WorkerHandle;
}

/**
 * Start the worker exactly once per server process. The `globalThis` guard
 * mirrors `lib/bot.ts:274-283`: dev HMR re-evaluates this module but never
 * starts a second interval. The drain loop catches every rejection.
 */
export function startWorker(): WorkerHandle {
  const g = globalThis as unknown as WorkerGlobal;
  if (g.__setwhiteWorker) return g.__setwhiteWorker;

  const drainTimer = unref(
    setInterval(guard("drain", () => drainOutbox()), DRAIN_INTERVAL_MS),
  );
  const reconcileTimer = startReconcileTick();

  const handle: WorkerHandle = {
    started: true,
    drain: drainOutbox,
    reconcile: reconcileOnce,
    stop: () => {
      clearInterval(drainTimer);
      clearInterval(reconcileTimer);
      delete g.__setwhiteWorker;
    },
  };
  g.__setwhiteWorker = handle;
  logger.info({ outcome: "worker-started" });
  return handle;
}
