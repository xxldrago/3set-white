---
phase: 11-rfm-segments-targeting
plan: 01
type: execute
wave: 1
completed: "2026-10-31"
requirements: [SEG-01, SEG-02, SEG-05]
---

# Plan 01 — Pure RFM derivation + user_rfm migration — Summary

**Status:** Complete

## What was built
- `lib/analytics/rfm.ts` — pure module (no prisma/next/react/env): `daysBetweenMsk`, `recencyDaysOf`, `frequencyOf`, `monetaryOf`, `vipUserIds`, `vipThresholdValue`, `assignSegment`, `buildSnapshot`, `buildSnapshots`, `DEFAULT_THRESHOLDS`, `SEGMENT_SLUGS`, types. Imports only `./time`.
- `tests/unit/analytics-rfm.test.ts` — 26 pure unit tests, all green, no DB.
- Prisma `UserRfm` model + migration `20261031113119_phase11_user_rfm` (D-10 one-way door approved).

## Verification
- `npx tsc --noEmit` — clean.
- `vitest run tests/unit/analytics-rfm.test.ts` — 26/26 passed.

## Files modified
- `lib/analytics/rfm.ts`
- `tests/unit/analytics-rfm.test.ts`
- `prisma/schema.prisma`
- `prisma/migrations/20261031113119_phase11_user_rfm/migration.sql`
