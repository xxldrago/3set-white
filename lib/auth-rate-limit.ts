// Login brute-force guard (D-84, T-06-02): per-email + per-IP attempt
// counters with exponential backoff + temporary lock, NO captcha.
//
// DB-backed (`LoginAttempt`, `@@unique([email, ip])`) so counters survive
// restarts. On lock the route returns 429 with the server-computed
// `retryAfterSec`; the client renders `auth.rateLimited` with that number
// (UI-SPEC §1 — the client never fabricates the wait). Successful login
// resets the counter via `resetLoginAttempts`.
import { prisma } from "./prisma";

/** Failures before the temporary lock engages. */
const MAX_ATTEMPTS = 5;
/** Base lock duration once MAX_ATTEMPTS is reached (15 min, D-84). */
const LOCK_MS = 15 * 60 * 1000;
/** Escalation ceiling: the lock never exceeds 2h no matter the cycle. */
const LOCK_CAP_MS = 2 * 60 * 60 * 1000;

export interface RateLimitDecision {
  allowed: boolean;
  /** Present when !allowed: seconds the client must wait (server truth). */
  retryAfterSec?: number;
}

function retryAfterFromRecord(attempts: number, lockedUntil: Date | null): number {
  if (lockedUntil) {
    return Math.max(1, Math.ceil((lockedUntil.getTime() - Date.now()) / 1000));
  }
  return 1;
}

/**
 * Pre-auth gate for POST login. Normalizes the key (email trim+lowercase,
 * ip as-is). Locked → `{ allowed: false, retryAfterSec }`; otherwise
 * `{ allowed: true }`. Never throws on DB garbage — fail-open is NOT used;
 * unexpected DB errors propagate so the route maps them to generic 500
 * (never a silent bypass).
 */
export async function checkLoginRateLimit(email: string, ip: string): Promise<RateLimitDecision> {
  const key = { email: email.trim().toLowerCase(), ip };
  const record = await prisma.loginAttempt.findUnique({
    where: { email_ip: key },
    select: { attempts: true, lockedUntil: true },
  });
  if (!record) return { allowed: true };
  if (record.lockedUntil && record.lockedUntil.getTime() > Date.now()) {
    return { allowed: false, retryAfterSec: retryAfterFromRecord(0, record.lockedUntil) };
  }
  return { allowed: true };
}

/**
 * Record a failed login: increment the counter; at MAX_ATTEMPTS engage the
 * temp lock and report 429 + retryAfterSec. The lock duration doubles with
 * every consecutive lock cycle (exponential backoff, D-84), capped at 2h —
 * `attempts` keeps counting past MAX while the gate holds the row locked,
 * so each post-expiry failure escalates. Returns the post-attempt decision
 * (allowed with no retryAfter until the lock engages). The CURRENT failure
 * still maps to the identical 401 — the lock bites on the NEXT request.
 */
export async function recordFailedLogin(email: string, ip: string): Promise<RateLimitDecision> {
  const key = { email: email.trim().toLowerCase(), ip };
  const existing = await prisma.loginAttempt.findUnique({
    where: { email_ip: key },
    select: { attempts: true },
  });
  const attempts = (existing?.attempts ?? 0) + 1;
  if (attempts >= MAX_ATTEMPTS) {
    const lockMs = Math.min(LOCK_MS * 2 ** (attempts - MAX_ATTEMPTS), LOCK_CAP_MS);
    const lockedUntil = new Date(Date.now() + lockMs);
    await prisma.loginAttempt.upsert({
      where: { email_ip: key },
      update: { attempts, lockedUntil },
      create: { ...key, attempts, lockedUntil },
    });
    return { allowed: false, retryAfterSec: Math.ceil(lockMs / 1000) };
  }
  await prisma.loginAttempt.upsert({
    where: { email_ip: key },
    update: { attempts, lockedUntil: null },
    create: { ...key, attempts },
  });
  return { allowed: true };
}

/** Clear the counter after a successful login (D-84: success resets). */
export async function resetLoginAttempts(email: string, ip: string): Promise<void> {
  try {
    await prisma.loginAttempt.delete({
      where: { email_ip: { email: email.trim().toLowerCase(), ip } },
    });
  } catch {
    // Absent row (first login) — nothing to reset.
  }
}
