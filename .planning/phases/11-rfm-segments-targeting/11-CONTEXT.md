# Phase 11: RFM Segments & Targeting - Context

**Gathered:** 2026-10-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Фаза добавляет RFM-сегментацию пользователей и таргетинг рассылок:
1. **RFM-расчёт** (SEG-01) — Recency/Frequency/Monetary для каждого пользователя, сохранение в `user_rfm` с ежедневным обновлением.
2. **Именованные сегменты** (SEG-02) — trial-only, new payer, active, at-risk, churned, sleeping, VIP с размером каждого.
3. **Drill-down** (SEG-03) — размер сегмента + список пользователей, отфильтрованный по сегменту.
4. **Таргетинг рассылок** (SEG-04) — выбор сегмента как аудитории с предпросмотром числа получателей.
5. **Конфигурируемые пороги** (SEG-05) — пороги меняются без деплоя.

Вне scope: алерты (ALR), CSV-экспорт (EXT-06), drill-down по ячейке когорты (Phase 10 deferred), персональный LTV, учёт возвратов/chargeback.

</domain>

<decisions>
## Implementation Decisions

### RFM-расчёт (SEG-01)

- **D-01:** Recency = количество дней от последней оплаты (`max(paidAt)` по оплаченным заказам) до `now`. Для trial-only (нет оплат) — дни от регистрации (`User.createdAt`). — **Reversibility:** reversible — чистая derivation.
- **D-02:** Frequency = количество оплаченных заказов (`status in paid/provisioning/provisioned`) за **trailing 12 месяцев**. — **Reversibility:** reversible.
- **D-03:** Monetary = сумма `cash (finalAmount − balanceUsed)` по всем оплаченным заказам **за всё время** (накопленная ценность). Консистентно с `cashOf` (D-02 Phase 7). — **Reversibility:** reversible.
- **D-04:** Окно: Monetary — вся история; Recency/Frequency — trailing 12 месяцев (Recency по последней оплате, которая и так недавняя; Frequency ограничена 12 мес). Компромисс: VIP не «замораживается» навсегда, но масштаб трат сохраняется. — **Reversibility:** reversible.

### Сегменты и пороги (SEG-02, SEG-05)

- **D-05:** Сегментация **rule-based** (именованные сегменты с явными условиями), не RFM-score/квантили. Прозрачно для админа. — **Reversibility:** reversible.
- **D-06:** Семь сегментов с приоритетом (первое совпавшее условие):
  1. `trial-only` — `trialUsed = true` И нет оплаченных заказов.
  2. `new payer` — первый оплаченный заказ в последние `newPayerDays` дней (default 30).
  3. `VIP` — Monetary в топ 5% по всем пользователям (динамический порог, пересчитывается при nightly run).
  4. `active` — последняя оплата в последние `activeDays` дней (default 30) и покрытие ещё активно (или продление в пределах 7 дней).
  5. `at-risk` — последняя оплата между `activeDays` и `atRiskDays` дней назад (default 30–60), покрытие скоро истечёт.
  6. `churned` — была оплата, но нет оплат в последние `churnedDays` дней (default 60+) И покрытие истекло.
  7. `sleeping` — была оплата, нет оплат в последние `churnedDays` дней, но покрытие ещё активно (длинный тариф / бонус).
  Пользователь без оплат и без trial → `trial-only` (fallback).
- **D-07:** Пороги хранятся в существующей таблице `Setting` (key/value), ключи: `rfm.threshold.newPayerDays`, `rfm.threshold.activeDays`, `rfm.threshold.atRiskDays`, `rfm.threshold.churnedDays`, `rfm.threshold.vipPercent`. Без миграции. — **Reversibility:** reversible — конфиг в БД, не в коде.
- **D-08:** Admin-UI для редактирования порогов на странице `/admin/segments`: поля ввода + «Сохранить». Сохранение обновляет `Setting` и запускает пересчёт (или ждёт nightly). — **Reversibility:** reversible.
- **D-09:** VIP = топ 5% по Monetary (динамический порог, пересчитывается при каждом nightly run). — **Reversibility:** reversible.

