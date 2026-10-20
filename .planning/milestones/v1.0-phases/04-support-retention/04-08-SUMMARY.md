---
phase: 04-support-retention
plan: 08
subsystem: notifications
tags: [reminders, cron, worker, outbox, telegram, bot, i18n, dedupe]

# Dependency graph
requires:
  - phase: 04-support-retention
    plan: 04-03
    provides: Sibling Notification queue (enqueueNotification/claimNextNotification) + worker delivery drain + lib/ticket-notify.ts owning-chat dispatch
  - phase: 03-payments
    provides: lib/worker.ts tick/guard/unref pattern + Phase 3 renew/upgrade order flow + precheckOwnedKey
provides:
  - lib/reminders-service.ts — listExpiringKeys / reminderDedupeKey / enqueueReminderScan (+ dispatchExpiryReminder re-export)
  - lib/ticket-notify.ts — buildReminderPush + dispatchReminder
  - lib/worker.ts — runReminderScan + startReminderTick wired into startWorker start/stop
  - app/api/cron/remind/route.ts — secret-gated (503 disabled / 401 timing-safe / 200) fallback
  - lib/bot.ts — key-id renew/upgrade callbacks (A7) + tariff:start trial-reminder CTA
affects: [04-verify-work, future retention work touching reminder cadence/WINDOW_DAYS]

# Actuals (#2632) — same estimateTokens scale (chars/4 over realized diff).
actuals:
  tokens: 8403
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Per-key per-UTC-day reminder identity (remind:{keyId}:{YYYY-MM-DD}) as a UNIQUE Notification dedupeKey — exactly-once without a remindedAt column"
    - "Boot-run-then-daily unref'd tick (startReminderTick) mirroring startReconcileTick"
    - "Async-safe callback payloads: carry the entity id (keyId), never a list index; re-resolve ownership+trial server-side"
    - "Cron route clone: 503 when the secret is unset, timing-safe 401 otherwise, 200 on success"

key-files:
  created:
    - lib/reminders-service.ts
    - app/api/cron/remind/route.ts
    - tests/unit/reminder-cron.test.ts
  modified:
    - lib/ticket-notify.ts
    - lib/worker.ts
    - instrumentation.ts
    - lib/bot.ts
    - lib/i18n/messages/ru.ts
    - tests/unit/ticket-notify.test.ts

key-decisions:
  - "Reminder 'day' is UTC (A6 LOCKED): reminderDedupeKey slices the ISO date, making the dedupe deterministic regardless of server tz"
  - "enqueueReminderScan reports enqueued = keys processed (upsert attempts); the DB UNIQUE dedupeKey is the source of truth for exactly-once, so a second same-day scan is a no-op at the row level"
  - "lib/reminders-service.ts re-exports dispatchReminder as dispatchExpiryReminder so the 04-03 worker loader contract holds with one implementation (in lib/ticket-notify.ts)"
  - "Task 2 replaced 04-03's non-literal lazy loadReminderDispatcher with a static dispatchReminder import now that lib/reminders-service.ts exists — the plan's explicit 'wire it now' instruction"
  - "Trial reminder CTA is tariff:start (no key id): the trial user starts the normal Phase 3 `new` purchase through the days picker; no money logic is duplicated"

patterns-established:
  - "remind:{keyId}:{YYYY-MM-DD} UNIQUE dedupeKey + upsert — daily-until-expiry is a consequence of the date in the key"
  - "Owning-chat reminder dispatch String(user.chatId ?? user.telegramId), resolved from the key's owner row"

requirements-completed: [PAY-05]

coverage:
  - id: D1
    description: "listExpiringKeys selects keys expiring within 3 days INCLUDING trials and excludes expired and >3d keys; enqueueReminderScan is exactly-once per key per UTC day"
    requirement: PAY-05
    verification:
      - kind: integration
        ref: "tests/unit/reminder-cron.test.ts#listExpiringKeys — window + trials (D-60/D-63)"
        status: pass
      - kind: integration
        ref: "tests/unit/reminder-cron.test.ts#enqueueReminderScan — per-day exactly-once (D-61 / T-04-32)"
        status: pass
    human_judgment: false
  - id: D2
    description: "The reminder message carries the correct button: trial → buy (tariff:start), non-trial → key:renew:{keyId}, and dispatch targets only the owning chat"
    requirement: PAY-05
    verification:
      - kind: unit
        ref: "tests/unit/ticket-notify.test.ts#buildReminderPush — signal selection (D-62/D-63 / T-04-36)"
        status: pass
      - kind: integration
        ref: "tests/unit/ticket-notify.test.ts#dispatchReminder — owning-chat targeting (PAY-05 / T-04-35)"
        status: pass
    human_judgment: false
  - id: D3
    description: "The daily tick runs restart-safely (once on boot then 24h) with a secret-gated /api/cron/remind fallback that is 503 when CRON_SECRET is unset"
    requirement: PAY-05
    verification:
      - kind: unit
        ref: "npx tsc --noEmit && npm run build (route present, no build error)"
        status: pass
    human_judgment: true
    rationale: "The cron route has no dedicated route test (the plan mirrors the already-tested reconcile route); its gate semantics and the restart-safe boot run need a runtime/manual confirmation per 04-VALIDATION (standalone worker boot)."
  - id: D4
    description: "renew/upgrade callbacks carry the key id (not a list index) and the handler re-checks ownership+trial server-side"
    requirement: PAY-05
    verification:
      - kind: unit
        ref: "tests/unit/ticket-notify.test.ts#round-trips a key id through the bot's key:renew callback (A7 migration)"
        status: pass
    human_judgment: true
    rationale: "The Telegraf handler itself is manual-verified per 04-VALIDATION.md (real callback_data); the pure test only locks the payload contract the handler consumes."
  - id: D5
    description: "A key expiring ≤3d receives the reminder in Telegram with the correct button"
    requirement: PAY-05
    verification: []
    human_judgment: true
    rationale: "Real push to a real chat cannot be asserted in unit tests — 04-VALIDATION lists 'Reminder arriving in Telegram' as manual-only."

