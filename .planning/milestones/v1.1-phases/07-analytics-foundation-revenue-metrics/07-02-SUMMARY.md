---
phase: 07-analytics-foundation-revenue-metrics
plan: "02"
subsystem: analytics
tags: [analytics, postgres, prisma, raw-sql, upsert, idempotency, cron, msk, europe-moscow, vitest]

# Dependency graph
requires:
  - phase: 07-analytics-foundation-revenue-metrics
    provides: "daily_metrics + artemida_balance_snapshots tables, Order.providerCost (07-01 migration); lib/analytics/time.ts MSK primitives"
provides:
  - "lib/analytics/series.ts — pure DailyAggregate/buildDailySeries + KeyTerm/buildKeyTerms shared term-chain engine"
  - "lib/analytics/rollup.ts — rollupDays(fromDay, toDay, source): windowed load → series → absolute-value idempotent upsert → balance snapshot"
  - "POST /api/cron/analytics under CRON_SECRET (503/401/200, timingSafeEqual, lazy imports, 7-day re-roll)"
  - "scripts/backfill-analytics.ts — idempotent tsx CLI (first-paid-day…yesterday, month-chunked) sharing the rollupDays engine"
  - "Dockerfile scripts/ copy + docs/DEPLOY.md §7 cron 5 3 * * * line and operator backfill command"
affects: [07-03, 07-04, 07-05, phase-08]

# Actuals (#2632) — chars/4 over the realized diff (56.9k chars added / 1520 lines).
actuals:
  tokens: 14200
  tasks: 3
  commits: 4

tech-stack:
  added: []
  patterns:
    - "Absolute-value upsert (SET col = EXCLUDED.col everywhere) — idempotent under cron/backfill re-runs and 12-way concurrency"
    - "JS-computed MSK day labels passed as string ::date params — never SQL-side day logic (D-15)"
    - "One shared compute engine (buildDailySeries inside rollupDays) consumed by cron route, backfill CLI, and future derivation code"
    - "Lazy await-import of env/logger/rollup in Next route handlers to keep runtime secrets out of the build-time module graph"

key-files:
  created:
    - lib/analytics/series.ts
    - lib/analytics/rollup.ts
    - app/api/cron/analytics/route.ts
    - scripts/backfill-analytics.ts
    - tests/unit/analytics-series.test.ts
    - tests/unit/analytics-rollup.test.ts
    - tests/unit/analytics-cron-route.test.ts
    - tests/unit/analytics-backfill.test.ts
  modified:
    - Dockerfile
    - docs/DEPLOY.md

key-decisions:
  - "Balance snapshot source is a rollupDays parameter ('cron' | 'backfill', default 'cron') instead of RESEARCH's single literal 'analytics-cron' — distinguishable provenance costs one argument and the researched 'DO NOTHING (yesterday wins)' semantics are unchanged"
  - "Order window in rollupDays is deliberately unbounded below: the term-chain ledger needs each active key's full history or a nightly 7-day re-roll would overwrite a full backfill's active_keys with window-limited values (documented in the module comment)"
  - "The backfill test's expected rows are computed from the live DB by an independent in-test recomputation (plain findMany + explicit per-day loops) instead of hardcoded table values, so DB state left by other test files cannot create false failures; a few hardcoded fixture spot-checks guard against a shared systematic bug"
  - "Rollup loads compensate/goodwill ONLY from TicketCompensation rows — referral grants store no day count (RESEARCH Open Q1); inferring them was explicitly not attempted"

patterns-established:
  - "Analytics rollup discipline: recompute from source rows, upsert absolute values, never increment"
  - "Independent-recomputation test pattern: expected = second code path over the same DB state + fixture-grounded spot checks"
  - "CLI scripts follow prisma/seed.ts shape: relative imports, main().catch().finally($disconnect), verify-chain console output"

requirements-completed: [ANL-15]

