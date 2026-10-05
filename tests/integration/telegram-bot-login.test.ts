// Bot-redirect login handshake (G-06-4b, plans 06-06 + 06-09): request → bot
// bind (issues a confirmation code) → status → consume {token, code},
// end-to-end against the local `setwhite` DB. Direct POST-import route tests
// (email-auth-flow.test.ts pattern); throwaway secrets/telegram ids only, rows
// cleaned in beforeAll/afterAll.
//
// Vectors: issue (token+botUrl+claim cookie), status pending→ready, consume
// mints a uid-subject session + creates the user row, single-use double
// consume, expiry, unknown-token no-oracle, missing/wrong claim 401, per-IP
// throttle, different-telegramId bind rejection, and the CR-01 gaps:
// (1) a hijack (attacker claim cookie + victim bind + no/wrong code) mints no
// session and does not consume the token; (2) the correct code yields a session
// for the authorizing Telegram id; (3) five wrong codes invalidate the token.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";

// next/headers is read only by the consume route (claim cookie). The claim is
// set by each test to mimic the issuing browser's cookie jar.
const jar = vi.hoisted(() => ({ claim: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      jar.claim === undefined ? undefined : { name, value: jar.claim },
  }),
}));

// env.ts parses process.env at import time — set the bot username before the
// route modules load so resolveBotUsername never reaches the Telegram API.
vi.hoisted(() => {
  process.env["TELEGRAM_BOT_USERNAME"] = "phase6_test_bot";
});

import { POST as requestPOST } from "../../app/api/auth/telegram-bot/request/route";
import { POST as statusPOST } from "../../app/api/auth/telegram-bot/status/route";
import { POST as consumePOST } from "../../app/api/auth/telegram-bot/consume/route";
import { SESSION_COOKIE, verifySession } from "../../lib/auth";
import { bindLoginToken, LOGIN_CLAIM_COOKIE, LOGIN_CODE_MAX_ATTEMPTS } from "../../lib/telegram-login";
import { prisma } from "../../lib/prisma";

const RUN = Date.now().toString(36);
const TG = 210000021; // email-auth uses 210000011-13; keep clear of it
const TG_OTHER = 210000022;
const TG_EXPIRED = 210000023;
const TG_VICTIM = 210000024;
const THROTTLE_IP = `203.0.113.${(Date.now() % 200) + 1}`;
const tokens: string[] = [];

