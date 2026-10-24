---
phase: 08-unit-economics-retention
plan: 01
subsystem: analytics
tags: [retention, churn, ltv, margin, burn, runway, pure-module, vitest]

requires:
  - phase: 07-analytics-foundation-revenue-metrics
    provides: PaidOrderRow, cashOf, buildKeyTerms cursor, keyRefOf, totalMrrAt, MSK time helpers
provides:
  - "lib/analytics/retention.ts — TermEvent chain, classifyTerm grace, retentionForWindow"
  - "lib/analytics/economics.ts — LTV/margin/burn/runway pure arithmetic"
  - "tests/unit/analytics-retention.test.ts (16) + analytics-economics.test.ts (11)"
affects:
  - 08-02 loaders (loadLtv/loadRetention/loadMargin/loadBurnRunway/loadChurnTable)
  - 08-03 UI cards/table consuming exact-rational payloads

actuals:
  tokens: 8224
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Pure analytics modules: no prisma/next/react; fixture-pinned vitest, no DB"
    - "Cursor identity: buildKeyTermEvents mirrors series.ts:103-108; invariant vs buildKeyTerms"
    - "Division guards: denominator === 0 ? null : … (mrr.ts house style); never || fabrication"
    - "Exact rationals cross the pure-module boundary; Math.round/×100 only in render"

key-files:
  created:
    - lib/analytics/retention.ts
    - lib/analytics/economics.ts
    - tests/unit/analytics-retention.test.ts
    - tests/unit/analytics-economics.test.ts
  modified: []

key-decisions:
  - "A1 lostMrr uses finalAmount×30/days (D-07 literal), not cashOf — wallet-covered churn still contributes"
  - "A2 liveExpiry extends only the latest term per keyRef; historical terms untouched"
  - "A6/A7 activeAtStart is order-bearing coverage incl. 0₽ bonus terms; churnedKeys ∩ activeAtStart"
  - "economics helpers take pre-aggregated sums (loaders own aggregation); no second cashOf formula"

patterns-established:
  - "Pattern 2 invariant: events.at(-1).end === buildKeyTerms(...).termEnd per keyRef"
  - "Half-open retention windows [start, endExclusive); month-start ends belong to next month only"
  - "Burn gates: windowOrders>0 ∧ costed===window ∧ distinctDays≥7; real zero cost → burn=0"

requirements-completed: [ANL-04, ANL-05, ANL-06, ANL-07, ANL-13, ANL-14]

coverage:
  - id: D1
    description: "Term-event derivation with buildKeyTerms-identical cursor + grace classification"
    requirement: ANL-06
    verification:
      - kind: unit
        ref: "tests/unit/analytics-retention.test.ts#invariant vs buildKeyTerms"
        status: pass
      - kind: unit
        ref: "tests/unit/analytics-retention.test.ts#classifyTerm grace boundary"
        status: pass
    human_judgment: false
  - id: D2
    description: "Retention window metrics — half-open months, cohort clamp, A1 lostMrr, null rates"
    requirement: ANL-04
    verification:
      - kind: unit
        ref: "tests/unit/analytics-retention.test.ts#cohort clamp / half-open / zero bases / A1"
        status: pass
    human_judgment: false
  - id: D3
    description: "LTV gross/predictive/net pure arithmetic with null-on-zero guards"
    requirement: ANL-05
    verification:
      - kind: unit
        ref: "tests/unit/analytics-economics.test.ts#LTV gross/predictive/net"
        status: pass
    human_judgment: false
  - id: D4
    description: "Margin / cost-per-key over costed subset; wallet-only negative legal"
    requirement: ANL-13
    verification:
      - kind: unit
        ref: "tests/unit/analytics-economics.test.ts#gross margin / margin %"
        status: pass
    human_judgment: false
  - id: D5
    description: "Burn/runway gates (D-14/D-15) with floor-on-exact-burn"
    requirement: ANL-14
    verification:
      - kind: unit
        ref: "tests/unit/analytics-economics.test.ts#burn gates / runway"
        status: pass
    human_judgment: false
  - id: D6
    description: "Revenue-churn lost-MRR money base (D-07 literal via lostMrrOf + retention lostMrr)"
    requirement: ANL-07
    verification:
      - kind: unit
        ref: "tests/unit/analytics-economics.test.ts#lostMrrOf + retention A1 fixture"
        status: pass
    human_judgment: false

