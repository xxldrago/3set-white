---
phase: 09-payment-funnel-failure-analysis
plan: 03
subsystem: ui
tags: [analytics, rsc, server-components, nextjs, i18n, vitest, source-contract]

requires:
  - phase: 09-payment-funnel-failure-analysis
    provides: "loadFunnel / loadExpired / loadErrorBreakdown / loadTimeToPay / loadTimeToProvision + FunnelData/ExpiredData/ErrorBreakdownData/TimingData (lib/analytics/service.ts, 09-02)"
  - phase: 08-unit-economics-retention
    provides: "AnalyticsSection wrapper, MetricCard/CARD/GRID, ChurnTable table recipe, CardsSkeleton/ChartSkeleton page skeletons, phase-8 contract-test harness"
provides:
  - "components/admin/FunnelCards.tsx + ExpiredCards.tsx + ErrorTable.tsx + TimeToPayCards.tsx + TimeToProvisionCards.tsx — five async server components, zero 'use client', zero dependencies"
  - "app/admin/analytics/page.tsx — three new AnalyticsSection blocks below the retention section with five new Suspense boundaries (13 total)"
  - "lib/i18n/messages/ru.ts — exactly 31 new admin.analytics{Funnel,Error,Timing,Expired,Duration}* keys"
  - "tests/unit/admin-analytics-phase9-contract.test.ts + phase-8 total-Suspense count 8 → 13"
affects:
  - Phase 10 cohorts / Phase 11 segments reuse the per-block async component + source-contract no-leak pattern
  - End-of-phase visual check of /admin/analytics at 360/768/1280 px (funnel collapse, table scroll region, «—» nulls, duration copy)

actuals:
  tokens: 7509     # chars/4 over the realized diff (30037 chars, b337a0f..1b66c5d)
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Funnel step labels via a literal switch over FunnelStep — a Record map leaves the keys unregistered and fails the i18n unused-key scan"
    - "Point-in-time block takes no props: ExpiredCards() ignores ?period and labels itself «сейчас · не зависит от периода»"
    - "Raw provider error codes render verbatim; the null group renders the i18n «unknown» label — translation stays in the component"
    - "One shared formatDuration exported from TimeToPayCards keeps the three duration literals in a single source file"
    - "Contract test pins the OrderStatus enum has no 'expired' member — the 09-CONTEXT state-machine prohibition is machine-checked"

key-files:
  created:
    - components/admin/FunnelCards.tsx
    - components/admin/ExpiredCards.tsx
    - components/admin/ErrorTable.tsx
    - components/admin/TimeToPayCards.tsx
    - components/admin/TimeToProvisionCards.tsx
    - tests/unit/admin-analytics-phase9-contract.test.ts
  modified:
    - app/admin/analytics/page.tsx
    - lib/i18n/messages/ru.ts
    - tests/unit/admin-analytics-phase8-contract.test.ts

key-decisions:
  - "Funnel conversion/drop-off render through Intl with maximumFractionDigits 1 and no '%' suffix — the locked analyticsFunnelConvSub literal has none, and appending one would be copy not in the dictionary"
  - "ErrorTable keys rows by `row.code ?? 'unknown'` so the null group has a stable React key without inventing a fake code in the payload"
  - "TimeToPayCards/TimeToProvisionCards compute their sub once per block (sample size is per-payload, not per-card) instead of duplicating the ternary"
  - "Phase-9 contract test asserts loader wiring by source string (`loadFunnel(period)` etc.) plus the shared `t('common.errorLoad')` presence, so a block cannot silently lose its own degradation skeleton"

patterns-established:
  - "Three-column read-only table = the ChurnTable recipe with min-w-[24rem]; empty state is the bordered bg-panel paragraph, header row never renders"
  - "Windowed block meta always reuses admin.analyticsWindowDays — never a duplicated «{n} дн. · МСК» key"
  - "Suspense-boundary accounting in source contracts now spans three phases: 3 (phase 7) + 5 (phase 8) + 5 (phase 9) = 13"

requirements-completed: [ANL-08, ANL-09, ANL-10, ANL-11]

