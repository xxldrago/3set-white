---
phase: 04-support-retention
verified: 2026-10-03T22:50:00Z
status: human_needed
score: 14/14 must-haves verified
behavior_unverified: 4
re_verification: false
behavior_unverified_items:
  - truth: "Live Telegram bot support flow: «Поддержка» menu → next text/photo creates a ticket with a downloaded screenshot"
    test: "In the real bot, tap «Поддержка», then send a text and (separately) a photo"
    expected: "A ticket appears in /support, the photo as an inline thumbnail; a caption-less photo gets the keyed fallback subject"
    why_human: "Telegraf handler + real Bot API getFileLink/file_id round-trip cannot run in the node-only unit suite; only the gate/claim/bounds logic is unit-tested"
  - truth: "Live reminder push: key expiring ≤3d receives the reminder in Telegram with the correct button"
    test: "Have a key expire in ≤3 days; wait for the daily tick (or POST /api/cron/remind with CRON_SECRET) and observe the chat"
    expected: "One reminder per key per day; trial → «Купить» (tariff:start); non-trial → «Продлить» (key:renew:{keyId}), and tapping it renews the correct key"
    why_human: "Real Bot API push to a real chat cannot be asserted in unit tests (04-VALIDATION manual-only)"
  - truth: "Attachment downscale visual quality (5 MiB screenshot → ≤1600px WebP)"
    test: "Upload a large screenshot and open the thread thumbnail"
    expected: "Legible thumbnail within the 1600px cap, no visible artifacts"
    why_human: "Visual judgment; no render/image-quality harness exists"
  - truth: "Standalone worker + upload-dir boot (instrumentation → startWorker → reminder tick; UPLOAD_DIR writable)"
    test: "Run the production standalone image; verify the worker starts, the reminder tick runs once on boot, and UPLOAD_DIR is writable"
    expected: "Worker starts once (no double tick), upload volume persists attachments across restarts"
    why_human: "Runtime/Docker boot behavior; not covered by unit tests"
coincidental_reliance_items: []
human_verification:
  - test: "Live bot support flow (menu arm → text/photo → ticket + screenshot)"
    expected: "Ticket in the unified queue with the photo attached; caption-less photo uses the keyed fallback subject"
    why_human: "Real Telegram Bot API getFileLink/file_id download; unit suite is node-only"
  - test: "Live expiry reminder push + button"
    expected: "≤3d key gets one push/day; trial → buy, non-trial → renew the right key id"
    why_human: "Real Bot API push; manual-only per 04-VALIDATION.md"
  - test: "Attachment downscale visual quality"
    expected: "Legible ≤1600px thumbnail"
    why_human: "Visual judgment"
  - test: "Standalone worker / upload-dir boot"
    expected: "Worker + reminder tick start once; UPLOAD_DIR writable/persistent"
    why_human: "Runtime/Docker behavior"
---

# Phase 4: Support & Retention Verification Report

