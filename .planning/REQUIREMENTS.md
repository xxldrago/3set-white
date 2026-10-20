# Requirements — 3set-white

## v1.0 Requirements (complete)

Delivered in milestone v1.0 (phases 1–6, archived at
`.planning/milestones/v1.0-phases/`): TRIAL-01..03, PAY-01..05, CAB-01..05,
SUP-01..03, ADM-01..04, OPS-01..03, AUTH-01..06 (29 requirements) plus the
post-roadmap gap closures (RBAC roles page, admin inbox 2.0, ticket
compensation/reply templates/requester context).

---

## Milestone v1.1 Requirements: Расширенная аналитика

### ANL — Core metrics & unit economics

- [ ] **ANL-01**: Админ видит MRR и ARR за выбранный период — сумма monthly-equivalent активных подписок (`finalAmount / (days / 30)`), вместе с числом активных подписок
- [ ] **ANL-02**: Админ видит MRR-waterfall по месяцам: new / expansion / contraction / churned MRR и net change
- [ ] **ANL-03**: Админ видит ARPU (выручка / все зарегистрированные) и ARPPU (выручка / платящие) за период
- [ ] **ANL-04**: Админ видит LTV gross — исторический (cumulative revenue на платящего) и прогнозный (ARPPU ÷ месячный churn)
- [ ] **ANL-05**: Админ видит LTV net (выручка минус расход провайдера) после появления `Order.providerCost`
- [ ] **ANL-06**: Админ видит renewal rate — доля продлённых подписок от числа истекающих в периоде (`kind = renew`)
- [ ] **ANL-07**: Админ видит logo churn (истёкшие и не продлённые за grace-период) и revenue churn по подпискам
- [ ] **ANL-08**: Админ видит воронку оплаты `pending → paid → provisioning → provisioned` с конверсией и отвалом на каждом шаге
- [ ] **ANL-09**: Админ видит разбивку `failed`/`canceled` по `errorCode` с количеством и долей
- [ ] **ANL-10**: Админ видит медианное и среднее время `createdAt → paidAt` и `paidAt → provisioned`
- [ ] **ANL-11**: «Expired» считается как `pending` старше платёжного окна (без нового статуса в стейт-машине)
- [ ] **ANL-12**: Система сохраняет расход провайдера на заказ (`Order.providerCost`) в момент provisioning
- [ ] **ANL-13**: Админ видит gross margin (`Σ(finalAmount − providerCost)`), маржинальность в % и средний расход на ключ
- [ ] **ANL-14**: Система снимает снапшоты `GET /balance` и показывает burn-rate и прогноз runway (баланс ÷ средний дневной расход, дней)
- [ ] **ANL-15**: Метрики считаются nightly-джобом в `daily_metrics` (cron 03:00) с возможностью backfill истории

### COH — Cohorts & retention

- [ ] **COH-01**: Админ видит когортную матрицу (месяц регистрации × месяц N) — доля аккаунтов с активной платной подпиской
- [ ] **COH-02**: Админ видит revenue retention по когортам (выручка месяца N относительно первого платного месяца)
- [ ] **COH-03**: Админ видит когорты в разрезе канала привлечения (реферальный код / промокод / органика)
- [ ] **COH-04**: Админ видит когорты в разрезе тарифа по числу устройств
- [ ] **COH-05**: Админ видит когорты по месяцу первой оплаты (payer revenue cohorts)

### SEG — RFM segments & targeting

- [ ] **SEG-01**: Система считает для каждого пользователя Recency / Frequency / Monetary и сохраняет в `user_rfm` с ежедневным обновлением
- [ ] **SEG-02**: Админ видит именованные сегменты (trial-only, new payer, active, at-risk, churned, sleeping, VIP) с размером каждого
- [ ] **SEG-03**: Админ видит размер сегмента и может провалиться в список пользователей, отфильтрованный по сегменту
- [ ] **SEG-04**: Админ выбирает сегмент как аудиторию рассылки с предпросмотром числа получателей
- [ ] **SEG-05**: Пороги сегментов конфигурируемы (не захардкожены) и меняются без деплоя

## Future Requirements (deferred — not in v1.1)

Explicitly requested by the owner but deferred by scope decision on 2026-10-20.

### PRM — Promo / referral quality & fraud

