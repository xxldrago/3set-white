---
phase: 06-email-auth
plan: 13
subsystem: auth
tags: [auth, registration, enumeration, rate-limit, prisma, email, trial-farming, wr-02, wr-04]

# Dependency graph
requires:
  - phase: 06-email-auth
    provides: email register/login BFF routes, D-84 LoginAttempt counter, trusted clientIp (06-10), trial customerRef email:{userId}
provides:
  - lib/email-canonical.ts canonicalizeEmail (pure, never-throw)
  - User.emailCanonical String? @unique + migration user_email_canonical
  - register route throttled on trusted client IP (429 + retryAfterSec) + canonical dedupe
  - checkRegistrationRateLimit / recordRegistrationAttempt (lib/auth-rate-limit.ts)
  - tests/integration/register-alias.test.ts (plus/dot collapse + per-IP 429)
affects: [06-email-auth, auth-enumeration, trial-abuse, ship-gate]

# Actuals (#2632) — chars/4 over the realized diff (d23bc39..HEAD), not harness tokens.
actuals:
  tokens: 5400
  tasks: 2
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Canonical-mailbox uniqueness as the alias-collapse arbiter (UNIQUE, not a client flag)"
    - "Reusing the D-84 LoginAttempt counter under a namespaced __register__:<ip> key (no migration) for a per-IP register throttle"
    - "Pure never-throw normalizer module (lib/auth.ts discipline)"

key-files:
  created:
    - lib/email-canonical.ts
    - prisma/migrations/20261005213833_user_email_canonical/migration.sql
    - tests/integration/register-alias.test.ts
  modified:
    - prisma/schema.prisma
    - app/api/auth/email/register/route.ts
    - lib/auth-rate-limit.ts
    - tests/integration/email-auth-flow.test.ts
    - tests/integration/session-invalidation.test.ts
    - tests/unit/reset-flow.test.ts

key-decisions:
  - "Alias collapse: canonicalizeEmail strips +tag and Gmail dots; User.emailCanonical UNIQUE is the race arbiter so a mailbox yields one account (and thus one email:{userId} trial)."
  - "Register throttle reuses the D-84 LoginAttempt counter under a namespaced __register__:<ip> key (trusted clientIp, no client-controlled first hop) — no schema change."
  - "Residual register 409 documented as a second existence oracle mirroring the D-89 accepted reset-request surface; D-89 cited as PRECEDENT ONLY — no register owner-acceptance claimed. Email verification deliberately not added (D-79)."
  - "Pre-existing dev accounts are not backfilled with emailCanonical (pre-production data; nullable-unique permits multiple NULLs)."

patterns-established:
  - "Per-IP throttle via namespaced reuse of the shared LoginAttempt counter"
  - "Integration vectors run against the real setwhite DB, each registration presenting its own trusted x-real-ip"

requirements-completed: [AUTH-01, AUTH-05]

coverage:
  - id: D1
    description: "Plus/dot aliases of one mailbox collapse to a single canonical account/trial; alias registration returns 409 and creates no row."
    requirement: "AUTH-05"
    verification:
      - kind: integration
        ref: "tests/integration/register-alias.test.ts#a plus alias of an already-registered mailbox returns 409 and adds no row"
        status: pass
      - kind: integration
        ref: "tests/integration/register-alias.test.ts#gmail dot aliases collapse to one canonical mailbox (409)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Registration is throttled per trusted client IP; attempts beyond the cap return 429 with a server-computed retryAfterSec."
    requirement: "AUTH-01"
    verification:
      - kind: integration
        ref: "tests/integration/register-alias.test.ts#registrations from one trusted IP beyond the cap return 429 with a numeric retryAfterSec"
        status: pass
      - kind: integration
        ref: "tests/integration/email-auth-flow.test.ts#register creates the user and mints a uid-subject session"
        status: pass
    human_judgment: false
  - id: D3
    description: "Residual register 409 is documented in-source and in the SUMMARY as a D-89-precedent disclosure (precedent only; no owner-acceptance for register claimed)."
    requirement: "AUTH-01"
    verification:
      - kind: integration
        ref: "tests/integration/email-auth-flow.test.ts#duplicate register returns 409"
        status: pass
    human_judgment: true
    rationale: "Whether a distinguishable 409 is an acceptable residual disclosure (and that D-89 is fairly cited as precedent for register without a separate owner sign-off) is a policy judgment, not machine-verifiable."

