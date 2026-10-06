// TRIAL-01 atomic-claim vectors (D-22, T-02-09): two concurrent startTrial
// calls must yield exactly ONE winner and one `already_used`. Runs against the
// real local Postgres (auth-flow.test.ts integration style) with a spied
// `artemida.createTrial` so no network is ever hit.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { artemida, type NormalizedKey } from "../../lib/artemida";
import { startTrial } from "../../lib/keys-service";
import { prisma } from "../../lib/prisma";

const TELEGRAM_ID = BigInt("200000030");
const KEY_ID = "key_trial_claim_1";

function fakeKey(customerRef: string): NormalizedKey {
  return {
    id: KEY_ID,
    name: "Trial",
    status: "active",
    isTrial: true,
    expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    deviceLimit: 2,
    devices: 0,
    subscriptionUrl: "https://example.test/sub/trial",
    customerRef,
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

describe("trial claim — atomic once-per-account (D-22)", () => {
  beforeAll(async () => {
    await cleanup();
    await prisma.user.create({ data: { telegramId: TELEGRAM_ID, trialUsed: false } });
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await cleanup();
  });

  it("two concurrent startTrial calls yield exactly one created + one already_used", async () => {
    const createTrial = vi
      .spyOn(artemida, "createTrial")
      .mockResolvedValue(fakeKey(String(TELEGRAM_ID)));

    const results = await Promise.all([startTrial(TELEGRAM_ID), startTrial(TELEGRAM_ID)]);

    expect(results.filter((r) => r.kind === "created")).toHaveLength(1);
    expect(results.filter((r) => r.kind === "already_used")).toHaveLength(1);
    // The loser never reached ARTEMIDA — the DB claim short-circuited it.
    expect(createTrial).toHaveBeenCalledTimes(1);

    const row = await prisma.user.findUnique({ where: { telegramId: TELEGRAM_ID } });
    expect(row?.trialUsed).toBe(true);
    expect(row?.trialKeyId).toBe(KEY_ID);

    const cached = await prisma.keyCache.findMany({ where: { userId: row?.id } });
    expect(cached).toHaveLength(1);
    expect(cached[0]?.isTrial).toBe(true);
  });
});
