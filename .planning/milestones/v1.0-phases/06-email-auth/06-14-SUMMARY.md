---
phase: 06-email-auth
plan: 14
subsystem: auth
tags: [auth, rate-limit, password-reset, lockout-dos, cr-01, cr-02, wr-01, prisma, email]

# Dependency graph
requires:
  - phase: 06-email-auth
    provides: D-84 LoginAttempt counter with EMAIL_ONLY_IP account-wide sentinel (06-10), password reset request/confirm routes (06-03), registration namespaced throttle pattern (06-13)
provides:
  - lib/auth-rate-limit.ts RESET_NAMESPACE / resetKey (private), checkResetRateLimit / recordResetAttempt
  - password/request route throttled via __reset__:<normalizedEmail>, never the login account-wide row (CR-01 closed)
  - atomic bumpAttempt (single upsert attempts:{increment:1}) — WR-01 addressed
  - tests/integration/reset-login-isolation.test.ts (reset-does-not-lock-login + login-failures-do-lock)
  - concurrency vector in tests/unit/auth-rate-limit.test.ts
  - run-scoped __reset__: cleanup in reset-flow + session-invalidation suites
affects: [06-email-auth, auth-availability, ship-gate]

# Actuals (#2632) — chars/4 over the realized code diff (1d78bc3..HEAD): 19745/4.
actuals:
  tokens: 4900
  tasks: 2
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Namespaced reuse of the D-84 LoginAttempt counter to isolate an unauthenticated surface from the login lock (__reset__:<email>, disjoint from (<email>, \"\") )"
    - "Atomic Prisma upsert with `attempts: { increment: 1 }` + lock derived from the returned row (no JS read-modify-write)"
    - "Cross-route integration vector against the real setwhite DB proving both lock-isolation directions"

key-files:
  created:
    - tests/integration/reset-login-isolation.test.ts
  modified:
    - lib/auth-rate-limit.ts
    - app/api/auth/email/password/request/route.ts
    - tests/unit/auth-rate-limit.test.ts
    - tests/unit/reset-flow.test.ts
    - tests/integration/session-invalidation.test.ts

key-decisions:
  - "CR-01 fix: the reset-mail throttle uses its own __reset__:<normalizedEmail> namespace (account-wide row (\"__reset__:<email>\", \"\")), so five anonymous reset requests can never drive the login account-wide (EMAIL_ONLY_IP) row to lock. checkLoginRateLimit / recordFailedLogin / resetLoginAttempts and the CR-02 login counter are byte-unchanged."
  - "Task 2 (WR-01): bumpAttempt replaced the JS read-modify-write with one atomic upsert increment and derives the lock from the returned row; lockedUntil is deliberately NOT cleared on the increment path (gate ignores expired locks)."
  - "Accepted residual CR-01-RESIDUAL: reset remains account-wide lockable inside its own namespace — that is the intended D-84 anti-spam behaviour, fully isolated from login and owner-accepted; this plan does not remove it."
  - "Existing suites that drive reset (reset-flow, session-invalidation) extend only their loginAttempt.deleteMany `in` lists with run-scoped __reset__: addresses (never a bare prefix delete, which would clobber sibling suites under parallel-file runs); raw-email passwordReset/user deletes are unchanged."

patterns-established:
  - "Unlink an unauthenticated surface from a shared account lock by namespacing its counter key instead of sharing the sentinel row"
  - "Regression vector that crosses two routes (reset burst vs failed-login burst) to prove lock isolation in both directions"

requirements-completed: [AUTH-02, AUTH-04]

coverage:
  - id: D1
    description: "Five anonymous password-reset requests for a known email do not lock that account's login."
    requirement: "AUTH-02"
    verification:
      - kind: integration
        ref: "tests/integration/reset-login-isolation.test.ts#five anonymous reset requests lock only the reset namespace, never login"
        status: pass
    human_judgment: false
  - id: D2
    description: "Five failed login attempts from rotating source IPs still lock the account (CR-02 preserved)."
    requirement: "AUTH-02"
    verification:
      - kind: integration
        ref: "tests/integration/reset-login-isolation.test.ts#five failed logins from five distinct IPs still lock the account (CR-02 preserved)"
        status: pass
      - kind: unit
        ref: "tests/unit/auth-rate-limit.test.ts#locks the account after five failures from five different IPs and denies a sixth from a new IP"
        status: pass
    human_judgment: false
  - id: D3
    description: "The reset-mail throttle still enforces D-84 backoff in its own namespace (sixth reset returns 429 with server retryAfterSec); token TTL/one-time semantics (D-88) untouched."
    requirement: "AUTH-04"
    verification:
      - kind: integration
        ref: "tests/integration/reset-login-isolation.test.ts#five anonymous reset requests lock only the reset namespace, never login"
        status: pass
      - kind: unit
        ref: "tests/unit/reset-flow.test.ts#rapid requests throttle to 429 with server retryAfterSec"
        status: pass
    human_judgment: false
  - id: D4
    description: "bumpAttempt is atomic: five concurrent recordFailedLogin calls do not lose increments (WR-01)."
    requirement: "AUTH-02"
    verification:
      - kind: unit
        ref: "tests/unit/auth-rate-limit.test.ts#does not lose increments under a concurrent burst (WR-01: atomic bump)"
        status: pass
    human_judgment: false
  - id: D5
    description: "The namespace rename leaves no DB residue: reset-driving suites remove their run-scoped __reset__: counter rows."
    requirement: "AUTH-04"
    verification:
      - kind: manual
        ref: "post-run SELECT on login_attempts WHERE email LIKE '__reset__:%' → []"
        status: pass
    human_judgment: false

duration: 4min
completed: 2026-10-06
status: complete
---

# Phase 6 Plan 14: Reset-Login Lock Isolation (CR-01 DoS) Summary

**The unauthenticated password-reset route now throttles in its own `__reset__:<email>` namespace, so anonymous reset bursts can no longer lock a known account out of login, while the CR-02 account-wide login lock is preserved byte-for-byte and `bumpAttempt` is now atomic.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-10-05T22:08:11Z
- **Completed:** 2026-10-06 (session)
- **Tasks:** 2
- **Files modified:** 6 (created 1, modified 5)

## Accomplishments

- `lib/auth-rate-limit.ts` — added `RESET_NAMESPACE = "__reset__:"` and private `resetKey(email)` (normalizes then prefixes), plus exported `checkResetRateLimit(email, ip)` → `checkLoginRateLimit(resetKey(email), ip)` and `recordResetAttempt(email, ip)` → `recordFailedLogin(resetKey(email), ip)`. The reset account-wide row is `("__reset__:<email>", "")`, disjoint from login's `(<email>, "")`. `checkLoginRateLimit`, `recordFailedLogin`, `resetLoginAttempts`, `MAX_ATTEMPTS`, `LOCK_MS`, `LOCK_CAP_MS`, and the registration wrappers are unchanged.
- `app/api/auth/email/password/request/route.ts` — imports and calls the reset wrappers; no `checkLoginRateLimit`/`recordFailedLogin` call remains. Status/error codes (`400`/`404`/`429`/`500`, `bad_request`/`reset_no_account`/`rate_limited`/`reset_error`), request ordering, the D-89 honest 404, the WR-03 supersede-then-mail transaction, and `retryAfterSec` are untouched.
- `tests/integration/reset-login-isolation.test.ts` (new) — Vector 1: five reset requests for a registered email from five distinct `x-real-ip`s all return 200; the `("__reset__:<email>", "")` row locks; a sixth returns 429 with a numeric `retryAfterSec`; `checkLoginRateLimit(<email>, newIp)` returns `allowed:true` and a real correct-password `POST /login` returns 200. Vector 2: five failed logins from five distinct IPs leave the account-wide row locked and a sixth login 429s — CR-02 intact.
- `tests/unit/auth-rate-limit.test.ts` — new concurrency vector: `Promise.all` of five `recordFailedLogin` with distinct IPs drives the account-wide row to `attempts >= 5` with a non-null `lockedUntil`; all pre-existing vectors pass unchanged.
- `tests/unit/reset-flow.test.ts` + `tests/integration/session-invalidation.test.ts` — their existing `loginAttempt.deleteMany` `in` lists now also contain run-scoped `__reset__:<email>` addresses, so the namespace rename leaves no DB residue. Only the `in` lists changed; `passwordReset`/`user` deletes and every assertion are byte-identical.

## Task Commits

Each task was committed atomically:

1. **Task 1 (tracer): Isolate the reset-mail throttle into its own namespace** — `576e3f3` (fix)
2. **Task 2: Atomic attempt increment + concurrency regression (WR-01)** — `ad8f0cf` (fix)

**Plan metadata:** this commit (docs: complete plan)

## Tracer Feedback Gate

Task 1 was `type="tracer"` (no `gate` attribute; auto mode inactive, `human_verify_mode=end-of-phase`, `<verify>` automated-only). The gate was satisfied by re-running the tracer `<verify>` end-to-end before expanding:

- `npx tsc --noEmit` → clean.
- `npx vitest run tests/integration/reset-login-isolation.test.ts tests/unit/reset-flow.test.ts tests/integration/session-invalidation.test.ts` → 3 files / 15 tests passed.

⚡ Tracer verified end-to-end — expanded to Task 2.

## Files Created/Modified

- `lib/auth-rate-limit.ts` (modified) — `__reset__:` namespace wrappers (Task 1) + atomic `bumpAttempt` (Task 2).
- `app/api/auth/email/password/request/route.ts` (modified) — wires `checkResetRateLimit`/`recordResetAttempt`; comments updated.
- `tests/integration/reset-login-isolation.test.ts` (created) — cross-route isolation regression.
- `tests/unit/auth-rate-limit.test.ts` (modified) — concurrency vector + `EMAIL_CONCURRENT` cleanup entry.
- `tests/unit/reset-flow.test.ts` (modified) — run-scoped `__reset__:` cleanup in both `loginAttempt.deleteMany` calls.
- `tests/integration/session-invalidation.test.ts` (modified) — run-scoped `__reset__:` cleanup.

## Decisions Made

- **Namespace, not a parameter:** chose `__reset__:<email>` (mirroring the 06-13 `__register__:` pattern) over adding a `bumpAccountWide` flag, so the reset path can never address the login sentinel row even by mistake.
- **No `lockedUntil: null` on the increment update:** a concurrent write could clobber a just-set lock; the gate already ignores expired locks (`lockedUntil > now` only).
- **Run-scoped cleanup lists, never a bare prefix delete:** parallel-file runs would otherwise clobber sibling suites' in-flight `__reset__:` rows.

## Accepted Residual (recorded, by design)

**CR-01-RESIDUAL** — the reset path remains account-wide lockable inside its own `__reset__:<email>` namespace. An anonymous party can still temporarily throttle reset-mail for a known email; that is the intended D-84 anti-spam behaviour, it is fully isolated from login (five anonymous resets leave login 200), and it is an owner-accepted residual. This plan deliberately does not remove it.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Verification

- `npx tsc --noEmit` → clean.
- `DATABASE_URL=postgresql://alekseimikhalkin@127.0.0.1:5432/setwhite npx vitest run tests/integration/reset-login-isolation.test.ts tests/unit/auth-rate-limit.test.ts tests/unit/reset-flow.test.ts tests/integration/session-invalidation.test.ts` → 4 files / 21 tests passed.
- Post-run residue probe on the real DB: `login_attempts WHERE email LIKE '__reset__:%'` → `[]`; no `phase6-iso-*` rows remain.
- `app/api/auth/email/password/request/route.ts` contains no `checkLoginRateLimit` / `recordFailedLogin` reference.

## Next Phase Readiness

- 06-VERIFICATION.md truth 13 / 06-REVIEW.md CR-01 is closed at the code level with a cross-route regression test; CR-02 remains intact; WR-01 addressed. D-84/D-88/D-89 are untouched.
- The plan-scoped regression set is green; the rest of the suite is expected unaffected (this plan did not re-run the full 51-file suite, per the plan's stated regression scope).
- STATE.md / ROADMAP.md were intentionally not written by this executor — the orchestrator owns those updates.

---
*Phase: 06-email-auth*
*Completed: 2026-10-06*

## Self-Check: PASSED
