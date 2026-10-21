// DB-backed idempotency + concurrency vectors for lib/analytics/rollup.ts
// (ANL-15 / Pitfalls 7+9): exact absolute aggregates in daily_metrics, a
// re-run that leaves values byte-identical, twelve concurrent runs that
// converge on one row per day without a double-count, and the balance
// snapshot's first-reading-wins / graceful-degradation paths. Harness
// mirrors tests/unit/outbox-worker.test.ts (fake telegram id + cleanup).
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { artemida, type Balance } from "../../lib/artemida";
import { rollupDays } from "../../lib/analytics/rollup";
import { mskDateKey, mskDayLabel } from "../../lib/analytics/time";
import { prisma } from "../../lib/prisma";

const OWNER = BigInt("200000340"); // fresh 2000003xx range (RESEARCH Wave-0)
const FROM_DAY = "2026-03-10";
const DAY_KEYS = ["2026-03-10", "2026-03-11", "2026-03-12"].map(mskDateKey);

const YESTERDAY_LABEL = mskDayLabel(new Date(Date.now() - 86_400_000));

let userId: number;

function wallet(balance: number): Balance {
  return { balance, currency: "RUB", unlimited: false };
}

async function cleanup(): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { telegramId: OWNER },
    select: { id: true },
  });
  if (user) {
    await prisma.ticketCompensation.deleteMany({ where: { ticket: { userId: user.id } } });
    await prisma.ticket.deleteMany({ where: { userId: user.id } });
    await prisma.order.deleteMany({ where: { userId: user.id } });
    await prisma.keyCache.deleteMany({ where: { userId: user.id } });
  }
  await prisma.user.deleteMany({ where: { telegramId: OWNER } });
  await prisma.dailyMetric.deleteMany({ where: { day: { in: DAY_KEYS } } });
}

async function makeOrder(
  overrides: Partial<{
    kind: "new" | "renew" | "upgrade";
    days: number | null;
    finalAmount: number;
    balanceUsed: number;
    providerCost: number | null;
    keyId: string | null;
    provisionedKeyId: string | null;
    paidAt: Date;
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
      status: "paid",
      paidAt: overrides.paidAt,
      finalAmount: overrides.finalAmount ?? 1000,
      balanceUsed: overrides.balanceUsed ?? 0,
      providerCost: overrides.providerCost ?? null,
      keyId: overrides.keyId ?? null,
      provisionedKeyId: overrides.provisionedKeyId ?? null,
    },
  });
}

/** Independent expectations, written against the fixture, not the code under test. */
function expectedRows() {
  return [
    {
      day: "2026-03-10",
      paidOrders: 1,
      paidCashRub: 700, // 1000 − 300, balance-covered leg excluded
      newOrders: 1,
      renewOrders: 0,
      upgradeOrders: 0,
      providerCostRub: 400,
      providerCostOrders: 1,
      activeKeys: 2, // m0 (bought before the window) + m1
      newUsers: 0,
      goodwillDays: 0,
    },
    {
      day: "2026-03-11",
      paidOrders: 2,
      paidCashRub: 500, // renew covers 0 cash + upgrade 500
      newOrders: 0,
      renewOrders: 1,
      upgradeOrders: 1,
      providerCostRub: 150, // renew's NULL cost adds nothing
      providerCostOrders: 1,
      activeKeys: 2, // m0 + m1 (renew-extended)
      newUsers: 1, // the OWNER account itself
      goodwillDays: 3,
    },
    {
      day: "2026-03-12",
      paidOrders: 1,
      paidCashRub: 2000,
      newOrders: 1,
      renewOrders: 0,
      upgradeOrders: 0,
      providerCostRub: 0,
      providerCostOrders: 0, // NULL is the honest coverage gap (D-08)
      activeKeys: 3, // m0 + m1 + m2 (active from its paidAt)
      newUsers: 0,
      goodwillDays: 0,
    },
  ];
}

async function loadRows() {
  return prisma.dailyMetric.findMany({
    where: { day: { in: DAY_KEYS } },
    orderBy: { day: "asc" },
  });
}

type DailyRow = Awaited<ReturnType<typeof loadRows>>[number];

// All value columns without computed_at (which may move between runs).
function valuesOf(rows: DailyRow[]) {
  return rows.map((r) => {
    const { computedAt: _computedAt, ...rest } = r;
    return { ...rest, day: r.day.toISOString().slice(0, 10) };
  });
}

