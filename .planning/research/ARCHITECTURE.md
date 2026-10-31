# Architecture Research — v1.2 integration design

**Domain:** Analytics/reporting additions to an existing single-server Next.js 16 App Router product (VPN subscriptions, RU/RUB)
**Researched:** 2026-10-31
**Confidence:** HIGH for integration points and layering (read directly from the codebase); MEDIUM for schema shape of the two new tables (design judgement, aligns with existing table conventions); LOW for the promo-click data gap resolution (product decision required).

**Scope:** NEW features only. Existing v1.1 architecture (thin BFF over ARTEMIDA, `lib/analytics/*` pure modules + `service.ts` loaders, `daily_metrics`/`user_rfm`/`artemida_balance_snapshots`, cron routes gated by `CRON_SECRET`, outbox + `Notification` delivery, RSC admin pages) is taken as given.

## Executive Summary

Every v1.2 feature fits the existing three-layer discipline **pure module → DB loader → RSC page/cron route**. No new architectural concept is required. The two hard constraints that shape the design:

1. `lib/analytics/*.ts` (except `service.ts`/`rfm-service.ts`) are **pure** — no `prisma`, no `next/*`, no React. Every new derivation must live in a pure module with unit tests, and every new DB read must live in a `*-service.ts`.
2. Money/analytics numbers are **never re-derived in components, never SQL-side bucketed, never MSK-shifted inline**. `lib/analytics/time.ts` is the only calendar authority, `series.ts#cashOf` the only cash authority.

Three genuinely new pieces of state are needed, and only three:

- `alert_events` — alert history + dedupe + auditable thresholds-in-effect. `Setting` alone cannot satisfy "админ видит историю" or "не спамит".
- `data_quality_events` — append-only degraded-response log per source/day/reason, needed to answer "сколько записей исключено" and to keep `daily_metrics` a pure value table.
- `promo_clicks` — promo-code click beacon. **Data gap found:** `ReferralClick` only records referral-code clicks (`ownerUserId` is required and the route resolves `User.referralCode`), so promo-code click→register→pay funnels (PRM-01) have no top-of-funnel source today. This capture is forward-only, so it must ship *earlier* than the report that consumes it.

Everything else is additive: `Setting` keys (following the existing `rfm.threshold.*` precedent), a `MetricCard` delta/quality slot, one cron route (`/api/cron/alerts`), one export route (`/api/admin/export/[report]`), and one dictionary page.

## Standard Architecture

### System Overview

