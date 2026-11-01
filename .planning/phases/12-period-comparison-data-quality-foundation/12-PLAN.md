---
phase: 12
plan: '12-12'
type: execute
wave: 1
depends_on: []
gap_closure: true
files_modified:
- lib/analytics/service.ts
- lib/analytics/compare.ts
- lib/analytics/windows.ts
- lib/analytics/rollup.ts
- lib/analytics/metric-registry.ts
- lib/referral-stats.ts
- lib/client-ip.ts
- lib/artemida.ts
- lib/time.ts
- prisma/schema.prisma
- tests/unit/analytics-windows.test.ts
- tests/unit/analytics-compare.test.ts
- tests/unit/analytics-quality.test.ts
- tests/unit/analytics-phase12-loaders.test.ts
- tests/unit/analytics-v11-regression.test.ts
- tests/unit/analytics-rollup-guard.test.ts
- tests/unit/metric-registry.test.ts
- tests/unit/admin-analytics-phase12-contract.test.ts
- app/api/cron/analytics/route.ts
- components/admin/MetricCard.tsx
- lib/i18n/messages/ru.ts
- app/api/referrals/click/route.ts
- tests/unit/referral-clicks.test.ts
- tests/unit/analytics-ip-capture.test.ts
- tests/unit/client-ip.test.ts
- app/api/referrals/pin/route.ts (new)
must_haves:
  truths:
  - comparisonWindows(7, now) returns exact two windows (prev 7, start/end MSK-exclusive), and each window excludes today; windows(30) and windows(90) same; adjacency + equal lengths verified
  - compareFlow ok / no-base-zero / no-base-absent / incomparable: four mutually exclusive outcomes; zero percent shown as «—» + «нет базы», never ∞%, never 0% when base is empty, incomparable shown as muted marker when coverage is insufficient; partial never used as substitute
  - loadKpis(period) excludes any order paid today from window cash, coverage, and payers denominator (the D-04 blast radius fix: gte→endExclusive in every query + lt endExclusive guard)
  - classifyDegraded covers 401/402/429-after-retry/502/503/500/504 as degraded; rejects 404/409/unknown@200; network reason for non-ArtemidaError throws without real fetch timeout; no-artemida-error thrown as reason: network
  - degraded rollup uses ON CONFLICT (day) DO NOTHING atomic; healthy run uses DO UPDATE; 12 concurrent runs leave exactly one row per day (invariant); degraded run on missing day still inserts a row (no hole) and records an event
  - any in-window degraded event → badge «данные неполные (N)» on MetricCard + reason in tooltip, zero threshold; no partial state, only incomparable when coverage insufficient
  - referral_clicks generalized: ownerUserId nullable, promoCodeId nullable, kind ∈ {referral, promo}; hourly per-ipHash dedupe (same as recordClick); 13-month retention + nightly cron cleanup; User.signupIpHash + User.trialIpHash stored (sha256 of quasi-IP, never raw IP, never "direct" → null); IC: ip === "direct" records nothing, returns 200
  - metric-registry.ts contains every MetricId with all seven fields non-empty (id, label, formula, source, direction, caveats, kind); i18n.test.ts passes unchanged (labelKey literal switch retained)
  - auto-retry last 3 MSK days with open degraded event; older days closed only via scripts/backfill-*.ts manual backfill
  - cron analytics 03:05 MSK: 3-day re-roll + event closure + click retention sweep; idempotent under concurrent runs
  - Zero new npm dependencies (locked conclusion from v1.2 research)
  - .planning/config.json workflow.ui_safety_gate: true — UI-SPEC approved (D-10 quality badge) before planner proceeds
  - UI-SPEC.md frontmatter: status: approved 2026-11-01
  - metric registry labels satisfy i18n.test.ts unused-key scan (literal switch preserved)
