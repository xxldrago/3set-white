---
status: complete
phase: 08-unit-economics-retention
source: 08-01-SUMMARY.md, 08-02-SUMMARY.md, 08-03-SUMMARY.md
started: 2026-10-24T12:00:00Z
updated: 2026-10-24T12:45:00Z
---

## Current Test

[testing complete]

## Tests

### 1. «Юнит-экономика» section & LTV cards
expected: AnalyticsSection wrapper + LtvCards (three compact cards, per-card windows, D-01 under-amortization marker, no fabricated date)
result: pass
source: automated
coverage_id: D1

### 2. MarginCards & BurnRunwayCards
expected: MarginCards (coverage-meta badge + three costed-subset cards, Intl minus for negative margin) and BurnRunwayCards (2-up grid, three-state runway sub, balance from payload only)
result: pass
source: automated
coverage_id: D2

### 3. Burn/runway 30-day fixed window
expected: Burn/runway 30-day fixed window with coverage count and runwayReason-driven subs on the §6.7 payload
result: pass
source: automated
coverage_id: D3

### 4. RetentionCards & ChurnTable
expected: RetentionCards (three period cards, absolute counts always in subs, no color semantics) and ChurnTable (six columns, derived window label, empty-state panel, single-empty-month keeps its row)
result: pass
source: automated
coverage_id: D4

### 5. Churn table window derivation
expected: Churn table window derivation matches MrrWaterfall (shared trailingMonthLabels payload, reused Phase 7 window keys)
result: pass
source: automated
coverage_id: D5

### 6. i18n keys and contract tests
expected: Exactly 44 new admin.analytics* keys (43 locked + analyticsLtvGrossHistSubActive), all referenced by literal t() calls; no cost/balance/user data in component sources
result: pass
source: automated
coverage_id: D6

## Summary

total: 6
passed: 6
issues: 0
pending: 0
skipped: 0

## Gaps

[none]
