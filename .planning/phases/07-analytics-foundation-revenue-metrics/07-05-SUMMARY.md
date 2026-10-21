---
phase: 07-analytics-foundation-revenue-metrics
plan: 05
subsystem: ui
tags: [nextjs-rsc, svg, admin, analytics, i18n, vitest, mrr]

# Dependency graph
requires:
  - phase: 07-02-rollup-foundation
    provides: daily_metrics rows, lib/analytics/series + time (MSK helpers), rollupDays
  - phase: 07-04-derivation-core
    provides: lib/analytics/mrr (totalMrrAt/arrAt/activeKeysAt/ARPU/ARPPU/coverage) + waterfall.ts
provides:
  - lib/analytics/service.ts — loadKpis(period) / loadWaterfall() / loadSparkline(period) per UI-SPEC §5.6 data contract (live-today D-12, MSK windows D-15, ::int serialization guard)
  - /admin/analytics RSC page — force-dynamic, in-page role re-check, ?period= 7|30|90, three independent Suspense blocks
  - components/admin/MetricCard.tsx (extracted, size hero/default/compact), AnalyticsKpi.tsx, MrrWaterfall.tsx, MrrSparkline.tsx, AnalyticsTeaser.tsx — all pure-SVG server components
  - AdminNav analytics entry wired in all five places (AdminSection union, MATRIX.administrator+manager, NAV_SECTIONS, ITEMS, itemLabel)
  - /admin MRR teaser card between StatsPanel and RevenuePanel (D-09)
  - 33 i18n keys in lib/i18n/messages/ru.ts, all used
affects: [08-revenue-margin-phase, gsd-verify-work]

# Actuals (#2632) — same estimateTokens scale (chars/4 over the realized diff)
actuals:
  tokens: 10400
  tasks: 3
  commits: 4

# Tech tracking
tech-stack:
  added: [] # zero new packages — hand-rolled pure SVG per the plan
  patterns:
    - "Server-component page loaders behind a single DB-read module (lib/analytics/service.ts) mirroring lib/revenue.ts"
    - "Per-block independent try/catch + Suspense degradation (heading + common.errorLoad survives)"
    - "In-page requireRole re-check with SessionError→redirect / AdminError→notFound digests"
    - "aria-hidden pure SVG paired with sr-only data tables"

key-files:
  created:
    - lib/analytics/service.ts
    - app/admin/analytics/page.tsx
    - components/admin/MetricCard.tsx
    - components/admin/AnalyticsKpi.tsx
    - components/admin/MrrWaterfall.tsx
    - components/admin/MrrSparkline.tsx
    - components/admin/AnalyticsTeaser.tsx
    - tests/unit/admin-analytics-page.test.ts
  modified:
    - components/admin/RevenuePanel.tsx
    - components/admin/PeriodSelector.tsx
    - components/admin/AdminNav.tsx
    - app/admin/layout.tsx
    - app/admin/page.tsx
    - lib/admin-auth.ts
    - lib/i18n/messages/ru.ts

key-decisions:
  - "Waterfall window label derived from the rendered slot count (1 vs 2–6 keys) — never hardcoded «6 месяцев»"
  - "Sparkline x anchored at the true window start (period−1 days before the last point) so leading data gaps keep their width"
  - "MetricCard extraction is behaviour-preserving; default keeps 24px on /admin, analytics uses only 30/30px hero and 20px compact"

patterns-established:
  - "Money in whole rubles via Intl('ru-RU') + « ₽», tabular-nums; «—» is a render decision on null ratios/zero denominators, never 0"
  - "SPA load loaders ::int-cast with COALESCE — a BigInt never crosses the RSC payload"
  - "i18n keys always as literal t()/tp() arguments (interpolated keys register as unused)"

requirements-completed: [ANL-01, ANL-02, ANL-03]

