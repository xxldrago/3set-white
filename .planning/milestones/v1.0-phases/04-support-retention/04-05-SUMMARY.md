---
phase: 04-support-retention
plan: 05
subsystem: ui
tags: [next, rsc, i18n, support, tickets, multipart, unread-badge, sup-01, sup-02, sup-03]

# Dependency graph
requires:
  - phase: 04-support-retention
    plan: 04-01
    provides: lib/tickets-service.ts (listTicketsForUser/TicketListRow, TicketStatus) + ticket/notification schema
  - phase: 04-support-retention
    plan: 04-04
    provides: POST /api/tickets multipart create + gated attachment serve route
  - phase: 02
    provides: UI-SPEC token set, SkeletonRows/CARD/PRIMARY/SECONDARY, PaymentStatusChip + PaymentHistoryList analogs
provides:
  - cabinet support surfaces — session-gated /support list + /support/new composer
  - TicketStatusChip (open/answered/closed literal-key mapper), TicketList, CreateTicketForm (client island), SupportEntry
  - home-page /support nav entry with summed unread badge
  - ticket.* RU i18n namespace (list + composer + nav keys)
affects: [04-06 support thread UI, 05 admin panel]

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
actuals:
  tokens: 6185
  tasks: 3
  commits: 4

tech-stack:
  added: []
  patterns:
    - "Session-scoped RSC list: requireSession -> redirect('/login') -> listTicketsForUser(BigInt(telegramId)) inside Suspense"
    - "Literal-key status chip: status -> tint map + chipLabel switch of literal t('ticket.status*') calls (single i18n registration point)"
    - "Multipart client island: new FormData() with no manual Content-Type, in-flight lock, keyed error + retry, redirect on 2xx"
    - "Client validation mirrors server caps (5 MiB + jpeg/png/webp) as UX only; server re-validates (attachTooLarge/attachBadType)"
    - "Unread badge: accent fill, 99+ cap, absent from DOM at 0, aria-label via tp('ticket.unread', n)"

key-files:
  created:
    - app/support/page.tsx
    - app/support/new/page.tsx
    - components/TicketStatusChip.tsx
    - components/TicketList.tsx
    - components/CreateTicketForm.tsx
    - components/SupportEntry.tsx
  modified:
    - app/page.tsx
    - lib/i18n/messages/ru.ts

key-decisions:
  - "Attach-error copy uses literal t('ticket.attachTooLarge')/t('ticket.attachBadType') at the render site, not t(errorKey), so the i18n scanner registers both keys (single registration discipline)"
  - "TicketList reuses the exported formatPaymentDate (DD.MM.YYYY · HH:mm) from PaymentHistoryList instead of duplicating the formatter"
  - "Home unread read is wrapped in try/catch defaulting to 0 so an unavailable support read never 500s the home page"
  - "Task 2 TDD RED harness is the existing i18n completeness gate (plan explicitly forbids a new render test); the RED commit fails on the 12 then-unreferenced composer keys"
  - "TicketStatusChip's unknown status is neutral closed-tinted and labelled with the closed literal — no statusUnknown key added (keeps the i18n gate exact)"

patterns-established:
  - "Ticket status mapping: literal keyed chipLabel + CHIP_TINT map (open amber / answered green / closed+unknown zinc)"
  - "Ticket row: article card + subject truncate/title + chip + unread badge + lastActivity + 1-line preview, linking to /support/{id}"
  - "Multipart composer island mirrors PayCta's state machine (idle/loading/error) with retained input on failure"

requirements-completed: []
requirements-advanced: [SUP-01, SUP-02]

