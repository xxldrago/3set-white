---
phase: "7"
slug: "analytics-foundation-revenue-metrics"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: validated
nyquist_compliant: true
wave_0_complete: true
created: "2026-10-20"
validated: "2026-10-21"
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Audited 2026-10-21 against completed SUMMARYs + live Vitest runs.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest `5.0.3` (`environment: 'node'`, `fileParallelism: false`) |
| **Config file** | `vitest.config.ts` (alias `@` → repo root; dummy env incl. `CRON_SECRET`, `ADMIN_TELEGRAM_IDS: '910000101'`) |
| **Quick run command** | `DATABASE_URL='postgresql://test:test@127.0.0.1:5432/test' npx vitest run tests/unit/analytics-time.test.ts` |
| **Wave-0 suite command** | `DATABASE_URL='postgresql://test:test@127.0.0.1:5432/test' npx vitest run tests/unit/analytics-*.test.ts tests/unit/admin-analytics-page.test.ts` |
| **Full suite command** | `DATABASE_URL='postgresql://test:test@127.0.0.1:5432/test' npm test` |
| **Estimated runtime** | Wave-0 ~2 s; full suite ~60–90 s |

**Note:** `DATABASE_URL` is not present in `.env.local` locally — pass it inline for every command (repo convention). Local Postgres is 16.15; production is `postgres:17-alpine`.

---

## Sampling Rate

- **After every task commit:** Run the single new test file for that task (`npx vitest run tests/unit/analytics-<area>.test.ts`) — < 2 s each, DB-backed ones ~1 s.
- **After every plan wave:** Run the full suite (`DATABASE_URL='postgresql://test:test@127.0.0.1:5432/test' npm test`).
- **Before `/gsd-verify-work`:** Full suite must be green.
- **Max feedback latency:** ~90 seconds.

---

## Per-Task Verification Map

> Task IDs are assigned by the planner; this map is keyed by requirement so every planned task can be bound to a test at plan time. Every row below MUST resolve to a real `<automated>` command in the plan.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 07-01-T2 | 07-01 | 1 | ANL-12 / ANL-15 | — | Schema floor: `orders.provider_cost` nullable + `daily_metrics` + `artemida_balance_snapshots`; migrate status up-to-date | schema | `DATABASE_URL='…' npx prisma migrate status` → up to date | ✅ migration | ✅ green |
| 07-01-T3 | 07-01 | 0 | ANL-15 | — | MSK label ↔ instant ↔ date-key round trips; month windows identical to `Intl` (fixed `+03:00`) | unit (pure) | `npx vitest run tests/unit/analytics-time.test.ts` | ✅ | ✅ green (11) |
| 07-02-T1a | 07-02 | 0 | ANL-15 | — | `buildDailySeries` produces exact per-day cash / counts / cost-coverage / activeKeys from fixture rows | unit (pure) | `npx vitest run tests/unit/analytics-series.test.ts` | ✅ | ✅ green (6) |
| 07-02-T1b | 07-02 | 1 | ANL-15 | DoS | Upsert idempotent: re-run → identical row; concurrent runs → one row. Absolute values only (never `increment`) | integration (real DB) | `npx vitest run tests/unit/analytics-rollup.test.ts` | ✅ | ✅ green (4) |
| 07-02-T2 | 07-02 | 1 | ANL-15 | Spoofing | Cron route: 401 without secret, 503 when `CRON_SECRET` unset, 200 + idempotent with it (`timingSafeEqual`) | source-contract + DB | `npx vitest run tests/unit/analytics-cron-route.test.ts` | ✅ | ✅ green (4) |
| 07-02-T3 | 07-02 | 2 | ANL-15 | DoS | Backfill over fixed history equals manual recomputation and is re-runnable | integration (real DB) | `npx vitest run tests/unit/analytics-backfill.test.ts` | ✅ | ✅ green (3) |
| 07-03-T1 | 07-03 | 1 | ANL-12 | Info Disclosure | Worker records provider cost on the order; quote failure still provisions and leaves `null`; customer history mapper never exposes cost | unit (DB + spies) + source-contract | `npx vitest run tests/unit/analytics-provider-cost.test.ts` | ✅ | ✅ green (11) |
| 07-04-T1 | 07-04 | 2 | ANL-01 | — | Per-key MRR: `new` via `provisionedKeyId` (COALESCE with `keyId`), renew extension, expiry → 0, upgrade delta with `days=NULL` fallback | unit (pure) | `npx vitest run tests/unit/analytics-mrr.test.ts` | ✅ | ✅ green (8) |
| 07-04-T2 | 07-04 | 2 | ANL-02 | — | Waterfall reconciles exactly: `new + expansion − contraction − churned = ΔMRR` for every month | unit (pure) | `npx vitest run tests/unit/analytics-waterfall.test.ts` | ✅ | ✅ green (6) |
| 07-04-T3 | 07-04 | 2 | ANL-03 | — | ARPU/ARPPU denominators; `—` on zero; no divide-by-zero; cost-coverage flag | unit (pure + DB count) | `npx vitest run tests/unit/analytics-metrics.test.ts` | ✅ | ✅ green (4) |
| 07-05-T2 | 07-05 | 2 | D-11 | Elevation of Privilege | `/admin/analytics` re-checks role, `force-dynamic`, no cost/provider fields leaked into props | source-contract | `npx vitest run tests/unit/admin-analytics-page.test.ts` | ✅ | ✅ green (7) |
| 07-05-T3 | 07-05 | 2 | — | — | i18n completeness for new keys (fails on missing **or unused** keys, every locale) | existing | `npx vitest run tests/unit/i18n.test.ts` | ✅ | ✅ green (5) |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

