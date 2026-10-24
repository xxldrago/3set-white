---
phase: 08-unit-economics-retention
plan: 03
subsystem: ui
tags: [analytics, rsc, server-components, nextjs, i18n, vitest, source-contract]

requires:
  - phase: 08-unit-economics-retention
    provides: loadLtv/loadMargin/loadBurnRunway/loadRetention/loadChurnTable + trailingMonthLabels + §6.7 payload types (lib/analytics/service.ts)
  - phase: 07-analytics-foundation-revenue-metrics
    provides: MetricCard/CARD/GRID, MrrWaterfall window-label + monthFull shapes, analyticsTableMonth/analyticsWaterfallWindow* keys, admin-analytics-page.test.ts harness
provides:
  - "components/admin/AnalyticsSection.tsx + LtvCards/MarginCards/BurnRunwayCards/RetentionCards/ChurnTable — five async server components, zero 'use client', zero deps"
  - "app/admin/analytics/page.tsx — CardsSkeleton + two sections («Юнит-экономика», «Удержание») below the sparkline with five Suspense boundaries (D-17)"
  - "lib/i18n/messages/ru.ts — exactly 44 new admin.analytics* keys (43 locked + analyticsLtvGrossHistSubActive, the D-01 marker)"
  - "tests/unit/admin-analytics-phase8-contract.test.ts — RBAC digests + source scans (section order, five boundaries, no use client, single balance caller, no-leak, 44-key count)"
affects:
  - Phase 9/10/11 reuse the presentation pattern (per-block async server components + derived window labels) for funnel/cohort/segment surfaces
  - Visual end-of-phase check per 08-VALIDATION (375/768/1280 px layout, «—» nulls, provider outage isolation)

actuals:
  tokens: 8662     # chars/4 over the realized diff (9dd4812 + b7378fd, 34646 chars)
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Block = async server component with own try/catch → t('common.errorLoad') in one CARD; heading survives, meta dropped when data-derived (D-19)"
    - "Window meta on every block (D-20): per-card window for LTV, coverage badge for margin, fixed 30-dn. for burn, {n} dn. for retention, derived slot count for the table"
    - "«—» is a render decision on null; 0 renders truthfully; ratios stay exact rationals, ×100/Intl in the component only"
    - "Source-contract test as the RSC boundary pin: no providerCost/userId in component sources, artemida absent from all five components"

key-files:
  created:
    - components/admin/AnalyticsSection.tsx
    - components/admin/LtvCards.tsx
    - components/admin/MarginCards.tsx
    - components/admin/BurnRunwayCards.tsx
    - components/admin/RetentionCards.tsx
    - components/admin/ChurnTable.tsx
    - tests/unit/admin-analytics-phase8-contract.test.ts
  modified:
    - app/admin/analytics/page.tsx
    - lib/i18n/messages/ru.ts

key-decisions:
  - "Error body = the plan's prescriptive single-CARD t('common.errorLoad') (PATTERNS degradation skeleton verbatim) rather than the UI-SPEC §6.x heading+meta-survive variant — the slower reading of §6.2-§6.6 was superseded by the action text"
  - "BurnRunwayCards comment avoids the words 'artemida'/'providerCost' entirely so the component source itself passes the strongest possible no-leak/no-provider scan"
  - "Balance-location scan uses /artemida\s*\.\s*getBalance/ — the call in service.ts spans two source lines (artemida / .getBalance())"
  - "Dirty legal-bot ru.ts keys (menuPrivacy/menuTerms/legalLink) were committed inside the Task 1 ru.ts commit — same file, nothing lost; lib/bot.ts + lib/env.ts remain untouched working-tree changes"

patterns-established:
  - "Visible accessible table recipe (role=region + sr-only caption + scope=col/row + divide-y) now exists in-repo for the first time — ChurnTable is the reference"
  - "Suspense-boundary counting in source contracts: 3 × CardsSkeleton count=3 + 1 × count=2 twoUp + 1 × ChartSkeleton h-64 = the five new boundaries"
  - "44-key count pins Pitfall 10 both directions (missing AND unused keys fail the i18n suite; the count pins no extras)"