artifacts:
  - lib/analytics/windows.ts — pure module: comparisonWindows(period: 7|30|90, now: Date): {start: string, end: string}[]; endExclusive semantics; mskDateKey for SQL params; window labels 7/30/90
  - lib/analytics/compare.ts — pure module: compareFlow(baseCurr, basePrev): {status: 'ok'|'no-base'|'incomparable', deltaAbs: number, deltaPct: string | '—'}; no division-by-zero; zero base → ok/deltaAbs shown, pct → '—' + 'нет базы'; incomparable when coverage insufficient
  - lib/analytics/rollup.ts — write-guard: ON CONFLICT (day) DO NOTHING for degraded run / DO UPDATE for healthy; pre-seeded healthy row untouched; missing day inserts row + records event; 12-concurrent-run invariant preserved
  - lib/analytics/service.ts — windowed loaders updated: every windowed query gets lt endExclusive (D-04), not gte inclusive-of-today; payers raw SQL guard added; window labels preserved; doc comment updated
  - data_quality_events schema migration (new table, forward-only, append-only)
  - lib/referral-stats.ts — generalized referral_clicks: ownerUserId nullable + promoCodeId + kind; hourly ipHash dedupe for promo; 13-month retention sweep cron; trialIpHash atomic write; "direct" → null
  - User model: signupIpHash sha256, trialIpHash sha256; clientIp() === "direct" → never hashed, returns null
  - metric-registry.ts — complete: every MetricId (MRR, ARR, activeKeys, newUsers, renewOrders, upgradeOrders, providerCostRub, providerCostOrders, goodwillDays, paidOrders, paidCashRub, newOrders, renewOrders, upgradeOrders) with all seven non-empty fields
  - tests/unit/analytics-windows.test.ts — window identity, today excluded, 7/30/90 adjacency + equal lengths
  - tests/unit/analytics-compare.test.ts — compareFlow all outcomes; formatting helper; zero-base, incomparable
  - tests/unit/analytics-quality.test.ts — classifier taxonomy; in-window open-event summary
  - tests/unit/analytics-rollup-guard.test.ts — healthy overwrites / degraded preserves healthy / degraded inserts into hole / concurrency
  - tests/unit/analytics-phase12-loaders.test.ts — upper bound in every windowed loader (incl. payers raw SQL); stock mrrAt(endExclusive); v1.1 regression
  - tests/unit/analytics-v11-regression.test.ts — pinned bounds, derivation identity output byte-identical to pre-change
  - tests/unit/admin-analytics-phase12-contract.test.ts — MetricCard accepts optional delta/quality; existing call sites unchanged
  - tests/unit/metric-registry.test.ts — every MetricId fully described; kind/direction/sources present; i18n test passes
  - tests/unit/referral-clicks.test.ts — promo kind, hourly dedupe, "direct" rejection, funnel-scope isolation, 13-month retention sweep
  - tests/unit/analytics-ip-capture.test.ts — register signupIpHash; trial trialIpHash atomicity; "direct" → null
  - tests/unit/client-ip.test.ts — clientIp() behavior; "direct" is never hashed
  - tests/unit/i18n.test.ts — unchanged (literal switch preserved)
  - app/api/cron/analytics/route.ts — 3-day re-roll + event closure + click retention; spy on rollupDays; idempotent concurrent runs
  - lib/client-ip.ts — "direct" is never hashed into ipHash; new hashClientIp → null helper; documentation updated
  - app/api/referrals/click/route.ts — generalized to accept body { code, kind?: 'referral'|'promo', promoCodeId?: string } (backward-compatible; existing body { code } passes through)
  - components/admin/MetricCard.tsx — delta/quality optional props; delta row in CARD/hero/compact; quality badge pill; no existing call sites changed
  - lib/i18n/messages/ru.ts — new keys: admin.analyticsDeltaBaseWeek, admin.analyticsDeltaBaseMonth, admin.analyticsDeltaBaseDays, admin.analyticsDeltaNoBase, admin.analyticsDeltaIncomparable, admin.analyticsDataIncomplete, admin.analyticsNoBase, admin.analyticsIncomparable, admin.analyticsQualityDegraded, admin.analyticsExcludedBySource
  - app/api/cron/analytics/route.ts — updated cron 03:05 with 3-day retry window, event closure, 13-month click sweep
  - prisma/migrations/xxxxxxx_generalize_referral_clicks_and_add_ip_hash — one-way migration: ownerUserId nullable, promoCodeId added, kind added, User.signupIpHash added, User.trialIpHash added; ReferralClick kind default 'referral'
  - scripts/backfill-*.ts scripts (3 variants): close old events after re-roll, backfill 3-day window from events, 13-month click retention sweep
