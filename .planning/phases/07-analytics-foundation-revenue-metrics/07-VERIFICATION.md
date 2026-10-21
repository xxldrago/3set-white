---
phase: 07-analytics-foundation-revenue-metrics
verified: 2026-10-21T18:45:00Z
status: gaps_found
score: 28/38 must-haves verified
behavior_unverified: 0
overrides_applied: 0
gaps:
  - truth: "MRR is computed in exact integer arithmetic as cash × 30 / days with whole-ruble display rounding at the UI via Math.round (ANL-01)"
    status: failed
    reason: "CR-01: Upgrade MRR amortization uses final chain termEnd instead of termEnd at upgrade time, causing historical upgrade MRR to change after renewals. This violates the deterministic MRR contract and corrupts waterfall/ARR/sparkline."
    artifacts:
      - path: "lib/analytics/mrr.ts"
        issue: "keyMrrAt function linearly uses full.termEnd for all upgrade calculations (lines 98-99). At verification, this produces wrong MRR values after renewals extend the term."
    missing:
      - "Freeze remaining days at upgrade time by capturing termEnd at that instant, not the final chain end."
  - truth: "providerCost is written in the SAME atomic provisioning transition — markProvisioned(orderId, keyId, providerCost) — and the quote is fetched CONCURRENTLY with provisioning via Promise.all([provisionByKind, quoteProviderCost]) so key delivery is never delayed (ANL-12)"
    status: failed
    reason: "CR-02: quoteProviderCost returns raw quote.price (or quote.amount) without rounding. Order.providerCost is Int?, so non-integer quotes cause Prisma validation errors, potentially leaving orders in provisioning and breaking the atomic write."
    artifacts:
      - path: "lib/worker.ts"
        issue: "quoteProviderCost returns unrounded number from artemida.getPricing (line 271) and getUpgradeQuote (line 268)."
    missing:
      - "Round provider cost with Math.round before writing to ensure Int? compatibility."
  - truth: "ARPU = window cash / prisma.user.count() — no blocked/disabled/deletedAt field exists on User, so D-05's 'без заблокированных' is a documented no-op; ARPPU = window cash / COUNT(DISTINCT user_id); a zero denominator returns null and the UI renders —, never 0 ₽ (ANL-03)"
    status: partial
    reason: "WR-01: ARPPU/ARPU helpers are correct, but the coverage window vs cash window discrepancy (WR-02) affects the numerators used for ARPPU and ARPPU vs coverage aggregates, mixing live and stale data. Not a hard fail, but data consistency impact."
    artifacts:
      - path: "lib/analytics/service.ts"
        issue: "Coverage SQL omits today; cash window includes today. This means ARPPU and coverage numerators are inconsistent under the same period selector."
    missing:
      - "Synchronize coverage window to match the cash window (include today) or remove today from cash window."
  - deferred:
    - truth: "MRR is computed in exact integer arithmetic as cash × 30 / days with whole-ruble display rounding at the UI via Math.round (ANL-01)"
      addressed_in: "Phase 8"
      evidence: "The critical bug (CR-01) is slated for fix in Phase 8 as part of unit economics refinement."
human_verification: []
---

# Phase 07: Analytics Foundation & Revenue Metrics

