---
phase: 10-cohorts-retention-analytics
verified: 2026-10-29T17:30:00Z
status: passed
score: 8/8 must-haves verified
behavior_unverified: 0
overrides_applied: 0
re_verification: false
---

# Phase 10: Cohorts & Retention Analytics Verification Report

**Phase Goal:** Админ видит когорты по месяцу регистрации и месяцу первой оплаты с удержанием выручки в разрезах канала привлечения и числа устройств
**Verified:** 2026-10-29T17:30:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Админ видит когортную матрицу (месяц регистрации × месяц N) — долю аккаунтов с активной платной подпиской (COH-01 / SC1) | ✓ VERIFIED | `components/admin/CohortMatrix.tsx` kind="registration" renders 14 cols (month·size·M0..M11); `buildRegistrationCohorts` counts retained users with paid non-trial term spanning target month; `loadRegistrationCohorts` feeds it. UAT #2/#3 pass. |
| 2 | Админ видит revenue retention по когортам (выручка месяца N относительно первого платного месяца) (COH-02 / SC2) | ✓ VERIFIED | `buildPayerCohorts` computes baseRevenue (M0 cash) and revenue[offset] (cash in target month); cell renders `X% (money ₽)`; M0 = 100%. UAT #5 pass. |
| 3 | Админ видит когорты в разрезе канала привлечения: реферал / промокод / органика (COH-03 / SC3) | ✓ VERIFIED | `channelOf` (referral > promo > organic) + `CohortTabs` param=regCh/payCh whitelisted in page.tsx; matrix filters. UAT #4 pass. |
| 4 | Админ видит когорты в разрезе тарифа по числу устройств (COH-04 / SC4) | ✓ VERIFIED | `deviceBucketOf` (1/2/3/4/5+) fixed to first paid order; `CohortTabs` param=payDev; payer matrix only (D-12). UAT #6 pass. |
| 5 | Админ видит revenue-когорты по месяцу первой оплаты (payer cohorts) (COH-05 / SC5) | ✓ VERIFIED | `buildPayerCohorts` groups by first-paid MSK month (min paidAt); `loadPayerCohorts` loads all users (no createdAt filter). UAT #5 pass. |
| 6 | Pure derivation core `lib/analytics/cohorts.ts` is pure (no prisma/next/react/env), exports all symbols, 21 unit tests pass | ✓ VERIFIED | Import line: `import { addMonths, mskDayLabel, mskMonthLabel } from "./time";` only. `grep` clean for prisma/next/react/env. `npx vitest run tests/unit/analytics-cohorts.test.ts` → 21/21. tsc clean. |
| 7 | DB loaders `loadRegistrationCohorts`/`loadPayerCohorts` exist, trial-excluded, filters whitelisted, 12 identity tests pass | ✓ VERIFIED | Both exported from `lib/analytics/service.ts` (lines 694, 751). Trial keys excluded via KeyCache.isTrial filter. Channel/device whitelisted TS unions. `npx vitest run tests/unit/analytics-phase10-loaders.test.ts` → 12/12 (test DB). |
| 8 | UI layer: two new sections, 15 Suspense, 14 i18n keys, contract tests pass, no RSC leak | ✓ VERIFIED | `app/admin/analytics/page.tsx` appends reg + payer sections after timing; 15 `<Suspense>`; 4 `ChartSkeleton h-64`; contract test 6 assertions green; i18n 14 keys; no providerCost/userId in CohortMatrix/CohortTabs. |

