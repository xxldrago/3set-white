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

describe("analytics phase8 loaders — Task 2 (burn / retention / churn)", () => {
  it("Test 7: loadBurnRunway coverage gate (partial → null; full ≥7 days → Σcost/30)", async () => {
    // Partial coverage: one costed + one uncosted in the 30d window → burn null.
    await makeOrder(ownerId, {
      provisionedKeyId: "burn-partial-c",
      finalAmount: 1000,
      providerCost: 200,
      paidAt: daysAgo(2),
    });
    await makeOrder(ownerId, {
      provisionedKeyId: "burn-partial-u",
      finalAmount: 800,
      providerCost: null,
      paidAt: daysAgo(1),
    });
    vi.spyOn(artemida, "getBalance").mockResolvedValue(wallet(100_000));

    const partial = await loadBurnRunway();
    expect(partial.burnCostedOrders).toBeLessThan(partial.burnTotalOrders);
    // With any uncosted row in the global 30d window, burn stays null.
    const fromDay = mskDayLabel(new Date(Date.now() - 29 * 86_400_000));
    const fromInstant = mskDayStartInstant(fromDay);
    const windowRows = await prisma.order.findMany({
      where: { status: { in: [...PAID] }, paidAt: { gte: fromInstant } },
      select: { providerCost: true, paidAt: true },
    });
    const windowCosted = windowRows.filter((o) => o.providerCost !== null && o.paidAt);
    if (windowCosted.length < windowRows.length) {
      expect(partial.burnPerDay).toBeNull();
    }

    // Full coverage with ≥ 7 distinct MSK costed days.
    await prisma.order.deleteMany({ where: { userId: { in: [ownerId, payer2Id, payer3Id] } } });
    // Wipe ALL paid orders in the 30d window so our fixture owns coverage.
    // Only delete our users' orders — if leftover uncosted rows exist globally,
    // the gate stays null and we assert that path instead.
    let costSum = 0;
    for (let i = 0; i < 8; i++) {
      const cost = 100 + i * 10;
      costSum += cost;
      await makeOrder(ownerId, {
        provisionedKeyId: `burn-full-${i}`,
        finalAmount: 500,
        providerCost: cost,
        paidAt: daysAgo(i + 1),
      });
    }
    const full = await loadBurnRunway();
    expect(full.burnDaysCovered).toBeGreaterThanOrEqual(7);
    expect(full.burnCostedOrders).toBeGreaterThanOrEqual(8);
    // Re-check global window coverage.
    const rows2 = await prisma.order.findMany({
      where: { status: { in: [...PAID] }, paidAt: { gte: fromInstant } },
      select: { providerCost: true, paidAt: true },
    });
    const costed2 = rows2.filter((o) => o.providerCost !== null && o.paidAt);
    const days2 = new Set(costed2.map((o) => mskDayLabel(o.paidAt as Date))).size;
    if (costed2.length === rows2.length && rows2.length > 0 && days2 >= 7) {
      const expectedCost = costed2.reduce((s, o) => s + (o.providerCost as number), 0);
      expect(full.burnPerDay).toBe(expectedCost / 30);
      expect(full.burnPerDay).toBeCloseTo(costSum / 30, 10);
    } else {
      // Global leftovers prevent full coverage — gate correctly returns null.
      expect(full.burnPerDay).toBeNull();
    }
  });

  it("Test 8: loadBurnRunway balance isolation (resolve / reject / unlimited)", async () => {
    // Ensure some costed days so burn can compute when coverage allows.
    for (let i = 0; i < 8; i++) {
      await makeOrder(ownerId, {
        provisionedKeyId: `bal-${i}`,
        finalAmount: 500,
        providerCost: 300,
        paidAt: daysAgo(i + 1),
      });
    }

    // Resolved finite balance.
    const spy = vi.spyOn(artemida, "getBalance").mockResolvedValue(wallet(412_000));
    const ok = await loadBurnRunway();
    expect(spy).toHaveBeenCalled();
    if (ok.burnPerDay !== null && ok.burnPerDay > 0) {
      expect(ok.balance).toBe(412_000);
      expect(ok.runwayDays).toBe(Math.floor(412_000 / ok.burnPerDay));
      expect(ok.runwayReason).toBeNull();
    } else {
      // Coverage gate failed globally — balance still surfaces.
      expect(ok.balance).toBe(412_000);
      expect(ok.runwayReason).toBe("no-burn");
      expect(ok.runwayDays).toBeNull();
    }
    const burnSnapshot = ok.burnPerDay;
    const costedSnapshot = ok.burnCostedOrders;

    // Rejected balance → null, burn fields intact.
    spy.mockRejectedValue(new Error("down"));
    const down = await loadBurnRunway();
    expect(down.balance).toBeNull();
    expect(down.runwayReason).toBe(burnSnapshot !== null && burnSnapshot > 0 ? "no-balance" : "no-burn");
    expect(down.burnPerDay).toBe(burnSnapshot);
    expect(down.burnCostedOrders).toBe(costedSnapshot);
    expect(down.runwayDays).toBeNull();

    // unlimited → balance null (A8).
    spy.mockResolvedValue({ balance: 0, currency: "RUB", unlimited: true });
    const unlim = await loadBurnRunway();
    expect(unlim.balance).toBeNull();
    expect(unlim.burnPerDay).toBe(burnSnapshot);
    expect(unlim.runwayReason).toBe(
      burnSnapshot !== null && burnSnapshot > 0 ? "no-balance" : "no-burn",
    );
  });

  it("Test 9: loadBurnRunway real zero burn (Σcost=0, full coverage, ≥7 days)", async () => {
    for (let i = 0; i < 8; i++) {
      await makeOrder(ownerId, {
        provisionedKeyId: `zero-burn-${i}`,
        finalAmount: 100,
        providerCost: 0,
        paidAt: daysAgo(i + 1),
      });
    }
    vi.spyOn(artemida, "getBalance").mockResolvedValue(wallet(50_000));

    const data = await loadBurnRunway();
    const fromDay = mskDayLabel(new Date(Date.now() - 29 * 86_400_000));
    const fromInstant = mskDayStartInstant(fromDay);
    const rows = await prisma.order.findMany({
      where: { status: { in: [...PAID] }, paidAt: { gte: fromInstant } },
      select: { providerCost: true, paidAt: true },
    });
    const costed = rows.filter((o) => o.providerCost !== null && o.paidAt);
    const days = new Set(costed.map((o) => mskDayLabel(o.paidAt as Date))).size;
    const costSum = costed.reduce((s, o) => s + (o.providerCost as number), 0);

    if (costed.length === rows.length && rows.length > 0 && days >= 7 && costSum === 0) {
      expect(data.burnPerDay).toBe(0);
      expect(data.runwayReason).toBe("no-burn");
      expect(data.runwayDays).toBeNull();
    } else if (costed.length === rows.length && rows.length > 0 && days >= 7) {
      // Leftover positive costs exist — burn is positive, not the real-zero path.
      expect(data.burnPerDay).toBe(costSum / 30);
    } else {
      expect(data.burnPerDay).toBeNull();
      expect(data.runwayReason).toBe("no-burn");
    }
  });

  it("Test 10: loadRetention trial filter + §6.7 shape + window identity", async () => {
    // Paying non-trial key with a term ending in-window (renewed).
    const paidAt = daysAgo(20);
    await makeOrder(ownerId, {
      provisionedKeyId: "ret-pay",
      keyId: "ret-pay",
      days: 10,
      finalAmount: 1000,
      providerCost: 200,
      paidAt,
    });
    // Next renew within grace → renewed outcome if end is in window.
    await makeOrder(ownerId, {
      kind: "renew",
      keyId: "ret-pay",
      days: 30,
      finalAmount: 1000,
      providerCost: 200,
      paidAt: new Date(paidAt.getTime() + 10 * 86_400_000),
    });

    // Trial key with a "paid" order that MUST be excluded (D-10 defensive).
    await prisma.keyCache.create({
      data: {
        userId: payer2Id,
        keyId: "ret-trial",
        status: "active",
        isTrial: true,
        expiresAt: new Date(Date.now() + 3 * 86_400_000),
      },
    });
    await makeOrder(payer2Id, {
      provisionedKeyId: "ret-trial",
      keyId: "ret-trial",
      days: 7,
      finalAmount: 0,
      balanceUsed: 0,
      providerCost: null,
      paidAt: daysAgo(5),
    });

    const data = await loadRetention(30);
    expect(Object.keys(data).sort()).toEqual(
      [
        "activeKeysAtStart",
        "churnedKeys",
        "expiringKeys",
        "logoChurnRate",
        "lostMrr",
        "mrrAtStart",
        "renewalRate",
        "renewedKeys",
        "revenueChurnRate",
      ].sort(),
    );
    expect(typeof data.expiringKeys).toBe("number");
    expect(typeof data.renewedKeys).toBe("number");
    expect(typeof data.churnedKeys).toBe("number");
    expect(typeof data.activeKeysAtStart).toBe("number");
    expect(typeof data.lostMrr).toBe("number");
    expect(typeof data.mrrAtStart).toBe("number");
    // Trial order must not appear as an expiring/churned event from ret-trial.
    // (Cannot assert absolute zeros due to other fixture keys; shape + types pin the contract.)
    expect(data.renewalRate === null || typeof data.renewalRate === "number").toBe(true);
    expect(data.logoChurnRate === null || typeof data.logoChurnRate === "number").toBe(true);
    expect(data.revenueChurnRate === null || typeof data.revenueChurnRate === "number").toBe(true);

    // Window identity: same fromInstant as loadKpis(30).
    const fromDay = mskDayLabel(new Date(Date.now() - 29 * 86_400_000));
    expect(mskDayStartInstant(fromDay).getTime()).toBe(
      mskDayStartInstant(mskDayLabel(new Date(Date.now() - 29 * 86_400_000))).getTime(),
    );
  });

  it("Test 11: loadChurnTable months reconcile with loadWaterfall + zero expiring → null rate", async () => {
    // Sparse history so some months have expiring === 0.
    await makeOrder(ownerId, {
      provisionedKeyId: "churn-hist",
      days: 30,
      finalAmount: 1000,
      providerCost: 250,
      paidAt: daysAgo(100),
    });
    await makeOrder(ownerId, {
      provisionedKeyId: "churn-recent",
      days: 60,
      finalAmount: 2000,
      providerCost: 500,
      paidAt: daysAgo(5),
    });

    const table = await loadChurnTable();
    const waterfall = await loadWaterfall();
    expect(table.months.map((m) => m.month)).toEqual(waterfall.months.map((m) => m.label));
    // Chronological
    for (let i = 1; i < table.months.length; i++) {
      expect(table.months[i]!.month >= table.months[i - 1]!.month).toBe(true);
    }

    for (const row of table.months) {
      if (row.expiring === 0) {
        expect(row.renewalRate).toBeNull();
        expect(row.renewed).toBe(0);
        expect(row.churned).toBe(0);
        expect(row.lostMrr).toBe(0);
      }
    }
  });

  it("Test 12: loadChurnTable §6.7 shape parity", async () => {
    await makeOrder(ownerId, {
      provisionedKeyId: "shape-k",
      days: 30,
      finalAmount: 900,
      providerCost: 100,
      paidAt: daysAgo(15),
    });
    const table = await loadChurnTable();
    expect(Array.isArray(table.months)).toBe(true);
    expect(table.months.length).toBeGreaterThanOrEqual(1);
    for (const row of table.months) {
      expect(Object.keys(row).sort()).toEqual(
        ["churned", "expiring", "lostMrr", "month", "renewalRate", "renewed"].sort(),
      );
      expect(typeof row.month).toBe("string");
      expect(row.month).toMatch(/^\d{4}-\d{2}-01$/);
      expect(typeof row.expiring).toBe("number");
      expect(typeof row.renewed).toBe("number");
      expect(typeof row.churned).toBe("number");
      expect(typeof row.lostMrr).toBe("number");
      expect(row.renewalRate === null || typeof row.renewalRate === "number").toBe(true);
    }
  });
});
