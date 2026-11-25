# Phase 12: Period Comparison & Data-Quality Foundation - Pattern Map

**Mapped:** 2026-11-01
**Files analyzed:** 24 new/modified files (source + tests + migration, incl. grouped touches)
**Analogs found:** 20 / 23

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `lib/analytics/windows.ts` | service (pure module) | transform | `lib/analytics/time.ts` + `lib/analytics/series.ts` | exact |
| `lib/analytics/compare.ts` | service (pure module) | transform | `lib/analytics/economics.ts` + `lib/analytics/mrr.ts` | exact |
| `lib/analytics/metric-registry.ts` | service (pure registry) | transform | `lib/analytics/funnel.ts` (+ `components/admin/FunnelCards.tsx`) | exact / role-match |
| `lib/analytics/quality.ts` | service (pure classifier + write seam) | event-driven | `lib/artemida.ts` (classify) + `lib/analytics/rollup.ts` (record) | exact / partial |
| `lib/ip-hash.ts` | service (pure module) | transform | `lib/referral-stats.ts` + `lib/client-ip.ts` | exact |
| `prisma/migrations/<ts>_phase12_data_quality_and_ip_hashes/` | migration | batch-write | `prisma/migrations/20261031113119_phase11_user_rfm` | exact (shape conventions) |
| `tests/unit/analytics-windows.test.ts` | test (pure) | transform | `tests/unit/analytics-time.test.ts` + `tests/unit/analytics-series.test.ts` | exact |
| `tests/unit/analytics-compare.test.ts` | test (pure) | transform | `tests/unit/analytics-series.test.ts` | exact |
| `tests/unit/analytics-quality.test.ts` | test (pure + seam) | event-driven | `tests/unit/analytics-rollup.test.ts` + `lib/artemida.ts` | exact / partial |
| `tests/unit/analytics-rollup-guard.test.ts` | test (DB) | batch-write | `tests/unit/analytics-rollup.test.ts` | exact |
| `tests/unit/analytics-phase12-loaders.test.ts` | test (DB) | CRUD-read | `tests/unit/analytics-phase8-loaders.test.ts` | exact |
| `tests/unit/analytics-v11-regression.test.ts` | test (DB) | regression | `tests/unit/analytics-phase8/9/10/11-loaders.test.ts` | exact / partial |
| `tests/unit/referral-clicks.test.ts` | test (DB) | event-driven | `tests/integration/funnel.test.ts` + `tests/unit/analytics-rollup.test.ts` | exact |
| `tests/unit/analytics-ip-capture.test.ts` | test (DB) | CRUD-write | `tests/unit/trial-claim.test.ts` | exact |
| `tests/unit/metric-registry.test.ts` | test (pure) | transform | `tests/unit/i18n.test.ts` + `tests/unit/analytics-funnel.test.ts` | role-match |
| `tests/unit/admin-analytics-phase12-contract.test.ts` | test (contract, source-pins) | transform | `tests/unit/admin-analytics-phase9-contract.test.ts` | exact |
| `lib/analytics/service.ts` | service | CRUD-read | itself (`windowStartDay`, gte-only queries) | exact |
| `lib/analytics/rollup.ts` | service | batch-write | itself (DO NOTHING balance precedent) | exact |
| `lib/referral-stats.ts` | service | event-driven / CRUD | itself (`recordClick`, `funnelStats`) | exact |
| `lib/keys-service.ts` | service | CRUD-write | itself (`claimTrial` updateMany) | exact |
| `app/api/cron/analytics/route.ts` | route | event-driven / batch | itself (`safeEq`, lazy imports, logger) | exact |
| `components/admin/MetricCard.tsx` | component | transform (render) | itself (+ UI-SPEC) | exact |
| `lib/i18n/messages/ru.ts` | i18n / config | transform | itself (`admin.analytics*`) | exact |
| `prisma/schema.prisma` | model | CRUD-write | itself (`ReferralClick`, `DailyMetric`, `User`) | exact / partial |
| `app/api/auth/email/register/route.ts`, `app/api/auth/telegram/route.ts`, `app/api/auth/telegram-bot/consume/route.ts`, `app/api/trial/route.ts` | route | CRUD-write / event-driven | themselves + `lib/telegram-login.ts`, `lib/keys-service.ts` | exact |
| `app/api/referrals/click/route.ts` | route | event-driven / CRUD | itself + `lib/referral-stats.ts` | exact |
| `components/admin/AnalyticsKpi.tsx`, `LtvCards.tsx`, `MarginCards.tsx`, `BurnRunwayCards.tsx`, `RetentionCards.tsx`, `FunnelCards.tsx`, `ExpiredCards.tsx`, `ErrorTable.tsx`, `TimeToPayCards.tsx`, `TimeToProvisionCards.tsx`, `ChurnTable.tsx`, `CohortMatrix.tsx`, `MrrWaterfall.tsx`, `MrrSparkline.tsx` | component | transform (render) | themselves (MetricCard consumers) | exact |
| `app/admin/analytics/page.tsx` | route (RSC) | CRUD-read / request-response | itself (period normalization) | exact |
| `tests/unit/analytics-rollup.test.ts`, `analytics-cron-route.test.ts`, `trial-claim.test.ts`, `client-ip.test.ts`, `i18n.test.ts`, `analytics-phase8/9/10/11-loaders.test.ts`, `admin-analytics-phase9-contract.test.ts` | test | various | themselves | exact |