coverage:
  - id: D1
    description: "Pure daily series builder: DailyAggregate + buildDailySeries (one-pass MSK bucketing, cash contract, kind counters, providerCost coverage, term-chain activeKeys, newUsers, goodwillDays) + KeyTerm/buildKeyTerms for 07-04"
    requirement: "ANL-15"
    verification:
      - kind: unit
        ref: "tests/unit/analytics-series.test.ts#6 tests (fixture aggregates, term/renew/upgrade semantics, out-of-range exclusion, upgraded-key expiry)"
        status: pass
    human_judgment: false
  - id: D2
    description: "rollupDays writes exact absolute aggregates into daily_metrics via parameterized raw SQL, is idempotent on re-run, survives 12-way concurrency without double-counting, and snapshots yesterday's balance with DO NOTHING + graceful getBalance degradation"
    requirement: "ANL-15"
    verification:
      - kind: integration
        ref: "tests/unit/analytics-rollup.test.ts#4 tests (real Postgres: exact read-back, identical re-run, 12 concurrent runs → one row, snapshot first-reading-wins + failure path)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Nightly cron route POST /api/cron/analytics: closed by default (503 unset CRON_SECRET), 401 on missing/forged x-cron-secret via timingSafeEqual, 200 with the 7-day MSK re-roll window run idempotently through the same rollupDays"
    requirement: "ANL-15"
    verification:
      - kind: unit
        ref: "tests/unit/analytics-cron-route.test.ts#4 tests (401-no-rollup ×2, 503-disabled, 200-idempotent with window assertion)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Backfill CLI: first-paid-order-day…yesterday default range, month-chunked progress, days=/upserted= output, relative imports, shared rollupDays engine (D-14: no HTTP route, no admin button)"
    requirement: "ANL-15"
    verification:
      - kind: integration
        ref: "tests/unit/analytics-backfill.test.ts#3 tests (full-range run equals independent manual recomputation + fixture spot checks, re-run is a value no-op with DO-NOTHING snapshot, script contract static checks)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Deploy plumbing: Dockerfile runner stage copies /app/scripts into the image and docs/DEPLOY.md §7 carries the 5 3 * * * analytics cron line + operator backfill command + tsx presence check"
    requirement: "ANL-15"
    verification:
      - kind: other
        ref: "grep 'COPY --from=builder /app/scripts ./scripts' Dockerfile (line 52); grep '5 3 \\* \\* \\*' docs/DEPLOY.md (§7); RESEARCH §Backfill deploy-gap spec conformance review"
        status: pass
    human_judgment: false
  - id: D6
    description: "Manual reconciliation row (VALIDATION): production daily_metrics for a known past day equals a hand-written psql sum(final_amount − balance_used) over that MSK day"
    requirement: "ANL-15"
    verification: []
    human_judgment: true
    rationale: "Requires a deployed container against the production DB with real order history — a deploy-time operator step the plan itself defers out of this executor (Task 3 human-check). Structurally de-risked by the in-test independent recomputation over a real DB (D4); execution instructions live in 07-USER-SETUP.md."

duration: 36min
completed: 2026-10-21
status: complete
---

# Phase 7 Plan 2: Nightly Rollup Tracer Summary

**End-to-end nightly rollup proven on a real DB: pure MSK-day series builder → absolute-value idempotent upsert (12-way concurrency safe) → CRON_SECRET-gated route → month-chunked backfill CLI, with an independent-recomputation test proving "метрики за любой прошлый день совпадают с ручной сверкой"**

## Performance

- **Duration:** 36 min
- **Started:** 2026-10-21T06:45:00Z (tasks 1–2 by the first executor)
- **Completed:** 2026-10-21T07:21:41Z
- **Tasks:** 3 of 3 (tracer + 2 expansion tasks)
- **Files modified:** 10 (8 created, 2 modified)

## Accomplishments