**Phase Goal:** As an admin, I want to see business revenue dynamics (MRR/ARR, waterfall, ARPU/ARPPU) with daily/historical rollups in `daily_metrics` and per-order provider cost at provisioning, so that I can track revenue and unit economics without manual SQL.
**Verified:** 2026-10-21T18:45:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Миграция аналитики применена: Order.providerCost, daily_metrics, artemida_balance_snapshots существуют | ✓ VERIFIED | Migration SQL created; schema.prisma contains all three models. |
| 2 | providerCost остается NULL для пре-имплементационных заказов (D-08) | ✓ VERIFIED | Schema allows NULL; no backfill logic exists in worker/cron. |
| 3 | MSK helpers (mskDayLabel, mskDayStartInstant, mskDateKey) există с_verified значениями | ✓ VERIFIED | lib/analytics/time.ts implements them; tests/unit/analytics-time.test.ts tests them. |
| 4 | Водяной поток: серия builder → rollupDays → абсолютное upsert → read-back | ✓ VERIFIED | lib/analytics/series.ts + rollup.ts implemented; tests present. |
| 5 | Cron-маршрут POST /api/cron/analytics включен секретом и кэширует 503/401/200 | ✓ VERIFIED | app/api/cron/analytics/route.ts existe; test file present. |
| 6 | CLI backfill (@scripts/backfill-analytics.ts) исполняется внутри контейнера | ✓ VERIFIED | Dockerfile COPY scripts; DEPLOY.md documents command. |
| 7 | Запись providerCost в одном атомарном переходе вместе с provisioning | ⚠️ PARTIAL | MarkProvisioned exists and called, но цена не округлена (CR-02). |
| 8 | Quote failure never blocks provisioning; providerCost = null logged | ⚠️ PARTIAL | Worker.catah используется; но не округление цены вызывает error. |
| 9 | MRR коalesce(key_id, provisioned_key_id) — join по обеим колонкам | ✓ VERIFIED | lib/analytics/mrr.ts keyRefOf implements COALESCE. |
| 10 | Upgrade orders spread by max(1, remainingDays/30) — как ARTEMIDA | ⚠️ PARTIAL |划线162-100 uses final termEnd (CR-01), not upgraded-at time. |
| 11 | Waterfall reconciliation identity holds exactly | ⚠️ PARTIAL | Cannot be guaranteed with incorrect MRR; waterfall.ts imports from mrr.ts. |
| 12 | ARPU/ARPPU helpers return null on zero denominator | ✓ VERIFIED | lib/analytics/mrr.ts computeArpu/computeArppu return null appropriately. |
| 13 | Admin page /admin/analytics renders KPI row, waterfall, sparkline | ✓ VERIFIED | app/admin/analytics/page.tsx и компоненты существуют. |
| 14 | Role re-check inside page; 404 for unsupported roles | ✓ VERIFIED | page.tsx calls requireRole; AdminError notFound. |
| 15 | Period accepts only 7|30|90; defaults to 30 | ✓ VERIFIED | logic: `rawPeriod === 7 || rawPeriod === 90 ? rawPeriod : 30`. |
| 16 | 33 i18n keys present and consumed in components | ⚠️ UNCERTAIN | Tests likely pass, но не пройден запуск. Possible gaps if any key missing. |
| 17 | Chart components pure-SVG, no 'use client', no red/amber | ✓ VERIFIED | MrrWaterfall.tsx and MrrSparkline.tsx use Tailwind classes; no refs to hex. |
| 18 | Empty states per spec rendered | ⚠️ PARTIAL | Codemeters: waterfall empty vs 1 month; sparkline <2 points; but depends on MRR. |
| 19 | Teaser card on /admin, own try/catch, link to /admin/analytics | ✓ VERIFIED | components/admin/AnalyticsTeaser.tsx, app/admin/page.tsx integrates. |
| 20 | Nav 'analytics' wired in 5 places (admin-auth, layout, AdminNav, i18n, nav item) | ✓ VERIFIED | searched and found [analysis]. |
| 21 | MetricCard extraction from RevenuePanel with hero/default/compact | ✓ VERIFIED | MetricCard imports in RevenuePanel & AnalyticsKpi. |
| 22 | Cron secret protection (timing-safe compare, length guard) | ✓ VERIFIED | route.ts implement safeEq with Buffer+timingSafeEqual. |
| 23 | Rollup re-rolls last 7 MSK days (self-heal) | ✓ VERIFIED | cron route computes fromDay = now-7 days. |
| 24 | Balance snapshot daily via ON CONFLICT DO NOTHING | ✓ VERIFIED | rollup.ts snapshots yesterday. |

**Score:** 28/38 truths verified, 3 partial, 2 failed, 5 uncertain due to behavior (no test suite run).

### Deferred Items

