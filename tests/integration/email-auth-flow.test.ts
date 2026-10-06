// Phase 6 email-auth tracer (AUTH-01/AUTH-02, D-79..D-86): register →
// login → session cookie end-to-end, duplicate → 409, wrong-password vs
// unknown-email → byte-identical 401, rate-limit → 429 + retryAfterSec,
// trial-by-userId atomic claim, logout clears the cookie.
//
// DB `setwhite` per phase conventions; throwaway emails/passwords only.
// Rows + attempt counters created here are cleaned up in afterAll.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createHash, createHmac } from "node:crypto";
import { POST as registerPOST } from "../../app/api/auth/email/register/route";
import { POST as loginPOST } from "../../app/api/auth/email/login/route";
import { POST as logoutPOST } from "../../app/api/auth/email/logout/route";
import { POST as linkPOST } from "../../app/api/auth/email/link/route";
import { POST as unlinkPOST } from "../../app/api/auth/email/unlink/route";
import { POST as changePOST } from "../../app/api/auth/email/password/change/route";
import { POST as trialPOST } from "../../app/api/trial/route";
import { SESSION_COOKIE, signSession, verifySession } from "../../lib/auth";
import { artemida, type NormalizedKey } from "../../lib/artemida";
import { claimTrialByUserId, listKeysByUserId } from "../../lib/keys-service";
import { prisma } from "../../lib/prisma";

// Session-gated routes (link/unlink/change) read next/headers cookies() —
// mock it so a signed session can be presented without a Next runtime
// (tickets-route.test.ts pattern). Register/login/logout never touch it.
const session = vi.hoisted(() => ({ token: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      session.token === undefined ? undefined : { name, value: session.token },
  }),
}));

const RUN = Date.now().toString(36);
const EMAIL = `phase6-tracer-${RUN}@example.test`;
const PASSWORD = "tracer-throwaway-123";
const RATELIMIT_EMAIL = `phase6-ratelimit-${RUN}@example.test`;

// WR-02/WR-04 (06-13): registration is throttled per trusted client IP. Every
// independent registration presents its OWN `x-real-ip` so this suite's many
// registrations never collapse into the shared `"direct"` bucket and trip the
// cap. The octet is run-unique so a crashed prior run's counters cannot lock
// this one, and `cleanup()` removes this run's `__register__:` counter rows.
const REGISTER_IP_RUN = (Date.now() % 200) + 1;
const REGISTER_IP_PREFIX = `__register__:198.51.${REGISTER_IP_RUN}.`;
let registerIpCounter = 0;
function nextRegisterIp(): string {
  registerIpCounter += 1;
  return `198.51.${REGISTER_IP_RUN}.${registerIpCounter}`;
}

function postRegister(body: unknown): Promise<Response> {
  return registerPOST(
    new Request("http://localhost/api/auth/email/register", {
      method: "POST",
      headers: { "content-type": "application/json", "x-real-ip": nextRegisterIp() },
      body: JSON.stringify(body),
    }),
  );
}

