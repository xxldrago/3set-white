---
phase: 09-payment-funnel-failure-analysis
verified: 2026-10-27T13:31:00Z
status: human_needed
score: 4/4 must-haves verified
behavior_unverified: 0
overrides_applied: 0
gaps: []
advisory:
  - id: MD-01
    finding: "paid→provisioned uses Order.updatedAt; an account merge (lib/accounts.ts:164) re-points historical provisioned orders and moves updatedAt, inflating the mean by days"
    verdict: "quality-debt"
    affects_success_criteria: false
    rationale: "The metric is computed, wired and displayed for every successful chain; the standard provisioning path writes updatedAt at markProvisioned. The defect is a measurement-accuracy edge case bounded by account-merge frequency, not a visibility gap. Real defect — schedule a provisionedAt column follow-up."
  - id: MD-02
    finding: "analyticsFunnelConvSub renders «конверсия 80 · отвал 20» with no % unit"
    verdict: "quality-debt"
    affects_success_criteria: false
    rationale: "Conversion and drop-off are present on steps 2-4; the number and its label render. Missing unit is a legibility/copy defect (medium), not a missing metric. Confirm with the human checklist whether it reads acceptably."
  - id: MD-03
    finding: "Funnel uses the shared 3-up GRID, so the 4th card (provisioned) wraps to a second desktop row; the count=4 skeleton does the same"
    verdict: "quality-debt"
    affects_success_criteria: false
    rationale: "All four funnel steps render. D-02's locked '4 cards in a row' shape is not met, which is a design-conformance/layout defect, not a metric-visibility gap. Visual item in the human checklist."
  - id: MD-04
    finding: "Null-code group and the literal provider code 'unknown' (lib/worker.ts:282) both render as «unknown», and React keys collide (row.code ?? 'unknown')"
    verdict: "quality-debt"
    affects_success_criteria: false
    rationale: "errorBreakdown groups by errorCode and the table shows count + share for each group, so ANL-09 is satisfied. Two identically-labelled rows (and a duplicate-key warning) degrade readability for one specific code value; no count or share is lost."
  - id: LO-02
    finding: "expiredCount (pure) is production-dead; loadExpired re-implements the strict-< rule in Prisma"
    verdict: "quality-debt"
    affects_success_criteria: false
    rationale: "Single-source constant PAYMENT_WINDOW_MS is imported by the loader, so the 24h threshold does not drift; the two implementations of the boundary agree (test cross-check). Code duplication, not a behavior gap."
  - id: LO-07
    finding: "The loaders suite's hand-computed pins sit behind windowIsExactly() and would skip on a dirty database"
    verdict: "quality-debt"
    affects_success_criteria: false
    rationale: "Verified live in this run: the local orders table was empty (selected count = 0), so every exact pin (5/4/3/2, 4/5, 3/4, 2/3, 60_000/110_000) executed. Test-fragility risk for future dirty environments, not a current verification gap."
human_verification:
  - test: "Open /admin/analytics as administrator at 360, 768 and 1280 px and scroll below the retention section"
    expected: "«Воронка платежей» (4 funnel cards + expired card), «Ошибки выдачи» (code table or bordered empty panel) and «Скорость оплаты и выдачи» (2 + 2 timing cards) all render below the retention section; the funnel collapses to one column on mobile and the error table scrolls horizontally inside a focusable region; a zero/empty sample shows «—», never «0 %»"
    why_human: "Actual browser layout, responsive collapse, horizontal scroll and the focusable scroll region cannot be proven by source scans; the phase's own verification section declares this an end-of-phase visual check."
  - test: "Read the funnel card sub-lines on a window with a known sample (e.g. ?period=30)"
    expected: "Cards 2-4 read «конверсия … · отвал …» and the numbers are recognisable as percentages; decide whether the missing % unit (MD-02) is acceptable copy for an operator or must be added to the dictionary literal"
    why_human: "Whether «конверсия 80 · отвал 20» is legible as a percentage is a copy/UX judgment; the payload is an exact rational and the ×100 happens in the component, so no automated check can say the unit is implied."
  - test: "At 1280 px, inspect the four funnel cards as a group"
    expected: "Confirm whether the 3 + 1 wrap of the fourth card («Ключ выдан») is acceptable, or whether the funnel needs its own 4-up grid (MD-03)"
    why_human: "Visual composition at the lg breakpoint is a design judgment; the source uses the shared 3-up GRID by construction (verified), so only a human can accept or reject the resulting layout."
