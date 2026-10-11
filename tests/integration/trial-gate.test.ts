// Trial gating for paying customers: any non-trial key row closes the trial
// path (server gate, UI eligibility read) without burning the trialUsed flag.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ token: undefined as string | undefined }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      session.token === undefined ? undefined : { name, value: session.token },
  }),
}));

import { GET as trialEligibility } from "../../app/api/trial/route";
import { signSession } from "../../lib/auth";
import { artemida } from "../../lib/artemida";
import {
  hasPaidSubscriptionByUserId,
  startTrial,
  startTrialByUserId,
} from "../../lib/keys-service";
import { prisma } from "../../lib/prisma";

const TG = BigInt("200000431");
const SECRET =
  process.env["SESSION_SECRET"] ?? "unit-test-session-secret-at-least-32-characters";

async function cleanup(): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { telegramId: TG },
    select: { id: true },
  });
  if (user) await prisma.keyCache.deleteMany({ where: { userId: user.id } });
  await prisma.user.deleteMany({ where: { telegramId: TG } });
}

describe("trial closed for paying customers", () => {
  let userId = 0;
  beforeAll(async () => {
    await cleanup();
    const row = await prisma.user.create({
      data: { telegramId: TG, trialUsed: false },
      select: { id: true },
    });
    userId = row.id;
    session.token = await signSession(Number(TG), SECRET);
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await cleanup();
  });

  it("hasPaidSubscriptionByUserId is false with no paid keys", async () => {
    await expect(hasPaidSubscriptionByUserId(userId)).resolves.toBe(false);
  });

  it("startTrial refuses without burning the claim when a paid key exists", async () => {
    await prisma.keyCache.create({
      data: {
        userId,
        keyId: "key_paid_gate",
        status: "EXPIRED",
        isTrial: false,
        expiresAt: new Date(Date.now() - 86_400_000),
        customerRef: String(TG),
      },
    });
    await expect(hasPaidSubscriptionByUserId(userId)).resolves.toBe(true);
    const spy = vi.spyOn(artemida, "createTrial");
    await expect(startTrial(TG)).resolves.toMatchObject({ kind: "already_used" });
    await expect(startTrialByUserId(userId)).resolves.toMatchObject({ kind: "already_used" });
    // No provider call, no flag burned.
    expect(spy).not.toHaveBeenCalled();
    await expect(
      prisma.user.findUnique({ where: { id: userId }, select: { trialUsed: true } }),
    ).resolves.toMatchObject({ trialUsed: false });
    spy.mockRestore();
  });

  it("GET /api/trial reports ineligible with has_subscription", async () => {
    const res = await trialEligibility();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ eligible: false, reason: "has_subscription" });
  });

  it("GET /api/trial is 401 without a session", async () => {
    session.token = undefined;
    await expect(trialEligibility()).resolves.toMatchObject({ status: 401 });
  });
});
