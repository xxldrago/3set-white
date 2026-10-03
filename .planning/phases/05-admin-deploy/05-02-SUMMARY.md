---
phase: 05-admin-deploy
plan: 02
subsystem: admin
tags: [admin, rbac, search, prisma, nextjs, vitest, postgres, pii]

requires:
  - phase: 05-admin-deploy
    provides: "lib/admin-auth.requireRole + AdminRole/AdminSection matrix; role-gated /admin shell; admin i18n block"
  - phase: 04-support-retention
    provides: "tickets-service list shape; AdminError→404 discipline"
  - phase: 02-keys
    provides: "keys-service deriveStatusKind/statusLabel/formatKeyDate; RenderedKey read idiom"
  - phase: 03-money
    provides: "orders-service toHistoryRow/OrderHistoryRow provider-free mapper"
provides:
  - "lib/admin-service.ts: adminSearchUsers (exact-first, dedupe, 50-cap+truncated, PII-minimal) + loadAdminProfile/loadAdminHeader/loadAdminKeys/loadAdminPayments/loadAdminTickets"
  - "role-gated GET /api/admin/users/search and GET /api/admin/users/[id] BFF routes"
  - "/admin/users search page (client island) + /admin/users/[id] read-only profile with three independent Suspense sections"
  - "components/admin/{UserSearchForm,UserSearchResults,UserProfileCard,AdminKeyRow}.tsx"
  - "admin.* search/profile i18n keys (21)"
affects: [05-03, 05-04, 05-07]

actuals:
  tokens: 14014
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Admin read models are NOT owner-filtered: authorization is the resolved role (requireRole), never a caller telegram id"
    - "PII-minimal admin DTOs: search returns only {userId,telegramId,displayName,staffRole?}; profile key view drops subscriptionUrl/traffic/customerRef"
    - "Per-section profile degradation via settle() → {ok:true,rows}|{ok:false}; each section its own Suspense + catch + retry"
    - "Structural element-tree tests (walkElements/collectStrings) + source contract tests for read-only/no-clear invariants without a DOM"

key-files:
  created:
    - lib/admin-service.ts
    - app/api/admin/users/search/route.ts
    - app/api/admin/users/[id]/route.ts
    - app/admin/users/page.tsx
    - app/admin/users/[id]/page.tsx
    - components/admin/UserSearchForm.tsx
    - components/admin/UserSearchResults.tsx
    - components/admin/UserProfileCard.tsx
    - components/admin/AdminKeyRow.tsx
    - tests/unit/admin-search.test.ts
  modified:
    - lib/i18n/messages/ru.ts

key-decisions:
  - "Search count = total matches BEFORE the 50-row cap; exact telegram-id match is inserted first so it always orders ahead of key/customerRef hits"
  - "Profile payments/tickets sub-sections render inline row anatomy (PaymentStatusChip/TicketStatusChip + formatPaymentDate) instead of reusing PaymentHistoryList/TicketList verbatim, because both hardcode owner-scoped links (/keys, /support) that would 404 for an admin viewing another user; tickets link to /admin/tickets/[id] per UI-SPEC §4"
  - "AdminKeyRow uses a narrowed AdminKeyView (no subscriptionUrl/traffic/customerRef) so a profile payload can never carry a provider sub-link (T-05-05)"

patterns-established:
  - "Admin BFF route skeleton: requireRole('administrator','support','manager') → zod → service; SessionError→401, AdminError→404 (never 403), else 500"
  - "Profile page: header read first (null→notFound), then three independent <Suspense> sections that each catch alone"

requirements-completed: [ADM-02]

