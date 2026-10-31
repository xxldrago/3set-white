# Phase 7: Analytics Foundation & Revenue Metrics - Research

**Researched:** 2026-10-20
**Domain:** Postgres daily rollup + MSK day bucketing + MRR/waterfall derivation on an existing Next 16 / Prisma 7 money pipeline
**Confidence:** HIGH (schema, money semantics, timezone arithmetic, and raw-SQL behaviour were verified empirically against the installed Prisma 7.10.0 + `@prisma/adapter-pg` + local Postgres 16, and against source files read this session)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Выручка и база MRR
- **D-01:** MRR/ARR считаются на **активных ключах из `KeyCache`**, а не на потоке заказов: активный ключ → его последний paid-заказ (через `Order.keyId`). Один ключ = одна строка MRR; продление не даёт двойного счёта. — **Reversibility:** reversible — производные считаются на лету (см. D-14), смена базы не требует пересчёта истории.
- **D-02:** База денег для всех метрик — **полученный кэш**: `finalAmount - balanceUsed` по оплаченным заказам (`paid | provisioning | provisioned`). Консистентно с существующим `lib/revenue.ts` (`cashOf`), промо-скидки и оплата балансом честно снижают MRR. Отдельной «списочной» MRR-метрики **не вводим**. — **Reversibility:** reversible.
- **D-03:** Продления за **бонусные дни (0 ₽)** — компенсации из тикетов и бонусные продления — **исключаются** из MRR и выручки, но учитываются отдельной метрикой «выдано бонусом, ₽-эквивалент» (goodwill), чтобы размер компенсаций был виден, но не искажал деньги.
- **D-04:** Нормализация подписок разной длины — **месячный эквивалент**: `MRR = Σ по активным ключам finalAmount / (срок_дней / 30)`. Не зависит от точки наблюдения; корректно для тарифов 30/90/180/365.
- **D-05:** **ARPU** = выручка / все зарегистрированные пользователи (без заблокированных); **ARPPU** = выручка / уникальные платящие за период. Классические SaaS-знаменатели.

#### providerCost (себестоимость ключа)
- **D-06:** Источник себестоимости — **provider-quote ARTEMIDA, фиксируемый при provisioning** (момент выдачи ключа). Если цена покупки была ручной (`TariffQuote.source === 'manual'`, `lib/pricing.ts:94` — в этом случае provider-quote сейчас вообще не запрашивается), делается **дополнительный вызов `/pricing` только для сохранения `providerCost`**. Недоступность quote (5xx) **не блокирует выдачу**: пишем `providerCost = null` + лог.
- **D-07:** `providerCost` пишется **per-order**, включая `kind = 'renew'` и `'upgrade'` (для upgrade — по дельте доп. устройств/срока). Маржа считается по каждому заказу и агрегируется в rollup.
- **D-08:** Заказы **до** внедрения поля: `providerCost = null`. Маржа за такие окна показывается как «—», а период помечается **флагом покрытия** («себестоимость известна для N из M заказов»). **Ретро-бэкфилл по текущему прайсу не делаем** — оценка выдала бы себя за факт. — **Reversibility:** one-way — фактическая себестоимость заказов до внедрения поля нигде не сохранялась, восстановить её нельзя (только приблизительная оценка), поэтому маржа за прошлые окна навсегда содержит null-пробел.

#### Структура страницы
- **D-09:** Аналитика живёт на **отдельной странице `/admin/analytics`** + новый пункт в `components/admin/AdminNav.tsx`. `/admin` остаётся обзором: короткий тизер (MRR + ссылка «Подробнее»), без переноса туда аналитики.
- **D-10:** Первый экран Phase 7: **KPI-строка** (MRR, ARR, ARPU, ARPPU, покрытие себестоимости) → **revenue waterfall за период** → **спарклайн тренда MRR**. Разбивки по тарифам/видам заказов и прочие блоки **не** входят в эту фазу (фазы 8–11 добавят блоки ниже).
- **D-11:** Гейт доступа наследуется: `administrator` + `manager` (как `app/admin/page.tsx:15`), с повторной проверкой роли в самой странице (RSC-payload не проходит через layout).

#### Пересчёт, джоб, backfill
- **D-12:** `daily_metrics` хранит **сырые суточные агрегаты** (заказы, кэш, providerCost, активные ключи, новые пользователи, выданные бонусные дни и т.п.). Производные (MRR, ARPU/ARPPU, waterfall) считаются **на лету** в `lib/analytics`. «Сегодня» — live-запрос, не дожидаясь ночного джоба. — **Reversibility:** reversible — смена формулы не требует пересчёта истории (в отличие от хранения готовых метрик).
- **D-13:** Ночной пересчёт — **новый маршрут `app/api/cron/analytics/route.ts`** под `CRON_SECRET` (паттерн `app/api/cron/reconcile/route.ts` и `remind/route.ts`) + внешний cron **03:00**. Джоб **идемпотентен** (upsert по дню).
- **D-14:** Backfill истории — **CLI-скрипт** `scripts/backfill-analytics.ts` (идемпотентный, запускается вручную при деплое, считается с первого заказа). Тяжёлый публичный HTTP-маршрут не открываем, кнопки в админке нет.
- **D-15:** Границы суток/месяца — **Europe/Moscow (+03:00)**. Метрики «за сегодня»/«за месяц» совпадают с человеческим календарём RU. — **Reversibility:** costly — таймзона зашита в уже записанные суточные бакеты; смена потребует пере-bucketing всей истории (миграция + полный backfill).

### the agent's Discretion
- Конкретная структура таблиц (`daily_metrics`, `artemida_balance_snapshots`), набор агрегатных колонок, ключи идемпотентности пересчёта и способ хранения таймзоны в бакете.
- Способ построения спарклайна и waterfall (остаётся в рамках существующего SVG-подхода, см. `<code_context>`).
- Схема «флага покрытия» (отдельная колонка vs вычисляемое поле ответа) — на усмотрение планировщика.
- Часовой пояс snapshot баланса (`artemida_balance_snapshots`): раз в сутки в момент джоба vs чаще.

### Deferred Ideas (OUT OF SCOPE)
- **PRM-01..04** (качество промо/рефералов и антифрод), **ALR-01..04** (WoW/MoM-компараторы и алерты об аномалиях), **EXT-01..07** (save-list истекающих, upsell-радар, учёт возвратов, support↔churn, data-quality флаги, CSV-экспорт, словарь метрик) — были в исходном запросе пользователя, но **сознательно отложены** при утверждении roadmap v1.1. Зафиксированы в `.planning/REQUIREMENTS.md` (Future). Не расширяют границы Phase 7.
- Разбивки по тарифам (days/devices) и видам заказов (`new`/`renew`/`upgrade`) на странице аналитики — рассмотрены и отложены в фазы 8–11.
- Про-рата по календарным дням вместо месячного эквивалента — отклонено для MRR (см. D-04); может понадобиться позже для дневных графиков в фазах 8+.
- Материализация готовых метрик в rollup (гибрид) — отклонено (см. D-12); вернуться только если live-вычисления станут узким местом.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ANL-12 | Система сохраняет расход провайдера на заказ (`Order.providerCost`) в момент provisioning | §providerCost Capture — exact insertion point (`lib/worker.ts:152`), concurrent-quote pattern, upgrade base-device recovery, failure → `null` + warn, admin-only read path |
| ANL-15 | Метрики считаются nightly-джобом в `daily_metrics` (cron 03:00) с возможностью backfill истории | §Rollup Design — schema, MSK bucket helpers, absolute-value idempotent upsert, one-pass series builder, cron route, `scripts/backfill-analytics.ts` + Dockerfile copy gap |
| ANL-01 | Админ видит MRR и ARR за выбранный период — сумма monthly-equivalent активных подписок (`finalAmount / (days / 30)`), вместе с числом активных подписок | §MRR Model — per-key term chain, `COALESCE(keyId, provisionedKeyId)` join fix, upgrade-delta rule for `days IS NULL`, `count(activeKeys)` |
| ANL-02 | Админ видит MRR-waterfall по месяцам: new / expansion / contraction / churned MRR и net change | §Waterfall — month-end snapshots per key, component classification, exact reconciliation identity (`new + expansion − contraction − churned = ΔMRR`) as a test |
| ANL-03 | Админ видит ARPU (выручка / все зарегистрированные) и ARPPU (выручка / платящие) за период | §ARPU/ARPPU — denominators from `user`/distinct paying `userId`; note: no `blocked` column exists so "без заблокированных" is a no-op today |
</phase_requirements>

## Summary

