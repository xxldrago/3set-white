// WR-06 regression (T-06-12-01/-03): linkAccounts re-asserts the merge
// invariants INSIDE its transaction and maps Prisma P2002/P2025/P2003 to
// typed outcomes, so a concurrent change can never attach a Telegram
// identity to a conflicting email account and can never escape as an
// uncaught 500.
//
// Real local Postgres (`setwhite` per phase conventions); throwaway telegram
// ids/emails/keys only; every row is removed in beforeAll/afterAll.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  AccountConflictError,
  AccountNotFoundError,
  linkAccounts,
} from "../../lib/accounts";
import { prisma } from "../../lib/prisma";

const RUN = Date.now().toString(36);

// 21000003x range: distinct from auth-flow (200000001) and email-auth-flow
// (210000011..014).
const TG_MERGE = 210000031;
const TG_CONFLICT = 210000032;
const TG_IDEMPOTENT = 210000033;
const TG_P2025 = 210000034;
const TG_P2002 = 210000035;
const TGS = [TG_MERGE, TG_CONFLICT, TG_IDEMPOTENT, TG_P2025, TG_P2002];

const EMAIL_SURVIVOR = `phase6-merge-survivor-${RUN}@example.test`;
const EMAIL_CONFLICT = `phase6-merge-conflict-${RUN}@example.test`;
const EMAIL_VICTIM = `phase6-merge-victim-${RUN}@example.test`;
const EMAIL_IDEMPOTENT = `phase6-merge-idem-${RUN}@example.test`;
const EMAIL_RACE_A = `phase6-merge-race-a-${RUN}@example.test`;
const EMAIL_RACE_B = `phase6-merge-race-b-${RUN}@example.test`;
const EMAILS = [
  EMAIL_SURVIVOR,
  EMAIL_CONFLICT,
  EMAIL_VICTIM,
  EMAIL_IDEMPOTENT,
  EMAIL_RACE_A,
  EMAIL_RACE_B,
];
const KEY_PREFIX = `k-merge-${RUN}`;

function fakeError(code: string): Error {
  return Object.assign(new Error(`synthetic ${code}`), { code });
}

async function cleanup(): Promise<void> {
  await prisma.keyCache.deleteMany({ where: { keyId: { startsWith: KEY_PREFIX } } });
  // Children cascade from the user rows; match by throwaway id or email.
  await prisma.user.deleteMany({
    where: {
      OR: [{ telegramId: { in: TGS.map((id) => BigInt(id)) } }, { email: { in: EMAILS } }],
    },
  });
}

