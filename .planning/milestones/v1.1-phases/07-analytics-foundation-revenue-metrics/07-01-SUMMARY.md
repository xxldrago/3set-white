---
phase: 07-analytics-foundation-revenue-metrics
plan: "01"
subsystem: database
tags: [prisma, postgres, migration, analytics, timezone, europe-moscow, vitest]

# Dependency graph
requires: []
provides:
  - "Order.providerCost (nullable, no default) — ANL-12 cost-capture column"
  - "daily_metrics table (MSK day @db.Date primary key, daily aggregates)"
  - "artemida_balance_snapshots table (daily ARTEMIDA wallet balance, ANL-14 groundwork)"
  - "lib/analytics/time.ts — MSK day primitives every later Phase 7 plan imports"
affects: [07-02, 07-03, 07-04, 07-05, phase-08]

# Actuals (#2632) — chars/4 over the realized diff (262 added lines / 12 292 chars).
actuals:
  tokens: 3073
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Compute the Moscow calendar day in JS, never in SQL (D-15)"
    - "Instant helper (timestamp windows) vs date-key helper (@db.Date) kept strictly separate"
    - "Purely additive migration DDL so `migrate deploy` is safe on a live DB"

key-files:
  created:
    - lib/analytics/time.ts
    - tests/unit/analytics-time.test.ts
    - prisma/migrations/20261021064134_analytics_phase7/migration.sql
  modified:
    - prisma/schema.prisma

key-decisions:
  - "Checkpoint Task 1 (one-way schema door) resolved as `ship-now` by locked decisions D-08/D-12 plus the ROADMAP dependency (ANL-12 in Phase 7, ANL-05/ANL-13 consumers in Phase 8) — no new user prompt"
  - "providerCost stays nullable with NO default: NULL is the D-08 coverage signal, never 0"
  - "mskDayStartInstant and mskDateKey remain two distinct helpers; pinned by test to differ in UTC date components"
  - "mskMonthLabel/addMonths implemented as pure string math (no Date object) to avoid month-length/timezone drift"
  - "ArtemidaBalanceSnapshot.capturedFrom kept unmapped, matching the RESEARCH prescriptive schema verbatim (column name `capturedFrom`)"

patterns-established:
  - "MSK day discipline: JS computes the label/instant; Postgres only compares"
  - "Analytics helper module shape: small pure lib, no Prisma import, no side effects"

requirements-completed: [ANL-12, ANL-15]

coverage:
  - id: D1
    description: "Additive analytics schema applied locally: orders.provider_cost (nullable), daily_metrics, artemida_balance_snapshots; migration is forward-only-safe DDL"
    requirement: "ANL-12"
    verification:
      - kind: integration
        ref: "DATABASE_URL='postgresql://test:test@127.0.0.1:5432/test' npx prisma migrate status → 'Database schema is up to date!'; psql information_schema query confirms provider_cost (nullable) + both tables"
        status: pass
    human_judgment: false
  - id: D2
    description: "MSK day primitives (MSK_OFFSET_MS, mskDayLabel, mskDayStartInstant, mskDateKey, pgTimestamp, mskMonthLabel, addMonths) with verified values and Intl 2020–2030 cross-check"
    requirement: "ANL-15"
    verification:
      - kind: unit
        ref: "tests/unit/analytics-time.test.ts#analytics/time — MSK primitives (11 tests)"
        status: pass
      - kind: other
        ref: "npx tsc --noEmit (exit 0)"
        status: pass
    human_judgment: false

duration: 8min
completed: 2026-10-21
status: complete
---

# Phase 7 Plan 1: Analytics Foundation Summary

**Additive `providerCost` + `daily_metrics` + `artemida_balance_snapshots` schema applied locally and MSK day primitives pinned by verified-value tests with a 0-mismatch Intl 2020–2030 cross-check.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-10-21T06:36:00Z
- **Completed:** 2026-10-21T06:44:30Z
- **Tasks:** 3 (Task 1 checkpoint resolved without a prompt; Tasks 2–3 executed)
- **Files modified:** 4 (3 created, 1 modified)

## Accomplishments

- `prisma/schema.prisma`: `Order.providerCost Int? @map("provider_cost")` inserted after `balanceUsed` (nullable, no default — D-08 null gap preserved), plus `model DailyMetric` (`day DateTime @id @db.Date`) and `model ArtemidaBalanceSnapshot`.
- `prisma/migrations/20261021064134_analytics_phase7/migration.sql` generated and applied to the local test DB; DDL is purely additive — one nullable `ADD COLUMN`, two `CREATE TABLE`, no data rewrites and no destructive statements (T-07-01-01 mitigation satisfied).
- Generated Prisma client now exposes `Order.providerCost` and both new models (verified in `generated/prisma/models/`).
- `lib/analytics/time.ts` ships all seven exports with the "compute the day in JS, never in SQL" contract and the explicit `mskDayStartInstant` vs `mskDateKey` warning.
- `tests/unit/analytics-time.test.ts`: 11 tests green — verified values, instant/date-key split, month windows (incl. leap-year February), and the Intl `Europe/Moscow` cross-check over every 40th day from 2020 to 2030 at four intra-day offsets (0 mismatches, 368 samples).
- Full suite: **479 passed / 54 files** (baseline 468 + 11 new); `npx tsc --noEmit` exits 0.

## Task Commits

Each task was committed atomically:

