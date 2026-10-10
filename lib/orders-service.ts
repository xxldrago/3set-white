// Orders service — the SINGLE create/transition/read path for the money
// pipeline, shared by the BFF routes, the bot, and (later) the worker.
//
// State machine (D-39): pending → paid → provisioning → provisioned / failed,
// with terminal canceled / refunded outcomes. It is deliberately ingestion-only
// in this plan: `createOrder` persists a server-quoted pending order and calls
// Platega to obtain the hosted URL; the callback's `transitionOrder` atomically
// claims pending→paid; provisioning is the Wave-2 worker's job (D-38).
import type { Order, Outbox } from "../generated/prisma/client";
import { logger } from "./logger";
import { consumePromo, validatePromo } from "./promo";
import { resolveTariffQuote, resolveUpgradeQuote } from "./pricing";
import { creditReferralForPaidOrder, pinReferrer, walletBalance } from "./referrals";
import { env } from "./env";
import { getKeyForUser, getKeyForUserId, type RenderedKey } from "./keys-service";
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
  /**
   * Local `users.id` — the preferred resolve path (email-only accounts have no
   * telegram id). The route resolves it from the signed session.
   */
  userId?: number;
  /** Legacy resolve path (bot): local user looked up by telegram id. */
  telegramId?: number;
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
  /** Optional promo code (raw, any case) — validated + consumed server-side. */
  promoCode?: string | null;
  /** Spend the referral wallet balance against this order (remainder via Platega). */
  useBalance?: boolean;
}

export type CreateOrderResult =
  | { kind: "created"; order: Order; url: string }
  | { kind: "provider_error"; code: PlategaError["code"] };

