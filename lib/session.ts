// Route-side session gate (D-26 shared discipline, Phase 6 D-82).
//
// Thin wrapper over the pure lib/auth.ts module: read the httpOnly session
// cookie, verify it with the server secret, and return the caller's identity.
// Phase 6 subject is the `users.id` row (userId); `telegramId` is optional
// (null on email-only accounts). Legacy tid-only tokens resolve the userId
// server-side via the `User.telegramId` row — never from client input.
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "./auth";
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
 * Resolve the caller's userId (+ telegramId when linked) or throw
 * SessionError. The id is resolved server-side from the signed cookie —
 * routes must never trust a client-supplied identifier (T-02-08).
 */
export async function requireSession(): Promise<SessionIdentity> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) throw new SessionError();
  const claims = await verifySession(token, env.SESSION_SECRET);
  if (claims === null) throw new SessionError();
  if (claims.userId !== null) return { userId: claims.userId, telegramId: claims.telegramId };
  // Legacy tid-only token: resolve the userId via the telegram row.
  if (claims.telegramId === null) throw new SessionError();
  const user = await prisma.user.findUnique({
    where: { telegramId: BigInt(claims.telegramId) },
    select: { id: true },
  });
  if (!user) throw new SessionError();
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
  const claims = await verifySession(token, env.SESSION_SECRET);
  if (claims === null || claims.telegramId === null) throw new SessionError();
  return claims.telegramId;
}
