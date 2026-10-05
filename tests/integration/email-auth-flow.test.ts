// Phase 6 email-auth tracer (AUTH-01/AUTH-02, D-79..D-86): register →
// login → session cookie end-to-end, duplicate → 409, wrong-password vs
// unknown-email → byte-identical 401, rate-limit → 429 + retryAfterSec,
// trial-by-userId atomic claim, logout clears the cookie.
//
// DB `setwhite` per phase conventions; throwaway emails/passwords only.
// Rows + attempt counters created here are cleaned up in afterAll.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as registerPOST } from "../../app/api/auth/email/register/route";
import { POST as loginPOST } from "../../app/api/auth/email/login/route";
import { POST as logoutPOST } from "../../app/api/auth/email/logout/route";
import { SESSION_COOKIE, verifySession } from "../../lib/auth";
import { claimTrialByUserId } from "../../lib/keys-service";
import { prisma } from "../../lib/prisma";

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
