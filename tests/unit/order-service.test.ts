// Hourly reconcile vectors (D-40 / Pitfall 6): a pending order whose Platega
// transaction re-queries as CONFIRMED recovers to `paid` + one fulfill job
// through the SAME shared transition as the callback; a still-PENDING order is
// left untouched; reconcile NEVER provisions inline; and an order with no
// plategaTxId is skipped without throwing. Runs against the real local Postgres
// with a spied `platega.getTransaction` so no network is hit.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { artemida } from "../../lib/artemida";
import { FULFILL_JOB } from "../../lib/outbox";
import {
  applyConfirmedPayment,
  listReconcilableOrders,
  transitionOrder,
} from "../../lib/orders-service";
import { platega, type TransactionStatus } from "../../lib/platega";
import { prisma } from "../../lib/prisma";
import { reconcileOnce } from "../../lib/worker";

const OWNER = BigInt("200000320");
const AMOUNT = 100;
const OLD = 10 * 60 * 1_000; // older than the 5-min reconcile threshold

let userId: number;

async function cleanup(): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { telegramId: OWNER },
    select: { id: true },
  });
  if (user) {
    await prisma.outbox.deleteMany({ where: { order: { userId: user.id } } });
    await prisma.order.deleteMany({ where: { userId: user.id } });
    await prisma.keyCache.deleteMany({ where: { userId: user.id } });
  }
  await prisma.user.deleteMany({ where: { telegramId: OWNER } });
}

async function makeOrder(
  overrides: { plategaTxId?: string | null; status?: "pending" | "paid" } = {},
) {
  return prisma.order.create({
    data: {
      userId,
      kind: "new",
      days: 30,
      devices: 2,
      amount: AMOUNT,
      currency: "RUB",
      status: overrides.status ?? "pending",
      plategaTxId: "plategaTxId" in overrides ? overrides.plategaTxId : "tx_rec",
      createdAt: new Date(Date.now() - OLD),
    },
  });
}

function tx(overrides: Partial<TransactionStatus> = {}): TransactionStatus {
  return { id: "tx_rec", status: "CONFIRMED", amount: AMOUNT, currency: "RUB", payload: null, ...overrides };
}

beforeAll(async () => {
  await cleanup();
  const user = await prisma.user.create({ data: { telegramId: OWNER }, select: { id: true } });
  userId = user.id;
});

afterAll(async () => {
  vi.restoreAllMocks();
  await cleanup();
});

beforeEach(async () => {
  await prisma.outbox.deleteMany({ where: { order: { userId } } });
  await prisma.order.deleteMany({ where: { userId } });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("hourly reconcile (D-40)", () => {
  it("recovers a lost CONFIRMED callback to paid + one fulfill job", async () => {
    const order = await makeOrder({ plategaTxId: "tx_recover" });
    const getTransaction = vi
      .spyOn(platega, "getTransaction")
      .mockResolvedValue(tx({ id: "tx_recover" }));

    const result = await reconcileOnce();

    expect(getTransaction).toHaveBeenCalledWith("tx_recover");
    expect(result.scanned).toBe(1);
    expect(result.recovered).toBe(1);
    const row = await prisma.order.findUnique({ where: { id: order.id } });
    expect(row?.status).toBe("paid");
    expect(row?.paidAt).toBeInstanceOf(Date);
    expect(await prisma.outbox.count({ where: { orderId: order.id, type: FULFILL_JOB } })).toBe(1);
  });

  it("leaves a still-PENDING order untouched", async () => {
    const order = await makeOrder({ plategaTxId: "tx_still" });
    vi.spyOn(platega, "getTransaction").mockResolvedValue(
      tx({ id: "tx_still", status: "PENDING" }),
    );

    await reconcileOnce();

    const row = await prisma.order.findUnique({ where: { id: order.id } });
    expect(row?.status).toBe("pending");
    expect(await prisma.outbox.count({ where: { orderId: order.id } })).toBe(0);
  });

  it("never provisions inline — it only advances pending→paid (+ enqueue)", async () => {
    await makeOrder({ plategaTxId: "tx_noinline" });
    vi.spyOn(platega, "getTransaction").mockResolvedValue(tx({ id: "tx_noinline" }));
    const createKey = vi.spyOn(artemida, "createKey");

    await reconcileOnce();

    expect(createKey).not.toHaveBeenCalled();
  });

  it("skips an order with no plategaTxId without throwing", async () => {
    await makeOrder({ plategaTxId: null });
    const getTransaction = vi.spyOn(platega, "getTransaction");

    const result = await reconcileOnce();

    expect(result.scanned).toBe(0);
    expect(getTransaction).not.toHaveBeenCalled();
    expect(await listReconcilableOrders(0)).toEqual([]);
  });

  it("does not advance when the re-queried amount differs (D-35)", async () => {
    const order = await makeOrder({ plategaTxId: "tx_mismatch" });
    vi.spyOn(platega, "getTransaction").mockResolvedValue(
      tx({ id: "tx_mismatch", amount: AMOUNT - 1 }),
    );

    await reconcileOnce();

    const row = await prisma.order.findUnique({ where: { id: order.id } });
    expect(row?.status).toBe("pending");
    expect(await prisma.outbox.count({ where: { orderId: order.id } })).toBe(0);
  });
});

describe("shared confirmed-payment transition (D-39)", () => {
  it("transitionOrder is an atomic single-winner claim", async () => {
    const order = await makeOrder();
    const first = await transitionOrder(order.id, "pending", "paid", { paidAt: new Date() });
    const second = await transitionOrder(order.id, "pending", "paid", { paidAt: new Date() });
    expect(first).toBe(true);
    expect(second).toBe(false);
  });

  it("applyConfirmedPayment is idempotent: one transition, one fulfill job", async () => {
    const order = await makeOrder();
    expect(await applyConfirmedPayment(order.id)).toBe(true);
    expect(await applyConfirmedPayment(order.id)).toBe(false);
    expect(await prisma.outbox.count({ where: { orderId: order.id, type: FULFILL_JOB } })).toBe(1);
  });
});
