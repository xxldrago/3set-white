// TG → email attach tracer (AUTH-01 symmetric to email/link): a Telegram-
// signed account adds the email + password pair the login route accepts.
// Runs against the real `setwhite` DB with next/headers mocked
// (email-auth-flow pattern); throwaway emails only.
//
// Covers: 200 attach (row + canonical + watermark + re-minted cookie), email
// login works afterwards, second attach → 409 email_exists, email taken by
// another row → 409 email_taken (no mutation), no session → 401, malformed
// body → 400, registration throttle → 429 with server retryAfterSec.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { POST as attachPOST } from "../../app/api/auth/email/attach/route";
import { POST as loginPOST } from "../../app/api/auth/email/login/route";
import { SESSION_COOKIE, signSession, verifySession } from "../../lib/auth";
import { canonicalizeEmail } from "../../lib/email-canonical";
import { verifyPassword } from "../../lib/password";
import { prisma } from "../../lib/prisma";

// Session-gated attach reads next/headers cookies() — mock it so a signed
// session can be presented without a Next runtime.
const session = vi.hoisted(() => ({ token: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      session.token === undefined ? undefined : { name, value: session.token },
  }),
}));

const RUN = Date.now().toString(36);
const TG_ID = 220000011;
const EMAIL = `phase6-attach-${RUN}@example.test`;
const EMAIL_ALIAS = `phase6-attach-${RUN}+tag@example.test`;
const EMAIL_TAKEN = `phase6-attach-taken-${RUN}@example.test`;
const PASSWORD = "attach-throwaway-123";
const EMAILS = [EMAIL, EMAIL_ALIAS, EMAIL_TAKEN];

// WR-02/WR-04: attach shares the registration throttle, keyed on the trusted
// client IP. Every request here presents its OWN run-unique `x-real-ip` so
// this suite never accumulates in the shared `"direct"` bucket; `cleanup()`
// removes this run's `__register__:` rows.
const REGISTER_IP_RUN = (Date.now() % 200) + 1;
const REGISTER_IP_PREFIX = `__register__:198.51.${REGISTER_IP_RUN}.`;
let registerIpCounter = 0;
function nextRegisterIp(): string {
  registerIpCounter += 1;
  return `198.51.${REGISTER_IP_RUN}.${registerIpCounter}`;
}

function sessionSecret(): string {
  const secret = process.env["SESSION_SECRET"];
  if (!secret) throw new Error("SESSION_SECRET must be set (dummy throwaway OK)");
  return secret;
}

function postAttach(body: unknown, ip?: string): Promise<Response> {
  return attachPOST(
    new Request("http://localhost/api/auth/email/attach", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(ip === undefined ? {} : { "x-real-ip": ip }),
      },
      body: JSON.stringify(body),
    }),
  );
}

function sessionToken(res: Response): string {
  const setCookie = res.headers.get("set-cookie") ?? "";
  expect(setCookie).toContain(`${SESSION_COOKIE}=`);
  const value = setCookie.split(";")[0]?.split("=")[1] ?? "";
  expect(value.length).toBeGreaterThan(0);
  return value;
}

async function cleanup(): Promise<void> {
  await prisma.loginAttempt.deleteMany({
    where: { email: { startsWith: REGISTER_IP_PREFIX } },
  });
  await prisma.user.deleteMany({ where: { email: { in: EMAILS } } });
  await prisma.user.deleteMany({ where: { telegramId: { in: [BigInt(TG_ID), BigInt(TG_ID + 1)] } } });
}

