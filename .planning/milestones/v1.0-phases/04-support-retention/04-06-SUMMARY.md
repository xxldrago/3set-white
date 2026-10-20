---
phase: 04-support-retention
plan: 06
subsystem: ui
tags: [next, rsc, client-islands, i18n, support, tickets, attachments, mark-read, reopen, sup-01, sup-02, sup-03]

# Dependency graph
requires:
  - phase: 04-support-retention
    plan: 04-04
    provides: BFF ticket routes — POST /api/tickets/[id]/messages (reopen-in-place), POST /api/tickets/[id]/read, gated GET /api/tickets/[id]/attachments/[attachmentId]
  - phase: 04-support-retention
    plan: 04-05
    provides: TicketStatusChip, formatPaymentDate reuse, ticket.* list/composer RU namespace
  - phase: 02
    provides: UI-SPEC token set, CARD/SECONDARY constants, PayCta/ConfirmPanel client-island patterns
provides:
  - session-gated /support/[id] ticket thread (owner-only, non-owned == 404)
  - TicketThread (sender-aware bubbles + inline gated attachment thumbnails)
  - AttachmentImage (gated same-origin thumbnail, skeleton/error states, new-tab open)
  - MarkReadOnOpen (one-shot ref-guarded mark-read island)
  - TicketComposer (multipart reply island that reopens closed tickets in place)
affects: [05 admin panel, 04 UE/verification]

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
actuals:
  tokens: 4331
  tasks: 3
  commits: 4

tech-stack:
  added: []
  patterns:
    - "Thread RSC: requireSession -> redirect('/login') -> getTicketForUser(BigInt(telegramId), id) -> notFound() for non-owned (no oracle, T-04-24)"
    - "Client-island boundary: server TicketThread renders client AttachmentImage children; src is ALWAYS the gated same-origin route (never a stored path/public URL, T-04-25)"
    - "One-shot effect: useRef guard + useEffect POST then router.refresh(); silent catch; never on server render (T-04-26)"
    - "Multipart reply island: FormData with no manual content type, in-flight lock, success-only clear, keyed error + retry with retained input (T-04-27)"
    - "Node-only TDD harness: source-contract test file-scan (no jsdom/RTL) encodes the plan's fails_when conditions"

key-files:
  created:
    - app/support/[id]/page.tsx
    - components/TicketThread.tsx
    - components/AttachmentImage.tsx
    - components/MarkReadOnOpen.tsx
    - components/TicketComposer.tsx
    - tests/unit/ticket-composer.test.ts
  modified:
    - lib/i18n/messages/ru.ts

key-decisions:
  - "TicketThread renders attachments only once AttachmentImage exists (Task 2) — wiring it in Task 1 would have been a forward reference that fails tsc; the thread ships bubbles in Task 1 and gains thumbnails in Task 2"
  - "AttachmentImage keeps the <img> in flow (width/height + max-h-64) and shows an absolute inset-0 pulse skeleton behind it, so the thread does not reflow on load; a load failure replaces it with the keyed tile, never a broken-image icon"
  - "MarkReadOnOpen uses a useRef guard so React StrictMode's double-invoke cannot double-POST or loop; a failed mark-read is silent and retries on the next open"
  - "TicketComposer allows an image-only reply (body OR file) to match the messages route/service, and clears input only on a successful response so a failure retains the typed body/file"
  - "The «Обновить» control is a plain server-rendered Link to the same dynamic route (no extra client island); it references common.refresh"
  - "Task 3 TDD RED harness is a source-contract test (tests/unit/ticket-composer.test.ts) because the unit suite is node-only (no jsdom/RTL) — it asserts multipart FormData (never JSON/no manual content type), the messages route, in-flight lock, router.refresh, and retained input"

patterns-established:
  - "Thread bubble: user self-end tinted / support self-start + support.senderLabel, body whitespace-pre-wrap break-words, timestamp under the bubble"
  - "Gated thumbnail: gated-route-only img + reserved box + skeleton/error states + new-tab <a> (no lightbox)"
  - "Reply island: multipart FormData, in-flight lock, submitLoading label swap, sendError + common.retry with retained input"