duration: 4min
completed: 2026-10-06
status: complete
---

# Phase 6 Plan 13: Registration Throttle + Canonical Mailbox Summary

**Registration is now throttled per trusted client IP and plus/dot aliases collapse to one canonical account via `User.emailCanonical UNIQUE`, closing WR-04 alias/trial farming while the residual 409 is documented as a D-89-precedent disclosure (not a new owner acceptance).**

## Performance

- **Duration:** 4 min
- **Started:** 2026-10-05T21:38:08Z
- **Completed:** 2026-10-06 (session)
- **Tasks:** 2
- **Files modified:** 9 (created 3, modified 6)

## Accomplishments

- `lib/email-canonical.ts` — pure, never-throw `canonicalizeEmail(email)`: trim + lowercase, split at the last `@`, strip `+tag`, drop dots for `gmail.com`/`googlemail.com`; malformed input returned normalized unchanged.
- `User.emailCanonical String? @unique` added and migrated (`user_email_canonical`) against the real `setwhite` DB; Prisma client regenerated to `generated/prisma`. Pre-existing dev accounts stay `NULL` (nullable-unique); not backfilled (pre-production data).
- Register route: gate on the trusted `clientIp` first (429 `{ error: "rate_limited", retryAfterSec }`), then `canonicalizeEmail` + `OR: [{ email }, { emailCanonical }]` dedupe → 409, create writes both `email` and `emailCanonical`; P2002 race fallback preserved.
- `checkRegistrationRateLimit(ip)` / `recordRegistrationAttempt(ip)` added to `lib/auth-rate-limit.ts`, reusing the D-84 `LoginAttempt` counter under the namespaced key `__register__:<ip>` (ip = `EMAIL_ONLY_IP` sentinel row) — no schema migration, no captcha.
- New `tests/integration/register-alias.test.ts`: plus-alias 409, repeat email 409, Gmail dot-alias 409, and per-IP throttle 429 with numeric `retryAfterSec`.
- Existing suites updated to present unique trusted `x-real-ip`s and clean their `__register__:` rows so the new per-IP throttle cannot collapse registrations into one bucket or lock on re-run.

## Residual disclosure wording (D-89 precedent — recorded exactly)

The in-source comment in `app/api/auth/email/register/route.ts` records:

> WR-02 residual disclosure (ACCEPTED and documented, not silently ignored): the distinguishable 409 below is a SECOND account-existence oracle alongside the login path. It mirrors the reset-request enumeration surface the owner accepted under D-89 (CONTEXT D-89: the honest no-account answer deliberately reveals account existence and the enumeration risk was accepted consciously). D-89 is cited here as PRECEDENT ONLY — it is NOT an owner decision that covers register, and no separate owner sign-off for this register surface is claimed. Email verification is deliberately NOT added (D-79 forbids it), so the residual disclosure is documented rather than closed. Threat T-06-13-01.

## Task Commits

Each task was committed atomically:

1. **Task 1: Canonical mailbox helper + schema uniqueness** - `e4ef326` (feat)
2. **Task 2: Throttle + canonicalize registration, document residual 409** - `d9a3e9b` (feat)

**Plan metadata:** this commit (docs: complete plan)

## Files Created/Modified