---

# Phase 9: Payment Funnel & Failure Analysis — Verification Report

**Phase Goal:** Админ видит, где и почему отваливаются платежи и сколько времени занимает путь от создания заказа до выдачи ключа
**Verified:** 2026-10-27T13:31:00Z
**Status:** human_needed (all four must-haves verified; three visual/legibility checks remain)
**Re-verification:** No — initial verification (no prior `09-VERIFICATION.md` existed)

**Mode note:** ROADMAP marks Phase 9 `Mode: mvp`, but its goal is not in canonical User Story form
(`As a …, I want …, so that …`). Per the Phase 7/8 precedent (Phase 8 is also `mvp` with a non-story goal and
was verified goal-backward against its success criteria), this report verifies the four ROADMAP success
criteria directly instead of applying MVP user-flow coverage. This is a roadmap-shape observation, not a phase gap.

## Goal Achievement

### Observable Truths

| # | Truth (ROADMAP success criterion) | Status | Evidence |
| - | --------------------------------- | ------ | -------- |
| 1 | Админ видит воронку `pending → paid → provisioning → provisioned` с конверсией и отвалом на каждом шаге | ✓ VERIFIED | `lib/analytics/funnel.ts:111-134` (`funnelOf`, fixed `FUNNEL_STEPS`, reach-based monotone counts, exact-rational `conversion`/`dropOff`, null on zero prev); `lib/analytics/service.ts:584-593` (`loadFunnel`, createdAt cohort window); `components/admin/FunnelCards.tsx:56-77` renders 4 `MetricCard`s with `конверсия … · отвал …` on steps 2-4 and the base sub on step 1; section wired in `app/admin/analytics/page.tsx:129-136`; pinned by 16 pure tests + loader Tests 1-2. Caveat MD-02 (no `%` unit) is legibility debt — see Advisory. |
| 2 | Админ видит разбивку `failed`/`canceled` по `errorCode` с количеством и долей | ✓ VERIFIED | `funnel.ts:165-181` (`errorBreakdown`: failed/canceled only, raw code grouping, null preserved, count-desc/code-asc); `service.ts:632-636` (`total = Σ count`); `components/admin/ErrorTable.tsx:49-87` renders 3 columns (Код / Заказы / Доля) with `count / total × 100`, raw codes verbatim, null → «unknown», bordered empty panel at `total === 0`; loader Tests 5-6. Caveat MD-04 (literal `'unknown'` collides with the null label) is readability debt — see Advisory. |
| 3 | Админ видит медианное и среднее время `createdAt → paidAt` и `paidAt → provisioned` | ✓ VERIFIED | `funnel.ts:187-199` (`medianMs` exact even-n mean, `meanMs`), `funnel.ts:224-241` (`timingStats`, successful chains only); `service.ts:643-685` (`loadProvisionedRows` SQL filter + `loadTimeToPay` / `loadTimeToProvision`); `TimeToPayCards.tsx:55-73` and `TimeToProvisionCards.tsx:42-60` render Медиана/Среднее with `formatDuration` and «—» on an empty sample, sample size always stated; loader Tests 7-9. Caveat MD-01 (updatedAt proxy) is a bounded accuracy defect — see Advisory. |
| 4 | Админ видит «expired» как `pending` старше платёжного окна — отдельной метрикой, без изменения статусов заказов | ✓ VERIFIED | `funnel.ts:55` (`PAYMENT_WINDOW_MS = 86_400_000`, hardcoded) and `:141-148` (strict `<`, point-in-time); `service.ts:604-611` (`loadExpired` — no period param, `status: 'pending'`, `createdAt < now − windowMs`, `windowHours` derived from the constant, read-only); `ExpiredCards.tsx:14-45` (no props, `{hours}` from payload, «сейчас · не зависит от периода»); `prisma/schema.prisma:151-159` `OrderStatus` has no `expired` member (pinned by `tests/unit/admin-analytics-phase9-contract.test.ts:225-228`); loader Tests 3-4. No order write exists anywhere in the phase's code. |

**Score:** 4/4 truths verified (0 behavior-unverified, 0 overrides)

