# Phase 8: Unit Economics & Retention - Context

**Gathered:** 2026-10-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Добавляет на `/admin/analytics` read-only блоки юнит-экономики и удержания: LTV gross (исторический и прогнозный), LTV net, renewal rate, logo churn, revenue churn, gross margin, маржинальность, средний расход на ключ, burn-rate и runway по живому балансу ARTEMIDA. Все значения выводятся на лету из оплаченных заказов и уже существующих `daily_metrics`; новых таблиц и изменения схемы не требуется.

**В scope (ANL-04, ANL-05, ANL-06, ANL-07, ANL-13, ANL-14):**
- LTV gross исторический и прогнозный, LTV net с явным покрытием себестоимости.
- Renewal rate, logo churn, revenue churn по подпискам за выбранный период + таблица последних 6 MSK-месяцев.
- Gross margin, маржинальность в %, средний расход на ключ за выбранный период.
- Burn-rate за фиксированные 30 MSK дней, runway в днях от живого `GET /balance`.
- Две новые секции на `/admin/analytics`: «Unit economics» и «Retention».

**Вне scope:**
- Когортная матрица и revenue retention по когортам — Phase 10 (COH-01..05).
- Воронка оплаты, `errorCode`, тайминги, `expired` — Phase 9.
- RFM-сегменты и рассылки — Phase 11.
- Алерты о низком runway — будущая ALR-03.
- Бэкфилл `providerCost` для заказов до Phase 7 — запрещён (D-08 Phase 7), NULL остаётся NULL.
- История пополнений баланса, внутридневные снапшоты, персональный LTV/drill-down по пользователю.
- Возвраты, chargeback и goodwill-политика как отдельные метрики.

</domain>

<decisions>
## Implementation Decisions

### LTV

- **D-01:** Исторический LTV gross = Σ кэша за всё время ÷ число различных пользователей с ≥1 оплаченным заказом (простое среднее по всем платящим). «Платящий» = DISTINCT `user_id` по заказам в PAID-статусах; trial-ключи заказов не создают. Подпись «за всё время»; активные плательщики помечаются как недоамортизированные. Кэш = `cashOf` = `max(0, finalAmount − balanceUsed)`.
- **D-02:** Прогнозный LTV gross = ARPPU за последние 30 MSK дней ÷ месячный logo churn за те же 30 MSK дней. При нулевом churn — «—», не «∞» и не деление на ноль.
- **D-03:** LTV net считается только по окну полного покрытия: заказы с `providerCost ≠ null`, знаменатель — DISTINCT платящие среди этих же заказов. Формула: `Σ(cash − providerCost) ÷ платящие окна покрытия`. Подпись «по заказам с известной себестоимостью (с 21.10.2026)». Сравнение с gross допускается только рядом, с разными подписями окон — это не одна и та же база.
- **D-04:** Блок LTV не реагирует на `?period`: исторический gross — за всё время, прогнозный — фиксированные 30 MSK дней, net — всё окно покрытия. Период страницы на LTV не влияет.

### Retention и churn

- **D-05:** Grace-период = 7 дней. Подписка считается удержанной, если оплаченное (или бонусное, 0 ₽) продление закрывает разрыв не позже 7 дней после окончания покрытия.
- **D-06:** «Истекающие в периоде» подписки реконструируются из цепочки оплаченных заказов (`paidAt + days`), а не из текущего `KeyCache.expiresAt` (он хранит только актуальный срок и теряет прошлые истечения). Нужна derivation, выдающая каждое событие окончания термина и следующий `paidAt`, а не только финальный `termEnd` из `buildKeyTerms`.
- **D-07:** Revenue churn = потерянный MRR (месячный эквивалент `finalAmount / (days / 30)`) по подпискам, покрытие которых закончилось в периоде и не было продлено за grace. Показываем абсолютную сумму в ₽ и ставку = потерянный MRR ÷ MRR на начало периода. Если MRR на начало = 0 — «—».
- **D-08:** Logo churn = число ключей, чьё покрытие закончилось в периоде и не продлено за 7 дней; ставка = это число ÷ активные платные ключи на начало периода. Абсолютное число показываем всегда, ставка — «—» при нулевой базе. Знаменатель намеренно не «истекающие», иначе logo churn дублировал бы `1 − renewal rate`.
- **D-09:** Renewal rate = продлённые ключи ÷ ключи, чьё покрытие закончилось в периоде. Продление — любой оплаченный `kind='renew'` или бонусное продление, закрывающее разрыв в пределах 7 дней; `kind='upgrade'` продлением не считается. Нет истечений в периоде → «—», не 0 %.
- **D-10:** В retention учитываются только платные ключи (`isTrial = false`). Trial-ключи исключены. Бонусное продление (0 ₽) = удержание: ключ не попадает в churn, но и денег в revenue churn не добавляет.

