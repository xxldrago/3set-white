---
phase: 07-analytics-foundation-revenue-metrics
reviewed: 2026-10-21T09:59:24Z
depth: standard
files_reviewed: 24
files_reviewed_list:
  - lib/analytics/time.ts
  - lib/analytics/series.ts
  - lib/analytics/rollup.ts
  - lib/analytics/mrr.ts
  - lib/analytics/waterfall.ts
  - lib/analytics/service.ts
  - app/api/cron/analytics/route.ts
  - scripts/backfill-analytics.ts
  - lib/worker.ts
  - lib/orders-service.ts
  - lib/admin-service.ts
  - app/admin/analytics/page.tsx
  - app/admin/page.tsx
  - app/admin/layout.tsx
  - components/admin/MetricCard.tsx
  - components/admin/AnalyticsKpi.tsx
  - components/admin/MrrWaterfall.tsx
  - components/admin/MrrSparkline.tsx
  - components/admin/AnalyticsTeaser.tsx
  - components/admin/RevenuePanel.tsx
  - components/admin/PeriodSelector.tsx
  - components/admin/AdminNav.tsx
  - lib/admin-auth.ts
  - lib/i18n/messages/ru.ts
  - prisma/schema.prisma
  - prisma/migrations/20261021064134_analytics_phase7/migration.sql
findings:
  critical: 2
  warning: 4
  info: 3
  total: 9
status: issues-found
---

# Phase 07: Code Review Report

**Reviewed:** 2026-10-21T09:59:24Z
**Depth:** standard
**Files Reviewed:** 24
**Status:** issues-found

## Summary

Phase 7 analytics foundation is structurally sound on the hard invariants that were called out: MSK day bucketing stays in `lib/analytics/time.ts`, rollup upserts are absolute (`EXCLUDED.col`), cron is gated by `CRON_SECRET` with timing-safe compare, raw SQL uses the `orders` table name and parameterized Prisma tags, and customer-facing `OrderHistoryRow` / `toHistoryRow` still omit `providerCost`.

Two correctness defects still ship: (1) upgrade MRR amortization recomputes against the *final* chain `termEnd`, so a later renewal silently shrinks historical upgrade MRR; (2) `quoteProviderCost` writes unrounded `getPricing().price` into an `Int?` column, violating the whole-ruble money contract and risking Prisma Int validation failures on non-integer provider quotes. Several display/window consistency gaps remain around fractional MRR in charts and coverage vs cash windows.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: Upgrade MRR shrinks after renewals (wrong `termEnd`)

**File:** `lib/analytics/mrr.ts:94-100`
**Issue:** `keyMrrAt` amortizes every upgrade with `remainingDays = (full.termEnd − upgrade.paidAt) / DAY_MS`. `full.termEnd` is the *current* chain expiry after all later renewals. A renewal that extends the term therefore dilutes the same upgrade's monthly equivalent after the fact (example: 900 ₽ upgrade with 16 days left → ~900 ₽/mo; after a +30d renew → ~587 ₽/mo). That corrupts live MRR/ARR KPIs, the waterfall (expansion/contraction), and the sparkline — all of which call `mrrAt` / `totalMrrAt`. The module comment claims parity with ARTEMIDA's `max(1, remainingDays/30)` rule at upgrade time; using the final chain end violates that.
**Fix:**
```ts
// Freeze remaining days at the upgrade instant against the term end *then*,
// not against the final post-renewal termEnd.
const termAtUpgrade = buildKeyTerms(
  ops.filter((op) => !op.paidAt || op.paidAt.getTime() <= um),
).get(ref);
const endAtUpgrade = termAtUpgrade?.termEnd.getTime() ?? full.termEnd.getTime();
const remainingDays = (endAtUpgrade - um) / DAY_MS;
mrr += cashOf(u) / Math.max(1, remainingDays / 30);
```
(Alternatively cache `remainingDaysAtUpgrade` when the upgrade is recorded; the important part is that a later renew must not rewrite past upgrade MRR.)

### CR-02: Unrounded `getPricing` price written to `providerCost Int?`

**File:** `lib/worker.ts:270-271`
**Issue:** `quoteProviderCost` returns raw `quote.price` from `artemida.getPricing` with no `Math.round`. `normalizePricing` in `lib/artemida.ts` also does not round. `Order.providerCost` is `Int?` (whole RUB per schema/D-06). Retail billing paths round (`lib/pricing.ts:99`, `lib/orders-service.ts:133-137`); the cost-capture path does not. A non-integer provider quote can make `markProvisioned(..., quotedCost)` fail Prisma Int validation after the key is already created — retries then churn against the same float. Balance snapshots correctly use `Math.round(wallet.balance)` in `rollup.ts:124`; cost capture does not.
**Fix:**
```ts
const quote = await artemida.getPricing({ days: order.days ?? 30, devices: order.devices });
return Math.round(quote.price);
// and for upgrades (already rounded in deriveUpgradeQuote, but keep the gate):
return Math.round(quote.amount);
```

