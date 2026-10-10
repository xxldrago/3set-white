// Bot deep-link Telegram linking (link-via-bot).
//
// Replaces the Login Widget in the cabinet link flow (the widget asks for a
// phone number and renders its own dark button): the user taps through to
// the bot, and binding happens automatically inside Telegram.
//
// Handshake:
//   1. Authenticated cabinet calls `issueLinkToken(userId)` → one-time token
//      + `t.me/<bot>?start=link_<token>`.
//   2. User opens the link; the bot binds the token to their Telegram id via
//      `bindLinkToken` AND links the accounts immediately (`linkAccounts`).
//   3. The cabinet polls `linkTokenStatus`; on `ready` it calls
//      `consumeLinkToken`, which verifies the token belongs to the session
//      user, marks it consumed, and returns the linked identity for a
//      session re-mint (privilege change, same as the widget route).
//
// Fixation discipline: consume requires the session user to equal the
// token's requesting userId, and bind refuses a Telegram already bound to
// another email account (`conflict`, nothing merges — T-06-05). So tricking
// someone into opening your link cannot steal their identity: an already
// linked Telegram is rejected, and an unlinked one attaches with the victim
// able to unlink at any time. No confirmation code is needed (unlike the
// anonymous login flow): the requesting browser is already authenticated,
// and the Telegram proof arrives from inside Telegram itself.
import { randomBytes } from "node:crypto";
import { AccountConflictError, linkAccounts } from "./accounts";
import { prisma } from "./prisma";
import { resolveBotUsername } from "./telegram-login";

/** Token lifetime: 10 minutes (same as the login flow). */
export const LINK_TOKEN_TTL_MS = 10 * 60 * 1000;
/** 24 random bytes → 48 hex chars (fits Telegram's 64-byte start-param cap). */
const LINK_TOKEN_BYTES = 24;
/** Issued token shape. */
export const LINK_TOKEN_SHAPE = /^[0-9a-f]{48}$/;
/** Start-parameter prefix. */
export const LINK_START_PREFIX = "link_";
/** Per-user issuance throttle: max N tokens per rolling hour. */
const THROTTLE_MAX = 20;
const THROTTLE_WINDOW_MS = 60 * 60 * 1000;

export type LinkStatus = "pending" | "ready" | "consumed" | "expired";

function token(): string {
  return randomBytes(LINK_TOKEN_BYTES).toString("hex");
}

/**
 * Extract a link token from a bot `/start` payload. Null for anything else
 * (login payloads, plain starts, malformed tokens).
 */
export function parseLinkStartPayload(payload: string | undefined | null): string | null {
  if (typeof payload !== "string" || !payload.startsWith(LINK_START_PREFIX)) return null;
  const value = payload.slice(LINK_START_PREFIX.length);
  return LINK_TOKEN_SHAPE.test(value) ? value : null;
}

/** Deep link the cabinet shows/opens: t.me/<username>?start=link_<token>. */
export function buildBotLinkUrl(username: string, linkToken: string): string {
  return `https://t.me/${username}?start=${LINK_START_PREFIX}${linkToken}`;
}

export type IssueLinkTokenResult =
  | { kind: "issued"; token: string; botUrl: string; expiresInSec: number }
  | { kind: "throttled"; retryAfterSec: number };

/**
 * Issue a link token for the session account. Prunes expired rows and caps
 * issuance per rolling hour (same discipline as the login flow).
 */
export async function issueLinkToken(userId: number): Promise<IssueLinkTokenResult> {
  const now = new Date();
  await prisma.telegramLinkToken.deleteMany({
    where: { userId, expiresAt: { lte: now } },
  });
  const recent = await prisma.telegramLinkToken.count({
    where: { userId, createdAt: { gt: new Date(now.getTime() - THROTTLE_WINDOW_MS) } },
  });
  if (recent >= THROTTLE_MAX) {
    return { kind: "throttled", retryAfterSec: Math.ceil(THROTTLE_WINDOW_MS / 1000) };
  }
  const value = token();
  await prisma.telegramLinkToken.create({
    data: {
      token: value,
      userId,
      expiresAt: new Date(now.getTime() + LINK_TOKEN_TTL_MS),
    },
  });
  const username = await resolveBotUsername();
  if (!username) throw new Error("telegram-link:no_bot_username");
  return {
    kind: "issued",
    token: value,
    botUrl: buildBotLinkUrl(username, value),
    expiresInSec: Math.floor(LINK_TOKEN_TTL_MS / 1000),
  };
}