### Хранение и обновление (SEG-01)

- **D-10:** Новая таблица `user_rfm`: `userId` (PK, FK → users), `recencyDays` (int), `frequency` (int), `monetary` (int, nullable), `segment` (text), `computedAt` (datetime). Индекс по `segment`. Миграция Prisma. — **Reversibility:** one-way — новая таблица; откат = drop table (данные теряются, но пересчёт восстановит).
- **D-11:** Отдельный cron-маршрут `app/api/cron/rfm/route.ts` под `CRON_SECRET`, запускается в 03:10 (после analytics 03:00). Разделение ответственности. — **Reversibility:** reversible.
- **D-12:** Backfill через CLI-скрипт `scripts/backfill-rfm.ts` (идемпотентный, запускается вручную при деплое). — **Reversibility:** reversible.
- **D-13:** Trial-only пользователи включаются в `user_rfm`: `recencyDays` от регистрации, `frequency = 0`, `monetary = null`, `segment = 'trial-only'`. — **Reversibility:** reversible.

### Drill-down и рассылка (SEG-03, SEG-04)

- **D-14:** Drill-down — существующая страница `/admin/users` с фильтром `?segment=`. Фильтрация по `user_rfm.segment`. Без новой страницы. — **Reversibility:** reversible.
- **D-15:** Предпросмотр числа получателей — API-эндпоинт `GET /api/admin/segments/:name/count`, возвращает `{ count }` (число пользователей сегмента с `chatId != null`). — **Reversibility:** reversible.
- **D-16:** Broadcast route (`POST /api/admin/broadcast`) расширяется: body `{ body, segment? }`, `segment` опционален (default `'all'` = все с chatId). Recipients = пользователи сегмента с `chatId != null`. Обратно совместимо. — **Reversibility:** reversible — расширение схемы, старые клиенты работают.
- **D-17:** `BroadcastComposer` получает dropdown «Аудитория»: «Все получатели» + список сегментов с размером. При выборе показывается предпросмотр числа получателей (вызов count endpoint). — **Reversibility:** reversible.

### UI и композиция

- **D-18:** Отдельная страница `/admin/segments` (новый пункт в `AdminNav`). Карточки с числом (7 сегментов) + блок редактирования порогов. — **Reversibility:** reversible.
- **D-19:** Нейтральные токены (без red/green pass-fail, наследовано из Phase 7). Акцент (`--lime`) только для активного/выбранного. Сегменты различаются иконкой/подписью, не цветом. — **Reversibility:** reversible.
- **D-20:** Границы дат/периодов — **Europe/Moscow (+03:00)**, консистентно с D-15 Phase 7. — **Reversibility:** costly.

### the agent's Discretion

- Точные SQL-запросы и индексы для `user_rfm`.
- Имена i18n-ключей (по паттерну `admin.segments*`, `admin.rfm*`).
- Визуальная структура карточек сегментов (иконки, layout).
- Формат отображения Recency/Frequency/Monetary в drill-down (таблица пользователей).
- Как запускать пересчёт из admin-UI (синхронно или через cron-trigger).
- Имя cron-маршрута и расписание (03:10).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Требования и роадмап
- `.planning/ROADMAP.md` §Phase 11 — goal, success criteria, зависимости.
- `.planning/REQUIREMENTS.md` — SEG-01, SEG-02, SEG-03, SEG-04, SEG-05.
- `.planning/PROJECT.md` §Current Milestone v1.1 — RFM-сегменты с таргетингом рассылок.

### Решения предыдущих фаз
- `.planning/phases/07-analytics-foundation-revenue-metrics/07-CONTEXT.md` — D-01..D-15: MRR, cashOf, MSK-дни, rollup, cron 03:00, backfill.
- `.planning/phases/10-cohorts-retention-analytics/10-CONTEXT.md` — D-01..D-17: MSK-месяцы, cash, on-the-fly derivation, UI-паттерны.

