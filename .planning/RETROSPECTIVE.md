# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.1 — Расширенная аналитика

**Shipped:** 2026-10-31
**Phases:** 5 | **Plans:** 17

### What Was Built
- Analytics foundation: `daily_metrics` rollup, nightly cron 03:00, backfill, `Order.providerCost`
- Unit economics & retention: LTV gross/net, renewal, churn, margin, burn-rate/runway
- Payment funnel: pending→paid→provisioned, errorCode breakdown, timing, expired-by-age
- Cohort matrices (registration + payer) with channel and device slices, 12×12, MSK boundaries
- RFM segments: `user_rfm` snapshot, 7 named segments, drill-down, broadcast targeting, configurable thresholds

### What Worked
- Pure derivation modules (`lib/analytics/*.ts`) with no Prisma/React imports made unit testing fast and reliable (no DB)
- Wave-based plan decomposition (pure core → loaders → UI/API) kept context manageable
- Reuse of Phase 7 primitives (cashOf, time helpers, PAID filter) avoided duplication in the analytics layer
- TDD tracer tasks caught integration issues early

### What Was Inefficient
- Free API quota limits interrupted research/planning agent runs, requiring retries
- Inline execution (manual) was needed when subagent completion signals were unreliable
- i18n unused-key gate required careful key management; pre-existing unused keys blocked the gate

### Patterns Established
- Wave 1 (tracer + checkpoint for one-way doors) → Wave 2 (loaders + DB tests) → Wave 3 (UI/API + contract tests)
- MSK calendar-day math in JS, never SQL
- `null` sentinel for unknown monetary (never zero-fill)
- `requireRole` guard on every admin page and API route (defense in depth)
- `force-dynamic` on all admin RSC pages

### Key Lessons
1. Pure modules + identity-pattern DB tests pin loader wiring without asserting hardcoded values
2. Checkpoint:decision tasks effectively gate one-way schema changes
3. Audit-integration step catches wiring gaps (e.g., NAV_SECTIONS omission) that plan-level checks miss

### Cost Observations
- Model mix: predominantly opus for planning/research, sonnet for execution
- Sessions: multiple (interrupted by quota), resumed via checkpoint files
- Notable: subagent quota limits were the main friction; manual inline execution was a reliable fallback

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Plans | Key Change |
|-----------|--------|-------|------------|
| v1.0 MVP | 6 | — | Initial build |
| v1.1 Расширенная аналитика | 5 | 17 | Added analytics layer (MRR, LTV, funnel, cohorts, RFM) |

*Updated after v1.1 milestone.*
