---
phase: "07"
slug: "analytics-foundation-revenue-metrics"
status: SECURED
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
block_on: high
created: "2026-10-21"
---

# Phase 07 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> Built from PLAN.md `<threat_model>` blocks across 07-01..07-05; mitigations verified in implemented code (ASVS L1).

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Cron HTTP → rollup | Machine-only `/api/cron/analytics`; no user session | `x-cron-secret` header vs `CRON_SECRET`; MSK day window; rollup outcome ids |
| Worker fulfill → provider quote | Provisioning path quotes ARTEMIDA cost concurrent with key delivery | Order kind/days/devices; `providerCost` integer or null; warn logs (ids/codes only) |
| Customer surfaces ↔ admin | Cabinet/bot history must not see provider expense | `OrderHistoryRow` (no cost) vs `AdminPaymentRow` (admin-only `providerCost`) |
| Admin RSC `/admin/analytics` | Direct RSC fetch skips layouts; page re-enforces role | Session cookie → `requireRole('administrator','manager')`; KPI/waterfall/sparkline aggregates only |
| CLI backfill → DB | Operator-only history rebuild; not an HTTP surface | `scripts/backfill-analytics.ts` via `docker compose exec`; same `rollupDays` engine |
| Migration deploy | Additive schema for cost + daily metrics | Nullable `orders.provider_cost`; `daily_metrics`; `artemida_balance_snapshots` |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-07-01-01 | Tampering | `prisma/migrations/*_analytics_phase7/migration.sql` | high | mitigate | Purely-additive DDL: nullable `ADD COLUMN provider_cost`, two `CREATE TABLE`, no DROP/DELETE/TRUNCATE | closed |
| T-07-01-02 | Information Disclosure | `prisma/schema.prisma` migrations | low | accept | Migration SQL is not secret; no credential-bearing columns; existing CI/deploy diff review | closed |
| T-07-02-01 | Spoofing / DoS | `app/api/cron/analytics/route.ts` | high | mitigate | 503 when `CRON_SECRET` empty; 401 on missing/forged `x-cron-secret`; `safeEq` = length guard + `timingSafeEqual` | closed |
| T-07-02-02 | DoS | backfill over HTTP | high | mitigate | CLI-only `scripts/backfill-analytics.ts`; no route, no admin button | closed |
| T-07-02-03 | Tampering | day/range strings into raw SQL | high | mitigate | Parameterized `$executeRaw`/`$queryRaw`; day as `'YYYY-MM-DD'` + `$n::date`; never string-interpolated | closed |
| T-07-02-04 | Tampering | concurrent cron+backfill upserts | medium | mitigate | Absolute-value upsert `SET col = EXCLUDED.col` (no incremental math) | closed |
| T-07-02-05 | Information Disclosure | logs | low | mitigate | pino `{ route, outcome, ids }` only — never DATABASE_URL, API keys, provider bodies, raw DB errors | closed |
| T-07-02-06 | DoS | rollup window size | low | mitigate | Cron re-roll fixed at 7 MSK days; backfill chunks by month; one `daily_metrics` row per day | closed |
| T-07-03-01 | Information Disclosure | `lib/orders-service.ts` toHistoryRow / customer components | high | mitigate | Cost stays out of `OrderHistoryRow`/`toHistoryRow`; admin-only `AdminPaymentRow`; customer surfaces (incl. `lib/bot-payments.ts`) free of `providerCost` | closed |
| T-07-03-02 | Tampering | quote source selection | high | mitigate | Cost only from `artemida.getPricing` / `getUpgradeQuote` in `quoteProviderCost`; never `resolveTariffQuote` | closed |
| T-07-03-03 | Availability | provisioning blocked by quote outage | high | mitigate | `Promise.all` + `.catch(() => null)` + warn log; quote failure never blocks key delivery | closed |
| T-07-03-04 | Information Disclosure | logs | low | mitigate | warn logs `{ route, outcome, orderId, code }` only — never provider response bodies or secrets | closed |
| T-07-04-01 | Integrity | keyRefOf join | high | mitigate | `keyRefOf` = `keyId ?? provisionedKeyId` everywhere (COALESCE semantics) | closed |
| T-07-04-02 | Integrity | upgrade division | high | mitigate | days=NULL upgrades spread by `cash / max(1, remainingDays/30)` | closed |
| T-07-04-03 | Integrity | waterfall classification | high | mitigate | Exclusive buckets (new/expansion/contraction/churned); net = new+exp−con−churn; identity asserted in tests | closed |
| T-07-04-04 | DoS | unbounded page derivation | low | accept | daily_metrics one row/day; MRR ≤90-day windows; waterfall ≤6 months; single-server volumes tiny (D-12) | closed |
| T-07-04-05 | Information Disclosure | metrics helpers | low | accept | Pure number math with no I/O and no secrets | closed |
| T-07-05-01 | Elevation of Privilege | `app/admin/analytics/page.tsx` RSC payload | high | mitigate | `requireRole('administrator','manager')` inside page; `SessionError` → `redirect('/login')`; `AdminError` → `notFound()` (never distinct 403) | closed |
| T-07-05-02 | Information Disclosure | page props / chart components | high | mitigate | No cost/provider fields in page or chart components; coverage aggregate only; per-order cost stays on admin payment row | closed |
| T-07-05-03 | Information Disclosure | error strings to DOM | low | mitigate | Catch blocks render `t('common.errorLoad')` only — no raw DB/HTTP/SQL strings | closed |
| T-07-05-04 | DoS | unbounded page derivation | medium | mitigate | KPI/sparkline window ≤90 days; waterfall fixed at min(6, history) MSK months | closed |
| T-07-05-05 | Tampering | `?period=` input | medium | mitigate | `Number(params.period ?? 30)` restricted to 7\|90 else 30; no from/to parsing | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above `block_on: high` count toward `threats_open`*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

