// Outbox worker vectors (T-03-doubleprov / T-03-lostorder / T-03-402):
// a paid order is provisioned exactly once under a deterministic
// `Idempotency-Key order:<id>:new`; a retryable ARTEMIDA error back offs and
// reuses the SAME key on the next attempt; an exhausted attempt budget and a
// 402 both end `failed` with exactly one `notify-failed` row; enqueue is
// idempotent. Runs against the real local Postgres with a spied
// `artemida.createKey` so no network is hit.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ArtemidaError, artemida, type NormalizedKey } from "../../lib/artemida";
import {
  FULFILL_JOB,
  NOTIFY_FAILED,
  NOTIFY_PROVISIONED,
  enqueueFulfillJob,
} from "../../lib/outbox";
import { prisma } from "../../lib/prisma";
import { MAX_FULFILL_ATTEMPTS, drainOutbox } from "../../lib/worker";

const OWNER = BigInt("200000310");

let userId: number;

function providerKey(id: string): NormalizedKey {
  return {
    id,
    name: null,
    status: "ACTIVE",
    isTrial: false,
    expiresAt: null,
    deviceLimit: null,
    devices: null,
    subscriptionUrl: `https://x.test/${id}`,
    customerRef: String(OWNER),
    trafficUsedBytes: null,
    trafficLimitBytes: null,
  };
}

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
  overrides: {
    status?: "paid" | "provisioning";
    attempts?: number;
    kind?: "new" | "renew" | "upgrade";
  } = {},
) {
  return prisma.order.create({
    data: {
      userId,
      kind: overrides.kind ?? "new",
      days: 30,
      devices: 2,
      amount: 100,
      currency: "RUB",
      status: overrides.status ?? "paid",
      attempts: overrides.attempts ?? 0,
    },
  });
}

async function outboxRow(orderId: string, type: string) {
  return prisma.outbox.findFirst({ where: { orderId, type } });
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

describe("outbox worker — paid → provisioned (PAY-01)", () => {
  it("claims a paid order, provisions it once under order:<id>:new, and reaches provisioned", async () => {
    const order = await makeOrder();
    await enqueueFulfillJob(order.id);
    const createKey = vi.spyOn(artemida, "createKey").mockResolvedValue(providerKey("key_ok"));

    await drainOutbox();

    const row = await prisma.order.findUnique({ where: { id: order.id } });
    expect(row?.status).toBe("provisioned");
    expect(row?.provisionedKeyId).toBe("key_ok");

    expect(createKey).toHaveBeenCalledTimes(1);
    expect(createKey.mock.calls[0]?.[0]).toEqual({
      customerRef: String(OWNER),
      days: 30,
      devices: 2,
    });
    // Deterministic key: a retry would reuse this exact value (D-18/D-41).
    expect(createKey.mock.calls[0]?.[1]?.idempotencyKey).toBe(`order:${order.id}:new`);

    // The key is mirrored into the owner's cache through the shared upsert path.
    const cached = await prisma.keyCache.findFirst({ where: { userId, keyId: "key_ok" } });
    expect(cached).not.toBeNull();

    // Exactly one success delivery row; the fulfill job is done.
    expect(
      await prisma.outbox.count({ where: { orderId: order.id, type: NOTIFY_PROVISIONED } }),
    ).toBe(1);
    expect((await outboxRow(order.id, FULFILL_JOB))?.status).toBe("done");
  });

  it("is idempotent: two enqueues create one outbox row", async () => {
    const order = await makeOrder();
    await enqueueFulfillJob(order.id);
    await enqueueFulfillJob(order.id);
    expect(
      await prisma.outbox.count({ where: { orderId: order.id, type: FULFILL_JOB } }),
    ).toBe(1);
  });

  it("backs off a retryable error and reuses the SAME Idempotency-Key on the next attempt", async () => {
    const order = await makeOrder();
    await enqueueFulfillJob(order.id);
    const createKey = vi
      .spyOn(artemida, "createKey")
      .mockRejectedValueOnce(new ArtemidaError("bad_gateway", 502));

    await drainOutbox();

    // Order is NOT lost: still provisioning with a future retry time.
    let row = await prisma.order.findUnique({ where: { id: order.id } });
    expect(row?.status).toBe("provisioning");
    expect(row?.attempts).toBe(1);
    expect(row?.nextAttemptAt?.getTime()).toBeGreaterThan(Date.now() - 1_000);

    // The outbox row is rescheduled (pending) for a later tick.
    const job = await outboxRow(order.id, FULFILL_JOB);
    expect(job?.status).toBe("pending");
    expect(job?.nextAttemptAt.getTime()).toBeGreaterThan(Date.now() - 1_000);
    const firstKey = createKey.mock.calls[0]?.[1]?.idempotencyKey;
    expect(firstKey).toBe(`order:${order.id}:new`);

    // Make the job due again → second attempt must reuse the same key.
    if (!job) throw new Error("expected a fulfill job");
    await prisma.outbox.update({ where: { id: job.id }, data: { nextAttemptAt: new Date(0) } });
    createKey.mockResolvedValueOnce(providerKey("key_after_retry"));

    await drainOutbox();

    expect(createKey).toHaveBeenCalledTimes(2);
    expect(createKey.mock.calls[1]?.[1]?.idempotencyKey).toBe(firstKey);
    row = await prisma.order.findUnique({ where: { id: order.id } });
    expect(row?.status).toBe("provisioned");
    expect(row?.provisionedKeyId).toBe("key_after_retry");
  });

  it("marks failed + exactly one notify-failed row when the attempt budget is exhausted", async () => {
    const order = await makeOrder({
      status: "provisioning",
      attempts: MAX_FULFILL_ATTEMPTS - 1,
    });
    await enqueueFulfillJob(order.id);
    vi.spyOn(artemida, "createKey").mockRejectedValue(
      new ArtemidaError("rate_limited", 429),
    );

    await drainOutbox();

    const row = await prisma.order.findUnique({ where: { id: order.id } });
    expect(row?.status).toBe("failed");
    expect(row?.errorCode).toBe("attempts_exhausted");
    expect(await prisma.outbox.count({ where: { orderId: order.id, type: NOTIFY_FAILED } })).toBe(
      1,
    );

    // A second drain must not enqueue a second notify-failed row.
    await drainOutbox();
    expect(await prisma.outbox.count({ where: { orderId: order.id, type: NOTIFY_FAILED } })).toBe(
      1,
    );
  });

  it("maps a 402 terminal failure to failed + exactly one notify-failed row", async () => {
    const order = await makeOrder();
    await enqueueFulfillJob(order.id);
    vi.spyOn(artemida, "createKey").mockRejectedValue(
      new ArtemidaError("payment_required", 402),
    );

    await drainOutbox();

    const row = await prisma.order.findUnique({ where: { id: order.id } });
    expect(row?.status).toBe("failed");
    expect(row?.errorCode).toBe("payment_required");
    expect(await prisma.outbox.count({ where: { orderId: order.id, type: NOTIFY_FAILED } })).toBe(
      1,
    );
  });

  it("leaves an already-provisioned order untouched (no second createKey)", async () => {
    const order = await makeOrder({ status: "provisioning" });
    await prisma.order.update({ where: { id: order.id }, data: { status: "provisioned" } });
    await enqueueFulfillJob(order.id);
    const createKey = vi.spyOn(artemida, "createKey");

    await drainOutbox();

    expect(createKey).not.toHaveBeenCalled();
    expect((await outboxRow(order.id, FULFILL_JOB))?.status).toBe("done");
  });
});