/** Typed promo failure at order time (route maps to 400 `promo_invalid`). */
export class OrderPromoError extends Error {
  constructor() {
    super("promo_invalid");
    this.name = "OrderPromoError";
  }
}

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
  const user =
    input.userId !== undefined
      ? await prisma.user.findUnique({
          where: { id: input.userId },
          select: { id: true, telegramId: true },
        })
      : input.telegramId !== undefined
        ? await prisma.user.findUnique({
            where: { telegramId: BigInt(input.telegramId) },
            select: { id: true, telegramId: true },
          })
        : null;
  if (!user) {
    // No local identity row — the caller resolves this as an auth failure.
    throw new Error("orders:unknown_user");
  }

  // Provider customer reference: the telegram id when linked, otherwise the
  // email-only convention `email:{userId}` (mirrors the trial path, D-80) so
  // each email account gets its own provider-side key instead of a shared null.
  const customerRef =
    user.telegramId !== null ? String(user.telegramId) : `email:${user.id}`;

  // One money pipeline, kind-aware quote only (D-42/D-43). The billed amount
  // resolves through the shared retail tariff grid (manual row) with live
  // provider fallback — the same source the storefront displays.
  let amount: number;
  let currency: string;
  if (input.kind === "upgrade") {
    const quote = await resolveUpgradeQuote({
      days: input.days ?? 30,
      devices: input.devices,
      addDevices: input.addDevices ?? 1,
    });
    amount = Math.round(quote.amount);
    currency = quote.currency;
  } else {
    const quote = await resolveTariffQuote(input.days ?? 30, input.devices);
    amount = Math.round(quote.amount);
    currency = quote.currency;
  }

  // `devices` stores the intent the worker replays: for `upgrade` it is the
  // addDevices delta (the observed wire field), for `new`/`renew` the count.
  const storedDevices = input.kind === "upgrade" ? (input.addDevices ?? 1) : input.devices;

  // Promo intake: validated against the quoted amount and consumed atomically
  // BEFORE the order row exists, so a lost race (exhausted between preview
  // and checkout) fails closed with `promo_invalid` instead of overcharging
  // or overspending the code. finalAmount is what Platega charges.
  let promoCode: string | null = null;
  let finalAmount = amount;
  const rawPromo = input.promoCode?.trim() ?? "";
  if (rawPromo.length > 0) {
    const preview = await validatePromo(rawPromo, amount);
    if (!preview.ok) {
      logger.warn({ route: "orders", outcome: "promo_rejected", reason: preview.reason });
      throw new OrderPromoError();
    }
    const consumed = await consumePromo(rawPromo);
    if (!consumed) {
      logger.warn({ route: "orders", outcome: "promo_race_lost" });
      throw new OrderPromoError();
    }
    promoCode = consumed.code;
    finalAmount = preview.finalAmount;
    // Personal partner code: attribute the buyer to the owner (first-wins —
    // a buyer with an inviter keeps it). Best-effort, never fails checkout.
    if (consumed.ownerUserId !== null && consumed.ownerUserId !== user.id) {
      const owner = await prisma.user.findUnique({
        where: { id: consumed.ownerUserId },
        select: { referralCode: true },
      });
      if (owner?.referralCode) {
        await pinReferrer(user.id, owner.referralCode).catch(() => null);
      }
    }
  }

  // Referral balance: applied after the promo, before Platega. The debit
  // lands with the order id as refId AFTER the row exists; a Platega failure
  // refunds it via a compensating credit (ledger stays append-only). A fully
  // covered order skips Platega and goes paid → fulfill directly.
  let balanceUsed = 0;
  if (input.useBalance === true && finalAmount > 0) {
    const balance = await walletBalance(user.id);
    balanceUsed = Math.max(0, Math.min(balance, finalAmount));
  }

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
      promoCode,
      finalAmount,
      balanceUsed,
    },
  });

  if (balanceUsed > 0) {
    await prisma.walletTx.create({
      data: { userId: user.id, amount: -balanceUsed, reason: "order_spend", refId: order.id },
    });
  }

  const chargeAmount = finalAmount - balanceUsed;
  if (chargeAmount <= 0) {
    // Fully covered by balance (or a 100% promo): no Platega leg. The SAME
    // paid claim + fulfill enqueue the callback uses, so referral credit and
    // provisioning behave identically. The UI lands on the order status page
    // instead of a payment page (same `{url}` shape, relative URL).
    const claimed = await applyConfirmedPayment(order.id);
    if (!claimed) {
      logger.error({ route: "orders", outcome: "balance_claim_failed", orderId: order.id });
      throw new Error("orders:claim_failed");
    }
    const settled = await prisma.order.findUnique({ where: { id: order.id } });
    return {
      kind: "created",
      order: settled ?? order,
      url: `${env.APP_BASE_URL}/payments/${order.id}`,
    };
  }

  try {
    const tx = await platega.createTransaction({
      amount: chargeAmount,
      currency,
      description: `Order ${order.id}`,
      returnUrl: `${env.APP_BASE_URL}/payments/${order.id}`,
      failedUrl: `${env.APP_BASE_URL}/payments/${order.id}`,
      payload: order.id,
      metadata: {
        userId: customerRef,
        userName: input.userName ?? customerRef,
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
      if (balanceUsed > 0) {
        // Money never moved — refund the reserved balance so it is spendable
        // again. Append-only ledger: a compensating credit, never a delete.
        await prisma.walletTx.create({
          data: {
            userId: user.id,
            amount: balanceUsed,
            reason: "order_spend_refund",
            refId: order.id,
          },
        });
      }
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

/** userId-scoped ownership precheck (email-only accounts included). */
export async function precheckOwnedKeyByUserId(
  userId: number,
  keyId: string,
): Promise<OwnedKeyPrecheck> {
  const key = await getKeyForUserId(userId, keyId);
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

/** userId-scoped order load (email-only accounts included). */
export async function loadOrderForUserId(
  userId: number,
  orderId: string,
): Promise<Order | null> {
  return prisma.order.findFirst({
    where: { id: orderId, user: { id: userId } },
  });
}

/**
 * Raw, provider-free view of an order for the cabinet + bot payment history
 * (D-48). Amounts/dates are the stored values verbatim — formatting is the UI's
 * job (UI-SPEC §6). `keyId` is nullable so a row whose key reference is absent
 * renders amount+status+date and simply omits the key link (partial rule).
 */
export interface OrderHistoryRow {
  id: string;
  amount: number;
  currency: string;
  status: OrderStatus;
  kind: OrderKind;
  keyId: string | null;
  createdAt: Date;
}

/**
 * Pure mapper: emits ONLY our own fields. Provider identifiers
 * (`plategaTxId`, `paymentUrl`) are deliberately dropped here so no history row
 * or status response can ever leak one (T-03-provider-leak).
 */
export function toHistoryRow(order: Order): OrderHistoryRow {
  return {
    id: order.id,
    amount: order.amount,
    currency: order.currency,
    status: order.status as OrderStatus,
    kind: order.kind as OrderKind,
    keyId: order.keyId ?? null,
    createdAt: order.createdAt,
  };
}

/**
 * Ownership-joined payment history (D-46/D-47/D-48, PAY-04). Reads ONLY the
 * caller's orders from our own DB, newest first — never a live Platega query
 * (D-46, T-03-hist-idor). Shared by the cabinet list and the bot menu reply so
 * the two surfaces stay at parity.
 */
export async function listOrdersForUser(telegramId: bigint): Promise<OrderHistoryRow[]> {
  const orders = await prisma.order.findMany({
    where: { user: { telegramId } },
    orderBy: { createdAt: "desc" },
  });
  return orders.map(toHistoryRow);
}

/** userId-scoped order history (email-only accounts included). */
export async function listOrdersByUserId(userId: number): Promise<OrderHistoryRow[]> {
  const orders = await prisma.order.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
  return orders.map(toHistoryRow);
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
  // Referral accrual lives here — the single paid-entry point shared by the
  // callback, the reconcile job, and balance-covered orders. Best-effort: a
  // credit failure must never fail the payment ack.
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { userId: true, finalAmount: true },
    });
    if (order) await creditReferralForPaidOrder(order.userId, order.finalAmount, orderId);
  } catch {
    logger.error({ route: "orders", outcome: "referral_credit_failed", orderId });
  }
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
