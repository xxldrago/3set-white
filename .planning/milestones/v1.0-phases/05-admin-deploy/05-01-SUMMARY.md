---
phase: 05-admin-deploy
plan: 01
subsystem: auth
tags: [rbac, prisma, nextjs, admin, vitest, postgres]

requires:
  - phase: 04-support-retention
    provides: session gate (requireSession/SessionError), ADMIN_TELEGRAM_IDS allow-list, AdminError→404 discipline, Notification/Outbox patterns
provides:
  - admin_users table + AdminRole enum (migration 20261003221043_phase5_admin)
  - "lib/admin-auth.ts: can() UI-SPEC §1 matrix, cached getAdminRole, create-only bootstrap, requireRole"
  - role-gated /admin shell (layout + overview page) with layout-is-not-a-boundary enforcement
  - role-filtered AdminNav (client, pathname active-state) + RoleChip
  - admin i18n block; vitest @/* alias + ADMIN_TELEGRAM_IDS bootstrap env
affects: [05-02, 05-03, 05-04, 05-05, 05-06, 05-07, 06-*]

actuals:
  tokens: 7423
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "DAL role guard: resolve role server-side from admin_users; env is bootstrap create-only"
    - "Forbidden ≡ 404 with identical digest; never 403 (no role/route enumeration)"
    - "Layout = UX/nav filtering only; every page re-checks requireRole (partial rendering)"

key-files:
  created:
    - lib/admin-auth.ts
    - app/admin/layout.tsx
    - app/admin/page.tsx
    - components/admin/AdminNav.tsx
    - components/admin/RoleChip.tsx
    - tests/unit/admin-auth.test.ts
    - tests/unit/admin-route.test.ts
    - prisma/migrations/20261003221043_phase5_admin/migration.sql
  modified:
    - prisma/schema.prisma
    - lib/i18n/messages/ru.ts
    - vitest.config.ts

key-decisions:
  - "D-64 checkpoint adopted on record: roles live in admin_users (owner locked in CONTEXT.md); alternative role store rejected"
  - "Nav filtering stays server-side: layout computes allowed sections via can() and passes them to a client AdminNav that only adds pathname active-state (can/prisma never enter the client bundle)"
  - "getAdminRole wrapped in React cache() for one read per render; create-only upsert (update: {}) so env never re-elevates a UI downgrade"

patterns-established:
  - "Role guard contract: SessionError→401, AdminError→404; pages redirect('/login') then notFound()"
  - "Dashboard groups: independent Suspense + per-group catch → common.errorLoad + retry, never blank the page"

requirements-completed: [ADM-01]

coverage:
  - id: D1
    description: "admin_users table + AdminRole enum, migration phase5_admin applied"
    requirement: ADM-01
    verification:
      - kind: integration
        ref: "npx prisma migrate status → 5 migrations, database schema up to date"
        status: pass
    human_judgment: false
  - id: D2
    description: "can() literal matrix matches UI-SPEC §1; getAdminRole create-only bootstrap (no re-elevation)"
    requirement: ADM-01
    verification:
      - kind: unit
        ref: "tests/unit/admin-auth.test.ts (7 tests)"
        status: pass
      - kind: unit
        ref: "tests/unit/admin-route.test.ts # bootstrap is create-only across repeated calls"
        status: pass
    human_judgment: false
  - id: D3
    description: "Role-gated /admin: signed-out → /login redirect, wrong/no role → 404 (identical to missing), admin/manager → 200; page re-checks the guard"
    requirement: ADM-01
    verification:
      - kind: unit
        ref: "tests/unit/admin-route.test.ts (8 tests)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Admin shell UX: role-filtered nav (unpermitted sections absent from DOM), accent active pill, independent card-group degradation"
    verification: []
    human_judgment: true
    rationale: "Unit tests prove the server-side section filtering; the rendered nav (absence from the DOM, active pill) and the skeleton/error visuals need a human/browser check"

duration: 6min
completed: 2026-10-03
status: complete
---

# Phase 5 Plan 01: Admin RBAC Spine Summary

**`admin_users`-backed RBAC: a cached role guard with create-only env bootstrap and a role-gated `/admin` shell where forbidden is always 404**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-10-03T22:08:07Z
- **Completed:** 2026-10-03T22:14:17Z
- **Tasks:** 3 (+ D-64 checkpoint adopted)
- **Files modified:** 11 (8 created incl. migration, 3 modified)

## Accomplishments
- `AdminUser`/`AdminRole` model + `admin_users` migration applied (`20261003221043_phase5_admin`), `prisma migrate status` up to date.
- `lib/admin-auth.ts`: pure `can()` matrix exactly matching UI-SPEC §1; `getAdminRole` reads `admin_users`, creates an `administrator` row once for an `ADMIN_TELEGRAM_IDS` member and **never updates an existing role** (downgrade survives); `requireRole(...roles)` maps unauth → `SessionError` (401) and wrong/no role → `AdminError` (404).
- `/admin` layout (`AdminShell`) + overview page: signed-out → `/login`, non-staff/wrong role → 404 never 403 with byte-identical digest to a missing route; the page re-checks the guard itself because layouts are not a security boundary.
- Role-filtered `AdminNav` (client island, pathname active-state) + neutral-zinc `RoleChip`; unpermitted sections are absent from the DOM.
- Overview scaffolding: DB and ARTEMIDA card groups behind independent Suspense boundaries, each catching alone (`common.errorLoad` + retry) — plan 05-07 fills the reads.
- Full unit suite green: **31 files / 268 tests**, `npx tsc --noEmit` clean.

## Task Commits

1. **Task 1: [BLOCKING] End-to-end staff member opens /admin (tracer)** - `b20578e` (feat)
2. **Task 2: Admin route enforcement vectors 401/404/200** - `972b25d` (test)
3. **Task 3: Suspense + independently degrading overview groups** - `f32d9d4` (feat)

_Note: Task 2 was `tdd="true"`; the tracer (Task 1) already landed the guard, so the pinning vectors passed immediately (RED pre-satisfied, GREEN required no code change) — documented under Issues._

## Files Created/Modified
- `prisma/schema.prisma` - `AdminRole` enum + `AdminUser` model mapped to `admin_users`
- `prisma/migrations/20261003221043_phase5_admin/migration.sql` - applied migration
- `lib/admin-auth.ts` - `AdminRole`/`AdminSection`, `can()`, cached `getAdminRole` (create-only bootstrap), `requireRole`
- `app/admin/layout.tsx` - `AdminShell`: session gate, role resolution, nav filtering (UX only), header + cabinet link
- `app/admin/page.tsx` - overview; independently re-checks `requireRole('administrator','manager')`; two Suspense card groups
- `components/admin/AdminNav.tsx` - role-filtered nav, accent active pill, pathname-driven active state
- `components/admin/RoleChip.tsx` - neutral zinc role identity chip + shared `roleLabel()`
- `lib/i18n/messages/ru.ts` - `admin` block (18 referenced leaf keys)
- `tests/unit/admin-auth.test.ts` - matrix + bootstrap create-only vectors
- `tests/unit/admin-route.test.ts` - 401/404/200 mapping, page redirect/404 parity, bootstrap-once
- `vitest.config.ts` - `@/*` alias mirror + `ADMIN_TELEGRAM_IDS` bootstrap env

## Decisions Made
- **D-64 adopted on record** (checkpoint:decision): roles live in the dedicated `admin_users` table per CONTEXT.md; the env/IdP alternative conflicts with locked D-64 and UI-managed roles. No schema alternative was taken.
- **Nav filtering architecture:** the server layout filters sections with `can()` and passes the allowed list to the client `AdminNav`; the client island only computes the active pill from `usePathname()`. This keeps `can`/Prisma out of the client bundle while still satisfying "unpermitted sections absent from the DOM".
- **Role label lives in `RoleChip.roleLabel()`** so the literal `t('admin.role…')` calls are registered once and reused by the shell header.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] vitest could not resolve the `@/*` path alias**
- **Found during:** Task 1 (page/component testability)
- **Issue:** `app/admin/page.tsx` and the components use `@/…` imports by project convention, but `vitest.config.ts` had no `resolve.alias`, so importing the page under test failed with `Cannot find package '@/lib/i18n'`.
- **Fix:** Added `resolve.alias { '@': <repo root> }` mirroring tsconfig `paths` (`@` matches `@/` only, not `@prisma/adapter-pg`).
- **Files modified:** `vitest.config.ts`
- **Verification:** `admin-route.test.ts` imports the page; full suite (incl. Prisma-dependent tests) green.
- **Committed in:** `b20578e` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Test-infrastructure only; no production behavior change, no scope creep. No packages added.

## Issues Encountered
- **Task 2 TDD nuance:** the task is `tdd="true"`, but the tracer already implemented the enforcement path, so the new vectors were green on first run. Rather than manufacture a red state, they were committed as a pinning suite; the create-only/downgrade vectors still exercise the real DB. No implementation change was needed for GREEN.
- `prisma migrate dev` created the migration but the generated client initially lacked `AdminUser` (gitignored `generated/`); an explicit `npx prisma generate` regenerated it.

## Known Stubs
- `app/admin/page.tsx` — overview metric cards render the intentional `—`/empty baseline (both card groups). Resolved by **plan 05-07** (DB stats, ARTEMIDA keys/devices/balance + balance chip), per this plan's explicit instruction not to import `lib/artemida.ts` yet.
- `app/admin/page.tsx` — the two group `try/catch` blocks are degradation scaffolding with no data read yet; plan 05-07 wires the reads inside them.

## User Setup Required
None - no external service configuration required.

## Threat Flags
None - the new surface is exactly the modelled browser→`/admin` and env→bootstrap boundaries (T-05-01..T-05-04); no new endpoints or secret exposure.

## Next Phase Readiness
- `requireRole`/`can`/`getAdminRole` are the stable DAL contract for every later admin plan (routes map `AdminError`→404, `SessionError`→401).
- `/admin` shell, nav and i18n block ready for plans 05-02..05-06 to add pages; 05-07 fills overview stats.
- Production note: `admin_users` must be applied via `prisma migrate deploy` (image entrypoint) on the server; the local migration is applied.

## Self-Check: PASSED

---
*Phase: 05-admin-deploy*
*Completed: 2026-10-03*