describe("linkAccounts race-hardened merge (WR-06)", () => {
  beforeAll(cleanup);
  afterAll(async () => {
    vi.restoreAllMocks();
    await cleanup();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("merges a pure-TG loser into an email survivor (rows re-point, trialUsed OR, loser deleted)", async () => {
    const survivor = await prisma.user.create({
      data: { email: EMAIL_SURVIVOR, passwordHash: "argon2id-fixture" },
      select: { id: true },
    });
    const loser = await prisma.user.create({
      data: {
        telegramId: BigInt(TG_MERGE),
        chatId: BigInt(TG_MERGE),
        firstName: "Linkee",
        trialUsed: true,
        trialKeyId: "trial-key-merge",
      },
      select: { id: true },
    });
    await prisma.keyCache.create({
      data: { userId: loser.id, keyId: `${KEY_PREFIX}-1`, status: "active" },
    });
    await prisma.order.create({
      data: { userId: loser.id, kind: "new", devices: 1, amount: 100 },
    });
    await prisma.ticket.create({ data: { userId: loser.id, subject: "merge-fixture" } });

    await expect(
      linkAccounts({ userId: survivor.id, telegramId: TG_MERGE }),
    ).resolves.toEqual({ merged: true, userId: survivor.id });

    // Survivor holds the identity and inherits the trial state.
    await expect(prisma.user.findUnique({ where: { id: survivor.id } })).resolves.toMatchObject({
      telegramId: BigInt(TG_MERGE),
      trialUsed: true,
      trialKeyId: "trial-key-merge",
    });
    // Loser gone; every loser-scoped row now reads under the survivor.
    await expect(prisma.user.findUnique({ where: { id: loser.id } })).resolves.toBeNull();
    await expect(prisma.keyCache.count({ where: { userId: survivor.id } })).resolves.toBe(1);
    await expect(prisma.order.count({ where: { userId: survivor.id } })).resolves.toBe(1);
    await expect(prisma.ticket.count({ where: { userId: survivor.id } })).resolves.toBe(1);
    await expect(prisma.keyCache.count({ where: { userId: loser.id } })).resolves.toBe(0);
    await expect(prisma.order.count({ where: { userId: loser.id } })).resolves.toBe(0);
    await expect(prisma.ticket.count({ where: { userId: loser.id } })).resolves.toBe(0);
  });

  it("throws AccountConflictError and merges nothing when the identity is on an email account", async () => {
    const survivor = await prisma.user.create({
      data: { email: EMAIL_CONFLICT, passwordHash: "argon2id-fixture" },
      select: { id: true },
    });
    const victim = await prisma.user.create({
      data: {
        email: EMAIL_VICTIM,
        passwordHash: "argon2id-fixture",
        telegramId: BigInt(TG_CONFLICT),
      },
      select: { id: true },
    });

    await expect(
      linkAccounts({ userId: survivor.id, telegramId: TG_CONFLICT }),
    ).rejects.toBeInstanceOf(AccountConflictError);

    // Nothing merged: victim intact, survivor still telegram-less.
    await expect(prisma.user.findUnique({ where: { id: victim.id } })).resolves.toMatchObject({
      telegramId: BigInt(TG_CONFLICT),
      email: EMAIL_VICTIM,
    });
    await expect(
      prisma.user.findUnique({ where: { id: survivor.id }, select: { telegramId: true } }),
    ).resolves.toMatchObject({ telegramId: null });
  });

  it("is idempotent when the identity is already on the survivor (merged:false)", async () => {
    const survivor = await prisma.user.create({
      data: {
        email: EMAIL_IDEMPOTENT,
        passwordHash: "argon2id-fixture",
        telegramId: BigInt(TG_IDEMPOTENT),
      },
      select: { id: true },
    });

    await expect(
      linkAccounts({ userId: survivor.id, telegramId: TG_IDEMPOTENT }),
    ).resolves.toEqual({ merged: false, userId: survivor.id });

    await expect(
      prisma.user.findMany({ where: { telegramId: BigInt(TG_IDEMPOTENT) } }),
    ).resolves.toHaveLength(1);
  });

  it("maps a mid-transaction P2025 to AccountNotFoundError (not a raw throw)", async () => {
    const survivor = await prisma.user.create({
      data: { email: EMAIL_RACE_A, passwordHash: "argon2id-fixture" },
      select: { id: true },
    });
    await prisma.user.create({ data: { telegramId: BigInt(TG_P2025) } });

    const txSpy = vi.spyOn(prisma, "$transaction");
    txSpy.mockRejectedValueOnce(fakeError("P2025") as never);

    await expect(
      linkAccounts({ userId: survivor.id, telegramId: TG_P2025 }),
    ).rejects.toBeInstanceOf(AccountNotFoundError);
    expect(txSpy).toHaveBeenCalledTimes(1);
  });

  it("maps merge P2002/P2003 to AccountConflictError", async () => {
    const survivor = await prisma.user.create({
      data: { email: EMAIL_RACE_B, passwordHash: "argon2id-fixture" },
      select: { id: true },
    });
    await prisma.user.create({ data: { telegramId: BigInt(TG_P2002) } });

    const txSpy = vi.spyOn(prisma, "$transaction");
    txSpy.mockRejectedValueOnce(fakeError("P2002") as never);
    await expect(
      linkAccounts({ userId: survivor.id, telegramId: TG_P2002 }),
    ).rejects.toBeInstanceOf(AccountConflictError);

    txSpy.mockRejectedValueOnce(fakeError("P2003") as never);
    await expect(
      linkAccounts({ userId: survivor.id, telegramId: TG_P2002 }),
    ).rejects.toBeInstanceOf(AccountConflictError);
  });
});
