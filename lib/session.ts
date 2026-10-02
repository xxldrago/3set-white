// Route-side session gate (D-26 shared discipline).
//
// Thin wrapper over the pure lib/auth.ts module: read the httpOnly session
// cookie, verify it with the server secret, and return the caller's telegram
// id. Never change lib/auth.ts — it stays a pure module unit tests import
// without a Next runtime.
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "./auth";
import { env } from "./env";

/** Typed 401 signal routes catch and map to a generic unauthorized response. */
export class SessionError extends Error {
  constructor() {
    super("session_required");
    this.name = "SessionError";
  }
}

/**
 * Resolve the caller's telegram id or throw SessionError. The id is resolved
 * server-side from the signed cookie — routes must never trust a
 * client-supplied identifier (T-02-08).
 */
export async function requireSession(): Promise<number> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) throw new SessionError();
  const telegramId = await verifySession(token, env.SESSION_SECRET);
  if (telegramId === null) throw new SessionError();
  return telegramId;
}
