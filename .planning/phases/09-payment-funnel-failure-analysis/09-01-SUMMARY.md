---
phase: 09-payment-funnel-failure-analysis
plan: 01
subsystem: analytics
tags: [funnel, payment-window, error-breakdown, timing, pure-module, vitest]

requires:
  - phase: 07-analytics-foundation-revenue-metrics
    provides: lib/analytics pure-module pattern (series.ts, mrr.ts guards), vitest harness
  - phase: 08-unit-economics-retention
    provides: tests/unit/analytics-retention.test.ts row() factory convention, exact-rational discipline
provides:
  - "lib/analytics/funnel.ts — PAYMENT_WINDOW_MS, FunnelRow, FUNNEL_STEPS, reach predicates, funnelOf, expiredCount, errorBreakdown, medianMs, meanMs, timingStats"
  - "tests/unit/analytics-funnel.test.ts — 16 pure fixtures, no DB"
affects:
  - 09-02 loaders (loadFunnel/loadExpired/loadErrorBreakdown/loadTimeToPay/loadTimeToProvision)
  - 09-03 UI sections consuming exact-rational payloads

actuals:
  tokens: 6255
  tasks: 2
  commits: 4

tech-stack:
  added: []
  patterns:
    - "Reach-based monotone funnel: stage membership from paidAt/provisionedKeyId/status, never current status alone"
    - "Documented-approximation header: schema-indistinguishable transition paths declared, not asserted as facts"
    - "Single hardcoded window constant (PAYMENT_WINDOW_MS) + strict-< ±1 ms boundary fixture"
    - "Null is the only unknown sentinel; real zero stays 0 (division guard on prev === 0)"

key-files:
  created:
    - lib/analytics/funnel.ts
    - tests/unit/analytics-funnel.test.ts
  modified: []

key-decisions:
  - "Stage criteria derived from verified state machine (orders-service.ts:456/483/493-498/524-539, callback route.ts:75-83); failed-implies-provisioning and keyless-refunded exclusion declared as DOCUMENTED APPROXIMATIONS in the module header"
  - "attempts/nextAttemptAt rejected as a provisioning discriminator — first-attempt terminal failures write 0/null, byte-identical to the paid→failed fallback"
  - "errorBreakdown keeps code: string | null (null preserved); tie-break code asc with null as '' → unknown group leads its tie block"
  - "timingStats scoped to successful chains only (status provisioned + paidAt + provisionedKeyId); paidToProvisioned uses the updatedAt proxy"
  - "medianMs computes the even-n mean of the middle pair in JS; no rounding anywhere in the pure layer"

patterns-established:
  - "Funnel ordering pinned by a reversed-input fixture (FUNNEL_STEPS tuple is the single source of order)"
  - "Real zero vs unknown: prev === 0 → null, count/prev === 0 → real 0"

requirements-completed: [ANL-08, ANL-09, ANL-10, ANL-11]

coverage:
  - id: D1
    description: "Reach-based funnel stages + exact-rational conversion/drop-off with null-on-zero-prev"
    requirement: ANL-08
    verification:
      - kind: unit
        ref: "tests/unit/analytics-funnel.test.ts#reach-based stage predicates"
        status: pass
      - kind: unit
        ref: "tests/unit/analytics-funnel.test.ts#funnelOf counts and conversions"
        status: pass
    human_judgment: false
  - id: D2
    description: "Point-in-time pending-by-age expired count with hardcoded 24h window"
    requirement: ANL-11
    verification:
      - kind: unit
        ref: "tests/unit/analytics-funnel.test.ts#expiredCount (+1ms/−1ms boundary, constant pin)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Raw errorCode breakdown over failed/canceled only"
    requirement: ANL-09
    verification:
      - kind: unit
        ref: "tests/unit/analytics-funnel.test.ts#errorBreakdown"
        status: pass
    human_judgment: false
  - id: D4
    description: "Successful-chain timing median/mean (createdAt→paidAt, paidAt→provisioned via updatedAt proxy)"
    requirement: ANL-10
    verification:
      - kind: unit
        ref: "tests/unit/analytics-funnel.test.ts#medianMs / meanMs / timingStats"
        status: pass
    human_judgment: false