coverage:
  - id: D1
    description: "Admin finds a user by exact telegram-id or key/customerRef; exact match ordered first; dedupe by user"
    requirement: ADM-02
    verification:
      - kind: unit
        ref: "tests/unit/admin-search.test.ts # exact-first + key/customerRef contains + dedupe"
        status: pass
    human_judgment: false
  - id: D2
    description: "≥2 count header, 50-row cap with truncation notice, no-results; no PII (chatId/token/sub-link) in any result"
    requirement: ADM-02
    verification:
      - kind: unit
        ref: "tests/unit/admin-search.test.ts # truncation boundary, structural rendering, PII assertions"
        status: pass
    human_judgment: false
  - id: D3
    description: "Read-only profile with keys/payments/tickets; a Keys read failure degrades only Keys; empty ≠ errored copy"
    requirement: ADM-02
    verification:
      - kind: unit
        ref: "tests/unit/admin-search.test.ts # per-section independence + AdminKeyRow read-only + empty-vs-error"
        status: pass
    human_judgment: false
  - id: D4
    description: "requireRole enforced on routes and pages; no-role/wrong-role → 404; signed-out → 401/redirect; unknown id & telegram id both 404 (A4)"
    requirement: ADM-02
    verification:
      - kind: unit
        ref: "tests/unit/admin-search.test.ts # route gating, page guard, id semantics"
        status: pass
    human_judgment: false
  - id: D5
    description: "Rendered search/profile visuals (states, truncation, long-text, chip tint) in a browser"
    verification: []
    human_judgment: true
    rationale: "Unit tests pin structure/source; the actual rendered look (skeleton timing, truncation ellipsis, role chip on a staff row) needs a human/browser check"

duration: 12min
completed: 2026-10-04
status: complete
---

# Phase 5 Plan 02: Admin User Search & Read-Only Profile Summary

**Role-gated admin user search (exact telegram-id or key reference, PII-minimal) plus a read-only profile whose keys/payments/tickets degrade independently — forbidden is always 404**

## Performance

- **Duration:** ~12 min
- **Tasks:** 3
- **Files modified:** 11 (10 created, 1 modified)
- **Tests:** +31 in `tests/unit/admin-search.test.ts`; full suite **32 files / 299 tests** green

## Accomplishments

- **Search (ADM-02/D-68):** `adminSearchUsers(q)` trims; a fully-numeric `q` takes the exact `User.telegramId` branch FIRST (ordered first), then a parameterised `contains` on `keys_cache.keyId`/`customerRef`; de-dupes by user; caps at 50 with `truncated` + `count` (total matches). Returns ONLY `{ userId, telegramId, displayName, staffRole? }` — never chatId/tokens/sub-links (T-05-05).
- **Profile reads (ADM-02):** `loadAdminProfile(userId)` returns header + three independent `{ok:true,rows}|{ok:false}` sections. Keys are narrowed to `AdminKeyView` (id/name/status/isTrial/expiry/devices — no subscriptionUrl/traffic/customerRef); payments reuse `toHistoryRow`; tickets reuse the cabinet list shape.
- **Gated BFF routes:** `GET /api/admin/users/search` and `GET /api/admin/users/[id]` both `requireRole('administrator','support','manager')` (the `users` section is held by all three roles), zod-validate `q` (≤200) / `id` (internal `User.id`), and map SessionError→401, AdminError→404, else 500.
- **Pages + components:** `/admin/users` guard re-check + `UserSearchForm` client island (AbortController in-flight abort, unmount cleanup, submit disabled on blank/in-flight, query retained across all five states); `/admin/users/[id]` guard re-check, unknown id/telegram id → `notFound()`, header + three independent `<Suspense>` sub-sections each catching alone (`admin.profilePartial` + `common.retry`); distinct empty copy per section. Read-only `AdminKeyRow` (no renew/upgrade).
- **i18n:** 21 `admin.*` search/profile leaf keys added; all referenced in the same plan (i18n completeness green).

## Task Commits

1. **Task 1: admin user search + read-only profile (tracer)** — `528ca22` (feat)
2. **Task 2: search edge states, role coverage, PII discipline** — `21950f5` (test)
3. **Task 3: profile per-section degradation + AdminKeyRow read-only** — `f49fb5f` (test)

## Files Created/Modified

- `lib/admin-service.ts` — search + header/section loaders, narrowed admin views
- `app/api/admin/users/search/route.ts`, `app/api/admin/users/[id]/route.ts` — gated BFF routes
- `app/admin/users/page.tsx` — guard + search island
- `app/admin/users/[id]/page.tsx` — guard + header + three independent sections
- `components/admin/UserSearchForm.tsx` — client island (five states)
- `components/admin/UserSearchResults.tsx` — result rows (count header ≥2, truncation, truncate+title, tabular-nums)
- `components/admin/UserProfileCard.tsx` — profile header + reserved role-action slot
- `components/admin/AdminKeyRow.tsx` — read-only key row (no panels)
- `tests/unit/admin-search.test.ts` — 31 vectors
- `lib/i18n/messages/ru.ts` — `admin.*` search/profile keys