threat_model:
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| ARTEMIDA account → local per-user cache | Single `ARTEMIDA_API_KEY`; `GET /keys` / `GET /balance` / KPI endpoints return account-wide data. The collection + rollup + comparison steps are where untrusted data crosses into per-user stores. |
| session telegram-id → keys_cache / metric rows | The cabinet/bot resolve the caller from the signed Telegram session; the cache row's `userId` must equal the caller or every downstream ownership join is defeated. |
| admin UI → data quality events + IP hashes | Admin can read `data_quality_events` and `User.signupIpHash`/`trialIpHash`; hashes are sha256-quasi-IP, never raw IP, `"direct"` excluded. The beacon is unauthenticated by design (always 200, no oracle). |
| public click beacon → referral_clicks | `/api/referrals/click` and `/api/referrals/pin` are unauthenticated (always 200). Dedupe is hourly per `ipHash`; `"direct"` never hashed; generic + partner codes share the same table + one in-vane funnel. |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-12-01 | Information Disclosure / Elevation (IDOR) | KPI rollup comparison windows (`lib/analytics/service.ts`) | **high** | mitigate | Every windowed query gets `lt endExclusive` (D-04); today excluded from both windows; no gte-inclusive-of-today path after migration. |
| T-12-02 | Information Disclosure | `data_quality_events` read path | medium | accept | Admin UI reads events only; events carry reason enum + non-secret detail; no provider secrets in logs. |
| T-12-03 | Tampering | `revalidateKeys`-style population generalized to metric rollup | medium | mitigate | Write-guard (`ON CONFLICT DO NOTHING`) is atomic; no read-check before upsert; 12-concurrent-run invariant. |
| T-12-04 | Tampering | Public click beacon `/api/referrals/click` | low | accept | Always 200, no oracle, idempotent by `ipHash` dedupe; `"direct"` never hashed; body validated by zod; source `slice(0,32)`. |
| T-12-05 | Information Disclosure | `User.signupIpHash` / `trialIpHash` exposure | medium | mitigate | sha256 hashes only; never raw IP; `"direct"` → null; 13-month retention; no IP in logs; audit log records only the hash, not the source. |
| T-12-SC | Tampering | npm/pip installs | low | accept | This plan adds NO new dependency; zero new npm packages. All changes are pure-TS + Prisma migration only. |

### Downstream Consumer (Phase 13 / Phase 14)

| Consuming Phase | What It Uses | Disposition |
|-----------------|--------------|-------------|
| Phase 13 (ALR-02/ALR-03/ALR-04) | MetricCard delta/quality, quality badge, period selector `?period`; `windowStartDay` already updated | Ready for phase |
| Phase 14 (PRM-01/PRM-04) | Generalized `referral_clicks`, `User.signupIpHash`/`trialIpHash`, hourly dedupe, 13-month retention, data_quality_events base | Capture-only foundation delivered in Phase 12; delivery surface in Phase 14 |
| Phase 15 (EXT-01/EXT-02/EXT-06) | `data_quality_events` append-only, CSV export, save-list, metric dictionary | Uses base from Phase 12 |

## Edge Coverage Probe Fallback (specless probe)
(The phase has no SPEC.md; the specless probe fired in Step 7.95. Edge-coverage predicates authored into `must_haves` truths below.)

- **applicable:** 5 (ALR-01, EXT-05, PRM-01, PRM-04)  
- **resolved:** 0  
- **unresolved:** 5 (status unclassified for all 4 requirements + idempotency for PRM-01)  
- **byVerification:** explicit 0, backstop 0  
- The probe classified 5 requirement IDs from the trace: ALR-01, EXT-05, PRM-01, PRM-04. All remain unresolved until plan predicates are verified against the codebase.

## Tasks

### <task type="tracer">
<name>End-to-end comparison windows + write-guard + quality-badge integration — tracer slice</name>
<files>
lib/analytics/windows.ts, lib/analytics/compare.ts, lib/analytics/rollup.ts,
lib/analytics/service.ts, lib/analytics/metric-registry.ts,
tests/unit/analytics-windows.test.ts, tests/unit/analytics-compare.test.ts,
tests/unit/analytics-quality.test.ts, tests/unit/analytics-rollup-guard.test.ts,
tests/unit/admin-analytics-phase12-contract.test.ts,
MetricCard.tsx, lib/i18n/messages/ru.ts, components/admin/MetricCard.tsx
</read_first>
<behavior>
<read_first>

