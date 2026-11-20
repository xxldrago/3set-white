// POST /api/platega/callback vectors (T-03-forge / T-03-dup / T-03-amount):
// forged headers never reach the body, a PENDING/non-CONFIRMED status and an
// amount mismatch never transition the order, a duplicate CONFIRMED delivery
// produces exactly one pending→paid transition and exactly one outbox row, and
// the callback always acks 200 fast. Runs against the real local Postgres with
// a spied `platega.getTransaction` so no network is hit.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../../app/api/platega/callback/route";
import { platega, plategaBot, type TransactionStatus } from "../../lib/platega";
import { prisma } from "../../lib/prisma";
import { callbackBody } from "../helpers/fake-platega";

const OWNER = BigInt("200000090");
const ORDER_AMOUNT = 49;

const GOOD_HEADERS: Record<string, string> = {
  "content-type": "application/json",
  "x-merchantid": process.env["PLATEGA_MERCHANT_ID"] ?? "unit-test-merchant-id",
  "x-secret": process.env["PLATEGA_SECRET"] ?? "unit-test-platega-secret",
};

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

/** Create a pending order with a known tx id. */
async function makeOrder(overrides: { plategaTxId?: string | null } = {}) {
  return prisma.order.create({
    data: {
      userId,
      kind: "new",
      days: 30,
      devices: 2,
      amount: ORDER_AMOUNT,
      currency: "RUB",
      status: "pending",
      plategaTxId: "plategaTxId" in overrides ? overrides.plategaTxId : "tx_1",
    },
  });
}