```
┌───────────────────────────────────────────────────────────────────────┐
│ Presentation — RSC pages + client islands (app/admin/**, components)  │
│  /admin/analytics · /admin/retention · /admin/promos · /admin/referrals│
│  /admin/analytics/dictionary · <a download> CSV links                 │
└───────────────┬───────────────────────────────────────────────────────┘
                │ server-side calls only (no fetch from the browser)
┌───────────────▼───────────────────────────────────────────────────────┐
│ Loaders — the ONLY DB readers for a report (*-service.ts)             │
│  service.ts · rfm-service.ts · NEW: compare/quality/alerts/growth/    │
│  actions service modules · lib/referral-stats.ts · lib/revenue.ts     │
└───────────────┬───────────────────────────┬───────────────────────────┘
                │ plain rows                │ typed reads/writes
┌───────────────▼──────────────┐  ┌─────────▼───────────────────────────┐
│ Derivation — PURE modules    │  │ Persistence — prisma                │
│  series/mrr/waterfall/       │  │  orders · keys_cache · users ·      │
│  economics/retention/funnel/ │  │  daily_metrics · user_rfm ·         │
│  cohorts/rfm/time            │  │  promo_codes · wallet_tx ·          │
│  NEW: compare/quality/       │  │  withdrawals · referral_clicks      │
│  alerts/promo-roi/fraud/     │  │  NEW: alert_events ·                │
│  save-list/upsell/dictionary │  │  data_quality_events · promo_clicks │
└──────────────────────────────┘  └─────────────────────────────────────┘
                │
┌───────────────▼───────────────────────────────────────────────────────┐
│ Async — cron routes (x-cron-secret) + worker process                   │
│  cron/analytics 03:05 rollup → cron/alerts 03:10 evaluate             │
│  cron/remind → Notification(remind-expiry) → worker drain             │
│  NEW: Notification(alert) → worker drain → Telegram (admins)          │
└───────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical implementation |
|-----------|----------------|------------------------|
| Pure derivation module (`lib/analytics/x.ts`) | Owns every formula; input = plain rows/numbers, output = numbers or `null`. Never imports prisma/next/react. | Named exported functions, `denominator === 0 ? null` guard style, no rounding, no `|| 0` |
| Loader (`lib/analytics/x-service.ts`) | Builds the SQL WHERE from MSK labels, selects the minimal row shape, calls the pure module, returns a serializable payload (all `number`, `::int` casts) | `prisma.*.findMany` + `Promise.all`, `mskDayStartInstant` for `timestamp`, `mskDateKey` for `@db.Date` |
| RSC page / block | Enforces `requireRole`, parses `searchParams`, renders blocks each in its own `try/catch` + `Suspense` | `export const dynamic = 'force-dynamic'`, `notFound()` on role failure |
| Cron route | `x-cron-secret` timing-safe gate → lazy `import()` of the service → returns ids/outcomes only | Copy of `app/api/cron/analytics/route.ts` |
| Worker drain | Claims a `Notification` type atomically, dispatches to Telegram, marks done/retry | `drainNotificationType(TYPE, dispatcher, telegram)` in `lib/worker.ts` |
| Setting keys | Lab-configurable thresholds/toggles, no deploy | `prisma.setting` upsert/get, parsed with fallbacks (`rfm-service.ts` pattern) |

## Recommended Project Structure (delta only)

```
lib/
├── settings.ts                     # NEW tiny get/set + typed parsers (4th consumer of Setting)
├── csv.ts                          # NEW pure RFC4180 + UTF-8 BOM serializer
├── analytics/
│   ├── time.ts                     # UNCHANGED (calendar authority)
│   ├── windows.ts                  # NEW pure: windowBounds(period, anchor), previousWindow()
│   ├── compare.ts                  # NEW pure: deltaOf / compareMetrics (ALR-01)
│   ├── quality.ts                  # NEW pure: QualityStamp, classify, decorate, excludedCount
│   ├── alerts.ts                   # NEW pure: rule defs + evaluateAlerts(snapshot, config)
│   ├── promo-roi.ts                # NEW pure: discount cost, revenue, ROI, attribution precedence
│   ├── fraud.ts                    # NEW pure: ip clusters, alias clusters, self-cycles, trial→no-pay
│   ├── save-list.ts                # NEW pure: expiring-not-renewed selection + potential revenue
│   ├── upsell.ts                   # NEW pure: heaviness score + suggested plan
│   ├── dictionary.ts               # NEW pure: metric dictionary content (typed array)
│   ├── service.ts                  # MODIFIED: window helpers extracted, quality decoration
│   ├── compare-service.ts          # NEW loaders: loadKpisComparison etc.
│   ├── quality-service.ts          # NEW: recordDegraded / loadQualityWindow
│   ├── alerts-service.ts           # NEW: snapshot → evaluate → persist → enqueue
│   ├── growth-service.ts           # NEW: promo/referral ROI + fraud aggregates
│   └── actions-service.ts          # NEW: save-list + upsell loaders
├── alert-notify.ts                 # NEW: dispatchAlert (parse target from dedupeKey)
├── reminders-service.ts            # MODIFIED: windowDays param (Setting-driven)
├── outbox.ts                       # MODIFIED: + ALERT type + enqueueAlertNotifications
├── worker.ts                       # MODIFIED: + drainNotificationType(ALERT, …)
├── referral-stats.ts               # MODIFIED: + recordPromoClick (or sibling module)
└── promo.ts                        # UNCHANGED (validation/CRUD authority)

app/
├── api/cron/alerts/route.ts        # NEW (03:10, after rollup)
├── api/admin/export/[report]/route.ts   # NEW (EXT-06)
├── api/promo/click/route.ts        # NEW (public beacon, mirrors /api/referrals/click)
├── admin/analytics/page.tsx        # MODIFIED: delta + quality wiring, export links
├── admin/analytics/dictionary/page.tsx  # NEW (EXT-07)
└── admin/retention/page.tsx        # NEW (save-list + upsell radar)

components/admin/
├── MetricCard.tsx                  # MODIFIED: optional `delta` + `quality` slots (all cards inherit)
├── DeltaBadge.tsx                  # NEW
├── QualityBadge.tsx                # NEW
├── DataQualityBanner.tsx           # NEW
├── ExportCsvLink.tsx               # NEW (server-rendered <a download>, no JS)
├── AlertHistoryTable.tsx           # NEW
├── AlertSettingsForm.tsx           # NEW (client island → /api/admin/alerts/settings)
├── SaveListTable.tsx               # NEW
└── UpsellTable.tsx                 # NEW

prisma/schema.prisma                # MODIFIED: 3 new models + 1 nullable User column
lib/i18n/messages/ru.ts             # MODIFIED: new admin.* keys (RU only)
lib/admin-auth.ts                   # MODIFIED: AdminSection union + MATRIX ('retention','dictionary')
components/admin/AdminNav.tsx + app/admin/layout.tsx  # MODIFIED: NAV_SECTIONS + labels
```

### Structure Rationale

- **`windows.ts` separate from `time.ts`:** `time.ts` is a locked calendar primitive set (its header documents a one-day trap). Window *policy* (7/30/90, previous period, MSK boundaries) changes with this milestone; keeping it in a new pure module means `time.ts` stays untouched and its tests keep guarding the trap.
- **`compare-service.ts` rather than more of `service.ts`:** `service.ts` is already 804 lines and documented as "the ONLY DB read module for that page". Comparisons double every window read; keeping them in a sibling module makes the 2× cost visible and keeps the regression surface of `service.ts` small (success criterion 5: v1.1 values must not change).
- **One `MetricCard` change instead of per-report delta code:** every existing card is rendered through `MetricCard`/`AnalyticsSection`/`GRID`. An optional `delta` prop is a one-file change that every report inherits — the highest-leverage integration point in this milestone.
- **`dictionary.ts` as data, not page copy:** the dictionary must "link to the dashboard section" and stay truthful; a typed array co-located with the pure modules is the only version that can be unit-tested for coverage (every metric key in `compare.ts` has an entry).

## Architectural Patterns

### Pattern 1: Window-shift, not a second formula (ALR-01)

**What:** A comparison is the *same* derivation evaluated on a shifted MSK window. Never a parallel formula, never `daily_metrics` for one side and raw orders for the other.
**When to use:** Every WoW/MoM delta on `/admin/analytics`.
**Trade-offs:** Doubles query volume per block (two `loadPaidOrders()`-class reads). Acceptable at MVP scale (a few thousand rows); documented as the first scaling bottleneck.

```typescript
// lib/analytics/windows.ts — PURE (no prisma)
export interface WindowBounds { fromDay: string; fromInstant: Date }
export function windowBounds(period: 7 | 30 | 90, anchorDay: string): WindowBounds {
  // MSK labels only — never `new Date(Date.now() - n * DAY)` inline in a loader
}
export function previousWindow(period: 7 | 30 | 90, anchorDay: string): WindowBounds {
  // week → shift 7 days, month → shift 30 days; boundaries land on MSK day starts
}

