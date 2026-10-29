# Phase 10: Cohorts & Retention Analytics - Context

**Gathered:** 2026-10-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Фаза добавляет на `/admin/analytics` когортный анализ удержания и выручки:
1. **Registration cohort matrix** (COH-01) — месяц регистрации × месяц N: доля аккаунтов с активной платной подпиской.
2. **Revenue retention** (COH-02) — выручка месяца N относительно первого платного месяца когорты.
3. **Acquisition-channel slices** (COH-03) — те же матрицы в разрезе канала: реферал / промокод / органика.
4. **Device-count slices** (COH-04) — в разрезе числа устройств первого оплаченного заказа.
5. **Payer revenue cohorts** (COH-05) — матрицы по месяцу первой оплаты.

Вне scope: RFM-сегменты и рассылки (Phase 11), алерты (ALR), CSV-экспорт (EXT-06), drill-down по пользователям (Phase 11), новый статус/таблица снапшотов когорт (считаем на лету).

</domain>

<decisions>
## Implementation Decisions

### Cohort base & retention (COH-01, COH-02, COH-05)

- **D-01:** Registration cohort = все пользователи, зарегистрированные в MSK-месяце M (`User.createdAt`). Удержание в относительном месяце N: у пользователя есть ≥1 **платный** (не trial) ключ, чьё покрытие (`paidAt + days`) пересекает календарный месяц M+N. Trial-ключи исключены. Разрывы остаются пустыми (не заполняются нулём — «—»). — **Reversibility:** reversible — чистая derivation, без миграции.
- **D-02:** Payer cohort month = MSK-месяц первого оплаченного заказа пользователя (`min(paidAt)` среди заказов в `paid/provisioning/provisioned`). Членство в когорте фиксируется навсегда по первому платному месяцу. — **Reversibility:** reversible.
- **D-03:** Revenue retention (COH-02) = `Σ cash` заказов, оплаченных в месяце M+N участниками когорты, ÷ `Σ cash` заказов, оплаченных в первом платном месяце (M0) той же когорты. `cash = finalAmount − balanceUsed`. Включаются все заказы когорты (new/renew/upgrade) — не только первичные. Деноминатор — первый платный месяц когорты. — **Reversibility:** reversible — денежная база уже зафиксирована (D-02 Phase 7, D-13 Phase 8).
- **D-04:** Размер матрицы = **12 когортных месяцев × 12 относительных смещений** (M0..M11). Константа в коде. — **Reversibility:** reversible.
- **D-05:** Возврат после разрыва: удержание показывает только месяцы с активным покрытием (разрывы пустые), payer cohort не меняется — пользователь остаётся в исходной когорте. — **Reversibility:** reversible.
- **D-06:** В когортах учитываются только платные ключи (`isTrial = false`). Trial-ключи не создают заказов и не участвуют в retention/revenue. — **Reversibility:** reversible.

### Acquisition channel (COH-03)

- **D-07:** Канал вычисляется **на лету**, без новой колонки и миграции (консистентно с D-12 Phase 7 «производные на лету»). User-level: `referral` если `User.referredById != null`; иначе `promo` если есть `User.pendingPromo != null` ИЛИ любой оплаченный заказ пользователя с `promoCode != null`; иначе `organic`. — **Reversibility:** reversible (нет схемы; при необходимости позже добавить колонку + backfill).
- **D-08:** Приоритет: **referral > promo**. Если `referredById != null`, канал = referral, промокод игнорируется. — **Reversibility:** reversible.
- **D-09:** Трафик через личный поддомен (`customSubdomain`) и реферальные ссылки считается каналом **referral** (не отдельный канал). Итого три канала: referral / promo / organic. — **Reversibility:** reversible.

### Device-count slice (COH-04)

- **D-10:** Число устройств пользователя = `Order.devices` его **первого оплаченного заказа**. Фиксируется раз и навсегда; апгрейд не меняет бакет. — **Reversibility:** reversible — историческая привязка, консистентно с Phase 9 (paidAt→provisioned proxy-подход и «историческая привязка может не сохраниться»).
- **D-11:** Бакеты устройств: `1`, `2`, `3`, `4`, `5+`. — **Reversibility:** reversible.
- **D-12:** Разрез по устройствам применяется **только к payer-матрицам** (COH-02, COH-05). Registration cohort (COH-01) не фильтруется по устройствам — неплатящие просто не попадают ни в один бакет. — **Reversibility:** reversible.

### UI & windowing