- `lib/analytics/series.ts` (pure, no Prisma import): `DailyAggregate`, `buildDailySeries(orders, users, goodwill, fromDay, toDay)`, and the shared term-chain engine `KeyTerm`/`buildKeyTerms(paid)` with renew-extension semantics (`cursor = max(cursor ?? paidAt, paidAt) + days`), upgrades excluded from chain length, and deleted-key outcomes flowing through the same chain.
- `lib/analytics/rollup.ts`: `rollupDays(fromDay, toDay, source)` — unbounded-below windowed paid-order load (term-chain ledger needs full history), typed Prisma loads for orders/users/`TicketCompensation` goodwill, per-day single-row `$executeRaw` upserts with `SET col = EXCLUDED.col` on EVERY column (D-13 idempotence contract), and the `artemida_balance_snapshots` capture with `ON CONFLICT (day) DO NOTHING` plus a warn-and-continue `getBalance` failure path.
- `app/api/cron/analytics/route.ts`: `force-dynamic` POST handler, `safeEq` (Buffer length guard + `timingSafeEqual`), 503-when-unset / 401-on-forged, lazy `await import` of env/logger/rollup, 7-day MSK re-roll window (`now−7 … yesterday`).
- `scripts/backfill-analytics.ts`: tsx CLI with relative imports, default range `first paid order day … yesterday` (MSK), month-chunked progress logging with `days=… upserted=…` output, `source: "backfill"` plumbed to the snapshot — the same engine the cron route calls (D-14: CLI-only, no route).
- `Dockerfile` runner stage now copies `/app/scripts` (Pitfall 10); `docs/DEPLOY.md` §7 documents the `5 3 * * *` analytics cron line, the curl probe, the operator backfill command, and the `tsx --version` preflight.
- Tests: **17 new DB-backed/unit tests green** (series 6, rollup 4, cron route 4, backfill 3). Full suite **496 passed / 57 files** (07-01 baseline 479). `npx tsc --noEmit` exit 0.
- ANL-15 marked Complete in `.planning/REQUIREMENTS.md` (checked against the plan frontmatter and the shared-ID gate first).

## Task Commits

Each task was committed atomically:

1. **Task 1: End-to-end rollup slice — series builder + idempotent upsert (TRACER)** - `4810640` (feat)
2. **Task 2: Nightly cron route under CRON_SECRET (D-13)** - `97a72ac` (feat)
3. **Task 3: Backfill CLI + deploy plumbing (D-14, Dockerfile, DEPLOY.md)** - `fc95ecd` (feat)

_Plan executed this session by continuing an interrupted run: tasks 1–2 (4810640, 97a72ac) were completed by a prior executor; this session re-verified both (17 tests green) and resumed mid-Task-3._

**Plan metadata:** committed separately with this SUMMARY.

## Files Created/Modified

- `lib/analytics/series.ts` — pure per-day aggregates + shared KeyTerm engine
- `lib/analytics/rollup.ts` — rollupDays: series → absolute upsert → balance snapshot
- `app/api/cron/analytics/route.ts` — CRON_SECRET-gated nightly trigger
- `scripts/backfill-analytics.ts` — idempotent history backfill CLI
- `Dockerfile` — COPY scripts/ into the runner
- `docs/DEPLOY.md` — §7 analytics rollout + backfill runbook
- `tests/unit/analytics-{series,rollup,cron-route,backfill}.test.ts` — 17 tests
- `.planning/phases/07-…/07-USER-SETUP.md` — host-crontab + verification runbook (created, not committed in feat commits)

## Decisions Made

- **Balance snapshot `source` is a parameter** (`"cron" | "backfill"`, default `"cron"`) rather than RESEARCH's fixed `'analytics-cron'` literal — one argument buys per-source provenance for Phase 8 runway analysis; the researched `ON CONFLICT (day) DO NOTHING` (yesterday wins) semantics are unchanged.
- **Terminal-shell grumble aside, the rollup order window is unbounded below.** The nightly 7-day re-roll must see each active key's whole purchase history or it would stamp `active_keys` with window-limited values over a full backfill's rows; out-of-window orders still never emit money counters (their MSK days fall outside `[fromDay, toDay]`).
- **The backfill test derives expectations from the live DB** via an independent in-test recomputation instead of a hardcoded table (the DB may legitimately hold rows from other test files whose term chains reach into the fixture window), with hardcoded fixture spot-checks to break the symmetry of two implementations sharing a bug.
- Goodwill is reconstructed only from `TicketCompensation` rows — referral grants store no day count (RESEARCH Open Q1), recorded as an inherent data limitation rather than inferred.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Backfill idempotency test asserted against a-wiped baseline**
- **Found during:** Task 3 (first GREEN run of the new test)
- **Issue:** The "re-run is identical" test took its `before` snapshot from DB rows that the suite's `beforeEach` had already deleted, so the first run's freshly upserted rows failed the equality assertion.
- **Fix:** The test now performs its own first `rollupDays` run, asserts the result contract, and only then compares a second run's rows; a pre-existing balance-reading row is seeded explicitly so the DO-NOTHING path is exercised from the backfill source too.
- **Files modified:** `tests/unit/analytics-backfill.test.ts`
- **Verification:** `npx vitest run tests/unit/analytics-backfill.test.ts` → 3 passed
- **Committed in:** `fc95ecd` (Task 3 commit)

