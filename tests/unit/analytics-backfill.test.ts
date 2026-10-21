// Backfill vectors (ANL-15 / D-14): running the script's engine (rollupDays —
// the SAME module the nightly cron route calls) over a fixed 3-day fixture
// history produces daily_metrics rows equal to an INDEPENDENT manual
// recomputation written here (plain prisma.findMany + explicit per-day JS
// loops — a second code path, the in-test analog of the VALIDATION
// manual-reconciliation row), and a re-run leaves every value column
// byte-identical (absolute upsert, D-13/Pitfall 7). Harness mirrors
// tests/unit/outbox-worker.test.ts (fresh 2000003xx OWNER + cleanup).
import { readFile } from "node:fs/promises";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { artemida, type Balance } from "../../lib/artemida";
import { rollupDays } from "../../lib/analytics/rollup";
import { nextDayLabel } from "../../lib/analytics/series";
import { mskDateKey, mskDayLabel, mskDayStartInstant } from "../../lib/analytics/time";
import { prisma } from "../../lib/prisma";

const OWNER = BigInt("200000341"); // fresh 2000003xx range (RESEARCH Wave-0)
const FROM_DAY = "2026-04-10";
const DAY_KEYS = ["2026-04-10", "2026-04-11", "2026-04-12"].map(mskDateKey);

const YESTERDAY_LABEL = mskDayLabel(new Date(Date.now() - 86_400_000));

// Mirrors lib/revenue.ts:10 — the same money statuses, never a second enum.
const PAID = ["paid", "provisioning", "provisioned"] as const;

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

/**
 * The independent recomputation: explicit per-day loops over a plain
 * prisma.findMany of the same DB state rollupDays just read — NOT the series
 * builder. Timeline-window loop buys the genuine one-day-bucket property the
 * engine's map pass must reproduce.
 */
async function manualRecompute(fromDay: string, toDay: string): Promise<Record<string, unknown>[]> {
  const to = mskDayStartInstant(nextDayLabel(toDay));
  const [orders, users, compensations] = await Promise.all([
    prisma.order.findMany({
      where: { status: { in: [...PAID] }, paidAt: { lt: to } },
      select: {
        kind: true,
        days: true,
        finalAmount: true,
        balanceUsed: true,
        providerCost: true,
        keyId: true,
        provisionedKeyId: true,
        paidAt: true,
      },
    }),
    prisma.user.findMany({ where: { createdAt: { lt: to } }, select: { createdAt: true } }),
    prisma.ticketCompensation.findMany({
      where: { createdAt: { lt: to } },
      select: { days: true, createdAt: true },
    }),
  ]);

  // Term chains grouped by keyRef, walked with a cursor — written inline, not
  // imported from lib/analytics/series.
  const refs = new Map<string, { paidAt: number; days: number }[]>();
  for (const o of orders) {
    const ref = o.keyId ?? o.provisionedKeyId;
    if (!ref || !o.paidAt) continue;
    if (o.kind === "upgrade") continue; // upgrades never extend the chain
    const groups = refs.get(ref) ?? [];
    groups.push({ paidAt: o.paidAt.getTime(), days: o.days ?? 0 });
    refs.set(ref, groups);
  }

  const rows: Record<string, unknown>[] = [];
  for (let day = fromDay; day <= toDay; day = nextDayLabel(day)) {
    const start = mskDayStartInstant(day).getTime();
    const end = mskDayStartInstant(nextDayLabel(day)).getTime();
    const row = {
      day,
      paidOrders: 0,
      paidCashRub: 0,
      newOrders: 0,
      renewOrders: 0,
      upgradeOrders: 0,
      providerCostRub: 0,
      providerCostOrders: 0,
      activeKeys: 0,
      newUsers: 0,
      goodwillDays: 0,
    };
    for (const o of orders) {
      if (!o.paidAt) continue;
      const paidAt = o.paidAt.getTime();
      if (paidAt < start || paidAt >= end) continue; // money belongs to its own day
      row.paidOrders += 1;
      row.paidCashRub += Math.max(0, o.finalAmount - o.balanceUsed);
      if (o.kind === "new") row.newOrders += 1;
      else if (o.kind === "renew") row.renewOrders += 1;
      else row.upgradeOrders += 1;
      if (o.providerCost !== null) {
        row.providerCostRub += o.providerCost;
        row.providerCostOrders += 1;
      }
    }
    for (const u of users) {
      const at = u.createdAt.getTime();
      if (at >= start && at < end) row.newUsers += 1;
    }
    for (const c of compensations) {
      const at = c.createdAt.getTime();
      if (at >= start && at < end) row.goodwillDays += c.days;
    }
    for (const [, cursorOps] of refs) {
      let cursor: number | null = null;
      for (const op of cursorOps.sort((a, b) => a.paidAt - b.paidAt)) {
        cursor = Math.max(cursor ?? op.paidAt, op.paidAt) + op.days * 86_400_000;
      }
      // Active at end-of-day iff the term covers the day's close instant.
      if (cursorOps[0]!.paidAt <= end && end < (cursor as number)) row.activeKeys += 1;
    }
    rows.push(row);
    if (day === toDay) break;
  }
  return rows;
}