**Score:** 8/8 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `lib/analytics/cohorts.ts` | Pure derivation core | ✓ VERIFIED | 307 lines; exports COHORT_MONTHS, channelOf, deviceBucketOf, trailingCohortMonths, buildRegistrationCohorts, buildPayerCohorts + types. |
| `tests/unit/analytics-cohorts.test.ts` | 21 pure unit tests | ✓ VERIFIED | 21/21 pass, no DB. |
| `lib/analytics/service.ts` | Two new loaders | ✓ VERIFIED | loadRegistrationCohorts, loadPayerCohorts appended; tsc clean. |
| `tests/unit/analytics-phase10-loaders.test.ts` | 12 DB identity tests | ✓ VERIFIED | 12/12 pass against test Postgres. |
| `components/admin/CohortTabs.tsx` | Client segmented control | ✓ VERIFIED | 'use client'; PeriodSelector recipe; role="group", aria-pressed, h-11, router.replace+refresh. |
| `components/admin/CohortMatrix.tsx` | Async server matrix | ✓ VERIFIED | 14 cols, scroll region, gradient tint, empty/error states, no leak strings. |
| `app/admin/analytics/page.tsx` | Two new sections + searchParams | ✓ VERIFIED | regCh/payCh/payDev whitelisted; 15 Suspense. |
| `lib/i18n/messages/ru.ts` | 14 new keys | ✓ VERIFIED | 14 keys present with specified Russian copy. |
| `tests/unit/admin-analytics-phase10-contract.test.ts` | Contract test | ✓ VERIFIED | 6 assertions pass. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `CohortMatrix` | `service.ts` loaders | direct call in async component | WIRED | `loadRegistrationCohorts`/`loadPayerCohorts` imported and invoked. |
| `service.ts` | `cohorts.ts` | `buildRegistrationCohorts`/`buildPayerCohorts` | WIRED | Imported and called with whitelisted filters. |
| `page.tsx` | `CohortMatrix` + `CohortTabs` | JSX composition | WIRED | Both imported and rendered in two new AnalyticsSection blocks. |
| `service.ts` | `series.ts` | `cashOf` | WIRED | Used for payer revenue base. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| `CohortMatrix` (registration) | `cohorts[].retained` | `prisma.user` + `prisma.order` (paid spans) | Yes — real DB scans, trial-filtered | ✓ FLOWING |
| `CohortMatrix` (payer) | `cohorts[].revenue` | `prisma.user` + `prisma.order` (cash) | Yes — real DB scans | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Pure cohort suite | `npx vitest run tests/unit/analytics-cohorts.test.ts` | 21/21 passed | ✓ PASS |
| DB identity suite | `DATABASE_URL=...test npx vitest run tests/unit/analytics-phase10-loaders.test.ts` | 12/12 passed | ✓ PASS |
| Contract + i18n | `DATABASE_URL=...test npx vitest run tests/unit/admin-analytics-phase10-contract.test.ts tests/unit/i18n.test.ts` | 13/13 passed | ✓ PASS |
| Type check | `npx tsc --noEmit` | no errors | ✓ PASS |

### Probe Execution

No probes declared for this phase (not a migration/CLI phase).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| COH-01 | 10-01/02/03 | Registration cohort matrix | ✓ SATISFIED | Truth 1 + artifacts |
| COH-02 | 10-01/02/03 | Revenue retention by cohorts | ✓ SATISFIED | Truth 2 |
| COH-03 | 10-01/02/03 | Cohorts by acquisition channel | ✓ SATISFIED | Truth 3 |
| COH-04 | 10-01/02/03 | Cohorts by device count | ✓ SATISFIED | Truth 4 |
| COH-05 | 10-01/02/03 | Payer revenue cohorts | ✓ SATISFIED | Truth 5 |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `tests/unit/analytics-mrr.test.ts` | 190 | Failing assertion (expected 3600, got 4000) | ℹ️ Info | Pre-existing: introduced by phase-7 commit 005c0b1 (freeze remaining days at upgrade instant). Unrelated to Phase 10; mrr.ts not touched by phase 10. Phase-10 tests all green. |

No stubs, no TODO/FIXME/TBD markers, no empty implementations found in phase-10 files. No providerCost/userId leak in CohortMatrix or CohortTabs (contract test scans).

### Human Verification Required

None remaining. UAT session (`.planning/phases/10-cohorts-retention-analytics/10-UAT.md`) completed 2026-10-29 with 10/10 tests passed, including visual layout on 375px viewport, gradient readability, period-selector independence, and RSC payload leak scan.

### Gaps Summary

No gaps. All 8 must-haves verified, all 5 COH requirements satisfied, automated suites green (21 + 12 + 13 tests), tsc clean. The single failing test in the broader suite (`analytics-mrr.test.ts`) is pre-existing and unrelated to Phase 10.

---

_Verified: 2026-10-29T17:30:00Z_
_Verifier: the agent (gsd-verifier)_