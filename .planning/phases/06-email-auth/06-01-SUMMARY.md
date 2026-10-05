---
phase: 06-email-auth
plan: "01"
subsystem: auth
tags: [argon2id, jose, sessions, prisma, rate-limit, bff, postgres]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: dual Telegram auth (verifyWidget/verifyInitData), jose httpOnly session, users identity row
  - phase: 02-keys-trial
    provides: atomic claimTrial / releaseTrialOnFailure discipline adapted to userId
provides:
  - nullable-telegramId User identity + PasswordReset/LoginAttempt models (migration 20261005054841_email_auth)
  - userId-subject sessions with legacy tid back-compat (lib/auth.ts, lib/session.ts)
  - Argon2id password hashing + DB-backed login backoff/lock (lib/password.ts, lib/auth-rate-limit.ts)
  - working POST register/login/logout email routes on the shared 3set_session cookie
  - trial-by-userId atomic claim (claimTrialByUserId)
affects: [06-02-link-reset, 06-03-mail, 06-04-login-ui, admin email support, trial route email wiring]

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
actuals:
  tokens: 19000
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: [argon2@0.45.1 (exact pin, node-argon2 — OWASP Argon2id)]
  patterns: [userId session subject with tid-optional claims, legacy-token DB resolution, equal-cost dummy verify, escalating lock backoff, compat-gate call-site migration]

key-files:
  created:
    - lib/password.ts
    - lib/auth-rate-limit.ts
    - app/api/auth/email/register/route.ts
    - app/api/auth/email/login/route.ts
    - app/api/auth/email/logout/route.ts
    - tests/unit/password.test.ts
    - tests/unit/auth-session-userid.test.ts
    - tests/integration/email-auth-flow.test.ts
  modified:
    - prisma/schema.prisma
    - lib/auth.ts
    - lib/session.ts
    - lib/keys-service.ts
    - app/api/auth/telegram/route.ts

key-decisions:
  - "D-79 gate cleared: owner locked the one-way nullable-telegramId migration in 06-CONTEXT.md — proceeded without re-litigation"
  - "requireSession returns SessionIdentity { userId, telegramId|null }; 23 TG-keyed call sites moved to requireTelegramSession (one-token rename, behavior-preserving)"
  - "argon2 (node-argon2) over @node-rs/argon2: canonical package, prebuilt binaries, verified API at install time"
  - "Escalating lock (15min doubling, 2h cap) as the exponential-backoff realization; current failure stays identical-401, lock bites on next request"
  - "requireTelegramSession resolves tid straight from claims (no users-row lookup) so row-less test sessions and legacy tokens keep working"

patterns-established:
  - "Session subject is users.id; telegramId rides as optional tid claim; legacy tid tokens resolve userId via User.telegramId lookup in requireSession only"
  - "Login failures (wrong email, wrong password, no password set) share one byte-identical 401; unknown emails burn a real dummy Argon2id verify"
  - "One-statement updateMany + count===1 branch for every one-time claim (trial by telegramId and by userId)"

requirements-completed: [AUTH-01, AUTH-02]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "Register by email+password mints uid-subject httpOnly session (AUTH-01)"
    requirement: "AUTH-01"
    verification:
      - kind: integration
        ref: "tests/integration/email-auth-flow.test.ts#register creates the user and mints a uid-subject session"
        status: pass
    human_judgment: false
  - id: D2
    description: "Login by email+password returns 200 + cookie; wrong email/password give identical 401 (AUTH-02)"
    requirement: "AUTH-02"
    verification:
      - kind: integration
        ref: "tests/integration/email-auth-flow.test.ts#wrong password and unknown email return byte-identical 401"
        status: pass
    human_judgment: false
  - id: D3
    description: "Legacy tid-only Telegram sessions still resolve after the subject change"
    requirement: "AUTH-02"
    verification:
      - kind: integration
        ref: "tests/integration/auth-flow.test.ts#mints one session and persists exactly one users row per telegram id"
        status: pass
      - kind: unit
        ref: "tests/unit/session.test.ts#legacy tid-only token verifies with null userId"
        status: pass
    human_judgment: false
  - id: D4
    description: "Trial claim by userId is atomic (first wins, second loses)"
    requirement: "AUTH-01"
    verification:
      - kind: integration
        ref: "tests/integration/email-auth-flow.test.ts#trial claim by userId is atomic"
        status: pass
    human_judgment: false
  - id: D5
    description: "Repeated login failures lock with 429 + server retryAfterSec; duplicate register 409; empty fields 400"
    requirement: "AUTH-02"
    verification:
      - kind: integration
        ref: "tests/integration/email-auth-flow.test.ts#repeated failures lock the account"
        status: pass
    human_judgment: false