// lib/analytics/compare.ts — PURE
export type DeltaBase = 'ok' | 'zero-base' | 'na';
export interface Delta { abs: number | null; pct: number | null; base: DeltaBase }
export function deltaOf(current: number | null, previous: number | null): Delta;
```

```typescript
// lib/analytics/compare-service.ts — the ONLY place the shift happens
export async function loadKpisComparison(period: 7 | 30 | 90): Promise<{
  current: KpisData;
  wow: Partial<Record<keyof KpisData, Delta>>;
  mom: Partial<Record<keyof KpisData, Delta>>;
}>;
```

**Zero-base rule:** `previous === 0` → `pct: null`, `abs: current`, `base: 'zero-base'` (UI renders «—» for %, never `∞` or `100%`). Both null → `base: 'na'`. **Point-in-time metrics (MRR/ARR/activeKeys) compare against `mrrAt(history, now - 7d | now - 30d)`, never against a `daily_metrics` row** — same engine, shifted anchor (the `service.ts` live-today contract D-12).

### Pattern 2: Decorate at the boundary, keep the loader's type additive (EXT-05)

**What:** Quality is metadata attached to a value, added as an **optional** field so existing payload shapes and tests keep passing.
**When to use:** Any metric whose input includes an ARTEMIDA response (runway/balance, key-mirror-derived active keys, traffic-based radar).
**Trade-offs:** Callers that ignore `quality` silently render a degraded number. Mitigate by making the banner page-level (reads the window once) plus per-card badges.

```typescript
// lib/analytics/quality.ts — PURE
export type QualityStatus = 'ok' | 'partial' | 'degraded';
export interface QualityStamp {
  status: QualityStatus;
  sources: { source: QualitySource; reason: QualityReason; count: number }[];
  excluded: number;          // records dropped from the aggregate — answers SC #4
  staleDays?: number;        // age of the mirror the value was built from
}
export const OK: QualityStamp = { status: 'ok', sources: [], excluded: 0 };
export function mergeStamps(...parts: QualityStamp[]): QualityStamp;
export function classifyArtemidaReason(code: ArtemidaCode | 'timeout'): QualityReason;
```

```typescript
// service.ts — additive, non-breaking
export interface BurnRunwayData {
  /* …unchanged v1.1 fields… */
  quality?: QualityStamp;   // NEW, optional → v1.1 assertions still pass
}
```

**Recording seam:** record at the *analytics consumption point*, not inside `lib/artemida.ts`. The client powers the money path (order provisioning); adding a DB write per provider call there would put a table write in the payment hot path. Record in `loadBurnRunway`'s `.catch()`, in `rollup.ts`'s balance capture, and in the key-mirror staleness check.

```typescript
// lib/analytics/quality-service.ts — DB
export async function recordDegraded(
  source: QualitySource, reason: QualityReason, at?: Date,
): Promise<void>;   // upsert on UNIQUE (source, day, reason), count += 1
export async function loadQualityWindow(fromDay: string, toDay: string): Promise<QualityStamp>;
```

**Exclusion rule:** exclude *rows*, never silently. `excluded` is always the count actually dropped, and `daily_metrics` never stores a degraded-derived value — instead the day gets a `data_quality_events` row, and readers see `partial` for that day. `daily_metrics` stays a pure value table (a `dataQuality` JSON column was rejected: it mixes ops metadata into a metric rollup and cannot express non-day-scoped sources like a live balance check).

### Pattern 3: Pure rule engine + persisted events + Notification delivery (ALR-02..04)

**What:** Rules are pure functions over a numeric snapshot; persistence and delivery are separate, individually testable stages.
**When to use:** Every alert type in Phase 13.
**Trade-offs:** Three files instead of one cron body; the payoff is a unit-testable rule table and a UI that can show history without recomputation.

```typescript
// lib/analytics/alerts.ts — PURE
export type AlertType = 'payments-drop' | 'failed-share-rise' | 'ticket-spike' | 'runway-low';
export interface AlertRule { type: AlertType; metric: MetricKey; comparator: 'lt' | 'gt'; threshold: number }
export interface AlertCandidate {
  type: AlertType; metric: MetricKey;
  current: number; baseline: number | null; threshold: number;
  severity: 'warn' | 'critical';
}
export function evaluateAlerts(snapshot: AlertSnapshot, config: AlertConfig): AlertCandidate[];
```

Dedupe identity (unique index on `alert_events.dedupeKey`):
`alert:{type}:{periodLabel}:{band}` — e.g. `alert:payments-drop:2026-W43:crit`. A second cron run in the same period is a no-op upsert; a *new* period legitimately alerts again. This mirrors the proven `remind:{keyId}:{YYYY-MM-DD}` and `balance:{date}:{band}:{telegramId}` keys.

Delivery reuses the **balance-alert** shape exactly (it is the milestone's closest precedent for "admin-only durable DM"):

```typescript
// lib/outbox.ts
export const ALERT = 'alert';
export async function enqueueAlertNotifications(
  eventId: string, telegramIds: number[],
): Promise<number>;   // createMany skipDuplicates, dedupeKey `alert:{eventId}:{telegramId}`

