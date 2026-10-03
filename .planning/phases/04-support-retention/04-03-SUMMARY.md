---
phase: 04-support-retention
plan: 03
subsystem: api
tags: [notifications, outbox, worker, dedupe, telegram, tickets, pnpm]

# Dependency graph
requires:
  - phase: 04-support-retention
    plan: 04-01
    provides: Ticket/TicketMessage/Attachment schema + sibling Notification table (dedupeKey UNIQUE)
  - phase: 03-payments
    provides: lib/outbox.ts claim discipline + lib/worker.ts drain + lib/bot-payments.ts TelegramSender/dispatch analog
provides:
  - Sibling Notification queue helpers (enqueueNotification / claimNextNotification / state writers)
  - Worker delivery drain for NOTIFY_TICKET_REPLY (and REMIND_EXPIRY once 04-08 wires it)
  - lib/ticket-notify.ts keyed builders + owning-chat dispatchTicketNotification
  - Wave-0 tests/helpers/fake-sender.ts shared capture/fail Telegram fake
affects: [04-04 BFF reply route, 04-05 cabinet unread, 04-07 bot intake, 04-08 expiry reminders]

# Actuals (#2632) — same estimateTokens scale (chars/4 over realized diff).
actuals:
  tokens: 6899
  tasks: 2
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Sibling queue on a non-order table reusing the Outbox claim discipline (candidate read + per-row conditional updateMany)"
    - "UNIQUE dedupeKey upsert (update:{}) for exactly-once enqueue"
    - "Owning-chat resolution String(user.chatId ?? user.telegramId) reused by notification dispatch"
    - "Optional dispatcher behind a lazy, non-literal dynamic import so a producer can ship before its consumer"

key-files:
  created:
    - lib/ticket-notify.ts
    - tests/unit/ticket-notify.test.ts
    - tests/unit/notifications-queue.test.ts
    - tests/helpers/fake-sender.ts
  modified:
    - lib/outbox.ts
    - lib/worker.ts
    - lib/i18n/messages/ru.ts

key-decisions:
  - "Notification queue writers are duplicated for the notification delegate rather than generalizing over a delegate — keeps the money-path Outbox untouched (RESEARCH Open Q2 LOCKED)"
  - "dispatchTicketNotification resolves the owner via Notification.ticketMessageId → TicketMessage → Ticket → User; chat is String(user.chatId ?? user.telegramId), never caller-supplied"
  - "Signature is dispatchTicketNotification(notificationId, send) per PLAN Task 1 (the RESEARCH sketch showed (job, send))"
  - "REMIND_EXPIRY rows are never claimed until 04-08 supplies dispatchExpiryReminder — a dispatcher-less row stays pending, never marked done"
  - "bot.ticketReply added and referenced by buildTicketReplyPush in the same commit (i18n completeness gate stays green)"

patterns-established:
  - "enqueueNotification upsert on dedupeKey (update:{}) — a second enqueue is a no-op"
  - "claimNextNotification single-winner via per-row conditional updateMany(status:'pending'→'processing')"
  - "sender-less drainOutbox returns before claiming any notification — delivery rows stay pending"
  - "Reminder dispatcher loaded lazily via a non-literal import specifier so tsc compiles before 04-08 adds lib/reminders-service.ts"

requirements-completed: [SUP-03]

coverage:
  - id: D1
    description: "A support reply notification can be enqueued idempotently (UNIQUE dedupeKey) and claimed exactly once by the worker"
    requirement: SUP-03
    verification:
      - kind: unit
        ref: "tests/unit/notifications-queue.test.ts#creates exactly one row for two enqueues with the same dedupeKey"
        status: pass
      - kind: unit
        ref: "tests/unit/notifications-queue.test.ts#returns the row once and null on a second claim while it is processing"
        status: pass
    human_judgment: false
  - id: D2
    description: "The reply push targets only the owning chat and reports a retryable failure instead of dropping the delivery"
    requirement: SUP-03
    verification:
      - kind: unit
        ref: "tests/unit/ticket-notify.test.ts#sends to the stored chatId of the owning user"
        status: pass
      - kind: unit
        ref: "tests/unit/ticket-notify.test.ts#falls back to telegramId when the owning user has no stored chatId"
        status: pass
      - kind: unit
        ref: "tests/unit/ticket-notify.test.ts#returns retryable_error (never drops) when the Telegram send throws"
        status: pass
    human_judgment: false
  - id: D3
    description: "A sender-less drain leaves delivery rows pending (never consumed or dropped)"
    requirement: SUP-03
    verification:
      - kind: unit
        ref: "tests/unit/notifications-queue.test.ts#leaves a pending ticket-reply notification pending when no sender is supplied"
        status: pass
    human_judgment: false

