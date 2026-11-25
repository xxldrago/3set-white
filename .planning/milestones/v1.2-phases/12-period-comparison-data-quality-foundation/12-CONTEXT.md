# Phase 12: Period Comparison & Data-Quality Foundation - Context

**Gathered:** 2026-10-31
**Status:** Ready for planning

<domain>
## Phase Boundary

Фаза даёт фундамент доверия к аналитике v1.1 и запускает захват данных, который нельзя восстановить задним числом:

1. **Сравнение периодов (ALR-01)** — WoW/MoM-дельта (абсолют и %) для каждой метрики на `/admin/analytics` и в отчётах, на MSK-границах, без сравнения неполного дня с полным периодом.
2. **Data-quality флаги (EXT-05)** — degraded-ответы ARTEMIDA фиксируются событиями, исключаются из агрегатов, и метрика помечается в UI с числом исключённых записей.
3. **Write-guard rollup** — degraded-прогон не может перезаписать здоровые значения `daily_metrics`.
4. **Захват кликов промокодов** (основание PRM-01, доставка — Phase 14) — beacon пишет клики и для generic-, и для партнёрских кодов.
5. **Захват IP-хеша аккаунта** (основание PRM-04, доставка — Phase 14) — `signupIpHash` при регистрации и при trial claim.
6. **Метрический реестр** — `lib/analytics/metric-registry.ts` как единый источник id/подписи/формулы/источника/ограничений для дашбордов и будущего словаря (Phase 16).

**Вне scope:** сами алерты (Phase 13), promo/partner ROI и fraud-отчёты (Phase 14), save-list/upsell (Phase 15), CSV и страница словаря (Phase 16), IP-кластеры как fraud-детекция (P2).

</domain>

<decisions>
## Implementation Decisions

### Подача дельт WoW/MoM (ALR-01)

- **D-01:** Дельта показывается **внутри каждой карточки**. `MetricCard` расширяется необязательными пропами `delta` (абсолют + %) и `quality` — все существующие отчёты наследуют одну подачу без переписывания блоков.
- **D-02:** Окно сравнения выбирается **автоматически по `?period`**: 7 дней → предыдущие 7 (WoW); 30 → предыдущий месяц (MoM); 90 → предыдущие 90 дней. Отдельного переключателя WoW/MoM нет.
- **D-03:** При нулевой базе процент не считается: показываем `—` и подпись «нет базы»; абсолютная дельта остаётся видимой. Никаких `∞%` и «новое» для метрик, где это бессмысленно.
- **D-04:** **Сегодняшний незавершённый MSK-день исключается из обоих сравниваемых окон.** Оба периода считаются только по завершённым календарным дням Europe/Moscow. — **Reversibility:** costly — меняет семантику `windowStartDay` и всех оконных лоадеров/тестов, которые сейчас включают сегодняшний день.
- **D-05:** Если покрытие периодов несопоставимо (например, база содержит degraded-дни или окно неполное), результат помечается `incomparable` и число не показывается. `partial` не используется как замена числу — только `incomparable`.

### Degraded-данные и write-guard (EXT-05)

- **D-06:** Degraded-событие = **сбой вызова ARTEMIDA**: timeout, 5xx после исчерпания p-retry, 429 с исчерпанными ретраями, 401/402. «Подозрительно пустой ответ» degraded-событием **не** считается (защита от ложных флагов).
- **D-07:** События пишутся в **append-only таблицу `data_quality_events`** (источник, MSK-день, причина, детали, `createdAt`, признак открытости/закрытия). `daily_metrics` остаётся чистым value-rollup — флаг качества в нём не хранится. — **Reversibility:** one-way — новая таблица + миграция; откат = drop table и потеря истории качества.
- **D-08:** **Write-guard:** уже записанный здоровый `daily_metrics`-день никогда не перезаписывается degraded-прогоном. Если день ещё не записан и прогон degraded — строка пишется (чтобы не было дыры), а событие фиксируется в `data_quality_events`. — **Reversibility:** costly — меняет контракт `rollupDays` (absolute upsert) и требует тестов на все ветки.
- **D-09:** **Авто-ретрай:** ночной rollup перепроверяет последние **3 MSK-дня**, у которых есть открытое degraded-событие; более старые дни закрываются только ручным `scripts/backfill-*.ts`.
- **D-10:** **Пометка в UI:** любое исключённое событие в окне → бейдж «данные неполные (N)» на карточке/блоке; причина и список событий — в тултипе/подписи. Порогов нет: честность важнее тишины.

