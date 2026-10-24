---
phase: 08-unit-economics-retention
plan: 02
subsystem: analytics
tags: [loaders, prisma, postgres, ltv, margin, burn, runway, retention, churn, vitest, db-backed]

requires:
  - phase: 08-unit-economics-retention
    provides: retention.ts (buildKeyTermEvents/retentionForWindow/classifyTerm), economics.ts (ltv/margin/burn/runway pure arithmetic)
  - phase: 07-analytics-foundation-revenue-metrics
    provides: PaidOrderRow, cashOf, keyRefOf, totalMrrAt, computeArppu, MSK time helpers, loadKpis windowing, loadWaterfall month-slot math
provides:
  - "lib/analytics/service.ts — loadLtv, loadMargin, loadBurnRunway, loadRetention, loadChurnTable + trailingMonthLabels (all §6.7 shapes)"
  - "tests/unit/analytics-phase8-loaders.test.ts — 12 DB-backed rows against real Postgres"
affects:
  - 08-03 UI cards/table consuming the five §6.7 payloads + the getBalance-in-loadBurnRunway source scan
  - Phase 9/10 (cohort matrix) reuse of trailingMonthLabels / retentionForWindow windowing

actuals:
  tokens: 9960     # chars/4 over the realized diff (aa3b835 + 7a0ff3b, 39839 chars)
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Loader = thin DB seam: service.ts owns every prisma query + PAID filter; pure modules (retention.ts/economics.ts) trust input rows (Pattern 1)"
    - "Shared month-slot helper: trailingMonthLabels extracted from loadWaterfall math — churn table and waterfall can never disagree"
    - "Balance isolation: artemida.getBalance() inside loadBurnRunway only, .then(unlimited→null).catch(() => null)"
    - "Trial filtering before event build (D-10): keyCache isTrial refs drop orders whose keyRefOf matches"
    - "Null-vs-0 discipline: costs stay null (never zero-filled), rates null on zero denominators, 0 always real"

key-files:
  created:
    - tests/unit/analytics-phase8-loaders.test.ts
  modified:
    - lib/analytics/service.ts

key-decisions:
  - "trailingMonthLabels = exact loadWaterfall month-slot math extracted verbatim; loadWaterfall refactored to call it (output-identical, pinned by reconciliation test)"
  - "loadLtv takes NO period (D-04); gross chall-time from loadPaidOrders in JS (single query, cashOf stays the only money formula)"
  - "loadBurnRunway fixed 30 MSK days (D-14) ignoring ?period; balance = getBalance().then(unlimited→null).catch(() => null) — never rejects the loader"
  - "costed-subset discipline: providerCost !== null filters for net LTV / margin / burn; coverage counts reported, not zero-filled"
  - "coverageFrom = mskDayLabel of earliest costed paidAt (A4) — label discipline, never new Date(label) as a window bound"

patterns-established:
  - "DB-backed fixture harness (from analytics-rollup.test.ts): OWNER BigInt range 200000342..345, cleanup() in beforeAll/beforeEach/afterAll, makeOrder() factory, vi.spyOn(artemida,'getBalance') + vi.restoreAllMocks()"
  - "Window identity: loadRetention start = mskDayStartInstant(windowStartDay(period)) = loadKpis fromInstant — same 7/30/90 MSK days"
  - "runwayDays = floor(exact burnPerDay); runwayReason 'no-burn' | 'no-balance' | null drives the sub-line"

requirements-completed: [ANL-04, ANL-05, ANL-06, ANL-07, ANL-13, ANL-14]

