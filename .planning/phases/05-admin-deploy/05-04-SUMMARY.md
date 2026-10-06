---
phase: 05-admin-deploy
plan: 04
subsystem: auth
tags: [rbac, admin, tickets, roles, nextjs, vitest, prisma]

requires:
  - phase: 05-admin-deploy
    provides: "admin_users-backed requireRole guard and admin shell"
  - phase: 04-support-retention
    provides: "ticket routes, attachment ownership, and reusable ticket UI"
provides:
  - "Role-aware admin ticket queue, thread actions, and attachment authorization"
  - "Administrator-only role management with self-change and last-admin protection"
  - "Responsive roles UI with confirmation, loading, empty, error, and overflow states"
  - "Removal of all legacy requireAdminSession/isAdmin callers"
affects: [05-06, 05-07, deploy]

actuals:
  tokens: 26000
  tasks: 4
  commits: 4

tech-stack:
  added: []
  patterns:
    - "Admin ticket access is resolved server-side by role: administrator/support staff or ticket owner for attachments"
    - "Role writes use Serializable conditional updateMany and preserve at least one administrator"
    - "Admin role tables switch from a scrollable real table to stacked mobile cards below sm"

key-files:
  created:
    - app/api/admin/roles/route.ts
    - lib/admin-roles.ts
    - components/admin/AdminConfirmPanel.tsx
    - components/admin/RoleChangeControl.tsx
    - components/admin/RolesManager.tsx
    - app/admin/roles/page.tsx
  modified:
    - lib/session.ts
    - lib/admin-auth.ts
    - lib/tickets-service.ts
    - app/api/admin/tickets/[id]/reply/route.ts
    - app/api/admin/tickets/[id]/close/route.ts
    - app/api/tickets/[id]/attachments/[attachmentId]/route.ts
    - app/admin/users/[id]/page.tsx
    - lib/i18n/messages/ru.ts
    - tests/unit/admin-route.test.ts

key-decisions:
  - "The final legacy-gate cleanup moved bootstrap allow-list parsing into admin-auth, leaving session.ts responsible only for session and error primitives."
  - "Last-admin refusal and unknown-target refusal share a generic not_found response to avoid an authorization oracle."
  - "The existing Task 1 and Task 2 implementation commits were preserved; only the pending UI tests and legacy-gate cleanup were added."

requirements-completed: [ADM-01]

coverage:
  - id: D1
    description: "Administrator and support can use the admin ticket surfaces; manager and signed-out callers cannot."
    requirement: ADM-01
    verification:
      - kind: unit
        ref: "tests/unit/tickets-route.test.ts and tests/unit/admin-route.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "Attachment access is owner-or-administrator/support, with manager non-owner returning 404."
    requirement: ADM-01
    verification:
      - kind: unit
        ref: "tests/unit/ticket-attachments.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "Administrator role changes are self-change blocked, last-admin safe, and serialized against concurrent downgrades."
    requirement: ADM-01
    verification:
      - kind: unit
        ref: "tests/unit/admin-route.test.ts#role changes — last-admin lockout + concurrency"
        status: pass
    human_judgment: false
  - id: D4
    description: "Roles UI renders responsive table/cards, long-text handling, loading/empty/error states, and variant-keyed confirmations."
    requirement: ADM-01
    verification:
      - kind: unit
        ref: "tests/unit/admin-route.test.ts#/admin/roles — guard + UI states"
        status: pass
    human_judgment: false
  - id: D5
    description: "No legacy admin gate caller remains and the complete application passes typecheck, unit suite, and production build."
    verification:
      - kind: other
        ref: "npx tsc --noEmit; DATABASE_URL=… npx vitest run tests/unit (35 files/336 tests); npm run build with throwaway env"
        status: pass
    human_judgment: false

duration: 18min
completed: 2026-10-05
status: complete
---

# Phase 5 Plan 04: Admin RBAC Surface Summary

**Role-aware admin ticket access and responsive administrator-only role management with lockout-safe conditional writes**

## Performance

- **Duration:** ~18 min of resumed execution
- **Started:** 2026-10-05
- **Completed:** 2026-10-05
- **Tasks:** 4
- **Files modified:** 15 key files, plus the completed Task 1/2 implementation set

## Accomplishments

- Preserved the completed Task 1 and Task 2 commits implementing role-aware ticket/attachment gates, role management, and Serializable last-admin protection.
- Verified and committed the remaining roles UI coverage: responsive table/card rendering, loading/empty/error states, long-name handling, and primary/destructive confirmation contracts.
- Removed the obsolete `requireAdminSession` and `isAdmin` gate from `lib/session.ts`; bootstrap membership is now parsed only by the role-aware auth module.
- Completed the blocking wave check: TypeScript, all 35 unit test files (336 tests), and production build with non-secret placeholder environment values pass.

## Task Commits

1. **Task 1: End-to-end role-aware ticket and role-management path** — `430adf8` (feat)
2. **Task 2: Last-admin lockout + concurrent role-change protection** — `47f5e24` (feat)
3. **Task 3: Roles UI polish and state coverage** — `6f2578d` (test)
4. **Task 4: Legacy admin gate removal + full-suite wave check** — `ab80f1b` (fix)

## Decisions Made

- Bootstrap env membership remains create-only and is owned by `admin-auth`; the session module no longer exposes a legacy admin allow-list API.
- Role mutation failures intentionally collapse to generic not-found semantics where revealing the target/lockout state would create an oracle.
- No `STATE.md` or `ROADMAP.md` files were changed, as requested for this resumed execution.

## Deviations from Plan

None requiring additional implementation. The initial bare `npm run build` lacked required environment variables; it was rerun successfully with throwaway, non-secret build values as required by the plan's build verification.

## Issues Encountered

- The provider timeout left Task 3's test additions uncommitted; they were verified first and committed atomically without repeating Tasks 1 or 2.
- A bare build failed during env validation because `.env.local` was not supplied to the command. The build passed with placeholders and did not use production secrets.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- ADM-01's RBAC, ticket, attachment, and role-management surfaces are ready for the remaining phase work.
- The full unit suite and production build are green; no legacy admin gate caller remains.

## Self-Check: PASSED

- Existing implementation commits found: `430adf8`, `47f5e24`.
- Remaining task commits found: `6f2578d`, `ab80f1b`.
- Summary file created and all required verification commands passed.
- `STATE.md` and `ROADMAP.md` were not modified.

---
*Phase: 05-admin-deploy*
*Completed: 2026-10-05*
