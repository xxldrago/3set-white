# Roadmap: 3set-white — сервис продажи VPN

## Milestones

- ✅ **v1.0 MVP** — Phases 1-6 (shipped 2026-10-06; phases archived at `.planning/milestones/v1.0-phases/`)
- 🚧 **v1.1 Расширенная аналитика** — Phases 7-11 (in progress)

## Overview

Milestone v1.1 превращает одинокое число «выручка за период» в измеримую картину бизнеса. Сначала появляется фундамент rollup-таблиц (`daily_metrics`, `artemida_balance_snapshots`) и сохраняется стоимость провайдера на каждом заказе — без этого юнит-экономика невозможна. Затем на этом фундаменте вырастают метрики выручки, удержания, воронки платежей и экономики провайдера, потом когорты (по регистрации, первой оплате, каналу и числу устройств) и, наконец, RFM-сегменты с таргетингом рассылок. Историческая глубина восстанавливается backfill-скриптом; пересчёт — nightly-джобом 03:00.

## Phases

**Phase Numbering:**

- Integer phases (7, 8, 9): Planned milestone work
- Decimal phases (8.1, 8.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

Numbering continues from v1.0 (last phase = 6).

- [x] **Phase 7: Analytics Foundation & Revenue Metrics** - `daily_metrics` rollup, nightly cron 03:00 + backfill, `Order.providerCost`; MRR/ARR, MRR-waterfall, ARPU/ARPPU (completed 2026-10-21)
- [x] **Phase 8: Unit Economics & Retention** - LTV gross/net, renewal rate, logo/revenue churn, gross margin, средний расход на ключ, burn-rate и runway (completed 2026-10-26)
- [x] **Phase 9: Payment Funnel & Failure Analysis** - Воронка `pending→paid→provisioning→provisioned`, `errorCode`, время до оплаты/выдачи, `expired` = pending-by-age (completed 2026-10-29)
- [x] **Phase 10: Cohorts & Retention Analytics** - Когортная матрица, revenue retention, срезы по каналу и числу устройств, когорты по месяцу первой оплаты (completed 2026-10-29)
- [ ] **Phase 11: RFM Segments & Targeting** - Ежедневный `user_rfm`, именованные сегменты, drill-down в список, сегмент как аудитория рассылки, настраиваемые пороги

## Phase Details

### Phase 7: Analytics Foundation & Revenue Metrics

**Goal**: As an admin, I want to see business revenue dynamics (MRR/ARR, waterfall, ARPU/ARPPU) with daily/historical rollups in `daily_metrics` and per-order provider cost at provisioning, so that I can track revenue and unit economics without manual SQL.
**Mode:** mvp
**Depends on**: Nothing (first phase of milestone v1.1; переиспользует админ-поверхность и `/api/cron/*` из v1.0)
**Requirements**: ANL-12, ANL-15, ANL-01, ANL-02, ANL-03
**Success Criteria** (what must be TRUE):

  1. Админ открывает `/admin/analytics` и видит MRR и ARR за выбранный период вместе с числом активных подписок
  2. Админ видит MRR-waterfall по месяцам: new / expansion / contraction / churned MRR и net change
  3. Админ видит ARPU (выручка / все зарегистрированные) и ARPPU (выручка / платящие) за период
  4. Метрики за любой прошлый день совпадают с ручной сверкой: полный backfill восстанавливает историю, а nightly-джоб (cron 03:00) наполняет `daily_metrics` без деплоя
  5. У каждого заказа, прошедшего provisioning, в админке видна зафиксированная в момент выдачи стоимость провайдера (`providerCost`)

**Plans**: TBD
**UI hint**: yes

### Phase 8: Unit Economics & Retention

**Goal**: Админ видит, сколько приносит подписчик и сколько остаётся после расходов провайдера, плюс удержание по продлениям, оттоку и остатку баланса
**Mode:** mvp
**Depends on**: Phase 7
**Requirements**: ANL-04, ANL-05, ANL-06, ANL-07, ANL-13, ANL-14
**Success Criteria** (what must be TRUE):

  1. Админ видит LTV gross — исторический (cumulative revenue на платящего) и прогнозный (ARPPU ÷ месячный churn)
  2. Админ видит LTV net (выручка минус расход провайдера) и может сравнить его с LTV gross
  3. Админ видит renewal rate — долю продлённых подписок от числа истекающих в периоде (`kind = renew`)
  4. Админ видит logo churn и revenue churn по подпискам за период
  5. Админ видит gross margin, маржинальность в % и средний расход на ключ, а также burn-rate и прогноз runway в днях по снапшотам `GET /balance`

**Plans**: 3 plans
**UI hint**: yes

Plans:
**Wave 1**

- [x] 08-01-PLAN.md — Pure derivation core: retention.ts (term events, grace, retention window) + economics.ts (LTV/margin/burn/runway) + pure test suites

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 08-02-PLAN.md — Five §6.7 loaders in service.ts (loadLtv/loadMargin/loadBurnRunway/loadRetention/loadChurnTable) + trailingMonthLabels + DB-backed loader tests

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 08-03-PLAN.md — Two page sections: five async server components + AnalyticsSection + 43 i18n keys + page-contract test

### Phase 9: Payment Funnel & Failure Analysis

**Goal**: Админ видит, где и почему отваливаются платежи и сколько времени занимает путь от создания заказа до выдачи ключа
**Mode:** mvp
**Depends on**: Phase 7
**Requirements**: ANL-08, ANL-09, ANL-10, ANL-11
**Success Criteria** (what must be TRUE):

  1. Админ видит воронку `pending → paid → provisioning → provisioned` с конверсией и отвалом на каждом шаге
  2. Админ видит разбивку `failed`/`canceled` по `errorCode` с количеством и долей
  3. Админ видит медианное и среднее время `createdAt → paidAt` и `paidAt → provisioned`
  4. Админ видит «expired» как `pending` старше платёжного окна — отдельной метрикой, без изменения статусов заказов

**Plans**: 3 plans
**UI hint**: yes

Plans:
**Wave 1**

- [x] 09-01-PLAN.md — Pure derivation core: funnel.ts (funnel stage counts, 24h expired window, errorCode breakdown, timing median/mean) + pure test suite

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 09-02-PLAN.md — Five §9 loaders in service.ts (loadFunnel/loadExpired/loadErrorBreakdown/loadTimeToPay/loadTimeToProvision) + DB-backed loader tests

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 09-03-PLAN.md — Three page sections: five async server components + 31 i18n keys + page-contract test + phase-8 contract Suspense-count update

### Phase 10: Cohorts & Retention Analytics

**Goal**: Админ видит когорты по месяцу регистрации и месяцу первой оплаты с удержанием выручки в разрезах канала привлечения и числа устройств
**Mode:** mvp
**Depends on**: Phase 7
**Requirements**: COH-01, COH-02, COH-03, COH-04, COH-05
**Success Criteria** (what must be TRUE):

  1. Админ видит когортную матрицу (месяц регистрации × месяц N) — долю аккаунтов с активной платной подпиской
  2. Админ видит revenue retention по когортам (выручка месяца N относительно первого платного месяца)
  3. Админ видит когорты в разрезе канала привлечения: реферальный код / промокод / органика
  4. Админ видит когорты в разрезе тарифа по числу устройств
  5. Админ видит revenue-когорты по месяцу первой оплаты (payer cohorts)

**Plans**: 3 plans
**UI hint**: yes

### Phase 11: RFM Segments & Targeting:

**Goal**: Админ видит RFM-сегменты пользователей и может использовать сегмент как аудиторию рассылки
**Mode:** mvp
**Depends on**: Phase 7
**Requirements**: SEG-01, SEG-02, SEG-03, SEG-04, SEG-05
**Success Criteria** (what must be TRUE):

  1. Система ежедневно пересчитывает Recency / Frequency / Monetary каждого пользователя и сохраняет в `user_rfm`
  2. Админ видит именованные сегменты (trial-only, new payer, active, at-risk, churned, sleeping, VIP) с размером каждого
  3. Админ проваливается в сегмент и видит список пользователей, отфильтрованный по нему
  4. Админ выбирает сегмент как аудиторию рассылки и видит предпросмотр числа получателей до отправки
  5. Админ меняет пороги сегментов без деплоя, и размеры сегментов пересчитываются

**Plans**: 3 plans
**UI hint**: yes

Plans:
**Wave 1**
- [ ] 11-01-PLAN.md — Pure RFM derivation + thresholds helpers + user_rfm migration (gated by D-10 checkpoint)
**Wave 2** *(blocked on Wave 1)*
- [ ] 11-02-PLAN.md — rfm-service loaders + cron route + backfill + DB identity tests
**Wave 3** *(blocked on Wave 2)*
- [ ] 11-03-PLAN.md — /admin/segments page + cards + thresholds form + count/thresholds routes + broadcast targeting + users drill-down + 34 i18n keys + contract tests

## Progress

**Execution Order:**
Phases execute in numeric order: 7 → 8 → 9 → 10 → 11

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 7. Analytics Foundation & Revenue Metrics | v1.1 | 5/5 | Complete    | 2026-10-21 |
| 8. Unit Economics & Retention | v1.1 | 3/3 | Complete    | 2026-10-26 |
| 9. Payment Funnel & Failure Analysis | v1.1 | 3/3 | Complete    | 2026-10-29 |
| 10. Cohorts & Retention Analytics | v1.1 | 3/3 | Complete    | 2026-10-29 |
| 11. RFM Segments & Targeting | v1.1 | 0/0 | Not started | - |

<details>
<summary>✅ v1.0 MVP (Phases 1-6) — SHIPPED 2026-10-06</summary>

Archived. Full phase details and plans: `.planning/milestones/v1.0-phases/`.

- Phase 1-6: Foundation, Keys & Trial, Payments, Support & Retention, Admin & Deploy, Email Auth

</details>
