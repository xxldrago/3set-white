# Phase 7: Analytics Foundation & Revenue Metrics - Context

**Gathered:** 2026-10-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Эта фаза создаёт **фундамент аналитики** и первый видимый результат на нём:

1. **Хранилище**: таблицы суточных агрегатов (`daily_metrics`), снимков баланса ARTEMIDA (`artemida_balance_snapshots`) и фиксация себестоимости на заказе (`Order.providerCost`).
2. **Пересчёт**: ночной джоб (03:00) + идемпотентный backfill истории.
3. **Страница** `/admin/analytics`: KPI (MRR, ARR, ARPU, ARPPU, покрытие себестоимости), revenue waterfall за период, спарклайн тренда MRR.

**Не входит** (это фазы 8–11): unit economics по провайдеру, retention/churn-модель, воронка оплаты и анализ отказов, когорты, RFM-сегменты. Метрики здесь считаются на **сырых агрегатах**, чтобы последующие фазы добавляли производные без пересчёта истории.

</domain>

<decisions>
## Implementation Decisions

### Выручка и база MRR
- **D-01:** MRR/ARR считаются на **активных ключах из `KeyCache`**, а не на потоке заказов: активный ключ → его последний paid-заказ (через `Order.keyId`). Один ключ = одна строка MRR; продление не даёт двойного счёта. — **Reversibility:** reversible — производные считаются на лету (см. D-14), смена базы не требует пересчёта истории.
- **D-02:** База денег для всех метрик — **полученный кэш**: `finalAmount - balanceUsed` по оплаченным заказам (`paid | provisioning | provisioned`). Консистентно с существующим `lib/revenue.ts` (`cashOf`), промо-скидки и оплата балансом честно снижают MRR. Отдельной «списочной» MRR-метрики **не вводим**. — **Reversibility:** reversible.
- **D-03:** Продления за **бонусные дни (0 ₽)** — компенсации из тикетов и бонусные продления — **исключаются** из MRR и выручки, но учитываются отдельной метрикой «выдано бонусом, ₽-эквивалент» (goodwill), чтобы размер компенсаций был виден, но не искажал деньги.
- **D-04:** Нормализация подписок разной длины — **месячный эквивалент**: `MRR = Σ по активным ключам finalAmount / (срок_дней / 30)`. Не зависит от точки наблюдения; корректно для тарифов 30/90/180/365.
- **D-05:** **ARPU** = выручка / все зарегистрированные пользователи (без заблокированных); **ARPPU** = выручка / уникальные платящие за период. Классические SaaS-знаменатели.

### providerCost (себестоимость ключа)
- **D-06:** Источник себестоимости — **provider-quote ARTEMIDA, фиксируемый при provisioning** (момент выдачи ключа). Если цена покупки была ручной (`TariffQuote.source === 'manual'`, `lib/pricing.ts:94` — в этом случае provider-quote сейчас вообще не запрашивается), делается **дополнительный вызов `/pricing` только для сохранения `providerCost`**. Недоступность quote (5xx) **не блокирует выдачу**: пишем `providerCost = null` + лог.
- **D-07:** `providerCost` пишется **per-order**, включая `kind = 'renew'` и `'upgrade'` (для upgrade — по дельте доп. устройств/срока). Маржа считается по каждому заказу и агрегируется в rollup.
- **D-08:** Заказы **до** внедрения поля: `providerCost = null`. Маржа за такие окна показывается как «—», а период помечается **флагом покрытия** («себестоимость известна для N из M заказов»). **Ретро-бэкфилл по текущему прайсу не делаем** — оценка выдала бы себя за факт. — **Reversibility:** one-way — фактическая себестоимость заказов до внедрения поля нигде не сохранялась, восстановить её нельзя (только приблизительная оценка), поэтому маржа за прошлые окна навсегда содержит null-пробел.

### Структура страницы
- **D-09:** Аналитика живёт на **отдельной странице `/admin/analytics`** + новый пункт в `components/admin/AdminNav.tsx`. `/admin` остаётся обзором: короткий тизер (MRR + ссылка «Подробнее»), без переноса туда аналитики.
- **D-10:** Первый экран Phase 7: **KPI-строка** (MRR, ARR, ARPU, ARPPU, покрытие себестоимости) → **revenue waterfall за период** → **спарклайн тренда MRR**. Разбивки по тарифам/видам заказов и прочие блоки **не** входят в эту фазу (фазы 8–11 добавят блоки ниже).
- **D-11:** Гейт доступа наследуется: `administrator` + `manager` (как `app/admin/page.tsx:15`), с повторной проверкой роли в самой странице (RSC-payload не проходит через layout).