All four truths are read-path dashboard claims whose supporting code is present, wired end-to-end
(DB → loader → payload → server component → page), and covered by executing tests. None asserts a
state transition or a cancellation/cleanup invariant, so no truth is behavior-dependent in the
Step-3 sense; `behavior_unverified` is 0.

### Deferred Items

None — no gap was deferred to a later milestone phase. (Phase 10 is cohorts/retention analytics and
does not cover any Phase 9 item.)

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `lib/analytics/funnel.ts` | Pure derivation core | ✓ VERIFIED | 241 lines; zero imports (no prisma/next/react/env); exports `PAYMENT_WINDOW_MS`, `FunnelRow`, `FUNNEL_STEPS`, step predicates, `funnelOf`, `expiredCount`, `errorBreakdown`, `medianMs`, `meanMs`, `timingStats`; module header declares the two documented approximations. |
| `lib/analytics/service.ts` (Phase 9 block) | Five loaders + payload types + two scans | ✓ VERIFIED | `:543-685`: `FunnelData`/`ExpiredData`/`ErrorBreakdownData`/`TimingData`, `FUNNEL_ORDER_SELECT`, `loadFunnelOrderRows`, `loadFunnel`, `loadExpired`, `loadErrorBreakdown`, `loadProvisionedRows`, `loadTimeToPay`, `loadTimeToProvision`. `PAYMENT_WINDOW_MS` imported from `./funnel` (no re-declaration). Phase 7/8 block untouched. |
| `components/admin/FunnelCards.tsx` | 4 funnel cards + conversion/drop-off | ✓ VERIFIED | Async RSC, no `'use client'`, own try/catch, literal-switch labels, exact-rational ×100, «—» on null. |
| `components/admin/ExpiredCards.tsx` | Point-in-time expired card | ✓ VERIFIED | No props, `loadExpired()`, `{hours}` from payload, truthful zero. |
| `components/admin/ErrorTable.tsx` | 3-column code table + empty panel | ✓ VERIFIED | `role="region" tabIndex={0}`, `overflow-x-auto`, sr-only caption, `scope` attributes, raw codes, share column. |
| `components/admin/TimeToPayCards.tsx` | Median/mean createdAt→paidAt + `formatDuration` | ✓ VERIFIED | 2-up grid, «—» on null, sample-size sub, exported formatter. |
| `components/admin/TimeToProvisionCards.tsx` | Median/mean paidAt→provisioned | ✓ VERIFIED | Imports `formatDuration`; same contract. |
| `app/admin/analytics/page.tsx` | 3 sections + 5 boundaries below retention | ✓ VERIFIED | `:129-151` — funnel → errors → timing, in that order, after `ChurnTable`; `requireRole('administrator','manager')`, `force-dynamic`, `7` / `90` else `30` normalization unchanged. |
| `lib/i18n/messages/ru.ts` | Exactly 31 phase-9 keys | ✓ VERIFIED | `grep` count = 31 at 4-space indent; every key referenced by a literal `t('admin.…')`; `analyticsWindowDays` + `common.errorLoad` reused. |
| `tests/unit/analytics-funnel.test.ts` | Pure suite | ✓ VERIFIED | 16 tests, no DB. |
| `tests/unit/analytics-phase9-loaders.test.ts` | DB identity suite | ✓ VERIFIED | 9 tests; hand-computed pins executed in this run (DB `orders` count = 0, so `windowIsExactly` was true). |
| `tests/unit/admin-analytics-phase9-contract.test.ts` | Page/component/schema contract | ✓ VERIFIED | 13 tests: RBAC digests (admin/manager ok, support/stranger 404, no session → /login), section order below `ChurnTable`, boundary counts (13 total), no `'use client'`, no-leak scan, 31-key count, `OrderStatus`-no-`expired`. |
| `tests/unit/admin-analytics-phase8-contract.test.ts` | Suspense count 8 → 13 | ✓ VERIFIED | Passes in the full suite. |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `FunnelCards` | `loadFunnel` | direct async call in the RSC body | WIRED | `FunnelCards.tsx:38`; try/catch before render. |
| `ExpiredCards` | `loadExpired` | direct async call, no args | WIRED | `ExpiredCards.tsx:17`. |
| `ErrorTable` | `loadErrorBreakdown` | direct async call | WIRED | `ErrorTable.tsx:20`. |
| `TimeToPayCards` | `loadTimeToPay` | direct async call | WIRED | `TimeToPayCards.tsx:32`. |
| `TimeToProvisionCards` | `loadTimeToProvision` | direct async call | WIRED | `TimeToProvisionCards.tsx:19`. |
| `loadFunnel`/`loadErrorBreakdown` | `funnelOf`/`errorBreakdown` | pure-module import | WIRED | `service.ts` imports from `./funnel`; no stage/stat re-derivation in the loader. |
| `loadTimeToPay`/`loadTimeToProvision` | `timingStats` | shared `loadProvisionedRows` scan | WIRED | Both call the same SQL filter; intervals differ only at payload mapping. |
| `loadExpired` | `PAYMENT_WINDOW_MS` | import from `./funnel` | WIRED | Single source of the 24h threshold; `windowHours` computed from it. |
| page | all five components | `<Suspense>` boundaries | WIRED | 5 new boundaries; total 13; each block independently degradable. |
| `OrderStatus` enum | no `expired` member | contract test source pin | WIRED | `prisma/schema.prisma:151-159` + `admin-analytics-phase9-contract.test.ts:225-228`. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| `FunnelCards` | `data.steps` | `prisma.order.findMany` over the createdAt window → `funnelOf` | Yes — reach-based counts from persisted rows; no literal fallback | ✓ FLOWING |
| `ExpiredCards` | `data.count` | `prisma.order.count` (pending, createdAt `<` instant) | Yes — live count, `windowHours` from constant | ✓ FLOWING |
| `ErrorTable` | `data.rows` / `data.total` | same order scan → `errorBreakdown` | Yes — grouped persisted `errorCode` values; total = Σ counts | ✓ FLOWING |
| `TimeToPayCards` | `data.medianMs/meanMs` | `loadProvisionedRows` → `timingStats.createdToPaid` | Yes — persisted `createdAt`/`paidAt` deltas; null only on empty sample | ✓ FLOWING |
| `TimeToProvisionCards` | `data.medianMs/meanMs` | `loadProvisionedRows` → `timingStats.paidToProvisioned` | Yes — persisted `paidAt`/`updatedAt` deltas (updatedAt proxy, see MD-01) | ✓ FLOWING |

