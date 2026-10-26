// DB-backed loader suite for the Phase 9 analytics payloads (ANL-08..11):
// loadFunnel / loadExpired (Task 1), loadErrorBreakdown / loadTimeToPay /
// loadTimeToProvision (Task 2).
//
// Harness mirrors tests/unit/analytics-phase8-loaders.test.ts (fresh OWNER
// telegram-id range 20000044x — phase 8 owns 20000034x — plus the same
// cleanup/ensureUsers/beforeEach wiring).
//
// EXACT-NUMBER DISCIPLINE: the local test Postgres is shared with every other
// DB-backed suite, and funnel/expired counts are GLOBAL. Every exact-number
// assertion therefore uses the IDENTITY pattern — re-run the loader's own
// where/select (FUNNEL_SELECT / the expired count query), derive the expected
// value through the pure 09-01 module (funnelOf / expiredCount / errorBreakdown
// / timingStats) and compare. That pins the loader's WIRING, which is what this
// suite owns; the pure math is already covered by tests/unit/analytics-funnel.test.ts.
// Where the fixture owns the whole window (verified at run time) the test also
// pins the hand-computed value, so a silent derivation drift still fails.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { loadExpired, loadFunnel } from "../../lib/analytics/service";
import {
  PAYMENT_WINDOW_MS,
  expiredCount,
  funnelOf,
  type FunnelRow,
} from "../../lib/analytics/funnel";
import { mskDayLabel, mskDayStartInstant } from "../../lib/analytics/time";
import { prisma } from "../../lib/prisma";

const OWNER = BigInt("200000442"); // plan 09-02 fixture range
const PAYER2 = BigInt("200000444");
const PAYER3 = BigInt("200000445");

/** The exact slice the Phase 9 loaders hand to lib/analytics/funnel.ts. */
const FUNNEL_SELECT = {
  id: true,
  status: true,
  createdAt: true,
  paidAt: true,
  provisionedKeyId: true,
  updatedAt: true,
  errorCode: true,
} as const;

let ownerId: number;
let payer2Id: number;
let payer3Id: number;

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

type OrderStatusName =
  | "pending"
  | "paid"
  | "provisioning"
  | "provisioned"
  | "failed"
  | "canceled"
  | "refunded";

interface OrderOverrides {
  status?: OrderStatusName;
  createdAt?: Date;
  paidAt?: Date | null;
  updatedAt?: Date;
  errorCode?: string | null;
  provisionedKeyId?: string | null;
}

/** Create one fixture order and return its id (loader rows key off it). */
async function makeOrder(userId: number, overrides: OrderOverrides = {}): Promise<string> {
  const created = await prisma.order.create({
    data: {
      userId,
      kind: "new",
      days: 30,
      devices: 2,
      amount: 1000,
      currency: "RUB",
      status: (overrides.status ?? "pending") as "pending",
      finalAmount: 1000,
      balanceUsed: 0,
      providerCost: null,
      keyId: null,
      provisionedKeyId: overrides.provisionedKeyId ?? null,
      paidAt: overrides.paidAt ?? null,
      errorCode: overrides.errorCode ?? null,
      ...(overrides.createdAt ? { createdAt: overrides.createdAt } : {}),
      ...(overrides.updatedAt ? { updatedAt: overrides.updatedAt } : {}),
    },
    select: { id: true },
  });
  // `updatedAt` is an @updatedAt column: the client may stamp it on create.
  // Re-persist the fixture value so the loader reads the intended instant.
  if (overrides.updatedAt) {
    await prisma.order.update({
      where: { id: created.id },
      data: { updatedAt: overrides.updatedAt },
    });
  }
  return created.id;
}

/** The loader's own window bound, re-derived in the test (identity contract). */
function windowStart(period: number): Date {
  return mskDayStartInstant(mskDayLabel(new Date(Date.now() - (period - 1) * 86_400_000)));
}

/** Re-run loadFunnelOrderRows' query — the identity scan. */
async function scanFunnelRows(period: 7 | 30 | 90): Promise<FunnelRow[]> {
  return prisma.order.findMany({
    where: { createdAt: { gte: windowStart(period) } },
    select: FUNNEL_SELECT,
    orderBy: { createdAt: "asc" },
  });
}

/** days ago at ~12:00 MSK (09:00Z) so the MSK day label is stable. */
function daysAgo(n: number): Date {
  const d = new Date(Date.now() - n * 86_400_000);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 9, 0, 0, 0));
}

function hoursAgo(n: number): Date {
  return new Date(Date.now() - n * 3_600_000);
}