### Margin и cost

- **D-11:** Gross margin = `Σ(cash − providerCost)` по costed-заказам за `?period`; маржинальность = margin ÷ `Σcash` по тем же costed-заказам. Показываем coverage «N из M заказов». NULL-себестоимость не подставляем нулём и не экстраполируем.
- **D-12:** Средний расход на ключ = `ΣproviderCost ÷ число costed-заказов` за `?period` (каждый оплаченный заказ = событие выдачи/продления одного ключа). Подпись «на оплаченный заказ»; знаменатель «активные ключи» не используем, потому что расход возникает при покупке, а не за день активности.
- **D-13:** Денежная база маржи — `cashOf` (`finalAmount − balanceUsed`), а не `finalAmount` из буквальной формулировки ANL-13. Причина: `balanceUsed` — не выручка (D-02 Phase 7), иначе заказ, полностью оплаченный бонусным балансом, показывал бы прибыль без денег. Это осознанное уточнение ANL-13, а не отказ от неё.

### Burn-rate и runway

- **D-14:** Burn-rate = `ΣproviderCost` за последние 30 MSK дней ÷ 30. Требуется 100 % покрытие costed-заказов в окне и минимум 7 дней с известной себестоимостью; иначе «—» + «покрытие N из M заказов». Дельта баланса между снапшотами не используется: пополнения искажают знак.
- **D-15:** Баланс для runway — живой `GET /balance` (существующий `artemida.getBalance()`) в момент рендера страницы. Runway = `floor(баланс ÷ burn)` дней. При `burn ≤ 0` — «—» с подписью «расхода нет». Ошибка `GET /balance` даёт «—» только в блоке runway, остальные блоки рендерятся.
- **D-16:** Частота снапшотов не меняется: cron пишет один снапшот за вчера, `ON CONFLICT (day) DO NOTHING` (первое чтение выигрывает). Снапшоты остаются историей для будущих трендов; burn/runway на них не опираются.

### UI-композиция

- **D-17:** Ниже sparkline добавляются две секции с заголовками: «Unit economics» и «Retention». Первый экран Phase 7 (KPI → waterfall → sparkline, D-10 Phase 7) не переставляется и не расширяется.
- **D-18:** LTV — три `MetricCard` в ряд: gross исторический, gross прогнозный, net. Retention — три карточки за выбранный период + компактная таблица последних 6 MSK-месяцев (как waterfall, с подписью фактического числа слотов). Margin/burn — карточки в секции «Unit economics».
- **D-19:** Каждый новый блок — отдельный async server component со своим try/catch, заголовком и общим load-error текстом; падение ARTEMIDA/БД не роняет остальную страницу. Переиспользуем `MetricCard`, `GRID`, `PeriodSelector`, паттерны форматирования и «—» из Phase 7. Никаких новых npm-зависимостей.
- **D-20:** Окна подписаны на каждом блоке: LTV — «за всё время» / «30 дней» / «с 21.10.2026»; renewal/logo/revenue churn, margin и cost per key — выбранный период; таблица — «6 месяцев»; burn/runway — «30 дней». Неизвестное значение всегда «—», не «0 ₽».

