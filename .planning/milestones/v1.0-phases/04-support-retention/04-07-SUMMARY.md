---
phase: 04-support-retention
plan: 07
subsystem: bot
tags: [telegraf, telegram, tickets, support-intake, attachments, sharp, i18n, tdd, claim-before-create]

# Dependency graph
requires:
  - phase: 04-support-retention
    provides: Ticket schema + shared lib/tickets-service.ts (createTicket / beginSupportPrompt / isSupportPromptFresh / clearSupportPrompt single-winner claim) — 04-01
  - phase: 04-support-retention
    provides: lib/attachments.ts normalizeImage / saveAttachment contract (04-02)
provides:
  - Bot «Поддержка» menu entry arming the persisted awaitingSupport flag (30-min TTL)
  - Bot text/photo intake creating a ticket through the SAME service the cabinet uses (telegramId → createTicket)
  - Photo path getFileLink → fetch → normalizeImage → saveAttachment → AttachmentDescriptor
  - lib/support-intake.ts — pure, testable gate (isSupportIntakeArmed) + content builder (buildSupportTicketContent)
affects: [04-04 cabinet create route, 04-05/04-06 cabinet thread UI, 04-08 reminders]

actuals:
  tokens: 3356
  tasks: 2
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Pure support-intake helpers in lib/support-intake.ts + thin Telegraf wiring in lib/bot.ts (bot-payments discipline)"
    - "Claim-before-create: clearSupportPrompt single-winner claim runs BEFORE download/create"
    - "Gate falls through untouched: unarmed/stale text|photo returns early, no reply, no consume"
    - "PII-free storage scope for the bot photo (`bot-<uuid>`), relative path only in the descriptor"

key-files:
  created:
    - lib/support-intake.ts
    - tests/unit/support-intake.test.ts
  modified:
    - lib/bot.ts
    - lib/i18n/messages/ru.ts

key-decisions:
  - "The flag/TTL gate and content bounds were extracted into a pure lib/support-intake.ts so Task 2's tdd vectors could run without importing the Telegraf singleton or touching the network (deviation Rule 3 — plan scoped Task 2 to lib/bot.ts only)."
  - "Bot is CREATE-ONLY (D-51/Q3): the handler always calls createTicket; appending to an existing ticket stays a cabinet action."
  - "A caption-less photo uses t(\"bot.menuSupport\") as the keyed fallback subject — no new dictionary key beyond the four the plan lists, and no hardcoded literal (D-16)."
  - "clearSupportPrompt is asserted BEFORE any download/create; a duplicate/retried update reads awaitingSupport:false and creates nothing."
  - "Failures reply keyed bot.ticketError only; the file link, provider text, and buffer are never logged or echoed (D-19/D-24, T-04-30)."

patterns-established:
  - "Handler ordering: the support `on([text,photo])` branch is registered AFTER every `hears` menu branch, so menu taps are consumed first."
  - "Untrusted Telegram text is capped via buildSupportTicketContent (subject ≤120, body ≤4000), never by ad-hoc slicing."

requirements-completed: [SUP-01, SUP-02, SUP-03]

coverage:
  - id: D1
    description: "Support-intake gate: a missing row, an unarmed flag, or a prompt older than 30 min leaves the update untouched (no ticket, no consume)"
    requirement: SUP-01
    verification:
      - kind: unit
        ref: "tests/unit/support-intake.test.ts#isSupportIntakeArmed"
        status: pass
    human_judgment: false
  - id: D2
    description: "Telegram text/caption is capped to subject ≤120 / body ≤4000, with a keyed fallback subject for a caption-less photo"
    requirement: SUP-01
    verification:
      - kind: unit
        ref: "tests/unit/support-intake.test.ts#buildSupportTicketContent"
        status: pass
    human_judgment: false
  - id: D3
    description: "The «Поддержка» menu arm prompt and the live text/photo → ticket flow (incl. Bot API photo download) work in Telegram and land in the cabinet queue"
    requirement: SUP-02
    verification: []
    human_judgment: true
    rationale: "No SPEC/EDGE artifact for the live Telegram path; the handler wiring (menu arm + getFileLink download + create) is manual-only per the plan's flagged assumption. Automated coverage proves the gate and bounds, not the live Telegram round-trip."
  - id: D4
    description: "Claim-before-create: a single armed prompt yields at most one ticket; a retried/concurrent duplicate creates nothing"
    requirement: SUP-03
    verification:
      - kind: integration
        ref: "tests/unit/tickets-service.test.ts#clearSupportPrompt is a single-winner claim (no double-create)"
        status: pass
    human_judgment: false

