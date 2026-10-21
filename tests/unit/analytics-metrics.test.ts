// Unit vectors for lib/analytics/mrr.ts metrics helpers (ANL-03): the exact
// null contracts of computeArpu/computeArppu/computeCoverage (a zero
// denominator renders «—», never 0 ₽; known=0,total=0 and known=0,total>0 are
// DISTINCT states per UI-SPEC §5.3), the exact-rational / whole-ruble
// precision contract (the helper returns the exact value, the UI rounds with
// Math.round), and DB-backed denominators — prisma.user.count() plus
// COUNT(DISTINCT user_id) over a paid-order window (ARPPU counts DISTINCT
// payers, not orders). D-05: the User model has no blocked/disabled/deletedAt
// field — "без заблокированных" is a documented no-op, count() is the
// denominator.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  computeArppu,
  computeArpu,
  computeCoverage,
} from "../../lib/analytics/mrr";
import { prisma } from "../../lib/prisma";

const OWNER_TELEGRAM = BigInt("200000360");
const PAYER2_TELEGRAM = BigInt("200000361");
const FREE_TELEGRAM = BigInt("200000362");

const WINDOW_START = new Date("2026-06-01T00:00:00.000Z");
const PAID_STATUSES = ["paid", "provisioning", "provisioned"] as const;

describe("analytics/metrics — ARPU / ARPPU (ANL-03)", () => {
  it("0 denominators return null — never 0 (UI renders —, not «0 ₽»)", () => {
    expect(computeArpu(5000, 0)).toBeNull();
    expect(computeArppu(5000, 0)).toBeNull();
  });

  it("returns the exact rational; the UI rounds to whole rubles with Math.round", () => {
    // 5000 + 2500 over 7 users = 1071.428… — the helper does NOT pre-round
    expect(computeArpu(7500, 7)).toBe(7500 / 7);
    expect(computeArpu(7500, 7)).toBeCloseTo(1071.4285714285714, 10);
    expect(Math.round(computeArpu(7500, 7) as number)).toBe(1071); // the display contract
    expect(computeArppu(7500, 3)).toBe(2500);
    expect(computeArppu(3000, 4)).toBe(750);
  });
});

describe("analytics/metrics — cost coverage (UI-SPEC §5.3)", () => {
  it("knows 0-but-total > 0 is a DISTINCT state from total = 0", () => {
    // known = 0, total = 5 → ratio 0 (sub-line «0 из 5»), NOT null
    expect(computeCoverage(0, 5)).toBe(0);
    expect(computeCoverage(5, 5)).toBe(1);
    expect(computeCoverage(3, 4)).toBe(0.75);
    // total = 0 → null («за период не было оплаченных заказов»)
    expect(computeCoverage(0, 0)).toBeNull();
    expect(computeCoverage(2, 0)).toBeNull();
  });
});