**Phase Goal:** Пользователь получает помощь из любого канала и не забывает продлить подписку.
**Verified:** 2026-10-03T22:50:00Z
**Status:** human_needed (0 gaps / 0 blockers — automated checks all pass; 4 pre-declared manual-only items remain)
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Пользователь создаёт обращение из бота и из кабинета; единая очередь со статусами open/answered/closed | ✓ VERIFIED | Cabinet `POST /api/tickets` and bot `bot.on(["text","photo"])` both call the single `createTicket` (`lib/tickets-service.ts:82`); both channel heads confirmed (`app/api/tickets/route.ts:92`, `lib/bot.ts:547`). Status enum + transitions tested (`tickets-service.test.ts`). Live Telegram head is a manual caveat. |
| 2 | Пользователь прикрепляет фото/скриншот к тикету из бота и из кабинета | ✓ VERIFIED | One `lib/attachments.ts` pipeline for both channels; cabinet route + bot `getFileLink → fetch → normalizeImage → saveAttachment` (`lib/bot.ts:523-537`); `Attachment` persisted via descriptor. Magic-byte tests pass. |
| 3 | Ответ поддержки приходит и в бот, и в кабинет | ✓ VERIFIED | Admin reply writes support message + enqueues Notification (`app/api/admin/tickets/[id]/reply/route.ts:54-65`); worker drains to owning chat (`dispatchTicketNotification`); cabinet thread renders support bubbles (`TicketThread.tsx`). Tests assert exactly-one enqueue and owning-chat targeting. |
| 4 | Пользователь получает push-напоминание в Telegram за 3 дня до истечения с кнопкой продления | ✓ VERIFIED | `listExpiringKeys` window `(now, now+3d]` incl. trials (`lib/reminders-service.ts:36-52`); per-day dedupe key; `buildReminderPush` non-trial→`key:renew:{keyId}`, trial→`tariff:start` (`lib/ticket-notify.ts:104-126`). Tests pass. Live push is a manual caveat. |
| 5 | Attachment type/size enforced by magic bytes, not client MIME | ✓ VERIFIED | `normalizeImage` keys on `sharp.metadata().format` allow-list {jpeg,png,webp}; 5 MiB pre-decode cap (`lib/attachments.ts:57-94`); routes ignore `File.type`. Test: rejects non-image buffer. |
| 6 | Attachment serve gated owner-or-admin; non-owner 404, nosniff, no stored-path leak | ✓ VERIFIED | `getOwnedAttachment` owner/admin join (`lib/tickets-service.ts:372-388`); route returns 404 before any read; headers nosniff + private + inline (`app/api/tickets/[id]/attachments/[attachmentId]/route.ts:42-60`). Tests assert 404-no-read and no path in headers. |
| 7 | Ticket/attachment IDOR: non-owned ≡ 404 | ✓ VERIFIED | Ownership joins on `getTicketForUser`, `appendUserMessage`, `markTicketRead`, `getOwnedAttachment`; tests "non-owner reply/mark-read/serve → 404". |
| 8 | Admin gate = env allow-list only; non-admin → 404 | ✓ VERIFIED | `requireAdminSession`/`isAdmin` parse `ADMIN_TELEGRAM_IDS` (`lib/session.ts:49-73`); routes map `AdminError`→404. Test "404s a valid non-admin session and mutates nothing". |
| 9 | Reply fan-out idempotent: exactly one notification per message; owning chat only | ✓ VERIFIED | `enqueueNotification` upsert on UNIQUE `dedupeKey` `ticket:{id}:{messageId}`; dispatch resolves `String(user.chatId ?? user.telegramId)` from the message's owner. Tests: one row per message, distinct per new message, chatId fallback, never another chat. |
| 10 | Reminder per-day idempotent (no double send) | ✓ VERIFIED | `remind:{keyId}:{YYYY-MM-DD}` + upsert; test "exactly one notification per key for two same-day scans" and "+1 on a different UTC day". |
| 11 | Bot creates tickets only via the service; no Prisma ticket writes outside the service | ✓ VERIFIED | `grep` for `prisma.(ticket|ticketMessage|attachment).create|update...` outside `lib/tickets-service.ts` → none; only `createTicket` callers are the bot and cabinet route. |
| 12 | renew/upgrade callback data migrated to key id | ✓ VERIFIED | `bot.action(/^key:renew:(.+)$/)` / `key:upgrade:(.+)$` re-resolve via `precheckOwnedKey`; key-link buttons emit `key:renew:${key.id}`. No `key:renew:\d+` index form remains; test round-trips a cuid. |
| 13 | Support reply never sent inline; sender-less drain leaves rows pending | ✓ VERIFIED | No `sendMessage` in `app/`; admin reply enqueues only (test asserts `botMock.telegram.sendMessage` not called); `drainOutbox` returns before claiming when no sender. |
| 14 | Reminder cron route closed (503) without secret; timing-safe 401 | ✓ VERIFIED | `app/api/cron/remind/route.ts:32-41` — 503 when unset, length-guarded `timingSafeEqual` 401. |