requirements-completed: []
requirements-advanced: [SUP-01, SUP-02, SUP-03]

coverage:
  - id: D1
    description: "Owner opens /support/[id] and sees ordered sender-aware bubbles with labels and timestamps; a non-owner gets 404; a closed ticket shows the reopen note and still renders"
    requirement: SUP-01
    verification:
      - kind: unit
        ref: "tests/unit/i18n.test.ts (support.senderLabel/common.refresh/ticket.reopenNote registered + used)"
        status: pass
      - kind: other
        ref: "npx tsc --noEmit; npm run build (route /support/[id] registered)"
        status: pass
      - kind: unit
        ref: "tests/unit/tickets-route.test.ts#returns 404 for a non-owner reply and appends nothing (ownership join backing getTicketForUser)"
        status: pass
    human_judgment: true
    rationale: "No render test was in scope (plan verify is tsc + i18n only); bubble alignment/label/timestamp visual rendering needs a UAT pass."
  - id: D2
    description: "Opening a thread POSTs the read marker exactly once via a client island and clears the unread badge; never on server render, never loops"
    requirement: SUP-03
    verification:
      - kind: unit
        ref: "tests/unit/tickets-route.test.ts#clears unreadForUser for the owner (200)"
        status: pass
      - kind: other
        ref: "npx tsc --noEmit"
        status: pass
    human_judgment: true
    rationale: "The one-shot mount/refresh behavior is a client runtime effect; no jsdom harness exists, so a visual UAT confirms the badge clears once."
  - id: D3
    description: "Image attachments render inline ONLY through the gated same-origin route, with loading skeleton and keyed error tile; no stored path or public URL"
    requirement: SUP-02
    verification:
      - kind: unit
        ref: "tests/unit/i18n.test.ts (ticket.attachmentAlt/attachmentError registered + used)"
        status: pass
      - kind: unit
        ref: "tests/unit/tickets-route.test.ts#serves the owner 200 with nosniff + private cache and no stored path"
        status: pass
      - kind: other
        ref: "npx tsc --noEmit"
        status: pass
    human_judgment: true
    rationale: "The skeleton -> image -> error transitions are client runtime states; visual UAT needed."
  - id: D4
    description: "Replying posts multipart FormData to the in-thread messages route, locks in flight, refreshes on success, and reopens a closed ticket in place; failure retains input with keyed copy + retry"
    requirement: SUP-01
    verification:
      - kind: unit
        ref: "tests/unit/ticket-composer.test.ts (3 contract tests: multipart/no-JSON, lock+refresh, retained body+sendError/retry)"
        status: pass
      - kind: unit
        ref: "tests/unit/tickets-route.test.ts#reopens the SAME thread on an owner reply to a closed ticket (no second ticket)"
        status: pass
      - kind: other
        ref: "npx tsc --noEmit; npm run build"
        status: pass
    human_judgment: true
    rationale: "The in-flight lock / input-retention interaction has no render harness; interactive UAT recommended."

duration: 5min
completed: 2026-10-03
status: complete
---

# Phase 4 Plan 6: Cabinet ticket thread & reply composer Summary

**The cabinet support loop closes — a session-gated `/support/[id]` renders the owned thread as sender-aware bubbles with inline gated attachment thumbnails, a ref-guarded island clears the unread badge exactly once on open, and a multipart reply composer reopens a closed ticket in place (never a second ticket).**

## Performance

- **Duration:** 5 min
- **Started:** 2026-10-03T12:29:11Z
- **Completed:** 2026-10-03T12:34:20Z
- **Tasks:** 3 (Task 1 tracer; Task 3 TDD with a RED→GREEN pair)
- **Files modified:** 7 (6 created, 1 modified)

## Accomplishments

