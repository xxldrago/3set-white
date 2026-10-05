---
phase: 05-admin-deploy
plan: 03
subsystem: admin-broadcast
tags: [broadcast, telegram, outbox, prisma, nextjs, vitest]
requires:
  - phase: 05-admin-deploy
    provides: administrator role guard and AdminConfirmPanel
provides:
  - phase5_broadcast migration and Broadcast status model
  - deduplicated Notification fan-out with worker delivery
  - administrator-only broadcast BFF and composer UI
affects: [05-07, deploy]
tech-stack:
  added: []
  patterns:
    - owning chat resolution via User.chatId ?? User.telegramId
    - terminal Telegram 400/403 versus retryable errors with retry_after backoff
    - bulk createMany fan-out with unique dedupe keys
key-files:
  created:
    - prisma/migrations/20261005021951_phase5_broadcast/migration.sql
    - lib/broadcast.ts
    - app/api/admin/broadcast/route.ts
    - app/admin/broadcast/page.tsx
    - components/admin/BroadcastComposer.tsx
    - components/admin/BroadcastStatusChip.tsx
    - tests/unit/broadcast.test.ts
  modified:
    - prisma/schema.prisma
    - lib/outbox.ts
    - lib/worker.ts
    - lib/bot-payments.ts
    - components/admin/AdminConfirmPanel.tsx
    - tests/helpers/fake-sender.ts
    - lib/i18n/messages/ru.ts
decisions:
  - Broadcasts remain enqueue-only and use the existing Notification queue, never synchronous Telegram sends.
  - A Telegram 400/403 is terminal per recipient; 429 retry_after and other transient failures use worker backoff.
metrics:
  duration: ~15min
  completed: 2026-10-05
  status: complete
actuals:
  tokens: 6359
  tasks: 3
  commits: 4
---

# Phase 05 Plan 03: Broadcast Summary

**Administrator broadcasts are now deduplicated Notification jobs delivered in bounded worker batches to each user's owning Telegram chat, with terminal blocked-chat handling and queue-state UI.**

## Accomplishments

- Added and applied `20261005021951_phase5_broadcast` against the requested PostgreSQL database.
- Added `Broadcast`/`BroadcastStatus`, bulk `createMany({ skipDuplicates: true })` fan-out, and `broadcast:{id}:{userId}` dedupe keys.
- Wired broadcast dispatch into the existing worker drain; plain text is capped at `BOT_REPLY_CAP`, targets only `chatId ?? telegramId`, and never accepts a caller-supplied chat.
- Classified 400/403 as terminal and 429/5xx/network failures as retryable, honoring Telegram `retry_after` when present; counters and derived queued/sending/sent/failed status are updated safely.
- Added administrator-only BFF/page guards, two-step primary confirmation, literal status labels, and failure retry UI without echoing the broadcast body or provider errors.
- Added database-backed dispatch, dedupe, fallback-chat, status, and error-classification coverage.

## Verification

- `npx tsc --noEmit` — passed.
- `DATABASE_URL=postgresql://alekseimikhalkin@127.0.0.1:5432/setwhite npx vitest run tests/unit` — 36 files / 340 tests passed.
- `npx prisma migrate status` — database schema up to date, including `phase5_broadcast`.

## Task Commits

1. `084ee6a` — add queued broadcast delivery path and migration
2. `78c4ac3` — account broadcast outcomes and retry hints
3. `c3d0baf` — add administrator broadcast composer
4. `8910e1d` — make failed broadcast retry actionable

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Critical reliability] Added explicit broadcast outcome accounting and Telegram retry hints**
- **Found during:** Task 2
- **Issue:** The existing generic Notification result shape did not retain Telegram `retry_after`, and terminal broadcast results would otherwise be marked done without incrementing broadcast failure counters.
- **Fix:** Added optional `retryAfterSec`, terminal/success counter updates, finished status transitions, and worker backoff propagation.
- **Files modified:** `lib/bot-payments.ts`, `lib/broadcast.ts`, `lib/worker.ts`
- **Commit:** `78c4ac3`

## Known Stubs

None.

## Threat Flags

None — the new endpoint and Telegram delivery path are the surfaces specified by the plan's threat model and are guarded by the administrator role, server-side ownership resolution, plain-text sending, dedupe, and terminal failure policy.

## Self-Check: PASSED

- Migration file exists and was applied.
- All four plan commits are present in git history.
- `SUMMARY.md` exists at the required path.
- `STATE.md` and `ROADMAP.md` were not modified.

---
*Phase: 05-admin-deploy*
*Completed: 2026-10-05*
