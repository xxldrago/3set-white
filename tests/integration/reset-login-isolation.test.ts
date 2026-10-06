// Phase 6 gap-closure (CR-01, plan 06-14): the UNAUTHENTICATED password-reset
// route must not be able to lock a known account out of login. The reset-mail
// throttle lives in its own `__reset__:<email>` namespace, disjoint from the
// login `(<email>, EMAIL_ONLY_IP)` account-wide lock (CR-02). This cross-route
// test proves both directions:
//   1. five anonymous reset requests (rotating source IPs) lock ONLY the reset
//      namespace and leave login fully usable (correct password → 200);
//   2. five failed LOGIN attempts from five distinct IPs still lock the account
//      (sixth login → 429) — CR-02 protection preserved.
//
// Real `setwhite` DB, run-unique throwaway emails, injected fake mail
// transport (no real SMTP, ever). Every row created here is removed in
// beforeAll/afterAll — including the `__reset__:`-namespaced counters.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as registerPOST } from "../../app/api/auth/email/register/route";
import { POST as loginPOST } from "../../app/api/auth/email/login/route";
import { POST as requestPOST } from "../../app/api/auth/email/password/request/route";
import type { MailMessage } from "../../lib/mail";
import { setMailTransportForTests } from "../../lib/mail";
import { EMAIL_ONLY_IP, checkLoginRateLimit } from "../../lib/auth-rate-limit";
import { prisma } from "../../lib/prisma";

const RUN = Date.now().toString(36);
const PASSWORD = "isolation-throwaway-123";
const EMAIL_RESET = `phase6-iso-reset-${RUN}@example.test`;
const EMAIL_LOGIN = `phase6-iso-login-${RUN}@example.test`;

/** Namespaced reset key — must match `RESET_NAMESPACE` in lib/auth-rate-limit. */
function resetKeyFor(email: string): string {
  return `__reset__:${email}`;
}

// WR-02/WR-04 (06-13): registration is throttled per trusted client IP, so each
// registration presents its own `x-real-ip`; `cleanup()` removes this run's
// `__register__:` rows too.
const REGISTER_IP_RUN = (Date.now() % 200) + 1;
const REGISTER_IP_PREFIX = `__register__:198.51.${REGISTER_IP_RUN}.`;
let registerIpCounter = 0;
function nextRegisterIp(): string {
  registerIpCounter += 1;
  return `198.51.${REGISTER_IP_RUN}.${registerIpCounter}`;
}

const sent: MailMessage[] = [];

function postRegister(email: string): Promise<Response> {
  return registerPOST(
    new Request("http://localhost/api/auth/email/register", {
      method: "POST",
      headers: { "content-type": "application/json", "x-real-ip": nextRegisterIp() },
      body: JSON.stringify({ email, password: PASSWORD }),
    }),
  );
}

function postRequest(email: string, ip: string): Promise<Response> {
  return requestPOST(
    new Request("http://localhost/api/auth/email/password/request", {
      method: "POST",
      headers: { "content-type": "application/json", "x-real-ip": ip },
      body: JSON.stringify({ email }),
    }),
  );
}

function postLogin(email: string, password: string, ip: string): Promise<Response> {
  return loginPOST(
    new Request("http://localhost/api/auth/email/login", {
      method: "POST",
      headers: { "content-type": "application/json", "x-real-ip": ip },
      body: JSON.stringify({ email, password }),
    }),
  );
}

async function cleanup(): Promise<void> {
  const raw = [EMAIL_RESET, EMAIL_LOGIN];
  const namespaced = raw.map(resetKeyFor);
  await prisma.passwordReset.deleteMany({ where: { user: { email: { in: raw } } } });
  await prisma.loginAttempt.deleteMany({
    where: {
      OR: [
        { email: { in: [...raw, ...namespaced] } },
        { email: { startsWith: REGISTER_IP_PREFIX } },
      ],
    },
  });
  await prisma.user.deleteMany({ where: { email: { in: raw } } });
}

