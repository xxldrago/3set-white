// Phase 6 reset tracer (AUTH-04, D-88/D-89/D-90): request → email →
// confirm → new password end-to-end. Runs against the real local Postgres
// (`setwhite` per phase conventions) with an injected fake mail transport —
// no real SMTP sends, ever. Throwaway emails/passwords only; every row and
// attempt counter created here is cleaned up in afterAll.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import { POST as registerPOST } from "../../app/api/auth/email/register/route";
import { POST as loginPOST } from "../../app/api/auth/email/login/route";
import { POST as requestPOST } from "../../app/api/auth/email/password/request/route";
import { POST as confirmPOST } from "../../app/api/auth/email/password/confirm/route";
import { RESET_TTL_MS } from "../../app/api/auth/email/password/request/route";
import {
  setMailTransportForTests,
  type MailMessage,
} from "../../lib/mail";
import { prisma } from "../../lib/prisma";

const RUN = Date.now().toString(36);
const EMAIL = `phase6-reset-${RUN}@example.test`;
const PASSWORD = "reset-throwaway-123";
const NEW_PASSWORD = "reset-rotated-456";
const GHOST = `phase6-reset-ghost-${RUN}@example.test`;

// WR-02/WR-04 (06-13): registration is throttled per trusted client IP. Each
// registration here presents its own `x-real-ip` (run-unique octet) so the
// file-level seed and the describe-scoped helper never share the `"direct"`
// bucket; `cleanup()` removes this run's `__register__:` counter rows.
const REGISTER_IP_RUN = (Date.now() % 200) + 1;
const REGISTER_IP_PREFIX = `__register__:198.51.${REGISTER_IP_RUN}.`;
let registerIpCounter = 0;
function nextRegisterIp(): string {
  registerIpCounter += 1;
  return `198.51.${REGISTER_IP_RUN}.${registerIpCounter}`;
}

const sent: MailMessage[] = [];
/** Every transport attempt, including failed ones (welcome-failure vector). */
const attempts: MailMessage[] = [];
let failSends = false;