### Схема данных
- `prisma/schema.prisma` — `User`, `Order`, `KeyCache`, `Setting` (key/value), `Broadcast`, `Notification`.
- `lib/broadcast.ts` — `dispatchBroadcast`, `loadBroadcastStatus`, `enqueueBroadcastNotifications`.
- `app/api/admin/broadcast/route.ts` — текущий POST (все с chatId).
- `app/api/admin/users/search/route.ts` — поиск пользователей (паттерн для drill-down).

### Код (переиспользовать)
- `lib/analytics/service.ts` — паттерн лоадеров.
- `lib/analytics/time.ts` — MSK-хелперы.
- `lib/analytics/series.ts` — `cashOf`.
- `components/admin/BroadcastComposer.tsx` — компонент рассылки.
- `components/admin/AdminNav.tsx` — навигация (добавить пункт).
- `app/admin/users/page.tsx` — страница пользователей (drill-down).
- `lib/i18n/messages/ru.ts` — i18n.

### Инфраструктура
- `app/api/cron/analytics/route.ts` — паттерн cron-маршрута.
- `scripts/backfill-analytics.ts` — паттерн backfill-скрипта.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `Setting` (key/value) — хранение порогов без миграции.
- `Broadcast` / `Notification` / `enqueueBroadcastNotifications` — инфраструктура рассылок, расширяем фильтром по сегменту.
- `cashOf` — денежная база Monetary.
- `MetricCard`, `GRID`, `PeriodSelector`, `AnalyticsSection`, `ChurnTable` — визуальные примитивы.
- `requireRole` guard, `notFound()` паттерн.

### Established Patterns
- Все производные — на лету или nightly rollup; `daily_metrics`/`user_rfm` — rollup-таблицы.
- MSK-дни считаются в JS; нельзя смешивать label и instant.
- Неизвестное значение = `null` → «—».
- Блоки страницы изолированы try/catch + `Suspense`.
- TDD: чистые derivation-функции + unit-тесты без БД; лоадеры — identity-паттерн.
- i18n: все тексты через `t('key')`.

### Integration Points
- `prisma/schema.prisma` — новая модель `UserRfm`.
- `lib/analytics/rfm.ts` (новый) — чистая derivation (R/F/M, сегментация).
- `lib/analytics/service.ts` — лоадер `loadSegments()`.
- `app/api/cron/rfm/route.ts` (новый) — nightly пересчёт.
- `scripts/backfill-rfm.ts` (новый) — backfill.
- `app/api/admin/segments/[name]/count/route.ts` (новый) — предпросмотр.
- `app/api/admin/broadcast/route.ts` — расширение body (segment).
- `app/admin/segments/page.tsx` (новый) — страница сегментов.
- `app/admin/users/page.tsx` — фильтр ?segment=.
- `components/admin/BroadcastComposer.tsx` — dropdown аудитории.
- `lib/i18n/messages/ru.ts` — ключи `admin.segments*`.
- `components/admin/AdminNav.tsx` — новый пункт.

</code_context>

<specifics>
## Specific Ideas

- Пороги по умолчанию: newPayerDays=30, activeDays=30, atRiskDays=60, churnedDays=60, vipPercent=5.
- Сегменты: trial-only, new payer, active, at-risk, churned, sleeping, VIP (7 штук).
- Drill-down: /admin/users?segment=active — фильтр по user_rfm.segment.
- Broadcast: body { body, segment? }, default 'all'.
- Cron: 03:10, после analytics 03:00.
- Backfill: scripts/backfill-rfm.ts (идемпотентный).
- i18n-ключи: admin.segmentsTitle, admin.segmentsCardSize, admin.segmentsThresholdsTitle, admin.segmentsThreshold* и т.д.

</specifics>

<deferred>
## Deferred Ideas

- Алерты на изменение сегментов (ALR).
- CSV-экспорт списков сегментов (EXT-06).
- Персональный LTV / drill-down по пользователю beyond segment list.
- Учёт возвратов/chargeback в Monetary.
- RFM-score (квантили) как альтернатива rule-based — отложено, rule-based выбран.

</deferred>

---

*Phase: 11-RFM Segments & Targeting*
*Context gathered: 2026-10-29*