requirements-completed: [ANL-04, ANL-05, ANL-06, ANL-07, ANL-13, ANL-14]

coverage:
  - id: D1
    description: "«Юнит-экономика» section below the sparkline: AnalyticsSection wrapper + LtvCards (three compact cards, per-card windows, D-01 under-amortization marker, no fabricated date)"
    requirement: ANL-04
    verification:
      - kind: unit
        ref: "tests/unit/admin-analytics-phase8-contract.test.ts#keeps the guard, force-dynamic and period normalization unchanged"
        status: pass
      - kind: unit
        ref: "tests/unit/admin-analytics-phase8-contract.test.ts#places the AnalyticsSection blocks strictly below MrrSparkline"
        status: pass
      - kind: unit
        ref: "tests/unit/i18n.test.ts#dictionary has no unused keys"
        status: pass
    human_judgment: false
  - id: D2
    description: "MarginCards (coverage-meta badge + three costed-subset cards, Intl minus for negative margin) and BurnRunwayCards (2-up grid, three-state runway sub, balance from payload only)"
    requirement: ANL-13
    verification:
      - kind: unit
        ref: "tests/unit/admin-analytics-phase8-contract.test.ts#keeps the provider module out of all five new components — the balance is in the payload"
        status: pass
      - kind: unit
        ref: "tests/unit/admin-analytics-phase8-contract.test.ts#resolves the balance inside loadBurnRunway (service.ts), not in any component"
        status: pass
      - kind: unit
        ref: "tests/unit/admin-analytics-phase8-contract.test.ts#adds exactly five new Suspense boundaries"
        status: pass
    human_judgment: false
  - id: D3
    description: "Burn/runway 30-day fixed window with coverage count and runwayReason-driven subs on the §6.7 payload"
    requirement: ANL-14
    verification:
      - kind: unit
        ref: "tests/unit/admin-analytics-phase8-contract.test.ts#resolves the balance inside loadBurnRunway (service.ts), not in any component"
        status: pass
    human_judgment: false
  - id: D4
    description: "RetentionCards (three period cards, absolute counts always in subs, no color semantics) and ChurnTable (six columns, derived window label, empty-state panel, single-empty-month keeps its row)"
    requirement: ANL-06
    verification:
      - kind: unit
        ref: "tests/unit/admin-analytics-phase8-contract.test.ts#adds exactly five new Suspense boundaries"
        status: pass
      - kind: unit
        ref: "tests/unit/admin-analytics-phase8-contract.test.ts#contains no 'use client' directive in any of the five new components"
        status: pass
    human_judgment: false
  - id: D5
    description: "Churn table window derivation matches MrrWaterfall (shared trailingMonthLabels payload, reused Phase 7 window keys)"
    requirement: ANL-07
    verification:
      - kind: unit
        ref: "tests/unit/analytics-phase8-loaders.test.ts#Test 11"
        status: pass
      - kind: unit
        ref: "tests/unit/i18n.test.ts#dictionary has no unused keys"
        status: pass
    human_judgment: false
  - id: D6
    description: "Exactly 44 new admin.analytics* keys (43 locked + analyticsLtvGrossHistSubActive), all referenced by literal t() calls; no cost/balance/user data in component sources"
    requirement: ANL-05
    verification:
      - kind: unit
        ref: "tests/unit/admin-analytics-phase8-contract.test.ts#counts 44 keys matching the phase-8 prefix alternation"
        status: pass
      - kind: unit
        ref: "tests/unit/i18n.test.ts#every t() key used in source exists in the RU dictionary"
        status: pass
    human_judgment: false

duration: 61min
completed: 2026-10-24
status: complete
---

# Phase 08 Plan 03: Analytics Presentation Surface Summary

**Two read-only sections («Юнит-экономика», «Удержание») below the Phase 7 sparkline on /admin/analytics — seven new server components (five blocks + the section wrapper), 44 used i18n keys, five independently-degradable Suspense boundaries, zero client components, zero new dependencies, and a source-contract test pinning order, the balance caller and the RSC no-leak boundary.**

## Performance