- `/support/[id]` is a `force-dynamic` RSC: `requireSession()` → `redirect('/login')` on `SessionError`, then `getTicketForUser(BigInt(telegramId), id)`; a ticket the caller does not own renders `notFound()` exactly like a missing one (T-04-24, no oracle). The subject is the `h1`, followed by the `TicketStatusChip` and a secondary «Обновить» link (`common.refresh`).
- `TicketThread` renders messages oldest→newest: user bubbles `self-end` on the subtle self tint, support bubbles `self-start` on the plain card surface with the `support.senderLabel` («Поддержка») label; bodies are `16/400/1.5 whitespace-pre-wrap break-words`, timestamps are `DD.MM.YYYY · HH:mm` via the shared `formatPaymentDate`. No raw `author`/status enum is ever rendered.
- `AttachmentImage` sources the `<img>` from the gated same-origin BFF route only (`/api/tickets/{id}/attachments/{attachmentId}`) — never a stored path or third-party URL (T-04-25). Explicit `width`/`height` + `max-h-64` reserve the box; an absolute pulse skeleton holds the space until `onLoad`; a load failure renders the keyed `ticket.attachmentError` tile (never a broken-image icon); tapping opens the gated file in a new tab (no lightbox).
- `MarkReadOnOpen` fires exactly once on mount (guarded by a `useRef`), POSTs `/api/tickets/{id}/read`, then `router.refresh()`; failures are silent and retry on the next open. It never runs on server render (T-04-26).
- `TicketComposer` posts multipart `FormData` (`body`, optional `attachment`) to `/api/tickets/{id}/messages` with **no** manual content type; it allows an image-only reply (body OR file), locks while in flight (`ticket.submitLoading`), and on success clears the input and `router.refresh()`es. A failure shows `ticket.sendError` + `common.retry` and retains the typed body/file (T-04-27). A closed ticket keeps the composer with `ticket.reopenNote` above it, so the reply reopens in place (D-59).
- Full unit suite green: **29 files / 253 tests** (with `DATABASE_URL=postgresql://alekseimikhalkin@127.0.0.1:5432/setwhite`); `npx tsc --noEmit` clean; `npm run build` exit 0 with `/support/[id]` registered as a dynamic route.

## Task Commits

Each task was committed atomically:

1. **Task 1: /support/[id] thread end-to-end (tracer)** - `5a5772f` (feat)
2. **Task 2: AttachmentImage + one-shot MarkReadOnOpen island** - `8f8284b` (feat)
3. **Task 3: TicketComposer reply island (TDD)** - `441b9b0` (test, RED) → `1f872ed` (feat, GREEN)

**Plan metadata:** (this SUMMARY commit, docs)

_Note: Task 1 is a tracer whose automated `<verify>` was re-run end-to-end before expanding. Task 3's RED commit intentionally fails its new source-contract test (the module does not exist yet) and is resolved by GREEN._

## Files Created/Modified

- `app/support/[id]/page.tsx` (NEW) — session-gated RSC thread: subject `h1`, status chip, refresh link, `TicketThread`, closed-state `ticket.reopenNote`, `TicketComposer`, `MarkReadOnOpen`.
- `components/TicketThread.tsx` (NEW) — presentational ordered bubbles (user/support), sender label, timestamps, inline `AttachmentImage` thumbnails.
- `components/AttachmentImage.tsx` (NEW) — client gated thumbnail (`'use client'`) with reserved box, pulse skeleton, keyed error tile, new-tab open.
- `components/MarkReadOnOpen.tsx` (NEW) — client one-shot mark-read island (`useRef` guard, silent failure).
- `components/TicketComposer.tsx` (NEW) — client multipart reply island (in-flight lock, keyed error + retry, retained input).
- `tests/unit/ticket-composer.test.ts` (NEW) — 3 source-contract tests for the composer's `fails_when` conditions.
- `lib/i18n/messages/ru.ts` — added `common.refresh`, `ticket.reopenNote`, `ticket.attachmentAlt`, `ticket.attachmentError`, and the `support.senderLabel` key (new `support` namespace); all referenced in the same task that added them.