duration: 3min
completed: 2026-10-27
status: complete
---

# Phase 09 Plan 01: Payment Funnel & Failure Analysis Core Summary

**Pure phase-9 derivation core locked: reach-based pending→paid→provisioning→provisioned funnel with exact-rational conversions, hardcoded 24h expired window with a ±1 ms strict-`<` boundary, raw-errorCode breakdown with null preserved, and successful-chain-only timing via the updatedAt proxy — 16 fixture tests green, no DB.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-10-27T08:10:09Z equivalent (first RED commit)
- **Completed:** 2026-10-27T08:11:27Z equivalent (final GREEN commit)
- **Tasks:** 2/2
- **Files modified:** 2 created (`lib/analytics/funnel.ts` 241 lines, `tests/unit/analytics-funnel.test.ts` 449 lines)

## Accomplishments

- `lib/analytics/funnel.ts` is a PURE module (zero imports — no prisma/next/react/lib-env) whose module header cites the verified state machine line references and declares the two schema-indistinguishable paths as **documented approximations**: the paid→failed fallback (`orders-service.ts:534`) inflates provisioning, and a keyless CHARGEBACKED-from-provisioning refunded row (`callback route.ts:76-78`) deflates it. `attempts`/`nextAttemptAt` explicitly rejected as a discriminator (`worker.ts:279-284/303` writes `0`/`null` on first-attempt terminal failure, identical to the fallback).
- `funnelOf` emits exactly four steps in `FUNNEL_STEPS` order with reach-based counts; conversion is the exact rational `count / prev` (null when `prev === 0`, real `0` otherwise) and `dropOff = 1 − conversion`; every rate is `null` for an empty funnel — never a fabricated `0` or `−∞`.
- `PAYMENT_WINDOW_MS = 24 * 60 * 60 * 1000` is the single hardcoded source (D-01); `expiredCount` uses strict `<` against `now − windowMs` (an order exactly on the boundary is NOT expired), pinned by a ±1 ms fixture pair and a constant-value test.
- `errorBreakdown` filters to `failed`/`canceled` only, groups raw `errorCode`, preserves `null` in the payload (the «unknown» label stays a render decision), and sorts count DESC / code ASC with null treated as `''`.
- `medianMs`/`meanMs`/`timingStats` compute exact rationals over successful chains only (`status === 'provisioned' && paidAt !== null && provisionedKeyId !== null`); `paidToProvisioned = updatedAt − paidAt` with the proxy rationale documented; empty sample → four nulls and `orders: 0`.

## Task Commits

Each task was committed atomically (TDD RED → GREEN per task):

1. **Task 1 RED: failing funnel derivation suite** — `8bc9d84` (test)
2. **Task 1 GREEN: pure funnel stage derivation** — `dbd1abf` (feat)
3. **Task 2 RED: failing errorBreakdown + timing suite** — `cbdac3b` (test)
4. **Task 2 GREEN: errorBreakdown + timing statistics** — `5daa2f7` (feat)

**Plan metadata:** docs commit below (SUMMARY + STATE + ROADMAP).

## Files Created/Modified

- `lib/analytics/funnel.ts` — `PAYMENT_WINDOW_MS`, `FunnelRow`, `FUNNEL_STEPS`/`FunnelStep`, `reachedPaid`, `reachedProvisioning`, `reachedProvisioned`, `FunnelStepRow`, `funnelOf`, `expiredCount`, `ErrorBreakdownRow`, `errorBreakdown`, `medianMs`, `meanMs`, `TimingStatPair`/`TimingStats`, `timingStats`
- `tests/unit/analytics-funnel.test.ts` — 16 pure fixtures: stage predicates (incl. the two approximation cases), 10/8/6/5 counts, zero-prev nulls, empty funnel, reversed-input ordering, expired ±1 ms boundary + custom window + constant pin, error grouping/tie-break/status filter/empty, median/mean, successful-chain timing, zero sample

