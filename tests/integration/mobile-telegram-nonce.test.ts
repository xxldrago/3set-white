// Mobile Telegram deep-link nonce flow (Phase 18 UAT gap #1).
//
// Regression guard for the P0 found in UAT #4: the app issues a `nonce_<32hex>`
// token and the bot must bind it, otherwise `telegram/poll` stays 202 forever.
// Exercises parse → bind → poll (202 → 200 token pair) against real Postgres,
// plus every rejection path: cabinet `link_` tokens, re-aimed nonces, expiry,
// double consumption, and the other start-payload branches.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NextRequest } from "next/server";

import { GET as pollGET } from "../../app/api/mobile/auth/telegram/poll/route";
import { POST as noncePOST } from "../../app/api/mobile/auth/telegram/nonce/route";
import { prisma } from "../../lib/prisma";
import {
  bindMobileNonce,
  NONCE_PREFIX,
  NONCE_TOKEN_SHAPE,
  parseNonceStartPayload,
} from "../../lib/telegram-mobile-nonce";
import { LOGIN_START_PREFIX } from "../../lib/telegram-login";
import { LINK_START_PREFIX } from "../../lib/telegram-link";

const TG = 960000801;
const OTHER_TG = 960000802;

function pollReq(nonce: string): Promise<Response> {
  return pollGET(
    new Request(
      `http://localhost/api/mobile/auth/telegram/poll?nonce=${nonce}`,
    ) as unknown as NextRequest,
  );
}

async function cleanup(): Promise<void> {
  await prisma.telegramLinkToken.deleteMany({});
  for (const tg of [TG, OTHER_TG]) {
    const user = await prisma.user.findUnique({
      where: { telegramId: BigInt(tg) },
      select: { id: true },
    });
    if (user) {
      await prisma.outbox.deleteMany({ where: { order: { userId: user.id } } });
      await prisma.order.deleteMany({ where: { userId: user.id } });
      await prisma.keyCache.deleteMany({ where: { userId: user.id } });
    }
  }
  await prisma.user.deleteMany({
    where: { telegramId: { in: [BigInt(TG), BigInt(OTHER_TG)] } },
  });
}

/** Issue a nonce through the real route so shape/TTL can never drift. */
async function issueNonce(): Promise<string> {
  const res = await noncePOST();
  expect(res.status).toBe(200);
  const body = (await res.json()) as { nonce: string };
  expect(NONCE_TOKEN_SHAPE.test(body.nonce)).toBe(true);
  return body.nonce;
}

beforeAll(cleanup);
afterAll(cleanup);

describe("parseNonceStartPayload", () => {
  it("accepts only nonce_ payloads", () => {
    const nonce = `${NONCE_PREFIX}${"a".repeat(32)}`;
    expect(parseNonceStartPayload(nonce)).toBe(nonce);
  });

  it("rejects the other /start branches and malformed tokens", () => {
    for (const payload of [
      undefined,
      null,
      "",
      "3SET-ABC123",
      `${LOGIN_START_PREFIX}${"b".repeat(48)}`,
      `${LINK_START_PREFIX}${"c".repeat(48)}`,
      `${NONCE_PREFIX}short`,
      `${NONCE_PREFIX}${"z".repeat(32)}`, // non-hex
      `${NONCE_PREFIX}${"a".repeat(31)}`,
    ]) {
      expect(parseNonceStartPayload(payload as string | null | undefined)).toBeNull();
    }
  });
});

describe("mobile nonce round trip", () => {
  it("poll is pending until the bot binds, then returns a token pair", async () => {
    const nonce = await issueNonce();

    const pending = await pollReq(nonce);
    expect(pending.status).toBe(202);
    expect(await pending.json()).toEqual({ status: "pending" });

    const bound = await bindMobileNonce(nonce, TG);
    expect(bound).toEqual({ kind: "bound", alreadyBound: false });

    const ok = await pollReq(nonce);
    expect(ok.status).toBe(200);
    const body = (await ok.json()) as {
      tokenPair?: { accessToken?: string; refreshToken?: string };
    };
    expect(typeof body.tokenPair?.accessToken).toBe("string");
    expect(typeof body.tokenPair?.refreshToken).toBe("string");
  });

  it("creates the user row for the authorizing Telegram id", async () => {
    const nonce = await issueNonce();
    await bindMobileNonce(nonce, TG);
    const res = await pollReq(nonce);
    expect(res.status).toBe(200);
    const user = await prisma.user.findUnique({
      where: { telegramId: BigInt(TG) },
      select: { id: true },
    });
    expect(user).not.toBeNull();
  });

  it("is single-use: a second poll is 409", async () => {
    const nonce = await issueNonce();
    await bindMobileNonce(nonce, TG);
    expect((await pollReq(nonce)).status).toBe(200);
    expect((await pollReq(nonce)).status).toBe(409);
  });

  it("rebinding the same Telegram id is idempotent", async () => {
    const nonce = await issueNonce();
    expect(await bindMobileNonce(nonce, TG)).toEqual({ kind: "bound", alreadyBound: false });
    expect(await bindMobileNonce(nonce, TG)).toEqual({ kind: "bound", alreadyBound: true });
  });

  it("refuses to re-aim a bound nonce at a different Telegram id", async () => {
    const nonce = await issueNonce();
    await bindMobileNonce(nonce, TG);
    expect(await bindMobileNonce(nonce, OTHER_TG)).toEqual({ kind: "invalid" });
    // The original binding still wins.
    expect((await pollReq(nonce)).status).toBe(200);
  });

  it("rejects an expired nonce", async () => {
    const nonce = await issueNonce();
    await prisma.telegramLinkToken.update({
      where: { token: nonce },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(await bindMobileNonce(nonce, TG)).toEqual({ kind: "invalid" });
    expect((await pollReq(nonce)).status).toBe(410);
  });

  it("rejects a consumed nonce", async () => {
    const nonce = await issueNonce();
    await prisma.telegramLinkToken.update({
      where: { token: nonce },
      data: { consumedAt: new Date() },
    });
    expect(await bindMobileNonce(nonce, TG)).toEqual({ kind: "invalid" });
  });

  it("never binds a cabinet link_ token that already has a userId", async () => {
    // A `link_` row belongs to an authenticated cabinet account; a mobile nonce
    // must not be able to attach itself to it.
    const token = `${NONCE_PREFIX}${"d".repeat(32)}`;
    const owner = await prisma.user.create({
      data: { email: `nonce-owner-${Date.now().toString(36)}@example.test` },
      select: { id: true },
    });
    await prisma.telegramLinkToken.create({
      data: { token, userId: owner.id, expiresAt: new Date(Date.now() + 60_000) },
    });
    expect(await bindMobileNonce(token, TG)).toEqual({ kind: "invalid" });
    const row = await prisma.telegramLinkToken.findUnique({
      where: { token },
      select: { telegramId: true },
    });
    expect(row?.telegramId).toBeNull();
    await prisma.user.delete({ where: { id: owner.id } });
  });

  it("rejects unknown and malformed tokens", async () => {
    expect(await bindMobileNonce(`${NONCE_PREFIX}${"e".repeat(32)}`, TG)).toEqual({
      kind: "invalid",
    });
    expect(await bindMobileNonce("not-a-nonce", TG)).toEqual({ kind: "invalid" });
  });
});