Phase 7 is a **data-foundation phase with one visible surface**. Everything hinges on three decisions that are cheap now and expensive later: (1) how a "day" is represented in Postgres, (2) how `providerCost` gets captured without endangering the money path, and (3) how MRR is derived from a schema where upgrades store `days = NULL` and new orders carry the key id in `provisionedKeyId`, not `keyId`.

All three were resolved empirically rather than from docs. Two findings are decisive:

1. **`@prisma/adapter-pg@7.10.0` serializes every JS `Date` parameter with `getUTC*` components** (`node_modules/@prisma/adapter-pg/dist/index.js:389-397`). For a `date` column it emits a bare `YYYY-MM-DD` built from UTC. Passing a Moscow-day-start instant (`2026-10-19T21:00:00Z`, which is 00:00 MSK on Oct 20) into a `date` column therefore stores **2026-10-19** — a silent off-by-one on every day bucket. Verified: two inserts of the two Date conventions produced `["2026-10-19","2026-10-20"]`, and a `WHERE day >= $1` with the MSK-start Date returned 2 rows instead of 1.
2. **The dev machine's Postgres session `TimeZone` is `Asia/Vladivostok` (+10); the Docker container's is UTC.** Any bucket boundary computed *inside SQL* (`CURRENT_DATE`, `now()::date`, `date_trunc('day', ts)`, `timestamp` vs `timestamptz` comparisons) produces different answers locally and in production. Verified: `SHOW TimeZone` → `Asia/Vladivostok`; `'2026-10-19'::date::timestamptz` → `2026-10-19 00:00:00+10`.

The consequence is a hard design rule: **compute the Moscow calendar day in JS and pass it as a value; never let Postgres decide what "today" is.** With that rule, MSK bucketing is exact and cheap — fixed `+03:00` offset (Europe/Moscow has had no DST since 2014-10-26) matched `Intl.DateTimeFormat` with `timeZone: 'Europe/Moscow'` on **0 mismatches across a sampled 2020–2030 range**, and ran 86 ms vs 32 ms per 100k conversions.

The second-order consequence touches the schema choice: with `day DateTime @id @db.Date`, every write must pass a **UTC-midnight** `Date` (`2026-10-20T00:00:00Z`) built with `Date.UTC`, never a MSK-instant `Date`. Two same-looking helpers with different semantics are the single most likely implementation bug in this phase, so the plan must name them differently and test both.

MRR has a real gap in D-01/D-04 that the planner must close explicitly: `Order.days` is `Int?` and is **NULL for every `kind='upgrade'` order** (`app/api/orders/route.ts:174` passes `days: null`), so "last paid order ÷ (days/30)" is undefined for a key whose latest order is an upgrade. Additionally, `keyId` is NULL at creation for `kind='new'` orders — the key arrives in `provisionedKeyId` at provisioning — so a strict `Order.keyId` join silently drops **every new subscription** from MRR. Both are documented below with the exact interpretation that satisfies ANL-01 and ANL-02.

**Primary recommendation:** ship one additive migration (`orders.provider_cost`, `daily_metrics`, `artemida_balance_snapshots`), a pure `lib/analytics/` derivation core (MSK time helpers → one-pass daily series → MRR chain → waterfall), one idempotent upsert path shared by the cron route and the backfill script, and a server-rendered `/admin/analytics` page reusing the existing `MetricCard`/SVG patterns. No new npm packages.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Moscow day/month bucketing | Shared pure lib (`lib/analytics/time.ts`) | — | Must be identical in cron, backfill, page, and tests; no SQL-side date logic (session TZ differs dev vs prod) |
| Daily aggregate computation | Shared pure lib (`lib/analytics/series.ts`) | — | Pure function over order rows → testable without a DB, and the only way backfill and nightly agree |
| Persistence of daily rows | API/Backend (`lib/analytics/rollup.ts`, `$executeRaw` upsert) | — | Idempotent absolute-value upsert keyed by `day`; no incremental math |
| Nightly trigger | API/Cron route under `CRON_SECRET` | OS cron (03:05) | Mirrors `app/api/cron/reconcile/route.ts`; host cron at 03:00 is already taken by backups |
| Historical backfill | CLI script (Node process in the `web` container) | — | D-14 forbids a heavy public route; DB port is unpublished so it must run inside Compose |
| providerCost capture | API/Backend worker (`lib/worker.ts`) | ARTEMIDA `/pricing` | Cost is fixed at provisioning, the only point where the key exists and the order is terminal-success |
| MRR / ARR / ARPU / ARPPU / waterfall | Shared pure lib (`lib/analytics/mrr.ts`, `waterfall.ts`) | — | D-12: derived on the fly from raw aggregates/orders; changing a formula must not require a re-roll |
| Analytics page rendering | Frontend Server (RSC page + server components) | — | Role re-check in the page (RSC payload skips layouts), Suspense per card, pure-SVG charts |
| Admin-only cost visibility | Frontend Server (admin user page) | — | `OrderHistoryRow` is shared with the customer cabinet → cost must not enter that mapper |

## Standard Stack

**No new dependencies.** This phase is deliberately buildable from what is installed. Anything else is a rejection, not a choice.

### Core (already installed — versions read from `package.json` this session)

| Library | Version | Purpose in this phase | Why it fits |
|---------|---------|----------------------|-------------|
| `prisma` / `@prisma/client` | `^7.10.0` / `7.10.0` | Models + `$executeRaw` upsert + migrations | Already the schema owner; `skipDuplicates`/`createManyAndReturn` exist in the generated client (`generated/prisma/models/AdminUser.ts:1038`, `:539`) |
| `@prisma/adapter-pg` | `^7.10.0` | Driver adapter (source of the Date-serialization rule) | Already wired in `lib/prisma.ts` |
| `next` / `react` | `16.3.7` / `19.2.8` | RSC page, Route Handler, Suspense | Route Handlers + `force-dynamic` are the established admin pattern |
| `zod` | `4.6.5` | `?period=` normalization if a query schema is used | Project-standard boundary validation |
| `pino` | `10.3.1` | Rollup/cost logs (`route`, `outcome`, ids only) | Existing logger contract |
| `vitest` | `5.0.3` | Pure-lib + DB-backed tests | `vitest.config.ts` already sets `fileParallelism: false` and a local-DB fallback |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `tsx` | `^4.19.2` | Run `scripts/backfill-analytics.ts` | Already used by `npm run db:seed`; present in the prod image (see Environment Availability) |
| `node:crypto` | Node 24 | `timingSafeEqual` for `CRON_SECRET` | Copy the existing helper shape from the reconcile route |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `day DateTime @id @db.Date` | `day String @id` (`"YYYY-MM-DD"`) | Text removes *all* Date-coercion risk and sorts chronologically, but loses native date arithmetic/index semantics and drifts from how Prisma represents dates elsewhere. Recommendation stands with `@db.Date` **because** the UTC-midnight convention was verified end-to-end; if the executor cannot keep the two helpers distinct, text is the safe fallback. |
| Fixed `+03:00` arithmetic | `Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow' })` | Intl is correct-by-definition but 2.7× slower and re-derives the zone per call; the fixed offset matched it exactly over 2020–2030. Use Intl **only** in the cross-check test. |
| Hand-written SVG | a chart library | Explicitly out of bounds: `components/admin/FunnelCharts.tsx` is the convention (pure SVG, no chart deps), and D-10 keeps the visuals simple |
| Materialized KPI columns | raw aggregates only | D-12 rejects materialization; formulas must be changeable without a re-roll |

**Installation:** none.

## Package Legitimacy Audit

**Not applicable — this phase installs zero packages.** No new dependency is required for daily rollup, MSK bucketing, MRR/waterfall derivation, cron route, backfill script, or SVG charts. All recommended imports are already in `package.json` and already exercised by production code paths.

If the planner is tempted to add a date library (`date-fns`, `luxon`, `dayjs`), that is a **scope regression**: the only date arithmetic needed is "label ↔ UTC instant ↔ UTC-midnight date key" plus month stepping, all of which is ≈40 lines and already proven above.

## Architecture Patterns

### System Architecture Diagram