## Pattern Assignments

### `lib/analytics/windows.ts` — NEW (pure comparison-window derivation)

**Analog:** `lib/analytics/time.ts` (MSK primitives) + `lib/analytics/series.ts` (`nextDayLabel`)

**Imports pattern** (from `lib/analytics/series.ts:22` and `:69-74`):
```ts
import { mskDayLabel, mskDayStartInstant } from "./time";
const DAY_MS = 86_400_000;
export function nextDayLabel(label: string): string {
  return new Date(Date.parse(`${label}T00:00:00.000Z`) + DAY_MS).toISOString().slice(0, 10);
}
```

**Core pattern:** pure module, no Prisma / no `next/*` / no `Date.now()`; take `now: Date` as a parameter; export a `Window` interface (`fromDay` inclusive, `toDay` inclusive, `fromInstant` = `mskDayStartInstant(fromDay)` for timestamp `gte`, `endExclusive` = `mskDayStartInstant(mskDayLabel(toDay + 1))` for timestamp `lt`); export `lastCompleteDay(now)` and `comparisonWindows(period, now)` returning `{ current, base }`.

**Error handling / purity:** pure derivation only — no I/O, no logging; fully unit-testable without a DB (research Pattern 1, E1).

### `lib/analytics/compare.ts` — NEW (pure delta computation)

**Analog:** `lib/analytics/economics.ts` (division guards) + `lib/analytics/mrr.ts` (`computeArpu`)

**Core pattern:** pure arithmetic over two numbers; exact rationals, no rounding in the module (whole-ruble `Math.round` and percent formatting live only in render components — `lib/analytics/economics.ts:14-17`); division guard house style `denominator === 0 ? null : …`, never `value || 0`.

**Error handling / purity:** pure module; returns a discriminated union:
```ts
export type MetricDelta =
  | { status: 'ok'; abs: number; pct: number | null; current: number; base: number }
  | { status: 'no-base'; abs: number; pct: null; current: number; reason: 'zero' | 'absent' }
  | { status: 'incomparable'; reason: 'degraded-base' | 'degraded-current' | 'coverage' };
```

### `lib/analytics/metric-registry.ts` — NEW (metric dictionary)

**Analog:** `lib/analytics/funnel.ts:69-71` (`FUNNEL_STEPS` const + `FunnelStep` union) and `components/admin/FunnelCards.tsx:23-34` (literal `switch` for i18n labels — the Phase 9 pattern that survives the unused-key scan).

