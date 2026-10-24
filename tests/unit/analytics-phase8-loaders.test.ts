// DB-backed loader suite for Phase 8 §6.7 payloads (ANL-04..07, ANL-13/14):
// trailingMonthLabels ↔ loadWaterfall reconciliation, loadLtv / loadMargin
// (Task 1), loadBurnRunway / loadRetention / loadChurnTable (Task 2).
// Harness mirrors tests/unit/analytics-rollup.test.ts (fresh OWNER + cleanup).
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { artemida, type Balance } from "../../lib/artemida";
import {
  loadChurnTable,
  loadLtv,
  loadMargin,
  loadRetention,
  loadBurnRunway,
  loadWaterfall,
  trailingMonthLabels,
} from "../../lib/analytics/service";
import { mskDayLabel, mskDayStartInstant } from "../../lib/analytics/time";
import type { PaidOrderRow } from "../../lib/analytics/series";
import { prisma } from "../../lib/prisma";

const OWNER = BigInt("200000342"); // plan 08-02 fixture range
const PAYER2 = BigInt("200000344");
const PAYER3 = BigInt("200000345");

const PAID = ["paid", "provisioning", "provisioned"] as const;

const ORDER_SELECT = {
  id: true,
  userId: true,
  kind: true,
  days: true,
  devices: true,
  finalAmount: true,
  balanceUsed: true,
  providerCost: true,
  keyId: true,
  provisionedKeyId: true,
  paidAt: true,
  status: true,
} as const;

let ownerId: number;
let payer2Id: number;
let payer3Id: number;

function wallet(balance: number): Balance {
  return { balance, currency: "RUB", unlimited: false };
}

async function cleanup(): Promise<void> {
  const users = await prisma.user.findMany({
    where: { telegramId: { in: [OWNER, PAYER2, PAYER3] } },
    select: { id: true },
  });
  if (users.length > 0) {
    const ids = users.map((u) => u.id);
    await prisma.ticketCompensation.deleteMany({ where: { ticket: { userId: { in: ids } } } });
    await prisma.ticket.deleteMany({ where: { userId: { in: ids } } });
    await prisma.order.deleteMany({ where: { userId: { in: ids } } });
    await prisma.keyCache.deleteMany({ where: { userId: { in: ids } } });
  }
  await prisma.user.deleteMany({ where: { telegramId: { in: [OWNER, PAYER2, PAYER3] } } });
}

async function ensureUsers(): Promise<void> {
  const owner = await prisma.user.upsert({
    where: { telegramId: OWNER },
    create: { telegramId: OWNER },
    update: {},
    select: { id: true },
  });
  const p2 = await prisma.user.upsert({
    where: { telegramId: PAYER2 },
    create: { telegramId: PAYER2 },
    update: {},
    select: { id: true },
  });
  const p3 = await prisma.user.upsert({
    where: { telegramId: PAYER3 },
    create: { telegramId: PAYER3 },
    update: {},
    select: { id: true },
  });
  ownerId = owner.id;
  payer2Id = p2.id;
  payer3Id = p3.id;
}

async function makeOrder(
  userId: number,
  overrides: Partial<{
    kind: "new" | "renew" | "upgrade";
    days: number | null;
    finalAmount: number;
    balanceUsed: number;
    providerCost: number | null;
    keyId: string | null;
    provisionedKeyId: string | null;
    paidAt: Date;
    status: string;
  }>,
): Promise<void> {
  await prisma.order.create({
    data: {
      userId,
      kind: overrides.kind ?? "new",
      days: overrides.days === undefined ? 30 : overrides.days,
      devices: 2,
      amount: overrides.finalAmount ?? 1000,
      currency: "RUB",
      status: (overrides.status as "paid") ?? "paid",
      paidAt: overrides.paidAt,
      finalAmount: overrides.finalAmount ?? 1000,
      balanceUsed: overrides.balanceUsed ?? 0,
      providerCost: overrides.providerCost ?? null,
      keyId: overrides.keyId ?? null,
      provisionedKeyId: overrides.provisionedKeyId ?? null,
    },
  });
}

async function loadAllPaidOrders(): Promise<PaidOrderRow[]> {
  return prisma.order.findMany({
    where: { status: { in: [...PAID] } },
    select: ORDER_SELECT,
  });
}

/** days ago at ~12:00 MSK (09:00Z) so the MSK label is stable. */
function daysAgo(n: number): Date {
  const d = new Date(Date.now() - n * 86_400_000);
  // Normalize to mid-day UTC to avoid MSK boundary flapping near midnight.
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 9, 0, 0, 0),
  );
}

beforeAll(async () => {
  await cleanup();
  await ensureUsers();
});

