// Route-side session gate (D-26 shared discipline, Phase 6 D-82; WR-01
// revocation). Thin wrapper over the pure lib/auth.ts module: read the
// httpOnly session cookie, verify it with the server secret, and return the
// caller's identity. Phase 6 subject is the `users.id` row (userId);
// `telegramId` is optional (null on email-only accounts). Legacy tid-only
// tokens resolve the userId server-side via the `User.telegramId` row —
// never from client input.
//
// Revocation watermark (WR-01/T-06-11-01): every gate also compares the
// token's second-truncated `iat` against `User.credentialsChangedAt` and
// throws `SessionError` when the token predates a rotation.
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionWithIssuedAt } from "./auth";
import { env } from "./env";
import { prisma } from "./prisma";

/** Typed 401 signal routes catch and map to a generic unauthorized response. */
export class SessionError extends Error {
  constructor() {
    super("session_required");
    this.name = "SessionError";
  }
}

/** Typed signal for role-gated routes; handlers map it to an indistinguishable 404. */
export class AdminError extends Error {
  constructor() {
    super("admin_required");
    this.name = "AdminError";
  }
}

/** Phase 6 session identity (D-82): userId subject, telegramId optional. */
export interface SessionIdentity {
  userId: number;
  telegramId: number | null;
}

/**
 * Watermark test (WR-01): a token is revoked when its second-truncated issue
 * time is strictly before the floored `credentialsChangedAt`. jose `iat` is
 * second-granular while the watermark carries milliseconds, so a token
 * re-minted in the same second as the bump is accepted (strict `<`); null
 * `iat` on a rotated account is treated as revoked (no provable issue time).
 */
function isRevoked(
  issuedAt: number | null,
  credentialsChangedAt: Date | null,
): boolean {
  if (credentialsChangedAt === null) return false;
  const floored = Math.floor(credentialsChangedAt.getTime() / 1000);
  return issuedAt === null || issuedAt < floored;
}

/**
 * Resolve the caller's userId (+ telegramId when linked) or throw
 * SessionError. The id is resolved server-side from the signed cookie —
 * routes must never trust a client-supplied identifier (T-02-08). Tokens
 * issued before the account's credential watermark are rejected.
 */
export async function requireSession(): Promise<SessionIdentity> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) throw new SessionError();
  const claims = await verifySessionWithIssuedAt(token, env.SESSION_SECRET);
  if (claims === null) throw new SessionError();
  if (claims.userId !== null) {
    const user = await prisma.user.findUnique({
      where: { id: claims.userId },
      select: { id: true, credentialsChangedAt: true },
    });
    if (user && isRevoked(claims.issuedAt, user.credentialsChangedAt)) {
      throw new SessionError();
    }
    return { userId: claims.userId, telegramId: claims.telegramId };
  }
  // Legacy tid-only token: resolve the userId via the telegram row.
  if (claims.telegramId === null) throw new SessionError();
  const user = await prisma.user.findUnique({
    where: { telegramId: BigInt(claims.telegramId) },
    select: { id: true, credentialsChangedAt: true },
  });
  if (!user) throw new SessionError();
  if (isRevoked(claims.issuedAt, user.credentialsChangedAt)) throw new SessionError();
  return { userId: user.id, telegramId: claims.telegramId };
}

/**
 * Telegram-keyed compat gate for pre-Phase-6 routes (keys/orders/trial/
 * tickets/admin): same 401 discipline, but throws SessionError when the
 * session carries no telegramId (email-only accounts link Telegram in
 * plan 06-02 before these surfaces apply).
 *
 * The tid resolves straight from the verified claims — no users-row lookup:
 * these routes key everything by telegram id, exactly as before Phase 6, so
 * legacy tid-only sessions keep working byte-for-byte (D-82 back-compat).
 */
export async function requireTelegramSession(): Promise<number> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) throw new SessionError();
  const claims = await verifySessionWithIssuedAt(token, env.SESSION_SECRET);
  if (claims === null || claims.telegramId === null) throw new SessionError();
  // Apply the same revocation watermark (resolve the account by telegramId).
  // A missing row cannot carry a watermark — legacy tid sessions for unknown
  // rows keep working exactly as before (D-82).
  const user = await prisma.user.findUnique({
    where: { telegramId: BigInt(claims.telegramId) },
    select: { credentialsChangedAt: true },
  });
  if (user && isRevoked(claims.issuedAt, user.credentialsChangedAt)) {
    throw new SessionError();
  }
  return claims.telegramId;
}