**Core pattern:** `MetricId` as a union of string literals; `METRIC_REGISTRY: Record<MetricId, MetricDescriptor>` with fields `id`, `labelKey`, `formula`, `sources`, `direction`, `kind`, `unit`, `limitations`. `kind: 'flow' | 'stock'` drives delta semantics (research Pattern 4).

**⚠️ i18n hazard (Pattern 10):** a registry-held `labelKey` rendered via `t(descriptor.labelKey)` leaves no literal `t('…')` call site, so `tests/unit/i18n.test.ts:37-58` (`collectUsedKeys` regex `/\bt\(\s*['"]([A-Za-z0-9_.]+)['"][^)]*\)/g`) flags the key as unused. Planner must either (i) extend the scan with a `labelKey:` regex or (ii) keep a literal `metricLabel(id)` switch (Phase 9 `FunnelCards.funnelStepLabel` precedent).

### `lib/analytics/quality.ts` — NEW (degrade classifier + in-window summarizer)

**Analog:** `lib/artemida.ts:21-42` (`ArtemidaCode` union + `ArtemidaError`), `lib/artemida.ts:58-62` (`RETRYABLE` set), `lib/artemida.ts:90-112` (`mapStatus` switch); recording seam from `lib/analytics/rollup.ts:116-131` (try/catch → `logger.warn`).

**Core pattern:** pure `classifyDegraded(err: unknown): DegradedReason | null` over the full `ArtemidaCode` union + non-`ArtemidaError` (network) throws; 404/`conflict` → not degraded (business outcomes, D-06); 5xx (`unknown` + `status >= 500`) → degraded; `unknown@200` (schema mismatch) → deliberately NOT degraded. Recording helper writes append-only `data_quality_events` and swallows errors so observability never breaks the caller; read path uses `void recordIfDegraded`, cron path `await`.

### `lib/ip-hash.ts` — NEW (client-IP → account/click IP hash)

**Analog:** `lib/referral-stats.ts:27-29` (`hashIp` via `createHash("sha256").update(ip).digest("hex")`) + `lib/client-ip.ts:26-28` (`clientIp` returning `"direct"` sentinel).

**Core pattern:** `hashClientIp(ip: string): string | null` returns `null` for the `DIRECT_IP` literal (D-14: never hash `"direct"`); otherwise sha256 hex. New shared module keeps the primitive pure (`node:crypto` only, no env/headers/DB) so it is importable from vitest node env.

### `lib/analytics/service.ts` — MODIFIED (windowed loaders gain upper bound + both windows)

**Analog:** itself (`lib/analytics/service.ts:120-123` `windowStartDay`, `:136-180` `loadKpis`, `:143-156` windowed query + payers raw SQL).

**Core pattern:** replace the private `windowStartDay(period)` (`Date.now()`-based) with the pure `comparisonWindows(period, now)` from the new `lib/analytics/windows.ts`; pass both `current`/`base` windows into loaders; every windowed query becomes `{ gte: fromInstant, lt: endExclusive }`; the payers raw SQL becomes `AND paid_at >= ${pgTimestamp(fromInstant)} AND paid_at < ${pgTimestamp(endExclusive)}` (`lib/analytics/service.ts:151-156`).

**Error handling / serialization:** keep the serialization guard (raw SQL `::int` cast, `lib/analytics/service.ts:148-156`) and the MSK discipline (`mskDayStartInstant` for timestamp windows, `mskDateKey` for `@db.Date`, `pgTimestamp` for raw SQL — `lib/analytics/time.ts:9-15`).

### `lib/analytics/rollup.ts` — MODIFIED (write-guard via conflict action)

**Analog:** itself (`lib/analytics/rollup.ts:89-113` `ON CONFLICT (day) DO UPDATE`, `:116-131` balance snapshot `ON CONFLICT (day) DO NOTHING`).