No hardcoded empty props, static returns, or mock data exist on any of the five paths.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Pure derivation suite (funnel/expired/errors/timing) | `npx vitest run tests/unit/analytics-funnel.test.ts` (bundled run below) | 16/16 pass | ✓ PASS |
| Five loaders against real Postgres | `npx vitest run tests/unit/analytics-phase9-loaders.test.ts` | 9/9 pass, incl. exact pins 5/4/3/2, 4/5·3/4·2/3, 60 000/110 000 ms | ✓ PASS |
| Page contract (RBAC, order, boundaries, no-leak, 31 keys, enum) | `npx vitest run tests/unit/admin-analytics-phase9-contract.test.ts` | 13/13 pass | ✓ PASS |
| i18n completeness | `npx vitest run tests/unit/i18n.test.ts` | 5/5 pass | ✓ PASS |
| Combined targeted run | `npx vitest run …funnel …phase9-contract …phase9-loaders …i18n` | `Test Files 4 passed (4) · Tests 43 passed (43)` | ✓ PASS |
| Typecheck | `npx tsc --noEmit` | exit 0, no output | ✓ PASS |
| Full suite (no new failures vs. pinned baseline) | `DATABASE_URL=… npm test` | Test Files 1 failed · 69 passed (70); Tests 1 failed · 619 passed (620) — the only failure is the pre-existing `tests/unit/analytics-mrr.test.ts:190` (4000 vs 3600, Phase 7 baseline, verified on `9bb8414`) | ✓ PASS (baseline only) |
| Exact-pin precondition | `psql … -tAc 'select count(*) from orders;'` | `0` — the loaders suite's `windowIsExactly()` guards were therefore satisfied during the run | ✓ PASS |

### Probe Execution

