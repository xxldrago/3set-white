---
phase: 06-email-auth
reviewed: 2026-10-05T22:15:48Z
depth: standard
files_reviewed: 7
files_reviewed_list:
  - lib/auth-rate-limit.ts
  - app/api/auth/email/password/request/route.ts
  - app/api/auth/email/login/route.ts
  - tests/integration/reset-login-isolation.test.ts
  - tests/unit/auth-rate-limit.test.ts
  - tests/unit/reset-flow.test.ts
  - tests/integration/session-invalidation.test.ts
findings:
  critical: 0
  warning: 2
  info: 4
  total: 6
status: issues_found
---

# Phase 06: Code Review Report (06-14 reset-lockout DoS gap-closure)

**Reviewed:** 2026-10-05T22:15:48Z
**Depth:** standard
**Files Reviewed:** 7
**Status:** issues_found

## Summary

Fresh adversarial review of the 06-14 gap-closure fix (commits `576e3f3`, `ad8f0cf`) for the unauthenticated reset-request account-lockout DoS (prior review CR-01). I traced the request path end-to-end (route → wrapper → key derivation → DB rows), compared the atomic `bumpAttempt` rewrite against the prior read-modify-write, and audited the cleanup hooks of every suite the rename touches. No Critical or exploitable vulnerability was found; the DoS is resolved and CR-02 is preserved. Two Warnings remain (a non-atomic lock transition and a pre-existing test-residue leak the fix's "no residue" claim does not cover).

**Fix verdicts (confirm/refute):**

- **(1) Reset never touches login's account-wide lock — CONFIRMED.** The route now calls `checkResetRateLimit` / `recordResetAttempt` (`app/api/auth/email/password/request/route.ts:52,67`), which delegate to `checkLoginRateLimit` / `recordFailedLogin` keyed on `resetKey(email) = "__reset__:" + normalizeEmail(email)` (`lib/auth-rate-limit.ts:211-234`). Through `attemptKeys` / `perEmailKey` the only rows this path can read or write are `("__reset__:<email>", <ip>)` and `("__reset__:<email>", "")` (`lib/auth-rate-limit.ts:47-61`). Login's account row remains `(<email>, "")` (`lib/auth-rate-limit.ts:48-50,136-144`), so the two are provably disjoint. `EMAIL_ONLY_IP` is exported for tests but is only a sentinel *value*, not a shared row: the email component of the unique key differs by prefix. No remaining caller feeds a raw email into the login counter from an unauthenticated surface — login is the authenticated path and register uses its own `__register__:` namespace (`lib/auth-rate-limit.ts:171-196`).
- **(2) CR-02 (failed logins still lock account-wide) — PRESERVED.** `app/api/auth/email/login/route.ts` is byte-unchanged; `recordFailedLogin` still iterates `attemptKeys` and bumps the `(email, EMAIL_ONLY_IP)` row (`lib/auth-rate-limit.ts:136-144`). The atomic increment only strengthens it (`tests/unit/auth-rate-limit.test.ts:32-47,90-107`, `tests/integration/reset-login-isolation.test.ts:151-178`).
- **(3) New bug in namespace/wrapper or atomic bump — no correctness/security regression; one robustness gap.** The increment is genuinely atomic (`update: { attempts: { increment: 1 } }` derived from the returned row), but the lock itself is applied by a *second, separate* `update` (`lib/auth-rate-limit.ts:110-124`), so the threshold→locked transition is not atomic (WR-01). No bypass results — see WR-01.
- **(4) Test cleanup — `__reset__:` rows are cleaned, but one pre-existing leak remains.** Every changed suite removes its run-scoped `__reset__:<email>` rows (`reset-flow.test.ts:80-82,247-259`, `session-invalidation.test.ts:129-133`). However the second `describe` in `reset-flow.test.ts` never removes the `__register__:<ip>` rows its five registrations create, and there is no module-level `afterAll` to catch them (WR-02).

**DoS verdict:** **RESOLVED.** Five anonymous reset requests for a known email can no longer deny that account's login. The residual ("reset stays account-wide-lockable inside its own `__reset__:` namespace") is the intended D-84 anti-spam behaviour, is recorded as owner-accepted CR-01-RESIDUAL, and does not touch login.

## Warnings

### WR-01: `bumpAttempt` lock transition is still non-atomic (threshold visible without a lock; escalation lost-update)

**File:** `lib/auth-rate-limit.ts:110-124`

**Issue:** The rewrite correctly makes the *counter* atomic, and the header comment calls the increment "the atomicity boundary" — but the lock is a second statement. `attempts >= MAX_ATTEMPTS` is decided on the value returned by the upsert and then `lockedUntil` is set by an independent `update`. Two concrete consequences:

1. **Threshold-without-lock window.** Between the upsert commit (row now `attempts = 5`) and the follow-up `update` commit, a concurrent `checkLoginRateLimit` reads the row, sees `lockedUntil === null`, and allows the request. The gate keys *only* on `lockedUntil > now` (`lib/auth-rate-limit.ts:86-93`), never on `attempts >= MAX_ATTEMPTS`, so the lock is momentarily invisible. (This does not let an attacker "log in" — a wrong password still fails — but it is a real gap in the control the entry declares atomic.)
2. **Escalation lost-update.** Under a parallel burst, requests that returned attempts `5,6,7,…` each compute a different `lockMs` (15m, 30m, 45m…) and each overwrite `lockedUntil` unconditionally. Whichever `update` lands last wins, so the persisted lock can be the *shortest* of the burst rather than the escalation implied by the highest `attempts`. The cap still holds and a lock is always set, so this weakens rather than defeats the lock.

Severity is WARNING, not BLOCKER: neither path yields a brute-force bypass, they only make the security control slightly less deterministic than documented.

**Fix:** Collapse the transition into the atomic statement so `lockedUntil` is written by the same `ON CONFLICT` update and derived from the post-increment value, e.g.:

```ts
// one statement; set lockedUntil conditionally on the post-increment value
const row = await prisma.loginAttempt.upsert({
  where: { email_ip: key },
  update: {
    attempts: { increment: 1 },
    // CASE WHEN login_attempts.attempts + 1 >= MAX THEN now + lock ELSE lockedUntil END
    // (Prisma can't express this CASE directly — see alternatives below)
  },
  create: { ...key, attempts: 1 },
  select: { attempts: true },
});
```

If keeping two statements, make the lock update monotonic so a shorter lock cannot clobber a longer one:

```ts
await prisma.loginAttempt.updateMany({
  where: { email_ip: key, OR: [{ lockedUntil: null }, { lockedUntil: { lt: lockedUntil } }] },
  data: { lockedUntil },
});
```

and have the gate also deny on a threshold row (`attempts >= MAX_ATTEMPTS`) regardless of `lockedUntil`, closing the visibility window.

### WR-02: `reset-flow.test.ts` second `describe` leaks its `__register__:` counter rows (no prefix cleanup, no module-level afterAll)

**File:** `tests/unit/reset-flow.test.ts:238-261` (and missing hook around `:89-116`)

**Issue:** The module's `cleanup()` deletes `__register__:198.51.<RUN>.` rows via `startsWith` (`tests/unit/reset-flow.test.ts:83-85`), but it is only invoked by the **first** `describe`'s `beforeAll`/`afterAll` (`:90-91,114-116`). The **second** `describe` (`:198-362`) registers `EDGE`, `RL`, `CC`, `WELCOME_FAIL` in its `beforeAll` and `fresh` in its last test — five `__register__:198.51.<RUN>.{2..6}` rows — and its `afterAll` (`:238-261`) deletes only `email in [...]` plus the new `__reset__:` addresses. Since Vitest scopes `afterAll` to its `describe`, the first suite's cleanup runs **before** the second suite registers, so these register rows survive the run. There is no module-level `afterAll` to catch them.

This is **pre-existing from 06-13**, not introduced by 06-14, but it is in this review's scope and it contradicts the plan's stated invariant (06-14-SUMMARY D5 / "leaves no DB residue"). It accumulates one new `__register__:198.51.<octet>.*` prefix per run (octet space is only `Date.now() % 200`); once a future run's octet collides with a leaked, locked prefix, the `beforeAll` registration returns 429 and `expect(seed.status).toBe(200)` / the four `postRegister` assertions fail — a slow-burning flake. (Other suites are correct: `reset-login-isolation.test.ts:84` and `session-invalidation.test.ts:134-136` both clean the prefix.)

**Fix:** Move `cleanup()`'s register-prefix delete into a module-level `afterAll` (or add the same `startsWith: REGISTER_IP_PREFIX` branch to the second `describe`'s `afterAll`):