// lib/alert-notify.ts
export async function dispatchAlert(
  notificationId: string, send: TelegramSender,
): Promise<NotifyDispatchResult>;   // parses telegramId from the dedupeKey

// lib/worker.ts drainNotifications() — one added line
await drainNotificationType(ALERT, dispatchAlert, telegram);
```

**Rejected alternative:** calling `notifyAdminsNewTicket`-style `pushAll` from the cron. It is fire-and-forget with no retry, no dedupe after a restart, and no history — it fails SC "дедуплицируются и не спамят при повторном запуске cron".

### Pattern 4: Config in `Setting`, state in a table

**What:** Thresholds/toggles are `Setting` rows (`alerts.runway.minDays`, `alerts.payments.dropPct`, `alerts.failed.sharePct`, `alerts.tickets.spikePct`, `alerts.{type}.enabled`, `remind.windowDays`); occurrences live in `alert_events`.
**When to use:** All Phase 13/15 configuration.
**Trade-offs:** A fourth hand-rolled Setting parser would appear; add `lib/settings.ts` first.

```typescript
// lib/settings.ts — tiny, typed, fallback-on-parse-failure (rfm-service.ts precedent)
export async function getNumber(key: string, fallback: number): Promise<number>;
export async function getBool(key: string, fallback: boolean): Promise<boolean>;
export async function setMany(entries: Record<string, string>): Promise<void>; // $transaction of upserts
```

**Why not `Setting` for history:** `value String` has no room for (type, period, current, baseline, threshold-in-effect, notifiedAt, ack state) and no unique key to dedupe on. **Why not a table for config:** SC #3/#5 require "порог меняется без деплоя" and "отключить каждый тип без деплоя" — a table would work too, but `Setting` is the established, already-tested precedent and needs no migration.

### Pattern 5: Export derives from the loader, never from the rendered output

**What:** One `export-specs.ts` maps report slug → `{ load, columns, filename }`. The route calls the same loader the page calls, then serializes.
**When to use:** EXT-06 for all eight reports.
**Trade-offs:** The on-screen value is formatted (rubles, «—», `%`), the CSV holds raw values + a formatted label column; drift is possible in formatting but never in *numbers*, because both sides read one loader.

```typescript
// lib/analytics/export-specs.ts
export interface ExportSpec {
  role: 'administrator' | 'manager';
  load: (q: ExportQuery) => Promise<Record<string, unknown>[]>;
  columns: { key: string; header: string; kind: 'number' | 'money' | 'date' | 'text' }[];
  filename: (q: ExportQuery) => string;
}

// app/api/admin/export/[report]/route.ts
const csv = '\uFEFF' + toCsv(spec.columns, rows);   // BOM → Excel; CRLF; quote+double-quote escaping
return new Response(csv, {
  headers: {
    'content-type': 'text/csv; charset=utf-8',
    'content-disposition': `attachment; filename="${spec.filename(q)}"`,
    'cache-control': 'no-store',
  },
});
```

`<a href={exportHref(report, searchParams)} download>` — no client JS, works in the installed PWA on mobile. A server action was rejected: it needs a client component wrapper and cannot stream a download in a plain `<a>`.

### Pattern 6: Reuse existing derivation engines for the action lists (EXT-01/EXT-02)

**What:** Save-list "not renewed" uses `retention.ts#buildKeyTermEvents` + `classifyTerm`; upsell uses the `keys_cache` mirror, never a per-key ARTEMIDA fan-out.
**When to use:** Phase 15.
**Trade-offs:** Both inherit the mirror's staleness — which is exactly why Phase 15 depends on Phase 12's quality work (`lastSyncedAt` age → `QualityStamp.staleDays`, stale keys excluded and counted).

```typescript
// lib/analytics/save-list.ts — PURE
export function selectSaveList(
  events: KeyTermEvent[], orders: PaidOrderRow[], w: { now: Date; horizonDays: number },
): SaveListItem[];  // expiring in (now, now+H], non-trial, no later order for the same keyRef
```