**Core pattern:** per-day degraded decision computed once via `openDegradedDays(fromDay, toDay, source)` (open events only); healthy day → existing absolute `ON CONFLICT (day) DO UPDATE SET … EXCLUDED`; degraded day → `ON CONFLICT (day) DO NOTHING`. Two separate `$executeRaw` templates (a template cannot parameterize a conflict clause).

### `app/api/cron/analytics/route.ts` — MODIFIED (3-day retry window, event closure, retention sweep)

**Analog:** itself (`app/api/cron/analytics/route.ts:16-26` `safeEq`, `:29-51` lazy imports + window, `:50-53` rollup call + logger).

**Core pattern:** timing-safe secret compare (`safeEq`), lazy imports to keep `lib/env` out of the build graph, `export const dynamic = "force-dynamic"`, `Response.json({ ok: true, ...result })`. New steps: close open events after a healthy re-roll, keep >3-day-old events open for `scripts/backfill-analytics.ts`, and delete `referral_clicks` older than 13 months (`deleteMany({ where: { createdAt: { lt: thirteenMonthsAgo } } }`).

### `lib/referral-stats.ts` — MODIFIED (click generalization + funnel scope)

**Analog:** itself (`lib/referral-stats.ts:36-53` `recordClick`, `:65-80` `funnelStats`).

**Core pattern:** generalize `recordClick` behind a `ClickInput` (`kind: 'referral' | 'promo'`, `ownerUserId?`, `promoCodeId?`, `code`, `ip`, `source`); dedupe predicate becomes `{ ipHash, kind, createdAt: { gt: hourAgo } }`; funnelStats global branch must add `{ kind: 'referral', ...ownerFilter }` so promo clicks do not inflate the referral funnel (research Pattern 8 / Pitfall 6).

### `lib/keys-service.ts` — MODIFIED (atomic trial IP capture)

**Analog:** itself (`lib/keys-service.ts:448-454` `claimTrial`, `:475-481` `claimTrialByUserId`).

**Core pattern:** `claimTrial(telegramId, ipHash?: string | null)` writes via ONE `updateMany`:
```ts
const { count } = await prisma.user.updateMany({
  where: { telegramId, trialUsed: false },
  data: { trialUsed: true, ...(ipHash ? { trialIpHash: ipHash } : {}) },
});
return count === 1;
```
Conditional spread keeps the column untouched when there is no real IP.

### `components/admin/MetricCard.tsx` — MODIFIED (delta + quality props, D-01)

**Analog:** itself (props `{ label, value, sub, size }`) + `components/admin/AnalyticsKpi.tsx` (current `MetricCard` consumer).

**Core pattern:** additive optional props `delta?: MetricDelta; quality?: MetricQuality;` — absent props render byte-identical output (no existing call site rewrites). Delta row anatomy (UI-SPEC): `flex flex-wrap items-baseline gap-x-2 gap-y-1`; abs cell `text-sm font-semibold tabular-nums text-foreground`; pct cell same class; baseline cell `text-xs text-muted`; hero variant renders delta in a right column.

**Error handling / a11y:** no red/green semantics — sign via explicit `+` / `−` character + magnitude in neutral tokens; badge is plain visible text (`t('admin.analyticsDataIncomplete', { n })`) with reason/events in the native `title` attribute; no new interactive elements.

### `lib/i18n/messages/ru.ts` — MODIFIED (delta / quality copy)

**Analog:** itself (existing `admin.analytics*` keys, lines ~395-517).

**Core pattern:** all user-facing copy in Russian lives here; keys resolved only through typed `t()` / `tp()`; `{n}` interpolation (`t('admin.analyticsDataIncomplete', { n })`); new keys — `admin.analyticsDeltaBaseWeek`, `admin.analyticsDeltaBaseMonth`, `admin.analyticsDeltaBaseDays`, `admin.analyticsDeltaNoBase`, `admin.analyticsDeltaIncomparable`, `admin.analyticsDataIncomplete`.

### `prisma/schema.prisma` — MODIFIED + new migration (data-quality event log, click generalization, IP hashes)