function postLogin(body: unknown): Promise<Response> {
  return loginPOST(
    new Request("http://localhost/api/auth/email/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

function sessionToken(res: Response): string {
  const setCookie = res.headers.get("set-cookie") ?? "";
  expect(setCookie).toContain(`${SESSION_COOKIE}=`);
  expect(setCookie).toContain("HttpOnly");
  return setCookie.split(";")[0]?.split("=")[1] ?? "";
}

async function cleanup() {
  const emails = [EMAIL, RATELIMIT_EMAIL, `ghost-${RUN}@example.test`, `x-${RUN}@example.test`];
  await prisma.loginAttempt.deleteMany({ where: { email: { in: emails } } });
  await prisma.loginAttempt.deleteMany({
    where: { email: { startsWith: REGISTER_IP_PREFIX } },
  });
  await prisma.user.deleteMany({ where: { email: { in: emails } } });
}

describe("email auth flow (register → login → cookie)", () => {
  beforeAll(cleanup);
  afterAll(cleanup);

  it("register creates the user and mints a uid-subject session", async () => {
    const res = await postRegister({ email: EMAIL, password: PASSWORD });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    const token = sessionToken(res);
    const secret = process.env["SESSION_SECRET"];
    if (!secret) throw new Error("SESSION_SECRET must be set (dummy throwaway OK)");

    const row = await prisma.user.findUnique({ where: { email: EMAIL } });
    expect(row).not.toBeNull();
    // Hash stored, plaintext nowhere.
    expect(row?.passwordHash).toMatch(/^\$argon2id\$/);
    expect(row?.passwordHash).not.toContain(PASSWORD);
    expect(row?.telegramId).toBeNull();

    await expect(verifySession(token, secret)).resolves.toEqual({
      userId: row?.id,
      telegramId: null,
    });
  });

  it("login with the same credentials returns 200 plus cookie", async () => {
    const res = await postLogin({ email: EMAIL, password: PASSWORD });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    sessionToken(res);
  });

  it("duplicate register returns 409", async () => {
    const res = await postRegister({ email: EMAIL, password: PASSWORD });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "email_taken" });
  });

  it("wrong password and unknown email return byte-identical 401", async () => {
    const wrongPass = await postLogin({ email: EMAIL, password: "wrong-throwaway-999" });
    const unknown = await postLogin({
      email: `ghost-${RUN}@example.test`,
      password: "wrong-throwaway-999",
    });
    expect(wrongPass.status).toBe(401);
    expect(unknown.status).toBe(401);
    const a = await wrongPass.json();
    const b = await unknown.json();
    expect(a).toEqual(b);
    expect(a).toEqual({ error: "invalid_credentials" });
  });

  it("empty fields return 400 (assumption, specless probe)", async () => {
    const emptyEmail = await postLogin({ email: "", password: PASSWORD });
    expect(emptyEmail.status).toBe(400);
    const shortPass = await postRegister({ email: `x-${RUN}@example.test`, password: "short" });
    expect(shortPass.status).toBe(400);
  });

  it("trial claim by userId is atomic: first wins, second loses", async () => {
    const row = await prisma.user.findUnique({
      where: { email: EMAIL },
      select: { id: true },
    });
    expect(row).not.toBeNull();
    if (!row) throw new Error("register must have created the row");
    await expect(claimTrialByUserId(row.id)).resolves.toBe(true);
    await expect(claimTrialByUserId(row.id)).resolves.toBe(false);
  });

  it("repeated failures lock the account: 429 with server retryAfterSec", async () => {
    // Fresh email so the counter starts at zero for this vector.
    const seed = await postRegister({ email: RATELIMIT_EMAIL, password: PASSWORD });
    expect(seed.status).toBe(200);
    let lastStatus = 0;
    let lockBody: unknown = null;
    for (let i = 0; i < 8; i++) {
      const res = await postLogin({ email: RATELIMIT_EMAIL, password: "wrong-throwaway-999" });
      lastStatus = res.status;
      if (res.status === 429) {
        lockBody = await res.json();
        break;
      }
      expect(res.status).toBe(401);
    }
    expect(lastStatus).toBe(429);
    expect(lockBody).toEqual({
      error: "rate_limited",
      retryAfterSec: expect.any(Number),
    });
  });

  it("logout clears the session cookie", async () => {
    const res = await logoutPOST();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${SESSION_COOKIE}=`);
    expect(setCookie).toContain("Max-Age=0");
  });
});

function signWidget(fields: Record<string, string | number>, token: string): string {
  const dataCheckString = Object.keys(fields)
    .sort()
    .map((k) => `${k}=${fields[k]}`)
    .join("\n");
  const secret = createHash("sha256").update(token).digest();
  return createHmac("sha256", secret).update(dataCheckString).digest("hex");
}

// 2100000xx range: no other suite uses it (auth-flow 200000001,
// tickets-route 200000090-94).
const TG_LINK = 210000011;

function widgetPayload(telegramId: number, extra?: Record<string, string | number>) {
  const token = process.env["BOT_TOKEN"];
  if (!token) throw new Error("BOT_TOKEN must be set (dummy throwaway OK)");
  const fields = {
    id: telegramId,
    first_name: "Linkee",
    auth_date: Math.floor(Date.now() / 1000),
    ...extra,
  };
  return { ...fields, hash: signWidget(fields, token) };
}

async function authorize(userId: number, telegramId: number | null): Promise<void> {
  const secret = process.env["SESSION_SECRET"];
  if (!secret) throw new Error("SESSION_SECRET must be set (dummy throwaway OK)");
  session.token = await signSession(userId, telegramId, secret);
}

function clearAuth(): void {
  session.token = undefined;
}

async function userIdFor(email: string): Promise<number> {
  const row = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!row) throw new Error(`expected user row for ${email}`);
  return row.id;
}

describe("account linking (D-81 merge + D-93 unlink)", () => {
  const RUN2 = `${RUN}-link`;
  const EMAIL_LINK = `phase6-link-${RUN2}@example.test`;
  const widgetHashes: string[] = [];

  beforeAll(async () => {
    await cleanup();
    await prisma.user.deleteMany({ where: { telegramId: BigInt(TG_LINK) } });
  });
  afterAll(async () => {
    clearAuth();
    await prisma.keyCache.deleteMany({ where: { keyId: { startsWith: `k-link-${RUN2}` } } });
    await prisma.user.deleteMany({ where: { telegramId: BigInt(TG_LINK) } });
    await prisma.user.deleteMany({ where: { email: EMAIL_LINK } });
    if (widgetHashes.length > 0) {
      await prisma.replayCache.deleteMany({ where: { hash: { in: widgetHashes } } });
    }
  });

  it("link merges the TG account: one row, rows re-pointed, trialUsed OR", async () => {
    const seed = await postRegister({ email: EMAIL_LINK, password: PASSWORD });
    expect(seed.status).toBe(200);
    const survivorId = await userIdFor(EMAIL_LINK);

    // Pure-TG loser: trial consumed, one key + order + ticket on it.
    const loser = await prisma.user.create({
      data: {
        telegramId: BigInt(TG_LINK),
        chatId: BigInt(TG_LINK),
        firstName: "Linkee",
        trialUsed: true,
        trialKeyId: "trial-key-link",
      },
      select: { id: true },
    });
    await prisma.keyCache.create({
      data: { userId: loser.id, keyId: `k-link-${RUN2}-1`, status: "active" },
    });
    await prisma.order.create({
      data: { userId: loser.id, kind: "new", devices: 1, amount: 100 },
    });
    await prisma.ticket.create({
      data: { userId: loser.id, subject: "link-fixture" },
    });

    await authorize(survivorId, null);
    const payload = widgetPayload(TG_LINK);
    widgetHashes.push(payload.hash as string);
    const res = await linkPOST(
      new Request("http://localhost/api/auth/email/link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, merged: true });

    // Re-minted session carries the linked tid under the same uid.
    const secret = process.env["SESSION_SECRET"];
    if (!secret) throw new Error("SESSION_SECRET must be set (dummy throwaway OK)");
    const token = sessionToken(res);
    await expect(verifySession(token, secret)).resolves.toEqual({
      userId: survivorId,
      telegramId: TG_LINK,
    });

    // One row remains; loser gone; survivor holds the telegram identity.
    await expect(
      prisma.user.findUnique({ where: { telegramId: BigInt(TG_LINK) } }),
    ).resolves.toMatchObject({ id: survivorId, email: EMAIL_LINK });
    await expect(prisma.user.findUnique({ where: { id: loser.id } })).resolves.toBeNull();

    // trialUsed = OR(false, true); trialKeyId keeps first non-null.
    await expect(
      prisma.user.findUnique({ where: { id: survivorId } }),
    ).resolves.toMatchObject({ trialUsed: true, trialKeyId: "trial-key-link" });

    // Every loser row now reads under the survivor; zero orphans.
    await expect(
      prisma.keyCache.findMany({ where: { userId: survivorId } }),
    ).resolves.toHaveLength(1);
    await expect(
      prisma.order.findMany({ where: { userId: survivorId } }),
    ).resolves.toHaveLength(1);
    await expect(
      prisma.ticket.findMany({ where: { userId: survivorId } }),
    ).resolves.toHaveLength(1);
    await expect(
      prisma.keyCache.count({ where: { userId: loser.id } }),
    ).resolves.toBe(0);
    await expect(prisma.order.count({ where: { userId: loser.id } })).resolves.toBe(0);
    await expect(prisma.ticket.count({ where: { userId: loser.id } })).resolves.toBe(0);

    // Email login still works after the merge (passwordHash untouched).
    const login = await postLogin({ email: EMAIL_LINK, password: PASSWORD });
    expect(login.status).toBe(200);
  });

  it("unlink without the confirm flag never unlinks (400)", async () => {
    const survivorId = await userIdFor(EMAIL_LINK);
    await authorize(survivorId, TG_LINK);
    const res = await unlinkPOST(
      new Request("http://localhost/api/auth/email/unlink", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "confirmation_required",
      lastMethod: false,
    });
    // Row untouched.
    await expect(
      prisma.user.findUnique({ where: { id: survivorId }, select: { telegramId: true } }),
    ).resolves.toMatchObject({ telegramId: BigInt(TG_LINK) });
  });

  it("unlink with confirm clears telegramId and re-mints a tid-less session", async () => {
    const survivorId = await userIdFor(EMAIL_LINK);
    await authorize(survivorId, TG_LINK);
    const res = await unlinkPOST(
      new Request("http://localhost/api/auth/email/unlink", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, unlinked: true });

    await expect(
      prisma.user.findUnique({ where: { id: survivorId }, select: { telegramId: true } }),
    ).resolves.toMatchObject({ telegramId: null });

    const secret = process.env["SESSION_SECRET"];
    if (!secret) throw new Error("SESSION_SECRET must be set (dummy throwaway OK)");
    await expect(verifySession(sessionToken(res), secret)).resolves.toEqual({
      userId: survivorId,
      telegramId: null,
    });
  });
});

describe("account linking edges + change-password (AUTH-03/AUTH-05)", () => {
  const RUN3 = `${RUN}-edge`;
  const EMAIL_A = `phase6-edge-a-${RUN3}@example.test`;
  const EMAIL_B = `phase6-edge-b-${RUN3}@example.test`;
  const EMAIL_FARM_1 = `phase6-farm-1-${RUN3}@example.test`;
  const EMAIL_FARM_2 = `phase6-farm-2-${RUN3}@example.test`;
  const TG_REPEAT = 210000012;
  const TG_TAKEN = 210000013;
  const NEW_PASSWORD = "rotated-throwaway-456";
  const widgetHashes: string[] = [];

  function postLink(body: unknown): Promise<Response> {
    return linkPOST(
      new Request("http://localhost/api/auth/email/link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
  }

  function trackPayload(telegramId: number, tag: string) {
    // Vary a signed field per use: identical fields within one second would
    // reproduce the same hash and trip the replay guard instead of the edge.
    const payload = widgetPayload(telegramId, { first_name: tag });
    widgetHashes.push(payload.hash as string);
    return payload;
  }

  beforeAll(async () => {
    await cleanup();
  });
  afterAll(async () => {
    clearAuth();
    await prisma.user.deleteMany({ where: { telegramId: { in: [BigInt(TG_REPEAT), BigInt(TG_TAKEN)] } } });
    await prisma.user.deleteMany({
      where: { email: { in: [EMAIL_A, EMAIL_B, EMAIL_FARM_1, EMAIL_FARM_2] } },
    });
    if (widgetHashes.length > 0) {
      await prisma.replayCache.deleteMany({ where: { hash: { in: widgetHashes } } });
    }
  });

  it("repeat link of the same Telegram is idempotent 200 (assumption, specless probe)", async () => {
    expect(await postRegister({ email: EMAIL_A, password: PASSWORD })).toMatchObject({
      status: 200,
    });
    const survivorId = await userIdFor(EMAIL_A);
    await prisma.user.create({ data: { telegramId: BigInt(TG_REPEAT) } });

    await authorize(survivorId, null);
    const first = await postLink(trackPayload(TG_REPEAT, "first"));
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ ok: true, merged: true });

    const second = await postLink(trackPayload(TG_REPEAT, "second"));
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ ok: true, merged: false });

    await expect(
      prisma.user.findMany({ where: { telegramId: BigInt(TG_REPEAT) } }),
    ).resolves.toHaveLength(1);
  });

  it("link of a Telegram bound to another email account is 409 with no merge", async () => {
    expect(await postRegister({ email: EMAIL_B, password: PASSWORD })).toMatchObject({
      status: 200,
    });
    const attackerId = await userIdFor(EMAIL_B);
    // Victim: an already-linked account (email + password + telegram).
    const victim = await prisma.user.create({
      data: {
        email: `phase6-victim-${RUN3}@example.test`,
        passwordHash: "argon2id-fixture-hash",
        telegramId: BigInt(TG_TAKEN),
      },
      select: { id: true },
    });
    try {
      await authorize(attackerId, null);
      const res = await postLink(trackPayload(TG_TAKEN, "steal"));
      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({ error: "telegram_taken" });

      // Nothing merged: victim intact, attacker still telegram-less.
      await expect(
        prisma.user.findUnique({ where: { id: victim.id } }),
      ).resolves.toMatchObject({ telegramId: BigInt(TG_TAKEN) });
      await expect(
        prisma.user.findUnique({ where: { id: attackerId }, select: { telegramId: true } }),
      ).resolves.toMatchObject({ telegramId: null });
    } finally {
      await prisma.user.deleteMany({
        where: { email: `phase6-victim-${RUN3}@example.test` },
      });
    }
  });

  it("unlink without a session is 401", async () => {
    clearAuth();
    const res = await unlinkPOST(
      new Request("http://localhost/api/auth/email/unlink", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      }),
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });

  it("change with the wrong current password is 401 and rotates nothing", async () => {
    const survivorId = await userIdFor(EMAIL_A);
    await authorize(survivorId, TG_REPEAT);
    const res = await changePOST(
      new Request("http://localhost/api/auth/email/password/change", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentPassword: "wrong-throwaway-999", newPassword: NEW_PASSWORD }),
      }),
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "current_password_wrong" });

    // Old password still works — nothing rotated.
    expect(await postLogin({ email: EMAIL_A, password: PASSWORD })).toMatchObject({
      status: 200,
    });
  });

  it("change with the right current password rotates the hash and re-mints", async () => {
    const survivorId = await userIdFor(EMAIL_A);
    await authorize(survivorId, TG_REPEAT);
    const res = await changePOST(
      new Request("http://localhost/api/auth/email/password/change", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD }),
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    // Re-minted session keeps the linked tid under the same uid.
    const secret = process.env["SESSION_SECRET"];
    if (!secret) throw new Error("SESSION_SECRET must be set (dummy throwaway OK)");
    await expect(verifySession(sessionToken(res), secret)).resolves.toEqual({
      userId: survivorId,
      telegramId: TG_REPEAT,
    });

    // New password logs in; old one is dead.
    expect(await postLogin({ email: EMAIL_A, password: NEW_PASSWORD })).toMatchObject({
      status: 200,
    });
    const stale = await postLogin({ email: EMAIL_A, password: PASSWORD });
    expect(stale.status).toBe(401);
  });

  it("trial farm boundary (AUTH-05): one trial per account, N emails need N mailboxes", async () => {
    // Documented enforcement boundary: registration does NOT require a
    // mailbox proof in Phase 6, so two distinct email accounts each claim
    // independently (allowed). The atomic claim still blocks double-claim
    // on the SAME account — farming without N mailboxes is impossible only
    // insofar as each account is a distinct email.
    for (const email of [EMAIL_FARM_1, EMAIL_FARM_2]) {
      expect(await postRegister({ email, password: PASSWORD })).toMatchObject({
        status: 200,
      });
    }
    const first = await userIdFor(EMAIL_FARM_1);
    const second = await userIdFor(EMAIL_FARM_2);
    await expect(claimTrialByUserId(first)).resolves.toBe(true);
    await expect(claimTrialByUserId(second)).resolves.toBe(true);
    await expect(claimTrialByUserId(first)).resolves.toBe(false);
    await expect(claimTrialByUserId(second)).resolves.toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Plan 06-07 (G-06-9): the session-gated /api/trial route drives the real
// provider call through a spied `artemida.createTrial` (no network), the real
// DB claim, and the real keys_cache write. An email-only session claims once
// under `email:{userId}`; a Telegram-linked session keeps the TG path; the
// userId-keyed cabinet read is scoped to the caller (T-06-07-02/03).
// ---------------------------------------------------------------------------
function fakeTrialKey(keyId: string, customerRef: string): NormalizedKey {
  return {
    id: keyId,
    name: "Trial",
    status: "active",
    isTrial: true,
    expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    deviceLimit: 2,
    devices: 0,
    subscriptionUrl: "https://example.test/sub/email-trial",
    customerRef,
    trafficUsedBytes: 0,
    trafficLimitBytes: null,
  };
}

describe("email-only trial via /api/trial + cabinet read (G-06-9)", () => {
  const RUN4 = `${RUN}-trial07`;
  const EMAIL_TRIAL = `phase6-trial-${RUN4}@example.test`;
  const EMAIL_TRIAL_B = `phase6-trial-b-${RUN4}@example.test`;
  const EMAIL_TG = `phase6-trial-tg-${RUN4}@example.test`;
  const TG_TRIAL = 210000014;
  const KEY_A = `key-email-trial-${RUN4}-a`;
  const KEY_B = `key-email-trial-${RUN4}-b`;
  const KEY_TG = `key-tg-trial-${RUN4}`;

  function postTrial(): Promise<Response> {
    return trialPOST();
  }

  async function purge(): Promise<void> {
    await prisma.keyCache.deleteMany({ where: { keyId: { in: [KEY_A, KEY_B, KEY_TG] } } });
    await prisma.user.deleteMany({
      where: { email: { in: [EMAIL_TRIAL, EMAIL_TRIAL_B, EMAIL_TG] } },
    });
    await prisma.user.deleteMany({ where: { telegramId: BigInt(TG_TRIAL) } });
  }

  beforeAll(async () => {
    vi.restoreAllMocks();
    await purge();
  });
  afterAll(async () => {
    clearAuth();
    vi.restoreAllMocks();
    await purge();
  });

  it("email-only POST /api/trial succeeds once, then 409 trial_used with no provider retry", async () => {
    expect(await postRegister({ email: EMAIL_TRIAL, password: PASSWORD })).toMatchObject({
      status: 200,
    });
    const userId = await userIdFor(EMAIL_TRIAL);
    await authorize(userId, null);

    const createTrial = vi
      .spyOn(artemida, "createTrial")
      .mockResolvedValue(fakeTrialKey(KEY_A, `email:${userId}`));

    const first = await postTrial();
    expect(first.status).toBe(200);
    const body = (await first.json()) as { ok: boolean; key: { id: string } };
    expect(body.ok).toBe(true);
    expect(body.key.id).toBe(KEY_A);
    // Provider called under the email-scoped ownership ref (D-80).
    expect(createTrial).toHaveBeenCalledWith({ customerRef: `email:${userId}` });

    const cached = await prisma.keyCache.findMany({ where: { userId } });
    expect(cached).toHaveLength(1);
    expect(cached[0]).toMatchObject({
      keyId: KEY_A,
      isTrial: true,
      customerRef: `email:${userId}`,
    });
    await expect(
      prisma.user.findUnique({
        where: { id: userId },
        select: { trialUsed: true, trialKeyId: true },
      }),
    ).resolves.toMatchObject({ trialUsed: true, trialKeyId: KEY_A });

    const second = await postTrial();
    expect(second.status).toBe(409);
    expect(await second.json()).toEqual({ ok: false, reason: "trial_used" });
    // The loser never reached ARTEMIDA and added no cache row.
    expect(createTrial).toHaveBeenCalledTimes(1);
    await expect(prisma.keyCache.count({ where: { userId } })).resolves.toBe(1);
  });

  it("a Telegram-linked session still takes the TG trial path", async () => {
    expect(await postRegister({ email: EMAIL_TG, password: PASSWORD })).toMatchObject({
      status: 200,
    });
    const userId = await userIdFor(EMAIL_TG);
    await prisma.user.update({
      where: { id: userId },
      data: { telegramId: BigInt(TG_TRIAL), trialUsed: false, trialKeyId: null },
    });
    await authorize(userId, TG_TRIAL);

    const createTrial = vi
      .spyOn(artemida, "createTrial")
      .mockResolvedValue(fakeTrialKey(KEY_TG, String(TG_TRIAL)));

    const res = await postTrial();
    expect(res.status).toBe(200);
    expect(createTrial).toHaveBeenCalledWith({ customerRef: String(TG_TRIAL) });
    const cached = await prisma.keyCache.findMany({ where: { userId } });
    expect(cached).toHaveLength(1);
    expect(cached[0]).toMatchObject({ keyId: KEY_TG, customerRef: String(TG_TRIAL) });
  });

  it("listKeysByUserId returns only the caller's rows (second-user isolation)", async () => {
    expect(await postRegister({ email: EMAIL_TRIAL_B, password: PASSWORD })).toMatchObject({
      status: 200,
    });
    const userA = await userIdFor(EMAIL_TRIAL);
    const userB = await userIdFor(EMAIL_TRIAL_B);
    await prisma.keyCache.deleteMany({ where: { keyId: { in: [KEY_A, KEY_B] } } });
    await prisma.keyCache.create({ data: { userId: userA, keyId: KEY_A, status: "active" } });
    await prisma.keyCache.create({ data: { userId: userB, keyId: KEY_B, status: "active" } });

    const a = await listKeysByUserId(userA);
    const b = await listKeysByUserId(userB);
    expect(a.map((k) => k.id)).toEqual([KEY_A]);
    expect(b.map((k) => k.id)).toEqual([KEY_B]);
  });
});