duration: 5min
completed: 2026-10-03
status: complete
---

# Phase 4 Plan 8: Expiry reminders + callback migration Summary

**Daily per-key expiry reminder (trial→buy, non-trial→renew) pushed through the existing Notification/outbox worker, with a restart-safe tick, a secret-gated `/api/cron/remind`, and a key-id callback migration so an asynchronously-opened button renews the right key.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-10-03T12:11:37Z
- **Completed:** 2026-10-03T12:16:28Z
- **Tasks:** 3
- **Files modified:** 9 (3 created, 6 modified)

## Accomplishments

- `lib/reminders-service.ts` scans `keys_cache` for keys expiring in `(now, now+3d]` (trials included, expired/>3d excluded) and enqueues exactly one `remind:{keyId}:{YYYY-MM-DD}` Notification per key per UTC day; a second same-day scan is a DB no-op on the UNIQUE `dedupeKey`.
- `lib/ticket-notify.ts` gained `buildReminderPush` (trial → `key.buyCta`/`tariff:start`; non-trial → `renew.cta`/`key:renew:{keyId}`) and `dispatchReminder`, which resolves `String(user.chatId ?? user.telegramId)` from the key's owner row — never a caller-supplied chat.
- `lib/worker.ts` now runs `runReminderScan` once on boot then every 24h via `startReminderTick`, wired into `startWorker` start/stop; the 04-03 lazy placeholder for `REMIND_EXPIRY` was replaced with a static `dispatchReminder` drain.
- `app/api/cron/remind/route.ts` mirrors the reconcile route exactly: `503 {error:"disabled"}` when `CRON_SECRET` is unset, timing-safe `x-cron-secret` check → `401`, else `200 {ok,scanned,enqueued}`.
- `lib/bot.ts` migrated `key:renew`/`key:upgrade` from a list index to `key:renew:{keyId}`/`key:upgrade:{keyId}` re-resolved through `precheckOwnedKey` (ownership + trial), updated the key-link buttons to emit the key id, and added the `tariff:start` action that replies the days keyboard.

## Task Commits

Each task was committed atomically:

1. **Task 1: Reminder scan + idempotent enqueue (tracer)** — `55dea60` (feat)
2. **Task 2: Daily tick + instrumentation + /api/cron/remind fallback** — `ae6ae63` (feat)
3. **Task 3: Callback-data migration + reminder buttons** — `0c3f54c` (feat)

**Plan metadata:** this SUMMARY commit (docs)

_Note: Task 1 is a tracer; its `<verify>` was re-run end-to-end after commit and passed. Task 3 carries `tdd="true"` — see Deviations for the gate reality._

## Files Created/Modified

- `lib/reminders-service.ts` (created) — `listExpiringKeys`, `reminderDedupeKey`, `enqueueReminderScan`, plus `dispatchExpiryReminder` re-export for the worker loader
- `app/api/cron/remind/route.ts` (created) — secret-gated manual scan fallback (503/401/200)
- `tests/unit/reminder-cron.test.ts` (created) — scan window + per-day dedupe vectors
- `lib/ticket-notify.ts` (modified) — `buildReminderPush` + `dispatchReminder`
- `lib/worker.ts` (modified) — `runReminderScan`, `startReminderTick`, static REMIND_EXPIRY drain, wired into `startWorker`
- `instrumentation.ts` (modified) — comment reflects the reminder tick starts with the worker
- `lib/bot.ts` (modified) — key-id renew/upgrade callbacks + `tariff:start`
- `lib/i18n/messages/ru.ts` (modified) — `bot.expiryReminder`, `bot.expiryReminderTrial`
- `tests/unit/ticket-notify.test.ts` (modified) — reminder button/targeting + A7 round-trip vectors