duration: 4min
completed: 2026-10-03
status: complete
---

# Phase 4 Plan 7: Bot support intake Summary

**The bot gained a «Поддержка» menu that arms a persisted 30-minute intake flag and turns the next text/photo into a ticket through the shared `lib/tickets-service.createTicket` path, with the photo fetched via Bot API `getFileLink` and normalized by the same `sharp` pipeline as the cabinet.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-10-03T11:52:09Z
- **Completed:** 2026-10-03T11:55:48Z
- **Tasks:** 2 (Task 1 tracer; Task 2 TDD RED→GREEN)
- **Files modified:** 4 (2 created, 2 modified)

## Accomplishments

- A Telegram user can now create a support ticket from the bot: menu tap arms `awaitingSupport`, the next text (≤4000 chars) or photo (Bot API `getFileLink` → `fetch` → `normalizeImage` → `saveAttachment`) lands in the SAME queue as the cabinet with an identical `AttachmentDescriptor`.
- Claim-before-create is enforced: the 04-01 single-winner `clearSupportPrompt` runs BEFORE any download or `createTicket`, so a retried/duplicate update reads `awaitingSupport:false` and creates no second ticket (T-04-28).
- The intake gate is strictly flag+TTL: unarmed or stale (>30 min) text/photo returns early with no reply and no consume, so keys/menus/guides handlers are unaffected (T-04-28).
- Failures reply keyed `bot.ticketError` only — no provider/API error, file link, or buffer is ever echoed or logged (T-04-30); the photo size/format guard is `normalizeImage`'s `UnsupportedImageError` mapped to the same keyed error (T-04-29).
- Four RU keys added (`bot.menuSupport`, `bot.supportPrompt`, `bot.ticketCreated`, `bot.ticketError`) and all referenced in the same task; i18n completeness gate green.

## Task Commits

Each task was committed atomically:

1. **Task 1: Bot «Поддержка» intake — text and photo create a ticket (tracer)** - `7b4dda8` (feat)
2. **Task 2: Intake fall-through, TTL, and error hardening (TDD)** - `9bb6783` (test, RED) → `eae2f79` (feat, GREEN)

**Plan metadata:** (this SUMMARY commit, docs)

_Note: Task 1 is the tracer; its automated `<verify>` was re-run end-to-end after the commit and passed before Task 2 expanded. Task 2 is TDD with the RED→GREEN commit pair._

## Files Created/Modified

- `lib/bot.ts` (MOD) — `/start` keyboard gains the «Поддержка» row; `bot.hears(t("bot.menuSupport"))` arms via `beginSupportPrompt`; `bot.on(["text","photo"])` gate → claim → download/normalize → `createTicket` → keyed reply; registered after all `hears` branches.
- `lib/i18n/messages/ru.ts` (MOD) — `bot.menuSupport`, `bot.supportPrompt`, `bot.ticketCreated`, `bot.ticketError`.
- `lib/support-intake.ts` (NEW) — pure `isSupportIntakeArmed(state, now)` (wraps `isSupportPromptFresh`) and `buildSupportTicketContent({text?,caption?}, fallbackSubject)` with `SUPPORT_SUBJECT_MAX=120` / `SUPPORT_BODY_MAX=4000`.
- `tests/unit/support-intake.test.ts` (NEW) — 11 vectors: missing/unarmed/null-timestamp/fresh/stale/exact-boundary gate + subject/body caps, caption fallback, fallback subject, trim.

## Decisions Made