function postRequest(body: unknown): Promise<Response> {
  return requestPOST(
    new Request("http://localhost/api/auth/email/password/request", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

function postConfirm(body: unknown): Promise<Response> {
  return confirmPOST(
    new Request("http://localhost/api/auth/email/password/confirm", {
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

async function cleanup(): Promise<void> {
  const emails = [EMAIL, GHOST];
  await prisma.passwordReset.deleteMany({
    where: { user: { email: { in: emails } } },
  });
  // CR-01 (06-14): reset requests now write `__reset__:<email>` counters; list
  // this run's namespaced addresses so the rename leaves no residue. Raw-email
  // `passwordReset`/`user` deletes above stay byte-identical.
  await prisma.loginAttempt.deleteMany({
    where: { email: { in: [...emails, `__reset__:${EMAIL}`, `__reset__:${GHOST}`] } },
  });
  await prisma.loginAttempt.deleteMany({
    where: { email: { startsWith: REGISTER_IP_PREFIX } },
  });
  await prisma.user.deleteMany({ where: { email: { in: emails } } });
}

describe("password reset flow (request → confirm → rotated)", () => {
  beforeAll(async () => {
    await cleanup();
    sent.length = 0;
    setMailTransportForTests({
      send: async (msg) => {
        attempts.push(msg);
        if (failSends) throw new Error("smtp_down");
        sent.push(msg);
      },
    });
    const seed = await registerPOST(
      new Request("http://localhost/api/auth/email/register", {
        method: "POST",
        headers: { "content-type": "application/json", "x-real-ip": nextRegisterIp() },
        body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
      }),
    );
    expect(seed.status).toBe(200);
    // The welcome mail is the only mail so far (D-90: only welcome + reset).
    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toBe(EMAIL);
    sent.length = 0;
  });

  afterAll(async () => {
    await cleanup();
  });

  it("request for an existing email creates an unused 1h token row and sends one reset mail", async () => {
    const res = await postRequest({ email: EMAIL });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    const user = await prisma.user.findUnique({
      where: { email: EMAIL },
      select: { id: true },
    });
    expect(user).not.toBeNull();
    const rows = await prisma.passwordReset.findMany({ where: { userId: user?.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.usedAt).toBeNull();
    expect(rows[0]?.token).toMatch(/^[0-9a-f]{64}$/);
    const ttl = (rows[0]?.expiresAt.getTime() ?? 0) - Date.now();
    expect(ttl).toBeGreaterThan(RESET_TTL_MS - 60_000);
    expect(ttl).toBeLessThanOrEqual(RESET_TTL_MS);

    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toBe(EMAIL);
    // The link carries the token; the token value itself is never logged
    // (asserted structurally — logs are out of scope for the route test).
    expect(sent[0]?.text).toContain("/reset/confirm?token=");
    expect(sent[0]?.text).toContain(rows[0]?.token ?? "missing-token");
  });

  it("confirm with the token rotates the hash, marks used, and does NOT auto-login", async () => {
    const row = await prisma.passwordReset.findFirst({
      where: { user: { email: EMAIL }, usedAt: null },
      select: { token: true },
    });
    expect(row).not.toBeNull();
    const res = await postConfirm({ token: row?.token, newPassword: NEW_PASSWORD });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    // No session minted on reset-confirm — the user signs in explicitly.
    expect(res.headers.get("set-cookie")).toBeNull();

    const used = await prisma.passwordReset.findUnique({
      where: { token: row?.token },
      select: { usedAt: true },
    });
    expect(used?.usedAt).not.toBeNull();

    // New password logs in; the old one is dead.
    expect(await postLogin({ email: EMAIL, password: NEW_PASSWORD })).toMatchObject({
      status: 200,
    });
    const stale = await postLogin({ email: EMAIL, password: PASSWORD });
    expect(stale.status).toBe(401);
    expect(await stale.json()).toEqual({ error: "invalid_credentials" });
  });

  it("a second confirm with the same token is rejected as used", async () => {
    const row = await prisma.passwordReset.findFirst({
      where: { user: { email: EMAIL } },
      select: { token: true },
    });
    expect(row).not.toBeNull();
    const res = await postConfirm({ token: row?.token, newPassword: "reset-reuse-789" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "reset_used" });

    // The reuse attempt rotated nothing — the first new password still works.
    expect(await postLogin({ email: EMAIL, password: NEW_PASSWORD })).toMatchObject({
      status: 200,
    });
  });

  it("request for an unknown email returns the honest no-account answer (D-89)", async () => {
    const before = sent.length;
    const res = await postRequest({ email: GHOST });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "reset_no_account" });
    // No token row, no mail — the answer is honest, not silent.
    expect(await prisma.user.findUnique({ where: { email: GHOST } })).toBeNull();
    expect(sent.length).toBe(before);
  });
});

describe("reset edges: token states, mail failure, throttling (AUTH-04)", () => {
  const EDGE = `phase6-reset-edge-${RUN}@example.test`;
  const RL = `phase6-reset-rl-${RUN}@example.test`;
  const CC = `phase6-reset-cc-${RUN}@example.test`;
  const WELCOME_FAIL = `phase6-reset-wfail-${RUN}@example.test`;
  const EDGE_PASSWORD = "edge-throwaway-123";

  function postRegister(body: unknown): Promise<Response> {
    return registerPOST(
      new Request("http://localhost/api/auth/email/register", {
        method: "POST",
        headers: { "content-type": "application/json", "x-real-ip": nextRegisterIp() },
        body: JSON.stringify(body),
      }),
    );
  }

  async function userIdFor(email: string): Promise<number> {
    const row = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (!row) throw new Error(`expected user row for ${email}`);
    return row.id;
  }

  beforeAll(async () => {
    // The file-level hook owns the transport; re-install here so this block
    // never depends on describe order.
    setMailTransportForTests({
      send: async (msg) => {
        attempts.push(msg);
        if (failSends) throw new Error("smtp_down");
        sent.push(msg);
      },
    });
    for (const email of [EDGE, RL, CC, WELCOME_FAIL]) {
      expect(await postRegister({ email, password: EDGE_PASSWORD })).toMatchObject({
        status: 200,
      });
    }
  });

  afterAll(async () => {
    failSends = false;
    setMailTransportForTests(null);
    const emails = [EDGE, RL, CC, WELCOME_FAIL];
    await prisma.passwordReset.deleteMany({
      where: { user: { email: { in: emails } } },
    });
    // CR-01 (06-14): also remove this run's `__reset__:` namespaced counters
    // (EDGE/RL/CC send reset requests; WELCOME_FAIL is harmless to include).
    await prisma.loginAttempt.deleteMany({
      where: {
        email: {
          in: [
            ...emails,
            `__reset__:${EDGE}`,
            `__reset__:${RL}`,
            `__reset__:${CC}`,
            `__reset__:${WELCOME_FAIL}`,
          ],
        },
      },
    });
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
  });

  it("malformed tokens map to reset_invalid without a DB-shaped error", async () => {
    for (const token of ["not-a-token", "0".repeat(63), "0".repeat(65), "z".repeat(64)]) {
      const res = await postConfirm({ token, newPassword: "edge-rotated-456" });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "reset_invalid" });
    }
    // Oversized input never reaches the token check: the zod boundary owns
    // it (same 400 bad_request as every other route in the codebase).
    const huge = await postConfirm({ token: "x".repeat(300), newPassword: "edge-rotated-456" });
    expect(huge.status).toBe(400);
    expect(await huge.json()).toEqual({ error: "bad_request" });
  });

  it("a token older than 1h maps to reset_expired and rotates nothing", async () => {
    const userId = await userIdFor(EDGE);
    const expiredToken = randomBytes(32).toString("hex");
    await prisma.passwordReset.create({
      data: { token: expiredToken, userId, expiresAt: new Date(Date.now() - 60_000) },
    });
    const res = await postConfirm({ token: expiredToken, newPassword: "edge-rotated-456" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "reset_expired" });

    // The old password still works — nothing rotated.
    expect(await postLogin({ email: EDGE, password: EDGE_PASSWORD })).toMatchObject({
      status: 200,
    });
  });

  it("concurrent double-confirm: exactly one wins, the loser gets reset_used (T-06-07)", async () => {
    expect(await postRequest({ email: CC })).toMatchObject({ status: 200 });
    const row = await prisma.passwordReset.findFirst({
      where: { user: { email: CC }, usedAt: null },
      select: { token: true },
    });
    expect(row).not.toBeNull();
    const [first, second] = await Promise.all([
      postConfirm({ token: row?.token, newPassword: "edge-cc-first-1" }),
      postConfirm({ token: row?.token, newPassword: "edge-cc-second-2" }),
    ]);
    const bodies = [await first.json(), await second.json()];
    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([200, 400]);
    expect(bodies).toContainEqual({ ok: true });
    expect(bodies).toContainEqual({ error: "reset_used" });
  });

  it("SMTP failure maps to generic reset_error with no provider detail (T-06-08)", async () => {
    failSends = true;
    try {
      const res = await postRequest({ email: EDGE });
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body).toEqual({ error: "reset_error" });
      expect(JSON.stringify(body)).not.toMatch(/smtp|nodemailer|ECONN|auth/i);
    } finally {
      failSends = false;
    }
  });

  it("rapid requests throttle to 429 with server retryAfterSec", async () => {
    let lockBody: unknown = null;
    let lastStatus = 0;
    for (let i = 0; i < 8; i++) {
      const res = await postRequest({ email: RL });
      lastStatus = res.status;
      if (res.status === 429) {
        lockBody = await res.json();
        break;
      }
      expect(res.status).toBe(200);
    }
    expect(lastStatus).toBe(429);
    expect(lockBody).toEqual({
      error: "rate_limited",
      retryAfterSec: expect.any(Number),
    });
  });

  it("welcome mail failure never fails registration (fire-and-forget, D-90)", async () => {
    // Fresh mailbox: the welcome mail fires only on a successful create, so
    // a pre-seeded address (409 path) would never exercise it.
    const fresh = `phase6-reset-wfresh-${RUN}@example.test`;
    try {
      failSends = true;
      const res = await postRegister({ email: fresh, password: "edge-wfresh-999" });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
      expect(await prisma.user.findUnique({ where: { email: fresh } })).not.toBeNull();
    } finally {
      failSends = false;
    }
    // The welcome attempt happened (and was logged inside sendMail) even
    // though the transport was down — registration never waited on it.
    await vi.waitFor(() => {
      expect(attempts.some((m) => m.to === fresh)).toBe(true);
    });
    await prisma.user.deleteMany({ where: { email: fresh } });
  });
});