# Metrics
duration: 45min
completed: 2026-10-05
status: complete
---

# Phase 06 Plan 01: Email-identity spine Summary

**Argon2id email register/login/logout on userId-subject sessions with legacy Telegram back-compat, DB-backed escalating login lock, and atomic trial-by-userId**

## Performance

- **Duration:** ~45 min
- **Started:** 2026-10-05T15:10:00Z
- **Completed:** 2026-10-05T15:55:00Z
- **Tasks:** 3 (decision gate + tracer + blocking migration)
- **Files modified:** 45 (8 created libs/routes/tests + migration + call-site sweep)

## Accomplishments

- D-79 one-way migration applied via canonical `prisma migrate dev --name email_auth` (`20261005054841_email_auth`): `users.telegram_id` nullable, `email` unique, `password_hash`, plus `password_resets` and `login_attempts` tables
- Register → login → shared `3set_session` httpOnly cookie works end-to-end (AUTH-01/AUTH-02); duplicate email → 409, empty/short fields → 400
- Legacy `{ tid }` Telegram sessions verify unchanged; new tokens carry `{ uid, tid? }`; `requireSession` returns `{ userId, telegramId|null }` with server-side legacy resolution (D-82)
- Argon2id (OWASP m=19456/t=2/p=1) with never-throw verify and equal-cost dummy path on unknown emails (T-06-01)
- Per-email+per-IP backoff with escalating temp lock (15 min doubling, 2 h cap), 429 + server `retryAfterSec`, success resets (T-06-02/T-06-03/T-06-04)
- Full suite green: 42 files / 369 tests pass; `npx tsc --noEmit` clean

## Task Commits

Each task was committed atomically:

1. **Gate: confirm one-way identity migration (D-79)** — no code; owner locked it in `06-CONTEXT.md` (one-way, explicit) — proceeded and recorded here
2. **Tracer: register → login → session cookie end-to-end** - `a5abc3b` (feat: schema + libs + email routes + telegram uid mint + 23 call-site compat renames + argon2 dep)
3. **[BLOCKING] Schema migration + trial-by-userId enforcement** - `4a3b3b0` (feat: migration dir + claimTrialByUserId + all new/updated tests)

**Plan metadata:** summary commit follows (docs: complete plan).

## Files Created/Modified