### Пересчёт, джоб, backfill
- **D-12:** `daily_metrics` хранит **сырые суточные агрегаты** (заказы, кэш, providerCost, активные ключи, новые пользователи, выданные бонусные дни и т.п.). Производные (MRR, ARPU/ARPPU, waterfall) считаются **на лету** в `lib/analytics`. «Сегодня» — live-запрос, не дожидаясь ночного джоба. — **Reversibility:** reversible — смена формулы не требует пересчёта истории (в отличие от хранения готовых метрик).
- **D-13:** Ночной пересчёт — **новый маршрут `app/api/cron/analytics/route.ts`** под `CRON_SECRET` (паттерн `app/api/cron/reconcile/route.ts` и `remind/route.ts`) + внешний cron **03:00**. Джоб **идемпотентен** (upsert по дню).
- **D-14:** Backfill истории — **CLI-скрипт** `scripts/backfill-analytics.ts` (идемпотентный, запускается вручную при деплое, считается с первого заказа). Тяжёлый публичный HTTP-маршрут не открываем, кнопки в админке нет.
- **D-15:** Границы суток/месяца — **Europe/Moscow (+03:00)**. Метрики «за сегодня»/«за месяц» совпадают с человеческим календарём RU. — **Reversibility:** costly — таймзона зашита в уже записанные суточные бакеты; смена потребует пере-bucketing всей истории (миграция + полный backfill).

### the agent's Discretion
- Конкретная структура таблиц (`daily_metrics`, `artemida_balance_snapshots`), набор агрегатных колонок, ключи идемпотентности пересчёта и способ хранения таймзоны в бакете.
- Способ построения спарклайна и waterfall (остаётся в рамках существующего SVG-подхода, см. `<code_context>`).
- Схема «флага покрытия» (отдельная колонка vs вычисляемое поле ответа) — на усмотрение планировщика.
- Часовой пояс snapshot баланса (`artemida_balance_snapshots`): раз в сутки в момент джоба vs чаще.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Требования и план
- `.planning/ROADMAP.md` §Phase 7 (Analytics Foundation & Revenue Metrics) — границы фазы, success criteria, canonical refs.
- `.planning/REQUIREMENTS.md` — ANL-01 (MRR/ARR), ANL-02/03 (ARPU/ARPPU), ANL-12 (rollup + cron 03:00), ANL-15 (backfill истории), ANL-13/14 (фиксация себестоимости провайдера) + раздел Future (ALR/PRM/EXT — отложено).
- `.planning/PROJECT.md` §Current Milestone (v1.1) — ключевые решения milestone (стоимость на provisioning + snapshots, retention unit = подписка/ключ, «expired» = pending-by-age без нового `OrderStatus`, rollup + cron).

### Существующие конвенции денег и прайсинга
- `lib/revenue.ts` — эталон определения денег: `cashOf = finalAmount - balanceUsed`, PAID-статусы, оконный расчёт по `?period=`.
- `lib/pricing.ts` — `TariffQuote { amount, currency, source: 'manual' | 'provider' }`, `resolveTariffQuote`/`resolveUpgradeQuote`; здесь определяется, когда provider-quote вообще не запрашивается.
- `lib/orders-service.ts` — `createOrder` (`:98`, цена через `resolveTariffQuote` на `:136`) — точка фиксации `providerCost`.

### Схема данных и ARTEMIDA
- `prisma/schema.prisma` — `Order` (+ `providerCost`), `KeyCache`, `User`, `WalletTx`, `Setting`, enum `OrderStatus`.
- `lib/artemida.ts` — `getPricing` (provider-quote для себестоимости), `getBalance` (источник для `artemida_balance_snapshots`).

### Инфраструктура пересчёта и UI-паттерны
- `app/api/cron/reconcile/route.ts`, `app/api/cron/remind/route.ts` — паттерн cron-маршрута под `CRON_SECRET` (включая идемпотентность и логирование).
- `app/admin/page.tsx` — гейт ролей, `dynamic = 'force-dynamic'`, `?period=7|30|90`, Suspense + независимая деградация карточек.
- `components/admin/FunnelCharts.tsx` — конвенция графиков: **чистый SVG без chart-зависимостей**, пресеты 7/30/90 + кастомный диапазон, гранулярность day/week/month/year; endpoint-проп для scoped-данных.
- `components/admin/RevenuePanel.tsx` — паттерн KPI-карточки (`MetricCard`) и серверного чтения через `lib/`-модуль с деградацией в общий текст ошибки.
- `components/admin/AdminNav.tsx` — куда добавляется пункт «Аналитика» (i18n-ключ в `lib/i18n`).
- `app/api/admin/referrals/stats/route.ts` — паттерн JSON-эндпоинта для клиентских графиков.

