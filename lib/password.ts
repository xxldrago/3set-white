// Email-auth password hashing (D-83/D-85, T-06-01).
//
// Argon2id with OWASP-recommended parameters. Server-only: `argon2` ships
// native bindings — never import this module from client components.
// Mirror discipline of `timingSafeEqualHex` in lib/auth.ts: verification
// returns boolean and never throws on garbage input.
import argon2 from "argon2";

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 256;

/** OWASP Argon2id defaults: 19 MiB memory, 2 iterations, 1 lane. */
const HASH_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

/**
 * Hash a plaintext password. Enforces min-8 server-side as defense-in-depth
 * (routes ALSO validate via zod at the boundary). Throws on policy
 * violation — callers map it to 400, never to an auth oracle.
 */
export async function hashPassword(plain: string): Promise<string> {
  if (typeof plain !== "string" || plain.length < PASSWORD_MIN_LENGTH) {
    throw new Error("password_too_short");
  }
  if (plain.length > PASSWORD_MAX_LENGTH) {
    throw new Error("password_too_long");
  }
  return argon2.hash(plain, HASH_OPTIONS);
}

/**
 * Verify a plaintext candidate against a stored hash. Returns boolean, never
 * throws — garbage hash / garbage input → false (same discipline as
 * `timingSafeEqualHex`: no error oracle, no DoS via crafted input).
 */
export async function verifyPassword(hash: unknown, plain: unknown): Promise<boolean> {
  if (typeof hash !== "string" || hash.length === 0) return false;
  if (typeof plain !== "string" || plain.length === 0) return false;
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

/**
 * Precomputed Argon2id hash of a fixed dummy secret, used for the
 * equal-cost path on unknown emails (T-06-01): login runs a real verify
 * even when no row exists, so wrong-email and wrong-password cost the same
 * and timing reveals nothing about account existence.
 */
const DUMMY_HASH =
  "$argon2id$v=19$m=19456,p=1,t=2$Q7MFmVaS5PTaQoXyqbtjhw$bpGYbdBKt8STQEh6bAlCMhS2lW3F3gCgWlfHSWDZtP8";

/** Burn ~one verify worth of time without a user row (never throws). */
export async function dummyVerify(plain: string): Promise<void> {
  try {
    await argon2.verify(DUMMY_HASH, typeof plain === "string" ? plain : "dummy");
  } catch {
    // Expected: the candidate never matches the dummy hash. Cost burned.
  }
}