### the agent's Discretion

- Точные формулировки подписей и empty/error-состояний, порядок карточек внутри секций, число знаков после запятой, формат процентов (один или два знака), округление runway вниз.
- Имена новых файлов/компонентов и место derivation-логики (`lib/analytics/*`) — по паттернам Phase 7.
- Точная структура таблицы 6 месяцев (колонки) и мобильное поведение (горизонтальный скролл по образцу существующих таблиц).
- Как считать ставку logo churn, если на начало периода не было активных платных ключей: «—»; абсолютное число всё равно показывается.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Требования и роадмап
- `.planning/REQUIREMENTS.md` §ANL — ANL-04, ANL-05, ANL-06, ANL-07, ANL-13, ANL-14 и уже закрытые ANL-01..03/12/15.
- `.planning/ROADMAP.md` §Phase 8 — goal, success criteria, зависимости от Phase 7.
- `.planning/PROJECT.md` — ограничения продукта (RU/RUB, безлимит, один сервер).

### Решения и UI Phase 7
- `.planning/phases/07-analytics-foundation-revenue-metrics/07-CONTEXT.md` — D-01..D-15: MRR на `KeyCache`/цепочках, `cashOf`, goodwill, MSK, point-in-time, coverage.
- `.planning/phases/07-analytics-foundation-revenue-metrics/07-UI-SPEC.md` §5.2–§5.4 — контракт окон, KPI-карточки, waterfall/sparkline, «—» вместо нулей.
- `.planning/phases/07-analytics-foundation-revenue-metrics/07-VALIDATION.md` — как проверялись rollup, MSK-дни и backfill.
- `.planning/phases/07-analytics-foundation-revenue-metrics/07-PATTERNS.md` — паттерны сервисов/компонентов, которые нужно повторить.

### Данные и API
- `prisma/schema.prisma` — `Order` (`providerCost`, `kind`, `days`, `finalAmount`, `balanceUsed`, `paidAt`), `KeyCache` (`isTrial`, `expiresAt`), `DailyMetric`, `ArtemidaBalanceSnapshot`.
- `docs/artemida-v1-contract.md` — `GET /balance` и семантика прайсинга/сроков.
- `lib/analytics/time.ts` — `mskDayLabel`, `mskDayStartInstant`, `mskDateKey`, `pgTimestamp`, `mskMonthLabel`, `addMonths`.
- `lib/analytics/series.ts` — `PaidOrderRow`, `cashOf`, `KeyTerm`, `buildKeyTerms`, `buildDailySeries`.

### Существующий код аналитики
- `lib/analytics/mrr.ts` — `mrrAt`, `totalMrrAt`, `activeKeysAt`, `arrAt`, `computeArppu`, `computeCoverage`, `keyRefOf`.
- `lib/analytics/service.ts` — `loadKpis`, `loadWaterfall`, `loadSparkline`, `ORDER_SELECT`, запрос DISTINCT плательщиков.
- `lib/analytics/rollup.ts` — nightly rollup и `ArtemidaBalanceSnapshot` (снапшот за вчера, DO NOTHING).
- `app/api/cron/analytics/route.ts` — cron-вход 03:05 и `x-cron-secret`.
- `app/admin/analytics/page.tsx` — порядок секций, `Suspense`-скелетоны, guard `requireRole`.
- `components/admin/MetricCard.tsx`, `PeriodSelector.tsx`, `AnalyticsKpi.tsx`, `MrrWaterfall.tsx`, `MrrSparkline.tsx` — визуальные паттерны.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `buildKeyTerms` + `KeyTerm`: уже группирует оплаченные заказы по `keyRef = keyId ?? provisionedKeyId` и строит цепочку терминов; переиспользовать для активных ключей и базы churn.
- `cashOf` и `computeArppu`: готовая денежная семантика и защита от деления на ноль; LTV/ARPPU должны использовать их, а не свои формулы.
- `activeKeysAt` / `mrrAt`: point-in-time знаменатели для logo churn и revenue churn на начало периода.
- `MetricCard`, `GRID`, `PeriodSelector`: полностью покрывают новые карточки и переключатель периода.
- `artemida.getBalance()`: уже используется в admin-stats и rollup; готов для живого runway.

