// Bot-redirect login service (G-06-4b, D-86 analogue, plan 06-06). Server-only.
//
// Handshake:
//   1. Cabinet calls `issueLoginToken(ip)` → one-time token + an HMAC claim
//      that only the issuing browser receives (httpOnly claim cookie).
//   2. User opens `t.me/<bot>?start=login_<token>`; the bot binds the token to
//      their Telegram id via `bindLoginToken`.
//   3. The issuing browser polls `status`, then `consumeLoginToken` atomically
//      marks the token used and mints the standard httpOnly session.
//
// Fixation discipline (T-06-06-01): consume requires the claim cookie, so only
// the browser that requested the token can exchange it. Replay discipline
// (T-06-06-02): exactly one atomic consume wins; the bind is idempotent for the
// same Telegram id and rejects a different one. No-oracle discipline
// (T-06-06-03): status maps unknown AND expired to `expired`. Garbage input
// never throws (mirrors lib/auth.ts compare discipline).
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "./env";
import { prisma } from "./prisma";

/** Token lifetime (plan 06-06): 10 minutes. */
export const LOGIN_TOKEN_TTL_MS = 10 * 60 * 1000;
/** 24 random bytes → 48 hex chars (fits Telegram's 64-byte start-param cap). */
const LOGIN_TOKEN_BYTES = 24;
/** Issued token shape. */
export const LOGIN_TOKEN_SHAPE = /^[0-9a-f]{48}$/;
/** Start-parameter prefix. */
export const LOGIN_START_PREFIX = "login_";
/** httpOnly claim cookie name (scoped to the bot-login routes). */
export const LOGIN_CLAIM_COOKIE = "tg_login_claim";
/** Per-IP issuance throttle: max N tokens per rolling hour (T-06-06-04). */
const THROTTLE_MAX = 20;
const THROTTLE_WINDOW_MS = 60 * 60 * 1000;

export interface LoginProfile {
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
  chatId?: bigint | null;
}

export type IssueLoginTokenResult =
  | { kind: "issued"; token: string; claim: string; expiresInSec: number }
  | { kind: "throttled"; retryAfterSec: number };

export type BindLoginTokenResult = { kind: "bound" } | { kind: "invalid" };

export type ConsumeLoginTokenResult =
  | { kind: "ok"; userId: number; telegramId: number }
  | { kind: "forbidden" }
  | { kind: "not_ready" }
  | { kind: "invalid" };

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Claim = HMAC_SHA256(token, secret) hex. Never stored — only the cookie holds it. */
function claimFor(token: string, secret: string): string {
  return createHmac("sha256", secret).update(token).digest("hex");
}

/** Length-guarded timing-safe comparison for equal-length hex strings; garbage → false. */
function safeEqualHex(expected: string, supplied: string | undefined | null): boolean {
  if (typeof supplied !== "string" || supplied.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected, "utf8"), Buffer.from(supplied, "utf8"));
  } catch {
    return false;
  }
}

/**
 * Extract a login token from a bot `/start` payload. Returns null for any
 * non-login payload (the normal welcome path) and for malformed tokens.
 */
export function parseLoginStartPayload(payload: string | undefined | null): string | null {
  if (typeof payload !== "string" || !payload.startsWith(LOGIN_START_PREFIX)) return null;
  const token = payload.slice(LOGIN_START_PREFIX.length);
  return LOGIN_TOKEN_SHAPE.test(token) ? token : null;
}

/** Deep link the cabinet shows/opens: t.me/<username>?start=login_<token>. */
export function buildBotLoginUrl(username: string, token: string): string {
  return `https://t.me/${username}?start=${LOGIN_START_PREFIX}${token}`;
}

