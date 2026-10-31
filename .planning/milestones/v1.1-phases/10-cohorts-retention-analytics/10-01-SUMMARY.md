---
phase: 10-cohorts-retention-analytics
plan: 01
type: execute
wave: 1
completed: "2026-10-29"
requirements: [COH-01, COH-02, COH-03, COH-04, COH-05]
---

# Plan 01 — Pure derivation core (cohorts.ts) — Summary

**Status:** Complete

## What was built
- `lib/analytics/cohorts.ts` — pure module (no prisma/next/react/env): `channelOf`, `deviceBucketOf`, `trailingCohortMonths`, `buildRegistrationCohorts`, `buildPayerCohorts`, plus types/constants. Uses individual term spans for coverage (research Open Q A1).
- `tests/unit/analytics-cohorts.test.ts` — 21 pure unit tests, all green, no DB.

## Verification
- `npx tsc --noEmit` — clean.
- `vitest run tests/unit/analytics-cohorts.test.ts` — 21/21 passed.

## Files modified
- `lib/analytics/cohorts.ts`
- `tests/unit/analytics-cohorts.test.ts`
