---
phase: 03-payments
plan: "07"
subsystem: payments
tags: [bot, payments, history, qr, outbox, notify, pay-01, pay-04, platega, telegram, i18n, artemida]

# Dependency graph
requires:
  - phase: 03-payments
    provides: 03-03 outbox enqueue + worker (notify-provisioned/notify-failed producers); 03-04 kind-aware renew/upgrade; 03-06 cabinet payment surfaces + deferred bot.* keys
  - phase: 02-keys-trial
    provides: lib/keys-service getSubscriptionForUser/subscription links, lib/qr SVG renderer, lib/bot.ts Telegraf singleton, i18n t()/tp()
provides:
  - lib/qr.ts — renderSubscriptionQrPng(url) PNG Buffer for Telegram photo delivery
  - lib/bot-payments.ts — pure history/button/notification builders + dispatchNotification (owning-chat push)
  - lib/bot.ts — pay/new + renew + upgrade entry points, bot.menuPayments history, key-link renew/upgrade actions
  - lib/worker.ts — notify-provisioned / notify-failed outbox consumer branch (bot push trigger)
affects: [03-08, 04]

# Actuals (#2632) — chars/4 over the realized plan diff (788 inserted+deleted lines ≈ 32k chars / 4 ≈ 8000).
# Estimate was 52000 (raw 26000, low confidence); recorded honestly from the diff, not rounded.
actuals:
  tokens: 8000
  tasks: 3
  commits: 6

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure-helper module for the bot: message builders + dispatchNotification live in lib/bot-payments.ts with an injectable TelegramSender, so copy/rows/cap and owning-chat targeting are unit-testable without a Telegram context"
    - "Notify outbox consumer mirrors the fulfill path: claimNextJob(type) single-winner, markJobDone on success, rescheduleJob with backoff on a Telegram send failure (rows are never dropped)"
    - "Production drain lazily imports the bot singleton (lib/bot.ts) for its telegram sender so next build never instantiates Telegraf"
    - "Server-generated PNG QR (qrcode toBuffer, M/margin4/256) sent as a Telegram photo with key.qrCaption — never a remote image URL"
    - "Every bot string resolves through t(); history rows use literal keyed kind/status labels and are sliced under Telegram's 4096 cap"

key-files:
  created:
    - lib/bot-payments.ts
    - tests/unit/bot-payments.test.ts
  modified:
    - lib/qr.ts
    - lib/bot.ts
    - lib/worker.ts
    - lib/i18n/messages/ru.ts
    - tests/unit/qr.test.ts

key-decisions:
  - "Bot order creation calls the SAME orders-service.createOrder the BFF uses (no duplicated Prisma/fetch); the bot replies bot.payCreated with an inline URL button (pay.cta) and never shows the raw Platega URL"
  - "dispatchNotification resolves the sub-link through the ownership-joined getSubscriptionForUser and sends it ONLY to the owning chat id (stored chatId ?? telegramId); the URL/QR are never logged (T-03-sublink-leak)"
  - "A provisioned push with an unreadable sub-link degrades to key.linkUnavailable with NO QR (never a placeholder QR sent as if real)"
  - "renderSubscriptionQrPng encodes a non-credential 'about:blank' placeholder on empty input instead of throwing; the caller's copy path hides the QR when the URL is absent"
  - "drainOutbox takes an optional telegram sender: without one, notify rows stay pending (never silently consumed/dropped) — a sender-less test drain is inert"
  - "renew/upgrade are offered only on non-trial keys (D-44): trial keys keep only key.buyCta, and the server pre-check (precheckOwnedKey) gates the action before any provider call"