**Score:** 14/14 truths verified (4 present+wired behaviors have no automated exercise — see Human Verification; not counted as failures per phase caveats).

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `prisma/schema.prisma` | Ticket/TicketMessage/Attachment/Notification + enums + User state | ✓ VERIFIED | All models present (`schema.prisma:168-244`); migration `20261003105129_phase4_support` exists |
| `lib/tickets-service.ts` | Single ticket read/write path | ✓ VERIFIED | 388 lines; create/list/get/reply/mark-read/transition/close/claim/owned-attachment; no Next imports |
| `lib/attachments.ts` | Magic-byte validate + downscale + confined storage | ✓ VERIFIED | 126 lines; sharp metadata allow-list, WebP ≤1600, path-escape guard |
| `lib/ticket-notify.ts` | Reply + reminder builders/dispatch | ✓ VERIFIED | 175 lines; owning-chat resolution, retryable taxonomy |
| `lib/reminders-service.ts` | Expiring scan + dedupe + dispatcher re-export | ✓ VERIFIED | 90 lines; 3-day window, per-UTC-day key |
| `lib/outbox.ts` | Notification queue helpers | ✓ VERIFIED | enqueue/claim/state writers; order Outbox untouched |
| `lib/worker.ts` | Delivery drain + reminder tick | ✓ VERIFIED | `drainDeliveryNotifications`, `runReminderScan`, `startReminderTick` wired into `startWorker` |
| `instrumentation.ts` | Worker bootstrap | ✓ VERIFIED | lazy `startWorker()` guarded by runtime/build phase |
| `app/api/tickets/route.ts`, `[id]/messages`, `[id]/read`, `[id]/attachments/[attachmentId]`, `admin/tickets/[id]/reply`, `admin/tickets/[id]/close` | 6 BFF handlers | ✓ VERIFIED | All present; build registers all routes |
| `app/api/cron/remind/route.ts` | Secret-gated fallback | ✓ VERIFIED | 503/401/200 |
| `app/support/page.tsx`, `new/page.tsx`, `[id]/page.tsx` | Cabinet surfaces | ✓ VERIFIED | Session-gated RSCs; build registers all three |
| `components/TicketList.tsx`, `TicketStatusChip.tsx`, `CreateTicketForm.tsx`, `SupportEntry.tsx`, `TicketThread.tsx`, `TicketComposer.tsx`, `MarkReadOnOpen.tsx`, `AttachmentImage.tsx` | UI components | ✓ VERIFIED | All present and wired into pages |
| `lib/session.ts` | AdminError/requireAdminSession/isAdmin | ✓ VERIFIED | Env allow-list |
| `lib/support-intake.ts` | Pure gate + content bounds | ✓ VERIFIED | 54 lines |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `app/api/tickets/route.ts` | `lib/tickets-service.createTicket` | `normalizeImage`→`saveAttachment`→descriptor | ✓ WIRED | Confirmed import + call |
| `lib/bot.ts` | `createTicket`/`beginSupportPrompt`/`clearSupportPrompt` | shared service | ✓ WIRED | Bot never writes Prisma tickets |
| admin reply route | `lib/outbox.enqueueNotification` | `ticket:{id}:{messageId}` | ✓ WIRED | Enqueue-only, no inline send |
| `lib/worker.ts` | `dispatchTicketNotification`/`dispatchReminder` | `drainDeliveryNotifications` | ✓ WIRED | Static imports after 04-08 |
| `lib/reminders-service.ts` | `enqueueNotification(REMIND_EXPIRY)` | `remind:{keyId}:{date}` | ✓ WIRED | Per-day UNIQUE |
| `markReminderTick`/`instrumentation` | `startWorker` | lazy dynamic import | ✓ WIRED | Build-time safe |
| `components/AttachmentImage.tsx` | gated attachment route | `src=/api/tickets/{id}/attachments/{aid}` | ✓ WIRED | Only gated URL; no stored path |
| `components/CreateTicketForm`/`TicketComposer`/`MarkReadOnOpen` | `/api/tickets...` | multipart/read POST | ✓ WIRED | No manual Content-Type |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| `app/support/page.tsx` | `rows` | `listTicketsForUser(BigInt(telegramId))` DB query | Yes | ✓ FLOWING |
| `app/support/[id]/page.tsx` | `thread` | `getTicketForUser` owner-joined DB query | Yes | ✓ FLOWING |
| `app/page.tsx` | `unreadCount` | `listTicketsForUser` reduce (try/catch → 0) | Yes | ✓ FLOWING |
| `AttachmentImage` | bytes | `readAttachment(attachment.path)` on gated route | Yes | ✓ FLOWING |
| `TicketThread` | `thread.messages` | DB query incl. attachments | Yes | ✓ FLOWING |
| reminder push | `key` | `prisma.keyCache.findFirst` by notification keyId/owner | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Full unit suite | `DATABASE_URL=… npx vitest run` | 30 files / 255 tests passed | ✓ PASS |
| Typecheck | `npx tsc --noEmit` | exit 0 | ✓ PASS |
| Production build + route registration | `npm run build` (inline throwaway env) | exit 0; `/api/tickets`, gated attachment, admin reply/close, `/api/cron/remind`, `/support`, `/support/[id]`, `/support/new` all registered | ✓ PASS |
| Magic-byte accept/reject | `tests/unit/ticket-attachments.test.ts` | 7 passed | ✓ PASS |
| Gated serve 404/200 + nosniff | `tests/unit/tickets-route.test.ts` | 21 passed | ✓ PASS |
| Reply fan-out dedupe + owning chat | `tests/unit/ticket-notify.test.ts` | 16 passed | ✓ PASS |
| Reminder per-day exactly-once | `tests/unit/reminder-cron.test.ts` | 4 passed | ✓ PASS |