- `prisma/schema.prisma` + `prisma/migrations/20261005054841_email_auth/migration.sql` — nullable telegramId, email/passwordHash, PasswordReset, LoginAttempt
- `lib/auth.ts` — overloaded signSession (3-arg uid + 2-arg legacy), verifySession → SessionClaims, buildClearSessionCookie
- `lib/session.ts` — requireSession → SessionIdentity (legacy tid resolved via users row), requireTelegramSession (claims-direct, no row needed)
- `lib/password.ts` — argon2id hash/verify, min-8/max-256, precomputed dummy hash for equal cost
- `lib/auth-rate-limit.ts` — check/record/reset over LoginAttempt @@unique([email, ip])
- `app/api/auth/email/register|login|logout/route.ts` — 400/409/401-identical/429 discipline, welcome-mail hook comment (06-03)
- `app/api/auth/telegram/route.ts` — mints uid-subject tokens from upserted row id
- `lib/keys-service.ts` — claimTrialByUserId + releaseTrialOnFailureByUserId (D-80)
- 23 call sites (`app/**/page.tsx`, `app/api/**`, `lib/admin-auth.ts`) — `requireSession` → `requireTelegramSession`
- `lib/admin-service.ts`, `lib/bot-payments.ts`, `lib/reminders-service.ts`, `prisma/seed.ts` — nullable-telegramId narrowing (Rule 3)
- `tests/unit/password.test.ts`, `tests/unit/auth-session-userid.test.ts`, `tests/integration/email-auth-flow.test.ts` (new); `tests/unit/session.test.ts`, `tests/integration/auth-flow.test.ts` (contract updates)
- `package.json` / `package-lock.json` — `argon2@0.45.1` exact (legitimacy: ranisalt/node-argon2, verified via npm registry before install)

## Decisions Made

- D-79 gate: owner pre-approved the one-way migration in 06-CONTEXT.md discussion — treated as cleared, recorded here, not re-litigated (per plan instruction).
- `requireTelegramSession` resolves tid straight from verified claims with NO users-row lookup: pre-Phase-6 routes key everything by telegram id, and existing tests mint sessions for ids with no users row. This restored 36 failing tests to green without touching them; only `requireSession` (userId path) does the legacy DB resolution.
- Lock escalation (`LOCK_MS * 2^(attempts-MAX)`, 2 h cap) is the exponential-backoff realization: the current failure always returns the identical 401, the lock bites on the next request — satisfying both "identical 401" and "429 with retryAfter" vectors.
- Admin search/profile exclude email-only accounts for now (search is telegram/key identity-keyed; header maps null-telegram to 404); bot payment pushes skip rows with no chat (never a `"null"` chat send). Full admin email support arrives with later plans.
- `migrate dev` refused non-interactive shells; ran it under a pty (`script`) with piped confirmation — canonical migration output, DB in sync.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Nullable telegramId broke downstream types**
- **Found during:** Tracer (typecheck after schema edit)
- **Issue:** `lib/admin-service.ts` (SelectedUser/toSearchResult/staff lookup/header), `lib/bot-payments.ts` (chat fallback + getSubscriptionForUser), `lib/reminders-service.ts` (ExpiringKey), `prisma/seed.ts` (logging) assumed non-null telegramId
- **Fix:** Null-narrowing guards: admin search skips email-only rows, header 404s them, bot pushes skip chat-less rows, ExpiringKey carries `bigint | null`
- **Files modified:** lib/admin-service.ts, lib/bot-payments.ts, lib/reminders-service.ts, prisma/seed.ts
- **Verification:** `npx tsc --noEmit` clean; full suite 369/369 green
- **Committed in:** a5abc3b (tracer commit)

**2. [Rule 3 - Blocking] TG gate required a users row, breaking 36 existing tests**
- **Found during:** Tracer (full-suite regression run: 5 files / 36 tests 401 instead of 200)
- **Issue:** First `requireTelegramSession` design delegated to `requireSession`, whose legacy path needs a users row; existing tests mint sessions for ids with no row
- **Fix:** `requireTelegramSession` resolves tid directly from verified claims (no DB); legacy resolution stays only in the userId path
- **Files modified:** lib/session.ts
- **Verification:** full suite 42 files / 369 tests green, tsc clean
- **Committed in:** a5abc3b (tracer commit)

**3. [Rule 2 - Missing critical] Trial-by-userId needed a home outside files_modified**
- **Found during:** Blocking task (acceptance "second trial claim for same userId returns false" had no service function)
- **Issue:** Plan listed the trial truth but no `lib/keys-service.ts` change in files_modified
- **Fix:** Added `claimTrialByUserId` + `releaseTrialOnFailureByUserId` mirroring the atomic updateMany discipline
- **Files modified:** lib/keys-service.ts
- **Verification:** integration vector (true then false) passes
- **Committed in:** 4a3b3b0 (blocking commit)