Not applicable — no migration/CLI phase, no `scripts/*/tests/probe-*.sh` files, and no probe paths are
declared in the plans or summaries.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| ANL-08 | 09-01, 09-02, 09-03 | Админ видит воронку `pending → paid → provisioning → provisioned` с конверсией и отвалом на каждом шаге | ✓ SATISFIED | `funnel.ts:69-134`; `service.ts:584-593`; `FunnelCards.tsx`; loader Tests 1-2; funnel suite (reach predicates, count/conversion, zero-prev, empty, ordering); contract test section order. |
| ANL-09 | 09-01, 09-02, 09-03 | Админ видит разбивку `failed`/`canceled` по `errorCode` с количеством и долей | ✓ SATISFIED | `funnel.ts:165-181`; `service.ts:632-636`; `ErrorTable.tsx`; loader Tests 5-6; funnel suite grouping/tie-break/status-filter/empty. |
| ANL-10 | 09-01, 09-02, 09-03 | Админ видит медианное и среднее время `createdAt → paidAt` и `paidAt → provisioned` | ✓ SATISFIED | `funnel.ts:187-241`; `service.ts:643-685`; `TimeToPayCards.tsx`; `TimeToProvisionCards.tsx`; loader Tests 7-9; timing suite. |
| ANL-11 | 09-01, 09-02, 09-03 | «Expired» считается как `pending` старше платёжного окна (без нового статуса в стейт-машине) | ✓ SATISFIED | `funnel.ts:55,141-148`; `service.ts:604-611`; `ExpiredCards.tsx`; loader Tests 3-4; boundary/constant tests; enum pin. |

All four IDs appear in all three plans' `requirements:` frontmatter and are marked Complete in
`.planning/REQUIREMENTS.md:115-118`. No other requirement maps to Phase 9, so there are **no orphaned
requirements** for this phase.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| — | — | `TBD`/`FIXME`/`XXX` in any phase-9 file | — | None found (`grep` over all 9 modified/created files, exit 1). |
| — | — | `'use client'` in the five components | — | None (contract test asserts it). |
| — | — | `return null` / hardcoded empty data / `console.log` handlers in phase-9 components | — | None; every block returns a real card, an empty panel, or the shared load-error card. |
| `components/admin/ErrorTable.tsx` | 75 | `key={row.code ?? 'unknown'}` collides with a real `'unknown'` code | ⚠️ Warning (from REVIEW MD-04) | Duplicate React key and two identically-labelled rows; counts/shares still correct. Not goal-blocking. |
| `lib/i18n/messages/ru.ts` | 480 | `analyticsFunnelConvSub` omits the `%` unit | ⚠️ Warning (from REVIEW MD-02) | Percentage reads as a bare number; the metric is present. Not goal-blocking. |
| `components/admin/FunnelCards.tsx` | 59 | Shared 3-up `GRID` for a 4-card funnel | ⚠️ Warning (from REVIEW MD-03) | Fourth card wraps on desktop; all four steps still visible. Not goal-blocking. |
| `lib/analytics/funnel.ts` | 229 | `paidToProvisioned = updatedAt − paidAt` | ⚠️ Warning (from REVIEW MD-01) | Accuracy defect on account-merge paths; metric present and correct on the normal path. Not goal-blocking. |

No blocker-level anti-pattern exists. Pre-existing eslint noise (`components/admin/StatsPanel.tsx`, unused
`computeCoverage` import, unused `role` binding) and the `analytics-mrr.test.ts:190` failure are out of
scope per the task's baseline and were not re-reported as phase gaps.

### Review Findings Assessment (09-REVIEW.md)

The REVIEW reports 0 critical, 0 high, 4 medium. Each medium finding was re-checked against the code and
judged against the *stated success criteria* (visibility of the metric), not against implementation taste:

| Finding | Real in code? | Blocks a success criterion? | Judgment |
| ------- | ------------- | --------------------------- | -------- |
| **MD-01** `paid→provisioned` via `updatedAt` | Yes — `funnel.ts:229`; `Order.updatedAt` is `@updatedAt` (`schema.prisma:187`); `lib/accounts.ts:164` re-points every order of the loser account inside the merge transaction, moving `updatedAt` on long-provisioned rows. | No. Criterion 3 asks that the admin *sees* median and mean for the interval. Both render, both are wired, both are correct on the standard write path (the `status='provisioned'` filter excludes chargeback touches, as documented). | **Quality debt below the goal bar.** A real accuracy defect worth a follow-up (`provisionedAt` column, or a declared clamp/precondition). Recommend scheduling it before the metric is used for decisions; do not fail Phase 9 for it. |
| **MD-02** no `%` in funnel conversion sub | Yes — `ru.ts:480` literal, `FunnelCards.tsx:69-72` multiplies but adds no unit. | No. Conversion and drop-off are present on steps 2-4; only the unit is missing. | **Quality debt / copy.** Escalated to the human checklist because legibility is a judgment call, not a completeness one. |
| **MD-03** 4 funnel cards wrap 3 + 1 | Yes — `MetricCard.tsx:8` `GRID` is `lg:grid-cols-3`; `FunnelCards.tsx:59` uses it; page skeleton `count={4}` repeats it. | No. All four steps render; D-02's locked 4-in-a-row shape is a design-conformance issue. | **Quality debt / layout.** Visual item in the human checklist. |
| **MD-04** `'unknown'` collision | Yes — `lib/worker.ts:282` writes the literal code `"unknown"`; `ErrorTable.tsx:75` uses the same string as its null key/label (`ru.ts:490`). | No. `errorBreakdown` groups by raw `errorCode` and the table shows count + share per group, so ANL-09 holds; the defect is that two groups can look identical. | **Quality debt / readability.** Worth fixing (distinct key + «не указан» label), not a goal miss. |

Low findings were reviewed but not re-litigated: LO-01 (createdAt cohort labeling), LO-02 (duplicate
expired rule), LO-03 (duplicate scan per render), LO-04 (duplicated type), LO-05 (enum names in copy),
LO-06 (stranded pending rows inflate expired — a definitional caveat of the locked D-01), LO-07 (conditional
test pins — proven to run here because the orders table was empty), LO-08 (indentation-pinned key count).
None changes whether the four criteria are true; all are maintainability or definitional notes.

### Human Verification Required

#### 1. Visual layout of the three new sections

**Test:** Open `/admin/analytics` as an administrator at 360, 768 and 1280 px and scroll below the retention section.
**Expected:** «Воронка платежей» (4 funnel cards + expired), «Ошибки выдачи» (table or bordered empty panel) and «Скорость оплаты и выдачи» (2 + 2 timing cards) render in that order; funnel collapses to one column on mobile; the error table scrolls horizontally inside a focusable region; empty samples show «—», never «0 %».
**Why human:** Browser layout, responsive collapse, horizontal scroll and focus behavior are not provable by source scans; the plan declares this an end-of-phase visual check.

#### 2. Legibility of the funnel conversion copy (MD-02)

**Test:** Read the funnel card sub-lines on a window with a known sample (`?period=30`).
**Expected:** Decide whether «конверсия 80 · отвал 20» is acceptable for an operator or whether the `%` unit must be added to `analyticsFunnelConvSub`.
**Why human:** Whether the value is recognised as a percentage is a copy/UX judgment; the payload is an exact rational and the ×100 is in the component.

#### 3. Funnel grid composition at desktop width (MD-03)

**Test:** At 1280 px, inspect the four funnel cards as a group.
**Expected:** Accept or reject the 3 + 1 wrap of the fourth card («Ключ выдан»); if rejected, the funnel needs its own 4-up grid (and a matching skeleton).
**Why human:** Visual composition is a design judgment; the 3-up `GRID` is verified in source by construction.

### Gaps Summary

**No gaps.** All four ROADMAP success criteria are satisfied in the codebase and each has executing test
evidence: the funnel derivation and its UI, the raw-code error breakdown with count and share, both timing
intervals (median and mean, successful chains only), and the point-in-time expired metric with the
`OrderStatus` enum provably untouched. The full suite has exactly the one known pre-existing Phase 7
failure and no new failures; `tsc --noEmit` is clean.

The four medium REVIEW findings are **quality debt below the "goal achieved" bar**: they degrade accuracy
on a rare write path (MD-01), copy legibility (MD-02), desktop layout (MD-03), or row labelling (MD-04) —
none removes a metric from the admin's view. They are recorded as advisories rather than gaps so the phase
can close; MD-01 in particular deserves a follow-up (persist a real `provisionedAt`) before these numbers
are trusted for decisions.

The phase is `human_needed` only because the remaining checks are inherently visual/legibility judgments.
No automated check failed and no must-have is missing.

---

_Verified: 2026-10-27T13:31:00Z_
_Verifier: the agent (gsd-verifier)_