requirements-completed: [PAY-01, PAY-04]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "renderSubscriptionQrPng returns a valid PNG buffer (PNG signature) for a URL, distinct per URL, and never throws on empty input"
    requirement: PAY-01
    verification:
      - kind: unit
        ref: "npx vitest run tests/unit/qr.test.ts (renderSubscriptionQrPng vectors)"
        status: pass
    human_judgment: false
  - id: D2
    description: "The bot replies history rows as kind · amount · date · status through listOrdersForUser, with the empty-state key and a reply capped under Telegram's 4096 limit"
    requirement: PAY-04
    verification:
      - kind: unit
        ref: "npx vitest run tests/unit/bot-payments.test.ts (buildHistoryReply vectors)"
        status: pass
    human_judgment: false
  - id: D3
    description: "The worker consumes notify-provisioned / notify-failed rows: on provisioned it sends the keyed copy + the sub-link + a locally-generated PNG QR to the owning chat; on failed only the keyed copy; a send failure reschedules and a sender-less drain leaves rows pending"
    requirement: PAY-01
    verification:
      - kind: unit
        ref: "npx vitest run tests/unit/bot-payments.test.ts (dispatchNotification + drainOutbox vectors)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Every added bot.* key is referenced and the i18n completeness gate is green (no missing, no unused keys)"
    requirement: null
    verification:
      - kind: unit
        ref: "npx vitest run tests/unit/i18n.test.ts"
        status: pass
    human_judgment: false
  - id: D5
    description: "Manual Telegram pass: pay → CONFIRMED → receive key text + QR photo"
    requirement: PAY-01
    verification:
      - kind: manual
        ref: "Telegram: /start → Тарифы → day/device → pay → Platega → return → receive bot.payProvisioned + sub-link + QR photo"
        status: pending
    human_judgment: true
    rationale: "Requires a live Telegram client and a real/sandbox Platega payment to observe the push and the photo; not covered by a unit test."

# Metrics
duration: ~7min
started: 2026-10-03T13:45:00Z
completed: 2026-10-03T13:52:00Z
status: complete
---

# Phase 03 Plan 07: Bot Payment Parity Summary

**The bot now reaches payment parity with the cabinet: it starts a new/renew/upgrade purchase through the shared orders-service and answers with a Platega URL button, reads the same DB-native payment history, and — through the worker's new notify-outbox consumer — pushes the delivered sub-link plus a server-generated PNG QR to the owning chat on success and the keyed failure copy on terminal failure.**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-10-03T13:45:00Z
- **Completed:** 2026-10-03T13:52:00Z
- **Tasks:** 3 of 3
- **Files:** 2 created, 5 modified

## Accomplishments

- **PNG QR renderer (Task 1).** `renderSubscriptionQrPng(url)` uses `QRCode.toBuffer(url, {type:'png', errorCorrectionLevel:'M', margin:4, width:256})` — the same geometry as the existing SVG path, so cabinet and bot encode identically. An empty payload encodes a non-credential `about:blank` placeholder rather than throwing; the caller hides the QR when the real URL is absent. The SVG renderer is untouched.
- **Bot entry points + history (Task 2).** `lib/bot.ts` adds the `bot.menuPayments` keyboard entry; the Tariffs flow quotes then offers `pay.cta` → `tariff:buy:{days}:{devices}` → `createOrder({kind:'new'})` → `bot.payCreated` + an inline URL button. `key:link` now appends renew/upgrade buttons on non-trial keys; `key:renew`/`key:upgrade` run `precheckOwnedKey` (ownership + trial, D-44) before creating the kind-specific order. All failures map to `bot.payError`. A new `lib/bot-payments.ts` holds the pure builders — `buildHistoryReply`, `buildPayButton`, `buildProvisionedPush`, `buildFailedPush` — and `dispatchNotification`, keeping the handlers thin and the copy testable.
- **Worker notify consumer (Task 3).** `drainOutbox({telegram})` now additionally drains `notify-provisioned`/`notify-failed` rows via `claimNextJob(type)` (single-winner), dispatches each through `dispatchNotification`, marks the row `done` on success, and reschedules with backoff on a Telegram send failure. Production uses the shared `lib/bot.ts` singleton's `telegram` (lazy import). The sub-link is resolved through the ownership-joined `getSubscriptionForUser` and sent only to the owning chat; the QR is generated locally and attached as `key.qrCaption`.

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: failing PNG QR vectors** — `9853516` (test)
2. **Task 1 GREEN: PNG QR renderer** — `d51632e` (feat)
3. **Task 2 RED: failing bot payment/history/notify vectors** — `e1aec99` (test)
4. **Task 2: bot entry points + history menu + notify helpers** — `86b3ae9` (feat)
5. **Task 3: worker notify-provisioned/notify-failed consumer** — `c6e62e5` (feat)

