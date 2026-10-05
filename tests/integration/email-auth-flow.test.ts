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
import { SESSION_COOKIE, signSession, verifySession } from "../../lib/auth";
import { claimTrialByUserId } from "../../lib/keys-service";
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

function postRegister(body: unknown): Promise<Response> {
  return registerPOST(
    new Request("http://localhost/api/auth/email/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
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