### Verification evidence (ASVS L1)

| Threat ID | Evidence |
|-----------|----------|
| T-07-01-01 | `prisma/migrations/20261021064134_analytics_phase7/migration.sql` — additive only (`ADD COLUMN` nullable + 2× `CREATE TABLE`); no destructive DDL |
| T-07-01-02 | Accepted risk (see log) |
| T-07-02-01 | `app/api/cron/analytics/route.ts:16-41` — `safeEq`/`timingSafeEqual`; 503 if secret empty; 401 if header mismatch |
| T-07-02-02 | `scripts/backfill-analytics.ts` CLI-only; no `backfill` route under `app/` |
| T-07-02-03 | `lib/analytics/rollup.ts:89-113` — tagged `$executeRaw` with `${a.day}::date` and bound integers |
| T-07-02-04 | `lib/analytics/rollup.ts:101-112` — `= EXCLUDED.*` absolute upsert |
| T-07-02-05 | `lib/analytics/rollup.ts:129,133-140`; `app/api/cron/analytics/route.ts:36,40,52` — route/outcome/ids only |
| T-07-02-06 | `app/api/cron/analytics/route.ts:47-48` (7-day window); `scripts/backfill-analytics.ts:37-52` (month chunks) |
| T-07-03-01 | `lib/orders-service.ts:387-411` (`OrderHistoryRow` / `toHistoryRow` without cost); `lib/admin-service.ts:372-385` (`AdminPaymentRow`); `lib/bot-payments.ts` free of `providerCost`; `tests/unit/analytics-provider-cost.test.ts` no-leak contracts |
| T-07-03-02 | `lib/worker.ts:245-271` — `artemida.getUpgradeQuote` / `getPricing` only |
| T-07-03-03 | `lib/worker.ts:141-163` — `Promise.all` + `.catch` → null |
| T-07-03-04 | `lib/worker.ts:156-161` — `{ route, outcome, orderId, code }` |
| T-07-04-01 | `lib/analytics/mrr.ts:47-48` — `keyRefOf`; used in `waterfall.ts:49` |
| T-07-04-02 | `lib/analytics/mrr.ts:98-99` — `Math.max(1, remainingDays / 30)` |
| T-07-04-03 | `lib/analytics/waterfall.ts:77-92` — exclusive classification + net identity |
| T-07-04-04 | Accepted risk (see log) |
| T-07-04-05 | Accepted risk (see log) |
| T-07-05-01 | `app/admin/analytics/page.tsx:54-58` — `requireRole` + redirect/`notFound` |
| T-07-05-02 | `app/admin/analytics/page.tsx` + `components/admin/AnalyticsKpi.tsx` / `MrrWaterfall.tsx` / `MrrSparkline.tsx` — no `providerCost`/`provider_cost`; coverage via aggregates only |
| T-07-05-03 | `components/admin/AnalyticsKpi.tsx:26`; `MrrWaterfall.tsx:130`; `MrrSparkline.tsx:37` — `t('common.errorLoad')` |
| T-07-05-04 | `lib/analytics/service.ts:85-87,177` — period 7\|30\|90; waterfall `Math.min(6, …)` |
| T-07-05-05 | `app/admin/analytics/page.tsx:64-65` — period whitelist |

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-07-01 | T-07-01-02 | Migration SQL is not secret; no credential columns added; existing deploy/CI diff review is the control | plan disposition (`accept`) | 2026-10-21 |
| AR-07-02 | T-07-04-04 | One row per day in `daily_metrics`; UI windows ≤90 days / ≤6 months; single-server MVP volume; re-evaluate if live derivations bottleneck (D-12) | plan disposition (`accept`) | 2026-10-21 |
| AR-07-03 | T-07-04-05 | Pure number math helpers — no I/O, no secrets to leak | plan disposition (`accept`) | 2026-10-21 |

*Accepted risks do not resurface in future audit runs.*

---

## Unregistered Flags

None. SUMMARY.md files for 07-01..07-05 have no `## Threat Flags` section; inline T-07-* mentions map to registered threat IDs.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open (blocking) | Open (non-blocking) | Run By |
|------------|---------------|--------|-----------------|---------------------|--------|
| 2026-10-21 | 22 | 22 | 0 | 0 | gsd-secure-phase (ASVS L1, block_on=high) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: SECURED` set in frontmatter

**Approval:** verified 2026-10-21