## Decisions Made

- Search `count` is the total matched users before the 50-row cap; the exact telegram-id hit is inserted first so ordering is stable.
- Payments/tickets render inline row anatomy rather than reusing `PaymentHistoryList`/`TicketList` verbatim (see Deviations) to avoid owner-scoped `404` links and to honour the `/admin/tickets/[id]` target.
- The profile role-action control is intentionally NOT defined here; `UserProfileCard` reserves a `children` slot for plan 05-04.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Inline profile payments/tickets rows instead of reusing the cabinet components verbatim**
- **Found during:** Task 1 (`app/admin/users/[id]/page.tsx`)
- **Issue:** `PaymentHistoryList` hardcodes a `/keys/{keyId}` link and `TicketList` hardcodes a `/support/{id}` link. Both are owner-scoped routes; on an admin profile they would 404 for another user's key/ticket, and `TicketList` cannot target `/admin/tickets/[id]` as UI-SPEC §4 requires.
- **Fix:** Rendered the same row anatomy inline using the existing presentational primitives (`PaymentStatusChip`, `TicketStatusChip`, `formatPaymentDate`, `pay.amount`/`pay.date`/`kindLabel`), with `keyId` shown as truncated text (no broken link) and tickets linking to `/admin/tickets/[id]`. `toHistoryRow` is still reused for the payment data — only the wrapper component differs.
- **Files modified:** `app/admin/users/[id]/page.tsx`
- **Committed in:** `528ca22`

### Notes (no code change needed)

- Tasks 2 and 3 list `app/admin/users/page.tsx`, `components/admin/UserSearchForm.tsx`, `components/admin/AdminKeyRow.tsx`, and `app/admin/users/[id]/page.tsx`; the Task-1 tracer already satisfied those contracts, so those tasks added pinning tests only. No source change was required.

**Total deviations:** 1 auto-fixed (1 bug). **Impact:** Correct admin links; no scope creep, no packages added.

## Issues Encountered

- `BigInt` literals (`0n`) are unavailable at the project's `target: ES2017`; used `BigInt(0)` in `lib/admin-service.ts`.
- The i18n completeness scanner counts `tp('admin.searchCount')` as a `One/Few/Many` triplet, so all three forms are present (the UI only renders the ≥2 forms).

## Known Stubs

- `components/admin/UserProfileCard.tsx` — the `children` slot is intentionally empty pending plan 05-04's administrator-only `admin.rolesChange` control (UI-SPEC §4). This is a planned extension point, not a broken state; the profile goal is fully achieved without it.

## User Setup Required

None — no external service configuration required. DB migrated already (`setwhite`, 5 migrations up to date).

## Threat Flags

None new. The modelled surface is exactly T-05-05 (PII minimum — asserted absent), T-05-06 (requireRole deny-by-default on both routes and both pages), T-05-07 (read-only `AdminKeyRow`; unknown id → 404), T-05-08 (zod length cap + Prisma parameterised contains). No new endpoints, secrets, or trust boundaries beyond the plan.

## Next Phase Readiness

- `lib/admin-service.ts` read models are the stable base for admin tickets (05-03) and the stats dashboard (05-07); `loadAdminProfile` already lives by the "not owner-filtered, role-authorized" contract.
- `/admin/users` and `/admin/users/[id]` are wired into the role-filtered `AdminNav` (`users` section present).
- `UserProfileCard` children slot ready for the 05-04 role action.

## Self-Check: PASSED

- Created files verified present (10/10).
- Commits verified: `528ca22`, `21950f5`, `f49fb5f`.
- `npx tsc --noEmit` clean; `DATABASE_URL=… npx vitest run tests/unit` → 32 files / 299 tests passed.

---
*Phase: 05-admin-deploy*
*Completed: 2026-10-04*