- **D-13:** Матрицы **независимы от `?period`** страницы — всегда показывают 12×12. Селектор `?period=7|30|90` управляет только оконными блоками (KPI/waterfall/retention), как в фазах 7–9. — **Reversibility:** reversible.
- **D-14:** Переключение разрезов — **табы над одной матрицей**: канал-табы (Все / Referral / Promo / Organic) и устройство-табы (Все / 1 / 2 / 3 / 4 / 5+). Одна таблица переиспользуется. — **Reversibility:** reversible.
- **D-15:** Ячейки матрицы: процент + абсолют в скобках (`42% (3/7)`), фоновый градиент по величине (0–100%). Числа всегда присутствуют (a11y, без зависимости от цвета). — **Reversibility:** reversible.
- **D-16:** Малые когорты показываются как есть, без маскировки. — **Reversibility:** reversible.
- **D-17:** Границы месяцев/когорт — **Europe/Moscow (+03:00)**, консистентно с D-15 Phase 7. — **Reversibility:** costly — таймзона зашита в когортные бакеты; смена потребует пересчёта.

### the agent's Discretion

- Точные SQL-запросы (Prisma `findMany` vs `$queryRaw`), индексы, кэширование/мемоизация на лету.
- Имена новых файлов: рекомендуется `lib/analytics/cohorts.ts` (чистая derivation) + лоадеры в `lib/analytics/service.ts`, компонент `components/admin/CohortMatrix.tsx`.
- Цветовая шкала градиента (стопы), число знаков процентов, мобильное поведение (горизонтальный скролл по образцу существующих таблиц).
- Имена i18n-ключей (по паттерну `analyticsCohort*`).
- Порядок секций на странице (ниже retention-секции Phase 8, по аналогии с Phase 9).
- Число Suspense-границ и try/catch (по паттерну Phase 9: отдельный async server component на блок).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Требования и роадмап
- `.planning/ROADMAP.md` §Phase 10 — goal, success criteria, зависимости.
- `.planning/REQUIREMENTS.md` — COH-01, COH-02, COH-03, COH-04, COH-05.
- `.planning/PROJECT.md` §Current Milestone v1.1 — когорты по каналу и тиру устройств, unit = ключ/подписка.

### Решения предыдущих фаз
- `.planning/phases/07-analytics-foundation-revenue-metrics/07-CONTEXT.md` — D-01..D-15: MRR на KeyCache, cashOf, MSK-дни, point-in-time, coverage, nightly rollup.
- `.planning/phases/08-unit-economics-retention/08-CONTEXT.md` — D-01..D-20: retention/churn, buildKeyTerms, cash, grace 7 дней, UI-композиция, «—» вместо нулей.
- `.planning/phases/09-payment-funnel-failure-analysis/09-CONTEXT.md` — D-01..D-06: период, async server components, Suspense, i18n-паттерн.

### Схема данных
- `prisma/schema.prisma` — `User` (`createdAt`, `referredById`, `pendingPromo`, `customSubdomain`), `Order` (`userId`, `paidAt`, `finalAmount`, `balanceUsed`, `days`, `devices`, `kind`, `promoCode`, `status`), `KeyCache` (`userId`, `keyId`, `isTrial`, `expiresAt`, `deviceLimit`).

### Код аналитики (переиспользовать)
- `lib/analytics/series.ts` — `PaidOrderRow`, `cashOf`, `KeyTerm`, `buildKeyTerms`, `buildDailySeries`.
- `lib/analytics/mrr.ts` — `mrrAt`, `activeKeysAt`, `keyRefOf`, `computeCoverage`.
- `lib/analytics/retention.ts` — derivation событий окончания термина (паттерн).
- `lib/analytics/time.ts` — `mskDayLabel`, `mskDayStartInstant`, `mskDateKey`, `mskMonthLabel`, `addMonths`, `pgTimestamp`.
- `lib/analytics/service.ts` — `loadKpis`, `ORDER_SELECT`, паттерн лоадеров с try/catch.
- `lib/analytics/funnel.ts` — чистая derivation (паттерн для `cohorts.ts`).
- `app/admin/analytics/page.tsx` — структура страницы, `requireRole` guard, `?period` whitelist, Suspense.
- `components/admin/MetricCard.tsx` — `GRID`, `CardsSkeleton`, `MetricCard`.
- `components/admin/AnalyticsSection.tsx`, `PeriodSelector.tsx`, `ChurnTable.tsx` — визуальные паттерны.