beforeEach(async () => {
  await prisma.ticketCompensation.deleteMany({
    where: { ticket: { userId: { in: [ownerId, payer2Id, payer3Id] } } },
  });
  await prisma.ticket.deleteMany({ where: { userId: { in: [ownerId, payer2Id, payer3Id] } } });
  await prisma.order.deleteMany({ where: { userId: { in: [ownerId, payer2Id, payer3Id] } } });
  await prisma.keyCache.deleteMany({ where: { userId: { in: [ownerId, payer2Id, payer3Id] } } });
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  vi.restoreAllMocks();
  await cleanup();
});

describe("analytics phase8 loaders — Task 1 (trailingMonthLabels / LTV / margin)", () => {
  it("Test 1: trailingMonthLabels equals loadWaterfall month labels (8-month span)", async () => {
    // Eight MSK months of paid activity ending at current month.
    for (let i = 0; i < 8; i++) {
      await makeOrder(ownerId, {
        provisionedKeyId: `span-k${i}`,
        paidAt: daysAgo(30 * i + 5),
        finalAmount: 500 + i,
        providerCost: 100,
      });
    }
    const now = new Date();
    const orders = await loadAllPaidOrders();
    const labels = trailingMonthLabels(orders, now);
    const waterfall = await loadWaterfall();
    expect(labels).toEqual(waterfall.months.map((m) => m.label));
    expect(labels.length).toBeGreaterThanOrEqual(1);
    expect(labels.length).toBeLessThanOrEqual(6);
    // Chronological
    for (let i = 1; i < labels.length; i++) {
      expect(labels[i]! >= labels[i - 1]!).toBe(true);
    }
  });

  it("Test 2: loadLtv §6.7 shape + activePayers open-term marker (D-01)", async () => {
    // Payer A — open term (bought recently, long days).
    await makeOrder(ownerId, {
      provisionedKeyId: "ltv-open",
      days: 90,
      finalAmount: 3000,
      providerCost: 900,
      paidAt: daysAgo(5),
    });
    // Payer B — fully churned (term ended well past 7d grace).
    await makeOrder(payer2Id, {
      provisionedKeyId: "ltv-churned",
      days: 30,
      finalAmount: 1000,
      providerCost: 300,
      paidAt: daysAgo(60),
    });

    const data = await loadLtv();
    // §6.7 shape parity — null is a legal value (expect.anything rejects null).
    expect(Object.keys(data).sort()).toEqual(
      [
        "activePayers",
        "coverageFrom",
        "grossHistorical",
        "grossHistoricalPayers",
        "grossPredictive",
        "net",
        "netPayers",
        "predictiveChurnRate",
      ].sort(),
    );
    // Counts are JS numbers, never BigInt
    expect(typeof data.grossHistoricalPayers).toBe("number");
    expect(typeof data.netPayers).toBe("number");
    expect(typeof data.activePayers).toBe("number");
    expect(Number.isInteger(data.grossHistoricalPayers)).toBe(true);
    expect(data.grossHistorical === null || typeof data.grossHistorical === "number").toBe(true);
    expect(data.grossPredictive === null || typeof data.grossPredictive === "number").toBe(true);
    expect(data.predictiveChurnRate === null || typeof data.predictiveChurnRate === "number").toBe(
      true,
    );
    expect(data.net === null || typeof data.net === "number").toBe(true);
    expect(data.coverageFrom === null || typeof data.coverageFrom === "string").toBe(true);

    // Fixture: 1 open payer + 1 churned → activePayers === 1 and ≤ gross payers.
    expect(data.activePayers).toBe(1);
    expect(data.grossHistoricalPayers).toBe(2);
    expect(data.activePayers).toBeLessThanOrEqual(data.grossHistoricalPayers);
  });

  it("Test 3: loadLtv costed subset — net/netPayers/coverageFrom ignore null cost", async () => {
    const costedPaidAt = daysAgo(10);
    await makeOrder(ownerId, {
      provisionedKeyId: "costed-a",
      finalAmount: 2000,
      providerCost: 500,
      paidAt: costedPaidAt,
    });
    await makeOrder(ownerId, {
      provisionedKeyId: "uncosted-b",
      finalAmount: 1500,
      providerCost: null,
      paidAt: daysAgo(8),
    });

    const data = await loadLtv();
    // net uses only costed: cash 2000 − cost 500 = 1500 over 1 payer
    // (other leftover costed rows may exist — assert coverageFrom matches our earliest costed when it's the global min, else just shape)
    expect(data.netPayers).toBeGreaterThanOrEqual(1);
    expect(data.coverageFrom).not.toBeNull();
    expect(data.coverageFrom).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // Our costed day label must be ≥ coverageFrom (earliest costed overall)
    const ourLabel = mskDayLabel(costedPaidAt);
    expect(data.coverageFrom! <= ourLabel).toBe(true);
    if (data.net !== null) {
      expect(typeof data.net).toBe("number");
    }
  });

  it("Test 4: loadLtv null-vs-0 on empty / uncosted-only fixtures", async () => {
    // Empty: our users have no orders. Global empty is ideal; if other suites left
    // rows, still assert types. Prefer absolute when DB has no paid orders.
    const remaining = await prisma.order.count({
      where: { status: { in: [...PAID] } },
    });
    if (remaining === 0) {
      const empty = await loadLtv();
      expect(empty.grossHistorical).toBeNull();
      expect(empty.grossHistoricalPayers).toBe(0);
      expect(empty.coverageFrom).toBeNull();
      expect(empty.activePayers).toBe(0);
      expect(empty.net).toBeNull();
      expect(empty.netPayers).toBe(0);
    }

    // Uncosted-only from our users: net stays null when no costed rows exist
    // globally. Seed only uncosted; if global has costed leftovers, net may be set.
    await makeOrder(ownerId, {
      provisionedKeyId: "uncosted-only",
      finalAmount: 800,
      providerCost: null,
      paidAt: daysAgo(3),
    });
    const after = await loadLtv();
    expect(after.grossHistoricalPayers).toBeGreaterThanOrEqual(1);
    expect(after.grossHistorical).not.toBeNull();
    const costedCount = await prisma.order.count({
      where: { status: { in: [...PAID] }, providerCost: { not: null } },
    });
    if (costedCount === 0) {
      expect(after.net).toBeNull();
      expect(after.netPayers).toBe(0);
      expect(after.coverageFrom).toBeNull();
    }
  });

  it("Test 5: loadMargin wallet-only negative margin (D-13)", async () => {
    // Wallet-covered: cashOf = 0, providerCost > 0 → legal negative margin.
    await makeOrder(ownerId, {
      provisionedKeyId: "wallet-neg",
      finalAmount: 1000,
      balanceUsed: 1000,
      providerCost: 400,
      paidAt: daysAgo(2),
    });

    const data = await loadMargin(30);
    expect(data).toEqual(
      expect.objectContaining({
        costedOrders: expect.any(Number),
        totalOrders: expect.any(Number),
      }),
    );
    expect(data.costedOrders).toBeGreaterThanOrEqual(1);
    expect(data.totalOrders).toBeGreaterThanOrEqual(data.costedOrders);
    // Our wallet row contributes cash 0 + cost 400. If it's the only costed
    // row in the window, margin is −400 and marginPct null.
    const windowOrders = await prisma.order.findMany({
      where: {
        status: { in: [...PAID] },
        paidAt: { gte: mskDayStartInstant(mskDayLabel(new Date(Date.now() - 29 * 86_400_000))) },
      },
      select: { finalAmount: true, balanceUsed: true, providerCost: true },
    });
    // Recompute window start the same way service does (period 30 inclusive).
    const fromDay = mskDayLabel(new Date(Date.now() - 29 * 86_400_000));
    const fromInstant = mskDayStartInstant(fromDay);
    const rows = await prisma.order.findMany({
      where: { status: { in: [...PAID] }, paidAt: { gte: fromInstant } },
      select: { finalAmount: true, balanceUsed: true, providerCost: true },
    });
    const costed = rows.filter((o) => o.providerCost !== null);
    const cash = costed.reduce(
      (s, o) => s + Math.max(0, o.finalAmount - o.balanceUsed),
      0,
    );
    const cost = costed.reduce((s, o) => s + (o.providerCost as number), 0);

    expect(data.costedOrders).toBe(costed.length);
    expect(data.totalOrders).toBe(rows.length);
    expect(data.grossMargin).toBe(costed.length === 0 ? null : cash - cost);
    expect(data.marginPct).toBe(costed.length === 0 || cash === 0 ? null : (cash - cost) / cash);
    expect(data.costPerKey).toBe(costed.length === 0 ? null : cost / costed.length);

    // Pin the wallet-only negative path when our row is the sole costed one
    // or when costed cash is 0 overall.
    if (cash === 0 && costed.length > 0) {
      expect(data.grossMargin).toBeLessThan(0);
      expect(data.marginPct).toBeNull();
    }
    void windowOrders;
  });

  it("Test 6: loadMargin no-costed → null metrics, coverage counts", async () => {
    await makeOrder(ownerId, {
      provisionedKeyId: "margin-uncosted",
      finalAmount: 1200,
      providerCost: null,
      paidAt: daysAgo(1),
    });

    const fromDay = mskDayLabel(new Date(Date.now() - 29 * 86_400_000));
    const fromInstant = mskDayStartInstant(fromDay);
    const rows = await prisma.order.findMany({
      where: { status: { in: [...PAID] }, paidAt: { gte: fromInstant } },
      select: { providerCost: true },
    });
    const costedN = rows.filter((o) => o.providerCost !== null).length;

    const data = await loadMargin(30);
    expect(data.totalOrders).toBe(rows.length);
    expect(data.costedOrders).toBe(costedN);
    if (costedN === 0) {
      expect(data.grossMargin).toBeNull();
      expect(data.marginPct).toBeNull();
      expect(data.costPerKey).toBeNull();
      expect(data.totalOrders).toBeGreaterThan(0);
    }
  });
});