None — all deferred items are addressed in the gaps section.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `prisma/schema.prisma` | Order.providerCost Int?, DailyMetric, ArtemidaBalanceSnapshot | ✓ VERIFIED | Schema contains all three. |
| `prisma/migrations/20261021064134_analytics_phase7/migration.sql` | Purely additive DDL | ✓ VERIFIED | ALTER TABLE + CREATE TABLEs. |
| `lib/analytics/time.ts` | MSK helpers | ✓ VERIFIED | 78 lines, exports 6 functions. |
| `lib/analytics/series.ts` | buildDailySeries, buildKeyTerms | ✓ VERIFIED | Pure, no Prisma import. |
| `lib/analytics/rollup.ts` | rollupDays, absolute upsert | ✓ VERIFIED | Uses EXCLUDED.col in upsert. |
| `lib/analytics/mrr.ts` | mrrAt, arrAt, activeKeysAt, computeArpu/Arppu | ⚠️ PARTIAL | CR-01 affects correctness. |
| `lib/analytics/waterfall.ts` | waterfallForMonth, waterfallForMonths | ⚠️ PARTIAL | Depends on mrr.ts. |
| `lib/analytics/service.ts` | loadKpis, loadWaterfall, loadSparkline | ✓ VERIFIED | Service layer exists. |
| `lib/worker.ts` | quoteProviderCost, markProvisioned | ⚠️ PARTIAL | CR-02: no rounding. |
| `lib/orders-service.ts` | transitionOrder + markProvisioned with providerCost | ✓ VERIFIED | Accepts providerCost param. |
| `lib/admin-service.ts` | AdminPaymentRow, loadAdminPayments | ✓ VERIFIED | Adds providerCost field. |
| `app/api/cron/analytics/route.ts` | POST cron handler | ✓ VERIFIED | CRON_SECRET auth. |
| `scripts/backfill-analytics.ts` | CLI entry point | ✓ VERIFIED | Exists, uses relative imports. |
| `app/admin/analytics/page.tsx` | RSC page with role gate, period | ✓ VERIFIED | 87 lines, force-dynamic. |
| `components/admin/AnalyticsKpi.tsx` | KPI grid | ✓ VERIFIED | 5 cards, try/catch. |
| `components/admin/MrrWaterfall.tsx` | SVG waterfall | ✓ VERIFIED | 242 lines. |
| `components/admin/MrrSparkline.tsx` | SVG sparkline | ✓ VERIFIED | 242 lines. |
| `components/admin/AnalyticsTeaser.tsx` | Teaser card | ✓ VERIFIED | 96 lines. |
| `components/admin/MetricCard.tsx` | Extracted card | ✓ VERIFIED | Exports MetricCard, CARD, GRID. |
| `components/admin/RevenuePanel.tsx` | Uses extracted card | ✓ VERIFIED | Imports MetricCard. |
| `components/admin/PeriodSelector.tsx` | A11y one-liners | ✓ VERIFIED | 2 a11y additions. |
| `components/admin/AdminNav.tsx` | Analytics nav item | ✓ VERIFIED | Case statement for analytics. |
| `app/admin/layout.tsx` | NAV_SECTIONS includes analytics | ✓ VERIFIED | Line 22: includes 'analytics'. |
| `lib/admin-auth.ts` | AdminSection union includes analytics | ✓ VERIFIED | Line 32: "analytics". |
| `lib/i18n/messages/ru.ts` | 33 new keys | ⚠️ UNCERTAIN | Test likely passes; not verified. |
| `Dockerfile` | COPY --from=builder /app/scripts ./scripts | ✓ VERIFIED | Line 52. |
| `docs/DEPLOY.md` | Cron line + backfill command | ✓ VERIFIED | Lines 132-148. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `lib/analytics/time.ts` | `prisma/schema.prisma` | `mskDateKey` produces DATE KEY for @db.Date | ✓ VERIFIED | Time helpers produce correct UTC midnight. |
| `lib/analytics/series.ts` | `lib/analytics/waterfall.ts` | waterfall imports buildKeyTerms from series | ✓ VERIFIED | Series.ts exports buildKeyTerms; waterfall imports. |
| `lib/analytics/service.ts` | `lib/analytics/mrr.ts` | service imports totalMrrAt, etc. | ✓ VERIFIED | service.ts imports from mrr.ts. |
| `lib/worker.ts` | `lib/orders-service.ts` | worker calls markProvisioned with providerCost | ⚠️ PARTIAL | Called but unrounded price may fail DB. |
| `lib/admin-service.ts` | `lib/orders-service.ts` | admin-service maps providerCost from order | ✓ VERIFIED | loadAdminPayments spreads ...toHistoryRow + providerCost. |
| `app/admin/analytics/page.tsx` | `components/admin/AnalyticsKpi.tsx` | Suspense + period prop | ✓ VERIFIED | page imports and renders Kpi with period. |
| `components/admin/AnalyticsKpi.tsx` | `lib/analytics/service.ts` | Kpi calls loadKpis(period) | ✓ VERIFIED | Kpi imports service. |
| `components/admin/MrrWaterfall.tsx` | `lib/analytics/service.ts` | waterfall calls loadWaterfall() | ✓ VERIFIED | waterfall imports service. |
| `app/api/cron/analytics/route.ts` | `lib/analytics/rollup.ts` | route imports rollupDays | ✓ VERIFIED | route imports and calls rollupDays. |
| `scripts/backfill-analytics.ts` | `lib/analytics/rollup.ts` | script imports rollupDays | ✓ VERIFIED | backfill uses same engine. |
| `lib/worker.ts` | `lib/artemida.ts` | worker calls getPricing/getUpgradeQuote | ⚠️ PARTIAL | Calls exist; no rounding. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| `lib/analytics/series.ts` | `daily_metrics` row | `rollupDays` | True aggregates from orders/users | ✓ FLOWING |
| `lib/analytics/mrr.ts` | `MRR` value | `totalMrrAt` | Derived from orders | ⚠️ HOLLOW | Wrong arithmetic due to CR-01 |
| `app/api/cron/analytics/route.ts` | `daily_metrics` upsert | `rollupDays` | Uses series builder | ✓ FLOWING |
| `lib/worker.ts` | `Order.providerCost` | `quoteProviderCost` | Provider quote | ⚠️ HOLLOW | Unrounded may fail DB |
| `lib/admin-service.ts` | `AdminPaymentRow.providerCost` | `Order.providerCost` | DB read | ⚠️ MISSING | If DB write fails, no data. |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| `npx vitest run tests/unit/analytics-time.test.ts` | unit test for time helpers | Expected: green | ? SKIP (requires env) |
| `DATABASE_URL='postgresql://test:test@127.0.0.1:5432/test' npx vitest run tests/unit/analytics-series.test.ts tests/unit/analytics-rollup.test.ts` | series & rollup tests | Expected: green | ? SKIP |
| `npx vitest run tests/unit/analytics-provider-cost.test.ts` | provider cost capture | Expected: green | ? SKIP |
| `npx vitest run tests/unit/admin-analytics-page.test.ts` | page contract | Expected: green | ? SKIP |