coverage:
  - id: D1
    description: "trailingMonthLabels extracted from loadWaterfall — output-identical month slots shared by churn table"
    requirement: ANL-07
    verification:
      - kind: unit
        ref: "tests/unit/analytics-phase8-loaders.test.ts#Test 1"
        status: pass
    human_judgment: false
  - id: D2
    description: "loadLtv §6.7 shape: grossHistorical/grossPredictive/net with null-vs-0, activePayers D-01 marker, coverageFrom label"
    requirement: ANL-04
    verification:
      - kind: unit
        ref: "tests/unit/analytics-phase8-loaders.test.ts#Test 2"
        status: pass
      - kind: unit
        ref: "tests/unit/analytics-phase8-loaders.test.ts#Test 3"
        status: pass
      - kind: unit
        ref: "tests/unit/analytics-phase8-loaders.test.ts#Test 4"
        status: pass
    human_judgment: false
  - id: D3
    description: "loadMargin costed-subset margin/marginPct/costPerKey incl. wallet-only legal negative margin (D-13)"
    requirement: ANL-13
    verification:
      - kind: unit
        ref: "tests/unit/analytics-phase8-loaders.test.ts#Test 5"
        status: pass
      - kind: unit
        ref: "tests/unit/analytics-phase8-loaders.test.ts#Test 6"
        status: pass
    human_judgment: false
  - id: D4
    description: "loadBurnRunway 30-day coverage gate, balance isolation (reject/unlimited), real-zero burn"
    requirement: ANL-14
    verification:
      - kind: unit
        ref: "tests/unit/analytics-phase8-loaders.test.ts#Test 7"
        status: pass
      - kind: unit
        ref: "tests/unit/analytics-phase8-loaders.test.ts#Test 8"
        status: pass
      - kind: unit
        ref: "tests/unit/analytics-phase8-loaders.test.ts#Test 9"
        status: pass
    human_judgment: false
  - id: D5
    description: "loadRetention trial filter (D-10), §6.7 shape, KPI-window identity"
    requirement: ANL-06
    verification:
      - kind: unit
        ref: "tests/unit/analytics-phase8-loaders.test.ts#Test 10"
        status: pass
    human_judgment: false
  - id: D6
    description: "loadChurnTable month slots reconcile with loadWaterfall; zero expiring → null rate, real zeros elsewhere"
    requirement: ANL-07
    verification:
      - kind: unit
        ref: "tests/unit/analytics-phase8-loaders.test.ts#Test 11"
        status: pass
      - kind: unit
        ref: "tests/unit/analytics-phase8-loaders.test.ts#Test 12"
        status: pass
    human_judgment: false

duration: 4min
completed: 2026-10-24
status: complete
---

# Phase 08 Plan 02: DB-Backed §6.7 Loaders Summary

**Five loaders (loadLtv/loadMargin/loadBurnRunway/loadRetention/loadChurnTable) + shared trailingMonthLabels appended to lib/analytics/service.ts, consuming the 08-01 pure core and proven by 12 DB-backed test rows against real Postgres — balance isolation, trial filter, coverage gates and month-slot reconciliation all pinned.**

## Performance

