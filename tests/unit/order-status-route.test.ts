// GET /api/orders/[orderId] status-route vectors (PAY-04, UI-SPEC §2):
// the session-gated route returns only the caller's mapped order; a non-owned
// id and a missing id are indistinguishable (identical 404 body, no enumeration
// oracle — T-03-hist-idor / T-03-enumeration); and the serialized body never
// contains the provider transaction identifier or any other provider field
// (T-03-provider-leak). Runs against the real local Postgres.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ token: undefined as string | undefined }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      session.token === undefined ? undefined : { name, value: session.token },
  }),
}));

import { GET } from "../../app/api/orders/[orderId]/route";
import { signSession } from "../../lib/auth";
import { prisma } from "../../lib/prisma";

const OWNER = BigInt("200000520");
const OTHER = BigInt("200000521");
const SECRET =
  process.env["SESSION_SECRET"] ?? "unit-test-session-secret-at-least-32-characters";

const PROVIDER_TX = "tx_provider_oracle_status";

let userId: number;
let otherUserId: number;

type SeedStatus =
  | "pending"
  | "paid"
  | "provisioning"
  | "provisioned"
  | "failed"
  | "canceled"
  | "refunded";

async function cleanup(): Promise<void> {
  for (const telegramId of [OWNER, OTHER]) {
    const user = await prisma.user.findUnique({
      where: { telegramId },
      select: { id: true },
    });
    if (user) {
      await prisma.outbox.deleteMany({ where: { order: { userId: user.id } } });
      await prisma.order.deleteMany({ where: { userId: user.id } });
    }
    await prisma.user.deleteMany({ where: { telegramId } });
  }
}

async function seedOrder(
  ownerId: number,
  overrides: {
    status?: SeedStatus;
    kind?: "new" | "renew" | "upgrade";
    keyId?: string | null;
    plategaTxId?: string | null;
    amount?: number;
  } = {},
) {
  return prisma.order.create({
    data: {
      userId: ownerId,
      kind: overrides.kind ?? "new",
      keyId: overrides.keyId === undefined ? "key_status_1" : overrides.keyId,
      days: 30,
      devices: 2,
      amount: overrides.amount ?? 120,
      currency: "RUB",
      status: overrides.status ?? "paid",
      plategaTxId:
        overrides.plategaTxId === undefined ? PROVIDER_TX : overrides.plategaTxId,
      paymentUrl: "https://pay.platega.test/secret-url",
    },
  });
}

async function authorize(telegramId: number): Promise<void> {
  session.token = await signSession(telegramId, SECRET);
}

function get(orderId: string): Promise<Response> {
  return GET(new Request(`http://localhost/api/orders/${orderId}`), {
    params: Promise.resolve({ orderId }),
  });
}

beforeAll(async () => {
  await cleanup();
  const [owner, other] = await Promise.all([
    prisma.user.create({ data: { telegramId: OWNER }, select: { id: true } }),
    prisma.user.create({ data: { telegramId: OTHER }, select: { id: true } }),
  ]);
  userId = owner.id;
  otherUserId = other.id;
});

afterAll(async () => {
  await cleanup();
});

beforeEach(async () => {
  session.token = undefined;
  await prisma.outbox.deleteMany({
    where: { order: { userId: { in: [userId, otherUserId] } } },
  });
  await prisma.order.deleteMany({
    where: { userId: { in: [userId, otherUserId] } },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/orders/[orderId] — status contract", () => {
  it("returns the caller's own mapped order and no provider field", async () => {
    await authorize(Number(OWNER));
    const order = await seedOrder(userId);

    const res = await get(order.id);
    const body = (await res.json()) as { order: Record<string, unknown> };

    expect(res.status).toBe(200);
    // Exact, provider-free shape — no plategaTxId, no paymentUrl.
    expect(Object.keys(body.order).sort()).toEqual(
      ["amount", "createdAt", "currency", "id", "keyId", "kind", "status"].sort(),
    );
    expect(body.order).toMatchObject({
      id: order.id,
      amount: 120,
      currency: "RUB",
      status: "paid",
      kind: "new",
      keyId: "key_status_1",
    });
    expect(body.order).not.toHaveProperty("plategaTxId");
    expect(body.order).not.toHaveProperty("paymentUrl");
    expect(JSON.stringify(body)).not.toContain(PROVIDER_TX);
    expect(JSON.stringify(body)).not.toContain("secret-url");
  });

  it("treats a non-owned order and a missing order as an identical 404 (no oracle)", async () => {
    await authorize(Number(OWNER));
    const foreign = await seedOrder(otherUserId, { plategaTxId: "tx_foreign_status" });

    const foreignRes = await get(foreign.id);
    const missingRes = await get("order_absent_status");

    expect(foreignRes.status).toBe(404);
    expect(missingRes.status).toBe(404);
    const foreignBody = await foreignRes.json();
    const missingBody = await missingRes.json();
    expect(foreignBody).toEqual(missingBody);
    expect(missingBody).toEqual({ error: "not_found" });
  });

  it("rejects an over-long order id with 400 before any lookup", async () => {
    await authorize(Number(OWNER));

    const res = await get("x".repeat(201));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "bad_request" });
  });

  it("returns 401 with no session and never reads an order", async () => {
    const order = await seedOrder(userId);

    const res = await get(order.id);

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });
});