- lib/analytics/time.ts — MSK primitives (`MSK_OFFSET_MS`, `mskDayLabel`, `mskDateKey`, `mskDayStartInstant`); THE RULE: compute Moscow day in JS, never in SQL; reuse these helpers.
- lib/analytics/service.ts — `windowStartDay(period)`, `loadKpis`, `loadWaterfall`, `loadSparkline`, `loadKeyCacheState`; upper-bound gte→endExclusive fix in every windowed query (D-04 blast radius); payers raw SQL guard at `service.ts:151-156`; doc comment corrected.
- PRIOR ART: `buildDailySeries` / `rollupDays` in `lib/analytics/series.ts` (proven absolute-upsert path).
- lib/artemida.ts — `ArtemidaError`, `ArtemidaCode`, injectable `fetch`/retry options (RETRYABLE, mapStatus); classify 401/402/429-after-retry/502/503/500/504 as degraded; network reason for non-ArtemidaError; no fetch timeout today — defer real AbortSignal.timeout.
- lib/analytics/rollup.ts — absolute-value idempotent upsert (DO UPDATE / DO NOTHING); 12-concurrent-run test; conflict action is the write-guard (D-08).
- lib/analytics/service.ts — per-block try/catch on the RSC page (defense in depth; existing pattern).
- components/admin/MetricCard.tsx — `CARD`/`GRID`/`FUNNEL_GRID`; delta/quality optional props (D-01).
- lib/i18n/messages/ru.ts — existing keys preserved; new keys below added.

<action>
Write the following modules first (Tracer Slice — verified before any expansion task, per MVP/TRACER_MODE):

1. **lib/analytics/windows.ts** — pure module, exported `comparisonWindows(period: 7|30|90, now: Date): {start: string, end: string}[]`. Uses `mskDateKey` / `mskDayLabel` from `time.ts`. Returns exactly two window labels. Inside: `start = mskDateKey(prevStartInstant)`, `end = mskDateKey(endExclusiveInstant)` where endExclusive = startOfToday MSK. Today is in NEITHER window. 7→prev 7 days, 30→prev month (30 calendar days backward from yesterday MSK), 90→prev 90 days (90 calendar days backward from yesterday MSK). Adjacent + equal lengths. Exported helpers: `windowStartDay` updated to use endExclusive.

2. **lib/analytics/compare.ts** — pure module, exported `compareFlow(baseCurr: number, basePrev: number): {status: 'ok'|'no-base'|'incomparable', deltaAbs: number, deltaPct: string}`. Zero base → status `no-base`; abs stays visible; pct → `'—'` + `t('admin.analyticsDeltaNoBase')`. Incompatible coverage → status `incomparable`; abs + pct + baseline suppressed, muted marker shown instead. Formula: `deltaAbs = baseCurr - basePrev`; `deltaPct = Math.round(deltaAbs / basePrev * 100) + '%'` when basePrev > 0, else `'—'`.

3. **lib/analytics/rollup.ts** — write-guard: `upsertDays(days: DailyMetric[])` uses `prisma.daily_metrics.upsert` with `where: { day }, create, update`. Conflict action: healthy run → `DO UPDATE`; degraded run → `ON CONFLICT (day) DO NOTHING`. Pre-seeded healthy row untouched by degraded run. Missing day (never written) → inserts row + records event in `data_quality_events`. 12 concurrent runs invariant: exactly one row per day. Existing test file extended.

4. **lib/analytics/service.ts** — upper-bound fix: every windowed `where` clause changes from `gte` to `lt endExclusive` (D-04). Payers raw SQL at `service.ts:151-156` gets `AND day < $endExclusive`. Doc comment at `service.ts:129-135` updated from "inclusive of today" to "exclusive of today". `loadKpis` excludes any order paid today from denominator.

5. **lib/analytics/metric-registry.ts** — complete registry: every MetricId (MRR, ARR, activeKeys, newUsers, renewOrders, upgradeOrders, providerCostRub, providerCostOrders, goodwillDays, paidOrders, paidCashRub, newOrders, renewOrders, upgradeOrders) with all seven fields: id, labelKey, formula, source, direction, caveats, kind. Labels keep working with `i18n.test.ts` unused-key scan (literal switch preserved).

6. **components/admin/MetricCard.tsx** — delta/quality optional props (D-01). `default` / `compact`: label → value → **delta** → sub. `hero` at `sm+`: value right-aligned; delta row rendered after the value inside a conditional right column `<div className="flex flex-col items-end gap-1">` wrapping the value + delta row; when `delta` is absent the bare value span renders (zero behavioural delta). Quality badge pill in the `sub` position (positioned via CSS `order: 2` or layout slot) when `quality.excluded > 0`.

