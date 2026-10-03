// Hourly reconcile vectors (D-40 / Pitfall 6): a pending order whose Platega
// transaction re-queries as CONFIRMED recovers to `paid` + one fulfill job
// through the SAME shared transition as the callback; a still-PENDING order is
// left untouched; reconcile NEVER provisions inline; and an order with no
// plategaTxId is skipped without throwing. Runs against the real local Postgres
// with a spied `platega.getTransaction` so no network is hit.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ArtemidaError, artemida, type NormalizedKey } from "../../lib/artemida";
import { FULFILL_JOB, enqueueFulfillJob } from "../../lib/outbox";
import {
  TRIAL_ERROR_CODE,
  applyConfirmedPayment,
  listReconcilableOrders,
  transitionOrder,
} from "../../lib/orders-service";
import { platega, type TransactionStatus } from "../../lib/platega";
import { prisma } from "../../lib/prisma";
import { drainOutbox, reconcileOnce } from "../../lib/worker";

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

/** Minimal normalized provider key for fulfillment spies. */
function providerKey(
  id: string,
  overrides: Partial<NormalizedKey> = {},
): NormalizedKey {
  return {
    id,
    name: null,
    status: "ACTIVE",
    isTrial: false,
    expiresAt: "2030-01-01T00:00:00.000Z",
    deviceLimit: 2,
    devices: 2,
    subscriptionUrl: `https://x.test/${id}`,
    customerRef: String(OWNER),
    trafficUsedBytes: null,
    trafficLimitBytes: null,
    ...overrides,
  };
}

async function makeMutationOrder(
  overrides: {
    kind: "renew" | "upgrade";
    keyId: string;
    days?: number | null;
    devices?: number;
  },
) {
  return prisma.order.create({
    data: {
      userId,
      kind: overrides.kind,
      keyId: overrides.keyId,
      days: overrides.days ?? null,
      devices: overrides.devices ?? 2,
      amount: AMOUNT,
      currency: "RUB",
      status: "paid",
    },
  });
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
  await prisma.keyCache.deleteMany({ where: { userId } });
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

describe("worker renew/upgrade fulfillment (PAY-02/PAY-03, D-42..D-45)", () => {
  it("fulfills a paid renew under order:<id>:renew with {days,devices}", async () => {
    const order = await makeMutationOrder({ kind: "renew", keyId: "key_renew", days: 30 });
    await enqueueFulfillJob(order.id);
    const renewKey = vi
      .spyOn(artemida, "renewKey")
      .mockResolvedValue(providerKey("key_renew"));

    await drainOutbox();

    const row = await prisma.order.findUnique({ where: { id: order.id } });
    expect(row?.status).toBe("provisioned");
    expect(renewKey).toHaveBeenCalledTimes(1);
    expect(renewKey.mock.calls[0]?.[0]).toBe("key_renew");
    expect(renewKey.mock.calls[0]?.[1]).toEqual({ days: 30, devices: 2 });
    expect(renewKey.mock.calls[0]?.[2]?.idempotencyKey).toBe(`order:${order.id}:renew`);
  });

  it("fulfills a paid upgrade under order:<id>:upgrade with {addDevices}", async () => {
    const order = await makeMutationOrder({
      kind: "upgrade",
      keyId: "key_upgrade",
      devices: 2, // stored addDevices delta
    });
    await enqueueFulfillJob(order.id);
    const upgradeKey = vi
      .spyOn(artemida, "upgradeKey")
      .mockResolvedValue(providerKey("key_upgrade", { deviceLimit: 4, devices: 4 }));

    await drainOutbox();

    const row = await prisma.order.findUnique({ where: { id: order.id } });
    expect(row?.status).toBe("provisioned");
    expect(upgradeKey).toHaveBeenCalledTimes(1);
    expect(upgradeKey.mock.calls[0]?.[0]).toBe("key_upgrade");
    // Observed contract: upgrade accepts {addDevices} ONLY.
    expect(upgradeKey.mock.calls[0]?.[1]).toEqual({ addDevices: 2 });
    expect(upgradeKey.mock.calls[0]?.[2]?.idempotencyKey).toBe(`order:${order.id}:upgrade`);
  });

  it("reuses the identical idempotency key on a retried renew (no second renew)", async () => {
    const order = await makeMutationOrder({ kind: "renew", keyId: "key_renew", days: 30 });
    await enqueueFulfillJob(order.id);
    const renewKey = vi
      .spyOn(artemida, "renewKey")
      .mockRejectedValueOnce(new ArtemidaError("bad_gateway", 502))
      .mockResolvedValueOnce(providerKey("key_renew"));

    await drainOutbox();

    let row = await prisma.order.findUnique({ where: { id: order.id } });
    expect(row?.status).toBe("provisioning");
    const job = await prisma.outbox.findFirst({
      where: { orderId: order.id, type: FULFILL_JOB },
    });
    if (!job) throw new Error("expected a fulfill job");
    expect(job.status).toBe("pending");
    await prisma.outbox.update({ where: { id: job.id }, data: { nextAttemptAt: new Date(0) } });

    await drainOutbox();

    expect(renewKey).toHaveBeenCalledTimes(2);
    expect(renewKey.mock.calls[0]?.[2]?.idempotencyKey).toBe(
      renewKey.mock.calls[1]?.[2]?.idempotencyKey,
    );
    row = await prisma.order.findUnique({ where: { id: order.id } });
    expect(row?.status).toBe("provisioned");
  });

  it("refreshes the cached key row (expiry/devices) for the owning user on success", async () => {
    await prisma.keyCache.create({
      data: {
        userId,
        keyId: "key_renew",
        status: "ACTIVE",
        isTrial: false,
        expiresAt: new Date("2026-01-01T00:00:00.000Z"),
        deviceLimit: 2,
        devices: 2,
        customerRef: String(OWNER),
      },
    });
    const order = await makeMutationOrder({ kind: "renew", keyId: "key_renew", days: 30 });
    await enqueueFulfillJob(order.id);
    vi.spyOn(artemida, "renewKey").mockResolvedValue(
      providerKey("key_renew", {
        expiresAt: "2030-06-01T00:00:00.000Z",
        deviceLimit: 4,
        devices: 4,
      }),
    );

    await drainOutbox();

    const cached = await prisma.keyCache.findFirst({ where: { userId, keyId: "key_renew" } });
    expect(cached?.deviceLimit).toBe(4);
    expect(cached?.devices).toBe(4);
    expect(cached?.expiresAt?.toISOString()).toBe("2030-06-01T00:00:00.000Z");
  });

  it("treats a provider 409 conflict as terminal trial-family failure (never retried)", async () => {
    const order = await makeMutationOrder({ kind: "renew", keyId: "key_renew", days: 30 });
    await enqueueFulfillJob(order.id);
    const renewKey = vi
      .spyOn(artemida, "renewKey")
      .mockRejectedValue(new ArtemidaError("conflict", 409));

    await drainOutbox();

    const row = await prisma.order.findUnique({ where: { id: order.id } });
    expect(row?.status).toBe("failed");
    expect(row?.errorCode).toBe(TRIAL_ERROR_CODE);
    expect(renewKey).toHaveBeenCalledTimes(1);
    expect(
      await prisma.outbox.count({ where: { orderId: order.id, type: "notify-failed" } }),
    ).toBe(1);
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