```ts
// module scope, after both describes
afterAll(async () => {
  await prisma.loginAttempt.deleteMany({
    where: { email: { startsWith: REGISTER_IP_PREFIX } },
  });
});
```

## Info

### IN-01: `bumpAttempt` doc-comment contradicts the gate's behaviour

**File:** `lib/auth-rate-limit.ts:97-101`

**Issue:** The comment claims "`attempts` keeps counting past MAX while the gate holds the row locked." It does not: both routes return the 429 *before* calling the bump (`login/route.ts:46-53`, `password/request/route.ts:52-59`), so `attempts` stalls at `MAX_ATTEMPTS` for the entire lock and only increments again after expiry. The exponential escalation works, but via "one increment per expired lock cycle", not "counting past MAX".

**Fix:** Reword to "each failure after a lock expires re-locks with a doubled backoff, capped at `LOCK_CAP_MS`."

### IN-02: Reset namespace prefix duplicated as a string literal in the integration test

**File:** `tests/integration/reset-login-isolation.test.ts:28-31`

**Issue:** `resetKeyFor` hardcodes `"__reset__:"` while the authoritative value is the private `RESET_NAMESPACE` in `lib/auth-rate-limit.ts:211`. A future rename of the constant would silently stop the test from finding/cleaning the rows (and the cleanup would leak), with no compile error.

**Fix:** Export `RESET_NAMESPACE` (or a `resetKeyForTest` helper) and import it, mirroring how `EMAIL_ONLY_IP` is imported at `:20`.

### IN-03: Follow-up lock `update` can throw P2025 after a concurrent delete

**File:** `lib/auth-rate-limit.ts:120-123`

**Issue:** Between the upsert and the `update` that sets `lockedUntil`, a concurrent successful login can call `resetLoginAttempts` and delete the row (`lib/auth-rate-limit.ts:153-158`). The `update` then throws `P2025` (record not found), propagating to the route's catch and returning a generic 500 for what should be a plain 401. Fail-closed and rare, but it converts an auth rejection into a server error.

**Fix:** Use `updateMany` (which no-ops on zero matches) instead of `update`, or wrap in a `try/catch` and ignore `P2025`.

### IN-04: The reset threshold crossing is never observed

**File:** `app/api/auth/email/password/request/route.ts:67`

**Issue:** `recordResetAttempt` returns the `RateLimitDecision` (including the moment the reset namespace crosses into a lock), but the route discards it (`await recordResetAttempt(email, ip);`). Only the *next* request's 429 is logged (`:54`). The transition from healthy to throttled — useful for abuse monitoring — is invisible.

**Fix:** Capture the decision and `logger.warn` when `!decision.allowed`, or log the returned `retryAfterSec` on the crossing request.

---

_Reviewed: 2026-10-05T22:15:48Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
