// TRIAL-01 rollback vectors (D-23, T-02-10 / Pitfall 5): a failed provider
// call releases the claim so the user can retry; a recorded success is never
// reopened. Real local Postgres + spied `artemida.createTrial` (no network).
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ArtemidaError, artemida, type NormalizedKey } from "../../lib/artemida";
import { releaseTrialOnFailure, startTrial } from "../../lib/keys-service";
import { prisma } from "../../lib/prisma";

const TELEGRAM_ID = BigInt("200000031");
const KEY_ID = "key_trial_rollback_1";

function fakeKey(): NormalizedKey {
  return {
    id: KEY_ID,
    name: "Trial",
    status: "active",
    isTrial: true,
    expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    deviceLimit: 2,
    devices: 0,
    subscriptionUrl: "https://example.test/sub/rollback",
    customerRef: String(TELEGRAM_ID),
    trafficUsedBytes: 0,
    trafficLimitBytes: null,
  };
}

async function cleanup(): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { telegramId: TELEGRAM_ID },
    select: { id: true },
  });
  if (user) await prisma.keyCache.deleteMany({ where: { userId: user.id } });
  await prisma.user.deleteMany({ where: { telegramId: TELEGRAM_ID } });
}

/** Reset the identity to an unused-trial state and clear its cached keys. */
async function resetClaim(): Promise<void> {
  const user = await prisma.user.upsert({
    where: { telegramId: TELEGRAM_ID },
    update: { trialUsed: false, trialKeyId: null },
    create: { telegramId: TELEGRAM_ID, trialUsed: false },
    select: { id: true },
  });
  await prisma.keyCache.deleteMany({ where: { userId: user.id } });
}

describe("trial rollback — failure retryable, success terminal (D-23)", () => {
  beforeAll(cleanup);
  afterAll(async () => {
    vi.restoreAllMocks();
    await cleanup();
  });
  beforeEach(resetClaim);
  afterEach(() => vi.restoreAllMocks());

  it("releases the claim when artemida.createTrial fails", async () => {
    vi.spyOn(artemida, "createTrial").mockRejectedValue(new ArtemidaError("bad_gateway", 502));

    await expect(startTrial(TELEGRAM_ID)).rejects.toMatchObject({ code: "bad_gateway" });

    const row = await prisma.user.findUnique({ where: { telegramId: TELEGRAM_ID } });
    expect(row?.trialUsed).toBe(false); // retryable
    expect(row?.trialKeyId).toBeNull();
  });

  it("lets a retry after failure succeed exactly once", async () => {
    const createTrial = vi
      .spyOn(artemida, "createTrial")
      .mockRejectedValueOnce(new ArtemidaError("unavailable", 503))
      .mockResolvedValueOnce(fakeKey());

    await expect(startTrial(TELEGRAM_ID)).rejects.toBeInstanceOf(ArtemidaError);
    await expect(startTrial(TELEGRAM_ID)).resolves.toMatchObject({ kind: "created" });

    const row = await prisma.user.findUnique({ where: { telegramId: TELEGRAM_ID } });
    expect(row?.trialUsed).toBe(true);
    expect(row?.trialKeyId).toBe(KEY_ID);
    expect(createTrial).toHaveBeenCalledTimes(2);
  });

  it("never reopens a recorded success (guarded rollback)", async () => {
    await prisma.user.update({
      where: { telegramId: TELEGRAM_ID },
      data: { trialUsed: true, trialKeyId: "key_done" },
    });

    await releaseTrialOnFailure(TELEGRAM_ID);

    const row = await prisma.user.findUnique({ where: { telegramId: TELEGRAM_ID } });
    expect(row?.trialUsed).toBe(true);
    expect(row?.trialKeyId).toBe("key_done");
  });

  it("treats a provider conflict as terminal (non-retryable)", async () => {
    vi.spyOn(artemida, "createTrial").mockRejectedValue(new ArtemidaError("conflict", 409));

    await expect(startTrial(TELEGRAM_ID)).resolves.toMatchObject({ kind: "already_used" });

    const row = await prisma.user.findUnique({ where: { telegramId: TELEGRAM_ID } });
    expect(row?.trialUsed).toBe(true); // kept set — the provider already denied it
  });
});