coverage:
  - id: D1
    description: "«Воронка платежей»: FunnelCards renders four compact MetricCards in GRID (pending→paid→provisioning→provisioned) with conversion + drop-off from the previous step, «—» on null rates and truthful zeros"
    requirement: ANL-08
    verification:
      - kind: unit
        ref: "tests/unit/admin-analytics-phase9-contract.test.ts#keeps the section order funnel → errors → timing"
        status: pass
      - kind: unit
        ref: "tests/unit/analytics-phase9-loaders.test.ts#Test 1: loadFunnel — 4 fixed steps + createdAt cohort window identity"
        status: pass
      - kind: unit
        ref: "tests/unit/i18n.test.ts#dictionary has no unused keys"
        status: pass
    human_judgment: false
  - id: D2
    description: "«Ошибки выдачи»: ErrorTable renders the three-column accessible table over raw errorCode groups, «unknown» for the null group, count + share of total, bordered empty panel at total 0"
    requirement: ANL-09
    verification:
      - kind: unit
        ref: "tests/unit/admin-analytics-phase9-contract.test.ts#adds exactly five new Suspense boundaries (funnel 4, expired 1, error h-64, timing ×2)"
        status: pass
      - kind: unit
        ref: "tests/unit/analytics-phase9-loaders.test.ts#Test 5: loadErrorBreakdown — raw-code grouping, null preserved, count-desc sorting"
        status: pass
    human_judgment: false
  - id: D3
    description: "«Скорость оплаты и выдачи»: TimeToPayCards + TimeToProvisionCards, each two compact cards in the 2-up grid (median / mean), sample size always stated, «—» + empty copy on a zero sample, shared formatDuration"
    requirement: ANL-10
    verification:
      - kind: unit
        ref: "tests/unit/admin-analytics-phase9-contract.test.ts#shares one duration formatter with the provisioning block"
        status: pass
      - kind: unit
        ref: "tests/unit/analytics-phase9-loaders.test.ts#Test 7: loadTimeToPay"
        status: pass
    human_judgment: false
  - id: D4
    description: "ExpiredCards: point-in-time pending-by-age count with no props, {hours} interpolated from the payload and the block meta «сейчас · не зависит от периода»"
    requirement: ANL-11
    verification:
      - kind: unit
        ref: "tests/unit/admin-analytics-phase9-contract.test.ts#gives every block its own loader call and its own error skeleton"
        status: pass
      - kind: unit
        ref: "tests/unit/analytics-phase9-loaders.test.ts#Test 4: loadExpired windowHours mirrors PAYMENT_WINDOW_MS"
        status: pass
    human_judgment: false

duration: 9min
completed: 2026-10-27
status: complete
---

# Phase 09 Plan 03: Payment Funnel & Failure Analysis UI Summary

**Three new read-only sections on /admin/analytics — «Воронка платежей» (funnel + expired), «Ошибки выдачи» (raw-code table), «Скорость оплаты и выдачи» (two 2-up timing blocks) — five async server components, 31 used i18n keys, five new Suspense boundaries, zero client components, zero new dependencies, and a phase-9 contract test that pins order, boundaries, the RSC no-leak surface, the key count and the untouched OrderStatus enum.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-10-27T08:23:00Z (Task 1 verify)
- **Completed:** 2026-10-27T08:26:00Z (full-suite gate)
- **Tasks:** 2/2
- **Files modified:** 9 (5 created, 4 modified)

## Accomplishments

