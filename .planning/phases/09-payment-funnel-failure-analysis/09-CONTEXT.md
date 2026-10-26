---
phase: "09"
name: "Payment Funnel & Failure Analysis"
gathered: "2026-10-26"
status: "ready-for-research"
---

# Phase 9: Payment Funnel & Failure Analysis — Context

**Requirements:** ANL-08, ANL-09, ANL-10, ANL-11
**Depends on:** Phase 7 (rollup, `daily_metrics`, `lib/analytics/` patterns)
**Mode:** mvp

## Domain

Фаза добавляет на `/admin/analytics` три новых блока ниже существующих (LTV, margin, burn, retention):
1. **Payment funnel** — воронка `pending → paid → provisioning → provisioned` с конверсией и отвалом на каждом шаге.
2. **Error code breakdown** — разбивка `failed`/`canceled` по `errorCode` с количеством и долей.
3. **Timing metrics** — медианное и среднее время `createdAt → paidAt` и `paidAt → provisioned` (только успешные цепочки).
4. **Expired count** — отдельная метрика: количество `pending` заказов старше 24 часов (без изменения статусов в БД).

**Не входит:** изменение `OrderStatus` enum, добавление нового статуса `expired`, автоматический transition pending→expired.

## Decisions

### Payment window
- **D-01:** Payment window = **24 часа** (`24 * 60 * 60 * 1000` ms). `expired` = `status === 'pending' && createdAt < now - 24h`. Значение захардкожено в коде как константа `PAYMENT_WINDOW_MS = 24 * 60 * 60 * 1000` — не выносится в env.
- **Reversibility:** reversible — константу можно менять без миграции.

### Funnel visualization
- **D-02:** Воронка = **4 карточки в ряд** (`GRID` из `MetricCard.tsx`), каждая показывает: step name, count, conversion % от предыдущего шага, drop-off % (от предыдущего шага). Пустые шаги (0 orders) = «—».
- **Reversibility:** reversible.

### Error code breakdown
- **D-03:** Group by raw `errorCode` value from `Order.errorCode` (string, nullable). Show count + percent of total failed+canceled. Group `null` errorCode as «unknown». Sort by count descending.
- **Reversibility:** reversible.

### Timing metrics
- **D-04:** Include **only successful chains**: `pending → paid → provisioned`. Exclude `failed`, `canceled`, `refunded`, `expired` (still pending), and orders where `paidAt` or `provisionedKeyId` is null. Two metrics: `medianCreatedAtToPaidAt` and `medianPaidAtToProvisioned` (plus mean as secondary).
- **Reversibility:** reversible — logic is pure computation over existing fields.

### UI placement
- **D-05:** Three new `<AnalyticsSection>` blocks appended **below** existing retention section. Same pattern as Phase 8: async server component, own try/catch, five Suspense boundaries total (three new).
- **Reversibility:** reversible — additive markup.

### Period selector
- **D-06:** Funnel, error breakdown, and timing all use the **same `?period`** as the rest of the page (7 | 30 | 90 MSK days). Expired count is a point-in-time metric (not windowed — always shows current expired).
- **Reversibility:** reversible.

## The Agent's Discretion
- Exact SQL queries for funnel aggregation (can use `prisma.order.findMany` or `$queryRaw`).
- Whether to compute median in SQL (`PERCENTILE_CONT`) or in JS.
- Naming of new i18n keys (follow Phase 7/8 pattern: `analyticsFunnel*`, `analyticsError*`, `analyticsTiming*`, `analyticsExpired*`).
- Skeleton component for loading state (reuse `CardsSkeleton`).

## Deferred Ideas
- Автоматический transition `pending → expired` (new status) — **out of scope**, would require schema migration + state machine change.
- Export funnel data to CSV — future phase.
- Funnel by tariff/devices — future cohort phase (Phase 10).
- Real-time webhook для алерта на высокий отвал — future ALR phase.

## Canonical Refs

**Downstream agents MUST read these before planning or implementing.**

- `.planning/ROADMAP.md` §Phase 9
- `.planning/REQUIREMENTS.md` — ANL-08, ANL-09, ANL-10, ANL-11
- `.planning/phases/07-analytics-foundation-revenue-metrics/07-CONTEXT.md` — D-01..D-15 (rollup patterns, MSK discipline)
- `.planning/phases/08-unit-economics-retention/08-CONTEXT.md` — D-01..D-20 (UI patterns, analytics page structure)
- `.planning/phases/08-unit-economics-retention/08-UI-SPEC.md` — §6.1 composition, §6.7 payload shapes, `AnalyticsSection` pattern
- `lib/orders-service.ts` — `OrderStatus` enum, state transitions, `errorCode` handling
- `lib/platega.ts` — `PlategaError` codes, callback handling
- `app/admin/analytics/page.tsx` — current page structure, `requireRole` guard, `PeriodSelector`
- `components/admin/{MetricCard,AnalyticsKpi,PeriodSelector,AnalyticsSection}.tsx` — reuse patterns
- `lib/analytics/{series,mrr,service,time}.ts` — existing analytics helpers
- `prisma/schema.prisma` — `Order` model, `OrderStatus` enum