### Захват кликов и IP (основание PRM-01/PRM-04)

- **D-11:** Клики generic-промокодов хранятся **в обобщённой `referral_clicks`**: `ownerUserId` становится nullable, добавляются `promoCodeId` (nullable) и `kind` (`referral` | `promo`). Одна таблица — одна воронка click → register → pay для всех кодов. — **Reversibility:** one-way — миграция меняет NOT NULL и добавляет колонки; откат требует решения, что делать с generic-строками.
- **D-12:** Один клик = **час по `ipHash`**, ровно как в текущем `recordClick`. Никаких cookie/consent-зависимых схем; цифры остаются сопоставимыми с уже накопленными партнёрскими кликами.
- **D-13:** Клики и `ipHash` хранятся **13 месяцев**, затем автоматически удаляются ночным cron. Отдельного UI для этого нет.
- **D-14:** Хеш IP аккаунта фиксируется в **двух точках**: `User.signupIpHash` при регистрации и `User.trialIpHash` при trial claim. Сырой IP не хранится никогда; литерал `clientIp() === "direct"` не хешируется и не попадает в кластеры. — **Reversibility:** one-way — миграция + forward-only данные; историю до Phase 12 восстановить нельзя.

### Метрический реестр

- **D-15:** `lib/analytics/metric-registry.ts` — **единый TS-реестр** метрик (`id`, подпись, формула, источник данных, направление «рост хорошо/плохо», ограничения). Подписи и порядок метрик в дашбордах берутся из реестра; Phase 16 добавляет тест «каждый `MetricId` имеет запись в словаре». — **Reversibility:** costly — реестр становится контрактом для всех карточек и словаря.

### the agent's Discretion

- Имя и форма публичного beacon-маршрута для промокодов (обобщить `/api/referrals/click` vs добавить `/api/promo/click`), с сохранением правила «всегда 200, без oracle».
- Схема и индексы `data_quality_events`; как именно определяется «открытое» событие (флаг vs `resolvedAt`).
- Как считать `incomparable`: по наличию degraded-события в базовом окне, по неполному покрытию или по обоим условиям.
- Точные i18n-ключи, визуальная форма бейджа и размещение подписи «нет базы».
- Как реестр метрик связан с существующими подписями (постепенная миграция vs параллельные константы).
- Формат `scripts/backfill-*.ts` для закрытия старых degraded-дней.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone / requirements
- `.planning/ROADMAP.md` — Phase 12: Goal, Requirements (ALR-01, EXT-05), 9 Success Criteria
- `.planning/REQUIREMENTS.md` — ALR-01, EXT-05, Milestone Decisions D1–D6
- `.planning/PROJECT.md` — Core Value, Constraints, Validated (v1.1 analytics surface)

### Research (v1.2, freshly gathered)
- `.planning/research/SUMMARY.md` — scope additions S1–S6, owner decisions D1–D6, per-phase guidance
- `.planning/research/PITFALLS.md` — partial-day comparison, absolute-value upsert overwrite, `windowStartDay` includes today, `clientIp()` returns `"direct"`
- `.planning/research/ARCHITECTURE.md` — new tables, seam placement, per-phase build order
- `.planning/research/STACK.md` — zero new dependencies; capture-only groundwork rationale

### Analytics primitives (reuse, do not re-invent)
- `lib/analytics/time.ts` — MSK day primitives (`mskDayLabel`, `mskDayStartInstant`, `mskDateKey`, `mskMonthLabel`, `addMonths`); THE RULE: compute Moscow day in JS, never in SQL
- `lib/analytics/series.ts` — pure daily aggregate builder (`buildDailySeries`, `cashOf`, `DailyAggregate`)
- `lib/analytics/rollup.ts` — absolute-value idempotent upsert into `daily_metrics` (the write-guard target)
- `lib/analytics/service.ts` — `windowStartDay(period)`, `loadKpis`, `loadWaterfall`, `loadSparkline`, LTV/margin/retention/funnel/cohort loaders
- `lib/analytics/mrr.ts` — point-in-time MRR (`mrrAt`) used instead of `daily_metrics` for point metrics

