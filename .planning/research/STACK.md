# Stack Research — Milestone v1.2 (new features)

**Domain:** Stabilization / analytics-quality features added to an already-shipped production app (3set-white VPN shop)
**Scope:** ONLY the new capabilities of v1.2 — period comparison, anomaly alerts, promo/referral ROI + fraud, expiry save-list + reminders, upsell radar, data-quality flags, CSV export, metric dictionary. The v1.0/v1.1 core stack is settled and is **not** re-litigated here.
**Researched:** 2026-10-31
**Confidence:** HIGH for the "add nothing" conclusion (every claim below was checked against this repo's `package.json`, `prisma/schema.prisma`, and `lib/*`); MEDIUM for the rejected-library versions (npm registry `dist-tag` only, never installed).

---

## Bottom line

**Zero new runtime dependencies. Zero new dev dependencies. `npm install` adds nothing for v1.2.**

Every one of the eight new capabilities is served by something already in the repo or by a Node 24 built-in:

- `lib/analytics/*` (pure derivation modules) + `lib/analytics/time.ts` (MSK primitives) → period comparison, fraud/ROI math
- `prisma@7.10` `groupBy` / `$queryRaw` (Postgres `percentile_cont`) → ROI, funnels, baselines
- `zod@4.6.5` + `ArtemidaError.code` (`lib/artemida.ts`) → data-quality flags
- `Notification` (`dedupeKey @unique`) + `enqueueNotification()` + the dispatcher-registry pattern in `lib/balance-alert.ts` / `lib/reminders-service.ts` → alert delivery, dedup, reminders
- `Setting` (admin-editable KV) → thresholds and toggles without a deploy
- Node 24 `Response` + `ReadableStream` + `TextEncoder` → streaming CSV with a hand-rolled RFC 4180 writer
- `app/api/cron/*` routes + `lib/worker.ts` tick → scheduling; **no cron library needed**
- `Intl.NumberFormat('ru-RU', …)` → already the repo-wide formatting convention (`components/admin/MarginCards.tsx`, `ErrorTable.tsx`, …)

The one addition that would be genuinely *technical* — Web Push to the PWA — is **rejected on grounds of scope and existing architecture**, not on availability (details in §4).

---

## Verified baseline (this repo, `package.json`, 2026-10-31)

| Package | Installed | Role in v1.2 |
|---------|-----------|--------------|
| node | 24.15.0 local / `node:24-bookworm-slim` in `Dockerfile` | Runtime; `fetch`, `crypto`, `Intl` (full ICU), `ReadableStream`, `node:crypto` `timingSafeEqual` |
| next | 16.3.7 | Route Handlers (`app/api/**`), RSC pages under `app/admin/**` |
| react / react-dom | 19.2.8 | Admin UI (note: **19.2.8**, not 19.3.0 as the v1.0 stack doc assumed — pin as-is, no bump needed) |
| typescript | `^5` (5.9.x) | strict, unchanged |
| prisma / @prisma/client | 7.10.0 (+ `@prisma/adapter-pg`, `pg@^8.23`) | Aggregations, migrations for new flag/alert structures |
| zod | 4.6.5 | ARTEMIDA envelope + new CSV query-param / alert-config validation |
| pino | 10.3.1 | Structured logs for alert runs and export requests |
| p-retry | ^7.1.1 | Unchanged (upstream retries already handled) |
| vitest | 5.0.3 | Unit tests for `lib/csv.ts`, comparison helpers, fraud heuristics, alert dedupe |
| tailwindcss | `^4` | Dictionary page + save-list/upsell tables |
| telegraf | 4.16.3 | Delivery target behind the outbox (no direct use from new code) |

**Gaps found vs. the older stack doc (relevant to v1.2):**

1. `@serwist/next` is **not installed**. The PWA is manifest-only (`app/manifest.ts`; no `public/sw.js`, no Serwist registration). Consequence: there is no service-worker push channel today.
2. Reminder horizon is currently **3 days** (`WINDOW_DAYS = 3` in `lib/reminders-service.ts`), while EXT-01 asks for **≤7 days**. This is a policy/config change, not a dependency.
3. Money is stored as whole-RUB `Int`; traffic is `BigInt` (`KeyCache.trafficUsedBytes/trafficLimitBytes`). Both facts constrain CSV/time-series formatting (see §9).

---

## Recommended Stack

### Core Technologies (unchanged — used as-is)

| Technology | Version | Purpose in v1.2 | Why Recommended |
|------------|---------|-----------------|-----------------|
| Next.js Route Handlers | 16.3.7 | CSV download endpoints (`GET /api/admin/export/<report>`), alert-config mutations | Already hosts every admin API; streaming `Response` works natively in the Node runtime where Prisma lives. No new HTTP layer. |
| Prisma | 7.10.0 | `groupBy` for promo/partner ROI, `$queryRaw` for `percentile_cont` baselines, new flag + alert-history tables | The relational shape (orders/promo/withdrawal/wallet_tx/referral_clicks) is already modeled; `groupBy` covers 90% of the new aggregates without raw SQL. |
| Node 24 built-ins | 24.15 | `Intl.NumberFormat`, `TextEncoder`, `ReadableStream`, `crypto.timingSafeEqual` | Median/MAD, delta %, CSV bytes, and secret compare are all one-liners; adding a library for any of them is net-negative maintenance. |
| Postgres | 17 (Docker) | Window aggregates, `percentile_cont`, unique dedupe indexes | Statistical baselines belong in SQL, not in a new time-series store. |

### Supporting Libraries (all already installed)

| Library | Version | Purpose in v1.2 | When to Use |
|---------|---------|-----------------|-------------|
| `lib/analytics/time.ts` (internal) | — | MSK day/month labels, `mskDateKey`, `mskDayStartInstant`, `pgTimestamp`, `addMonths` | Every comparison window, every ROI period, every CSV date column. **Never** `CURRENT_DATE`/`date_trunc` in SQL (repo rule D-15). |
| `lib/analytics/series.ts` (internal) | — | `PaidOrderRow`, `DailyAggregate`, `cashOf`, MSK day bucketing | Feeding comparison deltas so they reuse the *same* aggregation as the existing dashboard. |
| `lib/outbox.ts` (internal) | — | `enqueueNotification`, `REMIND_EXPIRY`, `Notification.dedupeKey @unique` | All new alerts + the 7-day save-list reminders. Dedupe is a DB constraint, not app logic. |
| `lib/balance-alert.ts` (internal) | — | Reference implementation of "dedupe key encodes the target" dispatch | Copy this pattern for `alert-anomaly` dispatchers rather than inventing a router. |
| `lib/admin-auth.ts` (internal) | — | Guard for export routes and alert-config endpoints | Ensures CSV endpoints inherit the same session/role gate as `/admin/*`. |
| `zod` | 4.6.5 | Validate export query params (`period`, `delimiter`), alert thresholds from `Setting`, ARTEMIDA degraded envelopes | Every new external boundary — including query strings, which are user input. |
| `vitest` | 5.0.3 | `lib/csv.ts` RFC 4180 cases, zero-base delta cases, fraud heuristic cases, alert-dedupe cases | The repo already tests pure analytics modules this way (`tests/unit/analytics-*.test.ts`). Put the new pure modules in the same seam. |

### Development Tools (unchanged)

| Tool | Purpose | Notes |
|------|---------|-------|
| Docker Compose + `Dockerfile` | Deploy | No change; no new service, no sidecar, no Redis. |
| `tsx` | Local runs / seeds | Use for a one-off ROI backfill script if Phase 14 needs historical recompute. |

## Installation

```bash
# Nothing to install for v1.2.
# No runtime deps, no dev deps, no new services, no new env vars required by the stack itself.
# (CRON_SECRET, ARTEMIDA_API_KEY, DATABASE_URL etc. already exist.)
```

---

## Per-feature stack mapping

| # | Feature | Requirement | Stack used | New deps | Integration point |
|---|---------|-------------|------------|----------|-------------------|
| 1 | Period-over-period comparison | ALR-01 (P12) | Pure TS: `lib/analytics/compare.ts` over `DailyAggregate`/loader outputs; `time.ts` for MSK window labels | none | `lib/analytics/service.ts` (`loadKpis`, `loadFunnel`, …) → `components/admin/MetricCard.tsx` / `AnalyticsKpi.tsx` |
| 2 | Anomaly alerting + dedup | ALR-02..04 (P13) | `Notification` unique `dedupeKey`, `enqueueNotification`, `Setting` thresholds, `app/api/cron/alert/route.ts`, median/MAD in plain TS | none | `lib/outbox.ts`, `lib/worker.ts` dispatcher registry, `app/api/cron/*` guard (`CRON_SECRET`) |
| 3 | Promo/partner ROI + fraud | PRM-01..04 (P14) | Prisma `groupBy`, `$queryRaw` (`percentile_cont`), existing `ReferralClick.ipHash`, `User.emailCanonical`, `WalletTx`, `Withdrawal` | none | `lib/referral-stats.ts`, `lib/promo.ts`, `app/admin/promos`, `app/admin/partner` |
| 4 | Expiry save-list + reminders | EXT-01 (P15) | `lib/reminders-service.ts` (window widened to 7d / `Setting`-driven), `Notification` dedupe `remind:{keyId}:{YYYY-MM-DD}` | none | `runReminderScan` in `lib/worker.ts`, `POST /api/cron/remind` |
| 5 | Upsell radar | EXT-02 (P15) | `KeyCache.trafficUsedBytes/trafficLimitBytes/deviceLimit/devices` + `TariffPrice` for the delta price | none | `lib/keys-service.ts`, `lib/pricing.ts` (`resolveTariffQuote`), `app/admin/analytics` |
| 6 | Data-quality flags | EXT-05 (P12) | `zod` + `ArtemidaError.code/retryAfterSec`, new `ArtemidaFetchFlag`-style table, exclusion filter in loaders | none | `lib/artemida.ts` call sites, `app/api/cron/analytics`, `lib/analytics/service.ts` |
| 7 | CSV export | EXT-06 (P16) | Hand-rolled `lib/csv.ts` + Route Handler streaming `Response` | none | new `app/api/admin/export/[report]/route.ts`, buttons in each report component |
| 8 | Metric dictionary | EXT-07 (P16) | TS data module (`lib/analytics/dictionary.ts`) + `t()` keys + Tailwind page | none | `app/admin/dictionary/page.tsx`, `components/admin/AdminNav.tsx`, `lib/i18n/messages/*` |

---

## Feature-specific stack decisions

### 1. Period comparison (ALR-01) — pure functions, not a date library

**Decision:** `lib/analytics/compare.ts` with `delta(current, previous)` returning `{ abs, pct: number | null }`, plus `compareWindows(label, 'wow' | 'mom')` that derives both windows from `lib/analytics/time.ts`.

- **Zero base:** `pct` must be `null` when `previous === 0` — never `Infinity`, never `100%`, never `NaN`. Signature enforces it by type; the UI renders `—`. This is a product requirement disguised as arithmetic, which is exactly why it belongs in a pure, unit-tested module (`tests/unit/analytics-compare.test.ts`).
- **Why not `date-fns@4.4.0`:** MSK is a fixed `+03:00` with no DST, `time.ts` already owns both representations (date-key vs instant) and encodes the one bug that matters (`@db.Date` gets the UTC-midnight key, never the MSK-start instant). A date library would reintroduce that ambiguity with a second, timezone-aware API. `addMonths` already exists for MoM labels.
- **Formatting:** `Intl.NumberFormat('ru-RU', { signDisplay: 'exceptZero' })` and `{ style: 'percent' }` — the repo already formats money/pct this way inline. **Consider a tiny `lib/format.ts` consolidation** (not a dependency): `ErrorTable.tsx`, `MarginCards.tsx`, `RevenuePanel.tsx` each re-create formatters.

### 2. Anomaly alerts (ALR-02..04) — the outbox *is* the alert system

**Decision:** no queue, no scheduler, no alerting library.

- **Scheduling:** extend the existing pattern — a cron route (`app/api/cron/alert/route.ts`) with the `CRON_SECRET` timing-safe guard copied from `app/api/cron/remind/route.ts`, plus an optional call inside the existing `lib/worker.ts` tick. Nothing like `croner@11.0.0` is needed; the container already runs a tick and an external scheduler already hits `/api/cron/*`.
- **Dedupe:** `Notification.dedupeKey String @unique` is the whole mechanism. Key shape: `alert:{type}:{periodKey}` (e.g. `alert:payments-drop:2026-W44`), so re-running the cron in the same period is an `upsert`-noop and alerts never spam. This is the exact trick `reminderDedupeKey()` and `dispatchBalanceAlert()` already use — **copy it, don't invent a second one**.
- **Thresholds/toggles without deploy:** `Setting` rows (`alert.paymentsDropPct`, `alert.failedSharePct`, `alert.ticketSpikeRatio`, `alert.runwayDays`, `alert.<type>.enabled`), validated with `zod` on read. `Setting` is already the admin-editable KV for referral rates and RFM thresholds.
- **Baseline statistics:** median + MAD (or a simple 7/30-day mean) in ~20 TS lines over `daily_metrics` rows that already exist. `simple-statistics@8.0.0` buys nothing here.
- **History UI:** if the admin needs a first-class alert history with an enable/disable toggle per type, add an `AnomalyAlert` table (schema, not dependency) and keep `Notification` as the delivery row — same split the repo already uses for broadcasts vs notifications.

### 3. Promo/referral ROI + fraud (PRM-01..04) — SQL aggregates, existing columns

**Decision:** no analytics/ETL library. All inputs already exist:

- Funnel: `ReferralClick` (top), `User.referredById` (register), `Order` (pay) — three `groupBy`/`count` queries bucketed by MSK label.
- Promo ROI: `PromoCode.discount/type/usedCount/ownerUserId` + paid orders' discount amount (`finalAmount` vs list price) — compute discount cost in SQL, ROI in TS.
- Partner ROI with payouts: `Withdrawal` (status/decidedAt) joined to attributed orders — `WalletTx` is the ledger of record, so use it for *earned*, `Withdrawal` for *paid out*. Requirement PRM-03 specifically forbids counting accruals only.
- Fraud: `ReferralClick.ipHash` (sha256, already stored, never raw IP), `User.emailCanonical` (already unique — alias farming is already blocked at registration), trial vs paid ratios per source. This is aggregation + heuristics, not ML — three `groupBy` calls and a threshold. **Do not** add an IP-intelligence API or a fingerprinting library: it would leak PII and contradict the repo's hash-only stance.
- Index note (schema, not stack): fraud scans want `ReferralClick(code, createdAt)` and `ReferralClick(ipHash, createdAt)`; verify against `EXPLAIN` at MVP row counts before adding.

### 4. Expiry save-list + reminders (EXT-01) — Telegram outbox, explicitly **not** Web Push

**Decision:** reuse `lib/reminders-service.ts` + `Notification` + `REMIND_EXPIRY`; treat "push" as the existing Telegram DM push.

- **Window mismatch to fix:** `WINDOW_DAYS = 3` today vs EXT-01's 7 days. Make it a parameter (or `Setting.reminder.windowDays`) and have the save-list page and the reminder scan read the *same* value so the list and the DM cannot disagree — the module's own comment already states this invariant for the 3-day window and the cabinet badge.
- **Idempotency:** keep `remind:{keyId}:{YYYY-MM-DD}`. For a 7-day horizon, extend to a "band" (`remind:{keyId}:{YYYY-MM-DD}` daily is fine; if you want T-7/T-3/T-1, use `remind:{keyId}:t7:{expiryDay}` so repeated cron hits stay no-ops).
- **Why Web Push is rejected** (`web-push@3.6.7`, the only realistic candidate): the app has **no service worker** (`@serwist/next` is not installed; only `app/manifest.ts` exists). Adopting it would add: a service-worker build pipeline, a VAPID key pair in `.env`, a per-device `PushSubscription` table, permission-prompt UX in all three client surfaces, plus iOS-Safari constraints (install required, silent-failure debugging). That is a sub-project, not a stack tweak — and the reminder audience is already reachable via Telegram (`User.telegramId`/`chatId`), which is the channel every other v1.2 alert uses. Revisit only if a milestone explicitly targets PWA retention.

### 5. Upsell radar (EXT-02) — cache columns are already sufficient

**Decision:** read-only queries over `KeyCache` + `TariffPrice`.

- `KeyCache` already caches `trafficUsedBytes`, `trafficLimitBytes`, `deviceLimit`, `devices`, `expiresAt`; `TariffPrice` + `resolveTariffQuote()` already gives the exact price of the upgrade target, so the "potential upgrade value" is a subtraction, not a new pricing engine.
- **Serialization guard:** both traffic columns are `BigInt`. Convert with `Number()` (values are far below `2^53`) before returning from a loader — the repo already documents a "no stray BigInt in the RSC payload" pitfall for raw-SQL counts.
- No APM/ML/segment CDP. The RFM segments from v1.1 already exist if a segment join is wanted (`UserRfm`).

### 6. Data-quality flags (EXT-05) — zod + typed errors, persisted

**Decision:** intercept at the existing client boundary; persist one row per degraded fetch; exclude flagged rows in loaders.

- `lib/artemida.ts` already classifies every failure into `ArtemidaError.code` (`bad_gateway`, `unavailable`, `rate_limited`, …) and validates success envelopes with `zod` (`.passthrough()`, `safeParse`). A "degraded" definition is therefore already computable: non-2xx after retries, envelope parse failure, timeout, or partial data.
- Store: new table (`ArtemidaFetchFlag` / `degraded_fetches`) with `day`, `endpoint`, `code`, `excludedCount`, `capturedAt` — or reuse `ArtemidaBalanceSnapshot.source`-style tagging. **Schema, not stack.** No APM (Sentry/OTel) — out of scope per PROJECT.md ("monitoring infra" deferred).
- Loaders (`lib/analytics/service.ts`, `lib/analytics/rollup.ts`) gain an explicit `degraded` field per metric so the UI can show "N records excluded". Keep the exclusion rule in the *loader*, not the SQL, so it stays unit-testable with plain fixtures.

### 7. CSV export (EXT-06) — hand-rolled writer, ~60 LOC, fully specified

**Decision:** `lib/csv.ts`, no `papaparse` / `csv-stringify`. Contract to implement:

```ts
// lib/csv.ts — RFC 4180 writer, zero deps
const BOM = '\uFEFF';

function escapeField(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'bigint' ? v.toString() : String(v);
  // Quote when the field contains a quote, comma, CR, or LF; double the quotes.
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: Array<Record<string, unknown>>, columns: string[], delimiter = ','): string {
  // CRLF line endings per RFC 4180; BOM first so Excel detects UTF-8 (кириллица).
  return BOM + [columns.join(delimiter), ...rows.map((r) => columns.map((c) => escapeField(r[c])).join(delimiter))].join('\r\n') + '\r\n';
}
```

Route-handler integration (`app/api/admin/export/[report]/route.ts`):

```ts
export const runtime = 'nodejs';        // Prisma + streaming; never edge
export const dynamic = 'force-dynamic'; // never cache an export
// auth via lib/admin-auth.ts, then:
const filename = `report-${mskDayLabel(new Date())}.csv`;
return new Response(toCsv(rows, cols), {
  headers: {
    'content-type': 'text/csv; charset=utf-8',
    'content-disposition': `attachment; filename="report.csv"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  },
});
```

- **Delimiter decision (opinionated):** emit `,` per RFC 4180 — a `sep=;` first line is an Excel-proprietary hack that corrupts the data contract. If RU-locale Excel complaints appear, add an explicit `?delimiter=;` param (validated with `zod` to `/[,;]/`), not a silent default.
- **BOM is mandatory,** not cosmetic: without `\uFEFF`, Excel on Windows renders Cyrillic headers as mojibake and mis-detects the encoding.
- **Streaming:** for the row counts in play (single-VPS MVP, ≤ tens of thousands), a string response is fine and simpler. Use `ReadableStream` only if a report ever exceeds ~5–10 MB; `ReadableStream`/`TextEncoder` are built-ins, so the upgrade path needs no dependency either.
- **Why not `papaparse@5.7.0`:** primarily a *parser* sized for the browser; you'd use ~10% of it, and it doesn't own Excel/BOM/`BigInt` handling the way this app needs. **Why not `csv-stringify@6.9.0`:** it's a reasonable library, but it would be a dependency to maintain for 60 lines of well-specified, unit-tested code — and the escaping rules are the part you most want to own and test.

### 8. Metric dictionary (EXT-07) — data module + i18n, no MDX/CMS

**Decision:** `lib/analytics/dictionary.ts` exporting `{ id, labelKey, formula, source, limitations }[]`, rendered by a static RSC page; each dashboard section links to `#<id>`.