describe("email attach (TG account → email credential)", () => {
  let userId: number;

  beforeAll(async () => {
    await cleanup();
    const row = await prisma.user.create({
      data: { telegramId: BigInt(TG_ID), firstName: "Attach" },
      select: { id: true },
    });
    userId = row.id;
  });
  afterAll(cleanup);

  it("attaches email + password to a Telegram account and re-mints the session", async () => {
    session.token = await signSession(userId, TG_ID, sessionSecret());
    const res = await postAttach({ email: EMAIL, password: PASSWORD }, nextRegisterIp());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    const row = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        email: true,
        emailCanonical: true,
        passwordHash: true,
        credentialsChangedAt: true,
        telegramId: true,
      },
    });
    expect(row?.email).toBe(EMAIL);
    expect(row?.emailCanonical).toBe(canonicalizeEmail(EMAIL));
    expect(row?.passwordHash).toBeTruthy();
    expect(row?.credentialsChangedAt).not.toBeNull();
    expect(row?.telegramId).toBe(BigInt(TG_ID));
    expect(await verifyPassword(row?.passwordHash ?? "", PASSWORD)).toBe(true);

    // Re-minted cookie: same uid + tid, and it verifies (the bump would
    // otherwise revoke the caller's own session).
    const token = sessionToken(res);
    await expect(verifySession(token, sessionSecret())).resolves.toMatchObject({
      userId,
      telegramId: TG_ID,
    });
  });

  it("lets the account log in by email afterwards", async () => {
    const res = await loginPOST(
      new Request("http://localhost/api/auth/email/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
      }),
    );
    expect(res.status).toBe(200);
    expect(sessionToken(res)).toBeTruthy();
  });

  it("rejects a second attach with 409 email_exists", async () => {
    session.token = await signSession(userId, TG_ID, sessionSecret());
    const res = await postAttach(
      { email: `phase6-attach-second-${RUN}@example.test`, password: PASSWORD },
      nextRegisterIp(),
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "email_exists" });
  });

  it("rejects an email owned by another row with 409 email_taken (no mutation)", async () => {
    const taken = await prisma.user.create({
      data: { email: EMAIL_TAKEN, emailCanonical: canonicalizeEmail(EMAIL_TAKEN) },
      select: { id: true, credentialsChangedAt: true },
    });
    const before = await prisma.user.findUnique({
      where: { id: taken.id },
      select: { credentialsChangedAt: true },
    });

    // A second Telegram account (no email yet) attempts the taken address.
    const other = await prisma.user.create({
      data: { telegramId: BigInt(TG_ID + 1) },
      select: { id: true },
    });
    session.token = await signSession(other.id, TG_ID + 1, sessionSecret());
    const res = await postAttach({ email: EMAIL_TAKEN, password: PASSWORD }, nextRegisterIp());
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "email_taken" });

    const after = await prisma.user.findUnique({
      where: { id: other.id },
      select: { email: true, credentialsChangedAt: true },
    });
    expect(after?.email).toBeNull();
    const victim = await prisma.user.findUnique({
      where: { id: taken.id },
      select: { credentialsChangedAt: true },
    });
    expect(victim?.credentialsChangedAt).toEqual(before?.credentialsChangedAt);
  });

  it("rejects a plus/dot alias of an existing mailbox with 409 email_taken", async () => {
    const other = await prisma.user.findFirst({
      where: { telegramId: BigInt(TG_ID + 1) },
      select: { id: true },
    });
    if (!other) throw new Error("second account missing");
    session.token = await signSession(other.id, TG_ID + 1, sessionSecret());
    const res = await postAttach({ email: EMAIL_ALIAS, password: PASSWORD }, nextRegisterIp());
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "email_taken" });
  });

  it("rejects an unsigned caller with 401", async () => {
    session.token = undefined;
    const res = await postAttach({ email: EMAIL, password: PASSWORD });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });

  it("rejects a malformed body with 400", async () => {
    session.token = await signSession(userId, TG_ID, sessionSecret());
    const res = await postAttach({ email: "not-an-email", password: "short" }, nextRegisterIp());
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "bad_request" });
  });

  it("throttles a flood from one trusted IP with 429 + retryAfterSec", async () => {
    const ip = nextRegisterIp();
    // MAX_ATTEMPTS (5) per-IP: the gate passes the first attempts, the lock
    // engages on the 5th record, and the 6th request is denied.
    for (let i = 0; i < 5; i += 1) {
      session.token = await signSession(userId, TG_ID, sessionSecret());
      const res = await postAttach(
        { email: `phase6-attach-flood-${i}-${RUN}@example.test`, password: PASSWORD },
        ip,
      );
      expect(res.status).not.toBe(429);
    }
    session.token = await signSession(userId, TG_ID, sessionSecret());
    const res = await postAttach(
      { email: `phase6-attach-flood-5-${RUN}@example.test`, password: PASSWORD },
      ip,
    );
    expect(res.status).toBe(429);
    const body = (await res.json()) as { error?: string; retryAfterSec?: number };
    expect(body.error).toBe("rate_limited");
    expect(typeof body.retryAfterSec).toBe("number");
    expect(body.retryAfterSec as number).toBeGreaterThan(0);
  });
});