### ARTEMIDA
- `docs/artemida-v1-contract.md` — семантика прайсинга/сроков (days → покрытие).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `buildKeyTerms` + `KeyTerm`: группирует оплаченные заказы по `keyRef = keyId ?? provisionedKeyId` и строит цепочку терминов с `termEnd`. Переиспользовать для определения активного покрытия в месяце N (пересечение `paidAt + days` с календарным месяцем).
- `cashOf` (`finalAmount − balanceUsed`): денежная база revenue retention.
- `mskMonthLabel` / `addMonths` / `mskDayStartInstant`: границы MSK-месяцев и смещения.
- `activeKeysAt` / `mrrAt`: point-in-time знаменатели (если понадобятся).
- `MetricCard`, `GRID`, `PeriodSelector`, `AnalyticsSection`, `ChurnTable`: визуальные примитивы.
- `requireRole` guard и `notFound()` паттерн для страницы.

### Established Patterns
- Все производные — на лету из оплаченных заказов; `daily_metrics` — только rollup, не источник истины (D-12 Phase 7). Когорты тоже на лету (решение D-07: без новой таблицы).
- MSK-месяцы считаются в JS (`mskMonthLabel`/`mskDayStartInstant`); нельзя смешивать label и instant.
- Неизвестное значение = `null` → «—»; никаких нулей вместо отсутствующих данных.
- Блоки страницы изолированы try/catch + `Suspense`; ошибка одного блока не ломает страницу.
- TDD: чистые derivation-функции в `lib/analytics/cohorts.ts` (по аналогии с `funnel.ts`), unit-тесты на vitest без БД; лоадеры тестируются identity-паттерном (как Phase 9).
- i18n: все тексты через `t('key')`; тест i18n падает на неиспользуемых/отсутствующих ключах.

### Integration Points
- `lib/analytics/cohorts.ts` (новый) — чистая derivation когорт (матрицы, канал, бакеты устройств).
- `lib/analytics/service.ts` — новые лоадеры: `loadRegistrationCohorts`, `loadPayerCohorts` (+ фильтры канала/устройств).
- `app/admin/analytics/page.tsx` — две новые секции (registration cohorts, payer cohorts) с табами разрезов, ниже retention-секции.
- `components/admin/CohortMatrix.tsx` (новый) — таблица 12×12 с градиентом.
- `lib/i18n/messages/ru.ts` — ключи `analyticsCohort*`.
- Контрактные тесты страницы: обновить ожидаемое число Suspense-границ (как в Phase 9).

</code_context>

<specifics>
## Specific Ideas

- Формулы для кода и тестов:
  - `cohortMonth(user) = mskMonthLabel(user.createdAt)` (registration)
  - `payerCohortMonth(user) = mskMonthLabel(min paidAt)` (payer)
  - `retained(regCohort, offset) = count(users in cohort with ≥1 paid key whose coverage intersects month offset) / cohortSize`
  - `revenueRetention(payerCohort, offset) = cash(month offset) / cash(M0)` (null при нулевом знаменателе → «—»)
  - `channel(user) = referredById != null ? 'referral' : (hasPromo ? 'promo' : 'organic')`
  - `deviceBucket(user) = bucket(firstPaidOrder.devices)` → `1|2|3|4|5+`
- Граничные случаи для тестов: пустой период, когорта из 1 пользователя, нулевой знаменатель revenue retention, trial-ключи, апгрейд устройств (бакет не меняется), возврат после разрыва (разрыв пустой), пользователь без оплаченных заказов (не в payer cohort), MSK-границы месяца.
- Производительность: on-the-fly скан заказов/пользователей за 12 месяцев. Если окажется тяжело — кэшировать в рамках запроса (один findMany на лоадер), не добавлять rollup-таблицу без отдельного решения.

</specifics>

<deferred>
## Deferred Ideas

- Rollup-таблица снапшотов когорт (если on-the-fly окажется слишком медленным) — отдельное решение, не в этой фазе.
- Разрез когорт по тарифу (days) в дополнение к устройствам — возможно будущая фаза.
- Drill-down по ячейке матрицы (список пользователей) — Phase 11 (RFM) или отдельная задача.
- CSV-экспорт матриц — EXT-06.
- Алерты на деградацию когорт — ALR.
- Учёт возвратов/chargeback в revenue retention — не обсуждалось (как в Phase 8).

</deferred>

---

*Phase: 10-Cohorts & Retention Analytics*
*Context gathered: 2026-10-29*