function request(body: unknown, headers: Record<string, string> = GOOD_HEADERS): Request {
  return new Request("http://localhost/api/platega/callback", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function confirmedTx(overrides: Partial<TransactionStatus> = {}): TransactionStatus {
  return {
    id: "tx_1",
    status: "CONFIRMED",
    amount: ORDER_AMOUNT,
    currency: "RUB",
    payload: null,
    ...overrides,
  };
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

describe("POST /api/platega/callback (PAY-01)", () => {
  it("returns 401 for forged headers and never re-queries or transitions", async () => {
    const order = await makeOrder({ plategaTxId: "tx_forge" });
    const getTransaction = vi.spyOn(platega, "getTransaction");

    const res = await POST(
      request(callbackBody({ id: "tx_forge" }), {
        "content-type": "application/json",
        "x-merchantid": "attacker",
        "x-secret": "attacker",
      }),
    );

    expect(res.status).toBe(401);
    expect(getTransaction).not.toHaveBeenCalled();
    const row = await prisma.order.findUnique({ where: { id: order.id } });
    expect(row?.status).toBe("pending");
    expect(await prisma.outbox.count({ where: { orderId: order.id } })).toBe(0);
  });

  it("does not transition on a PENDING body even with valid headers", async () => {
    const order = await makeOrder({ plategaTxId: "tx_pending" });
    vi.spyOn(platega, "getTransaction").mockResolvedValue(
      confirmedTx({ id: "tx_pending", status: "PENDING" }),
    );

    const res = await POST(request(callbackBody({ id: "tx_pending", status: "PENDING" })));

    expect(res.status).toBe(200);
    const row = await prisma.order.findUnique({ where: { id: order.id } });
    expect(row?.status).toBe("pending");
    expect(await prisma.outbox.count({ where: { orderId: order.id } })).toBe(0);
  });

  it("does not transition when the re-queried amount differs (D-35)", async () => {
    const order = await makeOrder({ plategaTxId: "tx_mismatch" });
    vi.spyOn(platega, "getTransaction").mockResolvedValue(
      confirmedTx({ id: "tx_mismatch", amount: ORDER_AMOUNT - 1 }),
    );

    const res = await POST(request(callbackBody({ id: "tx_mismatch", amount: ORDER_AMOUNT - 1 })));

    expect(res.status).toBe(200);
    const row = await prisma.order.findUnique({ where: { id: order.id } });
    expect(row?.status).toBe("pending");
    expect(await prisma.outbox.count({ where: { orderId: order.id } })).toBe(0);
  });

  it("does not transition when the re-queried currency differs (D-35)", async () => {
    const order = await makeOrder({ plategaTxId: "tx_cur" });
    vi.spyOn(platega, "getTransaction").mockResolvedValue(
      confirmedTx({ id: "tx_cur", currency: "USD" }),
    );

    const res = await POST(request(callbackBody({ id: "tx_cur", currency: "USD" })));

    expect(res.status).toBe(200);
    const row = await prisma.order.findUnique({ where: { id: order.id } });
    expect(row?.status).toBe("pending");
  });

  it("flips pending→paid and enqueues exactly one outbox row on a valid CONFIRMED", async () => {
    const order = await makeOrder({ plategaTxId: "tx_ok" });
    vi.spyOn(platega, "getTransaction").mockResolvedValue(
      confirmedTx({ id: "tx_ok" }),
    );

    const res = await POST(request(callbackBody({ id: "tx_ok" })));

    expect(res.status).toBe(200);
    const row = await prisma.order.findUnique({ where: { id: order.id } });
    expect(row?.status).toBe("paid");
    expect(row?.paidAt).toBeInstanceOf(Date);
    const outbox = await prisma.outbox.findMany({ where: { orderId: order.id } });
    expect(outbox).toHaveLength(1);
    expect(outbox[0]?.type).toBe("fulfill-order");
  });

  it("is idempotent: a duplicate CONFIRMED yields one transition and one outbox row", async () => {
    const order = await makeOrder({ plategaTxId: "tx_dup" });
    vi.spyOn(platega, "getTransaction").mockResolvedValue(
      confirmedTx({ id: "tx_dup" }),
    );

    const first = await POST(request(callbackBody({ id: "tx_dup" })));
    const second = await POST(request(callbackBody({ id: "tx_dup" })));

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const row = await prisma.order.findUnique({ where: { id: order.id } });
    expect(row?.status).toBe("paid");
    expect(row?.attempts).toBe(0); // exactly one transition, no double-apply
    expect(await prisma.outbox.count({ where: { orderId: order.id } })).toBe(1);
  });

  it("recovers a lost create response by resolving the order via payload=orderId", async () => {
    // No plategaTxId stored (create response was lost); Platega echoes our order id.
    const order = await makeOrder({ plategaTxId: null });
    vi.spyOn(platega, "getTransaction").mockResolvedValue(
      confirmedTx({ id: "tx_lost", payload: order.id }),
    );

    const res = await POST(request(callbackBody({ id: "tx_lost", payload: order.id })));

    expect(res.status).toBe(200);
    const row = await prisma.order.findUnique({ where: { id: order.id } });
    expect(row?.status).toBe("paid");
    // The resolved tx id is bound to the order for future idempotent deliveries.
    expect(row?.plategaTxId).toBeNull(); // transition does not rewrite the tx id
    expect(await prisma.outbox.count({ where: { orderId: order.id } })).toBe(1);
  });

  it("maps a CHARGEBACKED re-query on a paid order to refunded", async () => {
    const order = await makeOrder({ plategaTxId: "tx_cb" });
    await prisma.order.update({ where: { id: order.id }, data: { status: "paid" } });
    vi.spyOn(platega, "getTransaction").mockResolvedValue(
      confirmedTx({ id: "tx_cb", status: "CHARGEBACKED" }),
    );

    const res = await POST(request(callbackBody({ id: "tx_cb", status: "CHARGEBACKED" })));

    expect(res.status).toBe(200);
    const row = await prisma.order.findUnique({ where: { id: order.id } });
    expect(row?.status).toBe("refunded");
  });

  it("never refunds a pending order on CHARGEBACKED (money was never captured)", async () => {
    const order = await makeOrder({ plategaTxId: "tx_cb_pending" });
    vi.spyOn(platega, "getTransaction").mockResolvedValue(
      confirmedTx({ id: "tx_cb_pending", status: "CHARGEBACKED" }),
    );

    const res = await POST(request(callbackBody({ id: "tx_cb_pending", status: "CHARGEBACKED" })));

    expect(res.status).toBe(200);
    const row = await prisma.order.findUnique({ where: { id: order.id } });
    expect(row?.status).toBe("pending");
  });

  it("does not issue on DISPUTED, but leaves an already-settled order alone", async () => {
    const order = await makeOrder({ plategaTxId: "tx_disputed" });
    await prisma.order.update({ where: { id: order.id }, data: { status: "provisioned" } });
    vi.spyOn(platega, "getTransaction").mockResolvedValue(
      confirmedTx({ id: "tx_disputed", status: "DISPUTED" }),
    );

    const res = await POST(request(callbackBody({ id: "tx_disputed", status: "DISPUTED" })));

    expect(res.status).toBe(200);
    // A review opened after capture must not revoke a delivered key; only a
    // later CHARGEBACKED does that.
    const row = await prisma.order.findUnique({ where: { id: order.id } });
    expect(row?.status).toBe("provisioned");
  });

  it("keeps a PARTIALLY_REFUNDED order settled (only a full return refunds)", async () => {
    const order = await makeOrder({ plategaTxId: "tx_partial" });
    await prisma.order.update({ where: { id: order.id }, data: { status: "paid" } });
    vi.spyOn(platega, "getTransaction").mockResolvedValue(
      confirmedTx({ id: "tx_partial", status: "PARTIALLY_REFUNDED" }),
    );

    const res = await POST(
      request(callbackBody({ id: "tx_partial", status: "PARTIALLY_REFUNDED" })),
    );

    expect(res.status).toBe(200);
    const row = await prisma.order.findUnique({ where: { id: order.id } });
    expect(row?.status).toBe("paid");
  });

  it("acks 200 fast even when the re-query throws (no redelivery loop)", async () => {
    const order = await makeOrder({ plategaTxId: "tx_err" });
    vi.spyOn(platega, "getTransaction").mockRejectedValue(new Error("boom"));

    const res = await POST(request(callbackBody({ id: "tx_err" })));

    expect(res.status).toBe(200);
    const row = await prisma.order.findUnique({ where: { id: order.id } });
    expect(row?.status).toBe("pending");
  });

  it("verifies headers before parsing the body (invalid JSON still 401s on bad headers)", async () => {
    const res = await POST(
      new Request("http://localhost/api/platega/callback", {
        method: "POST",
        headers: { "content-type": "application/json", "x-merchantid": "x", "x-secret": "y" },
        body: "not-json",
      }),
    );
    expect(res.status).toBe(401);
  });

  it("rejects an overpayment, because the merchant pays the commission", async () => {
    const order = await makeOrder({ plategaTxId: "tx_sbp_fee" });
    // With the commission on the merchant, the payer is charged exactly the
    // order amount; anything above it is an anomaly and must not settle.
    vi.spyOn(platega, "getTransaction").mockResolvedValue(
      confirmedTx({ id: "tx_sbp_fee", amount: 52.92 }),
    );

    const res = await POST(
      request(callbackBody({ id: "tx_sbp_fee", amount: 52.92 })),
    );

    expect(res.status).toBe(200);
    const row = await prisma.order.findUnique({ where: { id: order.id } });
    expect(row?.status).toBe("pending");
    expect(await prisma.outbox.count({ where: { orderId: order.id } })).toBe(0);
  });

  it("rejects an underpayment (charged < expected)", async () => {
    const order = await makeOrder({ plategaTxId: "tx_under" });
    vi.spyOn(platega, "getTransaction").mockResolvedValue(
      confirmedTx({ id: "tx_under", amount: ORDER_AMOUNT - 1 }),
    );

    const res = await POST(request(callbackBody({ id: "tx_under", amount: ORDER_AMOUNT - 1 })));

    expect(res.status).toBe(200);
    const row = await prisma.order.findUnique({ where: { id: order.id } });
    expect(row?.status).toBe("pending");
  });

  it("rejects an absurd overpayment beyond the SBP fee band", async () => {
    const order = await makeOrder({ plategaTxId: "tx_way_over" });
    vi.spyOn(platega, "getTransaction").mockResolvedValue(
      confirmedTx({ id: "tx_way_over", amount: ORDER_AMOUNT * 3 }),
    );

    const res = await POST(
      request(callbackBody({ id: "tx_way_over", amount: ORDER_AMOUNT * 3 })),
    );

    expect(res.status).toBe(200);
    const row = await prisma.order.findUnique({ where: { id: order.id } });
    expect(row?.status).toBe("pending");
  });

  it("routes a bot-merchant callback through the bot client (dual merchant)", async () => {
    const order = await makeOrder({ plategaTxId: "tx_bot" });
    await prisma.order.update({
      where: { id: order.id },
      data: { plategaMerchant: "bot" },
    });
    const botSpy = vi
      .spyOn(plategaBot, "getTransaction")
      .mockResolvedValue(confirmedTx({ id: "tx_bot" }));
    const siteSpy = vi.spyOn(platega, "getTransaction");

    const res = await POST(
      request(callbackBody({ id: "tx_bot" }), {
        "content-type": "application/json",
        "x-merchantid": process.env["PLATEGA_BOT_MERCHANT_ID"] ?? "unit-test-bot-merchant-id",
        "x-secret": process.env["PLATEGA_BOT_SECRET"] ?? "unit-test-bot-platega-secret",
      }),
    );

    expect(res.status).toBe(200);
    expect(botSpy).toHaveBeenCalledWith("tx_bot");
    expect(siteSpy).not.toHaveBeenCalled();
    const row = await prisma.order.findUnique({ where: { id: order.id } });
    expect(row?.status).toBe("paid");
  });

  it("refuses a site-merchant callback that targets a bot order (merchant mismatch)", async () => {
    const order = await makeOrder({ plategaTxId: "tx_bot_mismatch" });
    await prisma.order.update({
      where: { id: order.id },
      data: { plategaMerchant: "bot" },
    });
    const siteSpy = vi.spyOn(platega, "getTransaction");

    // Valid SITE headers, but the order belongs to the bot merchant.
    const res = await POST(request(callbackBody({ id: "tx_bot_mismatch" })));

    expect(res.status).toBe(200); // acked, never redelivered
    expect(siteSpy).not.toHaveBeenCalled();
    const row = await prisma.order.findUnique({ where: { id: order.id } });
    expect(row?.status).toBe("pending");
    expect(await prisma.outbox.count({ where: { orderId: order.id } })).toBe(0);
  });
});