beforeAll(async () => {
  await cleanup();
  const user = await prisma.user.create({
    data: { telegramId: OWNER, createdAt: new Date("2026-03-11T09:00:00.000Z") },
    select: { id: true },
  });
  userId = user.id;

  // Key m0 bought BEFORE the window — the chain-history load must count it
  // active on every in-range day but keep its money on its own (unemitted) day.
  await makeOrder({
    provisionedKeyId: "m0",
    days: 365,
    finalAmount: 3000,
    paidAt: new Date("2026-02-10T09:00:00.000Z"),
  });
  await makeOrder({
    provisionedKeyId: "m1",
    finalAmount: 1000,
    balanceUsed: 300,
    providerCost: 400,
    paidAt: new Date("2026-03-10T09:00:00.000Z"),
  });
  await makeOrder({
    kind: "renew",
    keyId: "m1",
    finalAmount: 800,
    balanceUsed: 800,
    providerCost: null,
    paidAt: new Date("2026-03-11T12:00:00.000Z"),
  });
  await makeOrder({
    kind: "upgrade",
    keyId: "m1",
    days: null,
    finalAmount: 500,
    providerCost: 150,
    paidAt: new Date("2026-03-11T14:00:00.000Z"),
  });
  await makeOrder({
    provisionedKeyId: "m2",
    days: 90,
    finalAmount: 2000,
    paidAt: new Date("2026-03-12T09:00:00.000Z"),
  });

  const ticket = await prisma.ticket.create({
    data: { subject: "rollup fixture", userId },
    select: { id: true },
  });
  await prisma.ticketCompensation.create({
    data: {
      ticketId: ticket.id,
      adminTelegramId: OWNER,
      days: 3,
      reason: "goodwill",
      requestId: "req-rollup-fixture-1",
      messageId: "msg-rollup-fixture-1",
      createdAt: new Date("2026-03-11T10:00:00.000Z"),
    },
  });
});

afterAll(async () => {
  vi.restoreAllMocks();
  await cleanup();
});

beforeEach(async () => {
  await prisma.dailyMetric.deleteMany({ where: { day: { in: DAY_KEYS } } });
  await prisma.artemidaBalanceSnapshot.deleteMany({ where: { day: mskDateKey(YESTERDAY_LABEL) } });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("analytics/rollup — rollupDays (real DB)", () => {
  it("writes exact absolute aggregates and stays idempotent on re-run", async () => {
    const getBalance = vi
      .spyOn(artemida, "getBalance")
      .mockResolvedValue(wallet(1234));

    const first = await rollupDays(FROM_DAY, "2026-03-12");
    expect(first).toEqual({ days: 3, upserted: 3, balance: "ok" });

    const rows = await loadRows();
    expect(valuesOf(rows)).toEqual(expectedRows());

    // Idempotent re-run: computed_at may move, every value column equals.
    const snap1 = rows.map((r) => ({
      ...r,
      computedAt: (r.computedAt as Date).getTime(),
    }));
    const second = await rollupDays(FROM_DAY, "2026-03-12");
    expect(second).toEqual({ days: 3, upserted: 3, balance: "ok" });
    const rows2 = await loadRows();
    expect(valuesOf(rows2)).toEqual(valuesOf(rows));
    const snap2 = rows2.map((r) => ({ ...r, computedAt: (r.computedAt as Date).getTime() }));
    snap2.forEach((rowAfter, i) => {
      expect(rowAfter.computedAt).toBeGreaterThanOrEqual(snap1[i]!.computedAt);
    });

    // One snapshot row for yesterday, carrying the mocked wallet value.
    const snapshot = await prisma.artemidaBalanceSnapshot.findUnique({
      where: { day: mskDateKey(YESTERDAY_LABEL) },
    });
    expect(snapshot?.balanceRub).toBe(1234);
    expect(snapshot?.source).toBe("cron");
    expect(getBalance).toHaveBeenCalled();
  });

  it("survives 12 concurrent runs on the same day: one absolute row, no double-count", async () => {
    vi.spyOn(artemida, "getBalance").mockResolvedValue(wallet(500));

    const results = await Promise.all(
      Array.from({ length: 12 }, () => rollupDays(FROM_DAY, "2026-03-12")),
    );
    // No 40001 / serialization exception — every call resolved cleanly.
    for (const r of results) expect(r).toEqual({ days: 3, upserted: 3, balance: "ok" });

    const rows = await loadRows();
    expect(rows).toHaveLength(3); // exactly one row per day, never more
    expect(valuesOf(rows)).toEqual(expectedRows()); // absolute values, not summed
  });

  it("balance snapshot never overwrites an earlier reading; failure logs and continues", async () => {
    await prisma.artemidaBalanceSnapshot.create({
      data: {
        day: mskDateKey(YESTERDAY_LABEL),
        balanceRub: 42,
        capturedAt: new Date("2020-01-01T00:00:00.000Z"),
      },
    });
    vi.spyOn(artemida, "getBalance").mockResolvedValue(wallet(999));

    await rollupDays(FROM_DAY, "2026-03-12");

    const snapshot = await prisma.artemidaBalanceSnapshot.findUnique({
      where: { day: mskDateKey(YESTERDAY_LABEL) },
    });
    // ON CONFLICT (day) DO NOTHING — yesterday's earlier reading wins.
    expect(snapshot?.balanceRub).toBe(42);
    expect(snapshot?.capturedAt).toEqual(new Date("2020-01-01T00:00:00.000Z"));
  });

  it("a failed getBalance logs warn and never fails the rollup", async () => {
    vi.spyOn(artemida, "getBalance").mockRejectedValue(new Error("wallet down"));

    const result = await rollupDays(FROM_DAY, "2026-03-12");

    expect(result).toEqual({ days: 3, upserted: 3, balance: "skipped" });
    expect(valuesOf(await loadRows())).toEqual(expectedRows()); // rollup itself succeeded
    expect(
      await prisma.artemidaBalanceSnapshot.count({ where: { day: mskDateKey(YESTERDAY_LABEL) } }),
    ).toBe(0); // nothing half-written
  });
});
