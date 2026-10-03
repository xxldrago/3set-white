// Orders service — the SINGLE create/transition/read path for the money
// pipeline, shared by the BFF routes, the bot, and (later) the worker.
//
// State machine (D-39): pending → paid → provisioning → provisioned / failed,
// with terminal canceled / refunded outcomes. It is deliberately ingestion-only
// in this plan: `createOrder` persists a server-quoted pending order and calls
// Platega to obtain the hosted URL; the callback's `transitionOrder` atomically
// claims pending→paid; provisioning is the Wave-2 worker's job (D-38).
import type { Order, Outbox } from "../generated/prisma/client";
import { artemida } from "./artemida";
import { logger } from "./logger";
import { env } from "./env";
import { getKeyForUser, type RenderedKey } from "./keys-service";
import { enqueueFulfillJob } from "./outbox";
import { PlategaError, platega } from "./platega";
import { prisma } from "./prisma";

export type OrderKind = "new" | "renew" | "upgrade";
export type OrderStatus =
  | "pending"
  | "paid"
  | "provisioning"
  | "provisioned"
  | "failed"
  | "canceled"
  | "refunded";

/** App-locked device bounds (provider min is 2; the cabinet ceiling is 10). */
export const MIN_DEVICES = 2;
export const MAX_DEVICES = 10;

/**
 * The single clean trial-family code shared by BOTH layers that can reject a
 * renew/upgrade on a trial key (D-44):
 * - the BFF pre-check (`POST /api/orders`) returns HTTP 409 `{error:'trial'}`;
 * - the worker maps a provider `conflict` to this same `errorCode` (`failed`).
 * Neither path ever surfaces a raw provider 409/code — the UI resolves this to
 * the existing `trial.usedBody` family (UI-SPEC §5). Keep both in sync here.
 */
export const TRIAL_ERROR_CODE = "trial";

/** Provider-conflict detector for the shared trial-family mapping. */
export function isTrialConflict(code: string): boolean {
  return code === "conflict";
}

export interface CreateOrderInput {
  telegramId: number;
  kind: OrderKind;
  /** Purchased days: required for `new`/`renew`, `null` for `upgrade`. */
  days: number | null;
  /**
   * Device count by kind:
   * - `new`: the device count being purchased;
   * - `renew`: the key's current device limit (term-only change, D-45);
   * - `upgrade`: the key's current device limit (quote basis only).
   */
  devices: number;
  /** Upgrade only: devices to add — the observed provider wire field. */
  addDevices?: number;
  keyId?: string | null;
  userName?: string | null;
}

export type CreateOrderResult =
  | { kind: "created"; order: Order; url: string }
  | { kind: "provider_error"; code: PlategaError["code"] };

/**
 * Server-quoted order creation (D-33/D-42).
 *
 * The amount is ALWAYS the ARTEMIDA `GET /pricing` quote — a client-supplied
 * price is never trusted (T-03-amount). The order is persisted `pending` BEFORE
 * the Platega call so a lost create response is recoverable via `payload`.
 * A Platega failure leaves the order pending (no money captured) — the caller
 * maps the typed code; provider text is never surfaced.
 */