coverage:
  - id: D1
    description: "Analytics service loaders (loadKpis/loadWaterfall/loadSparkline) with live-today MRR, MSK windows and ::int serialization"
    requirement: ANL-01
    verification:
      - kind: unit
        ref: "tests/unit/admin-route.test.ts + npm test (loaders exercised via page render in admin-analytics-page.test.ts)"
        status: pass
    human_judgment: false
  - id: D2
    description: "/admin/analytics page contract — in-page role gate (signed-out→/login redirect, support/stranger→404), force-dynamic, ?period= 7|30|90, no cost/provider fields in page props or chart components"
    requirement: ANL-01
    verification:
      - kind: unit
        ref: "tests/unit/admin-analytics-page.test.ts (7 tests)"
        status: pass
    human_judgment: false
  - id: D3
    description: "KPI row renders MRR hero (30px, spans 2) + compact ARR/ARPU/ARPPU/coverage per §5.3 with «—» null semantics and coverage sub-sentences"
    requirement: ANL-03
    verification:
      - kind: unit
        ref: "tests/unit/i18n.test.ts (all KPI keys used) + npm test"
        status: pass
      - kind: manual_procedural
        ref: "VALIDATION: open /admin/analytics as administrator"
        status: unknown
    human_judgment: true
    rationale: "Visual/a11y anatomy (hero band, skeleton recipe, empty-state copy rendering) is a held-out visual check per UI-SPEC backstop"
  - id: D4
    description: "MRR waterfall — signed grouped-bar SVG with exact §5.4 geometry, token-only fills, native titles, legend, role=region scroll, sr-only table, derived window label, empty/sparse/error states"
    requirement: ANL-02
    verification:
      - kind: unit
        ref: "tests/unit/i18n.test.ts + tests/unit/admin-analytics-page.test.ts"
        status: pass
      - kind: manual_procedural
        ref: "VALIDATION: waterfall slots/labels on a real install"
        status: unknown
    human_judgment: true
    rationale: "SVG geometry and scroll/overflow behaviour need human visual confirmation"
  - id: D5
    description: "MRR sparkline — 320x64 non-uniform SVG, day-index x-spacing (gaps = longer segments), live today value, <2-point empty state, sr-only table"
    requirement: ANL-01
    verification:
      - kind: unit
        ref: "tests/unit/admin-analytics-page.test.ts"
        status: pass
      - kind: manual_procedural
        ref: "VALIDATION: sparkline window/labels"
        status: unknown
    human_judgment: true
    rationale: "Visual trend rendering is a held-out visual check"
  - id: D6
    description: "Nav entry in five wiring points + /admin MRR teaser between StatsPanel and RevenuePanel; nav item visible to administrator/manager only"
    requirement: ANL-01
    verification:
      - kind: unit
        ref: "tests/unit/admin-analytics-page.test.ts + tests/unit/i18n.test.ts (33-key closed set)"
        status: pass
      - kind: manual_procedural
        ref: "VALIDATION: nav pill active on /admin/analytics; support/partner see nothing"
        status: unknown
    human_judgment: true
    rationale: "Nav placement and teaser insertion need a visual pass"

# Metrics
duration: ~25min (including resumed Task-1/2 partial state)
completed: 2026-10-21
status: complete
---

# Phase 7 Plan 05: Analytics admin surface Summary

**/admin/analytics — MRR hero KPI row, 6-month MRR waterfall, and a live-today MRR sparkline as pure-SVG server components, plus the nav entry and /admin teaser, fully role-gated and i18n-contract-complete**

## Performance

- **Duration:** ~25 min (resumed run; Task 1 was already committed, Task 2 partially built)
- **Started:** 2026-10-21 (resumed mid-plan)
- **Completed:** 2026-10-21
- **Tasks:** 3/3
- **Files modified:** 15

## Accomplishments
- `lib/analytics/service.ts` exposes the §5.6 data contract: point-in-time MRR/ARR/active keys from the 07-04 derivation core with `t = now` (D-12 live-today — never the last nightly row), period-windowed ARPU/ARPPU/coverage over MSK day windows (D-15), all aggregates `::int`-cast with `COALESCE` (Pitfall 8).
- `/admin/analytics` RSC page re-checks `requireRole('administrator','manager')` inside itself (T-07-05-01), normalizes `?period=` to 7|30|90 exactly like `/admin`, and renders three independently degrading Suspense blocks in D-10 order.
- Five new/extracted components: `MetricCard` (hero/default/compact, behaviour-preserving extraction), `AnalyticsKpi` (MRR hero + ARR/ARPU/ARPPU/coverage with «—» null semantics), `MrrWaterfall` (exact §5.4 geometry, token-only fills, native titles, sr-only table, derived window label), `MrrSparkline` (day-index x-spacing, live today point, <2-point empty state), `AnalyticsTeaser` (D-09, own catch — never blanks the overview).
- Nav wired in all five places (AdminSection union, MATRIX.administrator+manager, NAV_SECTIONS after 'overview', AdminNav ITEMS + literal switch case, `admin.navAnalytics`); PeriodSelector gained `role="group"` + focus-visible outlines.
- 33 i18n keys in `lib/i18n/messages/ru.ts`, all used — `tests/unit/i18n.test.ts` green.