coverage:
  - id: D1
    description: "Signed-in user sees their tickets at /support as a list (subject, status chip, last activity, preview, unread badge) or a keyed empty state; 0 -> empty, 1 -> row, >=2 -> count header"
    requirement: SUP-01
    verification:
      - kind: unit
        ref: "tests/unit/i18n.test.ts#dictionary has no unused keys"
        status: pass
      - kind: other
        ref: "npx tsc --noEmit"
        status: pass
    human_judgment: true
    rationale: "No render test was in scope (plan verify is typecheck + i18n gate only); list/empty/count/unread rendering needs a visual UAT pass."
  - id: D2
    description: "Signed-in user creates a ticket at /support/new with subject + message + optional image; client 5 MiB/type validation, in-flight lock, multipart POST (no manual Content-Type), redirect to the created thread on success"
    requirement: SUP-02
    verification:
      - kind: unit
        ref: "tests/unit/i18n.test.ts#every t() key used in source exists in the RU dictionary"
        status: pass
      - kind: other
        ref: "npx tsc --noEmit"
        status: pass
      - kind: unit
        ref: "tests/unit/tickets-route.test.ts (route backing the form, from 04-04)"
        status: pass
    human_judgment: true
    rationale: "The composer island's validation/lock/redirect behavior has no dedicated automated test this plan; needs interactive UAT."
  - id: D3
    description: "Home page exposes a /support entry via SupportEntry; unread badge shows the summed count (99+ cap) and is absent at 0"
    requirement: SUP-01
    verification:
      - kind: other
        ref: "npx tsc --noEmit"
        status: pass
    human_judgment: true
    rationale: "Nav/badge rendering has no dedicated render test; badge-absent-at-0 and cap need visual UAT."
  - id: D4
    description: "Every added ticket.* key is registered in lib/i18n/messages/ru.ts and referenced in the same task (i18n completeness)"
    verification:
      - kind: unit
        ref: "tests/unit/i18n.test.ts#dictionary has no unused keys"
        status: pass
      - kind: unit
        ref: "tests/unit/i18n.test.ts#every t() key used in source exists in the RU dictionary"
        status: pass
    human_judgment: false

duration: 5min
completed: 2026-10-03
status: complete
---

# Phase 4 Plan 5: Cabinet support list & composer Summary

**Cabinet support surfaces shipped — a session-gated `/support` ticket list with literal-keyed status chips and unread badges, a `/support/new` multipart composer with client-side 5 MiB/type validation and an in-flight lock, and a home-page `SupportEntry` nav carrying summed unread parity.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-10-03T12:19:35Z
- **Completed:** 2026-10-03T12:24:56Z
- **Tasks:** 3 (Task 1 tracer; Task 2 TDD with a RED→GREEN pair)
- **Files modified:** 8 (6 created, 2 modified)

## Accomplishments

- `/support` is a session-gated RSC: `requireSession()` → `redirect('/login')` on `SessionError`, then `listTicketsForUser(BigInt(telegramId))` inside `<Suspense>` with the `h-16 animate-pulse rounded-2xl` skeleton; zero rows renders the keyed empty state, ≥2 rows a `tp('ticket.count', n)` header, plus the create CTA (T-04-20: session-scoped read only).
- `TicketStatusChip` is the single registration point mapping `open`/`answered`/`closed` to literal `t('ticket.status*')` labels over the amber/green/zinc palette; `unknown` degrades to the neutral closed-tinted chip — no raw status string is ever rendered (T-04-22).
- `TicketList` renders each row as a card article linking to `/support/{encodeURIComponent(id)}` with a truncated subject + `title`, the status chip, `ticket.lastActivity`, a 1-line preview, and the accent unread badge (`99+` cap, hidden at 0, `aria-label={tp('ticket.unread', n)}`).
- `CreateTicketForm` posts `FormData` (subject/body/optional attachment) to `/api/tickets` with **no** manual `Content-Type`; it rejects `>5 MiB` and non-jpeg/png/webp client-side into a `role="alert"` block, disables submit while blank/in-flight, swaps to `ticket.submitLoading`, and on success `router.push`es to the thread; failure shows `ticket.sendError` + `common.retry` with input retained (T-04-21/T-04-23).
- `SupportEntry` is a server-rendered `/support` link with the unread badge; `app/page.tsx` sums `unreadForUser` across the caller's tickets through the same service and renders it beside the payments link.
- Full unit suite green (252 passed / 29 files), `npx tsc --noEmit` clean, `npm run build` exit 0 with `/support` and `/support/new` registered as dynamic routes.

## Task Commits

Each task was committed atomically:

1. **Task 1: /support ticket list (tracer)** - `a6e749e` (feat)
2. **Task 2: composer i18n keys (TDD RED)** - `620597a` (test) → **composer island (TDD GREEN)** - `a8aa5df` (feat)
3. **Task 3: home support entry with unread badge** - `ad6c3ed` (feat)

**Plan metadata:** (this SUMMARY commit, docs)

