# Phase 8: Unit Economics & Retention — Research

**Researched:** 2026-10-22
**Domain:** Server-side analytics derivation (LTV / churn / margin / burn-runway) on the existing Next.js 16 RSC admin page + Prisma 7 / PostgreSQL 17
**Confidence:** HIGH on code/contract facts (every discrete value below was read in this session); MEDIUM on four derivation interpretations that need plan-time confirmation (A1, A2, A5, A6)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### LTV

- **D-01:** Исторический LTV gross = Σ кэша за всё время ÷ число различных пользователей с ≥1 оплаченным заказом (простое среднее по всем платящим). «Платящий» = DISTINCT `user_id` по заказам в PAID-статусах; trial-ключи заказов не создают. Подпись «за всё время»; активные плательщики помечаются как недоамортизированные. Кэш = `cashOf` = `max(0, finalAmount − balanceUsed)`.
- **D-02:** Прогнозный LTV gross = ARPPU за последние 30 MSK дней ÷ месячный logo churn за те же 30 MSK дней. При нулевом churn — «—», не «∞» и не деление на ноль.
- **D-03:** LTV net считается только по окну полного покрытия: заказы с `providerCost ≠ null`, знаменатель — DISTINCT платящие среди этих же заказов. Формула: `Σ(cash − providerCost) ÷ платящие окна покрытия`. Подпись «по заказам с известной себестоимостью (с 21.10.2026)». Сравнение с gross допускается только рядом, с разными подписями окон — это не одна и та же база.
- **D-04:** Блок LTV не реагирует на `?period`: исторический gross — за всё время, прогнозный — фиксированные 30 MSK дней, net — всё окно покрытия. Период страницы на LTV не влияет.

#### Retention и churn

- **D-05:** Grace-период = 7 дней. Подписка считается удержанной, если оплаченное (или бонусное, 0 ₽) продление закрывает разрыв не позже 7 дней после окончания покрытия.
- **D-06:** «Истекающие в периоде» подписки реконструируются из цепочки оплаченных заказов (`paidAt + days`), а не из текущего `KeyCache.expiresAt` (он хранит только актуальный срок и теряет прошлые истечения). Нужна derivation, выдающая каждое событие окончания термина и следующий `paidAt`, а не только финальный `termEnd` из `buildKeyTerms`.
- **D-07:** Revenue churn = потерянный MRR (месячный эквивалент `finalAmount / (days / 30)`) по подпискам, покрытие которых закончилось в периоде и не было продлено за grace. Показываем абсолютную сумму в ₽ и ставку = потерянный MRR ÷ MRR на начало периода. Если MRR на начало = 0 — «—».
- **D-08:** Logo churn = число ключей, чьё покрытие закончилось в периоде и не продлено за 7 дней; ставка = это число ÷ активные платные ключи на начало периода. Абсолютное число показываем всегда, ставка — «—» при нулевой базе. Знаменатель намеренно не «истекающие», иначе logo churn дублировал бы `1 − renewal rate`.
- **D-09:** Renewal rate = продлённые ключи ÷ ключи, чьё покрытие закончилось в периоде. Продление — любой оплаченный `kind='renew'` или бонусное продление, закрывающее разрыв в пределах 7 дней; `kind='upgrade'` продлением не считается. Нет истечений в периоде → «—», не 0 %.
- **D-10:** В retention учитываются только платные ключи (`isTrial = false`). Trial-ключи исключены. Бонусное продление (0 ₽) = удержание: ключ не попадает в churn, но и денег в revenue churn не добавляет.

#### Margin и cost

- **D-11:** Gross margin = `Σ(cash − providerCost)` по costed-заказам за `?period`; маржинальность = margin ÷ `Σcash` по тем же costed-заказам. Показываем coverage «N из M заказов». NULL-себестоимость не подставляем нулём и не экстраполируем.
- **D-12:** Средний расход на ключ = `ΣproviderCost ÷ число costed-заказов` за `?period` (каждый оплаченный заказ = событие выдачи/продления одного ключа). Подпись «на оплаченный заказ»; знаменатель «активные ключи» не используем, потому что расход возникает при покупке, а не за день активности.
- **D-13:** Денежная база маржи — `cashOf` (`finalAmount − balanceUsed`), а не `finalAmount` из буквальной формулировки ANL-13. Причина: `balanceUsed` — не выручка (D-02 Phase 7), иначе заказ, полностью оплаченный бонусным балансом, показывал бы прибыль без денег. Это осознанное уточнение ANL-13, а не отказ от неё.

#### Burn-rate и runway

- **D-14:** Burn-rate = `ΣproviderCost` за последние 30 MSK дней ÷ 30. Требуется 100 % покрытие costed-заказов в окне и минимум 7 дней с известной себестоимостью; иначе «—» + «покрытие N из M заказов». Дельта баланса между снапшотами не используется: пополнения искажают знак.
- **D-15:** Баланс для runway — живой `GET /balance` (существующий `artemida.getBalance()`) в момент рендера страницы. Runway = `floor(баланс ÷ burn)` дней. При `burn ≤ 0` — «—» с подписью «расхода нет». Ошибка `GET /balance` даёт «—» только в блоке runway, остальные блоки рендерятся.
- **D-16:** Частота снапшотов не меняется: cron пишет один снапшот за вчера, `ON CONFLICT (day) DO NOTHING` (первое чтение выигрывает). Снапшоты остаются историей для будущих трендов; burn/runway на них не опираются.

#### UI-композиция

- **D-17:** Ниже sparkline добавляются две секции с заголовками: «Unit economics» и «Retention». Первый экран Phase 7 (KPI → waterfall → sparkline, D-10 Phase 7) не переставляется и не расширяется.
- **D-18:** LTV — три `MetricCard` в ряд: gross исторический, gross прогнозный, net. Retention — три карточки за выбранный период + компактная таблица последних 6 MSK-месяцев (как waterfall, с подписью фактического числа слотов). Margin/burn — карточки в секции «Unit economics».
- **D-19:** Каждый новый блок — отдельный async server component со своим try/catch, заголовком и общим load-error текстом; падение ARTEMIDA/БД не роняет остальную страницу. Переиспользуем `MetricCard`, `GRID`, `PeriodSelector`, паттерны форматирования и «—» из Phase 7. Никаких новых npm-зависимостей.
- **D-20:** Окна подписаны на каждом блоке: LTV — «за всё время» / «30 дней» / «с 21.10.2026»; renewal/logo/revenue churn, margin и cost per key — выбранный период; таблица — «6 месяцев»; burn/runway — «30 дней». Неизвестное значение всегда «—», не «0 ₽».

### the agent's Discretion

- Точные формулировки подписей и empty/error-состояний, порядок карточек внутри секций, число знаков после запятой, формат процентов (один или два знака), округление runway вниз.
- Имена новых файлов/компонентов и место derivation-логики (`lib/analytics/*`) — по паттернам Phase 7.
- Точная структура таблицы 6 месяцев (колонки) и мобильное поведение (горизонтальный скролл по образцу существующих таблиц).
- Как считать ставку logo churn, если на начало периода не было активных платных ключей: «—»; абсолютное число всё равно показывается.

### Deferred Ideas (OUT OF SCOPE)

- Когортная матрица и revenue retention — Phase 10.
- Алерт при низком runway — будущая ALR-03 (не Phase 8).
- Внутридневные снапшоты баланса и ручное обновление из админки — отложено, снапшоты остаются раз в сутки.
- Бэкфилл `providerCost` и любые оценки исторической себестоимости — запрещены.
- Персональный LTV / drill-down по пользователю — вне scope, вероятно в RFM/сегментах.
- Учёт возвратов и chargeback в net-метриках — не обсуждалось как часть Phase 8.
</user_constraints>

## Project Constraints (from AGENTS.md)

AGENTS.md exists and binds this phase. Actionable directives the plan must honor:

- **GSD workflow enforcement**: no direct repo edits outside a GSD command (`/gsd-quick`, `/gsd-debug`, `/gsd-execute-phase`); this phase is executed via `/gsd-execute-phase`.
- **Security**: `ARTEMIDA_API_KEY`, Platega secrets, SSH/root password — env/secrets only, no commits; live balance is a server-side call, the API key must never reach the browser.
- **API limits**: respect ARTEMIDA error codes `401/402/409/429/502/503` and `Retry-After` (existing `artemida` client already does; Phase 8 adds no new provider calls beyond the existing `getBalance`).
- **Compatibility**: PWA installable, mobile-first admin (new blocks are read-only cards + one scrollable table).
- **Infrastructure**: single server; the analytics page stays under the existing admin role gate.
- **Compliance**: RU/RUB only; «—»-on-unknown, whole rubles, Russian copy via `lib/i18n`.
- **Tech stack (locked)**: Node 24 + Next.js 16 + Prisma 7 (never Prisma 8 RC); zero new dependencies for this phase.

Comment style: the observable convention in `lib/analytics/*` is a **module-header doc comment** carrying the money semantics / boundary contract, plus terse inline notes — Phase 8 modules should follow the same pattern rather than plain "no comments".

<phase_requirements>
## Phase Requirements