## Warnings

### WR-01: Chart / a11y surfaces show fractional rubles

**File:** `components/admin/MrrSparkline.tsx:47,124` · `components/admin/MrrWaterfall.tsx:70,96,231-235`
**Issue:** KPI cards correctly `Math.round` MRR/ARR (`AnalyticsKpi.tsx:50,56`). Sparkline meta, sr-only tables, and waterfall titles/cells format raw rationals from `mrrAt` (e.g. `586.956…`). Violates the whole-ruble display contract (UI-SPEC / D-04 “display rounding in the UI”).
**Fix:** Round at the render boundary, e.g. `money.format(Math.round(p.mrr))` / `money.format(Math.round(row.new))` (and the same for expansion/contraction/churned/net and title strings).

### WR-02: Coverage window excludes today; cash window includes it

**File:** `lib/analytics/service.ts:107-128`
**Issue:** Window cash / ARPU / ARPPU use live paid orders with `paidAt >= fromInstant` (includes today). Coverage sums `daily_metrics` with only `day >= fromDay::date` and no upper bound — but the nightly job only writes through yesterday, so today never contributes to `coverageKnown` / `coverageTotal`. Same period selector therefore mixes a live cash numerator with a stale-through-yesterday coverage ledger. Also missing `day < today` makes the coverage SQL asymmetric vs the sparkline query (`day < mskDateKey(today)`).
**Fix:**
```sql
WHERE day >= ${fromDay}::date AND day < ${today}::date
```
and either (a) document that coverage is “closed days only”, or (b) add today’s live `providerCost IS NOT NULL` counts into the coverage totals so both KPIs share the same inclusive window.

### WR-03: Admin payments load `providerCost` but never render it

**File:** `app/admin/users/[id]/page.tsx:118-162` · `lib/admin-service.ts:372-385`
**Issue:** `loadAdminPayments` correctly attaches admin-only `providerCost` (no customer leak — cabinet/bot still use `toHistoryRow`). The profile payments section types the result as `OrderHistoryRow` and never displays cost / `—` for null. ANL-12’s admin surface for per-order cost is therefore incomplete; the type lie also hides the field from future maintainers.
**Fix:** Type as `AdminPaymentRow` and render a cost line (`Math.round(row.providerCost)` or `—` when null), admin-only.

### WR-04: Upgrade quote cost path hardcodes 30d remaining (margin skew)

**File:** `lib/worker.ts:263-267`
**Issue:** `getUpgradeQuote` is called with `{ days: 30, devices: baseDevices, addDevices }` and no `remainingDays`, so `deriveUpgradeQuote` always uses `remainingDays ?? 30` → `months = 1`. Real keys with >30 days remaining are under-costed vs ARTEMIDA’s proportional rule; retail `resolveUpgradeQuote` intentionally mirrors the same 30d fixture, but analytics margin (cash − providerCost) then systematically understates provider expense on long-lived upgrades. Related to CR-01’s amortization story: capture and derivation disagree on “remaining days”.
**Fix:** Read `expiresAt` from `keyCache` (or provider key) at quote time and pass `remainingDays = max(1, ceil((expiresAt − now) / DAY_MS))` into `getUpgradeQuote`.

## Info

### IN-01: Unused `role` on analytics page

**File:** `app/admin/analytics/page.tsx:52-54`
**Issue:** `role` is assigned from `requireRole` but never read (overview page uses it for the funnel gate). Dead binding.
**Fix:** `await requireRole('administrator', 'manager');` without destructuring, or prefix with void.

### IN-02: Analytics Suspense children trust page-level `requireRole`

**File:** `app/admin/analytics/page.tsx:76-84` · `components/admin/AnalyticsKpi.tsx` / `MrrWaterfall.tsx` / `MrrSparkline.tsx`
**Issue:** Page comments correctly note layouts are not a security boundary and re-check `requireRole`. The async chart/KPI children do not re-check; they inherit the parent render. Safe under current Next App Router composition, but a future direct import/route of a child would skip the gate. Same pattern as overview `AnalyticsTeaser`.
**Fix:** Optional defense-in-depth: call `requireRole('administrator', 'manager')` at the top of each loader component (or inside `loadKpis` / `loadWaterfall` / `loadSparkline`).

### IN-03: `ArtemidaBalanceSnapshot.capturedFrom` unmapped camelCase column

**File:** `prisma/schema.prisma:607` · `prisma/migrations/20261021064134_analytics_phase7/migration.sql:28`
**Issue:** Column is intentionally `capturedFrom` (no `@map`) to match RESEARCH. Consistent, but diverges from every other snake_case mapped column on the table. Fine if documented; easy footgun for raw SQL authors expecting `captured_from`.
**Fix:** Keep as-is with a schema comment (already present in 07-01 SUMMARY), or add `@map("captured_from")` + a follow-up migration if snake_case consistency is preferred.

---

_Reviewed: 2026-10-21T09:59:24Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