/** Serialize the httpOnly claim cookie (scoped to the bot-login routes, 10 min). */
export function buildClaimCookie(claim: string, secure: boolean): string {
  const parts = [
    `${LOGIN_CLAIM_COOKIE}=${claim}`,
    "Path=/api/auth/telegram-bot",
    `Max-Age=${Math.floor(LOGIN_TOKEN_TTL_MS / 1000)}`,
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

// Cached prod/test bot username fallback (getMe). Success is cached; a failure
// is not, so a transient Telegram blip retries on the next request. The
// mode-selected token matches lib/bot.ts (polling → test bot).
let cachedBotUsername: string | null = null;

/**
 * Resolve the bot username for the deep link. Prefers `TELEGRAM_BOT_USERNAME`
 * (owner user_setup); otherwise calls Telegram `getMe` once and caches it.
 * Returns null when neither is available (the route maps it to a generic 500).
 */
export async function resolveBotUsername(fetchImpl: typeof fetch = fetch): Promise<string | null> {
  if (env.TELEGRAM_BOT_USERNAME) return env.TELEGRAM_BOT_USERNAME;
  if (cachedBotUsername) return cachedBotUsername;
  const token = env.BOT_MODE === "polling" ? env.BOT_TEST_TOKEN : env.BOT_TOKEN;
  try {
    const res = await fetchImpl(`https://api.telegram.org/bot${token}/getMe`);
    if (!res.ok) return null;
    const body = (await res.json()) as { ok?: unknown; result?: { username?: unknown } };
    const username =
      body.ok === true && typeof body.result?.username === "string" ? body.result.username : null;
    if (username) cachedBotUsername = username;
    return username;
  } catch {
    return null;
  }
}

/**
 * Issue a one-time login token (T-06-06-04). Per-IP throttle over a rolling
 * hour; the raw IP is never persisted — `ipHash = sha256(ip)`. `secret`
 * defaults to SESSION_SECRET so the claim is a server-only HMAC.
 */
export async function issueLoginToken(
  ip: string,
  secret: string = env.SESSION_SECRET,
): Promise<IssueLoginTokenResult> {
  const ipHash = sha256Hex(ip);
  const cutoff = new Date(Date.now() - THROTTLE_WINDOW_MS);
  const recent = await prisma.telegramLoginToken.findMany({
    where: { ipHash, createdAt: { gt: cutoff } },
    select: { createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  if (recent.length >= THROTTLE_MAX) {
    const oldest = recent[0]?.createdAt ?? new Date();
    const retryAfterSec = Math.max(
      1,
      Math.ceil((oldest.getTime() + THROTTLE_WINDOW_MS - Date.now()) / 1000),
    );
    return { kind: "throttled", retryAfterSec };
  }
  const token = randomBytes(LOGIN_TOKEN_BYTES).toString("hex");
  await prisma.telegramLoginToken.create({
    data: { token, ipHash, expiresAt: new Date(Date.now() + LOGIN_TOKEN_TTL_MS) },
  });
  return {
    kind: "issued",
    token,
    claim: claimFor(token, secret),
    expiresInSec: Math.floor(LOGIN_TOKEN_TTL_MS / 1000),
  };
}

/**
 * Bind a login token to a Telegram id (T-06-06-05). Unknown/expired/consumed
 * tokens and a conflicting existing bind are `invalid` (no oracle). Rebinding
 * the same Telegram id is idempotent. The optional profile stamps display
 * fields on the user row (the bot upserts that row first).
 */
export async function bindLoginToken(
  token: string,
  telegramId: number,
  profile?: LoginProfile,
): Promise<BindLoginTokenResult> {
  if (!LOGIN_TOKEN_SHAPE.test(token) || !Number.isFinite(telegramId)) return { kind: "invalid" };
  const now = new Date();
  const row = await prisma.telegramLoginToken.findUnique({
    where: { token },
    select: { telegramId: true, expiresAt: true, consumedAt: true },
  });
  if (!row || row.consumedAt !== null || row.expiresAt.getTime() <= now.getTime()) {
    return { kind: "invalid" };
  }
  const tg = BigInt(telegramId);
  // A token already bound to a different Telegram id is a replay/spoof attempt.
  if (row.telegramId !== null && row.telegramId !== tg) return { kind: "invalid" };
  if (row.telegramId === null) {
    // Atomic single-winner bind: only the transition null → tg wins.
    const { count } = await prisma.telegramLoginToken.updateMany({
      where: { token, telegramId: null, consumedAt: null, expiresAt: { gt: now } },
      data: { telegramId: tg },
    });
    if (count !== 1) {
      const again = await prisma.telegramLoginToken.findUnique({
        where: { token },
        select: { telegramId: true, consumedAt: true },
      });
      if (!again || again.consumedAt !== null || again.telegramId !== tg) {
        return { kind: "invalid" };
      }
    }
  }
  if (profile) {
    const data: Record<string, string | bigint> = {};
    if (profile.firstName != null) data["firstName"] = profile.firstName;
    if (profile.lastName != null) data["lastName"] = profile.lastName;
    if (profile.username != null) data["username"] = profile.username;
    if (profile.chatId != null) data["chatId"] = profile.chatId;
    if (Object.keys(data).length > 0) {
      // Best-effort profile stamp — never blocks the bind.
      await prisma.user.updateMany({ where: { telegramId: tg }, data }).catch(() => {});
    }
  }
  return { kind: "bound" };
}

/**
 * Consume a login token into a session (T-06-06-01/T-06-06-02). The claim
 * cookie must match the HMAC of the token (`forbidden` otherwise). The atomic
 * `updateMany` marks the token used exactly once; the winner upserts the user
 * row by Telegram id inside the same transaction, so a raced double-consume
 * loses with `not_ready`.
 */
export async function consumeLoginToken(
  token: string,
  claimCookie: string | undefined | null,
  secret: string = env.SESSION_SECRET,
): Promise<ConsumeLoginTokenResult> {
  if (!LOGIN_TOKEN_SHAPE.test(token)) return { kind: "invalid" };
  if (!safeEqualHex(claimFor(token, secret), claimCookie)) return { kind: "forbidden" };
  const now = new Date();
  const row = await prisma.telegramLoginToken.findUnique({
    where: { token },
    select: { telegramId: true, expiresAt: true, consumedAt: true },
  });
  if (!row || row.expiresAt.getTime() <= now.getTime()) return { kind: "not_ready" };
  if (row.consumedAt !== null || row.telegramId === null) return { kind: "not_ready" };
  const telegramId = Number(row.telegramId);
  const userId = await prisma.$transaction(async (tx) => {
    const marked = await tx.telegramLoginToken.updateMany({
      where: { token, consumedAt: null, expiresAt: { gt: now }, telegramId: { not: null } },
      data: { consumedAt: now },
    });
    if (marked.count !== 1) return null;
    const user = await tx.user.upsert({
      where: { telegramId: BigInt(telegramId) },
      update: {},
      create: { telegramId: BigInt(telegramId) },
      select: { id: true },
    });
    return user.id;
  });
  if (userId === null) return { kind: "not_ready" };
  return { kind: "ok", userId, telegramId };
}