7. **lib/i18n/messages/ru.ts** — new keys (Russian):
   - `admin.analyticsDeltaBaseWeek` = «к прошлой неделе»
   - `admin.analyticsDeltaBaseMonth` = «к прошлому месяцу»
   - `admin.analyticsDeltaBaseDays` = «к прошлым 90 дням»
   - `admin.analyticsDeltaNoBase` = «нет базы»
   - `admin.analyticsDeltaIncomparable` = «сравнение недоступно»
   - `admin.analyticsDataIncomplete` = «Данные неполные (N)»
   - `admin.analyticsNoBase` = «Нет базы» (alternative form)
   - `admin.analyticsIncomparable` = «Сравнение недоступно» (alternative form)

8. **tests/unit/analytics-windows.test.ts** — window identity: same fromInstant as loadKpis(30); today excluded from both windows; 7/30/90 adjacency + equal lengths; MSK boundary asserts.

9. **tests/unit/analytics-compare.test.ts** — compareFlow all four outcomes (`ok` / `no-base-zero` / `no-base-absent` / `incomparable`); percent formatting helper; zero base: pct → `'—'`, abs stays; incomparable: muted marker replaces all numbers, no fake 0.

10. **tests/unit/analytics-quality.test.ts** — classifier taxonomy: 401/402/429-after-retry/502/503/500/504 as degraded; rejects 404/409/unknown@200; network reason for non-ArtemidaError; in-window open-event summary.

11. **tests/unit/analytics-rollup-guard.test.ts** — healthy overwrites / degraded preserves healthy / degraded inserts into hole / concurrency (12 concurrent runs, exactly one row per day, invariant).

12. **tests/unit/admin-analytics-phase12-contract.test.ts** — MetricCard accepts optional `delta`/`quality` props; existing call sites visually unchanged (no prop added = identical output).

</action>
<verify>
<automated>npx vitest run tests/unit/analytics-windows.test tests/unit/analytics-compare.test tests/unit/analytics-quality.test tests/unit/analytics-rollup-guard.test tests/unit/admin-analytics-phase12-contract.test tests/unit/metric-registry.test</automated>
<fails_when>non-zero exit, OR any test file has zero passing matches, OR a test assertion that was previously green turns red (regression).</fails_when>
</verify>
<done>
`comparisonWindows(7|30|90, now)` returns exact two windows excluding today; `compareFlow` all four outcomes; degraded rollup write-guard preserves healthy rows; `MetricCard` optional delta/quality; metric registry complete; i18n test passes unchanged.
</done>
</task>

### <task type="auto">
<name>Click/IP capture + referral generalization + cron sweep + IP hardening</name>
<files>
lib/referral-stats.ts, lib/client-ip.ts, app/api/referrals/click/route.ts,
app/api/referrals/pin/route.ts, tests/unit/referral-clicks.test.ts,
tests/unit/analytics-ip-capture.test.ts, tests/unit/client-ip.test.ts,
prisma/schema.prisma, scripts/backfill-click-retention.ts
</read_first>
<behavior>
<read_first>

- lib/referral-stats.ts — `recordClick` (hourly per-IP dedupe, `hashIp`), `funnelStats` global `ownerFilter = {}`; generalized to also count `kind='promo'` rows when `ownerUserId` is null; hourly dedupe unchanged (same ms as existing).
- lib/client-ip.ts — `clientIp()` resolution order + `"direct"` fallback; new `hashClientIp` helper that returns `null` when `clientIp() === "direct"`; never hash `"direct"`.
- lib/referral-stats.ts — generalized `ReferralClick`: `ownerUserId` nullable, `promoCodeId` nullable, `kind` ∈ {referral, promo} (D-11). One table, one funnel for all codes.
- app/api/referrals/click/route.ts — generalized to accept body `{ code, kind?: 'referral'|'promo', promoCodeId?: string }` (backward-compatible; existing `{ code }` passes through); always 200, no oracle (existing contract).
- app/api/referrals/pin/route.ts — new route mirroring click behavior for `?ref=CODE` links from shared referral links; also always 200.
- User model: `signupIpHash` sha256 of normalized IP (first non-"direct" IP from XFF/real-ip headers); `trialIpHash` sha256 stored at trial claim (D-14). `"direct"` → `null` stored in both fields. Literal `clientIp() === "direct"` check at claim time.
- retention: 13 months + nightly cron sweep (D-13).
- test vectors: promo kind, hourly dedupe, `"direct"` rejection, funnel-scope isolation.

