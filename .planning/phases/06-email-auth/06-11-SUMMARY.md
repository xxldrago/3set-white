---
phase: 06-email-auth
plan: 11
subsystem: auth
tags: [jwt, jose, prisma, postgres, session, password-reset, revocation]

# Dependency graph
requires:
  - phase: 06-email-auth
    provides: userId-subject session JWT (D-82), password reset tokens (D-88), link/unlink service
provides:
  - User.credentialsChangedAt revocation watermark + migration user_credentials_changed_at
  - verifySessionWithIssuedAt() exposing token iat while verifySession keeps its exact { userId, telegramId } shape
  - Watermark enforcement in requireSession AND requireTelegramSession (second-granularity strict <)
  - credentialsChangedAt bumps on password change, password reset, and Telegram unlink
  - Reset-token supersession: a new reset request deletes prior unused tokens for the user
affects: [06-verify, session-gated routes, admin-auth, future auth work]

actuals:
  tokens: 5337
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Per-user credential watermark compared against second-truncated JWT iat in the session gates"
    - "Internal verifySessionWithIssuedAt() sibling keeps the public exact-shape verifySession contract"
    - "Reset-token supersession via deleteMany(usedAt:null)+create in one $transaction"

key-files:
  created:
    - tests/integration/session-invalidation.test.ts
    - prisma/migrations/20261005213229_user_credentials_changed_at/migration.sql
  modified:
    - prisma/schema.prisma
    - lib/auth.ts
    - lib/session.ts
    - app/api/auth/email/password/change/route.ts
    - app/api/auth/email/password/confirm/route.ts
    - app/api/auth/email/password/request/route.ts
    - app/api/auth/email/unlink/route.ts

key-decisions:
  - "Kept verifySession returning EXACTLY { userId, telegramId } and added verifySessionWithIssuedAt() for the iat — existing exact-match tests stay untouched."
  - "Watermark compares at SECOND granularity with strict <: a token re-minted in the same second as the bump is accepted by design; revocation tests mint old tokens with a controlled earlier iat (now-120s) instead of relying on wall-clock ordering."
  - "A missing user row carries no watermark (legacy tid sessions for unknown rows keep working), while the legacy tid path still throws when the userId cannot be resolved."

patterns-established:
  - "Credential revocation: watermark bump on every credential/privilege change + gate-side second-granularity comparison."
  - "Deterministic time-based security tests: explicit jose .setIssuedAt(controlled) rather than wall-clock races."

requirements-completed: [AUTH-01, AUTH-02, AUTH-03, AUTH-04]

coverage:
  - id: D1
    description: "Session gates reject tokens issued strictly before the account's credentialsChangedAt watermark"
    requirement: "AUTH-03"
    verification:
      - kind: integration
        ref: "tests/integration/session-invalidation.test.ts#password change revokes an earlier-issued session; the re-minted one survives"
        status: pass
      - kind: integration
        ref: "tests/integration/session-invalidation.test.ts#password reset revokes an earlier-issued session"
        status: pass
      - kind: unit
        ref: "tests/unit/session.test.ts"
        status: pass
      - kind: unit
        ref: "tests/unit/auth-session-userid.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "Password change/reset and Telegram unlink bump the watermark; the current request's re-minted session survives"
    requirement: "AUTH-03"
    verification:
      - kind: integration
        ref: "tests/integration/email-auth-flow.test.ts"
        status: pass
      - kind: integration
        ref: "tests/integration/session-invalidation.test.ts#password change revokes an earlier-issued session; the re-minted one survives"
        status: pass
    human_judgment: false
  - id: D3
    description: "A new password-reset request supersedes previously issued unused reset tokens (only the newest link is valid)"
    requirement: "AUTH-04"
    verification:
      - kind: integration
        ref: "tests/integration/session-invalidation.test.ts#issuing a new reset token supersedes the previous unused token (WR-03)"
        status: pass
    human_judgment: false

duration: 4min
completed: 2026-10-05
status: complete
---

# Phase 6 Plan 11: Session & Reset-Token Invalidation Summary

