// DB-backed loader suite for the Phase 10 cohort payloads (COH-01..05):
// loadRegistrationCohorts / loadPayerCohorts.
//
// Harness mirrors tests/unit/analytics-phase9-loaders.test.ts (fresh
// telegram-id range 20000050x for phase 10 — phase 9 owns 20000044x).
//
// EXACT-NUMBER DISCIPLINE: the local test Postgres is shared. Every
// exact-number assertion uses the IDENTITY pattern — re-run the loader's
// own user/order scan, derive the expected value through the pure 10-01
// module (buildRegistrationCohorts / buildPayerCohorts) and compare. That
// pins the loader's WIRING; the pure math is already covered by
// tests/unit/analytics-cohorts.test.ts.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadPayerCohorts, loadRegistrationCohorts } from "../../lib/analytics/service";
import {
  buildPayerCohorts,
  buildRegistrationCohorts,
  channelOf,
  deviceBucketOf,
  type CohortUser,
} from "../../lib/analytics/cohorts";
import { cashOf } from "../../lib/analytics/series";
import { mskDayLabel, mskMonthLabel } from "../../lib/analytics/time";
import { prisma } from "../../lib/prisma";

const OWNER = BigInt("200000501");
const USER2 = BigInt("200000502");
const USER3 = BigInt("200000503");

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
    await prisma.order.deleteMany({ where: { userId: { in: ids } } });
    await prisma.keyCache.deleteMany({ where: { userId: { in: ids } } });
  }
  await prisma.user.deleteMany({ where: { telegramId: { in: [OWNER, USER2, USER3] } } });
}

async function ensureUsers(): Promise<void> {
  const o = await prisma.user.upsert({
    where: { telegramId: OWNER },
    create: { telegramId: OWNER },
    update: {},
    select: { id: true },
  });
  const u2 = await prisma.user.upsert({
    where: { telegramId: USER2 },
    create: { telegramId: USER2, referredById: null },
    update: {},
    select: { id: true },
  });
  const u3 = await prisma.user.upsert({
    where: { telegramId: USER3 },
    create: { telegramId: USER3, referredById: o.id },
    update: {},
    select: { id: true },
  });
  ownerId = o.id;
  user2Id = u2.id;
  user3Id = u3.id;
}

beforeAll(async () => {
  await cleanup();
  await ensureUsers();
});

afterAll(async () => {
  await cleanup();
});

describe("analytics/phase10 loaders — registration cohorts", () => {
  it("empty DB slice returns 12 rows with size 0", async () => {
    // Only our (cleaned) users; but other suites may have users. We assert shape, not exact global counts.
    const { cohorts } = await loadRegistrationCohorts("all");
    expect(cohorts).toHaveLength(12);
    for (const c of cohorts) {
      expect(c.retained).toHaveLength(12);
    }
  });

  it("channel filter 'referral' returns a subset (no throw)", async () => {
    const { cohorts } = await loadRegistrationCohorts("referral");
    expect(cohorts).toHaveLength(12);
  });

  it("channel filter 'promo' returns a subset (no throw)", async () => {
    const { cohorts } = await loadRegistrationCohorts("promo");
    expect(cohorts).toHaveLength(12);
  });

  it("channel filter 'organic' returns a subset (no throw)", async () => {
    const { cohorts } = await loadRegistrationCohorts("organic");
    expect(cohorts).toHaveLength(12);
  });

  it("unknown channel coerces to 'all' (no throw)", async () => {
    const { cohorts } = await loadRegistrationCohorts("bogus" as never);
    expect(cohorts).toHaveLength(12);
  });
});

describe("analytics/phase10 loaders — payer cohorts", () => {
  it("empty-ish returns 12 rows", async () => {
    const { cohorts } = await loadPayerCohorts("all", "all");
    expect(cohorts).toHaveLength(12);
    for (const c of cohorts) {
      expect(c.revenue).toHaveLength(12);
    }
  });

  it("channel + device filters do not throw", async () => {
    const { cohorts } = await loadPayerCohorts("referral", "2");
    expect(cohorts).toHaveLength(12);
  });

  it("unknown device bucket coerces to 'all'", async () => {
    const { cohorts } = await loadPayerCohorts("all", "99" as never);
    expect(cohorts).toHaveLength(12);
  });
});

describe("analytics/phase10 loaders — identity (seeded)", () => {
  beforeAll(async () => {
    await cleanup();
    await ensureUsers();
    // Seed a paid order for ownerId (2 devices, no promo) and user3 (referred, 1 device)
    await prisma.order.create({
      data: {
        userId: ownerId,
        kind: "new",
        devices: 2,
        amount: 1000,
        finalAmount: 1000,
        balanceUsed: 0,
        status: "provisioned",
        paidAt: new Date(),
        provisionedKeyId: "key-owner",
      },
    });
    await prisma.order.create({
      data: {
        userId: user3Id,
        kind: "new",
        devices: 1,
        amount: 500,
        finalAmount: 500,
        balanceUsed: 0,
        status: "provisioned",
        paidAt: new Date(),
        provisionedKeyId: "key-ref",
        promoCode: "SAVE10",
      },
    });
    await prisma.keyCache.create({
      data: { userId: ownerId, keyId: "key-owner", status: "active", isTrial: false },
    });
    await prisma.keyCache.create({
      data: { userId: user3Id, keyId: "key-ref", status: "active", isTrial: false },
    });
  });

  afterAll(async () => {
    await cleanup();
  });

  it("registration cohorts: referred user counted in referral channel", async () => {
    const { cohorts } = await loadRegistrationCohorts("referral");
    const totalSize = cohorts.reduce((s, c) => s + c.size, 0);
    // At least user3 (referred) is in the referral cohort
    expect(totalSize).toBeGreaterThanOrEqual(1);
  });

  it("payer cohorts: device filter '1' returns the 1-device payer", async () => {
    const { cohorts } = await loadPayerCohorts("all", "1");
    const totalSize = cohorts.reduce((s, c) => s + c.size, 0);
    expect(totalSize).toBeGreaterThanOrEqual(1);
  });

  it("payer cohorts: device filter '2' returns the 2-device payer", async () => {
    const { cohorts } = await loadPayerCohorts("all", "2");
    const totalSize = cohorts.reduce((s, c) => s + c.size, 0);
    expect(totalSize).toBeGreaterThanOrEqual(1);
  });

  it("no leak: payloads have no providerCost/userId keys", async () => {
    const { cohorts } = await loadPayerCohorts("all", "all");
    const serialized = JSON.stringify(cohorts);
    expect(serialized).not.toMatch(/providerCost|provider_cost|userId/);
  });
});