<action>
Write the following modules / updates (Auto task — supporting infrastructure for PRM-01/PRM-04 capture-only groundwork):

1. **lib/client-ip.ts** — `hashClientIp(clientIpResult)` returns `null` when `clientIp() === "direct"`; otherwise returns `sha256(ip)` hex; existing `hashIp` unchanged for non-direct IPs; documentation updated with `"direct"` exclusion rule.

2. **lib/referral-stats.ts** — generalized ReferralClick model: `ownerUserId` nullable, `promoCodeId` nullable, `kind` ∈ {referral, promo}. `recordClick` signature: `recordClick(ownerUserId: Int | null, promoCodeId: string | null, code: string, kind: 'referral'|'promo', ipHash: string)`. Hourly dedupe logic preserved (same 1-hour window by ipHash). `funnelStats` updated: global `ownerFilter = { kind, ownerUserId? }` so promo clicks with null `ownerUserId` are included in the global count; referral clicks with `ownerUserId` set included when `kind === 'referral'`.

3. **app/api/referrals/click/route.ts** — generalized body schema: `code: z.string().trim().min(1).max(32)`, `kind: z.enum(['referral', 'promo']).optional()`, `promoCodeId: z.string().trim().max(32).optional()`. Always 200. If `ownerUserId` can be resolved (referral code lookup) → set `ownerUserId`, `kind = 'referral'`, `promoCodeId = null`. If generic code → `ownerUserId = null`, `kind = 'promo'`, `promoCodeId = code`. IP hash computed via `hashClientIp(req)`; dedupe check: hourly per ipHash.

4. **app/api/referrals/pin/route.ts** — new route handler (mirror of click): body `{ code }` always 200; pins `?ref=CODE` to session account once; generic codes set `kind='referral'`; promo codes set `kind='promo'`.

5. **tests/unit/referral-clicks.test.ts** — promo kind vectors: `kind='promo'` rows counted in funnel; hourly dedupe test with ipHash; `"direct"` IP rejection test; 13-month retention sweep (delete rows older than cutoff, keep inside); funnel-scope isolation assertion.

6. **tests/unit/analytics-ip-capture.test.ts** — register `signupIpHash` (sha256, first IP stored, subsequent writes never overwrite — forward-only); trial `trialIpHash` atomicity assertion (losing re-claim with different IP does not overwrite); `"direct"` → `null` stored in both fields; merge/release semantics test.

7. **tests/unit/client-ip.test.ts** — `clientIp()` behavior: "direct" is last fallback; `hashClientIp("direct")` returns null; never hashed into ipHash.

8. **prisma/schema.prisma** — ReferralClick model updated: `ownerUserId Int?` (was NOT NULL → now nullable), `promoCodeId String?` added, `kind String` added with default `'referral'`. User model updated: `signupIpHash String` (sha256, NOT NULL, default generated on migration), `trialIpHash String` added (sha256, nullable). Migration: `npx prisma migrate deploy` creates the migration; existing ReferralClick rows default `kind='referral'`, `ownerUserId` kept if previously populated, otherwise null.

9. **scripts/backfill-click-retention.ts** — nightly cron: delete ReferralClick rows older than 13 months (computed via `addMonths(now, -13)`); retains rows inside window; idempotent under concurrent runs.

</action>
<verify>
<automated>npx vitest run tests/unit/referral-clicks.test tests/unit/analytics-ip-capture.test tests/unit/client-ip.test</automated>
<fails_when>non-zero exit, OR any test file has zero passing matches, OR the "direct" → null assertion fails, OR promo kind count is wrong in funnelStats.</fails_when>
</verify>
<done>
`signupIpHash` / `trialIpHash` stored sha256, "direct" → null; 13-month retention sweep works; promo kind in funnelStats; hourly dedupe preserved; referral_clicks generalized (ownerUserId nullable + kind + promoCodeId).
</done>
</task>

### <task type="auto">
<name>Cron analytics 03:05 + data-quality + metric registry finalization</name>
<files>
app/api/cron/analytics/route.ts, lib/analytics/rollup.ts, lib/analytics/service.ts,
lib/time.ts, tests/unit/analytics-cron-route.test.ts, data_quality_events.sql
</read_first>
<behavior>
<read_first>