**4. [Rule 1 - Bug] Telegram route variable shadowing**
- **Found during:** Tracer (self-review right after edit)
- **Issue:** Upsert result `const user` shadowed the Telegram payload `user`; `signSession(user.id, …)` would have minted tid = DB row id
- **Fix:** Renamed upsert result to `row`; `signSession(row.id, <telegramId>, …)` in both initData and widget paths
- **Files modified:** app/api/auth/telegram/route.ts
- **Verification:** auth-flow integration (claims carry real telegram id + numeric uid) passes
- **Committed in:** a5abc3b (tracer commit)

**5. [Rule 1 - Bug] Integration cleanup missed ghost-email attempt rows**
- **Found during:** Blocking task (4 orphan `login_attempts` rows after suite run)
- **Issue:** Cleanup covered only the two run emails, not the ghost/empty test addresses
- **Fix:** Cleanup list extended; orphan rows deleted; DB back to 1 user / 0 attempts
- **Files modified:** tests/integration/email-auth-flow.test.ts
- **Verification:** re-ran flow (8/8) + row counts
- **Committed in:** 4a3b3b0 (blocking commit)

---

**Total deviations:** 5 auto-fixed (2 Rule 3 blocking, 1 Rule 2 missing-critical, 2 Rule 1 bugs)
**Impact on plan:** All fixes required for correctness/type-safety; no scope creep. files_modified extended by necessity (call-site sweep, service narrowing, keys-service); documented above.

## Issues Encountered

- `prisma migrate dev` refuses non-interactive shells; `migrate diff` needed a shadow DB. Solved with a pty (`script -q`) + piped `yes` — canonical `email_auth` migration created and applied, DB reports in sync.
- Native `argon2` install: succeeded first try (prebuilt bindings load, verified via `node -e require`).
- The `=== ` echo in one diagnostic command tripped zsh globbing — cosmetic, no impact.

## Threat Flags

None beyond the plan's `<threat_model>` — all new surface (credential intake, hashes at rest, session minting, rate-limit counters) maps to registered T-06-01..T-06-04/T-06-SC with the planned mitigations implemented. Package-legitimacy gate for `argon2` (T-06-SC): verified `argon2@0.45.1` = ranisalt/node-argon2 via the npm registry (repo URL + version pin) before install; install succeeded so no blocking-human checkpoint was triggered.

## Known Stubs

None — no placeholders, TODOs, or unwired paths. The welcome-mail hook in register is an intentional commented seam for 06-03 (mail module does not exist yet), not a stub: registration completes fully without it.

## Auth Gates

None — no external auth required; all verification ran against local `setwhite` with throwaway secrets.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Ready: 06-02 (link/unlink via `requireUserSession` identity + merge onto `trialUsed OR`; reset request/confirm via `PasswordReset` model + `timingSafeEqualHex` discipline), 06-03 (welcome/reset mail at the register hook point), 06-04 (login/account UI against the typed error codes `email_taken`/`invalid_credentials`/`rate_limited+retryAfterSec`).
- Note for 06-02: email-only users get 401 on all TG-keyed routes until linking — by design; the trial route still claims by telegramId (email trial wiring pending).
- No blockers.

## Self-Check: PASSED

- Migration dir exists: `prisma/migrations/20261005054841_email_auth/migration.sql` FOUND
- New libs/routes/tests on disk: all 8 created paths FOUND
- Commits exist: `a5abc3b` FOUND, `4a3b3b0` FOUND (verified via `git rev-parse`)
- No `STATE.md` / `ROADMAP.md` writes made (orchestrator-owned; pre-existing `M .planning/STATE.md` left untouched)
- DB clean: 1 pre-existing user, 0 orphan attempt rows

---
*Phase: 06-email-auth*
*Completed: 2026-10-05*