**Reminder path change (behavioural, test-visible):** `lib/reminders-service.ts` currently hard-codes `WINDOW_DAYS = 3` and documents "the SAME window the cabinet badge uses". v1.2 requires a 7-day push (PROJECT.md). Parameterize `listExpiringKeys(now, windowDays = 7)` fed from `Setting remind.windowDays`, keep the dedupe key format unchanged (`remind:{keyId}:{utcDay}`), and align `EXPIRING_WINDOW_MS` in `keys-service.ts` so push and badge cannot disagree. Existing reminder tests will need the new default.

## Data Flow

### Request flow — read (every report)

```
Admin opens /admin/analytics?period=30
      ↓
RSC page: requireRole('administrator','manager') → notFound() on failure
      ↓
<AnalyticsKpi period={30}> (async RSC block, own try/catch + Suspense)
      ↓
loadKpisComparison(30)  →  windowBounds/previousWindow (pure, MSK)
      ↓                         ↓
loadPaidOrders()          loadPaidOrders() + window queries   (2× reads)
      ↓                         ↓
totalMrrAt / arrAt / computeArpu … (pure, unchanged)
      ↓
{ current: KpisData, wow: Delta, mom: Delta, quality?: QualityStamp }
      ↓
<MetricCard value delta quality />   ← single component change, all cards inherit
```

### Request flow — write (alert evaluation)

```
host cron 03:10 → POST /api/cron/alerts (x-cron-secret, timing-safe)
      ↓
alerts-service.runAlertScan(now)
      ├─ snapshot ← loadKpis* / loadFunnel / ticket count / loadBurnRunway   (reuse, no new queries)
      ├─ config   ← Setting (alerts.*)  via lib/settings.ts
      ├─ candidates ← evaluateAlerts(snapshot, config)      (PURE)
      ├─ prisma.alertEvent.upsert(unique dedupeKey)          → history + dedupe
      └─ enqueueAlertNotifications(eventId, adminTelegramIds)  → Notification rows
                                                        ↓
worker drainNotifications() → claimNextNotification('alert') → dispatchAlert
      ↓                                     ↓ (Telegram 5xx/timeout)
markNotificationDone           rescheduleNotification(backoff)
```

### Data flow — degraded ARTEMIDA response

```
loadBurnRunway() calls artemida.getBalance()
      ├─ ok        → value unchanged, quality = OK
      └─ ArtemidaError(code) / timeout
              ├─ recordDegraded('artemida.balance', classifyArtemidaReason(code))     ← upsert (source, day, reason)
              ├─ balance = null, runwayReason = 'no-balance'  (v1.1 behaviour preserved)
              └─ quality = { status:'degraded', sources:[…], excluded: 1 }

Page-level: loadQualityWindow(periodStart, today) → <DataQualityBanner>  ("N записей исключено, источники: balance/timeout")
```

**Why this seam:** the degraded fact must be visible even on a request that *succeeded* because the loader swallowed the error (`service.ts` documents that `getBalance` "is called exactly once here and never rejects the loader"). Without a persisted flag that swallow is invisible — which is exactly SC #3/#4.

### State changes — schema delta