export async function createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
  const user = await prisma.user.findUnique({
    where: { telegramId: BigInt(input.telegramId) },
    select: { id: true },
  });
  if (!user) {
    // No local identity row — the caller resolves this as an auth failure.
    throw new Error("orders:unknown_user");
  }

  // One money pipeline, kind-aware quote only (D-42/D-43). `new`/`renew` use the
  // provider `GET /pricing` quote; `upgrade` derives the prorated device delta
  // locally (the provider exposes no quote endpoint, 03-01 observed).
  let amount: number;
  let currency: string;
  if (input.kind === "upgrade") {
    const quote = await artemida.getUpgradeQuote({
      days: input.days ?? 30,
      devices: input.devices,
      addDevices: input.addDevices ?? 1,
    });
    amount = Math.round(quote.amount);
    currency = quote.currency;
  } else {
    const quote = await artemida.getPricing({
      days: input.days ?? 30,
      devices: input.devices,
    });
    amount = Math.round(quote.price);
    currency = quote.currency;
  }

  // `devices` stores the intent the worker replays: for `upgrade` it is the
  // addDevices delta (the observed wire field), for `new`/`renew` the count.
  const storedDevices = input.kind === "upgrade" ? (input.addDevices ?? 1) : input.devices;

  const order = await prisma.order.create({
    data: {
      userId: user.id,
      kind: input.kind,
      keyId: input.keyId ?? null,
      days: input.days,
      devices: storedDevices,
      amount,
      currency,
      status: "pending",
    },
  });

  try {
    const tx = await platega.createTransaction({
      amount,
      currency,
      description: `Order ${order.id}`,
      returnUrl: `${env.APP_BASE_URL}/payments/${order.id}`,
      failedUrl: `${env.APP_BASE_URL}/payments/${order.id}`,
      payload: order.id,
      metadata: {
        userId: String(input.telegramId),
        userName: input.userName ?? String(input.telegramId),
      },
    });

    const updated = await prisma.order.update({
      where: { id: order.id },
      data: { plategaTxId: tx.transactionId, paymentUrl: tx.url },
    });

    return { kind: "created", order: updated, url: tx.url };
  } catch (err) {
    if (err instanceof PlategaError) {
      logger.warn({ route: "orders", code: err.code, outcome: "platega_create_failed" });
      return { kind: "provider_error", code: err.code };
    }
    throw err;
  }
}

/** Current device limit for a cached key, clamped into the app's 2..10 range. */
export function keyDeviceLimit(key: Pick<RenderedKey, "deviceLimit" | "devices">): number {
  const raw = key.deviceLimit ?? key.devices ?? MIN_DEVICES;
  return Math.max(MIN_DEVICES, Math.min(MAX_DEVICES, raw));
}

export type OwnedKeyPrecheck =
  | { ok: true; key: RenderedKey }
  | { ok: false; reason: "not_found" | typeof TRIAL_ERROR_CODE };

/**
 * Server-side pre-check for a renew/upgrade target (T-03-idor / T-03-trial-bypass).
 * Resolves the key through the ownership-joined `getKeyForUser` BEFORE any
 * provider call:
 * - not owned / missing → `not_found` (caller returns 404; no oracle, D-44);
 * - owned but trial → `trial` (caller returns the clean 409 trial signal).
 * The client-supplied `keyId` is never trusted for ownership.
 */
export async function precheckOwnedKey(
  telegramId: number,
  keyId: string,
): Promise<OwnedKeyPrecheck> {
  const key = await getKeyForUser(BigInt(telegramId), keyId);
  if (!key) return { ok: false, reason: "not_found" };
  if (key.isTrial) return { ok: false, reason: TRIAL_ERROR_CODE };
  return { ok: true, key };
}

/**
 * Atomic state transition (D-39). A single `UPDATE … WHERE id=? AND status=?`
 * means exactly one caller can win a given transition: `count === 1` is the
 * winner, `count === 0` means the row was already moved (duplicate delivery,
 * concurrent worker). Mirrors `claimTrial` (T-03-dup).
 */
export async function transitionOrder(
  id: string,
  from: OrderStatus,
  to: OrderStatus,
  data: Partial<Pick<Order, "paidAt" | "provisionedKeyId" | "errorCode" | "attempts" | "nextAttemptAt">> = {},
): Promise<boolean> {
  const { count } = await prisma.order.updateMany({
    where: { id, status: from },
    data: { status: to, ...data },
  });
  return count === 1;
}

/**
 * Resolve the order a callback refers to: by the Platega transaction id first,
 * else by the echoed `payload` (= order id). The payload fallback is the
 * lost-create recovery path — if our `createTransaction` response was lost, the
 * order still has no `plategaTxId`, but Platega echoes our `order.id` back.
 */
export async function resolveOrderByTxOrPayload(
  txId: string | null,
  payload: string | null,
): Promise<Order | null> {
  if (txId) {
    const byTx = await prisma.order.findUnique({ where: { plategaTxId: txId } });
    if (byTx) return byTx;
  }
  if (payload) {
    return prisma.order.findUnique({ where: { id: payload } });
  }
  return null;
}