**2. [Rule 1 - Bug] Manual-recompute compared numeric `.getTime()` against `Date` instants**
- **Found during:** Task 3 (pre-commit typecheck)
- **Issue:** `tsc --noEmit` flagged 8 TS2365 errors in the self-written recompute loop (number-vs-Date comparisons).
- **Fix:** Window bounds now take `.getTime()`; typecheck exits 0 and all 3 tests still pass unchanged.
- **Files modified:** `tests/unit/analytics-backfill.test.ts`
- **Verification:** `npx tsc --noEmit` exit 0; `npx vitest run tests/unit/analytics-backfill.test.ts` → 3 passed
- **Committed in:** `fc95ecd` (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (2 self-authored test bugs)
**Impact on plan:** Both fixes were inside the new test file before its commit; no behavior, schema, or helper-semantics changes. No scope creep.

## Issues Encountered

- **Resumed from an interrupted execution.** The prior session committed tasks 1–2 but stopped mid-Task-3 (script, Dockerfile and DEPLOY.md fully written but uncommitted; no test file). This session resumed instead of redoing work, re-ran the tracer gate first (17 tests green across the three committed files), and did not rework committed code.
- `.planning/STATE.md` already carried an uncommitted orchestrator modification at start; left untouched (the orchestrator owns STATE/ROADMAP writes per this plan's execution mode).
- `ANL-12` remains **Pending** in `.planning/REQUIREMENTS.md` although the 07-01 summary's frontmatter lists it as completed — 07-01's executor evidently never ran `requirements.mark-complete`. Marking it was outside this plan's frontmatter (which declares only ANL-15), so it is left flagged here for the orchestrator.

## User Setup Required

**Host-cron configuration requires root access to the production server.**
See [07-USER-SETUP.md](./07-USER-SETUP.md) for: the crontab line `5 3 * * * … https://dash.3set.online/api/cron/analytics` (CRON_SECRET is already in the server `.env`), the 401/401/200 curl verification matrix, the operator backfill command with its `tsx --version` preflight, and the deploy-time manual reconciliation row.

## Next Phase Readiness

- `buildKeyTerms`/`KeyTerm` is exported for 07-04's MRR/waterfall module exactly as the plan's key-link required (one engine, no second implementation).
- `daily_metrics` rows through yesterday now exist for any range a query/UI plan (07-03) needs; the `providerCostOrders/paidOrders` coverage flag pattern (NULL = honest gap, D-08) is encoded in the aggregates.
- `artemida_balance_snapshots` accumulates a daily series (`source`-tagged) as ANL-14/Phase-8 runway groundwork.
- Deploy-time operator steps (crontab line, first backfill, psql reconciliation) remain open in `07-USER-SETUP.md`.

---
*Phase: 07-analytics-foundation-revenue-metrics*
*Completed: 2026-10-21*

## Self-Check: PASSED

- All 10 planned artifacts exist on disk (4 lib/scripts, 1 route, Dockerfile, DEPLOY.md edit, 4 test files) + 07-USER-SETUP.md + this SUMMARY.
- All task commits present: `4810640` (tracer), `97a72ac` (cron route), `fc95ecd` (backfill + deploy plumbing); plan metadata commit with this file.
- Task verifies re-run this session: series+rollup+cron-route → 14 tests green (tracer gate re-verified before expansion); backfill → 3 tests green.
- Plan-level verification re-run: all four files → 17 passed; full `npm test` → **496 passed (57 files)**; `npx tsc --noEmit` → exit 0.
- Restrictions honored: no new migration (07-01's applied); no new npm dependencies; no prettier run; STATE.md/ROADMAP.md untouched (orchestrator-owned); pre-existing STATE.md modification left as-is.