duration: 3min
completed: 2026-10-03
status: complete
---

# Phase 4 Plan 3: Support reply notification queue Summary

**Sibling `Notification` queue (UNIQUE dedupeKey upsert + single-winner claim) drained by the existing worker, plus `lib/ticket-notify.ts` keyed builders and owning-chat-only dispatch for support replies.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-10-03T11:45:01Z
- **Completed:** 2026-10-03T11:48:00Z
- **Tasks:** 2 (frontmatter `estimate.tasks` said 3; only two `<task>` elements exist — see Deviations)
- **Files modified:** 7

## Accomplishments

- `enqueueNotification` is idempotent on the UNIQUE `dedupeKey`; `claimNextNotification` is single-winner via the same per-row conditional `updateMany` as the order outbox — a retried reply route or a concurrent drain cannot double-deliver.
- `lib/ticket-notify.ts` builds keyed RU copy (`bot.ticketReply`, sliced to `BOT_REPLY_CAP`) and dispatches only to `String(user.chatId ?? user.telegramId)` resolved from the owning row — a caller cannot point a reply at another chat.
- `drainOutbox` now drains delivery notifications after the order-notify loops; a sender-less drain returns before claiming, so rows stay `pending` (never dropped). A send failure reschedules with the shared `backoffMs` taxonomy.
- Task 1 was TDD (RED `d33cff7` → GREEN `d5cc18c`); Task 2 was a tracer verified end-to-end before the wave closed (full suite 25 files / 207 tests green; `npx tsc --noEmit` clean).

## Task Commits

Each task was committed atomically:

1. **Task 1: Ticket-reply copy builders + owning-chat dispatch (TDD)** - `d33cff7` (test, RED) → `d5cc18c` (feat, GREEN)
2. **Task 2: Notification queue + worker drain (tracer)** - `b63ffb2` (feat)

**Plan metadata:** (this SUMMARY commit, docs)

_Note: Task 1 is TDD and has the RED→GREEN commit pair; Task 2 is a tracer whose end-to-end verify was re-run and passed._

## Files Created/Modified

- `lib/ticket-notify.ts` - `buildTicketReplyPush` + `dispatchTicketNotification` (owner-resolved chat, retryable taxonomy); imports `TelegramSender`/`NotifyDispatchResult`/`BOT_REPLY_CAP` from `lib/bot-payments.ts`
- `lib/outbox.ts` - `NOTIFY_TICKET_REPLY`/`REMIND_EXPIRY`, `NotificationInput`, `enqueueNotification`, `ClaimedNotification`, `claimNextNotification`, `markNotificationDone`, `rescheduleNotification`, `markNotificationFailed`
- `lib/worker.ts` - imports + `drainDeliveryNotifications` wired into `drainOutbox` after `drainNotifications`, plus `drainNotificationType` and the lazy `loadReminderDispatcher`
- `lib/i18n/messages/ru.ts` - `bot.ticketReply: 'Ответ поддержки:'`
- `tests/unit/ticket-notify.test.ts` - 9 builder/target/retry/skip vectors (DB-backed dispatch rows)
- `tests/unit/notifications-queue.test.ts` - 7 dedupe/claim/reschedule/state-writer/sender-less vectors
- `tests/helpers/fake-sender.ts` - shared capturing + failure-injectable `TelegramSender` fake

## Decisions Made

