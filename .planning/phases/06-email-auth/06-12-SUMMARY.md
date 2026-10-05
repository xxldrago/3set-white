---
phase: 06-email-auth
plan: 12
subsystem: auth
tags: [prisma, postgres, error-handling, transactions, race-condition, vitest]

# Dependency graph
requires:
  - phase: 06-email-auth
    provides: "lib/replay.ts consumeWidgetHash + lib/accounts.ts linkAccounts merge (06-02/06-06)"
provides:
  - "consumeWidgetHash: only Prisma P2002 returns replay=false; all other errors logged + rethrown"
  - "linkAccounts: in-transaction merge-invariant re-assertion with typed P2002/P2025/P2003 outcomes"
  - "Regression tests: tests/unit/replay.test.ts, tests/integration/link-merge.test.ts"
affects: [06-email-auth verify, ship]

actuals:
  tokens: 4526
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Narrow DB error classification: only the expected Prisma code is a business outcome; everything else logs + rethrows"
    - "Read-then-act decisions moved inside $transaction on in-transaction reads, with Prisma codes mapped to typed domain errors"

key-files:
  created:
    - tests/unit/replay.test.ts
    - tests/integration/link-merge.test.ts
  modified:
    - lib/replay.ts
    - lib/accounts.ts

key-decisions:
  - "P2003 (FK integrity failure during merge) maps to AccountConflictError, alongside P2002; P2025 maps to AccountNotFoundError"
  - "The no-loser fast path only attaches when survivor.telegramId is null and re-enters the transactional merge on a P2002 race"
  - "Typed Prisma-code outcomes are vector-tested by rejecting the spied prisma.$transaction with synthetic P2025/P2002/P2003 errors"

patterns-established:
  - "WR-05/06 discipline: DB outages raise, only true duplicates/no-ops return normal results; concurrency hazards resolve to typed errors, never uncaught 500"

requirements-completed: [AUTH-02, AUTH-03]

coverage:
  - id: D1
    description: "consumeWidgetHash returns false only on a genuine duplicate (P2002); any other DB error is logged (no hash/PII) and rethrown so callers map it to a 500, not a silent replay 401"
    requirement: "AUTH-02"
    verification:
      - kind: unit
        ref: "tests/unit/replay.test.ts#logs and rethrows a non-P2002 DB error instead of reporting a replay"
        status: pass
      - kind: unit
        ref: "tests/unit/replay.test.ts#returns false when the same hash is consumed again (P2002 → replay)"
        status: pass
    human_judgment: false
  - id: D2
    description: "linkAccounts re-asserts the merge invariants inside its transaction (loser.email === null, distinct ids, survivor identity slot) and maps P2025 → AccountNotFoundError / P2002,P2003 → AccountConflictError; merge semantics (re-point, trialUsed OR, idempotent same-identity) preserved"
    requirement: "AUTH-03"
    verification:
      - kind: integration
        ref: "tests/integration/link-merge.test.ts#throws AccountConflictError and merges nothing when the identity is on an email account"
        status: pass
      - kind: integration
        ref: "tests/integration/link-merge.test.ts#maps a mid-transaction P2025 to AccountNotFoundError (not a raw throw)"
        status: pass
      - kind: integration
        ref: "tests/integration/link-merge.test.ts#maps merge P2002/P2003 to AccountConflictError"
        status: pass
      - kind: integration
        ref: "tests/integration/email-auth-flow.test.ts"
        status: pass
    human_judgment: false

duration: 2min
completed: 2026-10-05
status: complete
---

# Phase 6 Plan 12: WR-05 replay catch-all + WR-06 linkAccounts race Summary

**P2002-only replay guard and in-transaction, typed link/merge invariants — DB outages no longer impersonate replays and the Telegram↔email merge is race-safe with typed failure modes**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-10-05T21:17:08Z
- **Completed:** 2026-10-05T21:19:31Z
- **Tasks:** 2
- **Files modified:** 4 (2 modified, 2 created)

## Accomplishments
- `consumeWidgetHash` now treats only a Prisma unique violation (P2002) as a replay; every other error is logged (no hash/PII) and rethrown so callers surface a 500 instead of a misleading 401 (WR-05, T-06-12-02).
- `linkAccounts` re-reads the loser and re-asserts all merge invariants inside `prisma.$transaction`; a conflicting email on the loser throws `AccountConflictError` with nothing merged (WR-06, T-06-12-01/-03).
- Prisma `P2025` during the merge maps to `AccountNotFoundError`; `P2002`/`P2003` map to `AccountConflictError` — races never escape as uncaught 500s.
- No-loser fast path retained but hardened: it only attaches when the survivor's identity slot is empty, and a lost P2002 race re-enters the transactional merge path rather than acting on the pre-read row.

## Task Commits

Each task was committed atomically:

1. **Task 1: Narrow consumeWidgetHash error handling** - `6f003a4` (fix)
2. **Task 2: Race-harden linkAccounts inside the transaction** - `7c5678e` (fix)

**Plan metadata:** committed by the orchestrator (this SUMMARY) — STATE.md/ROADMAP.md intentionally not written by the executor.

## Files Created/Modified
- `lib/replay.ts` - catch only P2002 as replay; log + rethrow other errors (WR-05)
- `lib/accounts.ts` - in-transaction invariant re-assertion + typed P2002/P2025/P2003 mapping; fast-path race fallback re-enters merge (WR-06)
- `tests/unit/replay.test.ts` - fresh→true, duplicate→false, synthetic non-P2002 rejects + logs without the hash
- `tests/integration/link-merge.test.ts` - real-DB merge/re-point/trialUsed-OR, conflict-no-merge, idempotent same-identity, and typed P2025/P2002/P2003 outcomes

## Decisions Made
- **P2003 → `AccountConflictError`.** The plan named typed P2002/P2025/P2003 outcomes and assigned P2002→conflict, P2025→not-found, but left P2003 implicit; mapped it to `AccountConflictError` so an integrity/FK failure during the merge answers 409/401 rather than a generic 500.
- **Fast-path guard.** Direct attach now also requires `survivor.telegramId === null`, mirroring the in-transaction invariant (a different already-bound identity must not be silently overwritten).
- **Typed-code testing vector.** Mid-flight Prisma codes are exercised by rejecting the spied `prisma.$transaction` with synthetic `{ code }` errors — a deterministic alternative to racing a real delete, and it asserts the mapping directly.
- Reused the existing `isUniqueViolation` idiom, generalized to `isErrorCode(err, code)`.

## Deviations from Plan

None - plan executed exactly as written (the decisions above are refinements within the plan's stated intent, not scope changes).

## Issues Encountered
None. `npx tsc --noEmit` is clean; both task verifications passed; the full suite (49 files / 424 tests) passes with `DATABASE_URL=postgresql://alekseimikhalkin@127.0.0.1:5432/setwhite`.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- WR-05 and WR-06 are closed with committed code and regression tests; the caller maps (`/api/auth/telegram`, `/api/auth/email/link`) already translate `AccountConflictError`→409 and `AccountNotFoundError`→401.
- No schema/migration changes; no new dependencies.

## Self-Check: PASSED
- `lib/replay.ts` — FOUND
- `lib/accounts.ts` — FOUND
- `tests/unit/replay.test.ts` — FOUND
- `tests/integration/link-merge.test.ts` — FOUND
- commit `6f003a4` — FOUND
- commit `7c5678e` — FOUND

---
*Phase: 06-email-auth*
*Completed: 2026-10-05*
