// Phase 6 gap-closure (WR-01/WR-03): credential-watermark session revocation
// plus reset-token supersession. Runs against the real `setwhite` DB with
// next/headers mocked (email-auth-flow pattern); throwaway emails only.
//
// Determinism: jose `iat` is second-truncated, so a session re-minted in the
// same wall-clock second as the bump is (by design) still accepted — a freshly
// registered session can share the bump's second (~10-20% of runs). Every
// "old" token here is therefore minted via `signSessionAt` with a controlled
// EARLIER iat (now - 120s), so the gate's strict `<` comparison is
// deterministic and never depends on wall-clock ordering.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { SignJWT } from "jose";
import { POST as registerPOST } from "../../app/api/auth/email/register/route";
import { POST as unlinkPOST } from "../../app/api/auth/email/unlink/route";
import { POST as changePOST } from "../../app/api/auth/email/password/change/route";
import { POST as requestPOST } from "../../app/api/auth/email/password/request/route";
import { POST as confirmPOST } from "../../app/api/auth/email/password/confirm/route";
import { SESSION_COOKIE } from "../../lib/auth";
import { prisma } from "../../lib/prisma";

// Session-gated routes (unlink/change) read next/headers cookies() — mock it
// so a signed session (real OR controlled-iat) can be presented without a
// Next runtime (tickets-route.test.ts pattern).
const session = vi.hoisted(() => ({ token: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      session.token === undefined ? undefined : { name, value: session.token },
  }),
}));

const RUN = Date.now().toString(36);
const PASSWORD = "watermark-throwaway-123";
const NEW_PASSWORD = "watermark-rotated-456";
const EMAIL_A = `phase6-wm-a-${RUN}@example.test`;
const EMAIL_B = `phase6-wm-b-${RUN}@example.test`;
const EMAIL_C = `phase6-wm-c-${RUN}@example.test`;
const EMAILS = [EMAIL_A, EMAIL_B, EMAIL_C];

// WR-02/WR-04 (06-13): registration is throttled per trusted client IP. Each
// registration here presents its own `x-real-ip` (run-unique octet) so runs do
// not accumulate in the shared `"direct"` bucket and lock the suite on a
// second execution; `cleanup()` removes this run's `__register__:` rows.
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

/** Mints a session with an explicit second-granularity `iat` (jose). */
async function signSessionAt(
  userId: number,
  telegramId: number | null,
  secret: string,
  iatSec: number,
): Promise<string> {
  const claims: Record<string, number> = { uid: userId };
  if (telegramId !== null) claims["tid"] = telegramId;
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(iatSec)
    .setExpirationTime("30d")
    .sign(new TextEncoder().encode(secret));
}

/** An issue time strictly before any watermark bumped during this test. */
function earlierIat(): number {
  return Math.floor(Date.now() / 1000) - 120;
}

function requestJson(
  handler: (req: Request) => Promise<Response>,
  path: string,
  body: unknown,
): Promise<Response> {
  return handler(
    new Request(`http://localhost${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
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

async function register(email: string): Promise<number> {
  const res = await registerPOST(
    new Request("http://localhost/api/auth/email/register", {
      method: "POST",
      headers: { "content-type": "application/json", "x-real-ip": nextRegisterIp() },
      body: JSON.stringify({ email, password: PASSWORD }),
    }),
  );
  expect(res.status).toBe(200);
  const row = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!row) throw new Error(`expected user row for ${email}`);
  return row.id;
}

/**
 * Revocation probe over the session-gated unlink route with a non-confirming
 * body `{}`: a revoked session → 401; a live session → the route's own
 * 400 confirmation_required and no mutation.
 */
function probeUnlink(token: string): Promise<Response> {
  session.token = token;
  return requestJson(unlinkPOST, "/api/auth/email/unlink", {});
}

async function cleanup(): Promise<void> {
  await prisma.loginAttempt.deleteMany({ where: { email: { in: EMAILS } } });
  await prisma.loginAttempt.deleteMany({
    where: { email: { startsWith: REGISTER_IP_PREFIX } },
  });
  await prisma.user.deleteMany({ where: { email: { in: EMAILS } } });
}

describe("session revocation watermark (WR-01)", () => {
  beforeAll(cleanup);
  afterAll(async () => {
    session.token = undefined;
    await cleanup();
  });

  it("password change revokes an earlier-issued session; the re-minted one survives", async () => {
    const userId = await register(EMAIL_A);
    const oldToken = await signSessionAt(userId, null, sessionSecret(), earlierIat());

    // The old token is accepted pre-bump (credentialsChangedAt is still null)
    // → change-password with it succeeds and mints a fresh session.
    session.token = oldToken;
    const change = await requestJson(changePOST, "/api/auth/email/password/change", {
      currentPassword: PASSWORD,
      newPassword: NEW_PASSWORD,
    });
    expect(change.status).toBe(200);
    const freshToken = sessionToken(change);

    // The old session is now revoked...
    const revoked = await probeUnlink(oldToken);
    expect(revoked.status).toBe(401);
    expect(await revoked.json()).toEqual({ error: "unauthorized" });

    // ...while the re-minted session authenticates (its own 400, not a 401).
    const live = await probeUnlink(freshToken);
    expect(live.status).toBe(400);
    expect(await live.json()).toEqual({ error: "confirmation_required", lastMethod: false });
  });

  it("password reset revokes an earlier-issued session", async () => {
    const userId = await register(EMAIL_B);
    const oldToken = await signSessionAt(userId, null, sessionSecret(), earlierIat());

    // Pre-bump sanity: the session is live (probe returns its own 400).
    const before = await probeUnlink(oldToken);
    expect(before.status).toBe(400);

    const req = await requestJson(requestPOST, "/api/auth/email/password/request", {
      email: EMAIL_B,
    });
    expect(req.status).toBe(200);
    const resetRow = await prisma.passwordReset.findFirst({
      where: { userId, usedAt: null },
      orderBy: { createdAt: "desc" },
      select: { token: true },
    });
    if (!resetRow) throw new Error("expected a reset row after the request");
    const confirm = await requestJson(confirmPOST, "/api/auth/email/password/confirm", {
      token: resetRow.token,
      newPassword: NEW_PASSWORD,
    });
    expect(confirm.status).toBe(200);

    const after = await probeUnlink(oldToken);
    expect(after.status).toBe(401);
    expect(await after.json()).toEqual({ error: "unauthorized" });
  });

  it("issuing a new reset token supersedes the previous unused token (WR-03)", async () => {
    const userId = await register(EMAIL_C);

    const first = await requestJson(requestPOST, "/api/auth/email/password/request", {
      email: EMAIL_C,
    });
    expect(first.status).toBe(200);
    const firstRow = await prisma.passwordReset.findFirst({
      where: { userId, usedAt: null },
      select: { token: true },
    });
    if (!firstRow) throw new Error("expected a reset row after the first request");

    const second = await requestJson(requestPOST, "/api/auth/email/password/request", {
      email: EMAIL_C,
    });
    expect(second.status).toBe(200);

    // Exactly one unused row remains, and it is the newest.
    const unused = await prisma.passwordReset.findMany({
      where: { userId, usedAt: null },
      select: { token: true },
    });
    expect(unused).toHaveLength(1);
    expect(unused[0]?.token).not.toBe(firstRow.token);

    // The superseded token can no longer be redeemed.
    const stale = await requestJson(confirmPOST, "/api/auth/email/password/confirm", {
      token: firstRow.token,
      newPassword: NEW_PASSWORD,
    });
    expect(stale.status).toBe(400);
    expect(await stale.json()).toEqual({ error: "reset_invalid" });
  });
});