| Change | Kind | Necessity | Alternative rejected |
|--------|------|-----------|----------------------|
| `alert_events` (id, type, metric, periodLabel, band, current, baseline, threshold, dedupeKey UNIQUE, status open/ack/resolved, createdAt, notifiedAt) | NEW table | History + dedupe + "threshold in effect" audit (SC #4/#5) | `Setting` = no history; `Notification.dedupeKey` alone = no record of *what* fired at *what* level |
| `data_quality_events` (id, source, day DATE, reason, count, firstSeenAt, lastSeenAt; UNIQUE(source, day, reason)) | NEW table | "сколько записей исключено" per metric/window (SC #3/#4) | JSON column on `daily_metrics` — cannot express non-day sources; silently couples ops metadata to value rollup |
| `promo_clicks` (id, promoCode, ipHash, source, createdAt; index (promoCode, createdAt)) | NEW table | PRM-01 top-of-funnel — **does not exist today** (`referral_clicks.ownerUserId` is required and only referral codes are resolved) | Extending `referral_clicks` with nullable `ownerUserId` — relaxes a NOT NULL on a live public funnel, regresses `referral-stats.ts` semantics for zero gain |
| `User.signupIpHash` (nullable, sha256) | NEW column | PRM-04 "trial-фермы по ipHash" — no account-level IP is stored today (`ipHash` exists only on `referral_clicks` / `telegram_login_tokens`) | Inferring from `referral_clicks` only — misses every organic trial, i.e. most farm accounts |
| `Setting` keys `alerts.*`, `remind.windowDays` | CONFIG | No-deploy thresholds/toggles (SC #3/#5) | env vars (needs restart) |
| `Notification` — no schema change | REUSE | `type` is a free `String`; `dedupeKey` already UNIQUE | — |

Notes:
- `alert_events` and `data_quality_events` follow existing conventions: `String @id @default(cuid())`, `@map`ed snake_case columns, `@@map` plural table, `DateTime` timestamps, no PG enums (the schema deliberately uses TEXT + TS unions to keep `migrate deploy` non-transactional-safe).
- `promo_clicks` and `User.signupIpHash` are **forward-only** — they cannot be backfilled. This is the single most important scheduling constraint in the milestone (see Build Order).
- Explicit **no-change** list: `orders`, `keys_cache`, `daily_metrics`, `artemida_balance_snapshots`, `Outbox` (money path untouched — alerts must not enter `Outbox`, whose `(orderId, type)` uniqueness cannot carry non-order deliveries; that is precisely why `Notification` exists).

## Integration Points

### Internal boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `service.ts` ↔ `compare-service.ts` | direct import of exported pure helpers + shared `loadPaidOrders` pattern | Extract `windowStartDay` into `windows.ts`; do **not** duplicate the MSK bound math |
| `compare-service.ts` ↔ `MetricCard` | props (`delta`, `quality`) | Additive optional props only — no new card component |
| `loaders` ↔ `quality-service` | `recordDegraded()` on the catch path; `loadQualityWindow()` on the read path | Never inside `lib/artemida.ts` (money hot path) |
| `alerts-service` ↔ `outbox.ts` | `enqueueAlertNotifications(eventId, ids)` | Producer must not send Telegram inline |
| `outbox.ts` ↔ `worker.ts` | new `ALERT` const + one `drainNotificationType` line | Claim discipline is already atomic per-row; do not invent a second claim |
| `alert-notify.ts` ↔ `bot-payments.TelegramSender` | `dispatchAlert(id, send)` returning `NotifyDispatchResult` | Same contract as `dispatchBalanceAlert` (`skipped` / `pushed` / `retryable_error`) |
| `growth-service` ↔ `referral-stats.ts` / `promo.ts` / `revenue.ts` | read-only reuse; new aggregates only | `cashOf` from `series.ts` is the single cash authority — do not re-write `finalAmount - balanceUsed` (note: `reference-stats.ts` and `revenue.ts` each already carry a private copy; new code should import `cashOf`) |
| `reminders-service` ↔ `cron/remind` ↔ `Setting` | `listExpiringKeys(now, windowDays)` | Dedupe key format frozen; changing it would re-send already-delivered reminders |
| `export route` ↔ loaders | `export-specs.ts` indirection | One spec per report; the route holds zero SQL |
| `dictionary.ts` ↔ `compare.ts`/`alerts.ts` metric keys | shared `MetricKey` union | Compile-time guarantee that every compared metric has a dictionary entry |

### Cross-cutting registration checklist (recurring 4-file touchpoint)

Adding an admin section (`retention`, `dictionary`) touches exactly four places that must change together or the nav silently hides the page:

1. `lib/admin-auth.ts` — `AdminSection` union + `MATRIX` (administrator; `manager` too if finance-only)
2. `app/admin/layout.tsx` — `NAV_SECTIONS` order
3. `components/admin/AdminNav.tsx` — `NavSection` type + `ITEMS` + `itemLabel` switch
4. `lib/i18n/messages/ru.ts` — `admin.navX` + all new copy keys (RU only, no interpolation in keys)

### External services

| Service | Integration pattern | Notes |
|---------|---------------------|-------|
| ARTEMIDA Paid API | existing typed client; **analytics reads only** — `getBalance` in `loadBurnRunway`, balance capture in `rollup` | Map `ArtemidaCode` → `QualityReason`; honour `Retry-After` (already done in client); never add per-key `getTraffic` fan-out for the radar (429/502 risk) |
| Telegram Bot API | via `Notification` queue + worker only | Admin targets resolve from `admin_users` (role=administrator) ∪ `ADMIN_TELEGRAM_IDS` — reuse `adminChatIds()` semantics; never cache ids across requests |
| Platega | untouched | — |

## Build Order (Phases 12 → 16)

Roadmap order (12→13→14→15→16) is correct and the dependency claims hold. Two adjustments are recommended.

### Phase 12 — Period Comparison & Data-Quality Foundation (ALR-01, EXT-05)

Recommended intra-phase order:

1. `windows.ts` + `compare.ts` + unit tests (pure, zero risk, unblocks every UI delta)
2. `MetricCard` delta slot + `DeltaBadge`; wire KPI → unit economics → retention → funnel (one block per commit, so a regression is trivially bisectable)
3. **`promo_clicks` beacon + `User.signupIpHash` capture** ← pulled forward from 14 (see adjustment A)
4. `data_quality_events` migration + `quality-service` + `recordDegraded` at the two analytics call sites + `QualityStamp` on affected loaders
5. `DataQualityBanner` + `QualityBadge`; regression test "healthy-data values identical to v1.1"

Rationale: comparisons are additive and independent of schema, so they land first and de-risk the phase; quality needs a migration, so it lands last with the regression test as the gate.

### Phase 13 — Anomaly Alerts (ALR-02..04)

Depends on 12 for two concrete reasons: alert baselines are `previousWindow` values, and the runway rule must not fire on a degraded balance read.

1. `lib/settings.ts` + `Setting` key namespace + validation (0 rows written until the UI exists)
2. `alerts.ts` pure rule table + `evaluateAlerts` tests (boundary: exactly-at-threshold, zero baseline, missing metric)
3. `alert_events` migration + `alerts-service.runAlertScan` (dedupe via unique upsert)
4. `ALERT` const + `enqueueAlertNotifications` + `alert-notify.ts` + worker line (delivery proven before any UI reads it)
5. `app/api/cron/alerts/route.ts` (copy the gate verbatim; schedule 03:10)
6. `/admin/analytics` alert history block + `AlertSettingsForm` + `/api/admin/alerts/settings`

### Phase 14 — Promo & Referral Quality + Fraud (PRM-01..04)

Depends on 12 (MSK windows, quality exclusion). Does not depend on 13 — correct as written.

1. `promo-roi.ts` (discount cost = `amount - finalAmount`, attribution precedence) + `fraud.ts` (ip clusters, `emailCanonical` clusters, self-cycles, trial→no-pay by source) — pure + tests
2. `growth-service.ts` loaders (promo clicks/orders, partner wallet credits vs approved `Withdrawal`, fraud signals)
3. `/admin/promos` + `/admin/referrals` quality sections (drill-down to existing user cards)
4. Wire `quality` stamps; add `clicks` column that degrades gracefully when the beacon has no history yet

### Phase 15 — Expiry Save-List & Upsell Radar (EXT-01, EXT-02)

Depends on 13 (Notification dispatch for bulk reminders/broadcast preview) and 14 (source/segment filters). Both are genuinely used.

1. `save-list.ts` pure (reuse `buildKeyTermEvents`) + `actions-service` loader
2. `reminders-service` `windowDays` parameterization + `Setting remind.windowDays` + badge alignment (**behaviour change — plan the test updates explicitly**)
3. `upsell.ts` pure scoring with `lastSyncedAt` staleness gate → `QualityStamp.staleDays`
4. `/admin/retention` page (save-list + upsell tabs) + registration checklist
5. Bulk action via existing `Broadcast` + `enqueueBroadcastNotifications` with recipient preview count

### Phase 16 — CSV Export & Metric Dictionary (EXT-06, EXT-07)

Depends on 12–15 (exports cover every report). Correct as written.

1. `lib/csv.ts` + tests (quoting, embedded newlines, BOM, CRLF, BigInteger→string safety)
2. `export-specs.ts` + `app/api/admin/export/[report]/route.ts` (requireRole + zod + one spec per report)
3. `ExportCsvLink` on all eight reports (respects `searchParams` — period/filters flow into the href)
4. `dictionary.ts` + `/admin/analytics/dictionary` + nav entry + deep links back to sections

**Draft the dictionary early.** Entries can be authored from Phase 12 onward (formulas are decided then) and the coverage test ("every `MetricKey` has an entry") fails the build until they are complete — that is the cheapest way to keep documentation truthful.

### Adjustment A (scheduling, high impact) — move data capture earlier

`promo_clicks` and `User.signupIpHash` are **append-only, forward-looking**. If they ship in Phase 14 week, PRM-01's click→register→pay funnel and PRM-04's farm detection show near-zero history for the first weeks, and the phase's own success criteria ("воронка видна по каждому коду") look broken. Ship the beacon + column in Phase 12 (≈ half a plan: a route mirroring `/api/referrals/click`, one migration, one `recordPromoClick`). The *report* still lands in Phase 14 as planned.

### Adjustment B (sequencing, medium impact) — one dispatch abstraction, not four

`balance-alert.ts`, `broadcast.ts`, `ticket-notify.ts`, `reminders-service.ts` each carry their own small dispatch. Phase 13 should add `alert-notify.ts` as a *typed sibling* (same `NotifyDispatchResult` contract) rather than refactoring the existing four — a refactor there risks the money-adjacent delivery path for no milestone requirement. If a shared helper is desired, do it in Phase 16 when export work is low-risk.

### Dependency summary

```
12 (compare, quality) ──► 13 (alerts) ──► 15 (save-list/upsell)
      │                                    ▲
      └────► 14 (promo/referral/fraud) ────┘
                                   16 (CSV + dictionary) ◄── all
```

## Risks & Open Questions

| # | Risk / gap | Impact | Recommendation |
|---|-----------|--------|----------------|
| R1 | Promo-code clicks are not recorded anywhere today | PRM-01 cannot be satisfied without new capture | `promo_clicks` table + public beacon, shipped in Phase 12 (Adjustment A) |
| R2 | No account-level IP hash exists | PRM-04 "trial-фермы по ipHash" is unbuildable on current data | `User.signupIpHash` written at register/trial paths; document that history is forward-only |
| R3 | Upsell radar depends on `keys_cache` freshness (`lastSyncedAt` only advances on `revalidateKeys`) | Radar can show month-old traffic | Staleness gate + `QualityStamp.staleDays`; never fan out `getTraffic` per key from a page |
| R4 | Comparison doubles loader queries per block | Slower `/admin/analytics` at scale | Acceptable at MVP; measure before adding caching; the rollup-precompute path is a later milestone |
| R5 | `reminders-service` window 3 → 7 days changes shipped behaviour | Existing reminder tests + user-visible nagging | Make it a `Setting`, keep dedupe key format, update tests deliberately in Phase 15 |
| R6 | Alert permissions: `manager` sees `/admin/analytics` but not broadcast/roles | An alert DM to a manager could expose what they cannot open | Decide recipient set explicitly (recommend: `administrator` only for alert DMs, matching `balance-alert`) |
| R7 | `daily_metrics` has no quality dimension | Historical days cannot be retro-flagged | Accepted: flags are forward-only too; the banner only claims what it knows |

## Anti-Patterns (specific to this milestone)

### Anti-Pattern 1: Computing the delta in the component

**What people do:** `const pct = (cur - prev) / prev * 100` in JSX, or `new Date(Date.now() - 7*86400000)` in a loader.
**Why it's wrong:** duplicate formula authority, and an inline `Date.now()` shift lands on the wrong MSK day around midnight (the exact trap `time.ts` documents); zero-base yields `Infinity`/`NaN`.
**Do this instead:** `compare.ts#deltaOf` + `windows.ts` bounds; `pct: null` on zero base.

### Anti-Pattern 2: Third cash formula

**What people do:** writing `finalAmount - balanceUsed` again in `promo-roi.ts` / `growth-service.ts` (two copies already exist in `referral-stats.ts` and `revenue.ts`).
**Why it's wrong:** three authoritative cash definitions will diverge on the first refund/balance edge case.
**Do this instead:** import `cashOf` from `analytics/series.ts`; new code never re-derives it.

### Anti-Pattern 3: Alert delivery through `admin-notify.pushAll`

**What people do:** call the fire-and-forget DM helper from the cron.
**Why it's wrong:** no durability, no retry, no dedupe across restarts, no history — fails three success criteria at once.
**Do this instead:** `alert_events` → `Notification` → worker drain.

### Anti-Pattern 4: Excluding degraded data invisibly

**What people do:** `rows.filter(r => r.valid)` inside a pure module, returning a smaller number.
**Why it's wrong:** the metric silently changes value with no explanation; SC #4 ("значение можно объяснить") fails.
**Do this instead:** filter in the loader, count what was dropped, carry it as `QualityStamp.excluded`, render it.

### Anti-Pattern 5: Recomputing an export from formatted screen strings

**What people do:** scraping the rendered table or re-implementing the query in the export route.
**Why it's wrong:** two SQL paths drift; filters are applied twice or not at all.
**Do this instead:** `export-specs.ts` → the same loader → `toCsv`.

### Anti-Pattern 6: Fan-out to ARTEMIDA from a page render

**What people do:** `Promise.all(keys.map(k => artemida.getTraffic(k.id)))` for the upsell radar.
**Why it's wrong:** N provider calls inside an RSC request; 429/502 storms, `Retry-After` stalls, and the page fails for everyone.
**Do this instead:** `keys_cache` mirror + staleness flag; refresh only on the existing per-user `revalidateKeys` path.

## Scaling Considerations

| Scale | Architecture adjustments |
|-------|--------------------------|
| 0–1k users (current) | Everything as designed: one process, cron routes, loaders reading a few thousand rows. Comparison's 2× read is invisible. |
| 1k–100k users | First: precompute comparisons/alerts snapshots in the nightly `rollup` into a derived table, so page reads are O(1). Second: partial indexes on `orders(status, paid_at)` and `promo_clicks(promo_code, created_at)`. Third: cap drill-down lists (top-N + "export for full"). |
| 100k+ | Alert scan and rollup move to a real queue/worker (already out of scope per PROJECT.md); exports switch to streaming; `daily_metrics`-based reads replace raw-order derivation for all windowed metrics. |

**First bottleneck:** unbounded paid-order loads (`loadPaidOrders()` is deliberately unbounded-below for term chains). It is loaded 2× per card set with comparisons — that is the first thing to measure.

## Sources

- `.planning/PROJECT.md`, `.planning/ROADMAP.md` (phases 12–16), `.planning/REQUIREMENTS.md` — milestone scope and success criteria
- `lib/analytics/service.ts`, `time.ts`, `rollup.ts`, `rfm-service.ts`, `economics.ts` (headers + signatures) — layer discipline, MSK rules, loader contracts, Setting precedent
- `lib/outbox.ts`, `lib/admin-notify.ts`, `lib/balance-alert.ts`, `lib/worker.ts` — delivery path, dedupe-key patterns, `drainNotificationType` registry
- `lib/reminders-service.ts` — existing 3-day reminder window and `remind:{keyId}:{day}` idempotency
- `lib/referral-stats.ts`, `app/api/referrals/click/route.ts`, `lib/revenue.ts`, `lib/promo.ts` — funnel data availability (and the promo-click gap)
- `prisma/schema.prisma` — models, indexes, enum-vs-TEXT convention, `Notification` shape
- `app/api/cron/analytics/route.ts`, `app/api/cron/rfm/route.ts`, `app/api/admin/segments/[name]/count/route.ts`, `app/api/admin/referrals/stats/route.ts` — cron gate + admin API route shapes
- `app/admin/analytics/page.tsx`, `components/admin/MetricCard.tsx`, `app/admin/layout.tsx`, `lib/admin-auth.ts`, `components/admin/AdminNav.tsx` — UI composition and the section-registration touchpoint
- `lib/artemida.ts` — `ArtemidaCode` taxonomy for degraded-reason classification

---
*Architecture research for: 3set-white v1.2 (analytics stabilization milestone)*
*Researched: 2026-10-31*