```
                       ┌───────────────────────────────────────────────┐
  ARTEMIDA /pricing ──▶│ lib/worker.ts  processFulfillOrder             │
  (getPricing /        │   Promise.all([provisionByKind, quoteCost])    │
   getUpgradeQuote)    │        │                     │                 │
                       │        ▼                     ▼                 │
                       │  artemida.createKey/    providerCost (Int|null) │
                       │  renewKey/upgradeKey           │                │
                       │        │                       │                │
                       │        └────► markProvisioned(orderId, keyId,   │
                       │                providerCost)  ◀── atomic flip  │
                       └────────────────────┬───────────────────────────┘
                                            │ orders (paid_at, final_amount,
                                            │  balance_used, provider_cost, kind,
                                            │  days, key_id, provisioned_key_id)
                                            ▼
  OS cron 03:05 ──▶ POST /api/cron/analytics (x-cron-secret)
                       │
                       ▼
             lib/analytics/rollup.ts  rollupDays(from, to)
                       │  load paid orders once
                       ▼
          lib/analytics/series.ts  buildDailySeries(orders, days)   ← PURE
                       │  per MSK day: cash, counts by kind,
                       │  providerCost sum + coverage, active keys,
                       │  new users, goodwill days
                       ▼
          INSERT ... ON CONFLICT (day) DO UPDATE SET <absolute values>
                       │
                       ▼
                 daily_metrics  ──┐
                 artemida_balance_snapshots ──┐
                                            │
  /admin/analytics (RSC, force-dynamic) ◀───┘
     ├─ KPI card   : lib/analytics/mrr.ts     (live MRR/ARR + active keys)
     ├─ KPI card   : ARPU / ARPPU             (period cash ÷ denominators)
     ├─ KPI card   : cost coverage N of M     (daily_metrics sums)
     ├─ Waterfall  : lib/analytics/waterfall.ts (month-end per-key snapshots)
     └─ Sparkline  : last N daily MRR points  (daily_metrics + live today)
```

Reading the diagram: **money facts flow one way** from `orders` (immutable) into `daily_metrics` (recomputable), and every display value is derived at read time. Nothing writes a *metric*; only raw per-day aggregates are persisted.

### Recommended Project Structure

```
lib/analytics/
├── time.ts        # MSK labels, day bounds (two distinct Date helpers), month months
├── series.ts      # PURE: orders → DailyAggregate[] (cash, counts, coverage, active keys, goodwill)
├── rollup.ts      # DB: load orders, call series, absolute-value upsert, backfill range
├── mrr.ts         # PURE: per-key term chains → mrrAt(t), activeKeysAt(t)
├── waterfall.ts   # PURE: month-end snapshots → new/expansion/contraction/churned
└── service.ts     # DB: loadAnalyticsPage(period) → KPI + sparkline + waterfall rows
app/api/cron/analytics/route.ts     # POST, CRON_SECRET, force-dynamic
app/admin/analytics/page.tsx        # RSC, role re-check, Suspense per card
components/admin/AnalyticsKpi.tsx   # MetricCard grid (server)
components/admin/MrrWaterfall.tsx   # pure SVG (server; no 'use client')
components/admin/MrrSparkline.tsx   # pure SVG (server)
scripts/backfill-analytics.ts       # tsx, relative imports (mirrors prisma/seed.ts)
prisma/migrations/<ts>_analytics_foundation/migration.sql
```

### Pattern 1: Two Date helpers, never interchangeable

**What:** one helper returns the **instant** that starts an MSK day (for `timestamp` comparisons); the other returns the **UTC-midnight Date** that represents that day in a `date` column.

**When to use:** every single boundary in this phase.

```ts
// lib/analytics/time.ts
export const MSK_OFFSET_MS = 3 * 60 * 60 * 1000; // Europe/Moscow, +03:00 since 2014-10-26

/** `2026-10-19T21:00Z` → "2026-10-20" (the Moscow calendar day of that instant). */
export function mskDayLabel(at: Date): string {
  return new Date(at.getTime() + MSK_OFFSET_MS).toISOString().slice(0, 10);
}

/** "2026-10-20" → `2026-10-19T21:00:00Z` — an INSTANT. Use for `timestamp` windows only. */
export function mskDayStartInstant(label: string): Date {
  return new Date(Date.parse(`${label}T00:00:00.000Z`) - MSK_OFFSET_MS);
}

/** "2026-10-20" → `2026-10-20T00:00:00Z` — a DATE KEY. Use only for `@db.Date` params. */
export function mskDateKey(label: string): Date {
  return new Date(`${label}T00:00:00.000Z`);
}

/** UTC wall-clock literal for a `timestamp(3)` column — session-TZ independent. */
export function pgTimestamp(instant: Date): string {
  return instant.toISOString().slice(0, 19).replace('T', ' '); // "2026-10-19 21:00:00"
}
```

**Verified values (must appear in tests):**
- `mskDayLabel(new Date('2026-10-19T21:00:00Z'))` → `"2026-10-20"`; `mskDayLabel(new Date('2026-10-19T20:59:59Z'))` → `"2026-10-19"`.
- `mskDayStartInstant('2026-10-20')` → `2026-10-19T21:00:00.000Z`.
- `mskDateKey('2026-10-20')` → `2026-10-20T00:00:00.000Z`.
- Month start of Oct 2026 (MSK) → `2026-09-30T21:00:00.000Z`.

### Pattern 2: Absolute-value idempotent upsert

**What:** recompute the whole day from source and `SET` every column from `EXCLUDED` — never `col = col + n`.

**Why:** verified under concurrency. Twelve simultaneous upserts of the same `day` all succeeded (no `40001`), and the surviving row is simply the last writer's absolute values. Incremental math under that race double-counts; absolute values cannot.

```sql
INSERT INTO daily_metrics (
  day, paid_orders, paid_cash_rub, new_orders, renew_orders, upgrade_orders,
  provider_cost_rub, provider_cost_orders, active_keys, new_users,
  goodwill_days, computed_at
)
VALUES ($1::date, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())
ON CONFLICT (day) DO UPDATE SET
  paid_orders         = EXCLUDED.paid_orders,
  paid_cash_rub       = EXCLUDED.paid_cash_rub,
  new_orders          = EXCLUDED.new_orders,
  renew_orders        = EXCLUDED.renew_orders,
  upgrade_orders      = EXCLUDED.upgrade_orders,
  provider_cost_rub   = EXCLUDED.provider_cost_rub,
  provider_cost_orders= EXCLUDED.provider_cost_orders,
  active_keys         = EXCLUDED.active_keys,
  new_users           = EXCLUDED.new_users,
  goodwill_days       = EXCLUDED.goodwill_days,
  computed_at         = now()
```

Notes, all verified:
- Pass the day as a **`YYYY-MM-DD` string** (`$1::date`). Strings bypass the adapter's Date formatting entirely.
- `$executeRaw*` with `RETURNING` returns only the affected **count**, not rows — use `$queryRaw` when you need rows back.
- Multi-row upserts work (`unnest($1::text[], $2::int[]) ... RETURNING`), but **days must be deduped first**: the same key twice in one statement raises PG `21000` (`ON CONFLICT DO UPDATE command cannot affect row a second time`).
- Never cast `regclass` in a raw query through this adapter (`DriverAdapterError: UnsupportedNativeDataType { type: 'regclass' }`); cast `::text` if you must.
- Cast every `count(*)`/`sum(...)` to `::int`: verified `count(*)` returns a **BigInt** and `sum()` returns `null` on an empty set — both break RSC serialization and arithmetic.

### Pattern 3: One-pass daily series (pure), DB only at the edges

```ts
// lib/analytics/series.ts  — no Prisma import; this is the unit-test surface
export interface DailyAggregate {
  day: string;               // "YYYY-MM-DD" MSK label
  paidOrders: number;
  paidCashRub: number;       // Σ max(0, finalAmount - balanceUsed)
  newOrders: number; renewOrders: number; upgradeOrders: number;
  providerCostRub: number;   // Σ provider_cost where not null
  providerCostOrders: number;// count of paid orders with provider_cost not null
  activeKeys: number;        // keys with a paid term covering end-of-day
  newUsers: number;
  goodwillDays: number;
}
export function buildDailySeries(
  orders: PaidOrderRow[], users: { createdAt: Date }[],
  goodwill: { at: Date; days: number }[],
  fromDay: string, toDay: string,
): DailyAggregate[];
```

Inputs are loaded once; output is deterministic. The nightly job and the backfill call **the same function**, so "метрики за любой прошлый день совпадают с ручной сверкой" is a property of the design, not a hope.

### Pattern 4: Server-rendered charts, independent degradation

`RevenuePanel.tsx` is the template: `try { data = await load…() } catch { return <p>{t('common.errorLoad')}</p> }`, `MetricCard`, `Intl.NumberFormat('ru-RU')`, integers in rubles. The waterfall and sparkline need **no** `'use client'` and **no** JSON endpoint (the page is already `force-dynamic`), which removes an entire auth/validation surface from scope.

### Anti-Patterns to Avoid