describe("reset/login lock isolation (CR-01)", () => {
  beforeAll(async () => {
    await cleanup();
    sent.length = 0;
    setMailTransportForTests({
      send: async (msg) => {
        sent.push(msg);
      },
    });
    expect(await postRegister(EMAIL_RESET)).toMatchObject({ status: 200 });
    expect(await postRegister(EMAIL_LOGIN)).toMatchObject({ status: 200 });
    sent.length = 0;
  });

  afterAll(async () => {
    setMailTransportForTests(null);
    await cleanup();
  });

  it("five anonymous reset requests lock only the reset namespace, never login", async () => {
    // Vector 1 (the DoS regression): five reset requests for a KNOWN email,
    // each from a DIFFERENT source IP (simulating header rotation). The reset
    // throttle must be per-namespaced-key so the account-wide reset row locks
    // while the login account-wide row is never created.
    for (let i = 0; i < 5; i++) {
      const res = await postRequest(EMAIL_RESET, `203.0.113.${i + 1}`);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
    }

    // The `("__reset__:<email>", "")` account-wide row is locked...
    const resetRow = await prisma.loginAttempt.findUnique({
      where: { email_ip: { email: resetKeyFor(EMAIL_RESET), ip: EMAIL_ONLY_IP } },
    });
    expect(resetRow).not.toBeNull();
    expect(resetRow?.attempts).toBeGreaterThanOrEqual(5);
    expect(resetRow?.lockedUntil).not.toBeNull();

    // ...and a sixth reset request 429s with a server-computed retryAfterSec
    // (the reset throttle still works, in its own namespace).
    const sixth = await postRequest(EMAIL_RESET, "203.0.113.99");
    expect(sixth.status).toBe(429);
    const lockBody = (await sixth.json()) as { error: string; retryAfterSec: number };
    expect(lockBody.error).toBe("rate_limited");
    expect(typeof lockBody.retryAfterSec).toBe("number");
    expect(lockBody.retryAfterSec).toBeGreaterThan(0);

    // The LOGIN account-wide row was never written by the reset path...
    const loginRow = await prisma.loginAttempt.findUnique({
      where: { email_ip: { email: EMAIL_RESET, ip: EMAIL_ONLY_IP } },
    });
    expect(loginRow).toBeNull();

    // ...so a fresh-IP login gate allows, and a correct-password login 200s.
    const gate = await checkLoginRateLimit(EMAIL_RESET, "203.0.113.250");
    expect(gate.allowed).toBe(true);
    const login = await postLogin(EMAIL_RESET, PASSWORD, "203.0.113.250");
    expect(login.status).toBe(200);
  });

  it("five failed logins from five distinct IPs still lock the account (CR-02 preserved)", async () => {
    const wrong = "isolation-wrong-password";
    for (let i = 0; i < 5; i++) {
      const res = await postLogin(EMAIL_LOGIN, wrong, `198.51.100.${i + 1}`);
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: "invalid_credentials" });
    }

    // The account-wide login row reached the lock threshold IP-independently.
    const accountRow = await prisma.loginAttempt.findUnique({
      where: { email_ip: { email: EMAIL_LOGIN, ip: EMAIL_ONLY_IP } },
    });
    expect(accountRow?.attempts).toBeGreaterThanOrEqual(5);
    expect(accountRow?.lockedUntil).not.toBeNull();

    // A sixth login from a never-seen IP is denied by the account-wide lock.
    const sixth = await postLogin(EMAIL_LOGIN, wrong, "198.51.100.200");
    expect(sixth.status).toBe(429);
    const lockBody = (await sixth.json()) as { error: string; retryAfterSec: number };
    expect(lockBody.error).toBe("rate_limited");
    expect(typeof lockBody.retryAfterSec).toBe("number");
    expect(lockBody.retryAfterSec).toBeGreaterThan(0);

    // The login lock is NOT visible to the reset namespace: a reset request
    // for this account (fresh `__reset__:` counter) is not gated by it.
    const resetAfterLoginLock = await postRequest(EMAIL_LOGIN, "198.51.100.200");
    expect(resetAfterLoginLock.status).toBe(200);
  });
});
