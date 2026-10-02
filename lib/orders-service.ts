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

export interface CreateOrderInput {
  telegramId: number;
  kind: OrderKind;
  days: number;
  devices: number;
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

  const quote = await artemida.getPricing({ days: input.days, devices: input.devices });
  const amount = Math.round(quote.price);

  const order = await prisma.order.create({
    data: {
      userId: user.id,
      kind: input.kind,
      keyId: input.keyId ?? null,
      days: input.days,
      devices: input.devices,
      amount,
      currency: quote.currency,
      status: "pending",
    },
  });

  try {
    const tx = await platega.createTransaction({
      amount,
      currency: quote.currency,
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
 * Enqueue exactly one fulfillment job per order (D-38). The UNIQUE
 * `(orderId, type)` constraint plus `upsert` makes a duplicate CONFIRMED
 * delivery a no-op — never two outbox rows.
 */
export async function enqueueFulfillOrder(orderId: string): Promise<Outbox> {
  return prisma.outbox.upsert({
    where: { orderId_type: { orderId, type: "fulfill-order" } },
    update: {},
    create: { orderId, type: "fulfill-order" },
  });
}