- **Duration:** 61 min
- **Started:** 2026-10-24T21:17Z (baseline gate; Task 1 commit 11:32:46Z)
- **Completed:** 2026-10-24T22:13:50Z (Task 2 commit)
- **Tasks:** 2/2
- **Files modified:** 9 (6 components + page + ru.ts + contract test created/modified; 7 new, 2 modified)

## Accomplishments

- `AnalyticsSection` — the one new structural element (§6.1 verbatim: `border-t border-line pt-6`, h2 20/600, `aria-label` named landmark).
- `LtvCards()` — no props (D-04), per-card windows, D-01 under-amortization marker sub (`analyticsLtvGrossHistSubActive` when `activePayers > 0`), never-∞ predictive divisor, net date from the data-derived `coverageFrom` label (DD.MM.YYYY, never fabricated — A4).
- `MarginCards({period})` — coverage badge meta (`покрытие {known} из {total} заказов` / no-orders sentence), costed-subset cards, negative margin via Intl minus in text-foreground (never red).
- `BurnRunwayCards()` — 2-up grid, fixed «30 дн.» meta, three-state runway sub driven by `runwayReason` from the loader payload; the component imports no provider module.
- `RetentionCards({period})` — window meta `{n} дн. · МСК`, absolute counts ALWAYS in subs (D-08), no color semantics.
- `ChurnTable()` — the repo's first visible accessible table: six columns in locked order, `MM.YYYY` month axis matching MrrWaterfall's `monthFull` shape, derived window label from the rendered slot count (reused Phase 7 keys — never hardcoded «6 мес.»), empty-state panel when every month `expiring === 0`, a single empty month inside a populated window keeps its row, «Продление, %» «—» when `expiring === 0` while absolute cells render real zeros.
- Page wiring (D-17): both sections strictly below `<MrrSparkline>`; guard/`force-dynamic`/`7|30|90 else 30` normalization byte-unchanged; `CardsSkeleton({ count, twoUp })` with five new Suspense boundaries.
- i18n: exactly 44 new keys from UI-SPEC §Copywriting — all referenced by literal `t('…')` calls (i18n suite green in both directions).
- Contract test: RBAC digests (fresh adminUser range 910000351-354) + source scans for section order, five boundaries, no `'use client'`, balance confined to `service.ts`, no-leak (`providerCost`/`provider_cost`/`userId` absent), and the 44-key count.

## Task Commits

Each task was committed atomically:

1. **Task 1: AnalyticsSection + LtvCards + first page section + LTV i18n keys (TRACER)** - `9dd4812` (feat)
2. **Task 2: Margin/Burn/Retention/ChurnTable components + full page wiring + remaining i18n keys + contract test** - `b7378fd` (feat)

**Plan metadata:** (final docs commit — this closeout)

## Files Created/Modified

- `components/admin/AnalyticsSection.tsx` — presentational section wrapper (title + children, h2 + border-t).
- `components/admin/LtvCards.tsx` — async server component; loadLtv() + three compact MetricCards in GRID; D-01 marker; DD.MM.YYYY net date.
- `components/admin/MarginCards.tsx` — async server component; loadMargin(period); coverage badge meta + three costed-subset cards.
- `components/admin/BurnRunwayCards.tsx` — async server component; loadBurnRunway(); 2-up grid; three-state runway sub.
- `components/admin/RetentionCards.tsx` — async server component; loadRetention(period); three period cards with absolute-count subs.
- `components/admin/ChurnTable.tsx` — async server component; loadChurnTable(); derived window label; visible accessible 6-column table.
- `app/admin/analytics/page.tsx` — CardsSkeleton ({count, twoUp}); two AnalyticsSection blocks + five Suspense boundaries; nothing above the sparkline changed.
- `lib/i18n/messages/ru.ts` — 44 new admin.analytics* keys with UI-SPEC literals (after the existing analytics* block, ru.ts:396-426 area).
- `tests/unit/admin-analytics-phase8-contract.test.ts` — harness from admin-analytics-page.test.ts + six source-scans + 44-key count.

## Decisions Made

