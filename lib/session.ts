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
 * Typed 403 signal for admin-gated routes. Phase 4 has no role model — the
 * allow-list is `ADMIN_TELEGRAM_IDS` (empty/unset = no admins). Routes map this
 * to 404 so a non-admin cannot distinguish a forbidden route from a missing one.
 */
export class AdminError extends Error {
  constructor() {
    super("admin_required");
    this.name = "AdminError";
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

/**
 * Parse the server-only `ADMIN_TELEGRAM_IDS` allow-list. Comma-separated ids;
 * an empty/unset value yields an empty set (no admins). The list itself is
 * never returned to a caller — only membership is exposed.
 */
function adminIdSet(): Set<number> {
  const raw = env.ADMIN_TELEGRAM_IDS;
  if (!raw) return new Set();
  const ids = raw
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => Number(part))
    .filter((n) => Number.isSafeInteger(n));
  return new Set(ids);
}

/** True when `telegramId` is in the admin allow-list. */
export function isAdmin(telegramId: number): boolean {
  return adminIdSet().has(telegramId);
}

/**
 * Resolve the caller's telegram id and require admin membership. Throws
 * SessionError first (401 → unauthorized) then AdminError (403 → 404).
 */
export async function requireAdminSession(): Promise<number> {
  const telegramId = await requireSession();
  if (!isAdmin(telegramId)) throw new AdminError();
  return telegramId;
}