**Audit run (2026-10-21):** Wave-0 analytics + admin page = **64 passed / 10 files** in ~1.7 s; i18n = **5 passed**; `prisma migrate status` = Database schema is up to date.

---

## Wave 0 Requirements

- [x] `tests/unit/analytics-time.test.ts` — MSK helpers + `Intl` cross-check (no DB) — **11 green**
- [x] `tests/unit/analytics-series.test.ts` — pure `buildDailySeries` — **6 green**
- [x] `tests/unit/analytics-mrr.test.ts` — pure MRR chain incl. upgrade and new-order cases — **8 green**
- [x] `tests/unit/analytics-waterfall.test.ts` — reconciliation identity — **6 green**
- [x] `tests/unit/analytics-metrics.test.ts` — ARPU/ARPPU/coverage — **4 green**
- [x] `tests/unit/analytics-rollup.test.ts` — DB idempotency + concurrency — **4 green**
- [x] `tests/unit/analytics-backfill.test.ts` — DB range run — **3 green**
- [x] `tests/unit/analytics-provider-cost.test.ts` — worker capture + leak guard — **11 green**
- [x] `tests/unit/analytics-cron-route.test.ts` — auth + wiring — **4 green**
- [x] `tests/unit/admin-analytics-page.test.ts` — role gate + no-leak contract — **7 green**
- [x] Shared DB fixtures for unique `OWNER` telegram ids (follow the existing `'200000310'` / `'200000320'` ranges) plus `cleanup()` in `beforeEach`/`afterAll`

*No framework install needed — Vitest is already configured.*

---

## Soft Gaps (documented, not blocking)

| Area | Severity | Notes |
|------|----------|-------|
| `lib/analytics/service.ts` loaders (`loadKpis` / `loadWaterfall` / `loadSparkline`) | soft / non-critical | No dedicated unit file. Covered indirectly: page smoke renders without throw (`admin-analytics-page.test.ts`), pure derivation covered by mrr/waterfall/metrics, aggregates by series/rollup. Exact §5.6 null/`::int` serialization contracts are **not** asserted in isolation. Prefer documenting over inventing a speculative suite; optional follow-up if Phase 8 regresses loaders. |
| Visual KPI / waterfall / sparkline anatomy | manual | Already in Manual-Only + 07-05 SUMMARY human_judgment rows (D3–D6). |

**No MISSING critical Wave-0 validations.** All mapped automated rows are green.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Historical metrics match a hand-written query for a known past day | ANL-15 | "Metrics for any past day match manual reconciliation" is a cross-check against an independent implementation, not a unit assertion | Pick a day, run the backfill for it (or read `daily_metrics`), then run the equivalent SQL by hand via `psql` (`sum(final_amount - balance_used)` over paid orders in that MSK day) and compare totals |
| Nightly job fills `daily_metrics` without a deploy | ANL-12 / ANL-15 | Requires the production cron schedule; cannot be asserted in-process | After deploy: `curl -X POST -H "x-cron-secret: $CRON_SECRET" https://dash.3set.online/api/cron/analytics`, then re-read the day row and confirm `updated_at` moved and values are unchanged |
| `providerCost` visible per provisioned order in the admin UI | ANL-12 (Success Criterion 5) | Visual placement in the admin surface | Provision a test order, open `/admin/analytics` (or the payments admin view), confirm the captured provider cost renders and an older order shows `—` with the coverage flag |
| KPI / waterfall / sparkline visual anatomy + nav pill | ANL-01/02/03 | SVG geometry, empty states, teaser placement | Open `/admin/analytics` as administrator/manager; confirm D-10 block order, «—» nulls, waterfall slots, sparkline live-today, nav active; support must not see nav item |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 90s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** validated 2026-10-21 (audit) — Wave-0 10/10 green; soft gap on `service.ts` loaders documented; 4 manual-only rows retained

---

## Validation Audit 2026-10-21

| Metric | Count |
|--------|-------|
| Gaps found (Wave-0 map) | 0 critical |
| Wave-0 tests present + green | 10/10 files (64 tests) |
| Schema migrate status | up to date |
| Soft gaps documented | 1 (`service.ts` loaders — non-blocking) |
| Escalated | 0 |
| Manual-only retained | 4 |
| Resolved by filling new tests | 0 (all Wave-0 already existed from execute-phase) |
