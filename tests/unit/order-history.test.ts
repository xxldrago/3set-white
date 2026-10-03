// PAY-04 payment-history read vectors (D-46/D-47/D-48): the history is read
// entirely from our own `orders` table (no live Platega request), ownership is
// joined so a caller can only ever see their own rows (T-03-hist-idor), and the
// row mapper exposes raw amount/status/date/kind/keyId and never a provider id.
// Runs against the real local Postgres (keys-service.test.ts style).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  listOrdersForUser,
  loadOrderForUser,
  toHistoryRow,
} from "../../lib/orders-service";
import { prisma } from "../../lib/prisma";

const OWNER = BigInt("200000510");
const OTHER = BigInt("200000511");
const STRANGER = BigInt("200000512");

const DAY = 86_400_000;

let userId: number;
let otherUserId: number;
let strangerUserId: number;

type SeedStatus =
  | "pending"
  | "paid"
  | "provisioning"
  | "provisioned"
  | "failed"
  | "canceled"
  | "refunded";

async function cleanupUser(telegramId: bigint): Promise<void> {
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

async function cleanup(): Promise<void> {
  await cleanupUser(OWNER);
  await cleanupUser(OTHER);
  await cleanupUser(STRANGER);
}

async function seedOrder(
  ownerId: number,
  overrides: {
    kind?: "new" | "renew" | "upgrade";
    status?: SeedStatus;
    amount?: number;
    currency?: string;
    keyId?: string | null;
    createdAt?: Date;
    plategaTxId?: string | null;
  } = {},
) {
  return prisma.order.create({
    data: {
      userId: ownerId,
      kind: overrides.kind ?? "new",
      keyId: overrides.keyId ?? null,
      days: 30,
      devices: 2,
      amount: overrides.amount ?? 100,
      currency: overrides.currency ?? "RUB",
      status: overrides.status ?? "pending",
      plategaTxId:
        overrides.plategaTxId === undefined ? null : overrides.plategaTxId,
      createdAt: overrides.createdAt,
    },
  });
}

beforeAll(async () => {
  await cleanup();
  const [owner, other, stranger] = await Promise.all([
    prisma.user.create({ data: { telegramId: OWNER }, select: { id: true } }),
    prisma.user.create({ data: { telegramId: OTHER }, select: { id: true } }),
    prisma.user.create({ data: { telegramId: STRANGER }, select: { id: true } }),
  ]);
  userId = owner.id;
  otherUserId = other.id;
  strangerUserId = stranger.id;
});

afterAll(async () => {
  await cleanup();
});

beforeEach(async () => {
  await prisma.outbox.deleteMany({
    where: { order: { userId: { in: [userId, otherUserId, strangerUserId] } } },
  });
  await prisma.order.deleteMany({
    where: { userId: { in: [userId, otherUserId, strangerUserId] } },
  });
});

describe("listOrdersForUser — ownership isolation (T-03-hist-idor)", () => {
  it("returns only the caller's orders, newest first", async () => {
    const now = Date.now();
    const oldest = await seedOrder(userId, { createdAt: new Date(now - 3 * DAY) });
    const newest = await seedOrder(userId, { createdAt: new Date(now - 1 * DAY) });
    const middle = await seedOrder(userId, { createdAt: new Date(now - 2 * DAY) });
    const foreign = await seedOrder(otherUserId, { createdAt: new Date(now) });

    const rows = await listOrdersForUser(OWNER);

    expect(rows.map((r) => r.id)).toEqual([newest.id, middle.id, oldest.id]);
    expect(rows.map((r) => r.id)).not.toContain(foreign.id);
  });

  it("never includes another user's order", async () => {
    const mine = await seedOrder(userId, { createdAt: new Date(Date.now() - DAY) });
    await seedOrder(otherUserId, { createdAt: new Date(Date.now()) });

    const rows = await listOrdersForUser(OWNER);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(mine.id);
  });

  it("returns an empty list for a user with no orders (empty-state source)", async () => {
    await seedOrder(userId, { createdAt: new Date() });

    const rows = await listOrdersForUser(STRANGER);

    expect(rows).toEqual([]);
  });
});

describe("toHistoryRow — raw-value mapping (D-48)", () => {
  it("maps amount, status, date, kind and key reference into the row shape", async () => {
    const createdAt = new Date("2026-09-01T10:30:00.000Z");
    const order = await seedOrder(userId, {
      kind: "renew",
      status: "provisioned",
      amount: 250,
      currency: "RUB",
      keyId: "key_history_renew",
      createdAt,
      plategaTxId: "tx_provider_secret",
    });

    const row = toHistoryRow(order);

    expect(row).toEqual({
      id: order.id,
      amount: 250,
      currency: "RUB",
      status: "provisioned",
      kind: "renew",
      keyId: "key_history_renew",
      createdAt,
    });
    // A history row must never carry a provider identifier (T-03-provider-leak).
    expect(row).not.toHaveProperty("plategaTxId");
    expect(row).not.toHaveProperty("paymentUrl");
  });

  it("omits the key link for a null keyId without inventing a broken link", async () => {
    const order = await seedOrder(userId, {
      kind: "new",
      status: "pending",
      amount: 120,
      keyId: null,
      createdAt: new Date("2026-09-02T08:00:00.000Z"),
    });

    const row = toHistoryRow(order);

    expect(row.keyId).toBeNull();
    expect(row).not.toHaveProperty("keyLink");
    expect(row).not.toHaveProperty("subscriptionUrl");
    expect("keyId" in row).toBe(true);
    // The row still carries everything else so a partial row renders amount+status+date.
    expect(row.amount).toBe(120);
    expect(row.status).toBe("pending");
    expect(row.createdAt).toBeInstanceOf(Date);
  });
});

describe("loadOrderForUser — ownership join (T-03-hist-idor)", () => {
  it("returns the caller's own order", async () => {
    const order = await seedOrder(userId, { createdAt: new Date() });

    const loaded = await loadOrderForUser(OWNER, order.id);

    expect(loaded?.id).toBe(order.id);
  });

  it("returns null for an order the caller does not own", async () => {
    const foreign = await seedOrder(otherUserId, { createdAt: new Date() });

    expect(await loadOrderForUser(OWNER, foreign.id)).toBeNull();
  });

  it("returns null for a missing order id", async () => {
    expect(await loadOrderForUser(OWNER, "order_does_not_exist")).toBeNull();
  });
});