_Note: Task 1 is a tracer whose automated `<verify>` was re-run end-to-end before expanding. Task 2's RED commit intentionally fails the i18n completeness gate on the 12 not-yet-referenced composer keys; GREEN references them all._

## Files Created/Modified

- `app/support/page.tsx` (NEW) — session-gated RSC list, Suspense skeleton, empty/count/CTA states, error + retry.
- `components/TicketStatusChip.tsx` (NEW) — open/answered/closed/unknown → literal-keyed chip + tint.
- `components/TicketList.tsx` (NEW) — row anatomy, unread badge, link to the thread.
- `app/support/new/page.tsx` (NEW) — session-gated RSC shell hosting the composer.
- `components/CreateTicketForm.tsx` (NEW) — client island: multipart submit, validation, in-flight lock, redirect.
- `components/SupportEntry.tsx` (NEW) — server nav link to `/support` with unread badge.
- `app/page.tsx` — sums unread and renders `SupportEntry` beside the payments link.
- `lib/i18n/messages/ru.ts` — new `ticket` namespace (list/composer/nav keys), all referenced the same task.

## Decisions Made

- **Literal keys at the render site:** attach errors use `t('ticket.attachTooLarge')` / `t('ticket.attachBadType')` directly rather than `t(errorKey)`, so the i18n scanner registers both keys (the scanner only matches string literals).
- **Formatter reuse:** `TicketList` imports the exported `formatPaymentDate` from `PaymentHistoryList` (the established `DD.MM.YYYY · HH:mm` ru-RU formatter) instead of duplicating it.
- **Home read is best-effort:** the unread sum is wrapped in try/catch defaulting to 0 — an unavailable support read degrades to no badge instead of breaking the home page.
- **No `ticket.statusUnknown` key:** `unknown` reuses the neutral closed-tinted chip and the `statusClosed` literal, keeping the dictionary exact.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Guarded the home unread read against failure**
- **Found during:** Task 3 (home support entry)
- **Issue:** The plan says to compute the unread count via `listTicketsForUser` on the home page; an unguarded await would 500 the entire home page whenever the tickets read fails.
- **Fix:** Wrapped the sum in try/catch, defaulting `unreadCount` to 0 and logging a warn (`support_unread_failed`), so support unavailability degrades to no badge.
- **Files modified:** `app/page.tsx`
- **Verification:** `npx tsc --noEmit` clean; build registers the home route.
- **Committed in:** `ad6c3ed` (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (Rule 2)
**Impact on plan:** Contained to the home-read robustness; no scope creep, no new surface.

## Issues Encountered

- **Full-suite invocation needs the real DB URL:** the default `npx vitest run` falls back to the nonexistent dummy `postgresql://test:test@127.0.0.1:5432/test` (per `vitest.config.ts`), which produced `User was denied access on the database` across the DB-backed files. Running with `DATABASE_URL="postgresql://alekseimikhalkin@127.0.0.1:5432/setwhite"` gives 252 passed / 29 files. Environment-only; no code change.

## User Setup Required

None - no external service configuration required. The local DB `postgresql://alekseimikhalkin@127.0.0.1:5432/setwhite` is already provisioned; set `DATABASE_URL` in the shell when running the full suite.

## Next Phase Readiness

- 04-06 (thread UI) can build `/support/[id]` — the create flow already `router.push`es to `/support/{id}`; that route arrives with `TicketThread` + `TicketComposer` + `MarkReadOnOpen` per the UI-SPEC.
- Server boundaries from 04-04 are consumed as-is; no new route or token was introduced.
- No blockers. `SUP-01`/`SUP-02` full completion still depends on the 04-06 thread UI; this plan delivers the cabinet list + create half (and SUP-03 nav parity).

## Self-Check: PASSED

- FOUND: app/support/page.tsx
- FOUND: app/support/new/page.tsx
- FOUND: components/TicketStatusChip.tsx
- FOUND: components/TicketList.tsx
- FOUND: components/CreateTicketForm.tsx
- FOUND: components/SupportEntry.tsx
- FOUND: app/page.tsx
- FOUND: lib/i18n/messages/ru.ts
- FOUND: a6e749e (Task 1 tracer)
- FOUND: 620597a (Task 2 RED)
- FOUND: a8aa5df (Task 2 GREEN)
- FOUND: ad6c3ed (Task 3)

---
*Phase: 04-support-retention*
*Completed: 2026-10-03*