- **Pure module extraction (deviation, Rule 3):** Task 2 is `tdd="true"` but scoped to `lib/bot.ts`, whose handler wiring is not importable without triggering the Telegraf polling singleton. The gate/bounds were extracted into `lib/support-intake.ts` so real RED→GREEN vectors can run with no network/Telegram context; `lib/bot.ts` composes it. This mirrors the established `lib/bot-payments.ts` "pure helpers + thin handlers" discipline.
- **Create-only, keyed fallback subject:** a caption-less photo uses `t("bot.menuSupport")` as the default subject, keeping the artifact list to the four planned keys and honoring D-16 (no hardcoded copy).
- **Claim-before-create positioning:** `clearSupportPrompt` is called before the download, so even a photo fetch/normalize failure cannot leave the prompt re-armed for a duplicate create.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Extracted pure support-intake helpers to satisfy Task 2's TDD gate**

- **Found during:** Task 2 (Intake fall-through, TTL, and error hardening)
- **Issue:** Task 2 carries `tdd="true"` but its `<files>` is `lib/bot.ts` only. Importing `lib/bot.ts` in a unit test constructs the Telegraf singleton and (with `BOT_MODE` defaulting to `polling` in the test env) calls `bot.launch()`, attempting real Telegram network I/O — so the gate/TTL/content logic had no safe testable seam. Additionally, its inline form was already correct from Task 1, so a test written against it could not produce a genuine RED.
- **Fix:** Added `lib/support-intake.ts` (pure `isSupportIntakeArmed` + `buildSupportTicketContent`), rewired `lib/bot.ts` to consume it, and wrote `tests/unit/support-intake.test.ts` first (RED, module missing) then implemented it (GREEN).
- **Files modified:** lib/support-intake.ts (new), lib/bot.ts, tests/unit/support-intake.test.ts (new)
- **Verification:** RED run failed on the missing import; GREEN run passes 11 vectors; `npx tsc --noEmit` clean; full unit suite 27 files / 220 tests green.
- **Committed in:** `9bb6783` (RED test) → `eae2f79` (GREEN module + rewire)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** No scope creep — the extraction moved logic already specified in Task 2 into a testable module; behavior, public bot surface, and the plan's must_haves artifacts are unchanged. `lib/tickets-service.ts` was not modified and remains the only ticket write path.

## TDD Gate Compliance

- RED commit present: `9bb6783` (test — failing support-intake vectors).
- GREEN commit present after RED: `eae2f79` (feat — module + rewire), all vectors pass.

## Issues Encountered

- Telegraf narrows `ctx.message` to `TextMessage | PhotoMessage`; `TextMessage` has no `caption`, so the content builder is called with a discriminated object (`"text" in message ? { text } : { caption }`). Resolved before the GREEN commit.
- No other problems. The bot handler wiring itself is not unit-tested (manual Telegram path is the plan's flagged assumption), so no DB/network fixture was required.

## User Setup Required

None beyond the already-provisioned database. For production, `UPLOAD_DIR` must be set (compose provides `/data/uploads`) so bot-downloaded photos persist; no new env var is introduced by this plan.

## Known Stubs

None — no hardcoded empty values, placeholder copy, or unwired components were introduced.

## Threat Flags

None — no security-relevant surface was added beyond the plan's `<threat_model>` (T-04-28/29/30/31 are the intake boundaries, all mitigated or accepted as planned).

## Next Phase Readiness

- The bot channel now shares the exact write path and attachment contract the cabinet will use in 04-04; SUP-01/SUP-02 are advanced to the point where only the cabinet channel head remains.
- 04-04 can reuse the `AttachmentDescriptor` composition shown here (normalize → save → descriptor) and must not duplicate Prisma ticket writes.
- The live Telegram text/photo path and the cabinet round-trip remain for manual UAT per 04-VALIDATION.md.
- No blockers. `lib/tickets-service.ts` is untouched; `STATE.md`/`ROADMAP.md` were intentionally not written (orchestrator-owned).

---

*Phase: 04-support-retention*
*Completed: 2026-10-03*

## Self-Check: PASSED

- FOUND: lib/support-intake.ts
- FOUND: tests/unit/support-intake.test.ts
- FOUND: lib/bot.ts
- FOUND: lib/i18n/messages/ru.ts
- FOUND: 7b4dda8 (Task 1 tracer)
- FOUND: 9bb6783 (Task 2 RED)
- FOUND: eae2f79 (Task 2 GREEN)