## Decisions Made

- **Per-task forward-reference avoidance:** Task 1 ships `TicketThread` with bubbles only; Task 2 adds the `AttachmentImage` import + attachment map. This keeps every task's `tsc --noEmit` clean (no import of a not-yet-created module) while still delivering the tracer slice.
- **No reflow on attachment load:** the `<img>` stays in normal flow with explicit `width`/`height` and `max-h-64`; an absolute `inset-0` pulse skeleton masks it until `onLoad`, so dimensions are reserved without an extra wrapper layout.
- **`common.refresh` as a server link:** the refresh control is a plain `Link` to the same `force-dynamic` route — no new client island was introduced just to call `router.refresh()` from the header.
- **Image-only replies allowed:** `canSubmit` is `body.trim() || file`, matching the messages route (`body OR attachment required`) and keeping the composer consistent with the bot/`getFile` channel.
- **TDD harness choice:** because the suite runs in a node environment (no jsdom / React Testing Library), Task 3's RED is a file-scanning source-contract test that encodes the plan's explicit `fails_when` (multipart not JSON, messages route, in-flight lock, `router.refresh`, retained input) — mirroring the established `tests/unit/i18n.test.ts` style.

## Deviations from Plan

### Scope notes within plan intent

**1. `components/TicketThread.tsx` modified in Task 2 (not listed in Task 2's per-task `<files>`)**
- **Reason:** the plan requires attachments to render inline via `AttachmentImage`, which Task 2 creates; Task 1 could not import a not-yet-created module. The file is present in the plan's top-level `files_modified`, so this is a shared-file touch, not scope creep.
- **Committed in:** `8f8284b`.

**2. Added `tests/unit/ticket-composer.test.ts` in Task 3 (TDD RED harness)**
- **Reason:** `tdd="true"` requires a failing test; the node-only suite has no render harness and Task 3 adds no new i18n keys, so the existing gates cannot go RED. The new source-contract test is the RED harness and doubles as a regression guard for the task's prohibitions.
- **Committed in:** `441b9b0` (RED) → `1f872ed` (GREEN).

**Total deviations:** 0 auto-fixed; 2 within-plan scope notes.
**Impact on plan:** None — behavior matches the plan; no new dependency, route, or token was introduced.

## Issues Encountered

- **Build requires env vars absent from the minimal local `.env.local`:** `npm run build` initially failed at page-data collection (`lib/env.ts` fail-fast: missing `BOT_TOKEN`, `DATABASE_URL`, `SESSION_SECRET`, etc.). This is a pre-existing local-environment gap, not a code defect from this plan. Re-running with the documented required env values (dummy local values + the real `DATABASE_URL`) produced a clean build with `/support/[id]` registered. No code fix attempted (out of scope).

## Threat Surface Scan

No new security-relevant surface beyond the plan's `<threat_model>`. T-04-24 (ownership-joined `getTicketForUser` → `notFound()`, non-owned ≡ 404), T-04-25 (every `<img src>` is the gated same-origin route; zero stored-path/public-URL references), T-04-26 (one-shot ref-guarded mark-read island, never server-side), and T-04-27 (multipart keyed errors only; input retained; no raw provider/DB text) are all implemented.

## Known Stubs

None from this plan.

## Self-Check: PASSED

- FOUND: app/support/[id]/page.tsx
- FOUND: components/TicketThread.tsx
- FOUND: components/AttachmentImage.tsx
- FOUND: components/MarkReadOnOpen.tsx
- FOUND: components/TicketComposer.tsx
- FOUND: tests/unit/ticket-composer.test.ts
- FOUND: lib/i18n/messages/ru.ts
- FOUND: 5a5772f (Task 1 tracer)
- FOUND: 8f8284b (Task 2)
- FOUND: 441b9b0 (Task 3 RED)
- FOUND: 1f872ed (Task 3 GREEN)

---
*Phase: 04-support-retention*
*Completed: 2026-10-03*
