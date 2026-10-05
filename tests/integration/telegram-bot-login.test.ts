// Bot-redirect login handshake (G-06-4b, plan 06-06): request → bot bind →
// status → consume, end-to-end against the local `setwhite` DB. Direct
// POST-import route tests (email-auth-flow.test.ts pattern); throwaway
// secrets/telegram ids only, rows cleaned in afterAll.
//
// Vectors: issue (token+botUrl+claim cookie), status pending→ready, consume
// mints a uid-subject session + creates the user row, single-use double
// consume, expiry, unknown-token no-oracle, anti-fixation claim mismatch,
// per-IP throttle, and different-telegramId bind rejection.
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
import { bindLoginToken, LOGIN_CLAIM_COOKIE } from "../../lib/telegram-login";
import { prisma } from "../../lib/prisma";

const RUN = Date.now().toString(36);
const TG = 210000021; // email-auth uses 210000011-13; keep clear of it
const TG_OTHER = 210000022;
const TG_EXPIRED = 210000023;
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

function postConsume(token: unknown): Promise<Response> {
  return consumePOST(
    new Request("http://localhost/api/auth/telegram-bot/consume", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
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
    where: { telegramId: { in: [BigInt(TG), BigInt(TG_OTHER), BigInt(TG_EXPIRED)] } },
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

    // Claim cookie flags: httpOnly, scoped to the bot-login routes, 10 min.
    const res = await postReq(undefined, "198.51.100.10");
    tokens.push(((await res.json()) as { token: string }).token);
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/api/auth/telegram-bot");
    expect(cookie).toContain("Max-Age=600");
  });

  it("status is pending, then ready once the bot binds", async () => {
    const { token } = await issue();
    expect(await (await postStatus(token)).json()).toEqual({ status: "pending" });

    const bound = await bindLoginToken(token, TG);
    expect(bound.kind).toBe("bound");
    expect(await (await postStatus(token)).json()).toEqual({ status: "ready" });
  });

  it("consume mints the shared httpOnly session and creates the user row", async () => {
    const { token, claim } = await issue();
    await bindLoginToken(token, TG);
    jar.claim = claim;

    const res = await postConsume(token);
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
    await bindLoginToken(token, TG);
    jar.claim = claim;

    expect((await postConsume(token)).status).toBe(200);
    const second = await postConsume(token);
    expect(second.status).toBe(409);
    expect(await second.json()).toEqual({ error: "login_not_ready" });
  });

  it("an expired token fails closed", async () => {
    const { token, claim } = await issue();
    await bindLoginToken(token, TG_EXPIRED);
    await prisma.telegramLoginToken.update({
      where: { token },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    jar.claim = claim;
    const res = await postConsume(token);
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
    await bindLoginToken(token, TG);

    jar.claim = undefined;
    expect((await postConsume(token)).status).toBe(401);

    jar.claim = "f".repeat(64);
    expect((await postConsume(token)).status).toBe(401);

    // Token still consumable by the rightful browser after the rejected tries.
    jar.claim = claim;
    expect((await postConsume(token)).status).toBe(200);
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
    expect((await bindLoginToken(token, TG)).kind).toBe("bound");
    expect((await bindLoginToken(token, TG_OTHER)).kind).toBe("invalid");

    jar.claim = claim;
    const res = await postConsume(token);
    expect(res.status).toBe(200);
    const secret = process.env["SESSION_SECRET"];
    if (!secret) throw new Error("SESSION_SECRET must be set (dummy throwaway OK)");
    // Session belongs to the FIRST (legitimate) Telegram id only.
    await expect(verifySession(sessionTokenFrom(res), secret)).resolves.toEqual({
      userId: expect.any(Number),
      telegramId: TG,
    });
  });

  it("rejects garbage bodies with 400", async () => {
    expect((await postStatus(42)).status).toBe(400);
    expect((await postConsume(null)).status).toBe(400);
  });
});