- `lib/email-canonical.ts` (created) — pure `canonicalizeEmail` normalizer.
- `prisma/schema.prisma` (modified) — `User.emailCanonical String? @unique @map("email_canonical")` + comment.
- `prisma/migrations/20261005213833_user_email_canonical/migration.sql` (created) — `ADD COLUMN email_canonical TEXT` + `CREATE UNIQUE INDEX users_email_canonical_key`.
- `app/api/auth/email/register/route.ts` (modified) — throttle, canonical dedupe, residual-disclosure comment.
- `lib/auth-rate-limit.ts` (modified) — `checkRegistrationRateLimit` / `recordRegistrationAttempt`.
- `tests/integration/register-alias.test.ts` (created) — alias collapse + throttle vectors.
- `tests/integration/email-auth-flow.test.ts` (modified) — unique `x-real-ip` per registration + `__register__:` cleanup.
- `tests/unit/reset-flow.test.ts` (modified) — same, for the file-level seed and describe-scoped helper.
- `tests/integration/session-invalidation.test.ts` (modified, deviation) — same, to prevent the shared-bucket lock on re-run.

## Decisions Made

- **Alias collapse arbiter:** `emailCanonical UNIQUE`, checked first via `OR` + race-arbitrated by P2002 — no client-side flag.
- **Throttle key:** namespaced `__register__:<ip>` reusing `LoginAttempt` via the `EMAIL_ONLY_IP` sentinel, so no migration and no collision with login counters; keyed on the trusted `clientIp` (T-06-13-04).
- **Residual 409:** documented as D-89-precedent only; register is intentionally non-silent. Email verification left out (D-79).
- **No backfill** of `emailCanonical` for pre-existing dev rows.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `prisma migrate dev` unusable in a non-interactive agent shell**
- **Found during:** Task 1 (schema uniqueness)
- **Issue:** `npx prisma migrate dev --name user_email_canonical` exits with "Prisma Migrate has detected that the environment is non-interactive, which is not supported."
- **Fix:** Generated the exact DDL with `npx prisma migrate diff --from-config-datasource --to-schema=prisma/schema.prisma --script`, wrote it to a timestamped `prisma/migrations/20261005213833_user_email_canonical/migration.sql`, applied it with `npx prisma migrate deploy`, then `npx prisma generate`. Migration content and end state are identical to what `migrate dev` would produce.
- **Files modified:** `prisma/migrations/20261005213833_user_email_canonical/migration.sql`
- **Verification:** `prisma migrate status` reports "Database schema is up to date!"; 11 migrations found; applied successfully.
- **Committed in:** `e4ef326` (Task 1 commit)

**2. [Rule 3 - Blocking] `tests/integration/session-invalidation.test.ts` would lock on re-run**
- **Found during:** Task 2 (register throttle)
- **Issue:** That suite registers 3 users with no forwarded-address header, so all resolve to the shared `"direct"` bucket. The register throttle persists in `LoginAttempt` across runs, so after ~2 runs the bucket exceeds the cap and its first registration would return 429 — a cross-run break introduced by this plan's change (the plan only called out `email-auth-flow` and `reset-flow`).
- **Fix:** Gave its `register()` helper a run-unique `x-real-ip` and added `__register__:`-prefixed counter cleanup to its `cleanup()`. No existing assertion changed.
- **Files modified:** `tests/integration/session-invalidation.test.ts`
- **Verification:** Full suite green (51 files / 434 tests).
- **Committed in:** `d9a3e9b` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both were necessary to complete/keep the plan green. The migration fix produces byte-identical DDL; the test fix is test-isolation only. No scope creep, no product-behavior change.

## Issues Encountered

- None beyond the two Rule 3 items above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- WR-02 and WR-04 addressed. Residual register 409 remains and is documented as a D-89-precedent disclosure (precedent only) — the reviewer/owner should read that disclosure as a policy judgment (see coverage D3).
- Verification: `npx tsc --noEmit` clean; full suite `DATABASE_URL=postgresql://alekseimikhalkin@127.0.0.1:5432/setwhite npx vitest run` → 51 files / 434 tests passed.
- Note for verifier: `emailCanonical` is not backfilled for pre-existing dev rows; register/login still operate on raw `email` for those accounts.

---
*Phase: 06-email-auth*
*Completed: 2026-10-06*

## Self-Check: PASSED