## Task Commits

Each task was committed atomically:

1. **Task 1: Analytics service + MetricCard extraction** - `1ce38a2` (feat) — was already committed when this resumed run started; verified present and correct
2. **Task 2: Analytics page — KPI, waterfall, sparkline** - `a43583f` (feat)
3. **Task 3: Analytics nav wiring (5 places) + /admin teaser** - `a5697d8` (feat)

## Files Created/Modified
- `lib/analytics/service.ts` - the page's only DB read surface: loadKpis/loadWaterfall/loadSparkline
- `app/admin/analytics/page.tsx` - RSC page: role gate, ?period= normalization, three Suspense blocks
- `components/admin/MetricCard.tsx` - extracted shared card (CARD/GRID/size variants)
- `components/admin/AnalyticsKpi.tsx` - KPI grid (MRR hero, ARR, ARPU, ARPPU, coverage)
- `components/admin/MrrWaterfall.tsx` - 6-month signed grouped-bar SVG + sr-only table
- `components/admin/MrrSparkline.tsx` - daily MRR sparkline SVG + sr-only table
- `components/admin/AnalyticsTeaser.tsx` - /admin MRR teaser card with own catch
- `components/admin/RevenuePanel.tsx` - imports extracted card, visually unchanged
- `components/admin/PeriodSelector.tsx` - role=group + focus-visible outlines (2 a11y one-liners)
- `components/admin/AdminNav.tsx` - analytics union/ITEMS/label case
- `app/admin/layout.tsx` - 'analytics' in NAV_SECTIONS after 'overview'
- `app/admin/page.tsx` - Suspense-wrapped AnalyticsTeaser insert
- `lib/admin-auth.ts` - AdminSection union + MATRIX.administrator/manager entries
- `lib/i18n/messages/ru.ts` - 33 new analytics keys
- `tests/unit/admin-analytics-page.test.ts` - role-gate digests, force-dynamic, period contract, no-leak scan

## Decisions Made
- Sparkline x is anchored at the whole window start (`period−1` days before the last point) rather than the first plotted day, so leading data gaps keep their true width — matches «x ∝ day index within the window».
- The waterfall empty state detects "no paid subscription ever" as a single all-zero month slot (the loader's minimum 1 slot for a young install).
- Money rendering deliberately goes through `Math.round` only where a ratio is derived; MRR/ARR values are exact and formatted as-is.

## Deviations from Plan

None — plan executed exactly as written (Task 1's grep-only `<verify>` was consumed as the known-accepted warning; real enforcement is Task 2's tests + wave-level `npm test`/`npm run build`, all green).

---

**Total deviations:** 0
**Impact on plan:** None.

## Issues Encountered
- `npm run build` fails without env vars set (zod env schema fail-fast at page-data collection) — passed with the six required vars supplied inline (DATABASE_URL, SESSION_SECRET, BOT_TOKEN, BOT_TEST_TOKEN, WEBHOOK_SECRET, ARTEMIDA_API_KEY, PLATEGA_MERCHANT_ID, PLATEGA_SECRET). Not a code issue.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness
- The full ANL-01/02/03 read surface is done; Phase 8 (margin/runway, goodwill display D-03) can build on `service.ts` and the coverage ledger.
- VALIDATION items remain: manual UAT of the three blocks, nav pill state, and teaser placement for a human.

---
*Phase: 07-analytics-foundation-revenue-metrics*
*Completed: 2026-10-21*

## Self-Check: PASSED

All 8 created files exist on disk; all 3 task commits (1ce38a2, a43583f, a5697d8) found in git log.

