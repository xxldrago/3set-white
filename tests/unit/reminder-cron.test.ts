// Expiry-reminder scan vectors (PAY-05 / D-60..D-63 / T-04-32):
// - `listExpiringKeys` selects keys expiring in `(now, now+3d]`, INCLUDING trial
//   keys (D-63), and excludes an already-expired key and a key >3 days out;
// - `enqueueReminderScan` is exactly-once per key per UTC day — a second
//   same-day scan is a DB no-op, the next day adds exactly one more row.
// Runs against the real local Postgres; no network is touched.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { REMIND_EXPIRY } from "../../lib/outbox";
import { prisma } from "../../lib/prisma";
import {
  enqueueReminderScan,
  listExpiringKeys,
  reminderDedupeKey,
} from "../../lib/reminders-service";

const DAY_MS = 86_400_000;
const ID_A = BigInt("200000810"); // has a stored chatId
const ID_B = BigInt("200000811"); // no chatId → telegramId fallback
const IDS = [ID_A, ID_B];
const KEY_PREFIX = "test-04-08-";

let userA: number;
let userB: number;

async function cleanup(): Promise<void> {
  const users = await prisma.user.findMany({
    where: { telegramId: { in: IDS } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  if (ids.length > 0) {
    await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
    await prisma.keyCache.deleteMany({ where: { userId: { in: ids } } });
  }
  await prisma.notification.deleteMany({
    where: { dedupeKey: { startsWith: `remind:${KEY_PREFIX}` } },
  });
  await prisma.user.deleteMany({ where: { telegramId: { in: IDS } } });
}

/** Seed one cached key for a user; returns its provider key id. */
async function seedKey(
  userId: number,
  suffix: string,
  expiresAt: Date,
  isTrial = false,
): Promise<string> {
  const keyId = `${KEY_PREFIX}${suffix}`;
  await prisma.keyCache.create({
    data: {
      userId,
      keyId,
      status: "active",
      isTrial,
      expiresAt,
      customerRef: String(userId),
    },
  });
  return keyId;
}

beforeAll(async () => {
  await cleanup();
  const a = await prisma.user.create({
    data: { telegramId: ID_A, chatId: ID_A },
    select: { id: true },
  });
  userA = a.id;
  const b = await prisma.user.create({
    data: { telegramId: ID_B },
    select: { id: true },
  });
  userB = b.id;
});

afterAll(async () => {
  await cleanup();
});

beforeEach(async () => {
  await prisma.notification.deleteMany({ where: { userId: { in: [userA, userB] } } });
  await prisma.keyCache.deleteMany({ where: { userId: { in: [userA, userB] } } });
});

describe("listExpiringKeys — window + trials (D-60/D-63)", () => {
  it("includes a trial and a non-trial key ≤3d, excludes expired and >3d", async () => {
    const now = new Date();
    const inWindowNonTrial = await seedKey(userA, "nontrial", new Date(now.getTime() + DAY_MS));
    const inWindowTrial = await seedKey(
      userB,
      "trial",
      new Date(now.getTime() + 2 * DAY_MS),
      true,
    );
    const expired = await seedKey(userA, "expired", new Date(now.getTime() - DAY_MS));
    const far = await seedKey(userB, "far", new Date(now.getTime() + 10 * DAY_MS));

    const keys = await listExpiringKeys(now);
    const ids = keys.map((k) => k.keyId);

    expect(ids).toContain(inWindowNonTrial);
    expect(ids).toContain(inWindowTrial);
    expect(ids).not.toContain(expired);
    expect(ids).not.toContain(far);

    const trial = keys.find((k) => k.keyId === inWindowTrial);
    expect(trial?.isTrial).toBe(true);
    expect(trial?.chatId).toBeNull();
    const nonTrial = keys.find((k) => k.keyId === inWindowNonTrial);
    expect(nonTrial?.isTrial).toBe(false);
    expect(nonTrial?.telegramId).toBe(ID_A);
    expect(nonTrial?.chatId).toBe(ID_A);
  });
});

describe("enqueueReminderScan — per-day exactly-once (D-61 / T-04-32)", () => {
  it("creates exactly one notification per key for two same-day scans", async () => {
    const now = new Date();
    const k1 = await seedKey(userA, "same-day", new Date(now.getTime() + DAY_MS));
    const k2 = await seedKey(userB, "same-day-trial", new Date(now.getTime() + DAY_MS), true);

    await enqueueReminderScan(now);
    await enqueueReminderScan(now);

    for (const keyId of [k1, k2]) {
      expect(
        await prisma.notification.count({
          where: { type: REMIND_EXPIRY, dedupeKey: reminderDedupeKey(keyId, now) },
        }),
      ).toBe(1);
    }
  });

  it("adds exactly one more notification on a different UTC day", async () => {
    const base = new Date("2026-06-01T00:00:00Z");
    const keyId = await seedKey(userA, "next-day", new Date(base.getTime() + 2 * DAY_MS));
    const day2 = new Date(base.getTime() + DAY_MS);

    await enqueueReminderScan(base);
    await enqueueReminderScan(base); // same-day no-op
    await enqueueReminderScan(day2);

    expect(
      await prisma.notification.count({
        where: { dedupeKey: { startsWith: `remind:${keyId}:` } },
      }),
    ).toBe(2);
  });

  it("does not enqueue for an expired or >3d key", async () => {
    const now = new Date();
    const expired = await seedKey(userA, "no-expired", new Date(now.getTime() - DAY_MS));
    const far = await seedKey(userB, "no-far", new Date(now.getTime() + 10 * DAY_MS));

    await enqueueReminderScan(now);

    for (const keyId of [expired, far]) {
      expect(
        await prisma.notification.count({ where: { dedupeKey: reminderDedupeKey(keyId, now) } }),
      ).toBe(0);
    }
  });
});
