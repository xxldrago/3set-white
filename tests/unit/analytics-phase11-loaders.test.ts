// DB-backed loader suite for Phase 11 RFM (SEG-01..05).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/prisma";
import { recomputeAllRfm, loadSegments, loadThresholds, saveThresholds, loadRfmForUser } from "../../lib/analytics/rfm-service";
import { buildSnapshots, DEFAULT_THRESHOLDS } from "../../lib/analytics/rfm";
import { cashOf } from "../../lib/analytics/series";
import type { PaidOrderRow } from "../../lib/analytics/series";

const OWNER = BigInt("200000601");
const USER2 = BigInt("200000602");
const USER3 = BigInt("200000603");

let ownerId: number;
let user2Id: number;
let user3Id: number;

async function cleanup(): Promise<void> {
  const users = await prisma.user.findMany({
    where: { telegramId: { in: [OWNER, USER2, USER3] } },
    select: { id: true },
  });
  if (users.length > 0) {
    const ids = users.map((u) => u.id);
    await prisma.userRfm.deleteMany({ where: { userId: { in: ids } } });
    await prisma.order.deleteMany({ where: { userId: { in: ids } } });
    await prisma.keyCache.deleteMany({ where: { userId: { in: ids } } });
  }
  await prisma.user.deleteMany({ where: { telegramId: { in: [OWNER, USER2, USER3] } } });
  // clean thresholds
  await prisma.setting.deleteMany({ where: { key: { startsWith: "rfm.threshold." } } });
}

async function ensureUsers(): Promise<void> {
  const o = await prisma.user.upsert({
    where: { telegramId: OWNER },
    create: { telegramId: OWNER, chatId: BigInt(111) },
    update: { chatId: BigInt(111) },
    select: { id: true },
  });
  const u2 = await prisma.user.upsert({
    where: { telegramId: USER2 },
    create: { telegramId: USER2 },
    update: {},
    select: { id: true },
  });
  const u3 = await prisma.user.upsert({
    where: { telegramId: USER3 },
    create: { telegramId: USER3, trialUsed: true },
    update: { trialUsed: true },
    select: { id: true },
  });
  ownerId = o.id;
  user2Id = u2.id;
  user3Id = u3.id;
}

beforeAll(async () => {
  await cleanup();
  await ensureUsers();
  // seed paid order for ownerId
  await prisma.order.create({
    data: {
      userId: ownerId,
      kind: "new",
      days: 30,
      devices: 2,
      status: "paid",
      finalAmount: 1000,
      balanceUsed: 200,
      amount: 1200,
      paidAt: new Date(),
    },
  });
  // non-trial key for ownerId (coverage active)
  await prisma.keyCache.create({
    data: {
      userId: ownerId,
      keyId: "k1",
      status: "active",
      isTrial: false,
      expiresAt: new Date(Date.now() + 10 * 86400000),
    },
  });
});

afterAll(async () => {
  await cleanup();
});

describe("analytics/phase11 loaders — recomputeAllRfm", () => {
  it("recomputes and upserts N users", async () => {
    const result = await recomputeAllRfm();
    expect(result.users).toBe(3);
    expect(result.upserted).toBe(3);
    const rows = await prisma.userRfm.findMany({ where: { userId: { in: [ownerId, user2Id, user3Id] } } });
    expect(rows).toHaveLength(3);
  });

  it("trial-only user has monetary null", async () => {
    const row = await prisma.userRfm.findUnique({ where: { userId: user3Id } });
    expect(row?.monetary).toBeNull();
    expect(row?.segment).toBe("trial-only");
  });

  it("payer user has monetary = cash sum", async () => {
    const row = await prisma.userRfm.findUnique({ where: { userId: ownerId } });
    expect(row?.monetary).toBe(800); // 1000-200
  });
});

describe("analytics/phase11 loaders — loadSegments", () => {
  it("returns 7 slugs in D-06 order with sizes summing to total", async () => {
    const data = await loadSegments();
    expect(data.segments).toHaveLength(7);
    expect(data.segments.map((s) => s.segment)).toEqual([
      "trial-only", "new payer", "VIP", "active", "at-risk", "churned", "sleeping",
    ]);
    const total = data.segments.reduce((s, x) => s + x.size, 0);
    expect(total).toBe(data.total);
    expect(data.total).toBe(3);
  });

  it("chatCount reflects chatId != null", async () => {
    const data = await loadSegments();
    const seg = data.segments.find((s) => s.segment === "new payer");
    // ownerId is a new payer (first paid today) with chatId → chatCount >=1
    expect(seg?.chatCount).toBeGreaterThanOrEqual(1);
  });
});

describe("analytics/phase11 loaders — thresholds", () => {
  it("loadThresholds returns defaults when no rows", async () => {
    const t = await loadThresholds();
    expect(t).toEqual(DEFAULT_THRESHOLDS);
  });

  it("saveThresholds upserts + triggers recompute, returns shape", async () => {
    const next = { newPayerDays: 7, activeDays: 14, atRiskDays: 30, churnedDays: 45, vipPercent: 10 };
    const result = await saveThresholds(next);
    expect(result.thresholds).toEqual(next);
    expect(result.recompute.users).toBe(3);
    expect(result.recompute.upserted).toBe(3);
    expect(result.recompute.computedAt).toBeInstanceOf(Date);
    const rows = await prisma.setting.findMany({ where: { key: { startsWith: "rfm.threshold." } } });
    expect(rows).toHaveLength(5);
  });

  it("loadThresholds reads saved values", async () => {
    const t = await loadThresholds();
    expect(t.newPayerDays).toBe(7);
  });
});

describe("analytics/phase11 loaders — loadRfmForUser", () => {
  it("returns snapshot for seeded user", async () => {
    const snap = await loadRfmForUser(ownerId);
    expect(snap).not.toBeNull();
    expect(snap?.userId).toBe(ownerId);
    expect(snap?.monetary).toBe(800);
  });

  it("returns null for unknown user", async () => {
    const snap = await loadRfmForUser(999999999);
    expect(snap).toBeNull();
  });
});