**Analog:** itself (`ReferralClick` `prisma/schema.prisma:546-557`, `User.trialUsed` `:83-88`, `DailyMetric` `:600-615`).

**Core pattern:** `data_quality_events` append-only (source, MSK day as `DateTime @db.Date` + `mskDateKey` write, reason, detail without secrets, open flag/`resolvedAt`); `ReferralClick.ownerUserId Int?` + `kind String @default("referral")` + `promoCodeId String?`; `User.signupIpHash` / `User.trialIpHash`. Migration must sort after `20261031113119_phase11_user_rfm` (timestamp prefix).

### Route files modified — pattern per surface

- **Public click beacon** (`app/api/referrals/click/route.ts`): zod body → 400 `bad_request`; try/catch → generic 500 + `logger`; ALWAYS `200` with no oracle for unknown codes; `source` slice `source.slice(0, 32)`.
- **Register** (`app/api/auth/email/register/route.ts`): `clientIp(req)` → `hashClientIp` → `signupIpHash` conditional on `prisma.user.create` data.
- **Telegram auth** (`app/api/auth/telegram/route.ts`) and **bot consume** (`app/api/auth/telegram-bot/consume/route.ts` + upsert in `lib/telegram-login.ts:317-322`): `signupIpHash` on the account-creation upsert branch only.
- **Trial** (`app/api/trial/route.ts`): compute `ipHash` from `clientIp(req)`, pass into `startTrial` / `startTrialByUserId`.

## Shared Patterns

### Authentication / authorization
- `lib/admin-auth.ts` (`requireRole`, `NAV_SECTIONS` counterpart, `can`) + defense-in-depth re-check in `app/admin/analytics/page.tsx` (`requireRole('administrator', 'manager')`, `dynamic = 'force-dynamic'`).
- Public click beacon is unauthenticated by design (read path only); never exposed via admin API.
- Cron: `x-cron-secret` timing-safe compare (`app/api/cron/analytics/route.ts:16-26`).

### Error handling
- Typed provider errors: `ArtemidaError` + `ArtemidaCode` union (`lib/artemida.ts:21-42`); callers branch on `code`, never provider text (D-19).
- Fire-and-forget observability: degrade recording try/catch swallows → `logger.warn`/`logger.info` with `route`/`outcome` keys.

### Validation
- zod schemas at every external boundary (`app/api/referrals/click/route.ts:13-16`); `?period` normalization to `7 | 30 | 90` in `app/admin/analytics/page.tsx:90-92`.

### Money / formatting / exactness
- Pure modules keep exact rationals and null-on-zero denominators; rendering owns `Intl.NumberFormat('ru-RU')`, `Math.round`, percent ×100 / one-fraction-digit formatting (`components/admin/AnalyticsKpi.tsx:17-18`, `components/admin/LtvCards.tsx:16-17`).

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `prisma/schema.prisma` `DataQualityEvent` model | model | batch-write | No append-only event/audit table exists yet; closest shape is `ArtemidaBalanceSnapshot` (upsert-first-wins) — the append-only semantics are new. |
| MoM "calendar month" comparison definition | service (pure) | transform | No code analog; adjacent-equal-length window (A1) was chosen over calendar-month reading (research Open Q1). |
| Quality-event "open vs resolved" state representation | service (pure) | event-driven | `resolvedAt` flag vs open-flag is a product decision (CONTEXT discretion) with no code precedent. |

## Metadata

**Analog search scope:** `lib/analytics/**`, `lib/{artemida,referral-stats,keys-service,client-ip,...}.ts`, `lib/telegram-login.ts`, `lib/bot.ts`, `components/admin/**`, `app/api/**`, `app/admin/**`, `tests/unit/**`, `tests/integration/**`, `prisma/schema.prisma`, `prisma/migrations/`, `docs/DEPLOY.md`, `lib/i18n/messages/ru.ts`.
**Files scanned:** ~120 source/test files relevant to the phase surface.
**Pattern extraction date:** 2026-11-01