1. **Task 1: Confirm walking the one-way analytics schema door (D-08)** — checkpoint, no commit. Resolved as `ship-now`; see Decisions Made.
2. **Task 2: Apply the analytics foundation schema** - `3e3d10a` (feat)
3. **Task 3a: MSK day primitives — failing test (RED)** - `4aa7995` (test)
4. **Task 3b: MSK day primitives — implementation (GREEN)** - `7cb62ba` (feat)

_No REFACTOR commit — the implementation needed no cleanup._

**Plan metadata:** committed separately with this SUMMARY (see completion report).

## Files Created/Modified

- `prisma/schema.prisma` — `Order.providerCost` + `DailyMetric` + `ArtemidaBalanceSnapshot`
- `prisma/migrations/20261021064134_analytics_phase7/migration.sql` — additive DDL
- `lib/analytics/time.ts` — MSK day primitives (new)
- `tests/unit/analytics-time.test.ts` — verified-value + Intl cross-check suite (new)

## Decisions Made

- **Task 1 checkpoint resolved without a prompt.** The plan's `checkpoint:decision` (one-way schema door) was already decided during discuss-phase: `07-CONTEXT.md` locks **D-08** (no retro-backfill of `providerCost`; the coverage flag renders the null gap honestly) and **D-12** (storage = `daily_metrics` + `artemida_balance_snapshots` + `Order.providerCost`), and `ROADMAP.md` assigns **ANL-12** to Phase 7 with Phase 8 consumers (ANL-05/ANL-13). Option `ship-now` was therefore taken as the settled answer, not re-asked.
- `providerCost` is nullable with no default, per D-08 — `0` would erase the null gap.
- `mskDayStartInstant` and `mskDateKey` implemented as distinct exports with JSDoc caveats; the test suite asserts their UTC date components differ by one day.
- `mskMonthLabel`/`addMonths` use pure string arithmetic (no `Date` object), so month lengths and timezones cannot drift.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `prisma migrate dev` did not regenerate the client**
- **Found during:** Task 2 (schema application)
- **Issue:** The plan states `prisma migrate dev` "re-runs `prisma generate`", but under Prisma 7.10.0 it only wrote/applied the migration — `generated/prisma/models/` still lacked `DailyMetric`/`ArtemidaBalanceSnapshot` and `Order.ts` had no `providerCost`. Task 2's acceptance criterion ("the generated client includes the new field/models") and every later plan's type-check depended on it.
- **Fix:** Ran `DATABASE_URL=… npx prisma generate` explicitly; confirmed `generated/prisma/models/{DailyMetric,ArtemidaBalanceSnapshot}.ts` exist and `Order.ts` carries `providerCost` (46 references).
- **Files modified:** none tracked (`generated/` is gitignored at `.gitignore:45`)
- **Verification:** `ls generated/prisma/models | grep -Ei "DailyMetric|Artemida"` → both present; `npx tsc --noEmit` exit 0
- **Committed in:** `3e3d10a` (schema + migration; regenerated client is untracked build output)

**2. [Rule 1 - Bug] Own test assertion in the "never interchangeable" case was wrong**
- **Found during:** Task 3 (GREEN run)
- **Issue:** The RED-phase test asserted the two helpers are exactly 24h apart; they are 3h apart (`2026-10-19T21:00Z` vs `2026-10-20T00:00Z`). The real landmine is the differing UTC **date component**, not the elapsed time, so the assertion tested the wrong property.
- **Fix:** Replaced the 86 400 000 ms division with explicit `toISOString().slice(0,10)` assertions (`2026-10-19` vs `2026-10-20`), keeping the `mskDayLabel` equality checks.
- **Files modified:** `tests/unit/analytics-time.test.ts`
- **Verification:** `npx vitest run tests/unit/analytics-time.test.ts` → 11 passed
- **Committed in:** `7cb62ba` (GREEN commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both were necessary for the task's own acceptance criteria; no scope creep, no schema or helper-semantics changes.

## Issues Encountered

- `prisma generate` is not implied by `migrate dev` on Prisma 7.10.0 — later Phase 7 plans that touch the schema should call `prisma generate` explicitly (and CI should). Documented above as a deviation.
- `.planning/STATE.md` already had an uncommitted modification when this plan started; it was left untouched (the orchestrator owns STATE/ROADMAP writes).

## User Setup Required

None — no external service configuration required. The migration must run via `prisma migrate deploy` in the container entrypoint on deploy (existing convention, forward-only).

## Next Phase Readiness

- Schema floor is in place for 07-02 (rollup), 07-03/07-04 (analytics queries), 07-05 (providerCost capture); all can import `lib/analytics/time.ts`.
- `providerCost` is NULL for every pre-Phase-7 order by design (D-08); consumers must compute the "N из M" coverage flag from `providerCostOrders / paidOrders`, never backfill.
- Phase 8 (ANL-05/ANL-13) can consume `providerCost` without another schema change.

---
*Phase: 07-analytics-foundation-revenue-metrics*
*Completed: 2026-10-21*

## Self-Check: PASSED

- All 4 planned artifacts exist on disk (schema, migration, time.ts, test file).
- All task commits present: `3e3d10a`, `4aa7995`, `7cb62ba`.
- TDD gates: RED `4aa7995` precedes GREEN `7cb62ba`; no REFACTOR needed.
- Task 2 verify re-run: `migrate status` up to date; migration.sql has 3 `provider_cost` matches and 2 `CREATE TABLE`; `psql` confirms the column is nullable + both tables.
- Task 3 verify re-run: `npx vitest run tests/unit/analytics-time.test.ts` → 11 passed.
- Plan-level verify re-run: `npm test` → 479 passed (54 files); `npx tsc --noEmit` → exit 0.