export type BindLinkTokenResult =
  | { kind: "bound"; merged: boolean; userId: number }
  | { kind: "invalid" }
  | { kind: "conflict" };

/**
 * Bot-side bind + immediate link. Called from inside Telegram, so the
 * Telegram id is proven; the token proves the cabinet session that requested
 * it. Idempotent for the same identity; a Telegram bound to another email
 * account → `conflict` (nothing merges, T-06-05).
 */
export async function bindLinkToken(
  linkToken: string,
  telegramId: number,
): Promise<BindLinkTokenResult> {
  if (!LINK_TOKEN_SHAPE.test(linkToken)) return { kind: "invalid" };
  const row = await prisma.telegramLinkToken.findUnique({
    where: { token: linkToken },
    select: { userId: true, telegramId: true, expiresAt: true, consumedAt: true },
  });
  if (!row || row.consumedAt !== null || row.expiresAt.getTime() <= Date.now()) {
    return { kind: "invalid" };
  }
  // Same identity re-opening the link: nothing to do.
  if (row.telegramId !== null) {
    return row.telegramId === BigInt(telegramId)
      ? { kind: "bound", merged: false, userId: row.userId }
      : { kind: "invalid" };
  }
  try {
    const result = await linkAccounts({ userId: row.userId, telegramId });
    await prisma.telegramLinkToken.update({
      where: { token: linkToken },
      data: { telegramId: BigInt(telegramId) },
    });
    return { kind: "bound", merged: result.merged, userId: result.userId };
  } catch (err) {
    if (err instanceof AccountConflictError) {
      return { kind: "conflict" };
    }
    throw err;
  }
}

/** Read-only poll state for the cabinet (never mints, never merges). */
export async function linkTokenStatus(linkToken: string): Promise<LinkStatus> {
  if (!LINK_TOKEN_SHAPE.test(linkToken)) return "expired";
  const row = await prisma.telegramLinkToken.findUnique({
    where: { token: linkToken },
    select: { telegramId: true, expiresAt: true, consumedAt: true },
  });
  if (!row || row.expiresAt.getTime() <= Date.now()) return "expired";
  if (row.consumedAt !== null) return "consumed";
  return row.telegramId !== null ? "ready" : "pending";
}

export type ConsumeLinkTokenResult =
  | { kind: "ok"; userId: number; telegramId: number }
  | { kind: "forbidden" }
  | { kind: "not_ready" }
  | { kind: "invalid" };

/**
 * Session-gated consume: the token must belong to the caller and carry a
 * bound Telegram id. Atomically marks consumed and returns the identity for
 * a session re-mint (privilege change follow-through).
 */
export async function consumeLinkToken(
  userId: number,
  linkToken: string,
): Promise<ConsumeLinkTokenResult> {
  if (!LINK_TOKEN_SHAPE.test(linkToken)) return { kind: "invalid" };
  const row = await prisma.telegramLinkToken.findUnique({
    where: { token: linkToken },
    select: { userId: true, telegramId: true, expiresAt: true, consumedAt: true },
  });
  if (!row || row.userId !== userId) return { kind: "forbidden" };
  if (row.expiresAt.getTime() <= Date.now() || row.consumedAt !== null) {
    return { kind: "invalid" };
  }
  if (row.telegramId === null) return { kind: "not_ready" };
  const claimed = await prisma.telegramLinkToken.updateMany({
    where: { token: linkToken, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  if (claimed.count === 0) return { kind: "invalid" };
  return { kind: "ok", userId: row.userId, telegramId: Number(row.telegramId) };
}