- app/api/cron/analytics/route.ts — 3-day retry window + event closure + click retention sweep (D-09); 7-day re-roll already exists (cron/analytics/route.ts:47-48); new: close open degraded events after a healthy re-roll; sweep ReferralClick older than 13 months (from task Auto task #2); idempotent under concurrent runs.
- lib/analytics/service.ts — `windowStartDay` updated (D-04); loadKpis updated (D-04); doc comments corrected.
- lib/analytics/rollup.ts — write-guard (D-08): ON CONFLICT DO NOTHING for degraded; DO UPDATE for healthy; missing-day insert + event record.
- lib/time.ts — MSK primitives unchanged but referenced; `mskDateKey` used by windows and cron; `mskDayLabel` for window labels; `addMonths` for 13-month arithmetic.
- data_quality_events.sql — new table migration script; forward-only; append-only; columns: id, source, reason, detail, msk_day, createdAt, resolvedAt (nullable); one row per degraded event per day; open event has resolvedAt IS NULL.
- tests/unit/analytics-cron-route.test.ts — spy on rollupDays; assert 3-day retry window + event closure; assert click retention sweep; assert idempotent concurrent runs.

<action>
Write the following updates (Auto task #3 — cron + data quality finalization):

1. **app/api/cron/analytics/route.ts** — 
   - Existing 7-day re-roll preserved (cron analytics route.ts:47-48).
   - New: after a healthy re-roll, close any open `data_quality_events` for the re-rolled days (set `resolvedAt = now()`).
   - New: 13-month ReferralClick retention sweep (DELETE FROM referral_clicks WHERE createdAt < addMonths(now(), -13)).
   - New: 3-day event closure window: days with open degraded events from the last 3 MSK days are re-checked; if the provider call now succeeds, event is closed; if not, left open (D-09).
   - Existing: safeEq gate, 503-when-unset, lazy imports.
   - All calls wrapped in p-retry (429/502/503 honoring Retry-After header).

2. **data_quality_events.sql** — migration script (forward-only, append-only):
   - `CREATE TABLE data_quality_events (...)` columns: id UUID primary key, source String NOT NULL, reason String NOT NULL (enum: timeout|5xx|429|401|402|network), detail String (nullable, no provider secrets), msk_day Date NOT NULL, createdAt Timestamptz NOT NULL DEFAULT now(), resolvedAt Timestamptz NULL.
   - Index on msk_day + resolvedAt for time-window queries.
   - Row-level security: admin role can SELECT/INSERT; no DELETE (append-only).

3. **lib/analytics/rollup.ts** — 
   - Write-guard preserved from Tracer task (D-08).
   - Degraded event recording: when upsert yields DO NOTHING (degraded run), also `prisma.data_quality_events.create({data: {source, reason, msk_day, ...}})`.
   - Missing-day insert: when day had no data at all, upsert creates row + event.

4. **lib/time.ts** —
   - `addMonths(date, months)`: calendar-month arithmetic (not 13 × 30 days); used by 13-month retention sweep and metric registry kind windows.

5. **tests/unit/analytics-cron-route.test.ts** —
   - Spy on `rollupDays` and assert the 3-day retry window + event closure arguments.
   - Assert ReferralClick 13-month retention sweep called.
   - Assert idempotent concurrent runs (same invariant as rollup test).

</action>
<verify>
<automated>npx vitest run tests/unit/analytics-cron-route.test</automized>
<fails_when>non-zero exit, OR cron route has zero passing matches, OR 3-day retry window not in output, OR click retention sweep not called.</fails_when>
</verify>
<done>
Cron 03:05: 3-day retry window, event closure, 13-month click sweep; data_quality_events append-only table schema; rollupDays spy assertions pass.
</done>
</task>
</tasks>

### <threat_model>
*See the `<threat_model>` block above under **STRIDE Threat Register** — same content, included for completeness in the PLAN.md.*
</threat_model>

### <verification>
- `npx vitest run tests/unit/analytics-windows.test tests/unit/analytics-compare.test tests/unit/analytics-quality.test tests/unit/analytics-rollup-guard.test tests/unit/admin-analytics-phase12-contract.test tests/unit/metric-registry.test` — full suite green.
- `npx vitest run tests/unit/referral-clicks.test tests/unit/analytics-ip-capture.test tests/unit/client-ip.test` — capture tests green.
- `npx vitest run tests/unit/analytics-cron-route.test` — cron route green.
- `npx tsc --noEmit` — exit 0 (no type errors across changed TS files).
- `npm run build` — Next build succeeds (typechecks RSC/page/route files and the metric-registry/label wiring).
- Manual two-user reproduction from VERIFICATION.md (Phase 12 analog): after `revalidateKeys`-style revalidation with provider list containing another user's key, the metric rollup leaves the caller's cache unchanged (write-guard) and the comparison windows exclude today from both sides.
- `data_quality_events` append-only table: INSERT only, no public delete surface; admin can SELECT.

### <success_criteria>
- ALR-01: Every analytics metric on `/admin/analytics` shows WoW/MoM delta (abs + %) with correct zero-base behavior («—» + «нет базы») and `incomparable` when coverage insufficient; comparison on MSK boundaries; today excluded from both windows.
- EXT-05: Degraded ARTEMIDA responses (timeout / 5xx after p-retry / 429 exhausted / 401/402) flagged; `data_quality_events` append-only; rollup write-guard preserves healthy daily_metrics rows; any in-window event → badge «данные неполные (N)» in UI; zero threshold; no partial state.
- PRM-01 (capture-only groundwork): Generalized `referral_clicks` (ownerUserId nullable + promoCodeId + kind referral|promo); hourly per-ipHash dedupe; 13-month retention + nightly cron; User.signupIpHash + User.trialIpHash (sha256, "direct" → null); click beacon always 200, no oracle.
- PRM-04 (capture-only groundwork): `signupIpHash` at registration, `trialIpHash` at trial claim; raw IP never stored; `"direct"` excluded from hashing; 13-month retention.
- EXT-05 / D-15: `lib/analytics/metric-registry.ts` contains every MetricId with all seven non-empty fields; `i18n.test.ts` passes unchanged (literal switch preserved).
- Zero new npm dependencies.
- `workflow.ui_safety_gate: true` — UI-SPEC approved before planner proceeds.
- PLAN.md + UI-SPEC.md + VALIDATION.md + CONTEXT.md all present and committed.

### <artifacts_this_phase_produces>
- `lib/analytics/windows.ts` — pure comparison windows module (end-exclusive, MSK, today excluded).
- `lib/analytics/compare.ts` — pure compare flow (ok / no-base / incomparable).
- `lib/analytics/rollup.ts` — write-guard (DO NOTHING / DO UPDATE, conflict action).
- `lib/analytics/service.ts` — windowed loaders updated (D-04: endExclusive throughout).
- `data_quality_events` table migration (forward-only, append-only).
- `lib/referral-stats.ts` — generalized ReferralClick (ownerUserId nullable + promoCodeId + kind).
- `lib/client-ip.ts` — `hashClientIp` → null for "direct"; never hash direct.
- `User` model: `signupIpHash`, `trialIpHash` (sha256).
- `prisma/schema.prisma` — ReferralClick updated + User ipHash columns; migration.
- `scripts/backfill-click-retention.ts` — 13-month click retention sweep.
- `app/api/referrals/click/route.ts` — generalized body (promo kind support).
- `app/api/referrals/pin/route.ts` — new pin route (mirror of click).
- `lib/i18n/messages/ru.ts` — new Russian copy keys.
- `components/admin/MetricCard.tsx` — delta/quality optional props + quality badge.
- `tests/unit/analytics-windows.test.ts` — window identity + today exclusion.
- `tests/unit/analytics-compare.test.ts` — compareFlow all outcomes.
- `tests/unit/analytics-quality.test.ts` — classifier taxonomy.
- `tests/unit/analytics-rollup-guard.test.ts` — write-guard branches.
- `tests/unit/admin-analytics-phase12-contract.test.ts` — MetricCard optional delta/quality.
- `tests/unit/metric-registry.test.ts` — registry complete.
- `tests/unit/referral-clicks.test.ts` — promo kind, dedupe, "direct", retention.
- `tests/unit/analytics-ip-capture.test.ts` — IP capture atomicity.
- `tests/unit/client-ip.test.ts` — "direct" exclusion.
- `tests/unit/analytics-cron-route.test.ts` — cron 3-day + retention.
- `app/api/cron/analytics/route.ts` — 3-day re-roll + event closure + click sweep.
- `lib/analytics/metric-registry.ts` — complete registry.
</artifacts_this_phase_produces>

<output>
Create `.planning/phases/12-period-comparison-data-quality-foundation/12-PLAN.md` (PLAN complete).
Commit PLAN.md and present Next Up (`/gsd-execute-phase 12`).
</output>