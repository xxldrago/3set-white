---
phase: 04-support-retention
plan: 01
subsystem: api
tags: [prisma, postgres, tickets, migration, service, ownership-join]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: User identity row (telegramId) + Prisma 7 client conventions
provides:
  - Ticket/TicketMessage/Attachment schema + migration (phase4_support, applied to setwhite)
  - Sibling Notification delivery queue (dedupeKey UNIQUE) — consumed by 04-03/04-04
  - Single shared lib/tickets-service.ts read/write path for bot + cabinet
  - User.awaitingSupport/supportPromptAt bot-intake state + single-winner claim
affects: [04-02 attachments, 04-03 notify queue, 04-04 BFF routes, 04-05 cabinet, 04-06 thread UI, 04-07 bot intake, 04-08 reminders]

actuals:
  tokens: 7584
  tasks: 3
  commits: 4

tech-stack:
  added: []
  patterns:
    - "Single shared service module per domain (no Next imports, prisma singleton)"
    - "Ownership join non-owned ≡ null (no oracle, IDOR boundary)"
    - "Atomic single-winner conditional updateMany claim (claim-before-create)"
    - "TDD RED/GREEN gate commits for lifecycle writers"

key-files:
  created:
    - lib/tickets-service.ts
    - tests/unit/tickets-service.test.ts
    - prisma/migrations/20261003105129_phase4_support/migration.sql
  modified:
    - prisma/schema.prisma

key-decisions:
  - "Ticket = thread (Ticket 1→N TicketMessage) per D-49; subject-only, no categories (D-52)"
  - "Notification is a sibling queue with UNIQUE dedupeKey — the order-scoped Outbox stays untouched (RESEARCH Open Q2 locked)"
  - "clearSupportPrompt is an atomic single-winner claim (count===1), not a blind clear (claim-before-create)"
  - "Exported both transitionTicket (primitive) and closeTicket (admin wrapper) to satisfy the artifact list and 04-04's close route"
  - "hasOpenTicket = owner-joined count of status=open tickets"

patterns-established:
  - "Ownership join: prisma.ticket.findFirst({ where: { id, user: { telegramId } } }) → non-owned ≡ null"
  - "unreadForUser is written only in addSupportMessage (+1) / markTicketRead (0)"
  - "In-thread reopen: a user reply on answered/closed sets status=open on the SAME ticket id"

requirements-completed: [SUP-01, SUP-03]

coverage:
  - id: D1
    description: "Ticket/TicketMessage/Attachment/Notification tables exist and the Prisma client is regenerated"
    requirement: SUP-01
    verification:
      - kind: integration
        ref: "npx prisma migrate status (Database schema is up to date!)"
        status: pass
      - kind: other
        ref: "npx tsc --noEmit"
        status: pass
    human_judgment: false
  - id: D2
    description: "One shared create/read path; non-owned ticket is indistinguishable from missing"
    requirement: SUP-01
    verification:
      - kind: integration
        ref: "tests/unit/tickets-service.test.ts#creates an open ticket with its first user message via one path"
        status: pass
      - kind: integration
        ref: "tests/unit/tickets-service.test.ts#returns null for a non-owner: no ownership oracle"
        status: pass
    human_judgment: false
  - id: D3
    description: "open→answered→closed, in-thread reopen (no new ticket), unread +1 per reply / clears on read"
    requirement: SUP-01
    verification:
      - kind: integration
        ref: "tests/unit/tickets-service.test.ts#transitions open → answered → closed"
        status: pass
      - kind: integration
        ref: "tests/unit/tickets-service.test.ts#a user reply on an answered ticket reopens the SAME thread"
        status: pass
      - kind: integration
        ref: "tests/unit/tickets-service.test.ts#unreadForUser increments exactly once per support message and clears on read"
        status: pass
    human_judgment: false
  - id: D4
    description: "Bot-intake single-winner claim prevents double-create"
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

# Phase 4 Plan 1: Support data spine Summary

**Prisma ticket thread (Ticket→TicketMessage→Attachment) + sibling Notification queue migrated to setwhite, with one shared `lib/tickets-service.ts` write/read path and an atomic single-winner bot-intake claim.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-10-03T10:51:03Z
- **Completed:** 2026-10-03T10:55:10Z
- **Tasks:** 3
- **Files modified:** 4 (schema, migration, service, test)

## Accomplishments