- **PRM-01**: Воронка click → register → pay по каждому коду и партнёру
- **PRM-02**: Стоимость скидки против выручки и ROI по каждому промокоду
- **PRM-03**: Partner ROI с учётом выплат (`Withdrawal`)
- **PRM-04**: Fraud-сигналы: trial-фермы по `ipHash`/`emailCanonical`, self-cycles, trial→no-pay ratio по источнику

### ALR — Period comparison & anomaly alerts

- **ALR-01**: WoW/MoM-сравнение для каждой метрики (дельта и %)
- **ALR-02**: Алерты: падение оплат, рост `failed`, всплеск тикетов
- **ALR-03**: Алерт на runway баланса ниже порога
- **ALR-04**: Доставка алертов админам через существующий outbox/Telegram

### EXT — Extra analytics

- **EXT-01**: Save-list истекающих ключей (≤7 дней без продления) с push-напоминанием через `cron/remind`
- **EXT-02**: Upsell-radar — тяжёлые по трафику/устройствам пользователи на низком тарифе
- **EXT-03**: Refund/chargeback учёт и net revenue
- **EXT-04**: Корреляция тикетов и churn
- **EXT-05**: Data-quality флаги (degraded-ответы ARTEMIDA исключаются из агрегатов)
- **EXT-06**: CSV-экспорт по каждому отчёту
- **EXT-07**: Metric dictionary — страница с определением каждой формулы

### v2 (from v1.0 roadmap)

- **GRO-01**: Реферальная программа (награда после CONFIRMED-платежа реферала)
- **GRO-02**: Промокоды и подарочные подписки
- **GRO-03**: Автопродление (Platega recurrent + dunning)
- **EXP-01**: Английская локализация
- **EXP-02**: Оплата криптой
- **EXP-03**: Страница статуса серверов

## Out of Scope

| Feature | Reason |
|---------|--------|
| Внутренний баланс/кошелек юзера | Удваивает платежные состояния, оплата сразу за ключ |
| Лимитные тарифы трафика в v1 | Споры по учету = нагрузка на поддержку, по умолчанию безлимит |
| Ручные переводы карта-карта со скриншотом | Нет мгновенной выдачи, убивает core value |
| Безлимит устройств по умолчанию | Абуз шеринга, прайсинг ARTEMIDA per-device |
| Renew/upgrade trial-ключей в UI | API запрещает (409), только CTA «купить полный» |
| Self-service permanent delete ключа юзером | Необратимо без возврата, только админ с подтверждением |
| Нативные мобильные приложения | Весь рынок CIS живет на sub-link + сторонние клиенты |
| EN в v1.1 | Только RU/RUB, EN позже |
| Внешний BI / data warehouse (Metabase, ClickHouse) | Один сервер, объёмы малы; Postgres + rollup-таблицы достаточно |
| Ad-hoc query builder в админке | Избыточно для 3 отчётов; фиксированные вьюхи + CSV-экспорт |
| Аналитика по отдельным устройствам/сессиям | ARTEMIDA отдаёт только агрегаты по ключу |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| ANL-01 | Phase 7 | Pending |
| ANL-02 | Phase 7 | Pending |
| ANL-03 | Phase 7 | Pending |
| ANL-04 | Phase 8 | Pending |
| ANL-05 | Phase 8 | Pending |
| ANL-06 | Phase 8 | Pending |
| ANL-07 | Phase 8 | Pending |
| ANL-08 | Phase 9 | Pending |
| ANL-09 | Phase 9 | Pending |
| ANL-10 | Phase 9 | Pending |
| ANL-11 | Phase 9 | Pending |
| ANL-12 | Phase 7 | Pending |
| ANL-13 | Phase 8 | Pending |
| ANL-14 | Phase 8 | Pending |
| ANL-15 | Phase 7 | Pending |
| COH-01 | Phase 10 | Pending |
| COH-02 | Phase 10 | Pending |
| COH-03 | Phase 10 | Pending |
| COH-04 | Phase 10 | Pending |
| COH-05 | Phase 10 | Pending |
| SEG-01 | Phase 11 | Pending |
| SEG-02 | Phase 11 | Pending |
| SEG-03 | Phase 11 | Pending |
| SEG-04 | Phase 11 | Pending |
| SEG-05 | Phase 11 | Pending |
