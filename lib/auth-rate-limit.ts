// Login brute-force guard (D-84, T-06-02, CR-02): per-email + per-IP attempt
// counters with exponential backoff + temporary lock, NO captcha.
//
// DB-backed (`LoginAttempt`, `@@unique([email, ip])`) so counters survive
// restarts. On lock the route returns 429 with the server-computed
// `retryAfterSec`; the client renders `auth.rateLimited` with that number
// (UI-SPEC §1 — the client never fabricates the wait). Successful login
// resets the counter via `resetLoginAttempts`.
//
// CR-02 (T-06-10-02): the per-(email, ip) counter alone can be reset by
// rotating a spoofed source IP, so each attempt ALSO increments an
// account-wide counter stored on the SAME table using the empty-string `ip`
// sentinel (`EMAIL_ONLY_IP`). No schema migration is required — the existing
// `@@unique([email, ip])` already makes `(email, "")` a distinct row. The
// lock is the OR of both counters: the max remaining wait wins.
import { prisma } from "./prisma";

/** Failures before the temporary lock engages. */
const MAX_ATTEMPTS = 5;
/** Base lock duration once MAX_ATTEMPTS is reached (15 min, D-84). */
const LOCK_MS = 15 * 60 * 1000;
/** Escalation ceiling: the lock never exceeds 2h no matter the cycle. */
const LOCK_CAP_MS = 2 * 60 * 60 * 1000;

/**
 * Sentinel `ip` for the account-wide (email-only) counter. The `LoginAttempt`
 * `ip` column defaults to `""`, so this reuses the existing unique without a
 * migration (CR-02).
 */
export const EMAIL_ONLY_IP = "";

export interface RateLimitDecision {
  allowed: boolean;
  /** Present when !allowed: seconds the client must wait (server truth). */
  retryAfterSec?: number;
}

interface AttemptKey {
  email: string;
  ip: string;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Account-wide key: the per-email counter is IP-independent (CR-02). */
function perEmailKey(email: string): AttemptKey {
  return { email: normalizeEmail(email), ip: EMAIL_ONLY_IP };
}

/**
 * Both counters for one attempt. When the caller's `ip` is already the
 * sentinel (degenerate), only the account-wide key is used so a single
 * attempt never double-increments the same row.
 */
function attemptKeys(email: string, ip: string): AttemptKey[] {
  const perEmail = perEmailKey(email);
  if (ip === EMAIL_ONLY_IP) return [perEmail];
  return [{ email: perEmail.email, ip }, perEmail];
}

function retryAfterFromRecord(lockedUntil: Date | null): number {
  if (lockedUntil) {
    return Math.max(1, Math.ceil((lockedUntil.getTime() - Date.now()) / 1000));
  }
  return 1;
}

/**
 * Pre-auth gate for POST login. Normalizes the key (email trim+lowercase,
 * ip as-is) and evaluates BOTH the `(email, ip)` row and the
 * `(email, EMAIL_ONLY_IP)` account row. If either is locked → the larger
 * remaining wait. Never throws on DB garbage — fail-open is NOT used;
 * unexpected DB errors propagate so the route maps them to generic 500
 * (never a silent bypass).
 */
export async function checkLoginRateLimit(email: string, ip: string): Promise<RateLimitDecision> {
  const keys = attemptKeys(email, ip);
  const records = await prisma.loginAttempt.findMany({
    where: { OR: keys.map((key) => ({ email: key.email, ip: key.ip })) },
    select: { lockedUntil: true },
  });
  const now = Date.now();
  let maxRetryAfterSec = 0;
  for (const record of records) {
    if (record.lockedUntil && record.lockedUntil.getTime() > now) {
      maxRetryAfterSec = Math.max(maxRetryAfterSec, retryAfterFromRecord(record.lockedUntil));
    }
  }
  if (maxRetryAfterSec > 0) {
    return { allowed: false, retryAfterSec: maxRetryAfterSec };
  }
  return { allowed: true };
}

/**
 * Increment one counter. At MAX_ATTEMPTS it engages the temp lock with
 * exponential backoff (doubling per consecutive lock cycle, capped at 2h);
 * `attempts` keeps counting past MAX while the gate holds the row locked.
 */
async function bumpAttempt(key: AttemptKey): Promise<RateLimitDecision> {
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

/**
 * Record a failed login: increment BOTH counters and engage each lock
 * independently. Returns the account-wide decision — the per-email counter
 * is authoritative (CR-02), so rotating IPs cannot keep it below the lock
 * threshold. The CURRENT failure still maps to the identical 401; the lock
 * bites on the NEXT request.
 */
export async function recordFailedLogin(email: string, ip: string): Promise<RateLimitDecision> {
  const keys = attemptKeys(email, ip);
  let accountDecision: RateLimitDecision = { allowed: true };
  for (const key of keys) {
    const decision = await bumpAttempt(key);
    if (key.ip === EMAIL_ONLY_IP) accountDecision = decision;
  }
  return accountDecision;
}

/**
 * Clear the counters after a successful login (D-84: success resets). Deletes
 * BOTH the `(email, ip)` row and the `(email, EMAIL_ONLY_IP)` account row so
 * a later header rotation cannot ride a stale lock. Uses `deleteMany` (absent
 * rows are a no-op) and does not swallow unexpected driver errors — failures
 * propagate and the route maps them to generic 500 (fail-closed).
 */
export async function resetLoginAttempts(email: string, ip: string): Promise<void> {
  const keys = attemptKeys(email, ip);
  await prisma.loginAttempt.deleteMany({
    where: { OR: keys.map((key) => ({ email: key.email, ip: key.ip })) },
  });
}

// ---------------------------------------------------------------------------
// Registration throttle (WR-02/WR-04, plan 06-13). Registration is both a
// high-volume account-existence oracle and the entry point for alias
// account/trial farming, so it is throttled per TRUSTED CLIENT IP (a farmer
// rotates emails, not the network) with the same DB-backed counter,
// exponential backoff, and temp lock as login (D-84 machinery reused, no
// captcha, no migration). The counter lives in the existing `LoginAttempt`
// table under a namespaced key — `__register__:<ip>` in the `email` column and
// `EMAIL_ONLY_IP` in `ip` — so it never collides with a real login counter.
// ---------------------------------------------------------------------------

/** Namespace prefix isolating register counters from login counters. */
const REGISTER_NAMESPACE = "__register__:";

/** Counter key for one trusted client IP (namespaced; never a real email). */
function registrationKey(ip: string): string {
  return `${REGISTER_NAMESPACE}${ip}`;
}

/**
 * Pre-register gate. Keyed on the trusted `clientIp` (06-10: `X-Real-IP` /
 * last XFF hop — never a client-controlled first hop), so rotating a spoofed
 * header cannot reset a shared bucket (T-06-13-04). Denies with the
 * server-computed `retryAfterSec` once the per-IP lock engages.
 */
export async function checkRegistrationRateLimit(ip: string): Promise<RateLimitDecision> {
  return checkLoginRateLimit(registrationKey(ip), EMAIL_ONLY_IP);
}

/**
 * Record one registration attempt for the trusted IP and return the resulting
 * decision. Called after the gate on every parsed request, so a flood of
 * registrations — successful, duplicate, or alias — still trips the lock.
 */
export async function recordRegistrationAttempt(ip: string): Promise<RateLimitDecision> {
  return recordFailedLogin(registrationKey(ip), EMAIL_ONLY_IP);
}
