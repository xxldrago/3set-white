// Phase 6 reset tracer (AUTH-04, D-88/D-89/D-90): request → email →
// confirm → new password end-to-end. Runs against the real local Postgres
// (`setwhite` per phase conventions) with an injected fake mail transport —
// no real SMTP sends, ever. Throwaway emails/passwords only; every row and
// attempt counter created here is cleaned up in afterAll.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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

const sent: MailMessage[] = [];

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
  await prisma.loginAttempt.deleteMany({ where: { email: { in: emails } } });
  await prisma.user.deleteMany({ where: { email: { in: emails } } });
}

describe("password reset flow (request → confirm → rotated)", () => {
  beforeAll(async () => {
    await cleanup();
    sent.length = 0;
    setMailTransportForTests({
      send: async (msg) => {
        sent.push(msg);
      },
    });
    const seed = await registerPOST(
      new Request("http://localhost/api/auth/email/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
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
    setMailTransportForTests(null);
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