- **Duplicate writers over a generic delegate:** the notification state writers reuse the `markJobDone`/`rescheduleJob`/`markJobFailed` shape on the `notification` delegate instead of generalizing over both tables — keeps `lib/outbox.ts`'s order path byte-identical.
- **Owner resolution through the message:** the Notification row has no relation to `User`, so chat is resolved `Notification.ticketMessageId → TicketMessage → Ticket → User`; a missing notification/message/user is `skipped`.
- **Signature per PLAN:** `dispatchTicketNotification(notificationId, send)` (the 04-RESEARCH sketch showed `(job, send)`); the worker passes `job.id`.
- **Reminder branch is opt-in:** because `lib/reminders-service.ts` does not exist until 04-08, the reminder dispatcher is loaded via a **non-literal** dynamic import specifier. A literal `import("./reminders-service")` would fail `tsc --noEmit` today. When the module is absent, `REMIND_EXPIRY` rows are never claimed and remain `pending`.
- **`bot.ticketReply` lands with its referrer:** the key is added and referenced in the same GREEN commit so the i18n completeness gate never sees an unused key.

## Deviations from Plan

None - plan executed exactly as written. Two plan-internal inconsistencies were resolved by following the executable `<task>` elements: (a) frontmatter `estimate.tasks: 3` while the plan body defines 2 tasks — 2 were executed; (b) the RESEARCH snippet's `dispatchTicketNotification(job, send)` vs the PLAN Task 1 action's `(notificationId, send)` — the PLAN action was followed. No auto-fixes were required; the non-literal reminder import is the mechanism for the plan's explicit "guard the reminder branch behind a lazy import" instruction.

## Known Stubs

- `lib/worker.ts` `loadReminderDispatcher()` — returns `null` today because `lib/reminders-service.ts` does not exist; `REMIND_EXPIRY` notifications are therefore never drained and stay `pending`. **Intentional** per the plan: the reminder dispatcher lands in plan 04-08. This does not block 04-03's goal (ticket-reply delivery), which has its dispatcher wired.

## Issues Encountered

None. The dynamic reminder import was validated to be a silent no-op at runtime (the bot-payments drain calls it and the suite stays green).

## Threat Surface Scan

No new security-relevant surface beyond the plan's `<threat_model>`: the queue adds durable rows and the dispatch reuses the established owning-chat resolution. T-04-10 (owning chat), T-04-11 (dedupe/single-winner), T-04-12 (no lost delivery), T-04-13 (reply cap/keyed copy) are each covered by the tests listed in `coverage`.

## User Setup Required

None - no external service configuration required. (DB `postgresql://alekseimikhalkin@127.0.0.1:5432/setwhite` already provisioned; `notifications` table exists from 04-01.)

## Next Phase Readiness

- 04-04's admin reply route can call `enqueueNotification({ type: NOTIFY_TICKET_REPLY, dedupeKey: "ticket:{ticketId}:{messageId}", ticketId, ticketMessageId, userId })` right after `addSupportMessage`, with no Telegram call inline (D-57).
- 04-08 adds `lib/reminders-service.ts` exporting `dispatchExpiryReminder(notificationId, send)`, which the worker's lazy loader picks up automatically; `enqueueNotification({ type: REMIND_EXPIRY, dedupeKey: "remind:{keyId}:{YYYY-MM-DD}", keyId, userId })` via `reminderDedupeKey`.
- The sender-less drain guarantee means the cabinet/BFF can enqueue without a bot process and deliveries wait safely for the next Telegram-capable drain.

---
*Phase: 04-support-retention*
*Completed: 2026-10-03*

## Self-Check: PASSED

- FOUND: lib/ticket-notify.ts
- FOUND: lib/outbox.ts
- FOUND: lib/worker.ts
- FOUND: lib/i18n/messages/ru.ts
- FOUND: tests/unit/ticket-notify.test.ts
- FOUND: tests/unit/notifications-queue.test.ts
- FOUND: tests/helpers/fake-sender.ts
- FOUND: d33cff7 (Task 1 RED)
- FOUND: d5cc18c (Task 1 GREEN)
- FOUND: b63ffb2 (Task 2 tracer)