| ID | Description (ROADMAP / REQUIREMENTS) | Research Support |
|----|--------------------------------------|------------------|
| ANL-04 | LTV gross historical + predictive | §Derivation 3 (`cashOf` = `max(0, finalAmount − balanceUsed)` [VERIFIED: lib/analytics/series.ts:41-43]; payers = DISTINCT `user_id`; predictive = ARPPU(30) ÷ logoChurn(30), `null` when churn base 0 — D-02). |
| ANL-05 | LTV net with explicit coverage | §Derivation 3 (costed subset only; payers = DISTINCT users *among costed orders*; `coverageFrom` = earliest costed `paidAt` MSK label; `providerCost` stays `null`-never-0 [VERIFIED: prisma/schema.prisma:191-195]). |
| ANL-06 | Renewal rate — доля продлённых подписок от числа истекающих в периоде | §Derivation 1–2 (sibling term-event derivation `buildKeyTermEvents` with `nextPaidAt`; 7-day inclusive grace `<=`; `kind='upgrade'` never counts as renewal — D-09; event-per-term-end counting per D-06). |
| ANL-07 | Logo churn (expired, not renewed in grace) and revenue churn, plus compact 6-month table (D-18) | §Derivation 2 + 5 (cohort-clamped counts for rates [ASSUMED — A6]; shared month-slot derivation `trailingMonthLabels` extracted from `loadWaterfall` [VERIFIED: lib/analytics/service.ts:154-178]; `expiring === 0` → `null` rate, real zeros in absolute cells). |
| ANL-13 | Gross margin, margin %, cost per key | §Derivation 4 (cash not `finalAmount` — D-13 [CITED: 08-CONTEXT.md D-13]; costed orders only; margin % on the same costed `Σcash`; NULL never zero-filled [VERIFIED: prisma/schema.prisma:191-195]). |
| ANL-14 | Burn-rate + runway from live balance | §Derivation 4 (30 MSK days, 100 % coverage + ≥7 distinct costed days, `floor(live balance / exact burn)` [VERIFIED: lib/artemida.ts:641 `getBalance`]; snapshots explicitly not used — D-16). |
</phase_requirements>

## Summary

Phase 8 is a **pure derivation + presentation phase**: no schema change, no migration, no new npm package, no new route, no cron change. Every number is computed from the existing `orders` / `keys_cache` tables plus one live `GET /balance`; the presentation surface is five new async server components appended below the Phase 7 sparkline. The hard work is not the UI — it is (a) reconstructing **term-end events** (not just a final `termEnd`) with the next `paidAt` so grace-window renewal can be classified, and (b) keeping every unknown (`null`) distinct from a real zero all the way into the RSC payload.

The central code finding is that `buildKeyTerms` is the right cursor engine but the wrong output shape: it returns only `termEnd` per key and discards intermediate gaps, exactly as D-06 says. A sibling function can reuse the identical `Math.max(cursor, paidAt) + days` cursor and additionally emit `start`, `end`, `days`, the originating op, and `nextPaidAt`. That single addition unlocks renewal rate, logo churn, revenue churn, and the 6-month table. It must be validated by an invariant test against `buildKeyTerms` (last event end === `termEnd` for every key).

Two implementation traps are documented in full below. First, `redeemBonusDays` extends a key **through the provider and `upsertCachedKey` without creating an `Order` row** — order-chain reconstruction cannot see those days, so the *latest* term of each key needs a `KeyCache.expiresAt` liveness override or the key will be reported as churned while it is still active. Second, D-07's literal `finalAmount / (days/30)` is **not** the same money base as D-13's `cashOf`; this research follows the locked D-07 formula for revenue churn and flags the mismatch as A1 for an explicit plan-time decision. Only one test in the whole analytics suite is currently red (`tests/unit/analytics-mrr.test.ts:190`, a stale pre-CR-01 expectation — reproduction included below), and the phase gate must be baseline-aware.

**Primary recommendation:** Add two pure modules (`lib/analytics/retention.ts`, `lib/analytics/economics.ts`), five loaders appended to `lib/analytics/service.ts`, five server components + one presentational `AnalyticsSection`, and exactly the 44 UI-SPEC keys (43 locked + `analyticsLtvGrossHistSubActive` for the D-01 under-amortization marker); write the pure test suites first (term events + grace boundary + zero denominators), then wire the UI.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|--------------|----------------|-----------|
| Term-end event reconstruction / grace classification | API / Backend (pure `lib/analytics/retention.ts`) | — | Deterministic computation over DB rows; must be unit-testable without a DB or React. |
| LTV, margin, burn, runway arithmetic | API / Backend (pure `lib/analytics/economics.ts`) | — | Pure functions over numbers; identical reason. |
| DB reads (paid orders, trial-key flags, costed aggregates, distinct payers) | API / Backend (`lib/analytics/service.ts` loaders) | Database / Storage | Prisma is already the only DB seam; pure modules must stay import-free of `prisma`. |
| Live ARTEMIDA balance | API / Backend (`artemida.getBalance()` inside `loadBurnRunway`) | External service | Server-to-server only; the API key never reaches the browser. |
| Access control | API / Backend (`requireRole('administrator','manager')` at page level) | — | Existing RSC guard re-checks the role for direct RSC fetches [VERIFIED: app/admin/analytics/page.tsx:52-59]. |
| Number/percent/date formatting, «—» decision | Frontend Server (RSC components) | — | `null` crosses the loader boundary; formatting is a render concern (UI-SPEC §6.7). |
| Period selection | Browser / Client (`PeriodSelector` island, existing) | Frontend Server (normalizes `?period`) | Already shipped in Phase 7; no new control [VERIFIED: components/admin/PeriodSelector.tsx:8-18]. |
| Presentation composition / Suspense | Frontend Server (`page.tsx`, 5 server components) | — | No client components are added; each block streams independently. |

## Standard Stack

### Core (all already installed — **no new dependencies**)

| Library | Version | Purpose in Phase 8 | Why Standard |
|---------|---------|--------------------|--------------|
| Node.js | 24.15.0 (verified `node -v` this session) | Runtime for loaders + RSC render | Project pin (AGENTS.md STACK); native `fetch`/`Intl` cover every need. |
| TypeScript | 5.9.x (`package.json` — `"typescript": "^5"`) | Types for the new payloads | Existing strict config; no new type package. |
| Next.js | 16.3.7 (`package.json` — `"next": "16.3.7"`) | App Router RSC + `Suspense` streaming | Page already `force-dynamic` [VERIFIED: app/admin/analytics/page.tsx:31]; new blocks are async server components. |
| Prisma | 7.10.x (`package.json` — `"prisma": "^7.10.0"`) | Reads: `order.findMany`, `keyCache.findMany`, `$queryRaw` aggregates | `ORDER_SELECT` already carries every field Phase 8 needs [VERIFIED: lib/analytics/service.ts:56-69]. |
| vitest | 5.0.3 (verified `npx vitest --version` this session) | Pure + DB-backed tests | Existing suite (`vitest.config.ts`); no new test runner. |

**No package legitimacy audit is required for this phase: it installs nothing.** `package.json` is unchanged by design (D-19). If an executor proposes a chart, date, or money library, that proposal violates D-19 and must be rejected.

### In-repo primitives to reuse (do not re-derive)

| Primitive | Location | Use |
|-----------|----------|-----|
| `PaidOrderRow`, `cashOf` | `lib/analytics/series.ts:24-44` | Cash semantics for LTV/margin. `cashOf` quote: `return Math.max(0, row.finalAmount - row.balanceUsed);` (lines 41-43). |
| `buildKeyTerms` | `lib/analytics/series.ts:82-119` | Cursor reference + invariant oracle. Cursor quote (lines 103-108): `cursorMs = Math.max(cursorMs ?? paidAtMs, paidAtMs) + (op.days as number) * DAY_MS;`. |
| `keyRefOf`, `totalMrrAt`, `activeKeysAt`, `computeArppu` | `lib/analytics/mrr.ts:47-49,117-133,162-171` | MRR base, ARPPU, key identity. `keyRefOf` quote: `return o.keyId ?? o.provisionedKeyId ?? null;` (line 48). |
| `mskDayLabel`, `mskDayStartInstant`, `mskMonthLabel`, `addMonths`, `pgTimestamp` | `lib/analytics/time.ts:17-78` | All window math. Rule quote (lines 9-15): "Never let Postgres compute 'today'… `mskDayStartInstant` → INSTANT for `timestamp(3)` windows; `mskDateKey` → DATE KEY for `@db.Date` params; they differ by one day." |
| `PAID`, `ORDER_SELECT`, `windowStartDay`, `loadPaidOrders` | `lib/analytics/service.ts:51-91` | DB seam + status filter. `PAID` quote (line 51): `const PAID = ["paid", "provisioning", "provisioned"] as const;`. |
| `CARD`, `GRID`, `MetricCard` | `components/admin/MetricCard.tsx:7-40` | Card markup at `size="compact"`. `GRID` quote (line 8): `'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3'`. |
| `artemida.getBalance()` | `lib/artemida.ts:641` | Live balance; `Balance` shape (lines 312-316): `{ balance: number; currency: string; unlimited: boolean }`. |

## Package Legitimacy Audit