- Error body is the plan's prescribed single-`CARD` `t('common.errorLoad')` (PATTERNS degradation skeleton verbatim) — the plan action text supersedes the UI-SPEC §6.x heading-survives variant.
- `BurnRunwayCards` source deliberately avoids the strings `artemida`/`providerCost`/`userId` even in comments — the component passes the strongest no-leak / no-provider scan.
- Balance location scan tolerates the two-line call in service.ts (`/artemida\s*\.\s*getBalance/`).
- The 44-key count uses the plan's verbatim prefix regex; the D-01 marker presence is asserted with a separate full-line regex.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Contract test over-strict assertions tightened to the plan's actual contract**
- **Found during:** Task 2 (contract test authoring)
- **Issue:** The first-draft test asserted (a) `artemida.getBalance` as a literal string — which never appears because service.ts splits the call across two lines; (b) exactly three `<CardsSkeleton` JSX occurrences — but the §6.1 composition has four (3 × `count={3}` + 1 × `count={2} twoUp`), matching the plan's own "3 × CardsSkeleton + 1 × twoUp + 1 × ChartSkeleton" enumeration; (c) `toContainEqual(expect.stringMatching(...))` — unsupported in vitest 5.
- **Fix:** Used `/artemida\s*\.\s*getBalance/`, split the boundary count into `count={3}` × 3 + `twoUp` × 1 + `ChartSkeleton h-64` × 1 (total `<Suspense fallback={` = 8), and replaced the matcher with a `test()` regex.
- **Files modified:** tests/unit/admin-analytics-phase8-contract.test.ts
- **Verification:** Contract suite 11/11 green.
- **Committed in:** b7378fd (Task 2 commit)

**2. [Rule 2 - Missing Critical] Component comments cleaned so the no-leak/no-provider source scans pass**
- **Found during:** Task 2 (source scans failed on my own comments)
- **Issue:** MarginCards' header comment and BurnRunwayCards' doc comment contained the words `providerCost` and `artemida` — tripping the very scans that pin the RSC boundary.
- **Fix:** Reworded both comments (e.g. "orders without known cost", "one provider getBalance call in the loader") so each component source is free of the scanned strings.
- **Files modified:** components/admin/MarginCards.tsx, components/admin/BurnRunwayCards.tsx
- **Verification:** no-leak + balance scans green.
- **Committed in:** b7378fd (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 × Rule 2 — test fidelity and self-scan cleanliness; no scope creep, no behavior change)
**Impact on plan:** All fixes kept the contract test honest against the plan's actual assertions. No architectural change.

## Issues Encountered

- vitest 5 `String.prototype.match` with `g` returns only the consumed regex pattern — the 44-key count needed the plan's prefix regex (44 matches) plus a separate full-line regex for the D-01 marker check.
- The `analyticsLtvGrossHistSubActive` key spans two lines in ru.ts (long literal) — harmless for the i18n suite (key scan is line-anchored).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The presentation pattern (per-block async server components + derived window labels + source-contract no-leak pin) is established for Phase 9/10/11 surfaces.
- End-of-phase (08-VALIDATION): visual check of the two sections at 360/768/1280 px — «Юнит-экономика» / «Удержание» below the sparkline, ChurnTable horizontal scroll with accessible region, «—» nulls, windows labelled, provider outage isolating to the runway card («баланс недоступен»).
- Held-out backstops per UI-SPEC §UI Considerations: 7-digit LTV / negative net / «100%», 4-digit coverage meta wrap, 7-digit burn + 4-digit runway in the 2-up grid, 4-digit retention subs, 90-day coverage sentence with the heading on its own line.

## Self-Check: PASSED

- FOUND: components/admin/AnalyticsSection.tsx, LtvCards.tsx, MarginCards.tsx, BurnRunwayCards.tsx, RetentionCards.tsx, ChurnTable.tsx (all six present, no 'use client')
- FOUND: tests/unit/admin-analytics-phase8-contract.test.ts (11/11 green)
- FOUND: 9dd4812 (Task 1 feat commit)
- FOUND: b7378fd (Task 2 feat commit)
- FOUND: i18n suite 5/5, page suite 7/7, contract suite 11/11 — wave gate 23/23 green; full suite = 581 pass + the 1 pinned baseline failure only (analytics-mrr.test.ts, untouched)
---
*Phase: 08-unit-economics-retention*
*Completed: 2026-10-24*