### Upstream / capture
- `lib/artemida.ts` — `ArtemidaError`, p-retry policy (429/502/503), `buildError`; degraded detection hooks here or at the analytics seam
- `lib/referral-stats.ts` — `recordClick` (hourly per-IP dedupe, `hashIp`), `funnelStats`
- `app/api/referrals/click/route.ts` — existing public beacon contract (always 200, no oracle)
- `lib/client-ip.ts` — `clientIp()` returns literal `"direct"` in some paths
- `prisma/schema.prisma` — `DailyMetric`, `Setting`, `Notification`, `ReferralClick`, `User`

### UI / admin surface
- `components/admin/MetricCard.tsx` — `CARD`, `GRID`, `FUNNEL_GRID`, hero/default/compact variants (the delta/quality extension point)
- `app/admin/analytics/page.tsx` — RSC composition, per-block try/catch, `?period` handling
- `lib/admin-auth.ts` — `requireRole`, `NAV_SECTIONS` counterpart (union + MATRIX)
- `app/admin/layout.tsx`, `components/admin/AdminNav.tsx`, `lib/i18n/ru.ts` — 4-file touchpoint for any new admin section
- `docs/DEPLOY.md` — cron lines (analytics 03:05, rfm 03:10) where new jobs are registered

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `MetricCard` + `CARD`/`GRID`/`FUNNEL_GRID`: single extension point for deltas and quality badges — every report already imports it.
- `lib/analytics/time.ts`: all MSK math exists; comparison windows must be built from these helpers, not new date code.
- `buildDailySeries` / `rollupDays`: proven absolute-upsert path; write-guard is a small conditional around the existing upsert, not a rewrite.
- `recordClick` + `hashIp` + `clientIp`: existing click semantics and privacy posture to reuse for promo clicks.
- `Setting` KV: thresholds/toggles without migration (established in Phase 11).
- `requireRole` + per-block try/catch: established admin page skeleton.

### Established Patterns
- Pure module → loader (`*-service.ts`) → async RSC page/cron route. New derivation (`compare.ts`, `windows.ts`) stays pure and unit-testable with no Prisma import.
- MSK labels computed in JS; SQL receives values, never decides "today".
- `force-dynamic` on every admin RSC page; `requireRole` on page AND API route (defense in depth).
- Migration + `npx prisma migrate deploy` on deploy; no RC Prisma versions.
- i18n: literal `switch`/map patterns that survive the unused-key scan; all user-facing copy in `lib/i18n/ru.ts`.
- Admin section = synchronized edits in `lib/admin-auth.ts`, `app/admin/layout.tsx` (`NAV_SECTIONS`), `components/admin/AdminNav.tsx`, `lib/i18n/ru.ts` (the 4-file touchpoint that v1.1 audit caught).

### Integration Points
- `lib/analytics/service.ts` — where loaders gain `compare` windows and quality metadata.
- `lib/analytics/rollup.ts` — write-guard + degraded event recording.
- `app/api/cron/analytics/route.ts` — 3-day retry window and event closure.
- `prisma/schema.prisma` — `data_quality_events`, generalized `referral_clicks`, `User.signupIpHash`/`trialIpHash`.
- `app/api/referrals/click/route.ts` (+ landing capture component) — promo clicks reach the same beacon path.
- `lib/i18n/ru.ts` — new copy for deltas, «нет базы», «данные неполные (N)».

</code_context>

<specifics>
## Specific Ideas

- Ошибка сравнения должна выглядеть как отсутствие данных, а не как «0%»: `—` + подпись, без красного/зелёного (нейтральные токены).
- Бейдж качества — счётчик исключённых событий прямо в подписи («данные неполные (3)»), причина в тултипе.
- Клик по промокоду и клик по реферальной ссылке должны жить в одной воронке, иначе Phase 14 будет склеивать две таблицы UNION'ом.
- Захват — единственная часть фазы, которую нельзя «доделать потом»: без него PRM-01/PRM-04 будут месяцами показывать пустоту.

</specifics>

<deferred>
## Deferred Ideas

- Отдельная страница `/admin/data-quality` — отложена; бейджа + тултипа достаточно до появления реального объёма событий.
- Fraud-детекция по IP-кластерам (P2) — Phase 14+ после накопления `signupIpHash`/`trialIpHash`.
- Отчёты promo/partner ROI и воронка — Phase 14; здесь только захват.
- CSV-экспорт и страница метрического словаря — Phase 16 (реестр из D-15 — их основание).

</deferred>

---

*Phase: 12-Period Comparison & Data-Quality Foundation*
*Context gathered: 2026-10-31*