### Established Patterns
- Деньги — целые рубли, кэш = `finalAmount − balanceUsed`, goodwill исключён.
- Все производные — на лету из оплаченных заказов; `daily_metrics` — только rollup, не источник истины.
- MSK-дни считаются в JS (`mskDayLabel`/`mskDayStartInstant`); нельзя смешивать label и instant.
- Неизвестное значение = `null` → «—»; никаких нулей вместо отсутствующих данных.
- Блоки страницы изолированы try/catch и `Suspense`; ошибка одного блока не ломает страницу.
- TDD/unit-тесты на чистые derivation-функции (vitest), без новых зависимостей.

### Integration Points
- `lib/analytics/service.ts` (или новый `lib/analytics/economics.ts`) — загрузка LTV/churn/margin/burn.
- `lib/analytics/series.ts` — расширить/добавить derivation событий окончания термина (текущий `buildKeyTerms` отдаёт только финальный `termEnd` и не сохраняет разрывы между терминами).
- `lib/analytics/mrr.ts` — point-in-time MRR/active keys на границах периода.
- `app/admin/analytics/page.tsx` — две новые секции ниже sparkline, каждая со своим `Suspense`.
- `lib/i18n/messages/ru.ts` — новые подписи и empty/error-состояния (i18n-тест падает и на неиспользуемых ключах).
- `app/api/cron/analytics/route.ts` + `rollup.ts` — не меняются, кроме случаев, если derivation решит использовать снапшоты (по D-16 — не использует).

</code_context>

<specifics>
## Specific Ideas

Формулы, которые планировщик должен зафиксировать в коде и тестах:

- `cash = max(0, finalAmount − balanceUsed)`
- `LTV gross (hist) = Σ cash(все PAID) / COUNT(DISTINCT user_id)`
- `ARPPU(30) = Σ cash(30 MSK дней) / COUNT(DISTINCT user_id в окне)`
- `logo churn rate = churned keys / active paid keys at period start`
- `renewal rate = renewed keys / keys whose coverage ended in period`
- `revenue churn = Σ (finalAmount / (days / 30)) of churned terms`; rate = lost MRR ÷ MRR at period start
- `LTV gross (pred) = ARPPU(30) / logo churn rate(30)`
- `LTV net = Σ(cash − providerCost) / payers in costed window`
- `gross margin = Σ(cash − providerCost)`; `% = margin / Σcash` over the same costed orders
- `cost per key = Σ providerCost / count(costed paid orders)`
- `burn = Σ providerCost(30 MSK дней) / 30`
- `runway = floor(live balance / burn)`

Граничные случаи, которые должны быть покрыты тестами: нулевые знаменатели, `providerCost = null`, пустой период, burn = 0, отсутствие снапшотов/баланса, ключ с разрывом ровно 7 дней (включающая граница), upgrade без продления, бонусное продление, trial-ключи.
</specifics>

<deferred>
## Deferred Ideas

- Когортная матрица и revenue retention — Phase 10.
- Алерт при низком runway — будущая ALR-03 (не Phase 8).
- Внутридневные снапшоты баланса и ручное обновление из админки — отложено, снапшоты остаются раз в сутки.
- Бэкфилл `providerCost` и любые оценки исторической себестоимости — запрещены.
- Персональный LTV / drill-down по пользователю — вне scope, вероятно в RFM/сегментах.
- Учёт возвратов и chargeback в net-метриках — не обсуждалось как часть Phase 8.

</deferred>

---

*Phase: 8-Unit Economics & Retention*
*Context gathered: 2026-10-22*
