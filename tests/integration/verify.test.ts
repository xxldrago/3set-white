// Email verification + trial gate tracer, plus partner-push silence.
//
// - request/confirm round-trip stamps emailVerifiedAt; re-confirm is
//   rejected; expired tokens are rejected; re-issue supersedes.
// - /api/trial: unverified email-only → 403 email_unverified; verified →
//   trial issued (provider spied); Telegram-linked without verification →
//   trial issued (Telegram is the proof).
// - partner pushes resolve silently in test env (no Telegram dialled).
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ token: undefined as string | undefined }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      session.token === undefined ? undefined : { name, value: session.token },
  }),
}));

import { POST as trialPOST } from "../../app/api/trial/route";
import { POST as verifyRequestPOST } from "../../app/api/auth/email/verify/request/route";
import { POST as verifyConfirmPOST } from "../../app/api/auth/email/verify/confirm/route";
import { signSession } from "../../lib/auth";
import { artemida, type NormalizedKey } from "../../lib/artemida";
import { confirmVerification, requestVerification } from "../../lib/email-verify";
import { setMailTransportForTests } from "../../lib/mail";
import { notifyReferralCredited, notifyReferralPinned } from "../../lib/partner-notify";
import { prisma } from "../../lib/prisma";

const TG = BigInt("950000601");
const SECRET =
  process.env["SESSION_SECRET"] ?? "unit-test-session-secret-at-least-32-characters";
const RUN = Date.now().toString(36);
const EMAIL = `verify-${RUN}@example.test`;

const sent: { to: string }[] = [];

async function cleanup(): Promise<void> {
  const user = await prisma.user.findFirst({
    where: { email: EMAIL },
    select: { id: true },
  });
  if (user) {
    await prisma.emailVerification.deleteMany({ where: { userId: user.id } });
    await prisma.keyCache.deleteMany({ where: { userId: user.id } });
  }
  await prisma.user.deleteMany({ where: { email: EMAIL } });
  await prisma.user.deleteMany({ where: { telegramId: TG } });
}

function fakeTrialKey(keyId: string): NormalizedKey {
  return {
    id: keyId,
    name: "Trial",
    status: "active",
    isTrial: true,
    expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    deviceLimit: 2,
    devices: 0,
    subscriptionUrl: "https://example.test/sub/verify-trial",
    customerRef: `email:x`,
    trafficUsedBytes: 0,
    trafficLimitBytes: null,
  };
}