- [BLOCKING] Schema pushed: `phase4_support` migration applied to `setwhite`; `tickets`, `ticket_messages`, `ticket_attachments`, `notifications` exist with declared indexes/cascades; client regenerated under `generated/prisma`.
- One shared `lib/tickets-service.ts` is the only ticket write path — bot and cabinet will both call it, so SUP-01's "единая очередь" is a property of the write path.
- Ownership join makes a non-owned ticket indistinguishable from a missing one (`null`), and the bot-intake flag is claimed atomically (`count === 1`) so a retried/concurrent update cannot create a second ticket.
- Full unit suite green: 22 files / 184 tests; `npx tsc --noEmit` clean; `npx prisma migrate status` up to date.

## Task Commits

Each task was committed atomically:

1. **Task 1: [BLOCKING] Add Ticket/TicketMessage/Attachment/Notification models and migrate** - `208b07d` (feat)
2. **Task 2: Shared tickets-service create + read path (tracer)** - `36deea0` (feat)
3. **Task 3: Status transitions, in-thread reopen, and unread counter (TDD)** - `50768f4` (test, RED) → `98c344d` (feat, GREEN)

**Plan metadata:** (this SUMMARY commit, docs)

_Note: Task 3 is TDD and has the RED→GREEN commit pair; Task 2 is a tracer verified end-to-end before expanding._

## Files Created/Modified

- `prisma/schema.prisma` - Ticket/TicketMessage/Attachment/Notification models, TicketStatus/TicketAuthor enums, User.awaitingSupport/supportPromptAt/tickets
- `prisma/migrations/20261003105129_phase4_support/migration.sql` - applied migration DDL
- `lib/tickets-service.ts` - the single ticket read/write path + bot-intake helpers
- `tests/unit/tickets-service.test.ts` - DB-backed create/read/ownership/transitions/reopen/unread/claim vectors (15)

## Decisions Made

- **D-49 thread model + D-52 simplicity:** `Ticket` carries only `subject` + status; no category/priority/assignee.
- **Sibling `Notification` queue (RESEARCH Open Q2 locked):** UNIQUE `dedupeKey`, `OutboxStatus` enum, claim discipline reused; the order-scoped `Outbox` is not overloaded.
- **`clearSupportPrompt` is a claim, not a clear:** conditional `updateMany` on `awaitingSupport: true` + fresh `supportPromptAt`; returns `count === 1`. Only `beginSupportPrompt` sets it true; only `clearSupportPrompt` sets it false.
- **`transitionTicket` + `closeTicket`:** exported both; `closeTicket` delegates to the conditional primitive. Satisfies the must_haves artifact (`transitionTicket`) and 04-04's close route (`closeTicket`).
- **`hasOpenTicket`:** owner-joined count of tickets in `open` status (nav unread-entry helper for 04-05).
- `generated/prisma/` stays gitignored (regenerable via `npx prisma generate`); only schema + migration are committed.

## Deviations from Plan

None - plan executed exactly as written. The two names in the must_haves artifact list (`transitionTicket`) and Task 3 action (`closeTicket`) were both implemented by design; no auto-fixes were required.

## Issues Encountered

None. The `migrate dev` run created and applied the migration additively (no drift, no reset) because `User.awaitingSupport` has a safe `@default(false)` / nullable `supportPromptAt` and `User.id` is autoincrement.

## User Setup Required

None - no external service configuration required. (DB `postgresql://alekseimikhalkin@127.0.0.1:5432/setwhite` already provisioned.)

## Next Phase Readiness

- Wave 0 service tests are green; the schema is the foundation every later Phase 4 plan builds on.
- 04-02 (`lib/attachments.ts`) can persist an attachment via the exported `AttachmentDescriptor` shape without importing this module.
- 04-03/04-04 can use `prisma.notification` with the UNIQUE `dedupeKey`; `enqueueNotification` is a later-plan helper.
- No blockers. `generated/prisma` must remain regenerated on deploy (`npx prisma generate`); `npx prisma migrate deploy` applies `phase4_support`.

---
*Phase: 04-support-retention*
*Completed: 2026-10-03*

## Self-Check: PASSED

- FOUND: lib/tickets-service.ts
- FOUND: tests/unit/tickets-service.test.ts
- FOUND: prisma/migrations/20261003105129_phase4_support/migration.sql
- FOUND: .planning/phases/04-support-retention/04-01-SUMMARY.md
- FOUND: 208b07d (Task 1 schema + migration)
- FOUND: 36deea0 (Task 2 service create/read)
- FOUND: 50768f4 (Task 3 RED)
- FOUND: 98c344d (Task 3 GREEN)