- `FunnelCards({ period })` — four compact `MetricCard`s in `GRID` in the fixed funnel order. Step labels go through a literal `switch` over `FunnelStep` (a `Record` map would leave every label unregistered and fail the i18n unused-key scan). Counts render through `Intl.NumberFormat('ru-RU')`; the first card carries the base sub, cards 2–4 carry `конверсия {conv} · отвал {drop}` with exact payload rationals ×100 and «—» on null — a zero previous step or an empty funnel never prints 0 %.
- `ExpiredCards()` — no props at all (D-06 point-in-time). The «Ждут оплаты более {hours} ч» label interpolates `data.windowHours` from the loader payload, so the 24h rule has one source (`PAYMENT_WINDOW_MS`); the block meta says «сейчас · не зависит от периода» and a zero count renders truthfully.
- `ErrorTable({ period })` — the ChurnTable recipe with three columns (`Код` / `Заказы` / `Доля`): `role="region" tabIndex={0}` + `aria-label`, `overflow-x-auto`, `sr-only` caption, `scope="col"` headers, first column as `<th scope="row">`. Raw stored codes render verbatim; the null group renders the `unknown` label; the share divides by the payload total. `total === 0` swaps the table for the bordered `bg-panel` empty panel — header row never renders.
- `TimeToPayCards({ period })` / `TimeToProvisionCards({ period })` — the 2-up grid (burn precedent, not `GRID`), median + mean per block, `formatDuration` exported from the payment file and imported by the provisioning file so the three duration literals exist once. Subs always state the successful-chain sample size; a zero sample renders «—» plus `нет успешно выданных заказов за период` instead of a fabricated zero.
- Page wiring: the three sections are appended strictly below the retention section — «Воронка платежей» → «Ошибки выдачи» → «Скорость оплаты и выдачи» — with five new Suspense boundaries (`count={4}`, `count={1}`, `ChartSkeleton h-64`, `count={2} twoUp` ×2). Guard, `dynamic = 'force-dynamic'` and the `7|30|90 else 30` normalization are byte-unchanged; nothing above the retention section moved.
- i18n: exactly 31 new keys, all referenced by literal `t('admin.…')` calls; `admin.analyticsWindowDays` and `common.errorLoad` are reused, never duplicated.
- `tests/unit/admin-analytics-phase9-contract.test.ts` — RBAC digests on a fresh id range (910000451-454), section-order/index assertions below `ChurnTable`, boundary counts (`count={4}` / `count={1}` present, `twoUp` ×3, `h-64` ×2, total `<Suspense fallback={` = 13), no `'use client'` in all five components, per-block loader wiring + degradation skeleton, the no-leak scan over page + five components, the 31-key count, and the `OrderStatus`-has-no-`expired` pin.

## Task Commits

Each task was committed atomically:

1. **Task 1: FunnelCards + ExpiredCards + first page section + funnel/expired i18n keys (TRACER)** - `3a7e450` (feat)
2. **Task 2: ErrorTable + TimeToPayCards + TimeToProvisionCards + remaining sections + i18n keys + contract tests** - `1b66c5d` (feat)

**Plan metadata:** docs commit (SUMMARY + STATE + ROADMAP).

## Files Created/Modified

- `components/admin/FunnelCards.tsx` (new) — `loadFunnel(period)`, literal-switch step labels, four compact cards in `GRID`, «—» on null rates, reused window meta.
- `components/admin/ExpiredCards.tsx` (new) — `loadExpired()`, no props, `{hours}` from the payload, point-in-time meta.
- `components/admin/ErrorTable.tsx` (new) — `loadErrorBreakdown(period)`, three-column accessible table, raw codes, empty panel.
- `components/admin/TimeToPayCards.tsx` (new) — `loadTimeToPay(period)`, 2-up grid, exported `formatDuration(ms)`.
- `components/admin/TimeToProvisionCards.tsx` (new) — `loadTimeToProvision(period)`, 2-up grid, imports `formatDuration`.
- `app/admin/analytics/page.tsx` (modified) — five new imports, three `AnalyticsSection` blocks, five Suspense boundaries below the retention section.
- `lib/i18n/messages/ru.ts` (modified) — 31 new `admin.analytics{Funnel,Error,Timing,Expired,Duration}*` keys after `analyticsChurnEmpty`.
- `tests/unit/admin-analytics-phase8-contract.test.ts` (modified) — total `<Suspense fallback={` count 8 → 13 with the phase-9 comment; every other assertion untouched.
- `tests/unit/admin-analytics-phase9-contract.test.ts` (new) — page/component/schema source contract + RBAC digests.

## Decisions Made