/**
 * Ownership-joined read (T-03-idor): an order the caller does not own is
 * indistinguishable from a missing one — both return null (no oracle).
 */
export async function loadOrderForUser(
  telegramId: bigint,
  orderId: string,
): Promise<Order | null> {
  return prisma.order.findFirst({
    where: { id: orderId, user: { telegramId } },
  });
}

/**
 * Enqueue exactly one fulfillment job per order (D-38). Delegates to
 * `lib/outbox.ts` so the callback and the reconcile job cannot diverge on the
 * job type / idempotency key. The UNIQUE `(orderId, type)` constraint plus
 * `upsert` makes a duplicate CONFIRMED delivery a no-op — never two outbox rows.
 */
export async function enqueueFulfillOrder(orderId: string): Promise<Outbox> {
  return enqueueFulfillJob(orderId);
}

/**
 * Shared confirmed-payment transition (D-34/D-35/D-38/D-39). The callback and
 * the hourly reconcile MUST both go through this so a lost callback recovers to
 * exactly the same state as a live one: atomic `pending→paid` claim plus exactly
 * one fulfillment enqueue. Neither path ever provisions a key inline.
 *
 * Returns `true` only for the single caller that won the `pending→paid` claim.
 */
export async function applyConfirmedPayment(orderId: string): Promise<boolean> {
  const claimed = await transitionOrder(orderId, "pending", "paid", {
    paidAt: new Date(),
  });
  if (!claimed) return false;
  await enqueueFulfillOrder(orderId);
  return true;
}

// ---------------------------------------------------------------------------
// Worker-facing provisioning transitions (D-38/D-41). Kept in the orders
// service so the state machine has exactly one home.
// ---------------------------------------------------------------------------

/** Atomic `paid→provisioning` claim; the worker owns fulfillment from here. */
export async function transitionToProvisioning(orderId: string): Promise<boolean> {
  return transitionOrder(orderId, "paid", "provisioning");
}

/** Terminal success: `provisioning→provisioned`, recording the provider key id. */
export async function markProvisioned(orderId: string, keyId: string): Promise<boolean> {
  return transitionOrder(orderId, "provisioning", "provisioned", {
    provisionedKeyId: keyId,
    errorCode: null,
    nextAttemptAt: null,
  });
}

/**
 * Retryable-failure bookkeeping: the order stays `provisioning` (never lost),
 * `attempts` is recorded and `nextAttemptAt` schedules the later attempt.
 * `code` is a typed `ArtemidaCode`, never provider text (D-19).
 */
export async function markProvisionError(
  orderId: string,
  code: string,
  attempts: number,
  nextAttemptAt: Date,
): Promise<void> {
  await prisma.order.updateMany({
    where: { id: orderId, status: "provisioning" },
    data: { attempts, nextAttemptAt, errorCode: code },
  });
}

/**
 * Terminal failure: claim `provisioning→failed` (falling back to `paid→failed`
 * for a failure before the first claim). Returns `true` for the one caller that
 * moved the order, so exactly one `notify-failed` row is enqueued.
 */
export async function markProvisionFailed(orderId: string, code: string): Promise<boolean> {
  const moved =
    (await transitionOrder(orderId, "provisioning", "failed", {
      errorCode: code,
      nextAttemptAt: null,
    })) ||
    (await transitionOrder(orderId, "paid", "failed", {
      errorCode: code,
      nextAttemptAt: null,
    }));
  return moved;
}

/**
 * Pending orders old enough to be worth a Platega status re-query. A null
 * `plategaTxId` is excluded (nothing to query) — the lost-create path is
 * recovered by the callback's payload fallback, not by reconcile.
 */
export async function listReconcilableOrders(
  olderThanMs: number,
  now: Date | number = Date.now(),
): Promise<Order[]> {
  const nowMs = typeof now === "number" ? now : now.getTime();
  const cutoff = new Date(nowMs - olderThanMs);
  return prisma.order.findMany({
    where: {
      status: "pending",
      plategaTxId: { not: null },
      createdAt: { lt: cutoff },
    },
    orderBy: { createdAt: "asc" },
    take: 50,
  });
}
