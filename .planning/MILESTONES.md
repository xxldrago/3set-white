# Milestones

## v1.1 Расширенная аналитика (Shipped: 2026-10-31)

**Phases completed:** 5 phases, 17 plans, 26 tasks

**Key accomplishments:**

- Additive `providerCost` + `daily_metrics` + `artemida_balance_snapshots` schema applied locally and MSK day primitives pinned by verified-value tests with a 0-mismatch Intl 2020–2030 cross-check.
- End-to-end nightly rollup proven on a real DB: pure MSK-day series builder → absolute-value idempotent upsert (12-way concurrency safe) → CRON_SECRET-gated route → month-chunked backfill CLI, with an independent-recomputation test proving "метрики за любой прошлый день совпадают с ручной сверкой"
- Per-order ARTEMIDA expense captured at provisioning via a concurrent quote written in the same atomic transition, with the admin-only `AdminPaymentRow` read path and an 11-test suite proving outage-resilience and a provably cost-free customer surface.
- Pure derivation core shipped: per-key MRR/ARR chain plus the reconciled MRR waterfall and ARPU/ARPPU/coverage helpers, pinned by 18 tests including the reconciliation identity asserted exactly for every sampled month pair.
- /admin/analytics — MRR hero KPI row, 6-month MRR waterfall, and a live-today MRR sparkline as pure-SVG server components, plus the nav entry and /admin teaser, fully role-gated and i18n-contract-complete
- Pure retention + economics derivation locked: term-event cursor identical to buildKeyTerms, inclusive 7-day grace, cohort-clamped churn, D-07 lost-MRR, and LTV/margin/burn/runway with null-on-zero guards — 27 fixture tests green, no DB.
- Five loaders (loadLtv/loadMargin/loadBurnRunway/loadRetention/loadChurnTable) + shared trailingMonthLabels appended to lib/analytics/service.ts, consuming the 08-01 pure core and proven by 12 DB-backed test rows against real Postgres — balance isolation, trial filter, coverage gates and month-slot reconciliation all pinned.
- Two read-only sections («Юнит-экономика», «Удержание») below the Phase 7 sparkline on /admin/analytics — seven new server components (five blocks + the section wrapper), 44 used i18n keys, five independently-degradable Suspense boundaries, zero client components, zero new dependencies, and a source-contract test pinning order, the balance caller and the RSC no-leak boundary.
- Pure phase-9 derivation core locked: reach-based pending→paid→provisioning→provisioned funnel with exact-rational conversions, hardcoded 24h expired window with a ±1 ms strict-`<` boundary, raw-errorCode breakdown with null preserved, and successful-chain-only timing via the updatedAt proxy — 16 fixture tests green, no DB.
- Five DB-backed Phase 9 loaders wired to the 09-01 pure core: one createdAt-cohort funnel scan, a point-in-time 24h expired count, raw-errorCode grouping, and two successful-chain timing payloads — pinned by 9 identity tests against real Postgres.
- Three new read-only sections on /admin/analytics — «Воронка платежей» (funnel + expired), «Ошибки выдачи» (raw-code table), «Скорость оплаты и выдачи» (two 2-up timing blocks) — five async server components, 31 used i18n keys, five new Suspense boundaries, zero client components, zero new dependencies, and a phase-9 contract test that pins order, boundaries, the RSC no-leak surface, the key count and the untouched OrderStatus enum.
- Complete
- Complete
- Complete
- Complete
- Complete
- Complete

---