function postReq(body?: unknown, ip?: string): Promise<Response> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (ip) headers["x-forwarded-for"] = ip;
  return requestPOST(
    new Request("http://localhost/api/auth/telegram-bot/request", {
      method: "POST",
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
}

function postStatus(token: unknown): Promise<Response> {
  return statusPOST(
    new Request("http://localhost/api/auth/telegram-bot/status", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    }),
  );
}

function postConsume(token: unknown, code?: unknown): Promise<Response> {
  const body: Record<string, unknown> = { token };
  if (code !== undefined) body.code = code;
  return consumePOST(
    new Request("http://localhost/api/auth/telegram-bot/consume", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

async function issue(ip?: string): Promise<{ token: string; claim: string; botUrl: string }> {
  const res = await postReq(undefined, ip);
  expect(res.status).toBe(200);
  const body = (await res.json()) as { token: string; claim?: string; botUrl: string };
  const cookie = res.headers.get("set-cookie") ?? "";
  const claim = cookie.split(";")[0]?.split("=")[1] ?? "";
  expect(cookie).toContain(`${LOGIN_CLAIM_COOKIE}=`);
  tokens.push(body.token);
  return { token: body.token, claim, botUrl: body.botUrl };
}

/** Bind and return the bot-delivered confirmation code (asserts the bind). */
async function bind(token: string, telegramId: number): Promise<string> {
  const bound = await bindLoginToken(token, telegramId);
  if (bound.kind !== "bound") throw new Error("expected bind to succeed");
  return bound.code;
}

/** A well-formed 6-digit code guaranteed different from `code`. */
function wrongCode(code: string): string {
  return code === "000000" ? "111111" : "000000";
}

function sessionTokenFrom(res: Response): string {
  const setCookie = res.headers.get("set-cookie") ?? "";
  expect(setCookie).toContain(`${SESSION_COOKIE}=`);
  return setCookie.split(";")[0]?.split("=")[1] ?? "";
}

async function cleanup(): Promise<void> {
  if (tokens.length > 0) {
    await prisma.telegramLoginToken.deleteMany({ where: { token: { in: tokens } } });
  }
  await prisma.telegramLoginToken.deleteMany({
    where: { ipHash: createHash("sha256").update(THROTTLE_IP).digest("hex") },
  });
  await prisma.user.deleteMany({
    where: {
      telegramId: { in: [BigInt(TG), BigInt(TG_OTHER), BigInt(TG_EXPIRED), BigInt(TG_VICTIM)] },
    },
  });
}

describe("bot-redirect login handshake (G-06-4b)", () => {
  beforeAll(cleanup);
  afterAll(async () => {
    jar.claim = undefined;
    await cleanup();
  });

  it("request issues a one-time token, deep link, and httpOnly claim cookie", async () => {
    const { token, claim, botUrl } = await issue("198.51.100.10");
    expect(token).toMatch(/^[0-9a-f]{48}$/);
    expect(claim).toMatch(/^[0-9a-f]{64}$/);
    expect(botUrl).toBe(`https://t.me/phase6_test_bot?start=login_${token}`);

    const row = await prisma.telegramLoginToken.findUnique({ where: { token } });
    expect(row).not.toBeNull();
    expect(row?.telegramId).toBeNull();
    expect(row?.consumedAt).toBeNull();
    expect(row?.codeHash).toBeNull();

    // Claim cookie flags: httpOnly, scoped to the bot-login routes, 10 min.
    const res = await postReq(undefined, "198.51.100.10");
    tokens.push(((await res.json()) as { token: string }).token);
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/api/auth/telegram-bot");
    expect(cookie).toContain("Max-Age=600");
  });

  it("status is pending, then ready once the bot binds (code hash never exposed)", async () => {
    const { token } = await issue();
    expect(await (await postStatus(token)).json()).toEqual({ status: "pending" });

    const code = await bind(token, TG);
    expect(code).toMatch(/^\d{6}$/);
    // Only the hash is stored — the plaintext code never lands in the row.
    const row = await prisma.telegramLoginToken.findUnique({
      where: { token },
      select: { codeHash: true },
    });
    expect(row?.codeHash).toMatch(/^[0-9a-f]{64}$/);
    expect(row?.codeHash).not.toBe(code);

    const ready = await postStatus(token);
    expect(await ready.json()).toEqual({ status: "ready" });
    // The status response carries no code for anyone to scrape.
    expect(JSON.stringify(await (await postStatus(token)).json())).not.toContain(code);
  });

  it("consume requires the matching code and mints the shared httpOnly session", async () => {
    const { token, claim } = await issue();
    const code = await bind(token, TG);
    jar.claim = claim;

    // Wrong code → generic 401, token untouched.
    expect((await postConsume(token, wrongCode(code))).status).toBe(401);
    // Missing code → rejected at validation (400), token still untouched.
    expect((await postConsume(token)).status).toBe(400);

    const res = await postConsume(token, code);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    const secret = process.env["SESSION_SECRET"];
    if (!secret) throw new Error("SESSION_SECRET must be set (dummy throwaway OK)");
    const user = await prisma.user.findUnique({
      where: { telegramId: BigInt(TG) },
      select: { id: true, telegramId: true },
    });
    expect(user).not.toBeNull();
    await expect(verifySession(sessionTokenFrom(res), secret)).resolves.toEqual({
      userId: user?.id,
      telegramId: TG,
    });
  });

  it("double consume is rejected (single-use)", async () => {
    const { token, claim } = await issue();
    const code = await bind(token, TG);
    jar.claim = claim;

    expect((await postConsume(token, code)).status).toBe(200);
    const second = await postConsume(token, code);
    expect(second.status).toBe(409);
    expect(await second.json()).toEqual({ error: "login_not_ready" });
  });

  it("an expired token fails closed", async () => {
    const { token, claim } = await issue();
    const code = await bind(token, TG_EXPIRED);
    await prisma.telegramLoginToken.update({
      where: { token },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    jar.claim = claim;
    const res = await postConsume(token, code);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "login_not_ready" });
  });

  it("unknown token reports expired with no oracle", async () => {
    const unknown = createHash("sha256").update(`ghost-${RUN}`).digest("hex").slice(0, 48);
    const res = await postStatus(unknown);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "expired" });
  });

  it("missing or wrong claim cookie is 401 and consumes nothing", async () => {
    const { token, claim } = await issue();
    const code = await bind(token, TG);

    jar.claim = undefined;
    expect((await postConsume(token, code)).status).toBe(401);

    jar.claim = "f".repeat(64);
    expect((await postConsume(token, code)).status).toBe(401);

    // Token still consumable by the rightful browser after the rejected tries.
    jar.claim = claim;
    expect((await postConsume(token, code)).status).toBe(200);
  });

  it("per-IP throttle trips after 20 issues in the window", async () => {
    for (let i = 0; i < 20; i++) {
      const res = await postReq(undefined, THROTTLE_IP);
      expect(res.status).toBe(200);
      tokens.push(((await res.json()) as { token: string }).token);
    }
    const res = await postReq(undefined, THROTTLE_IP);
    expect(res.status).toBe(429);
    const body = (await res.json()) as { error: string; retryAfterSec: number };
    expect(body.error).toBe("rate_limited");
    expect(typeof body.retryAfterSec).toBe("number");
    expect(body.retryAfterSec).toBeGreaterThan(0);
  });

  it("binding a different telegramId is rejected and cannot hijack the session", async () => {
    const { token, claim } = await issue();
    const code = await bind(token, TG);
    expect((await bindLoginToken(token, TG_OTHER)).kind).toBe("invalid");

    jar.claim = claim;
    const res = await postConsume(token, code);
    expect(res.status).toBe(200);
    const secret = process.env["SESSION_SECRET"];
    if (!secret) throw new Error("SESSION_SECRET must be set (dummy throwaway OK)");
    // Session belongs to the FIRST (legitimate) Telegram id only.
    await expect(verifySession(sessionTokenFrom(res), secret)).resolves.toEqual({
      userId: expect.any(Number),
      telegramId: TG,
    });
  });

  // ------------------------------------------------------------------------
  // CR-01 — the authorizer must be bound to the issuing browser.
  // ------------------------------------------------------------------------

  it("CR-01: a hijack (attacker claim cookie, victim bind, no/wrong code) mints no session", async () => {
    // Attacker issues a token and keeps its claim cookie.
    const { token, claim } = await issue();
    // The victim is lured to the bot and presses Start; the bot DMs the code
    // to the VICTIM's chat. The attacker never sees it.
    const victimCode = await bind(token, TG_VICTIM);
    jar.claim = claim; // the attacker's own, valid claim cookie

    // (a) No code → rejected before any verification.
    const noCode = await postConsume(token);
    expect(noCode.status).toBe(400);
    expect(noCode.headers.get("set-cookie")).toBeNull();

    // (b) A well-formed wrong code → generic 401 (no oracle vs a bad claim).
    const wrong = await postConsume(token, wrongCode(victimCode));
    expect(wrong.status).toBe(401);
    expect(wrong.headers.get("set-cookie")).toBeNull();

    // The failed hijack neither consumed the token nor leaked the code.
    const row = await prisma.telegramLoginToken.findUnique({
      where: { token },
      select: { consumedAt: true, telegramId: true },
    });
    expect(row?.consumedAt).toBeNull();
    expect(row?.telegramId).toBe(BigInt(TG_VICTIM));
    expect(JSON.stringify(await (await postStatus(token)).json())).not.toContain(victimCode);
  });

  it("CR-01: the correct code mints a session for the authorizing Telegram id", async () => {
    const { token, claim } = await issue();
    const code = await bind(token, TG_VICTIM);
    jar.claim = claim;

    const res = await postConsume(token, code);
    expect(res.status).toBe(200);
    const secret = process.env["SESSION_SECRET"];
    if (!secret) throw new Error("SESSION_SECRET must be set (dummy throwaway OK)");
    await expect(verifySession(sessionTokenFrom(res), secret)).resolves.toEqual({
      userId: expect.any(Number),
      telegramId: TG_VICTIM,
    });
  });

  it("CR-01: the code-attempt cap invalidates the token (brute force fails closed)", async () => {
    const { token, claim } = await issue();
    const code = await bind(token, TG);
    jar.claim = claim;

    for (let i = 0; i < LOGIN_CODE_MAX_ATTEMPTS; i++) {
      const res = await postConsume(token, wrongCode(code));
      expect(res.status).toBe(401);
    }
    // The token is now invalidated: even the correct code cannot consume it.
    const after = await postConsume(token, code);
    expect(after.status).toBe(409);
    expect(await after.json()).toEqual({ error: "login_not_ready" });

    const row = await prisma.telegramLoginToken.findUnique({
      where: { token },
      select: { consumedAt: true },
    });
    expect(row?.consumedAt).not.toBeNull();
  });

  it("rejects garbage bodies with 400", async () => {
    expect((await postStatus(42)).status).toBe(400);
    expect((await postConsume(null)).status).toBe(400);
    expect((await postConsume("a".repeat(48), "abc")).status).toBe(400);
  });
});