/** True when the scanned window contains ONLY the given fixture ids. */
function windowIsExactly(rows: FunnelRow[], ids: string[]): boolean {
  if (rows.length !== ids.length) return false;
  const scanned = new Set(rows.map((r) => r.id));
  return ids.every((id) => scanned.has(id));
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

afterAll(async () => {
  await cleanup();
});

describe("analytics phase9 loaders — Task 1 (funnel / expired)", () => {
  it("Test 1: loadFunnel — 4 fixed steps + createdAt cohort window identity", async () => {
    const inWindow = [
      await makeOrder(ownerId, { status: "pending", createdAt: daysAgo(3) }),
      await makeOrder(ownerId, { status: "paid", createdAt: daysAgo(5), paidAt: daysAgo(5) }),
      await makeOrder(payer2Id, {
        status: "provisioned",
        createdAt: daysAgo(7),
        paidAt: daysAgo(7),
        provisionedKeyId: "p9-t1-prov",
        updatedAt: daysAgo(7),
      }),
      await makeOrder(payer3Id, {
        status: "failed",
        createdAt: daysAgo(9),
        paidAt: daysAgo(9),
        errorCode: "api_down",
        updatedAt: daysAgo(9),
      }),
    ];
    // Outside the 30-day MSK window → must not appear in any step's cohort.
    const outOfWindow = await makeOrder(ownerId, { status: "pending", createdAt: daysAgo(40) });

    const data = await loadFunnel(30);

    // Fixed order (ANL-08) — the tuple, never DB order.
    expect(data.steps.map((s) => s.step)).toEqual([
      "pending",
      "paid",
      "provisioning",
      "provisioned",
    ]);
    // Counts are JS numbers crossing the RSC boundary, never BigInt.
    for (const step of data.steps) {
      expect(typeof step.count).toBe("number");
      expect(Number.isInteger(step.count)).toBe(true);
    }
    expect(data.steps[0]!.count).toBeGreaterThanOrEqual(4);

    // Identity: the loader's own scan, derived through the 09-01 pure core.
    const rows = await scanFunnelRows(30);
    expect(data.steps).toEqual(funnelOf(rows));

    const scannedIds = new Set(rows.map((r) => r.id));
    for (const id of inWindow) expect(scannedIds.has(id)).toBe(true);
    // createdAt, not paidAt: the pending row has no paidAt and still counts.
    expect(scannedIds.has(outOfWindow)).toBe(false);

    // Reach-based, not status-based: the failed row (paid 9d ago) reached both
    // the paid and provisioning stages, so each of our 4 rows contributes.
    expect(data.steps.find((s) => s.step === "paid")!.count).toBeGreaterThanOrEqual(3);
    expect(data.steps.find((s) => s.step === "provisioning")!.count).toBeGreaterThanOrEqual(2);
    expect(data.steps.find((s) => s.step === "provisioned")!.count).toBeGreaterThanOrEqual(1);
  });

  it("Test 2: loadFunnel monotone non-increasing + exact-rational conversions", async () => {
    // 5 created / 4 paid / 3 provisioning / 2 provisioned — the failed row
    // physically entered provisioning (documented approximation (a)).
    const ids = [
      await makeOrder(ownerId, { status: "pending", createdAt: daysAgo(2) }),
      await makeOrder(ownerId, { status: "paid", createdAt: daysAgo(3), paidAt: daysAgo(3) }),
      await makeOrder(ownerId, {
        status: "provisioned",
        createdAt: daysAgo(4),
        paidAt: daysAgo(4),
        provisionedKeyId: "p9-t2-a",
        updatedAt: daysAgo(4),
      }),
      await makeOrder(payer2Id, {
        status: "provisioned",
        createdAt: daysAgo(5),
        paidAt: daysAgo(5),
        provisionedKeyId: "p9-t2-b",
        updatedAt: daysAgo(5),
      }),
      await makeOrder(payer3Id, {
        status: "failed",
        createdAt: daysAgo(6),
        paidAt: daysAgo(6),
        errorCode: "timeout",
        updatedAt: daysAgo(6),
      }),
    ];

    const data = await loadFunnel(30);
    const rows = await scanFunnelRows(30);

    // Monotone + exact rationals derived from the SAME scan.
    for (let i = 1; i < data.steps.length; i++) {
      expect(data.steps[i]!.count).toBeLessThanOrEqual(data.steps[i - 1]!.count);
      const prev = data.steps[i - 1]!.count;
      const expected = prev === 0 ? null : data.steps[i]!.count / prev;
      expect(data.steps[i]!.conversion).toBe(expected);
      expect(data.steps[i]!.dropOff).toBe(expected === null ? null : 1 - expected);
    }
    expect(data.steps).toEqual(funnelOf(rows));

    if (windowIsExactly(rows, ids)) {
      // Fixture owns the window → pin the hand-computed counts and rationals.
      expect(data.steps.map((s) => s.count)).toEqual([5, 4, 3, 2]);
      expect(data.steps[0]!.conversion).toBeNull();
      expect(data.steps[0]!.dropOff).toBeNull();
      expect(data.steps[1]!.conversion).toBe(4 / 5);
      expect(data.steps[2]!.conversion).toBe(3 / 4);
      expect(data.steps[3]!.conversion).toBe(2 / 3);
      expect(data.steps[1]!.dropOff).toBe(1 - 4 / 5);
    }

    // Second fixture: pending only → paid step is a REAL zero (0 / n), and the
    // provisioning step's null conversion follows from prev === 0.
    await prisma.order.deleteMany({ where: { userId: { in: [ownerId, payer2Id, payer3Id] } } });
    const pendingOnly = [await makeOrder(ownerId, { status: "pending", createdAt: daysAgo(1) })];
    const zeroRows = await scanFunnelRows(30);
    const zero = await loadFunnel(30);
    expect(zero.steps).toEqual(funnelOf(zeroRows));
    if (windowIsExactly(zeroRows, pendingOnly)) {
      expect(zero.steps[0]!.count).toBe(1);
      expect(zero.steps[1]!.count).toBe(0);
      expect(zero.steps[1]!.conversion).toBe(0); // real zero, not null
      expect(zero.steps[1]!.dropOff).toBe(1);
      expect(zero.steps[2]!.conversion).toBeNull(); // prev === 0 → unknown
      expect(zero.steps[2]!.dropOff).toBeNull();
      expect(zero.steps[3]!.conversion).toBeNull();
    }

    // Empty window → every conversion/dropOff is null (never a fabricated 0).
    await prisma.order.deleteMany({ where: { userId: { in: [ownerId, payer2Id, payer3Id] } } });
    const emptyRows = await scanFunnelRows(30);
    const empty = await loadFunnel(30);
    expect(empty.steps).toEqual(funnelOf(emptyRows));
    if (emptyRows.length === 0) {
      expect(empty.steps.map((s) => s.count)).toEqual([0, 0, 0, 0]);
      expect(empty.steps.every((s) => s.conversion === null && s.dropOff === null)).toBe(true);
    }
  });

  it("Test 3: loadExpired — point-in-time pending-by-age, no period (D-06)", async () => {
    const expiredWhere = () => ({
      status: "pending" as const,
      createdAt: { lt: new Date(Date.now() - PAYMENT_WINDOW_MS) },
    });

    const baseline = await prisma.order.count({ where: expiredWhere() });

    // 25h-old pending → counted.
    await makeOrder(ownerId, { status: "pending", createdAt: hoursAgo(25) });
    const withOld = await loadExpired();
    expect(withOld.count).toBe(baseline + 1);
    expect(withOld.count).toBe(await prisma.order.count({ where: expiredWhere() }));

    // 23h-old pending → inside the window, NOT expired.
    await makeOrder(ownerId, { status: "pending", createdAt: hoursAgo(23) });
    const withYoung = await loadExpired();
    expect(withYoung.count).toBe(baseline + 1);

    // Paid 25h ago → status filter keeps it out (age alone is not expired).
    await makeOrder(payer2Id, {
      status: "paid",
      createdAt: hoursAgo(25),
      paidAt: hoursAgo(25),
    });
    const withPaid = await loadExpired();
    expect(withPaid.count).toBe(baseline + 1);
    expect(withPaid.count).toBe(await prisma.order.count({ where: expiredWhere() }));

    // Cross-check against the pure 09-01 predicate over the same pending rows:
    // the loader's SQL is the same rule as expiredCount's strict `<`.
    const pendingRows = await prisma.order.findMany({
      where: { status: "pending" },
      select: FUNNEL_SELECT,
    });
    expect(withPaid.count).toBe(expiredCount(pendingRows, new Date()));
    expect(typeof withPaid.count).toBe("number");
  });

  it("Test 4: loadExpired windowHours mirrors PAYMENT_WINDOW_MS (D-01 single source)", async () => {
    const data = await loadExpired();
    expect(data.windowHours).toBe(24);
    expect(data.windowHours).toBe(PAYMENT_WINDOW_MS / 3_600_000);
    // Payload shape: exactly the two copy fields.
    expect(Object.keys(data).sort()).toEqual(["count", "windowHours"]);
  });
});