- **Duration:** 4 min (implementation was completed in the prior wave's execution run; verification + closeout re-ran the full gate here)
- **Started:** 2026-10-24T19:46:03Z (Task 1 commit)
- **Completed:** 2026-10-24T10:31:39Z (closeout)
- **Tasks:** 2/2
- **Files modified:** 2 (1 modified, 1 created)

## Accomplishments

- `trailingMonthLabels(orders, now)` extracted verbatim from `loadWaterfall`'s month-slot math (service.ts:154-178) and exported; `loadWaterfall` refactored to call it — reconciliation test proves the two 6-month blocks can never disagree.
- `loadLtv()` — zero `?period` dependence (D-04): all-time gross from `loadPaidOrders()` in JS, predictive ARPPU(30) ÷ logo churn(30), net over the costed subset with `coverageFrom` = MSK label of earliest costed `paidAt`; `activePayers` (D-01 under-amortization marker) capped by `grossHistoricalPayers`.
- `loadMargin(period)` — windowed exactly like `loadKpis`; costed-only margin/marginPct/costPerKey with coverage counts; wallet-only order stays in the costed set (legal negative margin, D-13).
- `loadBurnRunway()` — fixed 30 MSK days (D-14); `getBalance()` called once via `Promise.all` with `.then(unlimited→null).catch(() => null)` (D-15); coverage gate (100 % costed + ≥ 7 distinct costed days) enforced; `runwayDays = floor(balance / exact burn)`; reads no `daily_metrics` / `artemida_balance_snapshots` (D-16).
- `loadRetention(period)` / `loadChurnTable()` — trial-filtered (D-10) via `loadKeyCacheState()`; retention window start identical to `loadKpis`; churn months use half-open `[monthStart, min(nextMonthStart, now))` per row.
- DB-backed harness mirrors `analytics-rollup.test.ts`: OWNER `200000342..345`, cleanup in `beforeAll`/`beforeEach`/`afterAll`, `makeOrder()` factory, `vi.spyOn(artemida, 'getBalance')` + `vi.restoreAllMocks()`.

## Task Commits

1. **Task 1: trailingMonthLabels extraction + loadLtv + loadMargin with DB-backed test harness (TRACER)** - `aa3b835` (feat)
2. **Task 2: loadBurnRunway + loadRetention + loadChurnTable with balance isolation and trial-filter rows** - `7a0ff3b` (test)

**Plan metadata:** (pending docs commit - this closeout)

_Note: task commits were consolidated in the prior execution run — Task 1's commit carried the full loader implementation plus Tests 1-6; Task 2's commit added Tests 7-12. Impl and tests for Task 2 share commit `aa3b835`'s loader code._

## Files Created/Modified

- `lib/analytics/service.ts` — appended Phase 8 loader block (~331 lines): `LtvData`/`MarginData`/`BurnRunwayData`/`RetentionData`/`ChurnTableData` payload types, `trailingMonthLabels`, private `loadKeyCacheState`, `withoutTrialOrders`, `loadLtv`, `loadMargin`, `loadBurnRunway`, `loadRetention`, `loadChurnTable`; `loadWaterfall` refactored to use the extracted helper; module header extended with the D-16 note (lines 29-31).
- `tests/unit/analytics-phase8-loaders.test.ts` — 12 DB-backed rows (Tests 1-12) covering shape parity, null-vs-0, costed subsets, negative margin, coverage gates, balance isolation (resolve/reject/unlimited), trial filter, and loadChurnTable↔loadWaterfall reconciliation.

## Decisions Made

- Extracted month-slot math verbatim rather than re-deriving — the reconciliation test (Test 1 / Test 11) is the reversibility proof.
- `loadPaidOrders()` in JS for all-time LTV at MVP scale instead of a second `$queryRaw` aggregate (RESEARCH §Derivation 3) — `cashOf` stays the only money formula.
- `runwayReason` distinguishes `'no-burn'` (null/0 burn) from `'no-balance'` (null/0 balance) — the UI sub-line contract lives in the payload, not the component.
- `withoutTrialOrders` keeps `keyRefOf`-null rows (no trial match possible) — the trial filter can never drop orders without key identity.

## Deviations from Plan

None — plan executed as written. Both task verify commands pass; the full loader suite is green.

Minor observation (not a deviation): the prior execution run consolidated Task 2's loader implementation into Task 1's `feat` commit; Task 2's commit is test-only (`7a0ff3b`). The wave-gate outcome is identical and both acceptance criteria sets pass.

## Threat Flags

None — no new network endpoint, auth path, file access, or schema change. `artemida.getBalance` is the phase's only network call and appears inside `loadBurnRunway` only (verified by grep: `lib/analytics/service.ts:449`; the other callers `lib/admin-stats.ts:43` and `lib/analytics/rollup.ts:121` are pre-existing Phase 7 code). T-08-02-05 mitigation exercised by Test 8's `.mockRejectedValue` row.

## Known Stubs

None — every §6.7 field is either computed or `null`; no placeholder values reach the payload.

## Verification Results

```
DATABASE_URL=… npx vitest run tests/unit/analytics-phase8-loaders.test.ts
✓ tests/unit/analytics-phase8-loaders.test.ts (12 tests)   — plan verify command, exit 0

Wave gate (plan 08-02):
DATABASE_URL=… npx vitest run tests/unit/analytics-phase8-loaders.test.ts tests/unit/analytics-retention.test.ts tests/unit/analytics-economics.test.ts
✓ analytics-phase8-loaders.test.ts (12)
✓ analytics-retention.test.ts (16)
✓ analytics-economics.test.ts (11)
Test Files  3 passed (3) | Tests  39 passed (39)

Full-suite gate (no NEW failures):
DATABASE_URL=… npm test
Test Files  1 failed | 65 passed (66)
Tests       1 failed | 570 passed (571)
✗ the single failure is the pinned baseline: tests/unit/analytics-mrr.test.ts:190
  ("expected 4000 to be 3600", Phase 7 CR-01 stale expectation) — NOT touched by this plan.
```

`artemida.getBalance` isolation verified by source scan: the only call in the new loader code is `lib/analytics/service.ts:449` inside `loadBurnRunway`.

## Self-Check: PASSED

- FOUND: lib/analytics/service.ts (Phase 8 loader block present, getBalance only at :449)
- FOUND: tests/unit/analytics-phase8-loaders.test.ts (12 rows, DB-backed)
- FOUND: aa3b835 (Task 1 feat commit)
- FOUND: 7a0ff3b (Task 2 test commit)
- FOUND: loader suite 12/12 green; wave gate 39/39 green; full suite = 570 pass + 1 baseline failure only