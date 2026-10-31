# Roadmap: 3set-white — сервис продажи VPN

## Milestones

- ✅ **v1.0 MVP** — Phases 1-6 (shipped 2026-10-06) — [archive](milestones/v1.0-ROADMAP.md)
- ✅ **v1.1 Расширенная аналитика** — Phases 7-11 (shipped 2026-10-31) — [archive](milestones/v1.1-ROADMAP.md)
- 🚧 **v1.2 Стабилизация и качество** — Phases 12-16 (in progress)

## Overview

Milestone v1.2 стабилизирует аналитику, построенную в v1.1, и превращает её из «посмотреть цифры» в «вовремя среагировать». Сначала появляется фундамент корректности: сравнение периодов (WoW/MoM) и флаги качества данных, чтобы ни один алерт и ни один отчёт не опирался на degraded-ответы ARTEMIDA. На этом фундаменте строятся аномальные алерты с доставкой через существующий outbox/Telegram, затем — качество привлечения (воронка промокодов и рефералов, ROI, fraud-сигналы), затем — действия по удержанию (save-list истекающих ключей и upsell-радар), и в конце — выгрузка и документация (CSV по каждому отчёту, метрический словарь).

## Phases

**Phase Numbering:**

- Integer phases (12, 13, 14): Planned milestone work
- Decimal phases (12.1, 12.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

Numbering continues from v1.1 (last phase = 11).

- [ ] **Phase 12: Period Comparison & Data-Quality Foundation** - WoW/MoM-дельта и % для каждой метрики, флаги degraded-ответов ARTEMIDA, исключение их из агрегатов
- [ ] **Phase 13: Anomaly Alerts** - Алерты на падение оплат, рост `failed`, всплеск тикетов и runway ниже порога; доставка через outbox/Telegram
- [ ] **Phase 14: Promo & Referral Quality + Fraud** - Воронка click → register → pay, ROI промокодов и партнёров с учётом выплат, fraud-сигналы
- [ ] **Phase 15: Expiry Save-List & Upsell Radar** - Save-list ключей, истекающих ≤7 дней, с push-напоминанием; радар тяжёлых пользователей на низком тарифе
- [ ] **Phase 16: CSV Export & Metric Dictionary** - CSV-экспорт по каждому отчёту, страница словаря метрик с формулами

## Phase Details

### Phase 12: Period Comparison & Data-Quality Foundation

**Goal**: As an admin, I want every analytics metric to show its WoW/MoM delta and to know when a metric is computed from degraded ARTEMIDA responses, so that I can trust the numbers and spot regressions before they become alerts.
**Mode:** mvp
**Depends on**: Nothing (first phase of milestone v1.2; переиспользует `lib/analytics/*` и `/api/cron/analytics` из v1.1)
**Requirements**: ALR-01, EXT-05 (+ capture-only основания для PRM-01/PRM-04; доставка самих требований — в Phase 14)
**Success Criteria** (what must be TRUE):

  1. Каждая метрика на `/admin/analytics` показывает дельту к предыдущей неделе и предыдущему месяцу (абсолют и %), с корректным поведением при нулевой базе
  2. Сравнение периодов считается на MSK-границах и совпадает с ручной сверкой двух соседних периодов
  3. Неполный текущий день не сравнивается с полным периодом: сравнение помечается `partial`, а при несопоставимом покрытии результат — `incomparable`, а не число
  4. Ответы ARTEMIDA, помеченные как degraded (таймаут/ошибка/частичные данные), фиксируются флагом и не попадают в агрегаты — это видно в UI
  5. Degraded-прогон rollup не может перезаписать здоровые значения `daily_metrics` (write-guard монотонности/качества)
  6. Метрика, затронутая degraded-данными, помечена в админке, и её значение можно объяснить (сколько записей исключено)
  7. Существующие значения v1.1 не меняются на «здоровых» данных (регрессионная сверка)
  8. Захват, который нельзя восстановить задним числом, запущен уже здесь: клики по промокодам (generic + партнёрские) и `User.signupIpHash` (sha256, без сырого IP, литерал `"direct"` исключён)
  9. `lib/analytics/metric-registry.ts` содержит каждую метрику (id, label, формула, источник, направление, ограничения) — единый источник для дашбордов и будущего словаря

**Plans**: TBD
**UI hint**: yes

### Phase 13: Anomaly Alerts

**Goal**: Админ получает алерты, когда бизнес-метрики выходят за порог, а не узнаёт об этом из ручного просмотра дашборда
**Mode:** mvp
**Depends on**: Phase 12
**Requirements**: ALR-02, ALR-03, ALR-04
**Success Criteria** (what must be TRUE):

  1. Алерт срабатывает при падении оплат относительно предыдущего периода и при росте доли `failed` платежей
  2. Алерт срабатывает при всплеске новых тикетов относительно базовой линии
  3. Алерт срабатывает, когда runway баланса ARTEMIDA ниже настраиваемого порога (порог в `Setting`, меняется без деплоя)
  4. Алерты доставляются админам (`administrator`; manager — нет) через существующий outbox/Telegram, дедуплицируются по `(type, windowLabel)` и не спамят при повторном запуске cron
  5. Админ видит историю сработавших алертов (`firing → resolved`) и может отключить/включить каждый тип без деплоя
  6. Тихие часы 22:00–09:00 MSK и лимит ≤3 DM/сутки соблюдаются через отложенную отправку (deferral), а не молчаливое отбрасывание

**Plans**: TBD
**UI hint**: yes

### Phase 14: Promo & Referral Quality + Fraud

**Goal**: Владелец видит, какие промокоды и партнёры реально приносят деньги, и какие источники трафика выглядят как fraud
**Mode:** mvp
**Depends on**: Phase 12
**Requirements**: PRM-01, PRM-02, PRM-03, PRM-04
**Success Criteria** (what must be TRUE):

  1. По каждому промокоду (generic и партнёрскому) и партнёру видна воронка click → register → pay с конверсиями на каждом шаге
  2. По каждому промокоду видна стоимость скидки, выручка и ROI за период (ROI по атрибуции, с разделением new/returning — не «инкрементальный»)
  3. Partner ROI считается с учётом выплат (`Withdrawal`), а не только начислений; cash position = accrued − pending − approved
  4. Fraud-сигналы P1 (только наблюдение, без авто-банов): self-dealing промокод (`PromoCode.ownerUserId == Order.userId`), mutual referral pairs, trial→no-pay ratio по источнику; «trial-фермы по emailCanonical» переформулированы как кластеры заблокированных регистраций (поле `unique`, настоящих кластеров быть не может)
  5. Все показатели считаются на MSK-периодах и исключают degraded-данные из Phase 12

**Deferred (P2)**: детекция IP-кластеров/ферм по `signupIpHash` — данные копятся с Phase 12, отчёт выносится отдельно после недель наблюдений

**Plans**: TBD
**UI hint**: yes

### Phase 15: Expiry Save-List & Upsell Radar

**Goal**: Админ видит, кого можно удержать до истечения подписки и кому предложить апгрейд, и может отправить им напоминание
**Mode:** mvp
**Depends on**: Phase 13 (outbox/notify), Phase 14 (источники и сегменты)
**Requirements**: EXT-01, EXT-02
**Success Criteria** (what must be TRUE):

  1. Админ видит save-list ключей, истекающих в ближайшие 7 дней и не продлённых, с контактом владельца
  2. Напоминание об истечении отправляется поэтапно T-7 / T-3 / T-1 через `cron/remind`/outbox, идемпотентно по ключу, стадии и единому MSK-ключу дня (не UTC, иначе двойная отправка в 00:30 vs 03:05 MSK); `autorenew.ts` (money path) не расширяется
  3. Upsell-радар показывает пользователей с высоким трафиком/числом устройств на низком тарифе с оценкой потенциального апгрейда
  4. Оба списка фильтруются по периоду/сегменту и ведут в карточку пользователя/ключа
  5. Массовая отправка из save-list/upsell использует существующий broadcast-механизм с предпросмотром числа получателей

**Plans**: TBD
**UI hint**: yes

### Phase 16: CSV Export & Metric Dictionary

**Goal**: Любой отчёт можно выгрузить в CSV, а каждая формула на дашборде объяснена на странице словаря метрик
**Mode:** mvp
**Depends on**: Phases 12-15 (экспорт покрывает все отчёты milestone)
**Requirements**: EXT-06, EXT-07
**Success Criteria** (what must be TRUE):

  1. Каждый отчёт (`/admin/analytics`, кохорты, воронка, RFM-сегменты, promo/referral, save-list, upsell) имеет кнопку CSV-экспорта
  2. CSV содержит те же строки и колонки, что и экран, с MSK-датами и корректным экранированием/кодировкой (UTF-8 BOM для Excel)
  3. Экспорт уважает выбранный период и активные фильтры
  4. Страница метрического словаря описывает каждую метрику: определение, формулу, источник данных, известные ограничения
  5. Словарь доступен из админ-навигации и связан ссылками с соответствующими секциями дашборда

**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 12 → 13 → 14 → 15 → 16

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 12. Period Comparison & Data-Quality Foundation | 0/TBD | Not started | - |
| 13. Anomaly Alerts | 0/TBD | Not started | - |
| 14. Promo & Referral Quality + Fraud | 0/TBD | Not started | - |
| 15. Expiry Save-List & Upsell Radar | 0/TBD | Not started | - |
| 16. CSV Export & Metric Dictionary | 0/TBD | Not started | - |