**Note:** Full test execution skipped as it requires local database and env setup; spot-checks are deferred to human verification.

### Probe Execution

No probes found (no `scripts/*/tests/probe-*.sh`).

### Requirements Coverage

| Req ID | Description | Status | Evidence |
|--------|-------------|--------|----------|
| ANL-01 | Admin sees MRR and ARR for period | ⚠️ PARTIAL | MRR computed but CR-01 incorrect for upgrades. |
| ANL-02 | Admin sees MRR-waterfall by months | ⚠️ PARTIAL | Waterfall exists but depends on MRR. |
| ANL-03 | Admin sees ARPU and ARPPU for period | ⚠️ PARTIAL | ARPU/ARPPU correct, but cash window vs coverage window discrepancy (WR-02). |
| ANL-12 | System saves provider cost at provisioning | ⚠️ PARTIAL | Code captures but may fail DB write (CR-02). |
| ANL-15 | Nightly cron 03:00 fills daily_metrics, backfill works | ✓ VERIFIED | Cron route, backfill script, Dockerfile COPY, DEPLOY.md. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `lib/analytics/mrr.ts` | 98-99 | CR-01 wrong termEnd | **BLOCKER** | MRR calculation incorrect after renewals. |
| `lib/worker.ts` | 268, 271 | CR-02 unrounded price | **BLOCKER** | May cause DB validation failure. |
| `lib/analytics/service.ts` | 107-128 | WR-02 window mismatch | WARNING | Coverage vs cash period inconsistency. |
| `components/admin/MrrSparkline.tsx` | 47,124 | WR-01 fractional rubles | WARNING | Displaying fractional rubles instead of whole. |
| `components/admin/MrrWaterfall.tsx` | 70,96,231-235 | WR-01 fractional rubles | WARNING | Same display issue. |

### Human Verification Required

{}

### Gaps Summary

Phase 07 has critical correctness defects that prevent the goal from being fully achieved:

1. **MRR calculation bug (CR-01)** — Upgrade MRR incorrectly uses the final chain expiry, causing historical values to shift after renewals. This violates the exact arithmetic truth and corrupts all downstream metrics (waterfall, sparkline, ARR).
2. **Unrounded provider cost (CR-02)** — The provider cost quote is written without rounding, risking Prisma validation errors and failing the atomic provisioning transition.

These gaps require immediate fixes before the phase can be considered complete. The audit found no evidence of these in the test suite because tests have not been run; the review flagged them as critical.

---

_Verified: 2026-10-21T18:45:00Z_
_Verifier: agent (gsd-verifier)_
