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
// - `startReminderTick()` runs once on boot then daily: scan `keys_cache` for
//   keys expiring within 3 days and enqueue one per-day `remind-expiry` row per
//   key (D-60/D-61). Idempotent by the UNIQUE per-day dedupe key.
//
// The loop is guarded everywhere: a rejected promise can never crash the server.
import { ArtemidaError, artemida, type NormalizedKey } from "./artemida";
import { logger } from "./logger";
import {
  FULFILL_JOB,
  NOTIFY_FAILED,
  NOTIFY_PROVISIONED,
  NOTIFY_TICKET_REPLY,
  REMIND_EXPIRY,
  claimNextJob,
  claimNextNotification,
  enqueueNotifyFailed,
  enqueueNotifyProvisioned,
  markJobDone,
  markJobFailed,
  markNotificationDone,
  markNotificationFailed,
  rescheduleJob,
  rescheduleNotification,
} from "./outbox";
import {
  dispatchNotification,
  type NotifyDispatchResult,
  type TelegramSender,
} from "./bot-payments";
import { dispatchReminder, dispatchTicketNotification } from "./ticket-notify";
import { enqueueReminderScan } from "./reminders-service";
import {
  TRIAL_ERROR_CODE,
  applyConfirmedPayment,
  isTrialConflict,
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
/** Expiry-reminder scan cadence: once a day (D-60). The dedupe key is per-day. */
const REMINDER_INTERVAL_MS = 24 * 60 * 60 * 1_000;
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

  try {
    const key = await provisionByKind({
      id: order.id,
      kind: order.kind,
      keyId: order.keyId,
      days: order.days,
      devices: order.devices,
      customerRef: String(order.user.telegramId),
    });
    await upsertCachedKey(order.userId, key);
    await markProvisioned(order.id, key.id);
    await enqueueNotifyProvisioned(order.id);
    logger.info({ route: "worker", outcome: "provisioned", orderId: order.id, kind: order.kind });
    return { outcome: "provisioned" };
  } catch (err) {
    return handleFulfillError(order.id, order.attempts, err);
  }
}

/**
 * Kind-aware fulfillment (D-42): one pipeline, only the provider call differs.
 * Every write carries the deterministic `order:{id}:{kind}` Idempotency-Key so a
 * retry reuses the same provider-side token (D-18/D-41, Pitfall 2).
 */
async function provisionByKind(order: {
  id: string;
  kind: string;
  keyId: string | null;
  days: number | null;
  devices: number;
  customerRef: string;
}): Promise<NormalizedKey> {
  const idempotencyKey = `order:${order.id}:${order.kind}`;
  switch (order.kind) {
    case "renew": {
      if (!order.keyId || order.days === null) throw new Error("worker:renew_missing_params");
      return artemida.renewKey(
        order.keyId,
        { days: order.days, devices: order.devices },
        { idempotencyKey },
      );
    }
    case "upgrade": {
      if (!order.keyId) throw new Error("worker:upgrade_missing_key");
      // `order.devices` carries the addDevices delta; the observed upgrade wire
      // body is `{addDevices}` ONLY (contract finding #5).
      return artemida.upgradeKey(order.keyId, { addDevices: order.devices }, { idempotencyKey });
    }
    default:
      return artemida.createKey(
        { customerRef: order.customerRef, days: order.days ?? 30, devices: order.devices },
        { idempotencyKey },
      );
  }
}

