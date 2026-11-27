// Mobile Telegram deep-link nonce binding (Phase 18 UAT gap #1).
//
// Handshake (nonce-only, per SEED-001 / REQ-AUTH-03):
//   1. The mobile app calls `POST /api/mobile/auth/telegram/nonce` and receives
//      `nonce_<32 hex>`, stored as a `telegram_link_tokens` row with BOTH
//      `user_id` and `telegram_id` null.
//   2. The app opens `t.me/<bot>?start=nonce_<...>`; the bot's `/start` handler
//      parses the payload here and stamps `telegram_id` via `bindMobileNonce`.
//   3. The app polls `GET /api/mobile/auth/telegram/poll?nonce=...`, which flips
//      from 202 pending to 200 with a token pair once `telegram_id` is set.
//
// Security posture: the nonce is a bearer secret, but the row is deliberately
// created with `user_id = null` and this module refuses any row that has one.
// So a leaked nonce lets an attacker authenticate only the Telegram account
// THEY control — it cannot be used to attach to, or hijack, an existing
// cabinet account. That is why no bot-delivered confirmation code is required
// (unlike the `login_` flow in lib/telegram-login.ts, where the token is bound
// to an existing browser session). Bind is single-winner and idempotent for the
// same Telegram id; a different id is rejected so a nonce cannot be re-aimed.
import { prisma } from "./prisma";

/** Start-parameter prefix. */
export const NONCE_PREFIX = "nonce_";
/** 16 random bytes → 32 hex chars. */
export const NONCE_BYTES = 16;
/** Nonce lifetime: 10 minutes (matches the route's TTL). */
export const NONCE_TTL_MS = 10 * 60 * 1000;
/** Issued token shape, including the prefix. */
export const NONCE_TOKEN_SHAPE = /^nonce_[0-9a-f]{32}$/;

export type BindMobileNonceResult =
  | { kind: "bound"; alreadyBound: boolean }
  | { kind: "invalid" };

/**
 * Extract a mobile nonce from a bot `/start` payload. Returns null for every
 * other payload (`login_`, `link_`, referral codes, plain starts) and for
 * malformed tokens, so the caller can fall through to the other branches.
 */
export function parseNonceStartPayload(payload: string | undefined | null): string | null {
  if (typeof payload !== "string") return null;
  return NONCE_TOKEN_SHAPE.test(payload) ? payload : null;
}

/**
 * Bind a mobile nonce to the Telegram user who pressed Start. Rejects unknown,
 * expired, consumed, already-cabinet-bound (`user_id` set) and re-aimed tokens
 * (bound to a different Telegram id). Rebinding the same id is idempotent.
 */
export async function bindMobileNonce(
  token: string,
  telegramId: number,
): Promise<BindMobileNonceResult> {
  if (!NONCE_TOKEN_SHAPE.test(token) || !Number.isFinite(telegramId)) return { kind: "invalid" };
  const now = new Date();
  const tg = BigInt(telegramId);
  const row = await prisma.telegramLinkToken.findUnique({
    where: { token },
    select: { userId: true, telegramId: true, expiresAt: true, consumedAt: true },
  });
  // A cabinet `link_` token carries a userId; never let a mobile nonce bind it.
  if (!row || row.userId !== null) return { kind: "invalid" };
  if (row.expiresAt.getTime() <= now.getTime() || row.consumedAt !== null) {
    return { kind: "invalid" };
  }
  if (row.telegramId !== null) {
    return row.telegramId === tg ? { kind: "bound", alreadyBound: true } : { kind: "invalid" };
  }
  // Atomic single-winner bind: only the null → tg transition wins.
  const { count } = await prisma.telegramLinkToken.updateMany({
    where: { token, telegramId: null, consumedAt: null, expiresAt: { gt: now } },
    data: { telegramId: tg },
  });
  if (count === 1) return { kind: "bound", alreadyBound: false };
  // Lost a race: a same-id winner is still success, anything else is invalid.
  const again = await prisma.telegramLinkToken.findUnique({
    where: { token },
    select: { telegramId: true, consumedAt: true },
  });
  if (again && again.consumedAt === null && again.telegramId === tg) {
    return { kind: "bound", alreadyBound: true };
  }
  return { kind: "invalid" };
}
