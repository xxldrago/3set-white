---
phase: 04-support-retention
plan: 04
subsystem: api
tags: [bff, routes, multipart, sharp, attachment-serving, nosniff, admin-gate, ownership-join, sup-01, sup-02, sup-03]

# Dependency graph
requires:
  - phase: 04-support-retention
    plan: 04-01
    provides: Ticket/TicketMessage/Attachment schema + shared lib/tickets-service.ts (create/reply/read/close)
  - phase: 04-support-retention
    plan: 04-02
    provides: lib/attachments.ts (normalizeImage/saveAttachment/readAttachment + MAX_ATTACHMENT_BYTES)
  - phase: 04-support-retention
    plan: 04-03
    provides: enqueueNotification + NOTIFY_TICKET_REPLY (sibling Notification queue)
  - phase: 04-support-retention
    plan: 04-07
    provides: bot support intake (the other channel head for SUP-01/SUP-02)
provides:
  - cabinet BFF ticket boundaries — POST /api/tickets (multipart), /messages, /read, gated /attachments/[attachmentId]
  - admin-gated /api/admin/tickets/[id]/reply + /close (enqueue-only, D-57)
  - lib/session.ts AdminError + requireAdminSession + isAdmin (ADMIN_TELEGRAM_IDS allow-list; Phase 5 replaces with ADM-01 roles)
  - lib/tickets-service.ts getOwnedAttachment (owner-or-admin attachment join)
  - Wave-0 tests/unit/tickets-route.test.ts (21 vectors: 401/400/413/404/200 + nosniff + admin gating + enqueue-on-reply)
affects: [04-05 cabinet support list, 04-06 thread UI, 05 admin panel]

actuals:
  tokens: 10348
  tasks: 4
  commits: 5

tech-stack:
  added: []
  patterns:
    - "Thin session-gated BFF boundary over the shared service (requireSession -> typed codes only)"
    - "Multipart ingest: File.size cap (413) before decode, magic-byte normalizeImage (400), relative-path-only persistence"
    - "Gated same-origin serve: owner-or-admin join -> 404, bytes re-confined by readAttachment, nosniff + private cache, no stored path emitted"
    - "Admin gate = env allow-list behind requireAdminSession; AdminError maps to 404 (no route enumeration)"
    - "Admin reply enqueues a durable Notification (dedupeKey ticket:{id}:{messageId}) and never sends Telegram inline"

key-files:
  created:
    - app/api/tickets/route.ts
    - app/api/tickets/[id]/messages/route.ts
    - app/api/tickets/[id]/read/route.ts
    - app/api/tickets/[id]/attachments/[attachmentId]/route.ts
    - app/api/admin/tickets/[id]/reply/route.ts
    - app/api/admin/tickets/[id]/close/route.ts
    - tests/unit/tickets-route.test.ts
  modified:
    - lib/session.ts
    - lib/tickets-service.ts

key-decisions:
  - "requireAdminSession/isAdmin created in lib/session.ts (Task 3) BEFORE the gated serve route and admin routes import it — no forward reference"
  - "Admin gate reads ADMIN_TELEGRAM_IDS via the env singleton; empty/unset = no admins; the allow-list itself is never returned"
  - "getOwnedAttachment takes an isAdminUser boolean (route computes isAdmin) so the service stays free of a next/headers import"
  - "Non-owned ticket/attachment ≡ 404 on every route — no ownership or route-existence oracle"
  - "Create route persists the image under a server-generated randomUUID scope because the service mints the ticket id; only the relative path crosses into the DB"
  - "Messages route saves under the real ticket id (it already exists) and allows an image-only reply (body or attachment required)"
  - "Admin reply enqueues exactly one notification per message id — a retry with a new message id is a distinct delivery; never sendMessage inline (D-57)"

patterns-established:
  - "multipart route: formData -> zod fields -> File size cap -> normalizeImage -> saveAttachment -> service"
  - "gated serve: getOwnedAttachment(owner-or-admin) -> readAttachment -> new Response(Uint8Array, nosniff headers)"
  - "AdminError (403) mapped to 404 by admin routes; SessionError (401) mapped to 401"

requirements-advanced: [SUP-01, SUP-02, SUP-03]
requirements-completed: []