**Plan metadata:** (this SUMMARY commit) (docs)

## Files Created/Modified

- `lib/qr.ts` (modified) — added `renderSubscriptionQrPng` (PNG Buffer, M/margin4/256); SVG untouched.
- `lib/bot-payments.ts` (created) — pure history/button/notification builders + `dispatchNotification(orderId, type, sender)`.
- `lib/bot.ts` (modified) — `bot.menuPayments` keyboard entry; Tariffs→buy flow; renew/upgrade actions + key-link action buttons; history handler; `createBotOrderAndReply` shared via orders-service.
- `lib/worker.ts` (modified) — `drainOutbox(opts)` + `drainNotifications`; `botSender()` lazy bot-singleton import.
- `lib/i18n/messages/ru.ts` (modified) — `bot.menuPayments`, `bot.payCreated`, `bot.payProvisioned`, `bot.payFailed`, `bot.payError` (deferred here from 03-06).
- `tests/unit/qr.test.ts` (modified) — PNG signature / distinctness / empty-input vectors.
- `tests/unit/bot-payments.test.ts` (created) — history rows/cap/empty, pay button, notification builders, worker dispatch (owning chat, done/pending/reschedule).

## Decisions Made

- **Bot order creation reuses `orders-service.createOrder`** — no duplicated Prisma/fetch, server re-quotes the price, provider errors map to `bot.payError` only.
- **`lib/bot-payments.ts` as a pure-helper seam** with an injectable `TelegramSender`, so the owning-chat targeting and the 4096 cap are unit-testable; `lib/bot.ts` stays thin handler wiring.
- **Notify rows are consumed only with a sender.** A sender-less drain leaves them `pending` (no-drop); the production drain supplies the bot singleton's telegram. This keeps the existing `outbox-worker.test.ts` `drainOutbox()` calls inert for delivery rows.
- **Renew/upgrade on non-trial keys only (D-44):** trial keys keep `key.buyCta`, and `precheckOwnedKey` gates the action server-side before any provider call.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Empty-URL QR would throw**
- **Found during:** Task 1 (PNG renderer)
- **Issue:** `QRCode.toBuffer("")` throws `No input text`; the plan's behavior spec requires the renderer to "never throw" on an invalid URL.
- **Fix:** encode a non-credential `about:blank` placeholder for a blank URL; the push path hides the QR and renders `key.linkUnavailable` whenever the real sub-link is absent, so the placeholder is never sent as if it were a real sub-link.
- **Files modified:** `lib/qr.ts`
- **Verification:** `tests/unit/qr.test.ts` empty-input vector green; `tsc` clean.
- **Committed in:** `d51632e`

**2. [Rule 3 - Blocking] `drainOutbox` signature change rippled to existing callers**
- **Found during:** Task 3 (worker consumer)
- **Issue:** `WorklerHandle.drain` and the interval were typed to the zero-arg `drainOutbox`; adding the optional `{telegram}` option required the handle and timer to pass a sender while keeping the existing `drainOutbox()` test calls valid.
- **Fix:** made the option optional (zero-arg calls still valid) and wired the production handle/timer to `botSender()`; the existing `outbox-worker.test.ts` remains untouched and green.
- **Files modified:** `lib/worker.ts`
- **Verification:** full suite 169/169 green; `tsc` clean; build clean.
- **Committed in:** `c6e62e5`

---