/** daily_metrics rows → the manual row's shape (computed_at excluded). */
async function loadRows() {
  return prisma.dailyMetric.findMany({
    where: { day: { in: DAY_KEYS } },
    orderBy: { day: "asc" },
  });
}

function valuesOf(rows: Awaited<ReturnType<typeof loadRows>>): Record<string, unknown>[] {
  return rows.map((r) => {
    const { computedAt: _computedAt, ...rest } = r;
    return { ...rest, day: r.day.toISOString().slice(0, 10) };
  });
}

beforeAll(async () => {
  await cleanup();
  const user = await prisma.user.create({
    data: { telegramId: OWNER, createdAt: new Date("2026-04-11T09:00:00.000Z") },
    select: { id: true },
  });
  userId = user.id;

  // Ledger history BEFORE the default range — the full-history load must
  // count bb0 active in-range while keeping its money on its own day.
  await makeOrder({
    provisionedKeyId: "bb0",
    days: 365,
    finalAmount: 3000,
    providerCost: 900,
    paidAt: new Date("2026-03-15T09:00:00.000Z"),
  });
  await makeOrder({
    provisionedKeyId: "bb1",
    finalAmount: 1000,
    providerCost: 400,
    paidAt: new Date("2026-04-10T09:00:00.000Z"),
  });
  await makeOrder({
    kind: "renew",
    keyId: "bb1",
    finalAmount: 800,
    balanceUsed: 800, // covered by wallet — cash leg 0
    providerCost: null,
    paidAt: new Date("2026-04-11T12:00:00.000Z"),
  });
  await makeOrder({
    kind: "upgrade",
    keyId: "bb1",
    days: null,
    finalAmount: 500,
    balanceUsed: 100, // cash leg 400
    providerCost: 150,
    paidAt: new Date("2026-04-11T14:00:00.000Z"),
  });
  await makeOrder({
    provisionedKeyId: "bb2",
    days: 90,
    finalAmount: 2000,
    balanceUsed: 500, // cash leg 1500
    providerCost: null,
    paidAt: new Date("2026-04-12T09:00:00.000Z"),
  });

  const ticket = await prisma.ticket.create({
    data: { subject: "backfill fixture", userId },
    select: { id: true },
  });
  await prisma.ticketCompensation.create({
    data: {
      ticketId: ticket.id,
      adminTelegramId: OWNER,
      days: 3,
      reason: "goodwill",
      requestId: "req-backfill-fixture-1",
      messageId: "msg-backfill-fixture-1",
      createdAt: new Date("2026-04-11T10:00:00.000Z"),
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

describe("analytics/backfill — full-range engine run (D-14)", () => {
  it("equals an independent manual recomputation of the same DB state", async () => {
    vi.spyOn(artemida, "getBalance").mockResolvedValue(wallet(555));

    const result = await rollupDays(FROM_DAY, "2026-04-12", "backfill");
    expect(result).toEqual({ days: 3, upserted: 3, balance: "ok" });

    const rows = await loadRows();
    const manual = await manualRecompute(FROM_DAY, "2026-04-12");
    expect(valuesOf(rows)).toEqual(manual);

    // Spot checks against the fixture itself — equality between two code
    // paths alone could hide a shared systematic bug.
    const byDay = new Map(valuesOf(rows).map((r) => [r.day as string, r]));
    const d2 = byDay.get("2026-04-11")!;
    expect(d2.paidOrders).toBe(2); // renew + upgrade
    expect(d2.paidCashRub).toBe(400); // upgrade 500−100; renew is fully covered
    expect(d2.renewOrders).toBe(1);
    expect(d2.upgradeOrders).toBe(1);
    expect(d2.providerCostRub).toBe(150); // renew's NULL cost is the honest gap
    expect(d2.providerCostOrders).toBe(1);
    expect(d2.activeKeys).toBe(2); // pre-window bb0 + in-range bb1
    expect(d2.newUsers).toBe(1); // the OWNER account created on D2
    expect(d2.goodwillDays).toBe(3);
    const d1 = byDay.get("2026-04-10")!;
    expect(d1.paidCashRub).toBe(1000);
    expect(d1.activeKeys).toBe(2);
    const d3 = byDay.get("2026-04-12")!;
    expect(d3.paidCashRub).toBe(1500); // 2000 − 500
    expect(d3.providerCostOrders).toBe(0); // NULL is the D-08 coverage signal
    expect(d3.activeKeys).toBe(3); // bb0 + bb1 + bb2 active from its paidAt

    // The script's source tag reaches the snapshot ("backfill", not "cron").
    const snapshot = await prisma.artemidaBalanceSnapshot.findUnique({
      where: { day: mskDateKey(YESTERDAY_LABEL) },
    });
    expect(snapshot?.balanceRub).toBe(555);
    expect(snapshot?.source).toBe("backfill");
  });

  it("re-running the full range is a value no-op and never overwrites a captured balance", async () => {
    // A reading captured long before the run must survive both runs.
    await prisma.artemidaBalanceSnapshot.create({
      data: {
        day: mskDateKey(YESTERDAY_LABEL),
        balanceRub: 42,
        capturedAt: new Date("2020-01-01T00:00:00.000Z"),
      },
    });
    vi.spyOn(artemida, "getBalance").mockResolvedValue(wallet(556)); // a NEW reading

    const first = await rollupDays(FROM_DAY, "2026-04-12", "backfill");
    expect(first).toEqual({ days: 3, upserted: 3, balance: "ok" });
    const before = valuesOf(await loadRows());

    const second = await rollupDays(FROM_DAY, "2026-04-12", "backfill");
    expect(second).toEqual({ days: 3, upserted: 3, balance: "ok" });
    expect(valuesOf(await loadRows())).toEqual(before); // identical — absolute upsert, never summed

    // DO NOTHING: yesterday's earlier reading (42) wins over the re-run's 556.
    const snapshot = await prisma.artemidaBalanceSnapshot.findUnique({
      where: { day: mskDateKey(YESTERDAY_LABEL) },
    });
    expect(snapshot?.balanceRub).toBe(42);
    expect(snapshot?.capturedAt).toEqual(new Date("2020-01-01T00:00:00.000Z"));
  });

  it("the script keeps the D-14 contract: relative imports, shared engine, verify-chain output", async () => {
    const src = await readFile(
      new URL("../../scripts/backfill-analytics.ts", import.meta.url),
      "utf8",
    );
    // tsx cannot resolve the @/ alias — relative imports only.
    expect(src).toContain('from "../lib/prisma"');
    expect(src).toContain('from "../lib/analytics/rollup"');
    expect(src).not.toMatch(/from "@\//);
    // One engine: the script may never re-implement the rollup.
    expect(src).toContain("rollupDays(");
    // The days=…/upserted=… verify chain the operator greps.
    expect(src).toContain("days=");
    expect(src).toContain("upserted=");
  });
});
