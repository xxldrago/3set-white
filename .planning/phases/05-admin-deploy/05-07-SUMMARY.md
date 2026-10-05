---
phase: 05-admin-deploy
plan: 07
subsystem: admin-stats
tags: [admin, prisma, artemida, balance-alerts, telegram, worker, vitest]
requires:
  - phase: 05-admin-deploy
    provides: role-gated admin overview, Notification outbox, worker, and locked balance env threshold
provides:
  - cached and independently degradable DB and ARTEMIDA statistics dashboard
  - threshold-based balance classification, chip, banner, and worker logging
  - idempotent Telegram DM alerts to configured administrator IDs
affects: [deploy, admin-operations]
actuals:
  tokens: 6213
  tasks: 2
  commits: 2
tech-stack:
  added: []
  patterns:
    - short-TTL module cache with safe provider degradation
    - balance alerts reuse the Notification queue with date-and-band dedupe keys
key-files:
  created:
    - lib/admin-stats.ts
    - lib/balance-alert.ts
    - components/admin/PeriodSelector.tsx
    - components/admin/StatsPanel.tsx
    - components/admin/BalanceChip.tsx
    - components/admin/BalanceAlert.tsx
    - tests/unit/admin-stats.test.ts
    - tests/unit/balance-alert.test.ts
  modified:
    - app/admin/page.tsx
    - lib/outbox.ts
    - lib/worker.ts
    - lib/i18n/messages/ru.ts
key-decisions:
  - "A6 resolved to banner + WARN/ERROR log + idempotent Telegram DM for ADMIN_TELEGRAM_IDS."
  - "Balance DM dedupe keys include date, threshold band, and administrator ID, so hourly ticks do not spam recipients while low-to-critical transitions remain visible."
requirements-completed: [ADM-03, ADM-04]
coverage:
  - id: D1
    description: "Admin overview renders period DB revenue/users/orders and cached ARTEMIDA keys/devices/balance with independent degradation."
    requirement: ADM-03
    verification:
      - kind: unit
        ref: "tests/unit/admin-stats.test.ts"
        status: pass
      - kind: other
        ref: "npx tsc --noEmit"
        status: pass
    human_judgment: false
  - id: D2
    description: "Balance threshold classification, admin banner, worker log, and idempotent Telegram admin DM are implemented."
    requirement: ADM-04
    verification:
      - kind: unit
        ref: "tests/unit/balance-alert.test.ts"
        status: pass
      - kind: unit
        ref: "tests/unit/i18n.test.ts"
        status: pass
    human_judgment: false
duration: ~20min
completed: 2026-10-05
status: complete
---

# Phase 05 Plan 07: Admin stats and balance alerts Summary

**Role-gated admin statistics now combine cached ARTEMIDA operational data with period DB aggregates and durable, deduplicated low-balance Telegram alerts.**

## Performance

- **Duration:** ~20 min across checkpoint continuation
- **Started:** 2026-10-05
- **Completed:** 2026-10-05
- **Tasks:** 2
- **Files modified:** 12

## Accomplishments

- Added period-selectable revenue, users, and paid-order aggregates alongside one cached ARTEMIDA balance/key-list read; provider failures degrade without blanking DB cards.
- Added locked-threshold `ok`/`low`/`critical`/`unknown` classification, literal status chip labels, and low/critical admin status banners.
- Added an hourly guarded worker tick that logs standing low/critical conditions and enqueues one Notification per configured administrator using date + band + ID dedupe keys; existing broadcast and notification draining remains intact.
- Preserved Task 1 commit `30d14ad` and completed Task 2 in `5efbbd1`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Cached DB + ARTEMIDA stats dashboard** - `30d14ad` (feat)
2. **Task 2: Low-balance alert surface with Telegram DM** - `5efbbd1` (feat)

## Files Created/Modified

- `lib/admin-stats.ts` - DB aggregates and cached/degradable provider read.
- `lib/balance-alert.ts` - pure classifier, admin ID parsing, and DM dispatcher.
- `components/admin/StatsPanel.tsx` - stats cards plus balance status UI.
- `components/admin/PeriodSelector.tsx` - 7/30/90-day client selector.
- `components/admin/BalanceChip.tsx`, `components/admin/BalanceAlert.tsx` - literal status and banner UI.
- `lib/outbox.ts`, `lib/worker.ts` - durable alert enqueue and hourly delivery integration.
- `tests/unit/admin-stats.test.ts`, `tests/unit/balance-alert.test.ts` - stats, cache, device, and boundary coverage.

## Decisions Made

- A6 owner decision is **`dm`**: banner plus WARN/ERROR logging plus queued Telegram DMs to `ADMIN_TELEGRAM_IDS`.
- DMs use the existing Notification queue rather than synchronous sends; dedupe is per date, severity band, and admin ID.
- The existing `ARTEMIDA_LOW_BALANCE_RUB` schema field from 05-05 remains the sole threshold source; `lib/env.ts` was not changed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Blocking verification] Replaced dynamic i18n label selection with literal keys**
- **Found during:** Task 2 verification
- **Issue:** The i18n completeness scanner could not register two dynamically selected banner body keys.
- **Fix:** Used literal `t()` calls in the balance DM builder while preserving the same messages.
- **Files modified:** `lib/balance-alert.ts`
- **Verification:** `tests/unit/i18n.test.ts` passed.
- **Committed in:** `5efbbd1`

**Total deviations:** 1 auto-fixed (Rule 1)
**Impact on plan:** Required for the repository's i18n completeness gate; no scope creep.

## Issues Encountered

- The first focused verification caught unused i18n keys; fixed inline and reran the focused and full unit suites successfully.

## User Setup Required

None beyond setting the already-documented `ADMIN_TELEGRAM_IDS` value in the runtime environment.

## Next Phase Readiness

- ADM-03 and ADM-04 implementation and tests are complete.
- No `STATE.md` or `ROADMAP.md` changes were made.

## Self-Check: PASSED

- `30d14ad` and `5efbbd1` are present in git history.
- All created source and test files exist.
- `npx tsc --noEmit` passed.
- Full unit suite passed: 38 files / 346 tests.
- `STATE.md` and `ROADMAP.md` were not modified.

---
*Phase: 05-admin-deploy*
*Completed: 2026-10-05*
