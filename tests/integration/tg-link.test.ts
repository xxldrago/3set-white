// Link-via-bot tracer: token parse/build, request/status/consume gates,
// bot-side bind + auto-merge, conflict on a taken Telegram, and foreign
// token isolation. Real local Postgres; the bot bind path is exercised
// through `bindLinkToken` directly (Telegraf context is out of scope).
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ token: undefined as string | undefined }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      session.token === undefined ? undefined : { name, value: session.token },
  }),
}));

import { POST as consumePOST } from "../../app/api/auth/email/link/consume/route";
import { POST as requestPOST } from "../../app/api/auth/email/link/request/route";
import { POST as statusPOST } from "../../app/api/auth/email/link/status/route";
import { signSession, verifySession } from "../../lib/auth";
import { prisma } from "../../lib/prisma";
import { jsonResponse } from "../helpers/fake-fetch";
import {
  bindLinkToken,
  buildBotLinkUrl,
  consumeLinkToken,
  issueLinkToken,
  linkTokenStatus,
  parseLinkStartPayload,
} from "../../lib/telegram-link";

const TG = 960000701;
const OTHER_TG = 960000702;
const SECRET =
  process.env["SESSION_SECRET"] ?? "unit-test-session-secret-at-least-32-characters";
const RUN = Date.now().toString(36);
const EMAIL = `tglink-${RUN}@example.test`;
const OTHER_EMAIL = `tglink-other-${RUN}@example.test`;

async function cleanup(): Promise<void> {
  await prisma.telegramLinkToken.deleteMany({});
  for (const email of [EMAIL, OTHER_EMAIL]) {
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (user) {
      await prisma.outbox.deleteMany({ where: { order: { userId: user.id } } });
      await prisma.order.deleteMany({ where: { userId: user.id } });
      await prisma.keyCache.deleteMany({ where: { userId: user.id } });
    }
    await prisma.user.deleteMany({ where: { email } });
  }
  await prisma.user.deleteMany({ where: { telegramId: { in: [BigInt(TG), BigInt(OTHER_TG)] } } });
}

describe("link token shape helpers (pure)", () => {
  it("parses link payloads and rejects everything else", () => {
    const good = "a".repeat(48);
    expect(parseLinkStartPayload(`link_${good}`)).toBe(good);
    expect(parseLinkStartPayload(`login_${good}`)).toBeNull();
    expect(parseLinkStartPayload("/start")).toBeNull();
    expect(parseLinkStartPayload("link_short")).toBeNull();
    expect(parseLinkStartPayload(undefined)).toBeNull();
  });

  it("builds the deep link", () => {
    expect(buildBotLinkUrl("mybot", "a".repeat(48))).toBe(
      `https://t.me/mybot?start=link_${"a".repeat(48)}`,
    );
  });
});

describe("link-via-bot end to end", () => {
  let userId = 0;

  beforeAll(async () => {
    await cleanup();
    // Bot username resolution (getMe) is stubbed — no network.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({ body: { ok: true, result: { username: "testbot" } } }),
      ),
    );
    // Pure-TG row waiting to be merged + the email account requesting.
    await prisma.user.create({ data: { telegramId: BigInt(TG) }, select: { id: true } });
    const row = await prisma.user.create({
      data: { email: EMAIL, emailCanonical: EMAIL },
      select: { id: true },
    });
    userId = row.id;
    session.token = await signSession(userId, null, SECRET);
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await cleanup();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requests a token, polls pending, binds in bot, consumes with re-mint", async () => {
    const req = await requestPOST();
    expect(req.status).toBe(200);
    const issued = (await req.json()) as { token: string; botUrl: string; expiresInSec: number };
    expect(issued.token).toMatch(/^[0-9a-f]{48}$/);
    expect(issued.botUrl).toContain(`start=link_${issued.token}`);

    const status = await statusPOST(
      new Request("http://localhost/api/auth/email/link/status", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: issued.token }),
      }),
    );
    expect(await status.json()).toEqual({ status: "pending" });

    // Bot side: bind + auto-merge of the pure-TG row.
    const bound = await bindLinkToken(issued.token, TG);
    expect(bound).toMatchObject({ kind: "bound", merged: true, userId });
    await expect(linkTokenStatus(issued.token)).resolves.toBe("ready");

    // Re-bind is idempotent.
    await expect(bindLinkToken(issued.token, TG)).resolves.toMatchObject({ kind: "bound" });

    const consume = await consumePOST(
      new Request("http://localhost/api/auth/email/link/consume", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: issued.token }),
      }),
    );
    expect(consume.status).toBe(200);
    const setCookie = consume.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("3set_session=");
    const value = setCookie.split(";")[0]?.split("=")[1] ?? "";
    await expect(verifySession(value, SECRET)).resolves.toMatchObject({
      userId,
      telegramId: TG,
    });
    // Double consume is rejected.
    const again = await consumePOST(
      new Request("http://localhost/api/auth/email/link/consume", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: issued.token }),
      }),
    );
    expect(again.status).toBe(400);
  });

  it("rejects a Telegram bound to another email account", async () => {
    await prisma.user.create({
      data: { email: OTHER_EMAIL, emailCanonical: OTHER_EMAIL, telegramId: BigInt(OTHER_TG) },
      select: { id: true },
    });
    const issued = await issueLinkToken(userId);
    if (issued.kind !== "issued") throw new Error("throttled in test");
    await expect(bindLinkToken(issued.token, OTHER_TG)).resolves.toMatchObject({
      kind: "conflict",
    });
    // The token stays unbound → still pending, consume reports not_ready.
    await expect(linkTokenStatus(issued.token)).resolves.toBe("pending");
    const consume = await consumeLinkToken(userId, issued.token);
    expect(consume).toMatchObject({ kind: "not_ready" });
  });

  it("isolates foreign tokens and gates auth", async () => {
    session.token = undefined;
    await expect(requestPOST()).resolves.toMatchObject({ status: 401 });

    const issued = await issueLinkToken(userId);
    if (issued.kind !== "issued") throw new Error("throttled in test");
    // Another session polling this token learns nothing.
    const stranger = await prisma.user.create({
      data: { email: `stranger-${RUN}@example.test`, emailCanonical: `stranger-${RUN}@example.test` },
      select: { id: true },
    });
    session.token = await signSession(stranger.id, null, SECRET);
    const status = await statusPOST(
      new Request("http://localhost/api/auth/email/link/status", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: issued.token }),
      }),
    );
    expect(await status.json()).toEqual({ status: "expired" });
    const consume = await consumePOST(
      new Request("http://localhost/api/auth/email/link/consume", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: issued.token }),
      }),
    );
    expect(consume.status).toBe(403);
    await prisma.user.delete({ where: { id: stranger.id } });
    await prisma.telegramLinkToken.deleteMany({ where: { token: issued.token } });
  });
});
