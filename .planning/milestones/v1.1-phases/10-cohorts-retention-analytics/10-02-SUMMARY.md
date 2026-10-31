---
phase: 10-cohorts-retention-analytics
plan: 02
type: execute
wave: 2
completed: "2026-10-29"
requirements: [COH-01, COH-02, COH-03, COH-04, COH-05]
---

# Plan 02 — Cohort loaders in service.ts — Summary

**Status:** Complete

## What was built
- `loadRegistrationCohorts(channel)` and `loadPayerCohorts(channel, deviceBucket)` added to `lib/analytics/service.ts`, following the established loader pattern (Promise.all user/order scans + pure derivation). Payer loader loads all users (no createdAt filter) so payers who registered >12mo ago but paid recently are retained.
- `tests/unit/analytics-phase10-loaders.test.ts` — 12 DB identity tests, all green.

## Verification
- `npx tsc --noEmit` — clean.
- `vitest run tests/unit/analytics-phase10-loaders.test.ts` — 12/12 passed.

## Files modified
- `lib/analytics/service.ts`
- `tests/unit/analytics-phase10-loaders.test.ts`