## Decisions Made

- **UTC as the reminder "day" (A6 LOCKED):** the dedupe key uses `toISOString().slice(0,10)`, so the day boundary is fixed and deterministic regardless of server timezone.
- **`enqueued` = keys processed:** the upsert is idempotent, so the count reflects scan attempts; the UNIQUE `dedupeKey` is the actual exactly-once guarantee. Tests assert DB row counts, not the return value.
- **One dispatch implementation, re-exported:** `dispatchReminder` lives in `lib/ticket-notify.ts` beside the other keyed builders; `lib/reminders-service.ts` re-exports it as `dispatchExpiryReminder` so 04-03's worker loader contract holds unchanged.
- **Static drain wiring over the 04-03 lazy shim:** once `lib/reminders-service.ts` exists, the non-literal lazy loader was removed and `drainDeliveryNotifications` calls `dispatchReminder` directly (the plan's explicit "wire it now" instruction).
- **Trial CTA carries no key id:** `tariff:start` starts a normal Phase 3 `new` purchase through the days picker — renew is never offered on a trial (D-44).

## Deviations from Plan

### Auto-fixed Issues

None. No Rule 1–3 fixes were required; every change was dictated by the plan's executable `<task>` actions.

### Plan-internal notes (not auto-fixes)

1. **Task 3 `tdd="true"` had no failing-RED surface.** The plan's Task 3 test is "pure builder level" in `tests/unit/ticket-notify.test.ts`, but Task 1 already delivered `buildReminderPush` and those exact assertions (Task 1's action explicitly requires them). The genuinely-new Task 3 behavior is the Telegraf handler migration, which the plan states is **manual-verified per 04-VALIDATION.md** and has no unit surface. A strict RED gate was therefore not achievable without inventing a non-plan helper. Action taken: added the non-duplicative A7 round-trip assertion (callback suffix is the raw cuid key id, not a numeric index), implemented the migration, and re-ran the pure tests — all green. No fake failing test was manufactured.
2. **Task 3's `lib/i18n/messages/ru.ts` entry was a no-op.** Task 1 already added the only two new keys (`bot.expiryReminder`/`bot.expiryReminderTrial`) and Task 3 introduces no new copy; the `files_modified` entry is therefore a superset. The i18n completeness gate stays green (no missing/unused keys).

---

**Total deviations:** 0 auto-fixed. Two plan-internal inconsistencies documented (TDD surface, file-list superset); no scope creep.

## Issues Encountered

- The bare `npm run build` fails on the fail-fast `lib/env.ts` because the local `.env.local` is partial. Per 04-VALIDATION ("npm run build (inline throwaway env)"), the build was run with a full inline dummy env and completed cleanly (all routes listed, including `/api/cron/remind`). Not a plan issue.

## TDD Gate Compliance

Plan frontmatter `type: execute` (not `tdd`), so no plan-level RED/GREEN gate applies. Task 3's `tdd="true"` is addressed above: the pure-builder contract was delivered in Task 1 (the plan assigns the same assertions to both tasks), and Task 3's handler behavior is manual-only. No `test(...)` commit exists for Task 3 because there was no failing unit surface to gate.

## Known Stubs

None. `loadReminderDispatcher` (the 04-03 known stub) is removed — `REMIND_EXPIRY` rows are now drained by `dispatchReminder`, closing the 04-03 stub.

## Threat Surface Scan

No new security-relevant surface beyond the plan's `<threat_model>`. Mitigations delivered: T-04-32 (UNIQUE per-day `dedupeKey` + upsert; reminder-cron tests), T-04-33 (timing-safe `x-cron-secret`, 503 when unset), T-04-34 (renew handler re-resolves via `precheckOwnedKey`), T-04-35 (owning-chat-only dispatch; copy has no raw key id — asserted), T-04-36 (trial push offers only the buy CTA — asserted).

## User Setup Required

None - no external service configuration required. Optional: set `CRON_SECRET` in prod to enable `/api/cron/remind`; when unset the route stays closed (503).

## Next Phase Readiness

- PAY-05 is functionally complete; the only outstanding item is the manual push observation listed in 04-VALIDATION ("Key expiring ≤3d → receive reminder with «Продлить»").
- The reminder cadence (`WINDOW_DAYS=3`) and trigger are marked `reversibility: costly` in the plan; changing them later reworks the dedupe identity and worker bootstrap.

---

*Phase: 04-support-retention*
*Completed: 2026-10-03*

## Self-Check: PASSED

- FOUND: lib/reminders-service.ts
- FOUND: app/api/cron/remind/route.ts
- FOUND: tests/unit/reminder-cron.test.ts
- FOUND: .planning/phases/04-support-retention/04-08-SUMMARY.md
- FOUND: 55dea60 (Task 1)
- FOUND: ae6ae63 (Task 2)
- FOUND: 0c3f54c (Task 3)