describe("analytics/metrics — DB-backed denominators (real DB)", () => {
  let ownerUserId = 0;
  let payer2UserId = 0;
  let freeUserId = 0;

  async function cleanup(): Promise<void> {
    const users = await prisma.user.findMany({
      where: { telegramId: { in: [OWNER_TELEGRAM, PAYER2_TELEGRAM, FREE_TELEGRAM] } },
      select: { id: true },
    });
    if (users.length > 0) {
      await prisma.order.deleteMany({ where: { userId: { in: users.map((u) => u.id) } } });
    }
    await prisma.user.deleteMany({
      where: { telegramId: { in: [OWNER_TELEGRAM, PAYER2_TELEGRAM, FREE_TELEGRAM] } },
    });
  }

  beforeAll(async () => {
    await cleanup();
    const owner = await prisma.user.create({
      data: { telegramId: OWNER_TELEGRAM, createdAt: new Date("2026-06-05T09:00:00.000Z") },
      select: { id: true },
    });
    const payer2 = await prisma.user.create({
      data: { telegramId: PAYER2_TELEGRAM, createdAt: new Date("2026-06-12T09:00:00.000Z") },
      select: { id: true },
    });
    const free = await prisma.user.create({
      data: { telegramId: FREE_TELEGRAM, createdAt: new Date("2026-06-14T09:00:00.000Z") },
      select: { id: true },
    });
    ownerUserId = owner.id;
    payer2UserId = payer2.id;
    freeUserId = free.id;

    // owner pays twice in-window: cash 800 (1000 − 200) + 500
    await prisma.order.create({
      data: {
        userId: ownerUserId,
        kind: "new",
        days: 30,
        devices: 2,
        amount: 1000,
        currency: "RUB",
        status: "paid",
        paidAt: new Date("2026-06-10T09:00:00.000Z"),
        finalAmount: 1000,
        balanceUsed: 200,
      },
    });
    await prisma.order.create({
      data: {
        userId: ownerUserId,
        kind: "new",
        days: 30,
        devices: 2,
        amount: 500,
        currency: "RUB",
        status: "paid",
        paidAt: new Date("2026-06-20T09:00:00.000Z"),
        finalAmount: 500,
      },
    });
    // payer2 pays once in-window: cash 700 → 2 payers over 3 paid orders
    await prisma.order.create({
      data: {
        userId: payer2UserId,
        kind: "new",
        days: 30,
        devices: 2,
        amount: 700,
        currency: "RUB",
        status: "paid",
        paidAt: new Date("2026-06-15T05:00:00.000Z"),
        finalAmount: 700,
      },
    });
    // an owner order OUTSIDE the window (May) — excluded by paid_at >= start
    await prisma.order.create({
      data: {
        userId: ownerUserId,
        kind: "renew",
        days: 30,
        devices: 2,
        amount: 400,
        currency: "RUB",
        status: "paid",
        paidAt: new Date("2026-05-20T09:00:00.000Z"),
        finalAmount: 400,
      },
    });
    // a pending order without paidAt (free user never paid) — excluded by
    // status + window in every raw window query
    await prisma.order.create({
      data: {
        userId: freeUserId,
        kind: "new",
        days: 30,
        devices: 2,
        amount: 999,
        currency: "RUB",
        status: "pending",
        finalAmount: 999,
      },
    });
  });

  afterAll(async () => {
    await cleanup();
  });

  it("ARPU denominator = prisma.user.count(); ARPPU denominator = COUNT(DISTINCT user_id) over the paid window", async () => {
    const userCount = await prisma.user.count({
      where: { telegramId: { in: [OWNER_TELEGRAM, PAYER2_TELEGRAM, FREE_TELEGRAM] } },
    });
    expect(userCount).toBe(3); // all fixture users — D-05: no blocked/deleted filter exists

    const paidOrdersInWindow = await prisma.order.findMany({
      where: {
        userId: { in: [ownerUserId, payer2UserId, freeUserId] },
        status: { in: [...PAID_STATUSES] },
        paidAt: { gte: WINDOW_START },
      },
    });
    const windowCash = paidOrdersInWindow.reduce(
      (sum, o) => sum + Math.max(0, o.finalAmount - o.balanceUsed),
      0,
    );
    expect(windowCash).toBe(2000); // 800 + 500 + 700 — the May order stays out

    const orderCount = await prisma.order.count({
      where: {
        userId: { in: [ownerUserId, payer2UserId, freeUserId] },
        status: { in: [...PAID_STATUSES] },
        paidAt: { gte: WINDOW_START },
      },
    });
    expect(orderCount).toBe(3);

    const payerRows = await prisma.$queryRaw<{ payers: number }[]>`
      SELECT COUNT(DISTINCT user_id)::int AS payers
      FROM orders
      WHERE status IN ('paid', 'provisioning', 'provisioned')
        AND paid_at >= ${WINDOW_START}
        AND user_id IN (${ownerUserId}, ${payer2UserId}, ${freeUserId})
    `;
    expect(payerRows[0]?.payers).toBe(2);

    // the same window WITHOUT DISTINCT → 3: ARPPU counts payers, not orders
    const orderCountRaw = await prisma.$queryRaw<{ n: number }[]>`
      SELECT COUNT(*)::int AS n
      FROM orders
      WHERE status IN ('paid', 'provisioning', 'provisioned')
        AND paid_at >= ${WINDOW_START}
        AND user_id IN (${ownerUserId}, ${payer2UserId}, ${freeUserId})
    `;
    expect(orderCountRaw[0]?.n).toBe(3);
    expect(orderCountRaw[0]?.n).not.toBe(payerRows[0]?.payers);

    // the helpers consume the real denominators
    expect(computeArpu(windowCash, userCount)).toBe(2000 / 3);
    expect(computeArppu(windowCash, payerRows[0]!.payers)).toBe(1000);
  });
});