- **No `%` suffix inside the funnel sub.** The locked `analyticsFunnelConvSub` literal is `конверсия {conv} · отвал {drop}`; appending a sign in code would ship copy that lives outside the dictionary, so the component formats the numbers only.
- **Row key = `row.code ?? 'unknown'`** in `ErrorTable` — the payload keeps `code: null` (the derivation core's contract) and the component supplies a stable React key without inventing a fake code.
- **One `sub` per timing block**, computed once, because the sample size is a property of the payload rather than of each card.
- **Loader-wiring pins are string-level** (`loadFunnel(period)`, `loadExpired()`, …) plus a `t('common.errorLoad')` presence check per component — a block that loses its try/catch fails the contract test instead of silently rendering a shared error page.

## Deviations from Plan

None - plan executed exactly as written. The one edit outside the five components is the prescribed phase-8 Suspense count (8 → 13), which passes unchanged otherwise.

## Issues Encountered

- `npx eslint app/admin/analytics/page.tsx` reports the **pre-existing** warning `'role' is assigned a value but never used` (the guard destructure existed in Phase 7). Left untouched per the scope-boundary rule; not introduced by this plan. `npx tsc --noEmit` is clean.

## Threat Flags

None beyond the plan's threat model. The five components consume aggregates only (counts, exact-rational rates, `{ code, count }` groups, durations); the no-leak scan over page + all five component sources is green (T-09-03-01). The page-level `requireRole('administrator', 'manager')` guard is unchanged and re-verified by the RBAC digests (T-09-03-02). Every new scan is period-bounded and independently streamed (T-09-03-03); the funnel label switch is exhaustive and literal, so no i18n key is ever built dynamically (T-09-03-04); `prisma/schema.prisma` is untouched and the `OrderStatus`-no-`expired` pin is green (T-09-03-05). Zero installs, zero dependencies added (T-09-03-SC).

## Known Stubs

None.

## Verification Results

```
# Task 1 gate
DATABASE_URL='postgresql://test:test@127.0.0.1:5432/test' npx vitest run \
  tests/unit/i18n.test.ts tests/unit/analytics-phase9-loaders.test.ts
✓ Test Files 2 passed (2) · Tests 14 passed (14)

# Task 2 / wave gate
DATABASE_URL='postgresql://test:test@127.0.0.1:5432/test' npx vitest run \
  tests/unit/i18n.test.ts tests/unit/admin-analytics-page.test.ts \
  tests/unit/admin-analytics-phase8-contract.test.ts tests/unit/admin-analytics-phase9-contract.test.ts
✓ Test Files 4 passed (4) · Tests 36 passed (36)

# Phase gate
npm test
Test Files 1 failed | 69 passed (70) · Tests 1 failed | 619 passed (620)
# only failure = the pinned pre-existing baseline tests/unit/analytics-mrr.test.ts:190 (4000 vs 3600, Phase 7 CR-01)
npx tsc --noEmit → clean
```

## Next Phase Readiness

- `/admin/analytics` is feature-complete for Phase 9: all four ANL requirements have a rendered surface backed by the 09-02 loaders and the 09-01 derivation core.
- Remaining work is the end-of-phase human check (per plan `<verification>`): visual layout of the three sections at 360/768/1280 px — 4-card funnel collapses to one column, error table scrolls horizontally with an accessible region, «—» nulls render, window meta always present, raw error codes verbatim, durations read naturally («45 сек» / «2 мин 5 сек» / «1 ч 30 мин»).
- Phase 10 (cohorts) can reuse the pattern unchanged: per-block async component + its own try/catch + a source-contract test as the RSC boundary pin.

## Self-Check: PASSED

- FOUND: components/admin/FunnelCards.tsx, ExpiredCards.tsx, ErrorTable.tsx, TimeToPayCards.tsx, TimeToProvisionCards.tsx (no `'use client'` in any)
- FOUND: tests/unit/admin-analytics-phase9-contract.test.ts (green), phase-8 contract updated to 13
- FOUND: 3a7e450 (Task 1 feat commit)
- FOUND: 1b66c5d (Task 2 feat commit)
- FOUND: 31 phase-9 keys matching the phase-9 prefix regex; i18n suite green both directions