async function handleFulfillError(
  orderId: string,
  priorAttempts: number,
  err: unknown,
): Promise<FulfillOutcome> {
  if (!(err instanceof ArtemidaError)) {
    // A programming/runtime error (e.g. a renew/upgrade order missing its
    // keyId): terminal, so a paid order is never left in provisioning forever.
    await failOrder(orderId, "unknown");
    return { outcome: "failed", code: "unknown" };
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

  // Terminal provider error (402 wallet-dry, unauthorized, unknown). A provider
  // `conflict` (e.g. renew/upgrade on a trial key) maps to the SAME clean
  // trial-family code the BFF pre-check returns — never a raw provider 409,
  // never retried (D-44/T-03-trial-bypass).
  const code = isTrialConflict(err.code) ? TRIAL_ERROR_CODE : err.code;
  await failOrder(orderId, code);
  return { outcome: "failed", code };
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
 *
 * An optional `telegram` sender lets the pass also consume the delivery rows
 * (`notify-provisioned` / `notify-failed`, produced at fulfillment in 03-03):
 * each is claimed atomically and dispatched to the owning chat exactly once.
 * Without a sender the notify rows are left pending for a later pass — they are
 * never dropped or double-sent (the claim mirrors the fulfill path).
 */
export async function drainOutbox(opts: { telegram?: TelegramSender } = {}): Promise<void> {
  for (let i = 0; i < DRAIN_BATCH; i += 1) {
    const job = await claimNextJob(FULFILL_JOB);
    if (!job) break;
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

  if (!opts.telegram) return;
  await drainNotifications(opts.telegram);
  await drainDeliveryNotifications(opts.telegram);
}

/**
 * Consume the delivery rows one at a time, dispatching each to its owning chat.
 * A successful (or nothing-to-send) dispatch marks the row done; a Telegram send
 * failure reschedules with the same backoff taxonomy as the fulfill path, so a
 * transient outage never loses the delivery. Idempotent by the single-winner
 * `claimNextJob` (a second tick can never pick the same row).
 */
async function drainNotifications(telegram: TelegramSender): Promise<void> {
  for (const type of [NOTIFY_PROVISIONED, NOTIFY_FAILED]) {
    for (let i = 0; i < DRAIN_BATCH; i += 1) {
      const job = await claimNextJob(type);
      if (!job) break;
      try {
        const result = await dispatchNotification(job.orderId, type, telegram);
        if (result.outcome === "retryable_error") {
          await rescheduleJob(job.id, new Date(Date.now() + backoffMs(job.attempts + 1)), "telegram");
        } else {
          await markJobDone(job.id);
        }
      } catch {
        logger.error({ route: "worker", outcome: "notify_job_error", jobId: job.id });
        await markJobFailed(job.id, "unexpected");
      }
    }
  }
}

/** A notification-type dispatcher: claim id + sender → outcome (worker-owned). */
type NotificationDispatcher = (
  notificationId: string,
  send: TelegramSender,
) => Promise<NotifyDispatchResult>;

/**
 * Drain one notification type: claim at most `DRAIN_BATCH` due rows and dispatch
 * each exactly once. A `retryable_error` reschedules with the shared backoff; a
 * success (or nothing-to-send) marks the row done. An unexpected throw marks the
 * row failed — it is never left in `processing`.
 */
async function drainNotificationType(
  type: string,
  dispatch: NotificationDispatcher,
  telegram: TelegramSender,
): Promise<void> {
  for (let i = 0; i < DRAIN_BATCH; i += 1) {
    const job = await claimNextNotification(type);
    if (!job) break;
    try {
      const result = await dispatch(job.id, telegram);
      if (result.outcome === "retryable_error") {
        await rescheduleNotification(
          job.id,
          new Date(Date.now() + backoffMs(job.attempts + 1)),
          "telegram",
        );
      } else {
        await markNotificationDone(job.id);
      }
    } catch {
      logger.error({ route: "worker", outcome: "delivery_job_error", jobId: job.id });
      await markNotificationFailed(job.id, "unexpected");
    }
  }
}

/**
 * Consume the sibling `Notification` delivery rows (SUP-03, D-57; PAY-05 for
 * reminders). Ticket-reply and expiry-reminder rows each have a dispatcher; a
 * sender-less drain never reaches here (the caller returns before this), so
 * nothing is consumed without a Telegram surface to deliver to.
 */
async function drainDeliveryNotifications(telegram: TelegramSender): Promise<void> {
  await drainNotificationType(NOTIFY_TICKET_REPLY, dispatchTicketNotification, telegram);
  await drainNotificationType(REMIND_EXPIRY, dispatchReminder, telegram);
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

/**
 * One expiry-reminder scan pass (D-60): enqueue one `remind-expiry` row per
 * expiring key for today. Idempotent per key per day (`remind:{keyId}:{date}`
 * UNIQUE), so a boot run plus the interval never double-sends.
 */
export async function runReminderScan(): Promise<{ scanned: number; enqueued: number }> {
  return enqueueReminderScan();
}

/**
 * Daily reminder interval (started by `startWorker`). Runs once on boot so a
 * server that restarts between daily ticks never misses a day (D-60/D-61), then
 * every 24h. The interval is unref'd so tests/CLI are not held open.
 */
export function startReminderTick(): NodeJS.Timeout {
  void runReminderScan().catch(() =>
    logger.error({ route: "worker", outcome: "reminder_scan_failed" }),
  );
  return unref(setInterval(guard("reminders", runReminderScan), REMINDER_INTERVAL_MS));
}

/**
 * The production drain sender: the shared `lib/bot.ts` Telegraf singleton's
 * `telegram` surface. Imported lazily so the module (and Telegraf) is only
 * pulled in when a drain actually runs — `next build` never instantiates it.
 */
async function botSender(): Promise<TelegramSender> {
  const { bot } = await import("./bot");
  return bot.telegram as unknown as TelegramSender;
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
    setInterval(
      guard("drain", async () => drainOutbox({ telegram: await botSender() })),
      DRAIN_INTERVAL_MS,
    ),
  );
  const reconcileTimer = startReconcileTick();
  const reminderTimer = startReminderTick();

  const handle: WorkerHandle = {
    started: true,
    drain: async () => drainOutbox({ telegram: await botSender() }),
    reconcile: reconcileOnce,
    stop: () => {
      clearInterval(drainTimer);
      clearInterval(reconcileTimer);
      clearInterval(reminderTimer);
      delete g.__setwhiteWorker;
    },
  };
  g.__setwhiteWorker = handle;
  logger.info({ outcome: "worker-started" });
  return handle;
}