Локальных SPEC/ADR в репозитории нет — требования полностью зафиксированы в решениях выше и в `.planning/REQUIREMENTS.md`.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `components/admin/RevenuePanel.tsx` (`MetricCard`) — готовая KPI-карточка под MRR/ARR/ARPU/ARPPU.
- `components/admin/FunnelCharts.tsx` — SVG-бары/линия + переключатель периода и гранулярности; спарклайн и waterfall строить в том же стиле, без новых зависимостей.
- `lib/revenue.ts` — `cashOf` и агрегации по заказам переиспользуются для суточных агрегатов.
- `lib/pricing.ts` — `resolveTariffQuote` уже возвращает `source`; отсюда «доп. вызов /pricing при manual».
- `lib/prisma-errors.ts` — `isWriteConflict`/`isUniqueViolation` (по цепочке `cause`) — нужен для идемпотентного upsert в джобе при параллельном запуске.
- `lib/logger.ts` (pino) — логирование пересчёта, отсутствия quote, покрытия себестоимости.
- `lib/admin-auth.ts` (`requireRole`) — гейт `administrator`/`manager`.

### Established Patterns
- Каждая admin-страница **сама** проверяет роль (RSC-payload обходит layout) и отдаёт `notFound()`, а не отдельную страницу «запрещено».
- Карточки деградируют независимо (Suspense + собственный catch) — источник, упавший в аналитике, не должен ронять страницу.
- Все деньги — целые рубли, форматирование `Intl.NumberFormat('ru-RU')`; текст только через `t('key')` из `lib/i18n` (тест i18n падает на неиспользуемых/отсутствующих ключах).
- Cron-маршруты защищены `CRON_SECRET` и возвращают быстрый ответ; никаких секретов/сырых ошибок БД в UI.
- ARTEMIDA-вызовы идут через `p-retry` с уважением к `Retry-After` (429/502/503).

### Integration Points
- `prisma/schema.prisma` + миграция: `Order.providerCost`, `daily_metrics`, `artemida_balance_snapshots`.
- `lib/orders-service.ts` — запись `providerCost` при provisioning/renew/upgrade.
- `app/api/cron/analytics/route.ts` (новый) + расписание 03:00 на сервере.
- `scripts/backfill-analytics.ts` (новый) — идемпотентный прогон истории (запуск `tsx` при деплое).
- `app/admin/analytics/page.tsx` (новый) + `components/admin/AdminNav.tsx` + i18n-ключи.

</code_context>

<specifics>
## Specific Ideas

- Формулировка флага покрытия себестоимости — явная: «себестоимость известна для N из M заказов»; вместо маржи за неполное окно показывать «—», не подставлять нули.
- Бонусные дни визуально отделены от денег: отдельная метрика «выдано бонусом, ₽-эквивалент», а не включение в MRR.
- Спарклайн MRR — тренд по суточным бакетам из rollup, без ожидания ночного джоба для «сегодня».
- Периоды — те же пресеты, что уже в UI: 7/30/90 + кастомный диапазон.

</specifics>

<deferred>
## Deferred Ideas

- **PRM-01..04** (качество промо/рефералов и антифрод), **ALR-01..04** (WoW/MoM-компараторы и алерты об аномалиях), **EXT-01..07** (save-list истекающих, upsell-радар, учёт возвратов, support↔churn, data-quality флаги, CSV-экспорт, словарь метрик) — были в исходном запросе пользователя, но **сознательно отложены** при утверждении roadmap v1.1. Зафиксированы в `.planning/REQUIREMENTS.md` (Future). Не расширяют границы Phase 7.
- Разбивки по тарифам (days/devices) и видам заказов (`new`/`renew`/`upgrade`) на странице аналитики — рассмотрены и отложены в фазы 8–11.
- Про-рата по календарным дням вместо месячного эквивалента — отклонено для MRR (см. D-04); может понадобиться позже для дневных графиков в фазах 8+.
- Материализация готовых метрик в rollup (гибрид) — отклонено (см. D-12); вернуться только если live-вычисления станут узким местом.

</deferred>

---

*Phase: 7-Analytics Foundation & Revenue Metrics*
*Context gathered: 2026-10-20*