**Total deviations:** 2 auto-fixed (1 missing-critical, 1 blocking).
**Impact on plan:** Both are robustness/compatibility fixes inside the plan's intent. No scope creep; no new packages (T-03-SC honored).

## Issues Encountered

- **`getSubscriptionForUser` performs a live provider read.** The provisioned-dispatch test mocks `artemida.getSubscriptionLinks`/`getTraffic` so no network is hit — matching the established DB-backed-with-spies pattern. This is a test-infra concern, not a product defect.
- **`npm run build` needs a full env set locally** (`.env.local` holds only ARTEMIDA creds); the verification build ran with in-shell dummy values, matching the vitest dummy-env discipline. No real secrets used or committed.

## TDD Gate Compliance

- **Plan-level type:** `execute` (not a `type: tdd` plan), so no plan-level RED/GREEN gate is mandated.
- **Task 1 (`tdd="true"`):** committed `test(...)` → `feat(...)` (`9853516` then `d51632e`).
- **Task 2/3 (TDD-adjacent):** the shared `tests/unit/bot-payments.test.ts` was committed as a failing RED (`e1aec99`) before the helper/handler implementation (`86b3ae9`).

## Known Stubs

None. The `notify-provisioned`/`notify-failed` consumers are now wired; the producers from 03-03 are no longer orphaned. The `bot.payCreated`/history flows reuse the shared services with no placeholder data.

## Threat Flags

No new threat surface beyond the plan's `<threat_model>`. The bot→Telegram boundary is mitigated as planned:
- **T-03-sublink-leak** — `dispatchNotification` resolves the sub-link through the ownership-joined `getSubscriptionForUser` and targets `chatId ?? telegramId` only; the URL/QR are never logged (logger calls carry order/telegram ids and outcomes only).
- **T-03-rawbot** — every reply resolves through `t()`; history/notification builders use literal keyed kind/status labels; failures map to `bot.payError`/`bot.payFailed`.
- **T-03-doublepush** — delivery is driven by the single `(orderId,type)` outbox row claimed once via `claimNextJob`.
- **T-03-reply-overflow** — `buildHistoryReply` slices to `BOT_REPLY_CAP` (4000) with a test asserting the ≤4096 cap.
- **T-03-SC** — no new packages.

## Next Phase Readiness

- The bot money path is complete: quote → order → Platega button → worker provision → bot push (text + QR).
- Manual Telegram pass pending (D5): `/start` → Тарифы → day/device → pay → Platega → receive `bot.payProvisioned` + sub-link + QR photo.
- `bot-payments.ts` builders are reusable if a future phase adds expiry reminders (PAY-05) or richer receipts.

---

*Phase: 03-payments*
*Completed: 2026-10-03*

## Self-Check: PASSED

- FOUND: commit `9853516` (Task 1 RED — PNG QR vectors)
- FOUND: commit `d51632e` (Task 1 GREEN — renderSubscriptionQrPng)
- FOUND: commit `e1aec99` (Task 2 RED — bot payment/history/notify vectors)
- FOUND: commit `86b3ae9` (Task 2 — bot entry points + history + notify helpers)
- FOUND: commit `c6e62e5` (Task 3 — worker notify consumer)
- FOUND: `lib/bot-payments.ts`, `lib/qr.ts`, `lib/bot.ts`, `lib/worker.ts`, `lib/i18n/messages/ru.ts`
- FOUND: `tests/unit/bot-payments.test.ts`, `tests/unit/qr.test.ts`
- VERIFY: `DATABASE_URL=postgresql://alekseimikhalkin@127.0.0.1:5432/setwhite npx vitest run tests/unit` → 21 files / 169 tests green
- VERIFY: `npx tsc --noEmit` clean
- VERIFY: `npm run build` clean, 0 `worker-started` lines (no worker at build)
- SECURITY: sub-link/QR sent only to the owning chat; never logged; no secret committed; no new packages
- NOTE: STATE.md / ROADMAP.md intentionally NOT written by the executor (orchestrator owns those)