### Probe Execution

No `scripts/*/tests/probe-*.sh` probes are declared by this phase; no migration/CLI probe contract applies. N/A.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| SUP-01 | 04-01, 04-04, 04-05, 04-06, 04-07 | Create from bot & cabinet; unified queue open/answered/closed | ✓ SATISFIED | Shared `createTicket`; list/thread UI; status transitions + reopen tested |
| SUP-02 | 04-02, 04-04, 04-05, 04-06, 04-07 | Photo/screenshot attachment from both channels | ✓ SATISFIED | `lib/attachments.ts` both channel heads; gated serve; tests |
| SUP-03 | 04-01, 04-03, 04-04, 04-06 | Support reply delivered to bot and cabinet (fan-out) | ✓ SATISFIED | Durable Notification queue + owning-chat worker dispatch + cabinet thread; tests |
| PAY-05 | 04-08 | Telegram push reminder 3 days before expiry with renew button | ✓ SATISFIED | `listExpiringKeys`/`enqueueReminderScan`/`buildReminderPush`/`dispatchReminder`; tests |

No orphaned requirements: REQUIREMENTS.md maps only PAY-05/SUP-01/02/03 to Phase 4, all covered by plans.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| `app/api/tickets/[id]/messages/route.ts` | 91 | Attachment file is written before the ownership join runs in `appendUserMessage`; a non-owner reply 404s but leaves an orphan file under the (unguessable cuid) ticket dir | ℹ️ Info | No data leak / no oracle (response is a plain 404); minor storage cleanup concern only |
| `app/api/tickets/route.ts` | 77 | Attachment saved under a generated scope before `createTicket`; a `no_user` result leaves an orphan file | ℹ️ Info | Same as above; unreachable for a valid session |

No `TBD`/`FIXME`/`XXX` debt markers in any phase-modified source file. No TODO/placeholder stubs. No Prisma ticket writes outside the service. No `sendMessage` in request handlers.

### Human Verification Required

1. **Live bot support flow** — In the real bot, tap «Поддержка», then send a text and a photo. Expected: tickets appear in `/support` with the screenshot as an inline thumbnail; caption-less photo uses the keyed fallback subject. (Real Bot API `getFileLink`/`file_id`.)
2. **Live expiry reminder push** — With a key expiring ≤3d, run the daily tick (or `POST /api/cron/remind` with `CRON_SECRET`). Expected: exactly one reminder/day; trial → buy CTA, non-trial → renew the correct key id.
3. **Attachment downscale visual quality** — Upload a large screenshot; confirm the thumbnail is legible at ≤1600px WebP.
4. **Standalone worker / upload-dir boot** — Run the production standalone image; confirm the worker + reminder tick start once and `UPLOAD_DIR` is writable/persistent.

### Gaps Summary

No gaps and no blockers. All 14 must-have truths are backed by source + tests, the full unit suite is 255/255 green, `tsc --noEmit` is clean, and `npm run build` registers every Phase 4 route. All adversarial checks pass: magic-byte (not client-MIME) enforcement, owner-or-admin gated serving with nosniff/no-path-leak, non-owned ≡ 404 IDOR boundaries, env-only admin allow-list, exactly-one reply notification per message delivered to the owning chat, per-UTC-day reminder idempotency, service-only ticket writes, and key-id renew/upgrade callbacks. The four remaining items are the phase's pre-declared manual-only verifications (live Telegram flows, visual quality, standalone boot) and are recorded as behavior-unverified rather than failures.

---

_Verified: 2026-10-03T22:50:00Z_
_Verifier: the agent (gsd-verifier)_
