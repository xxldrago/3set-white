// providerCost capture (ANL-12, D-06/D-07): the per-order provider expense is
// fixed at provisioning — artemida.getPricing/getUpgradeQuote run CONCURRENTLY
// with the provider call via Promise.all, the write lands in the SAME atomic
// `markProvisioned` transition, and a quote outage never blocks key delivery
// (5xx → providerCost null + a `provider_cost_unavailable` warn). The no-leak
// source-contract suite (D-08) lives in the "no leak" describe at the bottom.
// Harness mirrors tests/unit/outbox-worker.test.ts (fresh 2000003xx OWNER +
// cleanup chain: outbox → order → keyCache → user).
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ArtemidaError, artemida, type NormalizedKey } from "../../lib/artemida";
import { logger } from "../../lib/logger";
import { markProvisioned } from "../../lib/orders-service";
import { prisma } from "../../lib/prisma";
import { processFulfillOrder } from "../../lib/worker";

const OWNER = BigInt("200000343"); // fresh 2000003xx range (RESEARCH Wave-0)

let userId: number;

function providerKey(id: string, overrides: Partial<NormalizedKey> = {}): NormalizedKey {
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
    ...overrides,
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
  overrides: Partial<{
    kind: "new" | "renew" | "upgrade";
    days: number | null;
    devices: number;
    keyId: string | null;
    status: "paid" | "provisioning";
  }> = {},
) {
  return prisma.order.create({
    data: {
      userId,
      kind: overrides.kind ?? "new",
      days: overrides.days === undefined ? 30 : overrides.days,
      devices: overrides.devices ?? 2,
      amount: 1000,
      currency: "RUB",
      status: overrides.status ?? "paid",
      keyId: overrides.keyId ?? null,
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

describe("providerCost capture — provisioning transition (D-06/D-07)", () => {
  it("records the getPricing quote in the SAME atomic transition for a new order", async () => {
    const order = await makeOrder({ kind: "new", days: 30, devices: 2 });
    vi.spyOn(artemida, "createKey").mockResolvedValue(providerKey("key_quote_ok"));
    const getPricing = vi.spyOn(artemida, "getPricing").mockResolvedValue({
      price: 5000,
      currency: "RUB",
      days: 30,
      devices: 2,
    });

    const outcome = await processFulfillOrder(order.id);

    expect(outcome).toEqual({ outcome: "provisioned" });
    expect(getPricing).toHaveBeenCalledTimes(1);
    const row = await prisma.order.findUnique({ where: { id: order.id } });
    expect(row?.status).toBe("provisioned");
    expect(row?.provisionedKeyId).toBe("key_quote_ok");
    expect(row?.providerCost).toBe(5000);
  });

  it("never blocks provisioning on a quote outage: 502 → provisioned with providerCost null + warn", async () => {
    const order = await makeOrder({ kind: "new", days: 30, devices: 2 });
    vi.spyOn(artemida, "createKey").mockResolvedValue(providerKey("key_outage"));
    vi.spyOn(artemida, "getPricing").mockRejectedValue(new ArtemidaError("bad_gateway", 502));
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => logger);

    const outcome = await processFulfillOrder(order.id);

    expect(outcome).toEqual({ outcome: "provisioned" });
    const row = await prisma.order.findUnique({ where: { id: order.id } });
    expect(row?.status).toBe("provisioned");
    expect(row?.provisionedKeyId).toBe("key_outage");
    expect(row?.providerCost).toBeNull();
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        route: "worker",
        outcome: "provider_cost_unavailable",
        orderId: order.id,
        code: "bad_gateway",
      }),
    );
  });

  it("quotes an upgrade delta against baseDevices recovered from the key mirror", async () => {
    const TARGET_KEY = "key_up_target";
    // Pre-upgrade device limit lives ONLY in the mirror; the order stores the
    // addDevices delta in `devices` (createOrder storedDevices rule).
    await prisma.keyCache.create({
      data: {
        userId,
        keyId: TARGET_KEY,
        status: "ACTIVE",
        deviceLimit: 5,
        customerRef: String(OWNER),
      },
    });
    const order = await makeOrder({ kind: "upgrade", days: null, devices: 2, keyId: TARGET_KEY });
    vi.spyOn(artemida, "upgradeKey").mockResolvedValue(providerKey("key_upgraded"));
    const getUpgradeQuote = vi.spyOn(artemida, "getUpgradeQuote").mockResolvedValue({
      amount: 240,
      currency: "RUB",
      addDevices: 2,
      devicePricePerMonth: 120,
    });
    const getPricing = vi.spyOn(artemida, "getPricing");

    const outcome = await processFulfillOrder(order.id);

    expect(outcome).toEqual({ outcome: "provisioned" });
    // baseDevices = max(1, cached.deviceLimit − order.devices) = max(1, 5−2) = 3
    expect(getUpgradeQuote).toHaveBeenCalledTimes(1);
    expect(getUpgradeQuote.mock.calls[0]?.[0]).toEqual({
      days: 30,
      devices: 3,
      addDevices: 2,
    });
    expect(getPricing).not.toHaveBeenCalled();
    const row = await prisma.order.findUnique({ where: { id: order.id } });
    expect(row?.status).toBe("provisioned");
    expect(row?.providerCost).toBe(240);
  });

  it("keeps markProvisioned's default behaviour: no third arg → providerCost stays null", async () => {
    const order = await makeOrder({ status: "provisioning" });

    const moved = await markProvisioned(order.id, "key_default");

    expect(moved).toBe(true);
    const row = await prisma.order.findUnique({ where: { id: order.id } });
    expect(row?.status).toBe("provisioned");
    expect(row?.provisionedKeyId).toBe("key_default");
    expect(row?.providerCost).toBeNull();
  });
});
