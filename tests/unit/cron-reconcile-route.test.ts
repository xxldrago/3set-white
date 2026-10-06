// POST /api/cron/reconcile vectors (T-03-cronopen): the manual A6 fallback is
// secret-gated — a missing/forged header never runs a pass, and a valid header
// recovers an aged CONFIRMED order to `paid` + one fulfill job. DB-backed with a
// spied `platega.getTransaction`.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../../app/api/cron/reconcile/route";
import { FULFILL_JOB } from "../../lib/outbox";
import { platega, type TransactionStatus } from "../../lib/platega";
import { prisma } from "../../lib/prisma";

const OWNER = BigInt("200000330");
const SECRET = process.env["CRON_SECRET"] ?? "unit-test-cron-secret-000000000000";
const OLD = 10 * 60 * 1_000;

let userId: number;

async function cleanup(): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { telegramId: OWNER },
    select: { id: true },
  });
  if (user) {
    await prisma.outbox.deleteMany({ where: { order: { userId: user.id } } });
    await prisma.order.deleteMany({ where: { userId: user.id } });
  }
  await prisma.user.deleteMany({ where: { telegramId: OWNER } });
}

async function makeOrder(txId = "tx_cron") {
  return prisma.order.create({
    data: {
      userId,
      kind: "new",
      days: 30,
      devices: 2,
      amount: 100,
      currency: "RUB",
      status: "pending",
      plategaTxId: txId,
      createdAt: new Date(Date.now() - OLD),
    },
  });
}

function tx(overrides: Partial<TransactionStatus> = {}): TransactionStatus {
  return { id: "tx_cron", status: "CONFIRMED", amount: 100, currency: "RUB", payload: null, ...overrides };
}

function request(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/cron/reconcile", { method: "POST", headers });
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

describe("POST /api/cron/reconcile (T-03-cronopen)", () => {
  it("rejects a missing secret header and runs no pass", async () => {
    const order = await makeOrder();
    const getTransaction = vi.spyOn(platega, "getTransaction");

    const res = await POST(request());

    expect(res.status).toBe(401);
    expect(getTransaction).not.toHaveBeenCalled();
    const row = await prisma.order.findUnique({ where: { id: order.id } });
    expect(row?.status).toBe("pending");
  });

  it("rejects a forged secret header", async () => {
    await makeOrder();
    const getTransaction = vi.spyOn(platega, "getTransaction");

    const res = await POST(request({ "x-cron-secret": "not-the-secret" }));

    expect(res.status).toBe(401);
    expect(getTransaction).not.toHaveBeenCalled();
  });

  it("runs one reconcile pass with the valid secret", async () => {
    const order = await makeOrder("tx_cron_ok");
    vi.spyOn(platega, "getTransaction").mockResolvedValue(tx({ id: "tx_cron_ok" }));

    const res = await POST(request({ "x-cron-secret": SECRET }));

    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; recovered: number };
    expect(body.ok).toBe(true);
    expect(body.recovered).toBe(1);
    const row = await prisma.order.findUnique({ where: { id: order.id } });
    expect(row?.status).toBe("paid");
    expect(await prisma.outbox.count({ where: { orderId: order.id, type: FULFILL_JOB } })).toBe(1);
  });
});
