---
phase: 11-rfm-segments-targeting
plan: 03
type: execute
wave: 3
completed: "2026-10-31"
requirements: [SEG-02, SEG-03, SEG-04, SEG-05]
---

# Plan 03 — Segments UI/API, broadcast targeting, users drill-down — Summary

**Status:** Complete

## What was built
- `/admin/segments` page + `SegmentCards` (7 cards, D-06 order, icons, links to `/admin/users?segment=`) + `SegmentThresholdsForm` (5 inputs, save → PUT, status messages) + `SegmentBadge`.
- AdminNav + admin-auth `segments` section (administrator + manager).
- `GET /api/admin/segments/:name/count` (recipients with chatId; `all` supported; invalid → 404).
- `GET/PUT /api/admin/segments/thresholds` (admin-only PUT, zod validation, returns `{ thresholds, recompute }`).
- Broadcast route extended: body `{ body, segment? }` (back-compat bare string); recipients filtered by segment.
- `BroadcastComposer` audience dropdown + count preview; `app/admin/broadcast/page.tsx` calls `loadSegments()` and passes segments.
- `loadAdminUsersTable(segment?)` left-join user_rfm + RFM columns; `adminSearchUsers(q, segment?)` AND-composes; users page reads `?segment=` with removable badge + RFM columns.
- `lib/i18n/messages/ru.ts` — 34+ new keys (i18n test green).
- `tests/unit/admin-segments-contract.test.ts` — 9 tests, all green.

## Verification
- `npx tsc --noEmit` — clean.
- Phase tests: 45/45 passed (rfm 26 + loaders 10 + contract 9).

## Files modified
- components/admin/SegmentCards.tsx, SegmentThresholdsForm.tsx, SegmentBadge.tsx
- app/admin/segments/page.tsx, app/admin/broadcast/page.tsx, app/admin/users/page.tsx
- app/api/admin/segments/[name]/count/route.ts, app/api/admin/segments/thresholds/route.ts
- app/api/admin/broadcast/route.ts, app/api/admin/users/search/route.ts
- components/admin/AdminNav.tsx, BroadcastComposer.tsx, UserSearchForm.tsx, UserSearchResults.tsx
- lib/admin-auth.ts, lib/admin-service.ts, lib/i18n/messages/ru.ts
- tests/unit/admin-segments-contract.test.ts