- Formulas must live next to the code that computes them (or at least be cross-checked by a test asserting every dashboard metric id has a dictionary entry). A Markdown/MDX pipeline (`next-mdx-remote@6.0.0`) would drift from the implementation and adds a build step.
- i18n: RU-only per PROJECT.md, so keys go into the existing `lib/i18n/messages/*` dictionary and are consumed with the existing `t()`.

---

## Alternatives Considered

All versions below are npm registry `latest` as of 2026-10-31 (`npm view <pkg> version`); they were evaluated and **not adopted**, so nothing is pinned.

| Recommended | Alternative | Version checked | When to Use Alternative |
|-------------|-------------|-----------------|-------------------------|
| Hand-rolled `lib/csv.ts` | `csv-stringify` | 6.9.0 | If exports grow streaming pipelines with transforms, backpressure tuning, and many formatters; then it earns its keep. |
| Hand-rolled `lib/csv.ts` | `papaparse` | 5.7.0 | Only for *parsing* user-uploaded CSVs (the repo has no such feature). |
| `Notification.dedupeKey` + outbox | `bullmq` + Redis | 6.5.3 | When delayed jobs, retries with per-job UI, or multi-worker concurrency are needed — explicitly deferred by PROJECT.md ("multi-server / очередь" out of scope). |
| Existing cron routes + worker tick | `croner` | 11.0.0 | If the process ever needs in-app schedules beyond the current tick, on a host without an external scheduler. |
| Plain TS median/MAD | `simple-statistics` | 8.0.0 | If v1.3+ adds real statistical modeling (regression, distributions) beyond thresholds. |
| TS dictionary module | `next-mdx-remote` | 6.0.0 | If the dictionary becomes editorial content owned by non-developers. |
| Existing SVG/Tailwind cards | `recharts` | 3.10.1 | If charts move beyond sparkline/bar primitives; today `MrrSparkline`/`FunnelCharts` are hand-rolled SVG and consistent. |
| `lib/analytics/time.ts` | `date-fns` | 4.4.0 | Only if a non-MSK timezone enters scope (it won't — RU/RUB only). |
| Telegram outbox | `web-push` (+ Serwist) | 3.6.7 | If PWA retention becomes a milestone goal and a service worker is adopted first. |

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Any CSV library | 60 lines of fully specified RFC 4180 logic, unit-testable, no version churn | `lib/csv.ts` |
| A push-notification SDK / `web-push` | No service worker in the app; would drag in Serwist, VAPID secrets, a subscription table and iOS caveats | `Notification` + `REMIND_EXPIRY` via the outbox |
| Redis / BullMQ | Single VPS; dedupe is already a DB unique constraint; alerts run once per period | `Notification.dedupeKey` upsert + cron route |
| Cron/queue libraries | The app already has `CRON_SECRET`-guarded routes and a worker tick | `app/api/cron/alert/route.ts` |
| An APM/Sentry SDK for data-quality | PROJECT.md defers monitoring infra; `pino` + a flag table answer "was this metric degraded?" | `ArtemidaError.code` + degraded-fetch table |
| A time-series DB (Influx/ClickHouse) | `daily_metrics` already holds one row per MSK day; all v1.2 math is window arithmetic | Postgres + `daily_metrics` |
| `SimpleAnalytics`-style external analytics for promo clicks | Clicks are already first-party (`ReferralClick` with hashed IP); an external script would break the PII stance and send data off-server | Existing `ReferralClick` |
| A date library | Fixed +03:00, two representations already documented and tested | `lib/analytics/time.ts` |
| A chart component kit | Existing dashboard is hand-rolled SVG + Tailwind; a kit would fork the visual language | `components/admin/*` primitives |
| Edge runtime for CSV routes | Prisma (`@prisma/adapter-pg`) is Node-only; Prisma on edge would be a rewrite | `export const runtime = 'nodejs'` |
| `Intl`-free ad-hoc money formatting | Repo already uses `Intl.NumberFormat('ru-RU')`; divergence creates thousand-separator bugs in CSV and UI | `Intl.NumberFormat`, ideally a shared `lib/format.ts` |

## Stack Patterns by Variant

**If a report must be exportable and screen-identical:** build the loader to return `{ columns, rows }` once, then render the table *and* serialize the CSV from the same object. Two imperative paths will drift (success criterion 16.2 says "the same rows and columns as the screen").

**If an alert needs a per-recipient target:** encode it in `dedupeKey` (`alert:{type}:{periodKey}:{telegramId}`) exactly as `dispatchBalanceAlert()` does — it keeps the queue schema untouched.

**If thresholds must change without deploy:** `Setting` + `zod` parse-on-read, and surface the current value in the admin UI so a typo is visible immediately.

**If a metric is computed from degraded upstream data:** return it as `{ value, degraded: true, excluded }` rather than `null`. `null` silently hides the problem; the requirement is that the admin can *explain* the number.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `next@16.3.7` | `react@19.2.8`, `typescript@5.9` | Keep as installed; no v1.2 feature requires a bump. |
| `prisma@7.10.0` + `@prisma/adapter-pg` | Postgres 17, Node 24 | `groupBy`/`$queryRaw` fine; remember `::int` casts (BigInt → RSC serialization). |
| `zod@4.6.5` | Next 16 route handlers | Use for query strings too (`period`, `delimiter`, `segment`). |
| Node 24 / `node:24-bookworm-slim` | `Intl` full ICU | `Intl.NumberFormat('ru-RU')` and `toLocaleString` safe in the container. |
| `vitest@5.0.3` | `tests/unit/**` | New pure modules (`csv`, `compare`, `fraud`) go here; DB-backed loaders follow the existing `analytics-phaseN-loaders` pattern. |

## Sources

- Repo ground truth (HIGH): `package.json`, `prisma/schema.prisma` (Notification/Outbox/Setting/PromoCode/WalletTx/ReferralClick/Withdrawal/KeyCache/DailyMetric), `lib/outbox.ts`, `lib/reminders-service.ts` (`WINDOW_DAYS = 3`), `lib/balance-alert.ts`, `lib/analytics/{time,series,service}.ts`, `lib/artemida.ts` (`ArtemidaError.code`, zod `safeParse`), `app/api/cron/remind/route.ts` (CRON_SECRET guard), `Dockerfile` (`node:24-bookworm-slim`).
- RFC 4180 (CSV), RFC 6266/5987 (`Content-Disposition` `filename*`) — HIGH (standards, stable).
- npm registry `latest` on 2026-10-31 for rejected alternatives: `papaparse@5.7.0`, `csv-stringify@6.9.0`, `web-push@3.6.7`, `date-fns@4.4.0`, `recharts@3.10.1`, `simple-statistics@8.0.0`, `next-mdx-remote@6.0.0`, `bullmq@6.5.3`, `croner@11.0.0` — MEDIUM (registry = ground truth, not exercised in this repo).
- `.planning/PROJECT.md`, `.planning/ROADMAP.md` (Phases 12–16), `.planning/REQUIREMENTS.md` (ALR/PRM/EXT) — HIGH (project source of truth).

---
*Stack research for: 3set-white v1.2 stabilization & quality features*
*Researched: 2026-10-31*