**Per-user `credentialsChangedAt` watermark revokes prior sessions on password change/reset/unlink, and a new reset request supersedes older unused tokens.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-10-05T21:31:31Z
- **Completed:** 2026-10-05T21:35:36Z
- **Tasks:** 3
- **Files modified:** 9 (incl. 1 migration + 1 new test; `generated/prisma` is gitignored/regenerated)

## Accomplishments
- Added `User.credentialsChangedAt` + migration `user_credentials_changed_at`; `npx prisma generate` regenerated the client.
- `verifySession` still returns EXACTLY `{ userId, telegramId }` (delegates to new `verifySessionWithIssuedAt()`), so `tests/unit/session.test.ts`, `tests/unit/auth-session-userid.test.ts`, and all `resolves.toEqual({ userId, telegramId })` assertions pass untouched.
- `requireSession` and `requireTelegramSession` now reject any token whose second-truncated `iat` is strictly before the floored watermark; same-second re-mints stay valid.
- Bumped the watermark on password change, password confirm (inside the atomic consume transaction), and Telegram unlink (before re-mint).
- `password/request` now deletes prior unused `PasswordReset` rows and creates the new one in a single `$transaction` — only the newest 1h link works.
- New `tests/integration/session-invalidation.test.ts` proves change/reset revocation and reset supersession deterministically via a `signSessionAt()` helper minting controlled earlier `iat` values.

## Task Commits

Each task was committed atomically:

1. **Task 1: credentialsChangedAt watermark + session-gate revocation** - `22b4760` (feat)
2. **Task 2: Bump the watermark on change/reset/unlink** - `08b0f51` (feat)
3. **Task 3: Supersede older reset tokens + integration tests** - `8ac3789` (feat)

**Plan metadata:** _pending_ (docs: complete plan)

## Files Created/Modified
- `prisma/schema.prisma` - `User.credentialsChangedAt DateTime? @map("credentials_changed_at")`
- `prisma/migrations/20261005213229_user_credentials_changed_at/migration.sql` - adds the nullable column
- `lib/auth.ts` - `VerifiedSessionClaims` + `verifySessionWithIssuedAt()`; `verifySession` delegates and strips `iat`
- `lib/session.ts` - shared `isRevoked()`; watermark check in both gates
- `app/api/auth/email/password/change/route.ts` - hash + watermark in one write, then re-mint
- `app/api/auth/email/password/confirm/route.ts` - watermark inside the atomic consume transaction
- `app/api/auth/email/unlink/route.ts` - watermark bump before re-minting a tid-less session
- `app/api/auth/email/password/request/route.ts` - delete prior unused tokens + create in one `$transaction`
- `tests/integration/session-invalidation.test.ts` - WR-01/WR-03 vectors with controlled-iat tokens

## Decisions Made
- **Public claims shape preserved:** introduce a separate `verifySessionWithIssuedAt()` rather than widening `SessionClaims`, protecting the exact-match tests and every `toEqual({ userId, telegramId })` assertion.
- **Second-granularity, strict `<`:** jose `iat` is second-truncated while the watermark carries ms. A same-second re-mint must be accepted, so revocation determinism is a test concern (controlled earlier `iat`), not a gate concern.
- **Missing user row = no watermark:** a legacy `tid` session whose row does not exist keeps working (the existing ux path); the legacy path still throws when the userId cannot be resolved.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None. `npx tsc --noEmit` clean; full suite green (50 files / 430 tests) with `DATABASE_URL=postgresql://alekseimikhalkin@127.0.0.1:5432/setwhite`.

## Threat Surface Scan
No new external surface: the watermark is an internal DB column compared inside existing session gates, and reset supersession modifies an existing table write. Matches `<threat_model>` T-06-11-01/-02 mitigation plans. No threat flags.

## Known Stubs
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- WR-01 and WR-03 closed: password rotation/reset (and unlink) revoke earlier sessions; only the newest reset link is valid.
- No blockers. STATE.md / ROADMAP.md intentionally left to the orchestrator.

---
*Phase: 06-email-auth*
*Completed: 2026-10-05*

## Self-Check: PASSED

- All 9 created/modified source + migration files exist.
- Commits 22b4760, 08b0f51, 8ac3789 exist.
- `npx tsc --noEmit` clean; full suite 50 files / 430 tests passed.