- **SQL-side day logic** (`CURRENT_DATE`, `now()::date`, `date_trunc`, `timestamp` vs `timestamptz` comparisons): session TZ is `Asia/Vladivostok` locally and `UTC` in Docker → different buckets for the same data.
- **Passing a JS `Date` into a raw `date` parameter**: adapter emits the UTC calendar date → MSK midnight becomes the *previous* day.
- **Incremental upserts** (`SET paid_orders = daily_metrics.paid_orders + EXCLUDED.paid_orders`): duplicate under concurrent cron + backfill.
- **`providerCost` through `toHistoryRow`**: that mapper feeds the customer cabinet and the bot (`lib/orders-service.ts:392`, consumed by `app/payments/page.tsx`, `components/PaymentHistoryList.tsx`, `components/OrderStatusPanel.tsx`, `lib/bot-payments.ts`) — cost would leak to customers.
- **Deriving cost from `resolveTariffQuote`**: with a manual grid row present it returns the **retail** amount (`lib/pricing.ts:97`), so margin would be structurally zero. Cost must come from `artemida.getPricing`/`getUpgradeQuote`.
- **A public `/api/analytics/backfill`**: D-14 forbids it, and a year-long sweep is an unauthenticated DoS.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Moscow day/month math | a DST-aware date engine | fixed `+03:00` helpers + an Intl cross-check test | Europe/Moscow has been UTC+3 with no DST since 2014-10-26; verified 0 mismatches 2020–2030 |
| Idempotent day upsert | read-then-write / `findUnique` + `create`/`update` | `INSERT … ON CONFLICT (day) DO UPDATE SET <absolute>` | Verified concurrency-safe; read-then-write races between cron and backfill |
| Money definition | a second cash formula | `cashOf` from `lib/revenue.ts:24` (`Math.max(0, finalAmount - balanceUsed)`) and `PAID` from `:10` | D-02 mandates consistency with the existing dashboard |
| Cron auth | a new secret scheme | `timingSafeEqual` + `x-cron-secret` + 503-on-unset from `app/api/cron/reconcile/route.ts` | Same threat model, same behaviour, already reviewed |
| Role gate | a new middleware | `requireRole('administrator','manager')` re-run inside the page + `notFound()` | RSC payloads skip layouts (`app/admin/page.tsx:1-6` comment) |
| KPI cards / charts | new components or a chart lib | `MetricCard` (`components/admin/RevenuePanel.tsx:10`), pure SVG conventions from `FunnelCharts.tsx` | Visual consistency and zero new deps |
| Tariff/provider quote | re-deriving prices from the grid | `artemida.getPricing` / `artemida.getUpgradeQuote` (which internally mirrors ARTEMIDA's own upgrade rule) | `deriveUpgradeQuote` already encodes `Math.max(1, remainingDays/30)` (`lib/artemida.ts:259`) |

## Schema (prescriptive)

```prisma
// Phase 7 analytics foundation (D-12/D-15). `day` is an Europe/Moscow calendar
// day stored as a native `date`; the stored value IS the MSK label, and Prisma
// returns it as a Date at UTC midnight.
model DailyMetric {
  day                DateTime @id @db.Date
  paidOrders         Int      @default(0) @map("paid_orders")
  paidCashRub        Int      @default(0) @map("paid_cash_rub")
  newOrders          Int      @default(0) @map("new_orders")
  renewOrders        Int      @default(0) @map("renew_orders")
  upgradeOrders      Int      @default(0) @map("upgrade_orders")
  providerCostRub    Int      @default(0) @map("provider_cost_rub")
  providerCostOrders Int      @default(0) @map("provider_cost_orders")
  activeKeys         Int      @default(0) @map("active_keys")
  newUsers           Int      @default(0) @map("new_users")
  goodwillDays       Int      @default(0) @map("goodwill_days")
  computedAt         DateTime @default(now()) @map("computed_at")

  @@map("daily_metrics")
}

model ArtemidaBalanceSnapshot {
  day        DateTime @id @db.Date
  balanceRub Int      @map("balance_rub")
  capturedAt DateTime @default(now()) @map("captured_at")
  source     String   @default("cron")
  capturedFrom String?

  @@map("artemida_balance_snapshots")
}
```

Plus, on `Order` (`prisma/schema.prisma:168`):

```prisma
providerCost Int? @map("provider_cost") // ARTEMIDA charge at provisioning (D-06/D-08)
```

Migration must be **purely additive** (nullable column + two new tables) so `prisma migrate deploy` in the container entrypoint is safe on a live DB. Pattern precedent: `prisma/migrations/20261019234438_ticket_unread_for_admin/migration.sql` (`ALTER TABLE ... ADD COLUMN ... NOT NULL DEFAULT 0` + index).

`providerCost` coverage is derived, not stored: `providerCostOrders / paidOrders` per day, summed over the window. D-08's "N из M" is then a query, and no new "coverage" column can go stale.

## MRR / Waterfall Model (the part D-01/D-04 leave open)

### The two schema facts that force an interpretation

1. **`keyId` is NULL for `kind='new'`.** `createOrder` writes `keyId: input.keyId ?? null` (`lib/orders-service.ts:192`) and the new-order path passes no key; the provider key id lands only in `provisionedKeyId` via `markProvisioned` (`lib/orders-service.ts:477-483`). A strict `Order.keyId` join therefore excludes **all** new subscriptions.
2. **`days` is NULL for `kind='upgrade'`.** The upgrade route passes `days: null` (`app/api/orders/route.ts:174`), and `Order.days` is `Int?` (`prisma/schema.prisma:174`). D-04's `finalAmount / (days/30)` is undefined for these orders.

### Prescribed model (satisfies D-01, D-02, D-04, ANL-01, ANL-02)

**Key identity:** `key_ref = COALESCE(key_id, provisioned_key_id)`.

**Per-key term chain** (pure, from `orders` only — no `KeyCache` history needed):

```
paid = orders where status ∈ {paid, provisioning, provisioned}
chain ops = paid orders for the key with kind ∈ {new, renew}, ordered by paidAt
cursor = null
for each op in chain ops:
    start  = max(cursor ?? op.paidAt, op.paidAt)   // renew extends from current expiry
    cursor = start + op.days days
termStart = first op.paidAt ; termEnd = cursor
```

This matches provider semantics (a renewal extends the existing expiry, it does not restart it) and gives a reproducible "was this key active at instant t" answer for **any past day** without `KeyCache` history.

**MRR of a key at instant t:**

```
if t >= termEnd           -> 0                      (expired / churned)
base  = chain op whose term contains t              (the last new|renew ≤ t)
mrr   = cash(base) / (base.days / 30)
        + Σ over upgrades u with base.paidAt < u.paidAt <= t:
              cash(u) / max(1, (termEnd - u.paidAt) / 30 days)
```

The upgrade denominator reuses ARTEMIDA's own rule (`Math.max(1, remainingDays / 30)`, `lib/artemida.ts:259`) — the same formula that priced the charge — so an upgrade is spread over the months it actually covers instead of being counted as a one-off spike.

**Total MRR** = Σ over keys. **ARR** = `MRR * 12`. **Active subscriptions** = count of keys with `mrr > 0` (and, separately, `termEnd > t`).

**Waterfall per MSK month** (calendar months, D-15):

```
S(m) = { key -> mrr(key, endOfMonth(m)) }          // endOfMonth = last instant of the MSK month
for each key in union(S(m-1), S(m)):
    before = S(m-1).get(key) ?? 0 ; after = S(m).get(key) ?? 0
    if before == 0 and after > 0       -> new        += after
    if before > 0 and after > before   -> expansion  += after - before
    if before > 0 and after > 0 and after < before -> contraction += before - after
    if before > 0 and after == 0       -> churned    += before
net = new + expansion - contraction - churned
```

**Reconciliation identity (make this an assertion, not a comment):**
`new + expansion - contraction - churned === Σ S(m) - Σ S(m-1)`, exactly, for every month. If it does not hold, a key fell into two buckets or none.

**Sources of contraction that actually exist in this product:** renewal at a lower monthly equivalent (shorter term with the same cash, or a promo discount) and balance-covered renewals (`cash = 0` while the key stays active). There is **no downgrade path** (`kind` has no `downgrade`; upgrades only add devices), so any contraction observed in production is pricing/promo-driven — worth a comment in the code so a future reader does not go looking for a missing order type.

**Churn** = a key whose term ended and was not renewed. Deletion from `KeyCache` produces the same outcome through the chain (`termEnd` passes, no later op).

### ARPU / ARPPU

- Period window: rolling `?period=7|30|90` (matching `PeriodSelector`) **or** custom `from`/`to` (CONTEXT §specifics). Cash denominator = `Σ max(0, finalAmount - balanceUsed)` for paid orders with `paidAt` in the window.
- **ARPU** denominator = `prisma.user.count()` (**verified: there is no `blocked`/`disabled`/`deletedAt` field on `User`** — grep over `prisma/schema.prisma` returns nothing — so D-05's "без заблокированных" is currently a no-op; implement `count()` and document it).
- **ARPPU** denominator = `COUNT(DISTINCT user_id)` over the same paid-order set.
- Both must render `—` when the denominator is 0, never `0 ₽`.

## providerCost Capture (ANL-12)

### Insertion point

`lib/worker.ts:110-173` — `processFulfillOrder`. Today the sequence is:

```ts
const key = await provisionByKind({ … });        // :135
await upsertCachedKey(order.userId, key);         // :148
const firstProvision = await markProvisioned(order.id, key.id); // :152
```

Prescribed change: fetch the cost quote **concurrently** with provisioning, then write it in the same atomic transition.

```ts
const [key, quotedCost] = await Promise.all([
  provisionByKind({ … }),
  quoteProviderCost(order).catch((err) => {
    logger.warn({ route: 'worker', outcome: 'provider_cost_unavailable', orderId: order.id,
                  code: err instanceof ArtemidaError ? err.code : 'unknown' });
    return null;
  }),
]);
await upsertCachedKey(order.userId, key);
const firstProvision = await markProvisioned(order.id, key.id, quotedCost);
```

Extend the existing transition helper rather than adding a second write:

```ts
export async function markProvisioned(
  orderId: string, keyId: string, providerCost: number | null = null,
): Promise<boolean> {
  return transitionOrder(orderId, 'provisioning', 'provisioned', {
    provisionedKeyId: keyId, providerCost, errorCode: null, nextAttemptAt: null,
  });
}
```

`markProvisioned` has exactly one caller (`lib/worker.ts:152`; verified by grep across `lib app scripts`), and `transitionOrder` already accepts a `Partial<Pick<Order, …>>` data bag (`lib/orders-service.ts:315-326`) — the field list needs `providerCost` added there.

**Why concurrent, not sequential:** a sequential quote adds a full `/pricing` round-trip to every provisioning, delaying key delivery for a metric. `Promise.all` costs nothing extra; provisioning remains the gate, and `.catch(() => null)` guarantees D-06's "не блокирует выдачу".

### Computing the quote (per kind)

| `kind` | Call | Inputs available on the order |
|--------|------|------------------------------|
| `new` | `artemida.getPricing({ days, devices })` | `days` (non-null), `devices` = purchased count |
| `renew` | `artemida.getPricing({ days, devices })` | `days` (non-null), `devices` = current limit (route sets it) |
| `upgrade` | `artemida.getUpgradeQuote({ days: 30, devices: baseDevices, addDevices: order.devices })` | `days` is NULL; `devices` holds the addDevices delta |

**Upgrade base-device recovery (real hazard):** the pre-upgrade device limit is *not* stored on the order (the route passes `devices: currentLimit` to `createOrder` but `createOrder` stores `storedDevices = addDevices`, `lib/orders-service.ts:143`). Read it from the mirror and subtract the delta:

```ts
const cached = await prisma.keyCache.findFirst({ where: { keyId: order.keyId } });
const baseDevices = Math.max(1, (cached?.deviceLimit ?? order.devices) - order.devices);
```

Subtracting is required because a retry after a partial success may already see the post-upgrade `deviceLimit` in the cache; without the subtraction the tier lookup lands one tier too high.

**Never** use `resolveTariffQuote`/`resolveUpgradeQuote` for cost: they prefer the manual grid (`lib/pricing.ts:96-99`, `:118-121`) and would record retail as cost.

### Admin visibility (Success Criterion 5)

`loadAdminPayments` (`lib/admin-service.ts:370-376`) maps through `toHistoryRow` (`lib/orders-service.ts:392`), which is shared with the customer cabinet and bot. Do **not** add `providerCost` to `OrderHistoryRow`. Instead:

```ts
export type AdminPaymentRow = OrderHistoryRow & { providerCost: number | null };
export async function loadAdminPayments(userId: number): Promise<AdminPaymentRow[]> {
  const orders = await prisma.order.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
  return orders.map((o) => ({ ...toHistoryRow(o), providerCost: o.providerCost ?? null }));
}
```

Render `—` for `null`. Add a source-contract test asserting the string `providerCost` does not appear in `lib/orders-service.ts`'s mapper or the customer components.

## Rollup, Cron, Backfill

### Rollup window: re-roll, don't just close yesterday

A day's `providerCostRub`/`providerCostOrders` depend on provisioning, which can land **after** the day's 03:05 run (an order paid 23:50 is provisioned 00:10). Closing only `yesterday` leaves a permanent hole. Prescribe: each run recomputes **the last 7 MSK days** (`mskDayLabel(now) - 7 … yesterday`), then upserts absolute values. Cheap (one order load, 7 rows) and self-healing for late provisioning and for a skipped run.

Also note the cash-attribution caveat: `applyConfirmedPayment` sets `paidAt: new Date()` at claim time (`lib/orders-service.ts:446-448`), so a lost callback recovered by the hourly reconcile shifts that order's day forward. That is inherent to the data we have — document it in the module comment rather than "fixing" it.

### Cron route

`app/api/cron/analytics/route.ts`, `POST`, `export const dynamic = 'force-dynamic'`, lazy `await import(...)` of `lib/env`, `lib/logger`, and the rollup module (mirrors `app/api/cron/reconcile/route.ts:1-42`): 503 if `CRON_SECRET` is unset, 401 on a bad/missing `x-cron-secret`, `timingSafeEqual` with a length guard, then `return Response.json({ ok: true, ...result })`.

**Scheduling:** `docs/DEPLOY.md:130` already installs `0 3 * * * … scripts/backup.sh`. Running the analytics rollup at the same minute competes with a `pg_dump` of the same database. Schedule analytics at **`5 3 * * *`** (still "nightly 03:00 window"; D-13's intent is "after the MSK day closes", and 03:05 is inside that window), e.g.:

```cron
5 3 * * * curl -fsS -X POST -H "x-cron-secret: $CRON_SECRET" https://dash.3set.online/api/cron/analytics
```

Document the line in `docs/DEPLOY.md` §7 next to the backup entry.

### Backfill script — and the deploy gap

`scripts/backfill-analytics.ts` must (a) use **relative** imports like `prisma/seed.ts` (`import { prisma } from "../lib/prisma"`) instead of the `@/` alias, (b) default the range to `first paid order day … yesterday` (MSK), (c) chunk by month for progress logging, (d) print `days=… upserted=…` for the verify chain, and (e) be re-runnable with identical results.

**The gap:** `Dockerfile:36-49` copies `.next/standalone`, `prisma/`, `prisma7.config.ts`, `generated/`, and `node_modules` from `deps` — **`scripts/` is not copied**, and `docker-compose.prod.yml` publishes no `db` port. So the documented backfill invocation can only work if the plan adds:

```dockerfile
COPY --from=builder /app/scripts ./scripts
```

and the operator command is:

```bash
docker compose -f docker-compose.prod.yml exec web npx tsx scripts/backfill-analytics.ts
```

`tsx` is available in the runner image: `Dockerfile:10-13` runs `npm ci` with no `NODE_ENV=production`, then `:49` copies that `node_modules` wholesale. Verify with `docker compose … exec web npx tsx --version` during deploy.

## Balance snapshots (groundwork for ANL-14)

Phase 7 does **not** ship burn-rate/runway (that is ANL-14 / Phase 8) but D-13's job is the natural capture point. Record one snapshot per run: `artemida.getBalance()` → `balanceRub`, `day = mskDateKey(yesterday)`, `capturedAt = now()`, `source = 'analytics-cron'`, upserted on `day` (yesterday wins on a re-run; never overwrite a real earlier reading with a later one silently — use `ON CONFLICT DO NOTHING` **or** `DO UPDATE` only when `captured_at < EXCLUDED.captured_at`; choose `DO NOTHING` for the simplest honest semantics). Failure to read the balance is logged and does **not** fail the rollup.

## Common Pitfalls

### Pitfall 1: MSK midnight stored as the previous day
**What goes wrong:** `day` rows shift one day earlier; "yesterday" is empty and "today" has yesterday's numbers.
**Why:** `@prisma/adapter-pg` formats a `Date` parameter for a `date` column as `YYYY-MM-DD` from **UTC** components. A MSK-day-start instant is 21:00Z on the previous UTC day. Verified: inserting `2026-10-19T21:00:00Z` into `date` stored `2026-10-19`; `WHERE day >= '2026-10-19T21:00:00Z'` matched 2 rows where 1 was correct.
**How to avoid:** `mskDateKey()` (UTC midnight) for every `@db.Date` param; `mskDayStartInstant()` only for `timestamp` comparisons; strings (`'YYYY-MM-DD'`) in raw SQL.
**Warning signs:** backfill and cron disagree by exactly one day; a test expecting 1 row gets 2.

### Pitfall 2: Postgres decides the day
**What goes wrong:** identical code produces different buckets on the dev box and in production.
**Why:** `SHOW TimeZone` on the dev DB returns `Asia/Vladivostok`; the container runs UTC. `CURRENT_DATE`, `now()::date`, `date_trunc('day', paid_at)`, and `timestamp`-vs-`timestamptz` comparisons are all session-TZ dependent. Verified: `'2026-10-19'::timestamptz` renders `2026-10-19 00:00:00+10` locally.
**How to avoid:** all boundaries computed in JS and passed as literals; comparisons against `timestamp(3)` columns pass `pgTimestamp(instant)` (`"YYYY-MM-DD HH:mm:ss"`, no zone) or use the typed Prisma API with `Date` bounds (the adapter's `formatDateTime` writes UTC wall clock, which is exactly what a `timestamp` column expects).
**Warning signs:** boundary tests pass locally but a manual check on the server is off by hours.

### Pitfall 3: `Order.keyId` join silently drops new subscriptions
**What goes wrong:** MRR only reflects renewals/upgrades; new sales vanish; ARR looks bizarrely low.
**Why:** `keyId` is NULL on `kind='new'` until provisioning writes `provisionedKeyId` (`lib/orders-service.ts:192`, `:479`).
**How to avoid:** `COALESCE(key_id, provisioned_key_id)` as the key reference everywhere.
**Warning signs:** MRR < revenue of a single recent new order; keys with only `new` orders have no MRR row.

### Pitfall 4: Division by NULL for upgrade orders
**What goes wrong:** `NaN`/`Infinity` MRR, or a division-by-zero throw inside a page render.
**Why:** `Order.days` is `Int?` and NULL for every upgrade (`app/api/orders/route.ts:174`).
**How to avoid:** upgrades contribute `cash / max(1, monthsRemaining)` on top of the base term order; never run `/(days/30)` on an upgrade.
**Warning signs:** a key's MRR equals its last upgrade price; `NaN` in a KPI card.

### Pitfall 5: providerCost leaks to customers
**What goes wrong:** provider economics exposed on the cabinet/bot payment history.
**Why:** `toHistoryRow` is the single mapper for customer surfaces (`lib/orders-service.ts:392`, used by `app/payments/page.tsx`, `components/PaymentHistoryList.tsx`, `components/OrderStatusPanel.tsx`, `lib/bot-payments.ts`).
**How to avoid:** admin-only `AdminPaymentRow`; assert by test that the shared row type has no cost field.

### Pitfall 6: Cost computed from the retail grid
**What goes wrong:** margin ≈ 0 everywhere, "cost coverage" looks perfect, and the metric is useless.
**Why:** `resolveTariffQuote` returns the **manual** amount when a grid row exists (`lib/pricing.ts:96-99`); the order's `amount` is that same retail number (`lib/orders-service.ts:136-137`).
**How to avoid:** cost is always `artemida.getPricing` / `artemida.getUpgradeQuote`; quote failure → `null` (D-08), never a fallback to retail.

### Pitfall 7: Incremental upsert under concurrency
**What goes wrong:** double-counted revenue when cron and backfill overlap.
**Why:** verified 12 concurrent same-key upserts all succeed → last writer wins on **absolute** values only.
**How to avoid:** `SET col = EXCLUDED.col` for every column.

### Pitfall 8: `BigInt` from `count()`/`sum()` breaks the RSC payload
**What goes wrong:** `TypeError: Do not know how to serialize a BigInt` at render time, or `sum()` returning `null` on an empty day.
**Why:** verified `count(*)` → `bigint`, `sum(...)` → `null`/`bigint`; `count(*)::int` → `number`.
**How to avoid:** `::int` casts + `COALESCE(SUM(x), 0)`.

### Pitfall 9: Nightly run races its own late data
**What goes wrong:** a day's providerCost is permanently under-reported because the order was provisioned after 03:05.
**Why:** cost is written at provisioning, hours after `paidAt`.
**How to avoid:** re-roll the last 7 days each run (absolute upsert makes this free).

### Pitfall 10: Backfill script missing from the image
**What goes wrong:** `docker compose exec web npx tsx scripts/backfill-analytics.ts` → `Cannot find module`.
**Why:** `Dockerfile` never copies `scripts/`, and the DB port is unpublished so the host cannot reach it.
**How to avoid:** add the `COPY` line; verify in the deploy checklist.

### Pitfall 11: i18n test fails the build for a half-wired nav item
**What goes wrong:** `tests/unit/i18n.test.ts` fails with an **unused** key (it scans `app`, `components`, `lib`, per its header), or TypeScript fails because `I18nKey` is derived from `ru.ts`.
**Why:** `I18nKey` is the literal key union of `lib/i18n/messages/ru.ts`; `AdminNav` resolves labels by a literal `switch`, and `AdminSection` is a closed union with a `MATRIX` per role.
**How to avoid:** wire the section in **five** places in one task: `AdminSection` (`lib/admin-auth.ts:30-42`), `MATRIX` (`:45-65`), `NAV_SECTIONS` (`app/admin/layout.tsx:22`), `NavSection` + `ITEMS` + `itemLabel` (`components/admin/AdminNav.tsx:13-58`), `ru.ts` (`navAnalytics`). `Extract<AdminSection, …>` will **not** flag the omission for you.

### Pitfall 12: `/admin/analytics` readable from a fetched RSC payload
**What goes wrong:** an unauthorized role can read analytics by requesting the RSC payload directly (layouts are skipped).
**Why:** documented at `app/admin/page.tsx:1-6` and mandated by D-11.
**How to avoid:** repeat `requireRole('administrator','manager')` inside the page, map `SessionError → redirect('/login')`, `AdminError → notFound()`.

## Code Examples

### Typed-window query (safe for `timestamp(3)` columns)

```ts
// Bounds are instants; the adapter writes them as UTC wall clock, which is what
// a `timestamp` column stores. Never compare against `timestamptz` here.
const from = mskDayStartInstant(fromDay);
const to = mskDayStartInstant(nextDayLabel(toDay));
const rows = await prisma.order.findMany({
  where: { status: { in: ['paid', 'provisioning', 'provisioned'] },
           paidAt: { gte: from, lt: to } },
  select: { id: true, userId: true, kind: true, days: true, devices: true,
            finalAmount: true, balanceUsed: true, providerCost: true,
            keyId: true, provisionedKeyId: true, paidAt: true, status: true },
});
```

### Day bucketing over rows (pure)

```ts
const buckets = new Map<string, DailyAggregate>();
for (const o of rows) {
  if (!o.paidAt) continue;
  const day = mskDayLabel(o.paidAt);          // instant → MSK label
  const b = buckets.get(day) ?? emptyAggregate(day);
  b.paidOrders += 1;
  b.paidCashRub += Math.max(0, o.finalAmount - o.balanceUsed);   // lib/revenue.ts cashOf
  if (o.kind === 'new') b.newOrders += 1;
  else if (o.kind === 'renew') b.renewOrders += 1;
  else b.upgradeOrders += 1;
  if (o.providerCost !== null) { b.providerCostRub += o.providerCost; b.providerCostOrders += 1; }
  buckets.set(day, b);
}
```

### Coverage flag (D-08) as a response field, not a column

```ts
const coverage = paidOrders === 0 ? null : providerCostOrders / paidOrders;
// UI: coverage === null → "—" ; else `${providerCostOrders} / ${paidOrders}`
```

### Waterfall reconciliation test (the one that catches modelling errors)

```ts
it('waterfall components reconcile to the MRR delta for every month', () => {
  const months = sampleMonths();               // e.g. 2026-06 … 2026-10
  for (let i = 1; i < months.length; i++) {
    const w = waterfallFor(months[i], orders);
    const delta = totalMrrAt(endOfMonth(months[i])) - totalMrrAt(endOfMonth(months[i - 1]));
    expect(w.new + w.expansion - w.contraction - w.churned).toBeCloseTo(delta, 6);
  }
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `createMany({ skipDuplicates: true })` | still present in the installed 7.10.0 client (`generated/prisma/models/*.ts:1038`), but newer Prisma docs describe `createAll(rows, { onConflict: 'skip', conflictOn: [...] })` | Prisma 7 docs, moving target | **Follow the generated client in this repo, not the docs page** — `db.orm.*` / `conflictOn` examples on prisma.io do not match the installed surface and will not compile |
| ORM-only writes | `$executeRaw` for the upsert | always | The only concurrency-safe absolute upsert here; `upsert()` per row would be N round-trips and still needs the absolute-value rule |
| Session-TZ SQL date math | JS-computed MSK labels | this phase | Removes a dev/prod divergence (`Asia/Vladivostok` vs UTC) |

**Deprecated/outdated in this repo's context:**
- `lib/referral-stats.ts:114-119` `bucketStart` uses local `setHours(0,0,0,0)`, and `components/admin/FunnelCharts.tsx` `isoDay` uses UTC — both are **not** MSK. Do not copy them; do not silently reuse them for analytics (out of scope to migrate them here).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | "Активные подписки" (ANL-01) counts **paid** active keys, excluding trials (`isTrial = true`, which have no order and therefore 0 ₽ MRR) | MRR Model | The KPI would either include free trials (inflating the count vs MRR) or exclude paid keys bought before history; needs owner confirmation in discuss/verify |
| A2 | ARPU denominator = all users (no blocked state exists in the schema) | ARPU/ARPPU | If a blocked flag is added later, ARPU silently changes meaning |
| A3 | Renewals extend the existing expiry (chain semantics) rather than restarting it | MRR Model | Waterfall months would shift for early renewals; provider behaviour observed so far is extension |
| A4 | Monthly waterfall = MSK calendar months (not rolling 30-day windows) | Waterfall | ANL-02 says "по месяцам"; if the owner means rolling windows, component labels would change |
| A5 | Cron at 03:05 (not 03:00) satisfies D-13 | Rollup/Cron | Backups occupy 03:00; if a literal 03:00 is required, expect overlapping dumps |
| A6 | `providerCost` for `new` orders without a stored device count uses `order.devices` (it is the purchased count) | providerCost Capture | Only matters for malformed historical rows |
| A7 | Goodwill ₽-equivalent = `days × (median daily tariff of the key's own term)` — Day 3 of the plan should confirm the conversion basis | Goodwill | A wrong basis misstates the goodwill figure; money metrics are unaffected (D-03) |

## Open Questions (RESOLVED)

1. **Goodwill day count for referral grants is unreconstructable.**
   - What we know: ticket compensations persist `days` (`prisma/schema.prisma:309-323`, `TicketCompensation.days`), but referral day grants write only `WalletTx { amount: 0, reason: "referral_days", refId }` and increment `User.bonusDays` (`lib/referrals.ts:446-455`) — the day count is **not stored**.
   - What's unclear: whether the project is willing to add `WalletTx.days Int?` in this migration to fix it forward (past rows stay unknown).
   - Recommendation: add the nullable column (additive, zero risk) and scope the historical number to ticket compensations only, labelled as such. Do not attempt to infer days from `bonusDays` diffs.
   - **RESOLVED:** goodwill is scoped to `TicketCompensation` rows only in 07-02 Task 1; referral day grants are excluded from the goodwill figure, and no `WalletTx.days` column is added. The resolution deliberately DIVERGES from the research recommendation (add the nullable column) — a scoped-reduced but additive-safe choice.

2. **Custom date range vs 7/30/90 only.**
   - What we know: CONTEXT §specifics says "7/30/90 + кастомный диапазон", but `PeriodSelector` and both admin panels currently support only the three presets, and `app/api/admin/referrals/stats/route.ts` already has the zod `from`/`to` + 366-day-cap pattern.
   - Recommendation: ship 7/30/90 for Phase 7 (matches every existing surface, keeps D-10's first screen small); the waterfall itself is month-granular and inherently a custom range of months.
   - **RESOLVED:** UI-SPEC + 07-05 ship 7/30/90 presets only — no custom from/to range control exists in Phase 7 (`?period=` accepts only 7|30|90, anything else normalizes to 30).

3. **`artemida.getBalance()` availability during the rollup.**
   - What we know: the balance chip already exists on `/admin` and `runBalanceAlert` in `lib/worker.ts:458` uses it.
   - What's unclear: whether a 03:05 provider outage is common enough to need a retry inside the cron run.
   - Recommendation: one attempt + `logger.warn`; the snapshot is a convenience series, not an invariant. Phase 8 can backfill gaps from `artemida_balance_snapshots` when runway matters.
   - **RESOLVED:** 07-02 Task 1 performs one attempt + `logger.warn` on failure; the rollup continues and the daily snapshot row is still written (convenience series, not an invariant).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | build/test/backfill | ✓ | `v24.15.0` | — |
| Local PostgreSQL | DB-backed unit tests | ✓ | `16.15` (prod is `postgres:17-alpine`) | — |
| `prisma` CLI + `prisma7.config.ts` | `migrate dev/deploy`, `migrate status` | ✓ | `7.10.0`; `migrate status` → 24 migrations, "Database schema is up to date!" | — |
| `test` DB role | shadow DB for `migrate dev` | ✓ | `rolcreatedb = t` | — |
| `tsx` | backfill script | ✓ in `deps` stage and (via `:49`) in the runner image | `^4.19.2` | `node --experimental-strip-types` for erasable-syntax-only scripts |
| Host cron | nightly trigger | ✓ (already used for backups) | — | manual `curl` to the route |
| `DATABASE_URL` in `.env.local` | local runs | ✗ (only `ARTEMIDA_API_KEY`, `ARTEMIDA_BASE_URL` present) | — | pass inline: `DATABASE_URL='postgresql://test:test@127.0.0.1:5432/test'` |
| context7 MCP | external doc lookups | ✗ (only the `gsd` MCP server is connected) | — | WebSearch/WebFetch (used) |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** `DATABASE_URL` locally (inline override), context7 (web search).

## Validation Architecture

> `workflow.nyquist_validation` is absent from `.planning/config.json` → treated as **enabled**.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest `5.0.3` (`environment: 'node'`, `fileParallelism: false`) |
| Config file | `vitest.config.ts` (alias `@` → repo root; dummy env incl. `CRON_SECRET`, `ADMIN_TELEGRAM_IDS: '910000101'`) |
| Quick run command | `DATABASE_URL='postgresql://test:test@127.0.0.1:5432/test' npx vitest run tests/unit/analytics-time.test.ts` |
| Full suite command | `DATABASE_URL='postgresql://test:test@127.0.0.1:5432/test' npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ANL-12 | Worker records provider cost on the order; quote failure still provisions and leaves `null` | unit (DB + `vi.spyOn(artemida,'createKey'/'getPricing')`) | `npx vitest run tests/unit/analytics-provider-cost.test.ts` | ❌ Wave 0 |
| ANL-12 | Customer order-history mapper never exposes cost | source-contract | `npx vitest run tests/unit/analytics-provider-cost.test.ts -t 'no leak'` | ❌ Wave 0 |
| ANL-15 | MSK label ↔ instant ↔ date-key round trips; month windows; Intl cross-check | unit (pure) | `npx vitest run tests/unit/analytics-time.test.ts` | ❌ Wave 0 |
| ANL-15 | `buildDailySeries` produces exact per-day cash/counts/coverage/activeKeys | unit (pure, fixture rows) | `npx vitest run tests/unit/analytics-series.test.ts` | ❌ Wave 0 |
| ANL-15 | Upsert is idempotent: run twice → identical row; concurrent runs → one row | integration (real DB) | `npx vitest run tests/unit/analytics-rollup.test.ts` | ❌ Wave 0 |
| ANL-15 | Cron route: 401 without secret, 503 when `CRON_SECRET` unset, 200 + idempotent with it | source-contract + DB | `npx vitest run tests/unit/analytics-cron-route.test.ts` | ❌ Wave 0 |
| ANL-15 | Backfill over a fixed history equals a manual recomputation and is re-runnable | integration (real DB) | `npx vitest run tests/unit/analytics-backfill.test.ts` | ❌ Wave 0 |
| ANL-01 | Per-key MRR: `new` order via `provisionedKeyId`, `renew` extension, expiry → 0, upgrade delta | unit (pure) | `npx vitest run tests/unit/analytics-mrr.test.ts` | ❌ Wave 0 |
| ANL-02 | Waterfall components reconcile exactly to ΔMRR for every month | unit (pure) | `npx vitest run tests/unit/analytics-waterfall.test.ts` | ❌ Wave 0 |
| ANL-03 | ARPU/ARPPU denominators; `—` on zero; no divide-by-zero | unit (pure + DB count) | `npx vitest run tests/unit/analytics-metrics.test.ts` | ❌ Wave 0 |
| D-11 | `/admin/analytics` re-checks role, `force-dynamic`, no cost/provider fields in props | source-contract | `npx vitest run tests/unit/admin-analytics-page.test.ts` | ❌ Wave 0 |
| — | i18n completeness for new keys | existing | `npx vitest run tests/unit/i18n.test.ts` | ✅ |

### Sampling Rate

- **Per task commit:** the single new test file for that task (all run in < 2 s except DB-backed ones, which are ~1 s each).
- **Per wave merge:** `npm test` (full suite; `fileParallelism: false` keeps DB fixtures deterministic).
- **Phase gate:** full suite green + one manual comprehension check (backfill output for a known day matches a hand-written SQL/`psql` query).

### Wave 0 Gaps

- [ ] `tests/unit/analytics-time.test.ts` — MSK helpers + Intl cross-check (no DB)
- [ ] `tests/unit/analytics-series.test.ts` — pure `buildDailySeries`
- [ ] `tests/unit/analytics-mrr.test.ts` — pure MRR chain incl. upgrade and new-order cases
- [ ] `tests/unit/analytics-waterfall.test.ts` — reconciliation identity
- [ ] `tests/unit/analytics-metrics.test.ts` — ARPU/ARPPU/coverage
- [ ] `tests/unit/analytics-rollup.test.ts` — DB idempotency + concurrency
- [ ] `tests/unit/analytics-backfill.test.ts` — DB range run
- [ ] `tests/unit/analytics-provider-cost.test.ts` — worker capture + leak guard
- [ ] `tests/unit/analytics-cron-route.test.ts` — auth + wiring
- [ ] `tests/unit/admin-analytics-page.test.ts` — role gate + no-leak contract
- [ ] Shared DB fixtures for unique `OWNER` telegram ids (follow `'200000310'` / `'200000320'` ranges already used) and a `cleanup()` in `beforeEach`/`afterAll`

*No framework install needed — Vitest is already configured.*

## Security Domain

`security_enforcement` is not disabled in `.planning/config.json` → this section is required.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (indirect) | Session cookie already verified by `requireTelegramSession`/`requireRole`; analytics adds no new credential |
| V3 Session Management | no | No new session surface |
| V4 Access Control | **yes** | `requireRole('administrator','manager')` re-run inside `app/admin/analytics/page.tsx`; `can(role,'analytics')` in `MATRIX`; `notFound()` for the rest (never a distinct 403 page) |
| V5 Input Validation | **yes** | `?period=` normalized to `7 | 90 | 30` (copy `app/admin/page.tsx:29-31`); any `from`/`to`/`granularity` input validated with zod + a 366-day cap (pattern: `app/api/admin/referrals/stats/route.ts`) |
| V6 Cryptography | yes | `timingSafeEqual` + length guard for `x-cron-secret`; never hand-rolled comparison |
| V7 Error handling / logging | yes | `logger.warn/error` with `route`, `outcome`, ids only; never provider payloads, never raw DB errors in the UI (`t('common.errorLoad')`) |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Privilege escalation via RSC payload (client fetches `/admin/analytics` RSC directly, skipping the layout guard) | Elevation of Privilege | Re-run `requireRole` in the page; assert in a source-contract test |
| Cron endpoint abuse / open route when the secret is unset | Spoofing / DoS | 503 when `CRON_SECRET` is empty, 401 otherwise, `timingSafeEqual` |
| Heavy backfill exposed over HTTP | DoS | CLI-only script (D-14); no route, no admin button |
| Cost/provider data leaking to customers | Information Disclosure | Admin-only `AdminPaymentRow`; `toHistoryRow` untouched; contract test |
| SQL injection via day/range inputs | Tampering | Parameterized `$executeRaw`/`$queryRaw` only; static SQL text; never string-interpolate a day |
| Unbounded query cost on the analytics page | DoS | Period capped at 90 days for KPI; waterfall limited to 12 months; `daily_metrics` is one row per day |
| Log-based secret leakage | Information Disclosure | Log ids/outcomes only; never `DATABASE_URL`, `ARTEMIDA_API_KEY`, or provider response bodies |

## Sources

### Primary (HIGH confidence — read or executed this session)

- `node_modules/@prisma/adapter-pg/dist/index.js:360-402` — `mapArg` / `formatDate` / `formatDateTime`: the Date-serialization rule that makes the MSK bucket a parameter-formatting concern.
- Empirical probes (Prisma 7.10.0 + `@prisma/adapter-pg` + local Postgres 16.15, `DATABASE_URL=postgresql://test:test@127.0.0.1:5432/test`):
  - `date`/`timestamptz`/`timestamp` return types and round-trips; `'2026-10-19T21:00:00Z'` into `date` → **2026-10-19** (off-by-one).
  - `INSERT … ON CONFLICT DO UPDATE` idempotency; 12 concurrent same-key upserts, 0 conflicts; duplicate key in one statement → PG `21000`; `unnest` multi-row upsert returning `Date`.
  - `SHOW TimeZone` → `Asia/Vladivostok`; `'2026-10-19'::timestamptz` → `2026-10-19 00:00:00+10`.
  - `count(*)` → `bigint`, `sum()` → `null` on empty, `::int` → `number`.
  - `to_regclass` → `DriverAdapterError UnsupportedNativeDataType`.
  - Europe/Moscow fixed `+03:00` vs `Intl` over 2020–2030: **0 mismatches**; perf 86 ms vs 32 ms per 100k.
- Source files read verbatim this session: `prisma/schema.prisma:145-240, 309-323, 506-518`; `lib/revenue.ts:1-105`; `lib/orders-service.ts:112-226, 315-326, 370-483`; `lib/worker.ts:104-173`; `lib/artemida.ts:205-268, 550-566`; `lib/pricing.ts:94-125`; `lib/admin-auth.ts:30-70`; `lib/admin-service.ts:370-376`; `lib/referrals.ts:446-455`; `app/admin/page.tsx:1-45`; `app/admin/layout.tsx:22`; `components/admin/AdminNav.tsx:1-60`; `components/admin/RevenuePanel.tsx:1-30`; `components/admin/PeriodSelector.tsx:1-40`; `app/api/orders/route.ts:160-196`; `app/api/cron/reconcile/route.ts:1-42`; `Dockerfile:1-52`; `docker-compose.prod.yml`; `vitest.config.ts`; `lib/i18n/index.ts:1-40`; `tests/unit/i18n.test.ts:1-60`; `docs/DEPLOY.md:118-140`; `prisma/migrations/20261019234438_ticket_unread_for_admin/migration.sql`.
- `.planning/phases/07-analytics-foundation-revenue-metrics/07-CONTEXT.md`; `.planning/REQUIREMENTS.md:17-31`; `.planning/ROADMAP.md:31-46`.

### Secondary (MEDIUM confidence)

- Prisma docs — `@db.Date` maps to PostgreSQL `date`, `DateTime` defaults to `timestamp(3)`, Client returns `Date`: https://www.prisma.io/docs/orm/v7/reference/prisma-schema-reference
- Prisma docs — native type system: https://www.prisma.io/docs/orm/prisma-client/type-safety/prisma-type-system
- PostgreSQL 18 `INSERT … ON CONFLICT` semantics (arbiter inference, `DO UPDATE` determinism, "cannot affect row a second time"): https://www.postgresql.org/docs/current/sql-insert.html

### Tertiary (LOW confidence)

- Prisma "Writing data" page describing `db.orm.*` / `conflictOn` / `createAll({ onConflict: 'skip' })` — **does not match the installed 7.10.0 generated client** (which exposes `createMany({ skipDuplicates })` and classic `upsert({ where, create, update })`); treat as a docs-vs-install drift and follow the generated types.

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** — zero new packages; versions read from `package.json`, generated client, and the installed adapter source.
- Architecture: **HIGH** — insertion points, mappers, role gate, cron shape, and container/deploy topology all read from source; upsert/timezone behaviour proven by probe.
- Pitfalls: **HIGH** — 8 of 12 are empirically demonstrated, the rest are source-verified (mapper sharing, Dockerfile copy gap, i18n test contract, `Extract<>` non-exhaustiveness).
- MRR/waterfall model: **MEDIUM-HIGH** — the mechanics are deterministic and testable, but the interpretation (upgrade deltas, renewal chaining, trial exclusion) closes gaps that CONTEXT leaves open; flagged in A1/A3/A4 for confirmation.

**Research date:** 2026-10-20
**Valid until:** 2026-11-19 (30 days — schema/stack are pinned; re-verify only if Prisma is upgraded to 8.x or the adapter's Date formatting changes)