## Decisions Made

- Stage semantics follow the plan's action spec + `must_haves` truth: `conversion = prev === 0 ? null : count / prev`. A count of `0` over a non-zero `prev` is a **real zero**, not unknown.
- `errorBreakdown` tie-break: equal counts sort by `code` ascending with `null` as `''`, so the unknown group leads its tie block (pinned by Test 2 and the grouping fixture).
- No imports at all in `funnel.ts` — the layer is dependency-free by construction, which is the strongest form of the T-09-01-02 mitigation.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Plan's Test 3 wording contradicted the action spec on zero-prev semantics**
- **Found during:** Task 1 GREEN (first test run failed: received `0`, expected `null`)
- **Issue:** The `<behavior>` line said "fixture where paid count = 0 while rows exist → conversion and dropOff null for the paid step". With `pending = 2` and `paid = 0`, the paid step's `prev` is 2, so the action spec (`prev === 0 ? null : count / prev`) yields conversion `0` — a real zero. The plan's `must_haves` truth and the action spec both define null only when the PREVIOUS step is zero.
- **Fix:** Rewrote Test 3 to pin both halves explicitly: paid step `conversion 0` / `dropOff 1` (real zero), provisioning step `conversion null` / `dropOff null` (prev `0` → unknown). Implementation unchanged from the action spec.
- **Files modified:** `tests/unit/analytics-funnel.test.ts`
- **Commit:** `dbd1abf`

**2. [Rule 1 - Bug] Plan's Test 1 expected ordering contradicted the documented tie-break**
- **Found during:** Task 2 RED authoring
- **Issue:** Test 1 listed `[api_down 3, timeout 2, null 2, manual 1]`, but Test 2 and the action spec both say null is treated as `''` on ties — so `null` (2) must precede `timeout` (2).
- **Fix:** Asserted `[api_down 3, null 2, timeout 2, manual 1]`, consistent with the tie-break rule pinned by Test 2.
- **Files modified:** `tests/unit/analytics-funnel.test.ts`
- **Commit:** `cbdac3b`

No other plan changes: no schema, no enum, no package installs, no env reads.

## Threat Flags

None — pure module, zero imports, no network/auth/file surface. T-09-01-01 mitigated by the stage-membership fixtures + approximation declaration; T-09-01-02 satisfied (dependency-free module); T-09-01-03 pin (`strict <`, ±1 ms); T-09-01-04 pin (updatedAt proxy under `status='provisioned'`); T-09-01-SC N/A (zero installs).

## Known Stubs

None.

## Verification Results

```
DATABASE_URL='postgresql://test:test@127.0.0.1:5432/test' npx vitest run tests/unit/analytics-funnel.test.ts
✓ tests/unit/analytics-funnel.test.ts (16)
Test Files  1 passed (1)
Tests       16 passed (16)
```

Full suite (`npm test`): `Test Files 1 failed | 67 passed (68)`, `Tests 1 failed | 597 passed (598)` — the single failure is the pinned pre-existing baseline `tests/unit/analytics-mrr.test.ts:190` (expected 3600, received 4000; Phase 7 CR-01 behavior is correct, untouched). No new failures. `npx tsc --noEmit` clean.

## Self-Check: PASSED

- FOUND: lib/analytics/funnel.ts
- FOUND: tests/unit/analytics-funnel.test.ts
- FOUND: 8bc9d84 (task 1 RED)
- FOUND: dbd1abf (task 1 GREEN)
- FOUND: cbdac3b (task 2 RED)
- FOUND: 5daa2f7 (task 2 GREEN)