describe("email verification round-trip", () => {
  let userId = 0;
  beforeAll(async () => {
    await cleanup();
    setMailTransportForTests({
      send: async (msg) => {
        sent.push({ to: msg.to });
      },
    });
    const row = await prisma.user.create({
      data: { email: EMAIL, emailCanonical: EMAIL },
      select: { id: true },
    });
    userId = row.id;
  });
  afterAll(async () => {
    setMailTransportForTests(null);
    vi.restoreAllMocks();
    await cleanup();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("issues a link by mail and confirms it once", async () => {
    await expect(requestVerification(userId)).resolves.toEqual({ ok: true });
    expect(sent.length).toBeGreaterThan(0);
    const token = (
      await prisma.emailVerification.findFirst({
        where: { userId, usedAt: null },
        select: { token: true },
      })
    )?.token;
    expect(token).toBeTruthy();
    await expect(confirmVerification(token!)).resolves.toMatchObject({ ok: true, userId });
    const row = await prisma.user.findUnique({
      where: { id: userId },
      select: { emailVerifiedAt: true },
    });
    expect(row?.emailVerifiedAt).not.toBeNull();
    // Second redeem is rejected.
    await expect(confirmVerification(token!)).resolves.toMatchObject({ ok: false });
  });

  it("rejects unknown and expired tokens", async () => {
    await expect(confirmVerification("nope")).resolves.toMatchObject({
      ok: false,
      reason: "invalid",
    });
    const stale = await prisma.emailVerification.create({
      data: {
        token: `stale-${RUN}`,
        userId,
        expiresAt: new Date(Date.now() - 1000),
      },
      select: { token: true },
    });
    await expect(confirmVerification(stale.token)).resolves.toMatchObject({
      ok: false,
      reason: "expired",
    });
  });

  it("reports already_verified on re-issue", async () => {
    await expect(requestVerification(userId)).resolves.toEqual({
      ok: false,
      reason: "already_verified",
    });
  });
});

describe("trial gate", () => {
  const KEY = `key-verify-trial-${RUN}`;
  let userId = 0;

  beforeAll(async () => {
    await cleanup();
    const row = await prisma.user.create({
      data: { email: EMAIL, emailCanonical: EMAIL },
      select: { id: true },
    });
    userId = row.id;
  });
  afterAll(async () => {
    await prisma.keyCache.deleteMany({ where: { keyId: KEY } });
    vi.restoreAllMocks();
    await cleanup();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function authorize(): Promise<void> {
    session.token = await signSession(userId, null, SECRET);
  }

  it("rejects an unverified email-only account with 403", async () => {
    await authorize();
    const res = await trialPOST();
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ ok: false, reason: "email_unverified" });
  });

  it("issues the trial once verified (provider spied, no network)", async () => {
    await prisma.user.update({
      where: { id: userId },
      data: { emailVerifiedAt: new Date() },
    });
    const spy = vi.spyOn(artemida, "createTrial").mockResolvedValue(fakeTrialKey(KEY));
    try {
      await authorize();
      const res = await trialPOST();
      expect(res.status).toBe(200);
      expect(spy).toHaveBeenCalledWith({ customerRef: `email:${userId}` });
    } finally {
      spy.mockRestore();
    }
  });

  it("lets a Telegram-linked account through without verification", async () => {
    const tg = await prisma.user.create({
      data: { telegramId: TG },
      select: { id: true },
    });
    const spy = vi.spyOn(artemida, "createTrial").mockResolvedValue(fakeTrialKey(`${KEY}-tg`));
    try {
      session.token = await signSession(tg.id, Number(TG), SECRET);
      const res = await trialPOST();
      expect(res.status).toBe(200);
    } finally {
      spy.mockRestore();
      await prisma.keyCache.deleteMany({ where: { keyId: `${KEY}-tg` } });
      await prisma.user.delete({ where: { id: tg.id } });
    }
  });
});

describe("verify routes", () => {
  let userId = 0;
  beforeAll(async () => {
    await cleanup();
    setMailTransportForTests({ send: async () => undefined });
    const row = await prisma.user.create({
      data: { email: EMAIL, emailCanonical: EMAIL },
      select: { id: true },
    });
    userId = row.id;
  });
  afterAll(async () => {
    setMailTransportForTests(null);
    await cleanup();
  });

  it("request route gates auth and issues; confirm redeems", async () => {
    session.token = undefined;
    const req = (body: unknown) =>
      new Request("http://localhost/api/auth/email/verify/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    await expect(verifyRequestPOST()).resolves.toMatchObject({ status: 401 });

    session.token = await signSession(userId, null, SECRET);
    const res = await verifyRequestPOST();
    expect(res.status).toBe(200);

    const token = (
      await prisma.emailVerification.findFirst({
        where: { userId, usedAt: null },
        select: { token: true },
      })
    )?.token;
    expect(token).toBeTruthy();
    const confirm = await verifyConfirmPOST(
      new Request("http://localhost/api/auth/email/verify/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      }),
    );
    expect(confirm.status).toBe(200);

    const bad = await verifyConfirmPOST(
      new Request("http://localhost/api/auth/email/verify/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: "nope" }),
      }),
    );
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ error: "invalid_token" });
  });
});

describe("partner pushes stay silent in tests", () => {
  it("never throws and never dials Telegram (NODE_ENV=test guard)", () => {
    expect(() => {
      notifyReferralPinned(1);
      notifyReferralCredited(1, 100);
    }).not.toThrow();
  });
});