duration: 4min
completed: 2026-10-24
status: complete
---

# Phase 08 Plan 01: Unit Economics & Retention Core Summary

**Pure retention + economics derivation locked: term-event cursor identical to buildKeyTerms, inclusive 7-day grace, cohort-clamped churn, D-07 lost-MRR, and LTV/margin/burn/runway with null-on-zero guards — 27 fixture tests green, no DB.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-10-24T09:34:28Z
- **Completed:** 2026-10-24T09:38:24Z
- **Tasks:** 2/2
- **Files modified:** 4 created

## Accomplishments

- `lib/analytics/retention.ts` emits one `TermEvent` per new|renew chain op with cursor math mirroring `series.ts:103-108`; invariant test proves last-event end ≡ `buildKeyTerms` termEnd per keyRef.
- `classifyTerm` pins inclusive 7-day grace (±1 ms fixture), pending-in-grace (A5), upgrade≠renewal + win-back (D-09), A2 liveExpiry on latest term only.
- `retentionForWindow` half-open months, A6 cohort clamp (`churnedKeys ≤ activeAtStart`), A1 lostMrr = Σ finalAmount×30/days (not cashOf), null rates on zero bases (D-07/D-08/D-09).
- `lib/analytics/economics.ts` exports ten pure helpers: LTV hist/pred/net, margin/margin%/cost-per-key, burn/runway, lostMrrOf — all exact rationals, house-style null guards, D-14/D-15 burn gates including real-zero → 0 and floor-on-exact runway.

## Task Commits

Each task was committed atomically:

1. **Task 1: Term-event derivation + retention window (TRACER)** - `17fd03c` (feat)
2. **Task 2: Economics arithmetic pure module** - `18b96a5` (feat)

**Plan metadata:** (pending docs commit)

## Files Created/Modified

- `lib/analytics/retention.ts` — TermEvent, TermOutcome, classifyTerm, buildKeyTermEvents, RetentionWindow/Result, retentionForWindow
- `lib/analytics/economics.ts` — ltvGrossHistorical, ltvPredictive, ltvNet, grossMarginOf, marginPctOf, costPerKeyOf, burnPerDayOf, runwayDaysOf, lostMrrOf
- `tests/unit/analytics-retention.test.ts` — 16 pure fixtures (invariant, grace, upgrade, A1/A2/A5/A6, half-open, multi-term, zero bases)
- `tests/unit/analytics-economics.test.ts` — 11 pure fixtures (LTV×3, margin×2, cost/key, burn gates, runway×2, lostMrrOf, null costed)

## Decisions Made

- Followed plan/RESEARCH verbatim for cursor emission and classifyTerm.
- economics helpers take pre-computed sums (no row walks except `lostMrrOf`); cashOf is documented as the LTV/margin money base for loaders — no second formula introduced.
- Left `tests/unit/analytics-mrr.test.ts:190` baseline untouched (expected 4000 vs 3600, Phase 7 CR-01).

## Deviations from Plan

None - plan executed exactly as written.

Minor test-fixture fix (not a plan deviation): A2 multi-term liveExpiry must be later than the *last* multi-term end (not the single-term end) — corrected in the same Task 1 commit before green.

## Threat Flags

None — pure modules import no prisma/env/artemida; no new network/auth/file surface. T-08-01-01 (cursor) and T-08-01-03 (grace) mitigated by fixtures; T-08-01-02 satisfied (no secret-bearing imports); T-08-01-SC N/A (zero package installs).

## Known Stubs

None.

## Verification Results

```
DATABASE_URL=… npx vitest run tests/unit/analytics-retention.test.ts tests/unit/analytics-economics.test.ts
✓ analytics-retention.test.ts (16)
✓ analytics-economics.test.ts (11)
Test Files  2 passed (2)
Tests       27 passed (27)
```

Purity: no prisma/next/react imports in either module.

## Self-Check: PASSED

- FOUND: lib/analytics/retention.ts
- FOUND: lib/analytics/economics.ts
- FOUND: tests/unit/analytics-retention.test.ts
- FOUND: tests/unit/analytics-economics.test.ts
- FOUND: 17fd03c (task 1)
- FOUND: 18b96a5 (task 2)