coverage:
  - id: D1
    description: "Signed-in user creates a ticket (optional <=5 MiB image) via one multipart BFF route delegating to the shared service"
    requirement: SUP-01
    verification:
      - kind: unit
        ref: "tests/unit/tickets-route.test.ts#creates an open ticket with one user message and one relative-path attachment"
        status: pass
      - kind: unit
        ref: "tests/unit/tickets-route.test.ts#rejects an oversize attachment with 413 before writing"
        status: pass
      - kind: unit
        ref: "tests/unit/tickets-route.test.ts#rejects a non-image attachment with 400"
        status: pass
    human_judgment: false
  - id: D2
    description: "User reply reopens the same thread (D-59); mark-read clears the unread counter (D-58); non-owned ≡ 404"
    requirement: SUP-01
    verification:
      - kind: unit
        ref: "tests/unit/tickets-route.test.ts#reopens the SAME thread on an owner reply to a closed ticket (no second ticket)"
        status: pass
      - kind: unit
        ref: "tests/unit/tickets-route.test.ts#clears unreadForUser for the owner (200)"
        status: pass
      - kind: unit
        ref: "tests/unit/tickets-route.test.ts#returns 404 for a non-owner reply and appends nothing"
        status: pass
    human_judgment: false
  - id: D3
    description: "Attachments served only through the gated same-origin route; owner-or-admin; nosniff; no stored path or public URL (D-56)"
    requirement: SUP-02
    verification:
      - kind: unit
        ref: "tests/unit/tickets-route.test.ts#serves the owner 200 with nosniff + private cache and no stored path"
        status: pass
      - kind: unit
        ref: "tests/unit/tickets-route.test.ts#404s a non-owner without reading the file (no oracle)"
        status: pass
      - kind: unit
        ref: "tests/unit/tickets-route.test.ts#serves an allow-listed admin a ticket they do not own (200)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Support replies and close are admin-gated (D-51) and enqueue delivery rather than sending synchronously (D-57)"
    requirement: SUP-03
    verification:
      - kind: unit
        ref: "tests/unit/tickets-route.test.ts#admin reply creates one support message, bumps unread, and enqueues (no inline send)"
        status: pass
      - kind: unit
        ref: "tests/unit/tickets-route.test.ts#404s a valid non-admin session and mutates nothing"
        status: pass
      - kind: unit
        ref: "tests/unit/tickets-route.test.ts#admin close marks the ticket closed; missing ticket 404s"
        status: pass
    human_judgment: false

duration: 7min
completed: 2026-10-03
status: complete
---

# Phase 4 Plan 4: Support BFF routes & admin gate Summary

**Six session/admin-gated HTTP handlers expose the support thread to the cabinet — multipart create, reply/reopen, mark-read, owner-or-admin gated attachment serving (nosniff, private cache, no public URL), and admin reply/close that enqueue durable delivery instead of sending Telegram inline — all thin boundaries over the shared `lib/tickets-service.ts`.**

## Performance

- **Duration:** 7 min
- **Started:** 2026-10-03T12:00:09Z
- **Completed:** 2026-10-03T12:07:37Z
- **Tasks:** 4 (Task 2 is TDD with a RED→GREEN pair; Task 1 is a tracer)
- **Files modified:** 9 (7 created, 2 modified)

## Accomplishments

- Every ticket route resolves the caller from the signed session cookie (never a client-supplied id) and returns only typed codes — no provider/DB text and no storage path is ever emitted (T-04-14/T-04-19).
- `POST /api/tickets` validates `subject <=120` / `body <=4000`, enforces the 5 MiB cap **before** decode (413), decides the format from decoded bytes via the shared `normalizeImage` (400 on non-image), and persists only a path relative to `UPLOAD_DIR` (T-04-16).
- The gated serve route joins attachment → message → ticket, authorizes owner **or** an allow-listed admin, and streams the bytes with `X-Content-Type-Options: nosniff`, `Content-Disposition: inline`, and a `private` cache header; a non-owner gets 404 without any file read (T-04-17/T-04-18).
- Admin routes use the new `requireAdminSession()` (`ADMIN_TELEGRAM_IDS` allow-list; empty/unset = no admins) and map a non-admin to 404 so the endpoints cannot be probed (T-04-15). The reply writes through `addSupportMessage` and **enqueues** one `notify-ticket-reply` Notification keyed `ticket:{id}:{messageId}` — never a synchronous `sendMessage` (D-57).
- Full unit suite green: 27 files / 239 tests (21 in the new route file); `npx tsc --noEmit` clean; `npm run build` exit 0 with the six new routes registered.

## Task Commits

Each task was committed atomically:

1. **Task 1: POST /api/tickets multipart create (tracer)** - `314f257` (feat)
2. **Task 2: User reply/reopen and mark-read routes (TDD)** - `20c38fe` (test, RED) → `af183c9` (feat, GREEN)
3. **Task 3: Gated attachment serve + admin gate helper** - `d06c31f` (feat)
4. **Task 4: Admin reply/close routes (enqueue only)** - `5fc5fb2` (feat)

**Plan metadata:** (this SUMMARY commit, docs)

_Note: Task 1 is a tracer whose automated `<verify>` was re-run end-to-end before expansion. Task 2 is TDD and has the RED→GREEN commit pair; the RED commit intentionally fails to resolve the not-yet-created routes._

## Files Created/Modified

- `app/api/tickets/route.ts` (NEW) — `POST` multipart create; `runtime = "nodejs"`; 401/400/413/201.
- `app/api/tickets/[id]/messages/route.ts` (NEW) — `POST` JSON-or-multipart reply; optional image; in-thread reopen; 404 non-owner.
- `app/api/tickets/[id]/read/route.ts` (NEW) — `POST` ownership-gated mark-read.
- `app/api/tickets/[id]/attachments/[attachmentId]/route.ts` (NEW) — `GET` owner-or-admin gated serve with nosniff/private cache.
- `app/api/admin/tickets/[id]/reply/route.ts` (NEW) — admin reply; service write + durable enqueue only.
- `app/api/admin/tickets/[id]/close/route.ts` (NEW) — admin close.
- `tests/unit/tickets-route.test.ts` (NEW) — 21 route vectors.
- `lib/session.ts` — `AdminError`, `adminIdSet` (private), `isAdmin`, `requireAdminSession`.
- `lib/tickets-service.ts` — `getOwnedAttachment(telegramId, ticketId, attachmentId, isAdminUser)`.