**Not applicable — Phase 8 installs zero packages.** The phase contract forbids new dependencies (08-CONTEXT D-19; 08-UI-SPEC "no new npm dependencies"), and every capability maps to a primitive already in the tree. No registry lookup, no postinstall audit, no `checkpoint:human-verify` install gate is needed. If a plan contains `npm install`, the plan is wrong. (Verified `npm view` not run — there is nothing to look up; `package.json` dependency set confirmed unchanged by this phase's scope.)

## Architecture Patterns

### System Architecture Diagram

```
                    ┌──────────────────────────────────────────────┐
Browser GET         │  app/admin/analytics/page.tsx (force-dynamic)│
/admin/analytics ──▶│  requireRole('administrator','manager')      │
?period=7|30|90     │  normalize period → 7|30|90 else 30          │
                    └───────────────┬──────────────────────────────┘
                                    │ renders, below <MrrSparkline/>
              ┌─────────────────────┼───────────────────────────────┐
              ▼                     ▼                               ▼
   <AnalyticsSection>      <AnalyticsSection>                 (Phase 7 blocks
   «Юнит-экономика»        «Удержание»                         untouched)
              │                     │
   ┌──────────┼──────────┐   ┌──────┴────────┐
   ▼          ▼          ▼   ▼               ▼
 LtvCards  MarginCards BurnRunwayCards  RetentionCards  ChurnTable
   │          │          │                │               │
   ▼          ▼          ▼                ▼               ▼
 loadLtv   loadMargin  loadBurnRunway   loadRetention   loadChurnTable
   │          │          │                │               │
   └──────────┴────┬─────┴────────────────┴───────────────┘
                   ▼
        lib/analytics/service.ts  (Prisma reads, PAID filter,
        ORDER_SELECT, keyCache isTrial/expiresAt, DISTINCT payers)
                   │
        ┌──────────┴───────────┐
        ▼                      ▼
  lib/analytics/         lib/analytics/
  retention.ts (pure)    economics.ts (pure)
        │                      │
        └──────────┬───────────┘
                   ▼
        buildKeyTerms cursor semantics (series.ts:103-108)
        cashOf / totalMrrAt / computeArppu (series.ts, mrr.ts)
        MSK helpers (time.ts)

  BurnRunwayCards ──▶ artemida.getBalance()  (only network call;
                      failure isolated to that one block — D-15)
```

Data flow for every metric: `orders` rows (status ∈ `PAID`) → optional trial-key filter via `keys_cache` → pure derivation → exact numbers/`null` → component formats (Intl) → «—» on `null`. No metric reads `daily_metrics`, and none reads `artemida_balance_snapshots` (D-16).

### Recommended Project Structure

```
lib/analytics/
├── time.ts            # unchanged — MSK primitives
├── series.ts          # unchanged — cashOf, buildKeyTerms (invariant oracle)
├── mrr.ts             # unchanged — totalMrrAt / activeKeysAt / computeArppu
├── waterfall.ts       # unchanged — waterfallForMonths (month-slot reference)
├── retention.ts       # NEW (pure): term events + grace classification + window metrics
├── economics.ts       # NEW (pure): LTV / margin / burn / runway arithmetic
├── rollup.ts          # unchanged (D-16)
└── service.ts         # + loadLtv, loadMargin, loadBurnRunway, loadRetention, loadChurnTable

components/admin/
├── MetricCard.tsx     # unchanged
├── AnalyticsSection.tsx  # NEW presentational wrapper (h2 + top rule)
├── LtvCards.tsx          # NEW async RSC
├── MarginCards.tsx       # NEW async RSC, takes period
├── BurnRunwayCards.tsx   # NEW async RSC, only balance caller
├── RetentionCards.tsx    # NEW async RSC, takes period
└── ChurnTable.tsx        # NEW async RSC, ignores period

app/admin/analytics/page.tsx  # + CardsSkeleton + two sections (nothing above moves)
lib/i18n/messages/ru.ts       # + exactly 44 keys inside the existing flat `admin` object (43 locked + D-01 marker)
```

### Pattern 1: Pure derivation + thin loader (Phase 7 contract)

**What:** `retention.ts` / `economics.ts` import only types and other pure helpers; they never import `prisma`, `next/*`, or React. `service.ts` owns every query and every `PAID` filter, then hands plain rows to the pure functions.
**When to use:** Always for these metrics — the tests are the phase's main safety net and must run without Postgres.
**Example:** see §Derivation 1–5.

### Pattern 2: Sibling term-event derivation, validated against `buildKeyTerms`

**What:** `buildKeyTermEvents` mirrors the exact cursor in `buildKeyTerms` (`Math.max(cursorMs ?? paidAtMs, paidAtMs) + days * DAY_MS` [VERIFIED: lib/analytics/series.ts:103-108]) and additionally emits each intermediate term with `nextPaidAt`. `buildKeyTerms` itself is not modified (Phase 7 behavior is frozen).
**When to use:** Every retention metric; never reconstruct terms a second, divergent way.
**Guard:** an invariant test asserts, for every `keyRef`, `events.at(-1)!.end.getTime() === buildKeyTerms(paid).get(keyRef)!.termEnd.getTime()`.

### Pattern 3: `null` is a value, not an error

Every unknown crosses the loader boundary as `null`; the component decides «—». Ratios are exact rationals (no pre-multiplied percentages). No loader returns a pre-formatted string. This is pinned by 08-UI-SPEC §6.7 and matches Phase 7's KPI contract (`AnalyticsKpi` renders «—» on `arppu === null` [VERIFIED: components/admin/AnalyticsKpi.tsx:62-72]).

### Pattern 4: Cohort-clamped churn rates [ASSUMED — A6]

Logo churn and revenue churn are computed over the **keys that were active at the window start** (a cohort), so a key bought and lost inside the same window cannot push the rate above 100 %. Renewal rate stays term-based (it intentionally counts every term end in the window). Both scopes are stated on the block; this is the A6 interpretation of D-08's wording and needs plan-time confirmation.

### Pattern 5: One failing block cannot fail the page

Each of the five components is `async` with its own `try/catch` returning `heading + common.errorLoad` (Phase 7 pattern — `AnalyticsKpi` catch block [VERIFIED: components/admin/AnalyticsKpi.tsx:21-29]). The balance call is caught inside `loadBurnRunway`'s own `.catch(() => null)` so a provider outage cannot even reject that loader (D-15).

### Anti-Patterns to Avoid

- **Second cursor implementation with different rounding:** use `Math.max(cursorMs ?? paidAtMs, paidAtMs) + days * 86_400_000` exactly (series.ts:103-108). Any `new Date(paidAt + days)` variant will drift.
- **Reading `KeyCache.expiresAt` as the primary history:** it holds only the current expiry; history is lost (D-06). Use it only as a liveness override for the latest term (A2).
- **Using `daily_metrics` as the source of truth:** D-16 / Phase 7 D-12 — rollups are a snapshot, not the ledger.
- **Using `ArtemidaBalanceSnapshot` deltas for burn:** explicitly rejected (D-14/D-16).
- **Zero-filling `providerCost`:** erases the coverage signal and fabricates profit (schema comment: "Never default 0 — that would erase the null gap and pose as fact" [VERIFIED: prisma/schema.prisma:191-195]).
- **Counting orders instead of DISTINCT payers:** ARPPU/LTV denominators are users, not orders (loadKpis uses `COUNT(DISTINCT user_id)::int` [VERIFIED: lib/analytics/service.ts:115-120]).
- **`new Date("YYYY-MM-DD")` or `::date` for window bounds:** the one-day shift documented in `time.ts:9-15`.
- **Pre-rounding before division:** runway must use exact burn; percentages must be computed from exact rationals.
- **Adding `'use client'` or a chart library:** no client components, no charts (UI-SPEC explicit non-goals).

## Core Derivation Spec (prescriptive)

> All five loaders return the shapes pinned in 08-UI-SPEC §6.7. All windows are MSK; `now = new Date()` once per loader. `DAY_MS = 86_400_000`. Grace = 7 × `DAY_MS`, inclusive at the boundary (`<=`).

### 1. Term events and classification — `lib/analytics/retention.ts`

```ts
export interface TermEvent {
  keyRef: string;
  start: Date;
  end: Date;
  days: number;              // op.days, non-null by construction
  op: PaidOrderRow;          // the new|renew op that opened this term
  nextPaidAt: Date | null;   // next chain op's paidAt, null for the latest term
}

export type TermOutcome = 'open' | 'renewed' | 'pending' | 'churned';

export function classifyTerm(
  e: TermEvent,
  now: Date,
  graceMs = 7 * DAY_MS,
): TermOutcome {
  if (e.end.getTime() > now.getTime()) return 'open';
  if (e.nextPaidAt && e.nextPaidAt.getTime() <= e.end.getTime() + graceMs) return 'renewed'; // inclusive (D-05)
  if (now.getTime() < e.end.getTime() + graceMs) return 'pending';                            // [ASSUMED — A5]
  return 'churned';
}
```

`buildKeyTermEvents` is the same cursor as `buildKeyTerms`, emitting one `TermEvent` per `new|renew` op; the full implementation is in §Code Examples ("Term events + retention window").

Rules this encodes:
- The cursor is **identical** to `buildKeyTerms` (`Math.max(cursor, paidAt) + days`), so a renewal that lands early extends from the current expiry, never restarts.
- `upgrade` ops never appear in the chain (`days` is null [VERIFIED: prisma/schema.prisma:174 `days Int?`]; D-09: an upgrade is not a renewal).
- `nextPaidAt` is the next **chain** op only. A renewal within 7 days → `renewed`; a renewal after 7 days → the term is `churned` and the next term opens at its own `paidAt` (a win-back is not a renewal).
- `pending` exists **only** inside the grace window of a term that has already ended: it is neither renewed nor churned. It is counted in `expiring` but in neither numerator [ASSUMED — A5].
- `open` terms (end in the future) never enter a window.

**Trial filtering (D-10):** load `prisma.keyCache.findMany({ select: { keyId, isTrial, expiresAt } })`; drop every order whose `keyRefOf(op)` is in `trialRefs` before building events. Today this is a no-op — trials create no `Order` row (`startTrial` calls `artemida.createTrial` and never `prisma.order.create` [VERIFIED: lib/keys-service.ts:541-557]; the only `prisma.order.create` in the repo is `lib/orders-service.ts:188`) — but the filter is required by D-10 and is cheap.

**Bonus-day override (A2 — flag for plan-time confirmation):** `redeemBonusDays` calls `artemida.renewKey(...)` then `upsertCachedKey(...)` and creates **no** `Order` [VERIFIED: lib/referrals.ts:689-698 — `const renewed = await artemida.renewKey(keyId, {...}); await upsertCachedKey(userId, renewed);`]. Those days are invisible to the chain. Apply a liveness override to the **latest** event of each key only:

```ts
const liveExpiry = keyState.get(keyRef); // KeyCache.expiresAt [VERIFIED: prisma/schema.prisma:229 `expiresAt DateTime? @map("expires_at")`]
if (liveExpiry && liveExpiry.getTime() > latest.end.getTime()) latest.end = liveExpiry;
```

Then classify with the extended end. Effects: a bonus-extended active key is not reported as churned; a bonus extension that has itself lapsed is churned at its true end. Historical (non-latest) terms are not adjusted — documenting this approximation is required.

### 2. Window metrics — `retentionForWindow`

```ts
export interface RetentionWindow {
  start: Date;          // inclusive, MSK day-start instant
  endExclusive: Date;   // exclusive — half-open [start, endExclusive)
  now: Date;            // classification clock (grace/pending)
}

export interface RetentionResult {
  renewalRate: number | null; renewedKeys: number; expiringKeys: number;
  logoChurnRate: number | null; churnedKeys: number; activeKeysAtStart: number;
  revenueChurnRate: number | null; lostMrr: number; mrrAtStart: number;
}
```

Algorithm (single pass over `events`, orders already trial-filtered):

1. `inWindow = events.filter(e => e.end >= start && e.end < endExclusive)` — **half-open**, so an end at exactly 00:00 MSK on the 1st belongs to the new month only (no double count between adjacent monthly rows). `endExclusive` is never in the future: for the current period/month it is `now`.
2. `expiringKeys` = `inWindow.length` (term-end events; D-06's "каждое событие окончания термина" [ASSUMED — A6]).
3. `outcome = classifyTerm(e, now)` for each; `renewedKeys` = count `renewed`; `pending` counted nowhere else; `churnedTerms` = `churned`.
4. `activeAtStart` = set of `keyRef` where `some(e => e.start <= start && start < e.end)` (order-bearing coverage, **including 0 ₽ bonus terms**; this is deliberately not `activeKeysAt`, which drops `mrr === 0` keys — [VERIFIED: lib/analytics/mrr.ts:122-126] "Keys alive but carrying a 0 ₽ segment … are not paying subscriptions and do not count" [ASSUMED — A7]).
5. `churnedKeys` = `|{ e.keyRef : e ∈ churnedTerms ∧ e.keyRef ∈ activeAtStart }|` (cohort clamp, A6).
6. `lostMrr` = `Σ_{e ∈ churnedTerms ∧ keyRef ∈ activeAtStart} (e.op.finalAmount * 30) / e.days` — **D-07 literal** (`finalAmount`, not `cashOf`); A1.
7. `mrrAtStart` = `totalMrrAt(orders, start)` (existing engine [VERIFIED: lib/analytics/mrr.ts:117-120]).
8. `renewalRate` = `expiringKeys === 0 ? null : renewedKeys / expiringKeys` (D-09: «—», not 0 %).
9. `logoChurnRate` = `activeAtStart.size === 0 ? null : churnedKeys / activeAtStart.size` (D-08; rate ≤ 1 by construction under A6).
10. `revenueChurnRate` = `mrrAtStart === 0 ? null : lostMrr / mrrAtStart` (D-07).

Window boundaries:
- Cards: `start = mskDayStartInstant(windowStartDay(period))`, `endExclusive = now` — the start is identical to `windowStartDay(period)` (`service.ts:85-87`), so the retention window and the KPI window are the same 7/30/90 MSK days.
- Table: per month, `start = mskDayStartInstant(monthKey)`, `endExclusive = min(mskDayStartInstant(addMonths(monthKey, 1)), now)`.
- A term ending at exactly `now` (millisecond coincidence) is omitted from card windows; this is deliberate.

### 3. `loadLtv()` — no `period` (D-04)

| Field | Derivation |
|-------|------------|
| `grossHistorical` | `Σ cashOf(all PAID orders) / COUNT(DISTINCT user_id over all PAID orders)`; `null` when payers = 0 |
| `grossHistoricalPayers` | that DISTINCT count (`::int`, never BigInt) |
| `predictiveChurnRate` | `retentionForWindow(now−29d…now).logoChurnRate` (30 MSK days; D-02) |
| `grossPredictive` | `computeArppu(window30Cash, window30Payers)` ÷ that churn rate; `null` when churn is `null` or 0 |
| `net` | `Σ(cashOf − providerCost) over PAID orders with providerCost !== null` ÷ `COUNT(DISTINCT user_id)` over the **same costed subset**; `null` when costed payers = 0 |
| `netPayers` | costed-subset DISTINCT count |
| `coverageFrom` | `mskDayLabel(min paidAt among costed orders)` → `"YYYY-MM-DD"`; `null` when none |
| `activePayers` | `DISTINCT user_id` among `buildKeyTermEvents(...)` events classified `'open'` at `now` — the D-01 under-amortization marker (active payers are still realizing LTV, so the historical average is a floor); always `≤ grossHistoricalPayers` |

Implementation notes: all-time cash and payers are computed from `loadPaidOrders()` in JS (one query, and `cashOf` stays the only money formula). `net`/`netPayers`/`coverageFrom` come from the same array filtered to `providerCost !== null` — no second SQL aggregate is needed at this data scale, and JS avoids a `SUM(final_amount - balance_used)` that could disagree with `cashOf`'s per-row clamp. If the row count ever makes this slow, replace only the costed branch with one `$queryRaw` row (`SUM(provider_cost)::int`, `SUM(GREATEST(0, final_amount - balance_used))::int`, `COUNT(DISTINCT user_id)::int` — `::int` per Pitfall 6).

ARPPU(30) is computed from the same `loadPaidOrders()` array: `Σ cashOf(o)` over `paidAt >= mskDayStartInstant(windowStartDay(30))` ÷ `new Set(windowOrders.map(o => o.userId)).size` — the same numerator/denominator as `loadKpis(30)` without a second round trip.

`coverageFrom` → `analyticsLtvNetSub` date. `net === null` (no costed orders) → sub = `analyticsLtvNetNoCost`, not a fabricated date. Note: 08-UI-SPEC §6.2 states «21.10.2026» is a *display* fallback "when history is empty" yet separately mandates the no-cost state («нет заказов с известной себестоимостью») when no costed order exists — the two clauses conflict; the loader contract (`net === null` + `coverageFrom === null`) resolves it: the no-cost sub wins, and when `net !== null` the date is data-derived. The literal is a non-binding fallback (A4).

### 4. `loadMargin(period)` and `loadBurnRunway()`

**Margin** (windowed by `?period`, same `fromInstant` as `loadKpis`):

```ts
const windowOrders = await prisma.order.findMany({
  where: { status: { in: [...PAID] }, paidAt: { gte: fromInstant } },
  select: { finalAmount: true, balanceUsed: true, providerCost: true },
});
const costed = windowOrders.filter(o => o.providerCost !== null);
const cash = costed.reduce((s, o) => s + cashOf(o), 0);
const cost = costed.reduce((s, o) => s + (o.providerCost as number), 0);
const grossMargin = costed.length === 0 ? null : cash - cost;
const marginPct   = cash === 0 ? null : (cash - cost) / cash;  // Σcash over costed only (D-11/D-13)
const costPerKey  = costed.length === 0 ? null : cost / costed.length; // D-12: Σcost ÷ costed orders
// payload: { grossMargin, marginPct, costPerKey,
//            costedOrders: costed.length, totalOrders: windowOrders.length }
```

A fully wallet-covered order is a legal negative-margin row (`cash = 0`, `cost > 0`) — do not filter it out (negative margins render with the Intl minus sign per UI-SPEC §6.3).

**Burn/runway** (fixed 30 MSK days, ignores `?period`):

```ts
const fromInstant = mskDayStartInstant(windowStartDay(30));
const windowOrders = await prisma.order.findMany({
  where: { status: { in: [...PAID] }, paidAt: { gte: fromInstant } },
  select: { providerCost: true, paidAt: true },
});
const costed = windowOrders.filter(o => o.providerCost !== null && o.paidAt);
const distinctDays = new Set(costed.map(o => mskDayLabel(o.paidAt as Date))).size;
const fullCoverage = windowOrders.length > 0 && costed.length === windowOrders.length;
const burnPerDay = fullCoverage && distinctDays >= 7               // D-14: 100% coverage + ≥7 costed days
  ? costed.reduce((s, o) => s + (o.providerCost as number), 0) / 30
  : null;

const balance = await artemida.getBalance()          // [VERIFIED: lib/artemida.ts:641]
  .then(b => (b.unlimited ? null : b.balance))       // [VERIFIED: lib/artemida.ts:312-316 Balance]
  .catch(() => null);                                // D-15: isolated

const runwayDays = burnPerDay !== null && burnPerDay > 0 && balance !== null
  ? Math.floor(balance / burnPerDay)                 // exact burn, not the displayed round
  : null;
const runwayReason = burnPerDay === null || burnPerDay <= 0
  ? 'no-burn'
  : balance === null ? 'no-balance' : null;
```

Pinned details: `burnTotalOrders = windowOrders.length`, `burnCostedOrders = costed.length`, `burnDaysCovered = distinctDays`. A real zero burn (`fullCoverage && distinctDays >= 7 && Σcost === 0`) is `0`, not `null` — but the UI's `burn <= 0` branch then shows «расхода нет» (correct: zero spend ⇒ infinite runway). `windowOrders.length === 0` ⇒ `burnPerDay = null` and the meta uses the no-orders key. `unlimited === true` is mapped to `balance = null` → `runwayReason: 'no-balance'`; the provider `Balance` offers no finite number in that state [ASSUMED — A8].

### 5. `loadRetention(period)` and `loadChurnTable()`

`loadRetention`: `buildKeyTermEvents(trialFilteredOrders)` once, then `retentionForWindow({ start: mskDayStartInstant(windowStartDay(period)), endExclusive: now, now })`.

`loadChurnTable`: derive the trailing month slots **exactly like `loadWaterfall`** (`service.ts:154-178`): current month from `mskMonthLabel(mskDayLabel(new Date()))`, first paid month from the earliest `paidAt`, `slots = min(6, max(1, span))`, then `mskMonthLabel(addMonths(currentMonth, -i))` for `i = slots−1 … 0`. Return `months: { month, expiring, renewed, renewalRate, churned, lostMrr }[]` in chronological order. Extract this month-slot derivation into one exported helper (`trailingMonthLabels(orders, now)`) used by both loaders so the two 6-month blocks can never disagree; do not change `loadWaterfall`'s output.

### 6. Component mapping (UI-SPEC is the visual contract)

| Component | Loader | Props | Notes |
|-----------|--------|-------|-------|
| `LtvCards` | `loadLtv()` | none | Block meta `analyticsLtvMeta`; 3 × `MetricCard size="compact"` in `GRID`. |
| `MarginCards` | `loadMargin(period)` | `period` | Meta = `analyticsWindowCoverage` / `...NoOrders`. |
| `BurnRunwayCards` | `loadBurnRunway()` | none | 2-up grid (`grid grid-cols-1 gap-4 sm:grid-cols-2` per §6.4); only balance caller; meta uses `n: 30`. |
| `RetentionCards` | `loadRetention(period)` | `period` | Meta = `analyticsWindowDays`; counts always in subs (D-08). |
| `ChurnTable` | `loadChurnTable()` | none | 6 columns, `role="region" tabIndex={0}`, `caption.sr-only`, `scope="col"/"row"` — the table *is* the accessible data (§6.6, §6.9). |

Every block: `h3` at `text-base font-semibold` (the one new type role) + right-aligned `text-xs text-muted` window meta; body `common.errorLoad` on failure; no `'use client'`; no charts; no new colors. `page.tsx` gains `CardsSkeleton({ count, twoUp })` next to `KpiSkeleton`/`ChartSkeleton` [VERIFIED: app/admin/analytics/page.tsx:34-49], five `<Suspense>` boundaries after `<MrrSparkline/>` (lines 76-84), and nothing above it changes (D-17).

**i18n:** add exactly the 44 keys listed in 08-UI-SPEC §Copywriting (count verified by enumerating the table: `analyticsUnitTitle`, `analyticsRetentionTitle`, `analyticsWindowDays`, `analyticsWindowCoverage`, `analyticsWindowCoverageNoOrders`, `analyticsLtvTitle`, `analyticsLtvMeta`, `analyticsLtvGrossHist`, `analyticsLtvGrossHistSub`, `analyticsLtvGrossHistSubActive`, `analyticsLtvGrossPred`, `analyticsLtvGrossPredSub`, `analyticsLtvNet`, `analyticsLtvNetSub`, `analyticsLtvNetNoCost`, `analyticsMarginTitle`, `analyticsGrossMargin`, `analyticsGrossMarginSub`, `analyticsMarginPct`, `analyticsMarginPctSub`, `analyticsCostPerKey`, `analyticsCostPerKeySub`, `analyticsBurnTitle`, `analyticsBurnRate`, `analyticsBurnRateSub`, `analyticsRunway`, `analyticsRunwaySub`, `analyticsRunwayNoBurn`, `analyticsRunwayNoBalance`, `analyticsRetentionCardsTitle`, `analyticsRenewalRate`, `analyticsRenewalRateSub`, `analyticsLogoChurn`, `analyticsLogoChurnSub`, `analyticsRevenueChurn`, `analyticsRevenueChurnSub`, `analyticsChurnTitle`, `analyticsChurnCaption`, `analyticsColExpiring`, `analyticsColRenewed`, `analyticsColRenewalPct`, `analyticsColChurned`, `analyticsColLostMrr`, `analyticsChurnEmpty` — [VERIFIED: enumerated from 08-UI-SPEC.md:513-557]). Reuse `common.errorLoad` [VERIFIED: lib/i18n/messages/ru.ts:655], `admin.analyticsTableMonth` (:423), `admin.analyticsWaterfallWindowSingle` (:410), `admin.analyticsWaterfallWindowMonths` (:411), `admin.statsPeriod*` (:554-557). The i18n test regex-scans `app/`, `components/`, `lib/` and fails on unused **and** missing keys [VERIFIED: tests/unit/i18n.test.ts:33-77], so every key must be referenced by a literal `t('…')` call.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Money semantics | a second `finalAmount − balanceUsed` expression | `cashOf` (`lib/analytics/series.ts:41-43`) | One clamp/rounding definition across KPI, waterfall, LTV, margin. |
| Term cursor | a new `paidAt + days` loop with its own conventions | mirror `buildKeyTerms` cursor (`lib/analytics/series.ts:103-108`) + invariant test | Early renewals extend from expiry; a divergent loop silently changes MRR history. |
| MSK window math | `new Date(label)`, SQL `CURRENT_DATE`, `date_trunc` | `mskDayStartInstant` / `mskDayLabel` / `mskMonthLabel` / `addMonths` | The label/instant split is a documented one-day trap (`lib/analytics/time.ts:9-15`). |
| Month slots | a new "last 6 months" loop | `trailingMonthLabels` extracted from `loadWaterfall`'s exact derivation (`lib/analytics/service.ts:154-178`) | Two 6-month blocks must not disagree about history length. |
| Percent/money formatting | string concatenation, hand-built minus/`%` | `Intl.NumberFormat('ru-RU')`, `× 100` at render | Locale decimal comma, thousands separators, minus sign (UI-SPEC §Copywriting). |
| Division guards | `value \|\| 0` | explicit `denominator === 0 ? null : …` | `\|\|` erases a real zero and fabricates «—»/0 wrongly. |
| DB enum copy | a new status array | `PAID` (`lib/analytics/service.ts:51`) | Status taxonomy drift. |
| Balance client | a new `fetch` to ARTEMIDA | `artemida.getBalance()` (`lib/artemida.ts:641`) | Auth header, envelope parsing, retry/backoff, `Retry-After`. |

**Key insight:** every formula in this phase is a *composition* of primitives that already exist and are already tested. The only genuinely new logic is the term-event emission and the grace/cohort classification — that is where the tests must concentrate.

## Common Pitfalls

### Pitfall 1: Reconstructing only the final `termEnd`
**What goes wrong:** Using `buildKeyTerms(...).get(ref).termEnd` as "the expiry" gives one date per key. Every earlier term end is lost, so a 90-day window sees at most one event per key and renewal rate/churn are wrong.
**Why it happens:** `buildKeyTerms` deliberately returns only the final cursor (`lib/analytics/series.ts:82-119`).
**How to avoid:** `buildKeyTermEvents` emits one event per `new|renew` op with `nextPaidAt`; invariant test vs `buildKeyTerms`.
**Warning signs:** a key with three 30-day renewals produces `expiringKeys === 1` in a 90-day window; renewal rate looks suspiciously high.

### Pitfall 2: Grace boundary off by one millisecond
**What goes wrong:** A renewal exactly 7 days after `termEnd` is classified as churn.
**Why it happens:** `paidAt < end + 7d` instead of `<=`; or comparing MSK day labels instead of instants (a payment at 23:59 MSK on day 7).
**How to avoid:** compare epoch millis with `<=` (`classifyTerm` above); fixture at exactly `end + 7 × 86_400_000` → `renewed`, and at `+1 ms` → `churned` (after grace elapses).
**Warning signs:** a boundary test written with day labels rather than instants.

### Pitfall 3: 0 ₽ / wallet-covered terms break the churn denominator
**What goes wrong:** `activeKeysAt` counts only keys with `mrr > 0` (`lib/analytics/mrr.ts:122-126` excludes a 0 ₽ bonus segment). A lapsed 0 ₽ key can then enter the churn numerator while being absent from the denominator → a rate above 100 %.
**Why it happens:** mixing the MRR definition of "active" with the retention definition of "paid key".
**How to avoid:** compute `activeAtStart` from term coverage (`start <= t < end`) **and** clamp both logo-churn and lost-MRR numerators to that cohort (A6/A7). Do not reuse `activeKeysAt` for the retention denominator.
**Warning signs:** `churnedKeys > activeKeysAtStart`; a percent > 100 % in a test.

### Pitfall 4: Bonus-day redemptions are invisible to the order chain
**What goes wrong:** `redeemBonusDays` renews through the provider and updates `KeyCache`, creating no `Order` [VERIFIED: lib/referrals.ts:689-698]. The reconstructed latest term ends early and the key is reported as churned while it is active.
**Why it happens:** the ledger records only paid orders; goodwill days are not an order.
**How to avoid:** liveness override for the latest event only (`KeyCache.expiresAt > end` → extend), then classify (A2). Do not use `expiresAt` for history.
**Warning signs:** an active key (provider expiry in the future) appears in `churnedKeys`; a bonus redemption in the fixture shifts churn.

### Pitfall 5: `providerCost = null` treated as 0
**What goes wrong:** margins look better than reality, burn coverage is overstated, net LTV includes orders with unknown cost.
**Why it happens:** `?? 0` or a schema default; `providerCost` is nullable *on purpose* — "Nullable with NO default on purpose: NULL means 'pre-implementation order or unavailable quote'" [VERIFIED: prisma/schema.prisma:191-195].
**How to avoid:** filter `providerCost !== null` for every costed metric; report coverage counts; burn requires 100 % coverage and ≥ 7 distinct costed days.
**Warning signs:** `costedOrders === totalOrders` on a window that predates 2026-10-21; margin equal to cash.

### Pitfall 6: BigInt / numeric leaking out of raw SQL
**What goes wrong:** `COUNT(*)` and `SUM(int)` arrive as `BigInt`; arithmetic throws or the RSC payload cannot serialize.
**Why it happens:** Prisma `$queryRaw` returns driver types.
**How to avoid:** `::int` casts and `COALESCE(..., 0)` exactly as `loadKpis` does — `SELECT COUNT(DISTINCT user_id)::int AS payers` [VERIFIED: lib/analytics/service.ts:115-120]; prefer `findMany` + JS for costed sums.
**Warning signs:** `TypeError: Cannot mix BigInt`; a 500 on the page with a serialization error.

### Pitfall 7: Pre-rounding runway / percentages
**What goes wrong:** `floor(balance / round(burn))` can differ by days; percent formatting before dividing loses the exact ratio.
**How to avoid:** keep exact rationals in the payload; round only in the component; runway uses `burnPerDay` unrounded.
**Warning signs:** runway changes by a day after a display-rounding tweak.

### Pitfall 8: One balance failure kills the whole section
**What goes wrong:** `getBalance()` rejects and `BurnRunwayCards` throws, taking down the section (or, if awaited in the page, all blocks).
**How to avoid:** call it only inside `loadBurnRunway` with `.catch(() => null)`; render the burn card from DB data regardless (D-15); return `runwayReason` so the sub-line explains which input is missing.
**Warning signs:** no runway card during an ARTEMIDA outage; a page-level await of the balance.

### Pitfall 9: MSK label/instant mix-up
**What goes wrong:** windows shift by one day; a day's orders land in the previous day.
**Why it happens:** `mskDayStartInstant` passed to a `@db.Date` column or `new Date("2026-10-01")` used as a window bound (`lib/analytics/time.ts:9-15`).
**How to avoid:** `mskDayStartInstant` for `paidAt` comparisons; `mskDateKey` only for `@db.Date`; `pgTimestamp` for raw SQL.
**Warning signs:** a test that passes in UTC but fails at 00:30 MSK.

### Pitfall 10: i18n drift
**What goes wrong:** a missing or unused key fails `tests/unit/i18n.test.ts`; a dynamically built key (`t('admin.' + x)`) counts as unused [VERIFIED: tests/unit/i18n.test.ts:37-39].
**How to avoid:** add exactly the 44 UI-SPEC keys, reference each with a literal `t('…')`; reuse the listed Phase 7 keys.

### Pitfall 11: Pre-existing red test blamed on Phase 8
**What goes wrong:** the full suite is red before any Phase 8 change; an executor "fixes" `analytics-mrr.test.ts` and changes Phase 7 behavior.
**Evidence (reproduced this session):** `DATABASE_URL='postgresql://test:test@127.0.0.1:5432/test' npx vitest run tests/unit/analytics-mrr.test.ts` → **1 failed** at `tests/unit/analytics-mrr.test.ts:190` — `AssertionError: expected 4000 to be 3600`; the code freezes `termEnd` at upgrade time (Phase 7 CR-01, `lib/analytics/mrr.ts:98-106`), so the *test* encodes a stale expectation, not the reverse.
**How to avoid:** record the baseline; do not touch the file in Phase 8 unless the user explicitly scopes the fix; make the phase gate baseline-aware ("no new failures", not "zero failures").

## Runtime State Inventory

> Rename/refactor phase? **No** — Phase 8 is additive greenfield on top of Phase 7. Skipped per the output contract (this section applies to rename/refactor/migration phases only). The only "state" touched is read-only DB data (`orders`, `keys_cache`) and one live provider call; no stored data, service config, OS registration, secret, or build artifact changes. `artemida_balance_snapshots` and `daily_metrics` are read by nothing new (D-16).

## Code Examples

### Term events + retention window (pure, no DB)

```ts
// Source: cursor derived from lib/analytics/series.ts:103-108 (identical math);
// this research §Derivation 1-2.
import type { PaidOrderRow } from './series';
import { keyRefOf, totalMrrAt } from './mrr';

const DAY_MS = 86_400_000;

export function buildKeyTermEvents(paid: PaidOrderRow[]): TermEvent[] {
  const groups = new Map<string, PaidOrderRow[]>();
  for (const op of paid) {
    if (!op.paidAt) continue;
    const ref = keyRefOf(op);
    if (!ref) continue;
    const list = groups.get(ref) ?? [];
    list.push(op);
    groups.set(ref, list);
  }

  const events: TermEvent[] = [];
  for (const [keyRef, ops] of groups) {
    const chain = ops
      .filter((op) => (op.kind === 'new' || op.kind === 'renew') && op.days !== null)
      .sort((a, b) => (a.paidAt as Date).getTime() - (b.paidAt as Date).getTime());
    if (chain.length === 0) continue;

    let cursorMs: number | null = null;
    for (let i = 0; i < chain.length; i++) {
      const op = chain[i]!;
      const paidAtMs = (op.paidAt as Date).getTime();
      const startMs = Math.max(cursorMs ?? paidAtMs, paidAtMs);
      const endMs = startMs + (op.days as number) * DAY_MS;
      events.push({
        keyRef,
        start: new Date(startMs),
        end: new Date(endMs),
        days: op.days as number,
        op,
        nextPaidAt: chain[i + 1]?.paidAt ?? null,
      });
      cursorMs = endMs;
    }
  }
  return events;
}
```

Boundary fixture worth pinning in `tests/unit/analytics-retention.test.ts`:

```ts
// new 06-10 +30d → end 07-10; renew paid 07-17T00:00:00Z (exactly 7d) → renewed
// renew paid 07-17T00:00:00.001Z            → churned once now > end + 7d
// upgrade 07-15 (days = null)               → NOT a renewal → churned
// bonus/wallet renew finalAmount=3000, balanceUsed=3000, paid 07-14 → renewed, adds 0 lost MRR
// trial key with an order (defensive fixture) → excluded from everything
```

### Loader with isolated live balance

```ts
// Source: mirrors lib/analytics/service.ts:100-178 (window/paid-order conventions)
export async function loadBurnRunway(): Promise<BurnRunwayData> {
  const fromInstant = mskDayStartInstant(windowStartDay(30));

  const [windowOrders, balance] = await Promise.all([
    prisma.order.findMany({
      where: { status: { in: [...PAID] }, paidAt: { gte: fromInstant } },
      select: { providerCost: true, paidAt: true },
    }),
    artemida.getBalance().then((b) => (b.unlimited ? null : b.balance)).catch(() => null),
  ]);
  // …burn arithmetic from §Derivation 4…
}
```

### DISTINCT payers (the only aggregate raw SQL needed)

```sql
-- Source: lib/analytics/service.ts:115-120 (pattern, verbatim shape)
SELECT COUNT(DISTINCT user_id)::int AS payers
FROM orders
WHERE status IN ('paid', 'provisioning', 'provisioned')
  AND paid_at >= ${pgTimestamp(fromInstant)}
```

For LTV net the same query gains `AND provider_cost IS NOT NULL`; for all-time gross the time predicate is dropped. Always `::int`.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact on Phase 8 |
|--------------|------------------|--------------|-------------------|
| Churn from `KeyCache.expiresAt` | Reconstruct term ends from the paid-order chain | Phase 7 D-06 / Phase 8 D-06 | `expiresAt` is only a liveness override for the latest term (A2). |
| Order count as ARPPU denominator | `COUNT(DISTINCT user_id)` | Phase 7 | LTV historical and net must count payers, not orders. |
| `finalAmount` as money | `cashOf = max(0, finalAmount − balanceUsed)` | Phase 7 D-02/D-13 | Margin, LTV, ARPPU; revenue churn follows D-07's literal `finalAmount` (A1). |
| Daily rollup as metric truth | On-the-fly derivation from `orders` | Phase 7 D-12 | New blocks do not read `daily_metrics`. |
| Balance delta as burn | Σ cost / 30 + live balance | Phase 8 D-14/D-15 | Snapshots unchanged, unused by this phase. |

**Deprecated/outdated for this phase:** any plan that adds a table/column, a chart library, a client component, or a cron change. There is no schema work in Phase 8 (verified: `providerCost` [prisma/schema.prisma:195], `KeyCache.isTrial/:229`, `DailyMetric` [:583-598], `ArtemidaBalanceSnapshot` [:602-610] all exist; the only gap — bonus-day attribution — is solved by a `KeyCache` read, not a migration).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Revenue churn uses D-07's literal `finalAmount × 30 / days` (not `cashOf`), so a fully wallet-covered churned term contributes its `finalAmount`-equivalent to lost MRR. D-13's cash principle applies to margin only. | §Derivation 2.6 | If the user wants cash-consistent churn, lost MRR and the revenue-churn rate are overstated for wallet-covered terms. One-line change to `cashOf(e.op)`; a fixture pins whichever is chosen. |
| A2 | The latest term per key is extended by `KeyCache.expiresAt` when that is later, to absorb bonus-day/ticket-compensation renewals that create no `Order` row. | §Derivation 1 | Without it, actively-extended keys are reported as churned. Exact per-event attribution would need a new ledger (schema change — out of scope, not recommended). |
| A3 | Trials are filtered via `KeyCache.isTrial` even though trials create no orders today (defensive, required by D-10). | §Derivation 1 | No functional risk; a redundant filter if trial-order creation ever appears. |
| A4 | `providerCost` coverage begins 2026-10-21; the LTV-net label date is data-derived (`coverageFrom`), and «21.10.2026» is only a display fallback when no costed order exists — where the no-cost state key wins instead (UI-SPEC §6.2's two clauses conflict; the loader contract resolves it). | §Derivation 3 | A wrong literal would mislabel the coverage window; the loader's `coverageFrom` is authoritative. |
| A5 | A term inside its 7-day grace with no renewal yet is `pending`: counted in `expiring`, in neither `renewed` nor `churned`. | §Derivation 1-2 | Renewal rate may read 0 % mid-grace and improve later; logo/revenue churn do not count it (not yet lost). |
| A6 | Renewal rate is **term-based** (`expiringKeys` = term-end events), while logo churn and lost MRR are **cohort-clamped** (only keys active at window start). | §Derivation 2 | If the user intended key-based renewal rate for multi-term windows in 90 days, or a literal (unclamped) logo-churn numerator, the derivation differs. Tests pin term + clamp semantics; confirm D-08/D-09 wording. |
| A7 | `activeAtStart` counts order-bearing coverage (including 0 ₽ terms), not `mrr > 0`. | §Derivation 2.4 | Reusing `activeKeysAt` can produce churn > 100 %. |
| A8 | `Balance.unlimited === true` maps to `balance: null` → `runwayReason: 'no-balance'` («баланс недоступен»). | §Derivation 4 | The copy is imprecise for an unlimited line; the pinned payload has no third reason. This account is pay-per-key (observed balance 0/120 RUB in `docs/artemida-v1-contract.json`), so the branch is unlikely. |

## Open Questions (RESOLVED)

1. **Revenue-churn money base (A1).** What we know: D-07 says `finalAmount`, D-13 says `cashOf` for margin. What's unclear: whether wallet-covered churn should contribute lost MRR at face value. **RESOLVED:** follow D-07 literally — pinned by 08-01 Task 1 Test 5 (wallet-covered churned term contributes `(finalAmount × 30) / days` to lostMrr) and 08-01 Task 2 Test 10 (`lostMrrOf`); switching to `cashOf` remains a one-line change if the user later prefers cash consistency.
2. **Bonus-day liveness override (A2).** What we know: `redeemBonusDays` creates no order (`lib/referrals.ts:689-698`). What's unclear: whether the user accepts a latest-term override vs. adding a bonus ledger. **RESOLVED:** latest-term override accepted — pinned by 08-01 Task 1 (A2 case: `liveExpiry` later than last end → the extended event classifies `'open'`) and 08-02 `loadKeyCacheState` (`liveExpiry` map from `KeyCache.expiresAt` feeds `buildKeyTermEvents`); a ledger remains explicitly out of scope (schema work).
3. **Renewal-rate counting unit (A6).** D-09 says "продлённые ключи ÷ ключи, чьё покрытие закончилось" — terms vs distinct keys only diverges when a 90-day window contains two ends for one key. **RESOLVED:** term-based — pinned by 08-01 Task 1 Tests 8-9 (a key with two term ends in a 90-day window yields `expiringKeys = 2`; churn is cohort-clamped by Test 7); the label «продлено / истекало» is already term-flavored.
4. **The pre-existing red test.** `tests/unit/analytics-mrr.test.ts:190` fails before Phase 8 (reproduced: `expected 4000 to be 3600`). **RESOLVED:** pinned baseline — 08-01 Task 1 explicitly forbids touching it and every phase gate allows exactly that one failure; fixing it is a separate quick task if the user wants (Phase 7 CR-01 behavior is correct).
5. **Predictive-LTV censoring.** The 30-day churn denominator ignores terms still inside grace, so early-month churn is slightly under-measured. **RESOLVED:** accepted — 08-01 Task 1 Test 6 pins the `pending` state (in-grace terms count as expiring, neither renewed nor churned) and 08-01 Task 2 Test 2 pins D-02 «—» on null/0 churn; the censoring is inherent to a 7-day grace and disappears as history ages.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node.js | RSC, tests | ✓ (probed this session) | 24.15.0 | — |
| npm | (no installs) | ✓ | 11.12.1 | — |
| vitest | Unit + DB tests | ✓ (probed) | 5.0.3 | — |
| PostgreSQL (local) | DB-backed loaders/tests | ✓ (`pg_isready`: accepting on `:5432`) | 16.15 (Homebrew); prod compose is 17 | Pure tests need no DB |
| `vitest.config.ts` | Test runner config | ✓ | in repo (env block incl. `CRON_SECRET`, `ADMIN_TELEGRAM_IDS`) | — |
| `ARTEMIDA_API_KEY` | Live balance in the app | ✓ | present in `.env.local` (value never read) | Tests stub `artemida.getBalance`; production failure path renders «баланс недоступен» |
| Docker / Nginx | Deploy | not needed for this phase | — | — |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** live ARTEMIDA in tests → stub (`vi.spyOn`); migrate/db push → not needed (no schema change).

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest 5.0.3 |
| Config file | `vitest.config.ts` |
| Quick run command | `DATABASE_URL='postgresql://test:test@127.0.0.1:5432/test' npx vitest run tests/unit/analytics-retention.test.ts tests/unit/analytics-economics.test.ts` |
| Full suite command | `DATABASE_URL='postgresql://test:test@127.0.0.1:5432/test' npm test` |

**Baseline before Phase 8 (measured this session):** `analytics-*.test.ts` + `admin-analytics-page.test.ts` + `i18n.test.ts` = 11 files, 68 passed, **1 pre-existing failure** — `tests/unit/analytics-mrr.test.ts:190`, "expected 4000 to be 3600" (the test encodes the pre-CR-01 expectation; the code returns 4000). The phase gate is "no new failures", not "zero failures".

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| ANL-04 | Historical LTV = Σ cash / DISTINCT payers; predictive = ARPPU(30)/churn(30); churn 0 → null | unit (pure) | `npx vitest run tests/unit/analytics-economics.test.ts -t "ltv"` | ❌ Wave 0 |
| ANL-05 | Net LTV only over costed orders; costed payers denominator; no costed → null + `coverageFrom` null | unit (pure) | `… analytics-economics.test.ts -t "net"` | ❌ Wave 0 |
| ANL-06 | Event per term end; 7-day inclusive grace; upgrade ≠ renewal; pending grace not churned; trial excluded; churn ≤ 100 % | unit (pure) | `… analytics-retention.test.ts` | ❌ Wave 0 |
| ANL-07 | Month slots match waterfall; `expiring=0` → null rate while zeros render; chronological order | unit (pure) | `… analytics-retention.test.ts -t "months"` | ❌ Wave 0 |
| ANL-13 | Margin = Σ(cash−cost) over costed; margin % on costed Σcash; cost/key = Σcost/costedOrders; wallet-only row → negative margin; 0 costed → null | unit (pure) | `… analytics-economics.test.ts -t "margin"` | ❌ Wave 0 |
| ANL-14 | Burn null unless 100 % coverage + ≥7 distinct days; real zero burn = 0; runway `floor(balance/exactBurn)`; balance error isolated | unit (pure + stubbed client) | `… analytics-economics.test.ts -t "burn"` | ❌ Wave 0 |
| ANL-04/05/06/07/13/14 | Loaders return the §6.7 shapes, `null` not 0, `::int` numbers, trial filter, balance isolation | integration (DB) | `npx vitest run tests/unit/analytics-phase8-loaders.test.ts` | ❌ Wave 0 (recommended) |
| ANL-04..14 | Page renders two sections, guard intact, 44 keys referenced literally | source contract | `npx vitest run tests/unit/admin-analytics-page.test.ts tests/unit/i18n.test.ts` | ✅ (add a sibling for the new components) |

### Sampling Rate

- **Per task commit:** quick run above (pure suites, < 2 s).
- **Per wave merge:** DB-backed loader suite + `admin-analytics-page.test.ts` + `i18n.test.ts`.
- **Phase gate:** full suite with exactly the one known baseline failure; `/gsd-verify-work` afterwards.

### Wave 0 Gaps

- [ ] `tests/unit/analytics-retention.test.ts` — term events, grace boundary (±1 ms), upgrade, pending, exit/win-back, trial filter, multi-term 90-day window, cohort clamp, month slots.
- [ ] `tests/unit/analytics-economics.test.ts` — LTV gross/net/predictive, margin, cost/key, burn coverage rules, runway floor, zero denominators.
- [ ] `tests/unit/analytics-phase8-loaders.test.ts` — DB fixture in a fresh id range (mirror `tests/unit/analytics-rollup.test.ts`), stubbed `artemida.getBalance` (`vi.spyOn`), asserts `null` vs `0` and shape parity with §6.7.
- [ ] Extend the source-contract test (new sibling file is safer) for: two `<AnalyticsSection>`s below sparkline, five Suspense boundaries, no `'use client'` in the five components, balance called only in `BurnRunwayCards`.
- [ ] No framework install needed.

*(Manual-only: visual layout at 360/768/1280 px, real balance rendering, and a real provider outage check — covered by UAT, not automatable here.)*

## Security Domain

`security_enforcement` is enabled (`workflow.security_enforcement: true`, `.planning/config.json`); `workflow.nyquist_validation` is also `true`, hence the section above.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No new auth surface; the existing session is reused. |
| V3 Session Management | no | No new cookies/tokens. |
| V4 Access Control | yes | `requireRole('administrator', 'manager')` stays in `app/admin/analytics/page.tsx:52-59` [VERIFIED]; direct RSC fetches re-run it. New components are only reachable through that page — no new route. |
| V5 Input Validation | yes | Only input is `?period`; existing whitelist `7 \| 90 else 30` [VERIFIED: app/admin/analytics/page.tsx:63-65]. No user string reaches SQL; Prisma/`$queryRaw` template parameters only, `pgTimestamp` for timestamps. |
| V6 Cryptography | no | No new crypto. |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| RSC payload leaks per-order costs / user ids | Information disclosure | Loaders expose aggregates only (UI-SPEC §6.7); no `providerCost` rows, no `userId`, no API key, no raw provider text. Source-contract test scans the page/components for `providerCost` (existing pattern [VERIFIED: tests/unit/admin-analytics-page.test.ts:134-140]). |
| Direct RSC fetch bypasses the layout guard | Elevation of privilege | Page-level `requireRole` (already present, keep it); no new route/handler. |
| Provider error body logged or rendered | Information disclosure | `catch {}`/`.catch(() => null)` in the block; only `common.errorLoad` renders; `artemida` already discards provider messages. |
| Unbounded all-time scan on every render | Denial of service | Single `findMany` over paid orders (bounded by business size — the same query `loadPaidOrders` already runs for KPIs/waterfall), streamed behind `Suspense`; monitor if rows exceed ~50k. |
| SQL injection via period/window | Tampering | No interpolation: whitelisted numbers + Prisma parameterized `$queryRaw`; `pgTimestamp` for timestamps. |
| Secret exposure in the new module | Information disclosure | Pure modules import no env/secrets; balance call stays server-side (`lib/artemida.ts` owns the API key). |

## Sources

### Primary (HIGH confidence — read in this session)
- `lib/analytics/service.ts` — `PAID` (:51), `ORDER_SELECT` (:56-69), `windowStartDay` (:85-87), `loadPaidOrders` (:89-91), DISTINCT payers `::int` (:115-120), `loadWaterfall` month-slot math (:154-178).
- `lib/analytics/series.ts` — `PaidOrderRow` (:24-38), `cashOf` (:41-43), `buildKeyTerms` cursor (:103-108).
- `lib/analytics/mrr.ts` — `keyRefOf` (:47-49), `totalMrrAt` (:117-120), `activeKeysAt` 0-₽-exclusion (:122-133), `computeArppu` (:162-164).
- `lib/analytics/time.ts` — MSK label/instant/date-key rule (:9-15), all six helpers (:17-78).
- `prisma/schema.prisma` — `Order.days Int?` (:174), `Order.providerCost Int?` NULL-on-purpose (:191-195), `KeyCache.isTrial` (:228) / `expiresAt` (:229), `DailyMetric` (:583-598), `ArtemidaBalanceSnapshot` (:602-610).
- `lib/referrals.ts:669-704` — `redeemBonusDays`: `artemida.renewKey` + `upsertCachedKey`, no `Order` row.
- `lib/keys-service.ts:541-570` — `startTrial`: `artemida.createTrial`, no `Order` row.
- `lib/orders-service.ts:182-208` — `balanceUsed = Math.max(0, Math.min(balance, finalAmount))` (:185); the only `prisma.order.create` (:188).
- `lib/artemida.ts` — `Balance { balance; currency; unlimited }` (:312-316), `getBalance` (:641).
- `app/admin/analytics/page.tsx` — `force-dynamic` (:31), role guard (:52-59), period normalization (:63-65), Suspense pattern (:76-84).
- `components/admin/MetricCard.tsx` — `CARD`/`GRID` (:7-8), `compact` value size (:36-40).
- `components/admin/AnalyticsKpi.tsx` — try/catch block (:21-29), «—»-on-null rendering (:62-72).
- `components/admin/PeriodSelector.tsx` — 7/30/90 presets (:6-24).
- `lib/i18n/messages/ru.ts` — reused keys (`analyticsTableMonth` :423, `analyticsWaterfallWindowSingle` :410, `analyticsWaterfallWindowMonths` :411, `statsPeriod*` :554-557, `errorLoad` :655); `lib/i18n/index.ts` `t`/`tp`.
- `tests/unit/i18n.test.ts` — unused/missing-key enforcement (:33-77); `tests/unit/admin-analytics-page.test.ts` — page contract (:83-141); `tests/unit/analytics-mrr.test.ts:190` — measured pre-existing failure.
- Live probes: `node -v` → v24.15.0; `npm -v` → 11.12.1; `npx vitest --version` → vitest/5.0.3; `pg_isready` → accepting; `psql` → 16.15.
- `.planning/config.json` — `workflow.nyquist_validation: true`, `workflow.security_enforcement: true`.

### Secondary (MEDIUM confidence — planning artifacts, cited)
- `.planning/phases/08-unit-economics-retention/08-CONTEXT.md` — D-01..D-20 (locked decisions, copied verbatim into `## User Constraints`).
- `.planning/phases/08-unit-economics-retention/08-UI-SPEC.md` — §6.1-§6.9 (composition, block anatomy, table recipe, accessibility), §6.7 (five loader payload shapes, `activePayers` marker), §Copywriting (44 new keys, formatting rules).
- `.planning/phases/07-analytics-foundation-revenue-metrics/07-CONTEXT.md` (D-01..D-15), `07-PATTERNS.md`, `07-VALIDATION.md`, `07-VERIFICATION.md` (CR-01/WR-01 fixes).
- `.planning/REQUIREMENTS.md` ANL-04..07/13/14; `.planning/ROADMAP.md` Phase 8 (success criteria).
- `docs/artemida-v1-contract.md` — `GET /balance` OBSERVED (200), fields `ok/data.balance/data.currency/data.unlimited`.

### Tertiary (LOW confidence)
- None. No external web source was needed; this phase is entirely in-repo.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; versions read from `package.json` and live probes this session.
- Architecture: HIGH — module/loader/component boundaries follow Phase 7 code read in this session.
- Derivations: HIGH on mechanics (term cursor, grace, MSK math, null semantics — each mapped to a verified code path); MEDIUM on A1 (D-07 vs D-13 money base), A2 (bonus-day override), A5 (grace-pending state), A6 (term vs key counting / cohort clamp) — all flagged for plan-time confirmation.
- Pitfalls: HIGH — each maps to a verified code path or a measured failure.
- UI/i18n contract: HIGH — 44 keys and payload shapes enumerated from 08-UI-SPEC (count re-verified line-by-line).

**Research date:** 2026-10-22
**Valid until:** 2026-11-21 (30 days; stack is pinned and this phase adds no dependencies). Re-verify only if `providerCost` semantics, `Order`/`KeyCache` schema, or `buildKeyTerms` change.