## Decisions Made

- **Gate ordering (objective requirement):** `AdminError`/`requireAdminSession`/`isAdmin` were added to `lib/session.ts` in Task 3 **before** the gated serve route was written; Task 4 imports the helper and does not redefine it.
- **Admin gate shape:** `ADMIN_TELEGRAM_IDS` is parsed per call from the env singleton into a `Set<number>` (empty/unset = no admins). Only membership (`isAdmin`) is exposed — the allow-list is never returned.
- **Service stays Next-free:** `getOwnedAttachment` receives an `isAdminUser` boolean computed by the route, so `lib/tickets-service.ts` never imports `lib/session.ts` (which pulls `next/headers`) and its DB-backed unit test keeps loading without a Next runtime.
- **Generated storage scope on create:** because `createTicket` mints the ticket id inside its transaction, the create route saves the image under a server-generated `randomUUID()` directory; the reply route (ticket id already known) saves under the real ticket id. Both persist only the relative path.
- **Image-only replies supported:** the messages route accepts a reply when either the trimmed body is non-empty or an attachment is present, matching the nullable `TicketMessage.body` model.
- **Enqueue-only admin reply:** a second reply creates a new message id, so its `dedupeKey` differs and a distinct Notification row is enqueued (proven by test).

## Deviations from Plan

None - plan executed exactly as written. Two implementation details were resolved within plan intent:
- The create route's attachment is saved under a generated scope id (the plan's "generated ticket scope") because the service owns ticket-id creation.
- The gated serve route wraps the `Buffer` in `new Uint8Array(...)` to satisfy the DOM `BodyInit` type (no behavior change).

## Threat Surface Scan

No new security-relevant surface beyond the plan's `<threat_model>`. Each threat is covered: T-04-14 (session gate + ownership join, non-owned ≡ 404), T-04-15 (`requireAdminSession` allow-list, non-admin → 404), T-04-16 (5 MiB cap + magic-byte check, 413/400), T-04-17 (`readAttachment` confinement + owner-or-admin gate + nosniff, no stored path), T-04-18 (jpeg/png/webp only, served as WebP + nosniff), T-04-19 (typed codes only, PII-safe logs).

## Known Stubs

None from this plan.

## Issues Encountered

- **Pre-existing build warning (not from this plan):** `npm run build` emits `Warning: Module not found: Can't resolve './reminders-service'` at `lib/worker.ts:324` (the intentional lazy dispatcher from 04-03, which plan 04-08 supplies). Build exits 0; no fix attempted (out of scope). Left in place for 04-08.
- The RED commit (`20c38fe`) fails module resolution by design (routes created in GREEN `af183c9`); no partial state was left behind.

## User Setup Required

None - no external service configuration required. For prod, add real Telegram ids to `ADMIN_TELEGRAM_IDS` to enable the admin reply/close routes (comma-separated; empty = no admins). DB `postgresql://alekseimikhalkin@127.0.0.1:5432/setwhite` already provisioned.

## Next Phase Readiness

- 04-05/04-06 (cabinet support list + thread UI) can call `POST /api/tickets`, `POST /api/tickets/[id]/messages`, `POST /api/tickets/[id]/read`, and render `<img src="/api/tickets/{id}/attachments/{attachmentId}">` — the only attachment URL, gated same-origin.
- The admin routes are ready for Phase 5's ADM-01 role model; Phase 5 replaces the env allow-list behind the same `requireAdminSession()` seam.
- No blockers. `SUP-01/02/03` full completion still depends on the cabinet UI plans (04-05/04-06); this plan delivers the server boundaries.

## Self-Check: PASSED

- FOUND: app/api/tickets/route.ts
- FOUND: app/api/tickets/[id]/messages/route.ts
- FOUND: app/api/tickets/[id]/read/route.ts
- FOUND: app/api/tickets/[id]/attachments/[attachmentId]/route.ts
- FOUND: app/api/admin/tickets/[id]/reply/route.ts
- FOUND: app/api/admin/tickets/[id]/close/route.ts
- FOUND: lib/session.ts
- FOUND: lib/tickets-service.ts
- FOUND: tests/unit/tickets-route.test.ts
- FOUND: 314f257 (Task 1 tracer)
- FOUND: 20c38fe (Task 2 RED)
- FOUND: af183c9 (Task 2 GREEN)
- FOUND: d06c31f (Task 3 gated serve + admin gate)
- FOUND: 5fc5fb2 (Task 4 admin routes)

---
*Phase: 04-support-retention*
*Completed: 2026-10-03*
