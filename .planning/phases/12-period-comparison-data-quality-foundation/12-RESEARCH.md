# Phase 12: Period Comparison & Data-Quality Foundation - Research

**Researched:** 2026-10-31
**Domain:** Analytics window math, append-only data-quality event log, idempotent rollup write-guard, click/IP capture, metric registry (Next.js App Router + Prisma 7 + Postgres 17)
**Confidence:** HIGH on in-repo mechanics (every claim below is line-cited from files read this session); MEDIUM on product-shaped choices (MoM window definition, registry/label wiring) — flagged as Open Questions where the planner must pin one.

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Подача дельт WoW/MoM (ALR-01)**

- **D-01:** Дельта показывается **внутри каждой карточки**. `MetricCard` расширяется необязательными пропами `delta` (абсолют + %) и `quality` — все существующие отчёты наследуют одну подачу без переписывания блоков.
- **D-02:** Окно сравнения выбирается **автоматически по `?period`**: 7 дней → предыдущие 7 (WoW); 30 → предыдущий месяц (MoM); 90 → предыдущие 90 дней. Отдельного переключателя WoW/MoM нет.
- **D-03:** При нулевой базе процент не считается: показываем `—` и подпись «нет базы»; абсолютная дельта остаётся видимой. Никаких `∞%` и «новое» для метрик, где это бессмысленно.
- **D-04:** **Сегодняшний незавершённый MSK-день исключается из обоих сравниваемых окон.** Оба периода считаются только по завершённым календарным дням Europe/Moscow. — **Reversibility:** costly — меняет семантику `windowStartDay` и всех оконных лоадеров/тестов, которые сейчас включают сегодняшний день.
- **D-05:** Если покрытие периодов несопоставимо (например, база содержит degraded-дни или окно неполное), результат помечается `incomparable` и число не показывается. `partial` не используется как замена числу — только `incomparable`.

**Degraded-данные и write-guard (EXT-05)**

- **D-06:** Degraded-событие = **сбой вызова ARTEMIDA**: timeout, 5xx после исчерпания p-retry, 429 с исчерпанными ретраями, 401/402. «Подозрительно пустой ответ» degraded-событием **не** считается (защита от ложных флагов).
- **D-07:** События пишутся в **append-only таблицу `data_quality_events`** (источник, MSK-день, причина, детали, `createdAt`, признак открытости/закрытия). `daily_metrics` остаётся чистым value-rollup — флаг качества в нём не хранится. — **Reversibility:** one-way — новая таблица + миграция; откат = drop table и потеря истории качества.
- **D-08:** **Write-guard:** уже записанный здоровый `daily_metrics`-день никогда не перезаписывается degraded-прогоном. Если день ещё не записан и прогон degraded — строка пишется (чтобы не было дыры), а событие фиксируется в `data_quality_events`. — **Reversibility:** costly — меняет контракт `rollupDays` (absolute upsert) и требует тестов на все ветки.
- **D-09:** **Авто-ретрай:** ночной rollup перепроверяет последние **3 MSK-дня**, у которых есть открытое degraded-событие; более старые дни закрываются только ручным `scripts/backfill-*.ts`.
- **D-10:** **Пометка в UI:** любое исключённое событие в окне → бейдж «данные неполные (N)» на карточке/блоке; причина и список событий — в тултипе/подписи. Порогов нет: честность важнее тишины.

**Захват кликов и IP (основание PRM-01/PRM-04)**

- **D-11:** Клики generic-промокодов хранятся **в обобщённой `referral_clicks`**: `ownerUserId` становится nullable, добавляются `promoCodeId` (nullable) и `kind` (`referral` | `promo`). Одна таблица — одна воронка click → register → pay для всех кодов. — **Reversibility:** one-way — миграция меняет NOT NULL и добавляет колонки; откат требует решения, что делать с generic-строками.
- **D-12:** Один клик = **час по `ipHash`**, ровно как в текущем `recordClick`. Никаких cookie/consent-зависимых схем; цифры остаются сопоставимыми с уже накопленными партнёрскими кликами.
- **D-13:** Клики и `ipHash` хранятся **13 месяцев**, затем автоматически удаляются ночным cron. Отдельного UI для этого нет.
- **D-14:** Хеш IP аккаунта фиксируется в **двух точках**: `User.signupIpHash` при регистрации и `User.trialIpHash` при trial claim. Сырой IP не хранится никогда; литерал `clientIp() === "direct"` не хешируется и не попадает в кластеры. — **Reversibility:** one-way — миграция + forward-only данные; историю до Phase 12 восстановить нельзя.
- **D-15:** `lib/analytics/metric-registry.ts` — **единый TS-реестр** метрик (`id`, подпись, формула, источник данных, направление «рост хорошо/плохо», ограничения). Подписи и порядок метрик в дашбордах берутся из реестра; Phase 16 добавляет тест «каждый `MetricId` имеет запись в словаре». — **Reversibility:** costly — реестр становится контрактом для всех карточек и словаря.

### the agent's Discretion

- Имя и форма публичного beacon-маршрута для промокодов (обобщить `/api/referrals/click` vs добавить `/api/promo/click`), с сохранением правила «всегда 200, без oracle».
- Схема и индексы `data_quality_events`; как именно определяется «открытое» событие (флаг vs `resolvedAt`).
- Как считать `incomparable`: по наличию degraded-события в базовом окне, по неполному покрытию или по обоим условиям.
- Точные i18n-ключи, визуальная форма бейджа и размещение подписи «нет базы».
- Как реестр метрик связан с существующими подписями (постепенная миграция vs параллельные константы).
- Формат `scripts/backfill-*.ts` для закрытия старых degraded-дней.

### Deferred Ideas (OUT OF SCOPE)

- Отдельная страница `/admin/data-quality` — отложена; бейджа + тултипа достаточно до появления реального объёма событий.
- Fraud-детекция по IP-кластерам (P2) — Phase 14+ после накопления `signupIpHash`/`trialIpHash`.
- Отчёты promo/partner ROI и воронка — Phase 14; здесь только захват.
- CSV-экспорт и страница метрического словаря — Phase 16 (реестр из D-15 — их основание).

## Project Constraints (from AGENTS.md)

Actionable directives from `AGENTS.md` (GSD project block) that this phase must respect:

- **Tech stack is fixed**: Node + Next.js (App Router) + Telegraf. No new framework, no new service.
- **API limits**: trial cannot be renewed/upgraded; permanent delete without refund; honor `401/402/409/429/502/503` and `Retry-After`. *Phase 12 relevance:* the degraded classifier must treat `409`/`404` as business outcomes, not data-quality events, and must observe `Retry-After`-driven retries only after exhaustion.
- **Security**: `ARTEMIDA_API_KEY`, Platega secrets, SSH/root passwords live only in env/secrets — **never commit secrets**. *Phase 12 relevance:* `data_quality_events.detail` must not capture request headers or the API key; tests assert this.
- **Compatibility**: PWA (installable, mobile-first) + Telegram Bot API + Login Widget. *Phase 12 relevance:* the promo capture must be a client beacon that works in the installed PWA (no cookie/consent scheme — D-12).
- **Infrastructure**: one server, `dash.3set.online`, HTTPS mandatory (Platega + Telegram webhooks). *Phase 12 relevance:* no queue/Redis; the nightly cron is the only scheduler.
- **Compliance**: RU/RUB, unlimited by default. *Phase 12 relevance:* all new copy goes in `lib/i18n/messages/ru.ts`, RUB formatting only.
- **GSD workflow enforcement**: no direct repo edits outside a GSD command; migrations deploy via `npx prisma migrate deploy` (never `migrate dev` in prod).

## Summary

Phase 12 has two halves that share one shape: **make the numbers trustworthy** (comparable windows, explicit incomparability, a write-guard) and **start capturing data that cannot be backfilled** (promo clicks, account IP hashes).

The comparison half is smaller than it looks, but the blast radius of D-04 is larger than "shift the start one day". Every windowed loader in `lib/analytics/service.ts` and its siblings uses a **`gte`-only** lower bound (`service.ts:144`, `service.ts:151-156`, and the analogous queries at 433 / 596 / 663). Excluding today therefore requires adding an **exclusive upper bound** (`paidAt: { gte: fromInstant, lt: endInstantExclusive }`) to every windowed query plus the raw-SQL payers query, and making the bounds injectable so tests stay deterministic. The existing `windowStartDay()` (`service.ts:120-123`) is documented as "inclusive window of `period` days ending today" — that comment and the function both change.

The data-quality half is essentially a **schema + seam** problem, not an algorithm problem: append-only `data_quality_events`, a degrade-classifier at the analytics consumption seam (never inside `lib/artemida.ts`, which is the money hot path), and a write-guard implemented as a **different SQL conflict action** (`DO NOTHING` vs `DO UPDATE`) chosen per run rather than a read-then-write check. That is race-free by construction and matches the existing concurrent-safe pattern already proven in `rollup.ts` (12-concurrent-run test at `tests/unit/analytics-rollup.test.ts:245`).

The capture half is the irreversible part. `referral_clicks.owner_user_id` is currently `Int` NOT NULL with `onDelete: Cascade` (`schema.prisma:546-557`); making it nullable plus adding `promoCodeId`/`kind` is a forward-only migration. There is **no promo-click capture surface today at all** — `PromoField` is a typed input, not a landing beacon — so the planner must define it. `signupIpHash`/`trialIpHash` can only be captured on HTTP paths that have a real client IP; the Telegram webhook path must not hash Telegram's server IP.

**Primary recommendation:** Split the phase into three independent seams — (1) pure `lib/analytics/windows.ts` + `compare.ts` + `metric-registry.ts` (no Prisma import, fully unit-testable), (2) `data_quality_events` table + degrade classifier + the `DO NOTHING`/`DO UPDATE` guard inside `rollupDays`, (3) the two capture migrations (`referral_clicks` generalization + `User.*IpHash`) with `ipHash` threaded through the existing atomic `updateMany` trial claim. Build (1) and (3) before (2) — capture is the only work that loses value every day it is not shipped.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ALR-01 | WoW/MoM deltas (absolute + %) for every `/admin/analytics` metric, on MSK boundaries, never comparing an incomplete day to a complete period | `## Architecture Patterns` P1–P4 (window pair derivation, `MetricCard` delta prop, stock-vs-flow handling, `incomparable` state machine); `## Code Examples` E1/E2 |
| EXT-05 | Degraded ARTEMIDA responses recorded as events, excluded from aggregates, metric flagged in UI with an excluded-record count | `## Architecture Patterns` P5–P7 (taxonomy mapping, recording seam, write-guard via conflict action); `## Code Examples` E3/E4 |
| (prerequisite for PRM-01) | Promo-code click capture in the generalized `referral_clicks` table with hourly per-IP dedupe | `## Architecture Patterns` P8 (`referral_clicks` shape + `funnelStats` scope hazard); `## Code Examples` E5 |
| (prerequisite for PRM-04) | `User.signupIpHash` at registration and `User.trialIpHash` at trial claim, never raw IP, `"direct"` never hashed | `## Architecture Patterns` P9 (capture points, atomicity, merge semantics); `## Code Examples` E6 |
| (foundation for Phase 16) | `lib/analytics/metric-registry.ts` as the single id/label/formula/source/direction/limitation source | `## Architecture Patterns` P10 (registry shape + i18n scan hazard); `## Code Examples` E7 |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Comparison-window derivation (which two MSK day ranges) | Pure JS module (`lib/analytics/windows.ts`) | — | Must be deterministic and testable without a DB or clock; `lib/analytics/time.ts` already owns all MSK math and is a pure module by design. |
| Delta computation (abs, %, base-empty, incomparable) | Pure JS module (`lib/analytics/compare.ts`) | — | Arithmetic over two already-fetched aggregates; no I/O. PITFALLS #3 warns about equal bucket lengths — a property of this module, so it is the right place to enforce it. |
| Windowed aggregate reads | API/Backend (Prisma loaders in `lib/analytics/service.ts`, `economics.ts`, `funnel.ts`, `retention.ts`) | Database (Postgres `timestamp(3)` comparison) | The upper bound must be pushed into SQL (`lt`), not applied in JS after the fact — otherwise the payers `COUNT(DISTINCT)` raw query (`service.ts:151-156`) stays wrong. |
| Degraded-event persistence | Database (`data_quality_events`, append-only) | API/Backend (`rollupDays`, cron route) | D-07: the log is the source of truth for "was this window honest"; `daily_metrics` must stay a clean value rollup. |
| Degrade classification (which failures count) | API/Backend at the *analytics consumption seam* | — | Never inside `lib/artemida.ts`: that module serves checkout, keys, trial and balance — the money path. Recording there would couple money to analytics. |
| Write-guard | Database (SQL conflict action) | API/Backend (`rollupDays` signature) | `ON CONFLICT ... DO NOTHING` vs `DO UPDATE` is decided before the statement and enforced atomically by Postgres — no TOCTOU window, no advisory lock. |
| Click capture | Browser/Client (beacon on landing) | API/Backend (`app/api/referrals/click` or a generalized route) | Existing contract: always 200, no oracle; browser is the only place a promo landing visit exists. |
| Account IP hash at registration | API/Backend (`/api/auth/email/register`) | Database (`users.signup_ip_hash`) | Only the HTTP route has `clientIp(req)`; `clientIp` is explicitly a pure module with no `next/headers` dependency (`lib/client-ip.ts`). |
| Account IP hash at trial claim | API/Backend (`lib/keys-service.ts` claim path) | Database (`users.trial_ip_hash`) | Must ride the existing single-statement `updateMany` claim (`keys-service.ts:448-454`, `475-481`) so it is atomic with the claim itself. |
| Metric registry | Pure JS module (`lib/analytics/metric-registry.ts`) | UI (`components/admin/*`) | A shared TS constant is the only way Phase 16's "every MetricId has a dictionary entry" test can be exhaustive. |
| Delta / quality rendering | Browser/Client (`MetricCard`) | — | D-01: one extension point, all existing reports inherit it. |

**Tier-misassignment traps this map is meant to prevent**

- Computing the "is this window incomplete" check in the React layer from `new Date()` — the answer must be server-derived, else a client clock skew flips a metric to `incomparable`.
- Applying the upper bound in JS (`rows.filter(...)`) instead of in the query — silently keeps the payers denominator wrong and breaks aggregate correctness for `COUNT(DISTINCT)`.
- Recording degraded events inside `lib/artemida.ts` — turns every checkout 502 into an analytics DB write on the hot path.

## Standard Stack

**Zero new npm dependencies** — this is a locked project constraint for the phase. Everything below already exists in the repo.

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | `^5.9` (strict) | Registry and comparison types | [VERIFIED: package.json] project pin; registry must be a TS union of literal ids, not a runtime map, so Phase 16's exhaustiveness test is compile-checkable. |
| Next.js App Router | `16.3.x` | Beacon route, admin RSC page, cron route | [CITED: .planning/research/STACK.md] `app/manifest.ts` + Route Handlers; `force-dynamic` on admin RSC pages is the established pattern. |
| Prisma | `^7.10` (NOT v8 RC) | Migration for `data_quality_events`, `referral_clicks` generalization, `User.*IpHash` | [CITED: .planning/research/STACK.md] — v7 is the stable line; v8 is an RC on `latest`. |
| PostgreSQL | `17` | Append-only event log, `@db.Date` rollup, `ON CONFLICT` guard | [VERIFIED: prisma/schema.prisma:600-615] `DailyMetric` is keyed by `day DateTime @id @db.Date`; the guard relies on that PK. |
| vitest | existing | Pure-module tests + real-DB rollup/cron tests | [VERIFIED: vitest.config.ts] `include: ['tests/**/*.test.ts']`, `fileParallelism: false`, real local Postgres for DB suites. |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `lib/analytics/time.ts` primitives | in-repo | `mskDayLabel`, `mskDayStartInstant`, `mskDateKey`, `pgTimestamp`, `addMonths` | Every comparison-window computation. **Do not add a date library and do not do date math in SQL.** |
| `lib/analytics/series.ts` (`buildDailySeries`, `cashOf`) | in-repo | Zero-filled daily aggregates for windowed flows | Reuse for flow-metric deltas; it already zero-fills (`emptyAggregate`) so "base = 0" is distinguishable from "no data". |
| `lib/analytics/mrr.ts` (`mrrAt`) | in-repo | Point-in-time stock metrics at a window boundary | Stock metrics (MRR/ARR/activeKeys) compare two instants, **not** two sums. |
| `node:crypto` `createHash` | built-in | IP hashing (already used at `referral-stats.ts:27-29`) | Same primitive, no new dep; `sha256` hex. |
| `p-retry` | existing | Already the retry layer in `lib/artemida.ts` | Degraded classification observes *post-retry* failure; do not add retry logic. |
| `Setting` KV table | in-repo | Optional toggles without migration | Only if a threshold is needed; D-10 explicitly says no thresholds, so likely unused. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Separate `data_quality_metric_flags` columns on `daily_metrics` | A boolean column per metric on `DailyMetric` | Rejected by D-07: `daily_metrics` stays a clean value rollup; a per-metric flag column set would also need a migration per new metric. |
| `last-write-wins` absolute upsert with a `degraded` guard column | Read-then-conditional-write in `rollupDays` | Rejected: TOCTOU. Two overlapping cron/backfill runs could both read "healthy row absent" and both write. The conflict action is atomic. |
| A new `promo_clicks` table | Generalize `referral_clicks` | Rejected by D-11: one table = one funnel; otherwise Phase 14 has to UNION two tables with different shapes. |
| `hashIp("direct")` reuse | `hashClientIp(ip): string \| null` returning `null` for `"direct"` | Recommended: D-14 says the literal is never hashed into clusters. Keeping the old sentinel would keep polluting the histogram. |

### Version verification

No new packages are installed in this phase, so no registry verification is required beyond the existing lockfile. Two in-repo pins were re-read this session as the authoritative source:

- `[VERIFIED: package.json]` `"test": "vitest run tests/unit"`, `"build": "next build"`.
- `[VERIFIED: prisma/migrations/20261031113119_phase11_user_rfm]` is the newest migration directory; the Phase 12 migration must sort after it (timestamp prefix, not name).

## Package Legitimacy Audit

**No packages are installed in Phase 12.** The phase is explicitly zero-new-dependency ([CITED: .planning/research/STACK.md] "zero new dependencies; capture-only groundwork rationale"). Everything used is either a Node built-in (`node:crypto`), an existing dependency, or in-repo code.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| — | — | — | — | — | — | No new installs in this phase |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

*If the planner finds itself wanting a date library or a UUID helper, that is a signal the seam is wrong — `lib/analytics/time.ts` and `crypto.randomUUID` already cover it.*

## Architecture Patterns

### System Architecture Diagram

```
                          ┌──────────────── browser (PWA, mobile-first) ───────────────┐
                          │  /promo landing (new capture)   /admin/analytics?period=7|30|90 │
                          └───────────┬──────────────────────────────┬─────────────────┘
                                      │ sendBeacon POST              │ RSC GET
                                      ▼                              ▼
                    ┌──────────────────────────────┐   ┌──────────────────────────────────┐
                    │ /api/referrals/click (or     │   │ app/admin/analytics/page.tsx     │
                    │ generalized /api/promo/click)│   │ requireRole + force-dynamic      │
                    │ always 200, no oracle        │   │ per-block try/catch              │
                    └───────────┬──────────────────┘   └───────────────┬──────────────────┘
                                │                                      │ period
                                ▼                                      ▼
                 ┌──────────────────────────────┐      ┌───────────────────────────────────┐
                 │ recordClick / recordPromoClick│     │ windows.ts (PURE)                 │
                 │  hashClientIp → null if"direct"│     │  current:  [start .. endExcl)     │
                 │  hourly dedupe by ipHash      │     │  base:     [baseStart .. start)    │
                 └───────────┬──────────────────┘      │  excludes today (D-04)            │
                             │                         └───────────────┬───────────────────┘
                             ▼                                         │ two windows
                 ┌──────────────────────────────┐                      ▼
                 │ referral_clicks              │      ┌───────────────────────────────────┐
                 │  kind: referral|promo        │      │ service.ts loaders                │
                 │  ownerUserId?  promoCodeId?  │      │  gte start AND lt endExclusive    │
                 │  ipHash, source, createdAt   │      │  (both bounds in SQL)             │
                 └──────────────────────────────┘      └───────────────┬───────────────────┘
                                                                       │ aggregates ×2
                                                                       ▼
                                                       ┌───────────────────────────────────┐
                                                       │ compare.ts (PURE)                 │
                                                       │  abs = cur - base                 │
                                                       │  pct = base===0 ? null : …        │
                                                       │  status: ok|no-base|incomparable  │
                                                       └───────────────┬───────────────────┘
                                                                       │
     ┌─────────────────────────────────────────────────────────────────┼──────────────────┐
     │                                                                 ▼                  │
     │  ┌──────────────────┐   ┌───────────────────────────────────────────────┐          │
     │  │ data_quality_    │◄──│ quality.ts: in-window degraded events          │          │
     │  │ events (append)  │   │  count → "данные неполные (N)" + incomparable  │          │
     │  └────────▲─────────┘   └───────────────────┬───────────────────────────┘          │
     │           │ record                              │ props                           │
     │  ┌────────┴─────────────────────────┐          ▼                                  │
     │  │ analytics consumption seam       │   ┌──────────────────────────┐               │
     │  │ (rollup / loaders / cron)        │   │ MetricCard               │               │
     │  │ classifies ArtemidaError/throws  │   │  label value sub         │               │
     │  └────────▲─────────────────────────┘   │  +delta  +quality (D-01) │               │
     │           │ post-retry failure          └──────────────────────────┘               │
     └───────────┼───────────────────────────────────────────────────────────────────────┘
                 │
        ┌────────┴─────────┐
        │ lib/artemida.ts  │  ArtemidaError{code,status,retryAfterSec}  (UNCHANGED)
        │  pRetry 429/502/503 → typed error;  NO fetch timeout today
        └──────────────────┘

        ┌──────────────────────────────────────────────────────────────────────┐
        │ /api/cron/analytics (03:05 MSK)                                      │
        │  1. re-roll last 7 MSK days (existing)                               │
        │  2. + re-roll last 3 days with OPEN degraded events (D-09)           │
        │  3. close events after a healthy read                                │
        │  4. delete referral_clicks older than 13 months (D-13)               │
        │  write-guard: healthy run → DO UPDATE, degraded run → DO NOTHING     │
        └──────────────────────────────────────────────────────────────────────┘
```

**Trace the primary use case (a 30-day MoM delta on the MRR card):** browser hits `?period=30` → page calls `windows.ts` → current = last 30 complete MSK days, base = the 30 before → `loadKpis` runs twice (or once over the union, split in JS with an explicit `lt`) → `compare.ts` produces `{abs, pct, status}` → `quality.ts` checks `data_quality_events` for both ranges → `MetricCard` renders value + delta + optional badge. Note MRR is a **stock**: it does not use the flow delta at all, it compares `mrrAt(orders, endOfCurrent)` vs `mrrAt(orders, endOfBase)` labelled with dates (see P4).

### Recommended Project Structure

```
lib/analytics/
├── time.ts               # EXISTING — MSK primitives, never duplicated
├── windows.ts            # NEW  — pure: period → {current, base} day-label ranges
├── compare.ts            # NEW  — pure: two numbers → MetricDelta (abs/pct/status)
├── metric-registry.ts    # NEW  — pure: MetricId union + registry record
├── quality.ts            # NEW  — pure classifier + in-window event summarizer
├── service.ts            # EDIT — windowed loaders gain upper bound + both windows
├── rollup.ts             # EDIT — write-guard conflict action + degrade recording
├── economics.ts          # EDIT — same bound change (margin, burn, runway)
├── funnel.ts             # EDIT — same bound change
├── retention.ts          # EDIT — same bound change
└── mrr.ts                # READ-ONLY reuse — mrrAt for stock comparisons

lib/
├── ip-hash.ts            # NEW  — hashClientIp(ip): string|null, DIRECT_IP sentinel
├── referral-stats.ts     # EDIT — recordClick generalized; funnelStats filters kind
└── keys-service.ts       # EDIT — claimTrial/claimTrialByUserId take ipHash

components/admin/
└── MetricCard.tsx        # EDIT — optional delta + quality props (backward compatible)

app/api/
├── cron/analytics/route.ts   # EDIT — 3-day retry, event closure, retention sweep
└── referrals/click/route.ts  # EDIT or generalize — promo clicks

prisma/
├── schema.prisma         # EDIT — DataQualityEvent, ReferralClick, User.*IpHash
└── migrations/<ts>_phase12_data_quality_and_ip_hashes/
```

### Pattern 1: Two windows derived once, in pure code, from a single `now`

**What:** `windows.ts` exposes `comparisonWindows(period, now)` returning `{ current: { fromDay, toDay, fromInstant, endExclusive }, base: { … } }`. Every loader call site receives those bounds as arguments; nothing re-reads the clock.

**When to use:** Every windowed loader on `/admin/analytics` and every report that inherits the cards.

**Why:** Today `windowStartDay` reads `Date.now()` internally (`[VERIFIED: lib/analytics/service.ts:120-123]`):

```ts
/** First MSK day label of the inclusive window of `period` days ending today. */
function windowStartDay(period: 7 | 30 | 90): string {
  return mskDayLabel(new Date(Date.now() - (period - 1) * DAY_MS));
}
```

Two calls (current + base) at two different instants can straddle MSK midnight and produce a one-day gap or overlap. Passing one `now` closes that. It also makes the D-04 change testable: a test can pass a fixed `now` and assert exact labels.

**Skeleton:**

```ts
// lib/analytics/windows.ts — PURE, no Prisma import
import { mskDayLabel, mskDayStartInstant } from './time';

const DAY_MS = 86_400_000;

export interface Window {
  /** First MSK day label, inclusive. */
  fromDay: string;
  /** Last MSK day label, inclusive. */
  toDay: string;
  /** Instant the first day starts (for timestamp(3) `gte`). */
  fromInstant: Date;
  /** Instant the day AFTER toDay starts (for timestamp(3) `lt`). */
  endExclusive: Date;
}

/** Last COMPLETE MSK day — today is excluded (D-04). */
export function lastCompleteDay(now: Date): string {
  return mskDayLabel(new Date(now.getTime() - DAY_MS));
}
```

### Pattern 2: Bounds go into SQL, both of them — the `gte`-only bug

**What:** Every windowed query becomes `{ gte: fromInstant, lt: endExclusive }`.

**When to use:** `loadKpis` window orders, the payers raw query, `loadMargin`, `loadFunnelOrderRows`, `loadProvisionedRows`, and every sibling in `economics.ts`/`funnel.ts`/`retention.ts`.

**Evidence of the current shape** `[VERIFIED: lib/analytics/service.ts:143-156]`:

```ts
    prisma.order.findMany({
      where: { status: { in: [...PAID] }, paidAt: { gte: fromInstant } },
      select: { finalAmount: true, balanceUsed: true, providerCost: true },
    }),
    prisma.user.count(),
    // COUNT returns bigint → ::int cast keeps it a JS number (never a BigInt
    // crossing the RSC payload). Payers = DISTINCT user_id over the SAME
    // window — order count would be a different (wrong) denominator.
    prisma.$queryRaw<{ payers: number }[]>`
      SELECT COUNT(DISTINCT user_id)::int AS payers
      FROM orders
      WHERE status IN ('paid', 'provisioning', 'provisioned')
        AND paid_at >= ${pgTimestamp(fromInstant)}
    `,
```

Neither has an upper bound. Adding only `lt` to the Prisma call and forgetting the raw SQL leaves ARPPU's denominator inflated by today's payers — a silent drift, not a type error. The doc comment at `service.ts:129-135` also states the window is "inclusive of today", so the comment must change with the code or it becomes a future trap.

### Pattern 3: `incomparable` is a first-class outcome, and it is not `partial`

**What:** A discriminated union, not a nullable number:

```ts
export type MetricDelta =
  | { status: 'ok'; abs: number; pct: number | null; base: number; current: number }
  | { status: 'no-base'; abs: number; pct: null; reason: 'zero' | 'absent' }
  | { status: 'incomparable'; reason: 'degraded-base' | 'degraded-current' | 'coverage' };
```

**When to use:** D-03 (zero base → `—` + «нет базы», absolute still visible) and D-05 (incomparable → number not shown at all).

**Why a union, not `{value, pct, note}`:** the two states have different UI contracts. `no-base` still renders the absolute delta and the current value; `incomparable` suppresses the number entirely (D-05: "результат помечается `incomparable` и число не показывается"). A boolean `partial` flag on a numeric field would let a caller accidentally render `0` — which is exactly what the roadmap's superseded `partial` wording invited.

**⚠️ Roadmap wording superseded:** ROADMAP SC-3 describes a `partial` state. D-04/D-05 (locked by the user) supersede it: the **only** non-numeric state is `incomparable`; there is no `partial`. The planner must not implement `partial` and must not write success criteria that require it.

### Pattern 4: Stock metrics compare instants, flow metrics compare sums

**What:** Classify every metric in the registry as `flow` or `stock`. Flows (`paidOrders`, `paidCashRub`, `newUsers`, `funnel` steps, `timeToPay` medians over a window) delta the two window aggregates. Stocks (`mrr`, `arr`, `activeKeys`, all derived at an instant by `mrrAt`/`activeKeysAt`) compare the value at `current.endExclusive` vs `base.endExclusive`.

**When to use:** Every card. This is the PITFALLS "UX trap" — a stock metric rendered as a flow delta tells the admin "MRR grew by X" when it actually means "the sum of MRR over 30 days grew", which is meaningless.

**Why it matters here:** `[VERIFIED: lib/analytics/service.ts:169-172]` shows MRR/ARR/activeKeys are computed at `now` from the full order history, while ARPU/ARPPU use `windowCash`:

```ts
  return {
    mrr: totalMrrAt(history, now),
    arr: arrAt(history, now),
    activeKeys: activeKeysAt(history, now),
    arpu: computeArpu(windowCash, arpuDenominator),
    arppu: computeArppu(windowCash, arppuDenominator),
```

So a "current window MRR" does not exist as a loader output today — it must be `mrrAt(history, currentEndExclusive)` vs `mrrAt(history, baseEndExclusive)`, labelled with the two day labels.

### Pattern 5: Degraded classification maps `ArtemidaError` codes + the two unmapped cases

**What:** A pure classifier `classifyDegraded(err): DegradedReason | null`.

**The complete taxonomy, from the source of truth** `[VERIFIED: lib/artemida.ts:21-29]`:

```ts
export type ArtemidaCode =
  | "unauthorized"
  | "payment_required"
  | "conflict"
  | "rate_limited"
  | "bad_gateway"
  | "unavailable"
  | "not_found"
  | "unknown";
```

`[VERIFIED: lib/artemida.ts:58-62]` — the retried set:

```ts
const RETRYABLE: ReadonlySet<ArtemidaCode> = new Set([
  "rate_limited",
  "bad_gateway",
  "unavailable",
]);
```

`[VERIFIED: lib/artemida.ts:90-112]` — status mapping, note the fall-through:

```ts
    case 503:
      return "unavailable";
    default:
      if (providerCode === "invalid_api_key" || providerCode === "missing_api_key") {
        return "unauthorized";
      }
      return "unknown";
```

Consequences for D-06 ("timeout, 5xx after p-retry exhausted, 429 with retries exhausted, 401/402"):

| Provider event | `ArtemidaError`? | `code` | Counts as degraded per D-06? | How to detect |
|---|---|---|---|---|
| 401 | yes | `unauthorized` | **yes** | `code === 'unauthorized'` |
| 402 | yes | `payment_required` | **yes** | `code === 'payment_required'` |
| 429 after retries | yes | `rate_limited` | **yes** | `code === 'rate_limited'` |
| 502 after retries | yes | `bad_gateway` | **yes** | `code === 'bad_gateway'` |
| 503 after retries | yes | `unavailable` | **yes** | `code === 'unavailable'` |
| **500** | yes | **`unknown`** (status 500) | **yes** — it is a 5xx | `code === 'unknown' && status >= 500` |
| **504** | yes | **`unknown`** (status 504) | **yes** — it is a 5xx | same |
| 404 / 409 | yes | `not_found` / `conflict` | **no** | excluded — a 409 is a business outcome, not a data-quality event |
| Zod schema mismatch (envelope ok, payload wrong) | yes | `unknown`, status 200 | **open question** | `code === 'unknown' && status < 500` — see Open Questions |
| Network failure / DNS / socket reset | **no** — plain `TypeError`/`DOMException` escapes `pRetry` | n/a | **yes** if it is a timeout | `!(err instanceof ArtemidaError)` |
| **Fetch timeout** | **no timeout exists** | n/a | n/a today | `[VERIFIED: lib/artemida.ts]` the client passes no `signal`/`AbortSignal.timeout` to `fetch`; a hung socket hangs forever |

**Critical finding:** `lib/artemida.ts` has **no fetch timeout**. D-06 lists "timeout" as a degraded event, but there is no timeout to observe. Two options for the planner (must pin one):

- **(a) Recommended, minimal:** treat "any non-`ArtemidaError` throw during a provider call" as `reason: 'network'` and document that a true application-level timeout does not exist yet; add the timeout in a later phase (it changes the money path and needs its own tests).
- **(b) Add `AbortSignal.timeout(...)` behind an option** defaulting to a large value, and map `DOMException`/`AbortError` → `reason: 'timeout'`. This is a behaviour change in the money path — out of scope for a research-driven foundation phase unless the user asks.

**`"suspiciously empty response"` is explicitly excluded by D-06** — do not add a row count/schema-shape heuristic. `ArtemidaError('unknown', 200)` (envelope parsed, payload rejected) is the one grey zone; it is a schema mismatch, not a provider outage. Recommend **exclude** (consistent with D-06's false-positive defence) and record the decision in the registry/quality module docstring.

### Pattern 6: Record at the consumption seam, fire-and-forget — never in `lib/artemida.ts`

**What:** Wrap provider calls made *for analytics* with a small helper that classifies, records, and re-throws (or swallows, depending on caller).

**When to use:** `rollupDays`'s `getBalance()` call, and any new analytics-only provider read. **Not** checkout, key provisioning, or trial creation.

**Why:** `lib/artemida.ts` is imported by order fulfillment, keys service, trial, and balance alerts. A DB write on every failure there would convert an ARTEMIDA outage into a Postgres write storm on the money path, and would make `lib/artemida.test.ts` require a database.

**Skeleton:**

```ts
// lib/analytics/quality.ts — recording helper (the classifier above stays pure)
export async function recordIfDegraded(
  err: unknown,
  ctx: { source: string; dayLabel: string; detail?: Record<string, unknown> },
): Promise<void> {
  const reason = classifyDegraded(err);
  if (!reason) return;
  try {
    await prisma.dataQualityEvent.create({
      data: { source: ctx.source, day: mskDateKey(ctx.dayLabel), reason, detail: ctx.detail ?? null },
    });
  } catch {
    // Never let observability break the caller. The cron logs its own outcome.
  }
}
```

**On the read path** (a page render), use `void recordIfDegraded(...)` so a slow DB never stalls an RSC render; on the cron path `await` it so the run's outcome is deterministic and testable.

### Pattern 7: The write-guard is a conflict action, not a read-check

**What:** `rollupDays(fromDay, toDay, source)` decides, **before** the loop, whether this run is healthy for each day; then emits one of two statements per day:

- healthy → existing `ON CONFLICT (day) DO UPDATE SET …` (absolute overwrite, unchanged)
- degraded → `ON CONFLICT (day) DO NOTHING`

**Evidence of the current absolute upsert** `[VERIFIED: lib/analytics/rollup.ts:100-113]`:

```ts
      ON CONFLICT (day) DO UPDATE SET
        paid_orders          = EXCLUDED.paid_orders,
        paid_cash_rub        = EXCLUDED.paid_cash_rub,
        new_orders           = EXCLUDED.new_orders,
        renew_orders         = EXCLUDED.renew_orders,
        upgrade_orders       = EXCLUDED.upgrade_orders,
        provider_cost_rub    = EXCLUDED.provider_cost_rub,
        provider_cost_orders = EXCLUDED.provider_cost_orders,
        active_keys          = EXCLUDED.active_keys,
        new_users            = EXCLUDED.new_users,
        goodwill_days        = EXCLUDED.goodwill_days,
        computed_at          = now()
```

And the already-proven `DO NOTHING` precedent used for the balance snapshot `[VERIFIED: lib/analytics/rollup.ts:117-131]`:

```ts
  let balance: "ok" | "skipped" = "ok";
  try {
    // One snapshot per run, for YESTERDAY (now-based) — first reading wins:
    // DO NOTHING never silently overwrites an earlier captured value.
    const snapshotDay = mskDayLabel(new Date(Date.now() - 86_400_000));
    const wallet = await artemida.getBalance();
    await prisma.$executeRaw`
      INSERT INTO artemida_balance_snapshots (day, balance_rub, captured_at, source)
      VALUES (${snapshotDay}::date, ${Math.round(wallet.balance)}, now(), ${source})
      ON CONFLICT (day) DO NOTHING
    `;
  } catch {
    // Convenience series, not an invariant: never fail the rollup for it.
    logger.warn({ route: "rollup", outcome: "balance_unavailable" });
    balance = "skipped";
  }
```

**Why this is the right shape for D-08:**

1. It is atomic — no window where a concurrent healthy run and a degraded run can interleave incorrectly. The existing 12-concurrent-run test (`[VERIFIED: tests/unit/analytics-rollup.test.ts:245]` "survives 12 concurrent runs on the same day: one absolute row, no double-count") is the regression proof for the healthy branch.
2. It satisfies both halves of D-08 literally: "healthy day never overwritten by degraded" (`DO NOTHING` on conflict) and "unwritten day still gets a row so there is no hole" (`INSERT` still succeeds).
3. It needs no new column on `DailyMetric` (D-07 forbids a quality flag there) and no advisory lock.

**The honest problem the planner must confront:** `daily_metrics` is derived **only** from `orders`, `users`, `ticketCompensations` (`[VERIFIED: lib/analytics/rollup.ts:60-75]` selects exactly those three, and `buildDailySeries` consumes them). Those are *our* tables, not ARTEMIDA. The only provider call in the run is `getBalance()`, which writes to `artemida_balance_snapshots`, not `daily_metrics`. So **today there is no provider-sourced column in `daily_metrics` whose degraded-ness could corrupt anything.**

Therefore the guard must be built as a **mechanism with a declared source map**, not as a hardcoded balance check:

```ts
// Registry of which daily_metrics columns are provider-sourced (∅ today).
// The guard reads this map; when Phase N adds a provider-sourced column,
// adding its name here is the only change needed.
export const PROVIDER_SOURCED_COLUMNS: Record<string, readonly (keyof DailyAggregate)[]> = {
  // 'artemida': ['activeKeys'],   // example of a future entry — NOT active today
};
```

Consequences for plan/verification:

- SC-5 ("degraded run cannot overwrite healthy values") is satisfied as a **mechanism + test**, with an empty source set today. The test forces the degraded path via a dependency-injected flag (`rollupDays(from, to, source, { forceDegraded: true })` or an injectable `getBalance` stub that throws) and asserts `DO NOTHING` semantics: a pre-seeded healthy row survives untouched.
- Reject the alternative "freeze the whole run on any provider failure": a permanent 401 (`unauthorized`) would freeze *all* rollups forever, including columns that have nothing to do with ARTEMIDA. That is a worse failure mode than the one it prevents.
- Do **not** invent a `degraded` boolean on `daily_metrics`.

**Degraded-day detection for the guard, concretely:** a day is degraded for source `S` when `data_quality_events` has an **open** row for that `day` and `source`. Because the run computes the series for a range in one pass, compute `openDegradedDays(fromDay, toDay, source)` once at the start and pass the set into the loop.

### Pattern 8: `referral_clicks` generalization — and the `funnelStats` scope trap

**Current shape** `[VERIFIED: prisma/schema.prisma:546-557]`:

```prisma
model ReferralClick {
  id          String   @id @default(cuid())
  ownerUserId Int      @map("owner_user_id")
  owner       User     @relation(fields: [ownerUserId], references: [id], onDelete: Cascade)
  code        String?
  ipHash      String   @map("ip_hash")
  source      String   @default("link")
  createdAt   DateTime @default(now()) @map("created_at")

  @@index([ownerUserId, createdAt])
  @@map("referral_clicks")
}
```

**Target shape (D-11):**

```prisma
model ReferralClick {
  id          String   @id @default(cuid())
  // NULL for generic (non-partner) promo codes — D-11.
  ownerUserId Int?     @map("owner_user_id")
  owner       User?    @relation(fields: [ownerUserId], references: [id], onDelete: Cascade)
  // 'referral' = partner link, 'promo' = code-specific landing/validation click.
  kind        String   @default("referral")
  promoCodeId String?  @map("promo_code_id")
  promoCode   PromoCode? @relation(fields: [promoCodeId], references: [id], onDelete: SetNull)
  code        String?
  ipHash      String   @map("ip_hash")
  source      String   @default("link")
  createdAt   DateTime @default(now()) @map("created_at")

  @@index([ownerUserId, createdAt])
  @@index([promoCodeId, createdAt])
  @@index([kind, createdAt])
  @@index([createdAt])           // D-13 retention sweep
  @@map("referral_clicks")
}
```

**Backfill in the migration:** `UPDATE referral_clicks SET kind = 'referral' WHERE kind IS NULL` is unnecessary if the column is `NOT NULL DEFAULT 'referral'` — existing rows get the default. Verify with a `SELECT count(*) … WHERE kind IS NOT NULL` assertion in the migration's plan, not inline SQL.

**⚠️ The silent-drift trap:** `funnelStats` builds its scope filter like this `[VERIFIED: lib/referral-stats.ts:70-80]`:

```ts
  const range = { gte: from, lte: to };
  const ownerFilter =
    scope.ownerUserId === undefined ? {} : { ownerUserId: scope.ownerUserId };

  const [clicks, referred] = await Promise.all([
    prisma.referralClick.count({ where: { ...ownerFilter, createdAt: range } }),
```

When `ownerUserId` is `undefined` (the admin global view), `ownerFilter` is `{}` — so it counts **every** row in the table. After D-11 that includes promo clicks, and the admin referral funnel silently inflates. No test will fail. The fix is a registry-visible scope change: `{ kind: 'referral', ...ownerFilter }` in the global branch, or equivalently `{ promoCodeId: null }`. **The planner must include a regression test** asserting that a promo row does not change the global referral funnel count.

**Public route naming (agent's discretion):** generalizing `/api/referrals/click` is fewer moving parts and keeps one beacon, but the path name then lies about its scope. Recommend either (a) generalize the handler into `lib/click-capture.ts` with two thin routes (`/api/referrals/click`, `/api/promo/click`) sharing the same "always 200, no oracle" contract, or (b) keep one route and accept the name. Both are fine; the non-negotiable is that the response is `200` with no information about whether the click was recorded, and that `source` is sliced to the column width (`referral-stats.ts:50` does `source.slice(0, 32)`).

### Pattern 9: IP hashing — one helper, three call sites, one sentinel rule

**Current hashing** `[VERIFIED: lib/referral-stats.ts:27-29]`:

```ts
function hashIp(ip: string): string {
  return createHash("sha256").update(ip).digest("hex");
}
```

**Sentinel** `[VERIFIED: lib/client-ip.ts:26-28]` — the fallback when no proxy headers exist:

```ts
  if (parts && parts.length > 0) return parts[parts.length - 1];
  return "direct";
}
```

**New shared module (recommended):**

```ts
// lib/ip-hash.ts — PURE (node:crypto only), importable from vitest node env
import { createHash } from 'node:crypto';
export const DIRECT_IP = 'direct';           // the literal clientIp() falls back to
export function hashClientIp(ip: string): string | null {
  if (ip === DIRECT_IP) return null;         // D-14: never hashed, never clustered
  return createHash('sha256').update(ip).digest('hex');
}
```

**Why `null`, not the old `hashIp("direct")`:** existing `referral_clicks` rows already contain `sha256("direct")`, so history is polluted. Do **not** delete it (destroys the funnel), do **not** rewrite it (a hash of a sentinel is indistinguishable from a real hash after the fact) — just stop writing it and let D-13's 13-month retention age it out. Export `DIRECT_IP` so Phase 14's clustering can exclude the historical hash explicitly if needed.

**Capture points for `User.signupIpHash` / `User.trialIpHash` (D-14):**

| Surface | Has `clientIp(req)`? | What to write | Notes |
|---|---|---|---|
| `app/api/auth/email/register/route.ts` | **yes** — `[VERIFIED: app/api/auth/email/register/route.ts:13,45]` imports and calls `clientIp(req)` | `signupIpHash` on `prisma.user.create` | Do **not** hash `"direct"` → write `null`. |
| `app/api/auth/telegram` (Login Widget) | yes (HTTP) | `signupIpHash` on account creation | Same rule. |
| `app/api/auth/telegram-bot/consume` | yes (HTTP) | `signupIpHash` on account creation | Same rule. |
| Telegram **webhook** / bot process | **no real client IP** | **nothing** | Hashing here would store Telegram's datacenter IP — worse than null, it would create a fake cluster of "users from one IP". |
| `POST /api/trial` | **yes** — it is an HTTP route | `trialIpHash` at claim | Must be atomic with the claim: `[VERIFIED: lib/keys-service.ts:448-454]` |

```ts
export async function claimTrial(telegramId: bigint): Promise<boolean> {
  const { count } = await prisma.user.updateMany({
    where: { telegramId, trialUsed: false },
    data: { trialUsed: true },
  });
  return count === 1;
}
```

Recommended change: `claimTrial(telegramId, ipHash?: string | null)` → `data: { trialUsed: true, ...(ipHash ? { trialIpHash: ipHash } : {}) }`. Same for `claimTrialByUserId` (`keys-service.ts:475-481`). Keeping it in the same `updateMany` means the hash is written iff the claim wins — never on a losing concurrent claim.

**Two decisions the planner must pin (discretion, not locked):**

1. **Does `releaseTrialOnFailure*` clear `trialIpHash`?** `[VERIFIED: lib/keys-service.ts:461-466]` releases by `data: { trialUsed: false }`. Recommendations: leave the hash (it records "this IP attempted a trial", which is exactly the fraud signal PRM-04 wants) — but state the choice, because it means a released claim still contributes an IP observation.
2. **Account merge** (`lib/accounts.ts` merges `trialUsed` with OR): which side's `trialIpHash` survives? Recommendation: keep the earlier non-null (first attempt) and record both in `data_quality_events`? No — simpler: keep the surviving/primary account's value, and do not block the merge. Decide explicitly; silent `undefined` propagation here loses the second account's IP forever.

### Pattern 10: Metric registry — a union of ids, a record of descriptors, and an i18n hazard

**Shape (satisfies D-15's six fields):**

```ts
export type MetricId =
  | 'mrr' | 'arr' | 'activeKeys' | 'arpu' | 'arppu' | 'coverage'
  | 'ltvGrossHistorical' | 'ltvGrossPredictive' | 'ltvNet' | 'predictiveChurnRate'
  | 'grossMargin' | 'marginPct' | 'costPerKey'
  | 'burnPerDay' | 'runwayDays'
  | 'renewalRate' | 'logoChurnRate' | 'revenueChurnRate'
  | 'funnelPending' | 'funnelPaid' | 'funnelProvisioning' | 'funnelProvisioned'
  | 'funnelConversion' | 'expiredCount'
  | 'timeToPayMedian' | 'timeToPayMean'
  | 'timeToProvisionMedian' | 'timeToProvisionMean';

export interface MetricDescriptor {
  id: MetricId;
  /** i18n key resolved via t() — see the i18n hazard below. */
  labelKey: string;
  formula: string;
  sources: readonly ('orders' | 'users' | 'ticketCompensations' | 'dailyMetrics'
                   | 'artemidaBalance' | 'artemidaKeys' | 'referralClicks')[];
  direction: 'up-good' | 'up-bad' | 'neutral';
  kind: 'flow' | 'stock';
  unit: 'rub' | 'count' | 'ratio' | 'days' | 'pct';
  limitations: string;
}

export const METRIC_REGISTRY: Record<MetricId, MetricDescriptor> = { /* … */ };
```

**Why `sources[]` matters beyond documentation:** it is what makes D-05's `incomparable` computable generically. A metric whose `sources` include an external one (`artemidaBalance`, `artemidaKeys`) is affected by degraded events for that source; a metric derived purely from `orders` is not. This is exactly the `PROVIDER_SOURCED_COLUMNS` map from Pattern 7 expressed at the metric level — build them so one derives from the other, not two hand-maintained lists.

**⚠️ The i18n unused-key scan will fail on a registry-held `labelKey`.** `[VERIFIED: tests/unit/i18n.test.ts:37-58]` the scan collects keys only from literal calls:

```ts
  // Widen the params argument: t('key') AND t('key', { n }) / t("key", params).
  const re = /\bt\(\s*['"]([A-Za-z0-9_.]+)['"][^)]*\)/g;
  // Plural calls resolve a <base>One/Few/Many triplet, never the bare base.
  const rePlural = /\btp\(\s*['"]([A-Za-z0-9_.]+)['"]/g;
```

and then, at `[VERIFIED: tests/unit/i18n.test.ts:76-80]`:

```ts
  it('dictionary has no unused keys', () => {
    const used = new Set(collectUsedKeys());
    const unused = allKeys().filter((k) => !used.has(k));
    expect(unused, `unused i18n keys: ${unused.join(', ')}`).toEqual([]);
  });
```

A registry value `labelKey: 'admin.analyticsMrr'` rendered as `t(descriptor.labelKey)` means the literal `t('admin.analyticsMrr')` disappears from source → the key becomes "unused" → **the test fails**. Two viable fixes:

- **(i) Recommended:** extend `collectUsedKeys()` with a second regex for registry descriptors — e.g. `/\blabelKey:\s*['"]([A-Za-z0-9_.]+)['"]/g` — applied to all scanned files (or restricted to `lib/analytics/metric-registry.ts` to avoid over-collecting). Keeps D-15's "labels come from the registry" literal. Adds one small, well-scoped change to a security-neutral test.
- **(ii) Zero-test-change fallback:** keep a literal `switch` in a `metricLabel(id)` function (the established Phase 9 pattern for funnel step labels — a `Record` map failed the same scan). The registry then holds only non-label metadata, which **violates D-15** ("подпись … из реестра"). Acceptable only if the user downgrades D-15.

**Also note:** the existing admin labels are already literal, e.g. `[VERIFIED: components/admin/AnalyticsKpi.tsx:49]` `label={t('admin.analyticsMrr')}`. Migrating them to the registry is the "постепенная миграция vs параллельные константы" discretion item. Recommendation: introduce the registry now with full descriptors, migrate the **KPI row** in this phase (six ids), and leave the other blocks reading their literal keys until Phase 16 — a partial migration that never has two sources of truth *for the same card*.

### Pattern 11: Cron — the 3-day retry is mostly already there

**Current behaviour** `[VERIFIED: app/api/cron/analytics/route.ts:45-51]`:

```ts
  const now = new Date();
  const toDay = mskDayLabel(new Date(now.getTime() - 86_400_000));
  const fromDay = mskDayLabel(new Date(now.getTime() - 7 * 86_400_000));

  const { rollupDays } = await import("../../../../lib/analytics/rollup");
  const result = await rollupDays(fromDay, toDay);
```

The run already re-rolls **today-7 … yesterday**, which strictly contains the last 3 MSK days. So D-09's "перепроверяет последние 3 MSK-дня с открытым событием" is **subsumed**. The real work D-09 implies is:

1. **Close** open events after a healthy read for that day (otherwise every past event stays open forever and D-10 reports "неполные" on windows that were later repaired).
2. **Leave events older than 3 days open** and hand them to `scripts/backfill-analytics.ts` — i.e. the cron must not close an event it did not actually verify. Since the roll runs a superset of the 3-day window, define closure precisely: close an event when a run *that included that day* completed with `balance === 'ok'` and no new degraded event for that day was recorded.
3. **Add the retention sweep** (D-13): `deleteMany({ where: { createdAt: { lt: thirteenMonthsAgo } } })` on `referral_clicks`, in the same route, after the rollup. Compute `thirteenMonthsAgo` with `addMonths`-style math on a day label, not `setMonth` (month-length drift) — `[VERIFIED: lib/analytics/time.ts]` already provides `addMonths(label, n)` as pure string math for first-of-month labels; for a rolling 13-month cutoff use `mskDayLabel` of a `Date` shifted by whole days or derive `addMonths(currentMonthLabel, -13)` and document the exact day granularity chosen.

**Cron schedule** `[VERIFIED: docs/DEPLOY.md:150-153]`: analytics at `5 3 * * *`, rfm at `10 3 * * *`. No new cron entry is needed unless the retention sweep is split out; recommend keeping it in the analytics route so there is one nightly job to reason about.

### Anti-Patterns to Avoid

- **`partial`.** Superseded by D-05. Do not implement it, do not test for it.
- **Read-then-write guard.** `if (await rowExists(day)) skip` opens a TOCTOU window and breaks the existing 12-concurrent-run invariant.
- **A `degraded` boolean on `daily_metrics`.** D-07 forbids it; it also makes every consumer responsible for remembering to check it.
- **Recording quality events inside `lib/artemida.ts`.** Money path + DB write + outage = write storm.
- **`Date.now()` inside `windows.ts`.** Take `now` as a parameter; otherwise the two windows can straddle midnight and the tests are not deterministic.
- **Applying the upper bound in JS after the query.** Keeps `COUNT(DISTINCT)` denominators wrong and silently inflates `coverageTotal`.
- **Hashing `"direct"`.** D-14 forbids it; it manufactures a fake IP cluster.
- **A second click table for promo.** D-11 forbids it.
- **Two hand-maintained source lists** (`PROVIDER_SOURCED_COLUMNS` and `MetricDescriptor.sources`). Derive one from the other or a new provider column will be forgotten in one of them.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Moscow day math | A new `date-fns-tz`/`luxon` helper, or `Intl.DateTimeFormat` inline | `lib/analytics/time.ts` (`mskDayLabel`, `mskDayStartInstant`, `mskDateKey`, `pgTimestamp`, `addMonths`) | [VERIFIED: lib/analytics/time.ts] These are hardened against the exact bug that has bitten this repo: `mskDayStartInstant` into a `@db.Date` column stores the previous day; the adapter serializes UTC components. Zero new deps is also locked. |
| Idempotent daily rollup | A "check then insert" or a transaction with a pre-read | `INSERT … ON CONFLICT (day) DO UPDATE` (healthy) / `DO NOTHING` (degraded) | [VERIFIED: lib/analytics/rollup.ts:89-126] Already proven with a 12-concurrent-run test. The conflict action *is* the lock. |
| Point-in-time MRR/ARR/activeKeys | A new query that sums `daily_metrics` for a day | `mrrAt(orders, at)` / `arrAt` / `activeKeysAt` from `lib/analytics/mrr.ts` and `service.ts` | [VERIFIED: lib/analytics/service.ts:169-172] These are derived from the full order history at an instant; `daily_metrics.active_keys` is a rollup value with its own semantics and provider lag. |
| IP hashing / dedupe window | A new dedupe table or a Redis counter | `createHash('sha256')` + the existing hourly `findFirst` dedupe (`referral-stats.ts:42-52`) | The one-hour window is locked by D-12 specifically so promo numbers stay comparable with accumulated partner clicks. |
| Percent-delta formatting | Per-card `toFixed` calls | One `formatDelta(MetricDelta)` in the delta module | Ten cards will otherwise disagree on rounding, sign, and the "нет базы" case. |
| Degraded-retry orchestration | A job queue / BullMQ | The existing cron + `p-retry` inside the client | [CITED: .planning/research/STACK.md] No Redis on the single server; retries are already in the client. |
| Feature flags / thresholds | A new settings table | `Setting` KV (already exists) | Only if needed; D-10 says no thresholds. |

**Key insight:** every piece of this phase that *looks* like it needs new machinery (date math, idempotency, dedupe, retry) already has a hardened in-repo implementation with a regression test attached. The only genuinely new machinery is the append-only quality log and its write-guard, and even that reuses the `DO NOTHING` pattern already shipped for balance snapshots.

## Common Pitfalls

These are the ones **not** already covered by `.planning/research/PITFALLS.md` (which already covers partial-day comparison, absolute-value overwrite, `windowStartDay` including today, and `clientIp() === "direct"`). Read those four first; the below are additional.

### Pitfall 1: Excluding today changes *two* boundaries and every test that asserted "includes today"

**What goes wrong:** A plan that only edits `windowStartDay` ships green and produces windows that still include today, because the loaders never had an upper bound. Worse, some existing tests assert window identity via `fromInstant` — e.g. `[VERIFIED: tests/unit/analytics-phase8-loaders.test.ts:602]` `// Window identity: same fromInstant as loadKpis(30).`

**Why it happens:** `fromInstant` was the whole window definition. There was no end.

**How to avoid:** Grep every `paidAt: { gte` / `createdAt: { gte` inside `lib/analytics/*` plus raw SQL with `>= ${pgTimestamp(`. Each one needs an `lt`. Then run the full suite and expect failures in `analytics-phase8-loaders`, `analytics-phase9-loaders`, `analytics-phase10-loaders`, `analytics-phase11-loaders`, `admin-analytics-phase9-contract`, `analytics-cron-route`, and `analytics-backfill`. Decide per test whether it was asserting the *old* inclusive-today semantics (update it) or the *derivation* (keep it).

**Warning signs:** A loader whose signature still has no `endExclusive` parameter; a test that passes only `period`.

### Pitfall 2: One `now` per page render, or the two windows disagree

**What goes wrong:** Current window built at `t0`, base window built at `t0 + 40ms` that crosses MSK midnight → a one-day gap or a one-day overlap, and the delta is off by a day of revenue.

**Why it happens:** `windowStartDay()` reads `Date.now()` internally.

**How to avoid:** Derive both windows from a single `now` argument, computed once in the page/cron. Never call `Date.now()` twice in the comparison path.

**Warning signs:** Two `new Date()` calls in the same render path; `windows.ts` importing nothing but `time.ts` and still having a `Date.now()` in it.

### Pitfall 3: The payers raw SQL keeps a `gte`-only bound

**What goes wrong:** ARPPU's denominator (`[VERIFIED: lib/analytics/service.ts:151-156]`) still counts today's payers while the numerator excludes them. ARPPU looks like it *fell*, and the MoM delta inherits the error.

**Why it happens:** It is a `$queryRaw` template, not a `findMany` with typed args — a `grep` for `paidAt:` misses it.

**How to avoid:** Convert to `AND paid_at >= ${pgTimestamp(fromInstant)} AND paid_at < ${pgTimestamp(endExclusive)}`, and add a unit test that seeds an order *today* and asserts it is absent from both the numerator and the denominator.

**Warning signs:** A code review comment "why is ARPPU down?" after the change.

### Pitfall 4: Stock metrics get a flow delta and the dashboard lies confidently

**What goes wrong:** MRR shown with "+₽120 000 за 30 дней" computed as `sum(daily mrr)` — a number with no meaning.

**Why it happens:** Every card gets the same delta prop, so the path of least resistance is to delta whatever number is on the card.

**How to avoid:** `MetricDescriptor.kind` decides. Stock → `mrrAt(endExclusive)` on both sides, and the delta label carries the two dates ("на 30 окт vs на 30 сен"), not "за период".

**Warning signs:** A delta subtitle on an MRR card that says "за 30 дней".

### Pitfall 5: `incomparable` computed from a window that was later repaired

**What goes wrong:** A degraded event from three weeks ago was repaired by a later healthy rollup, but the event row is still `open`. Every 30-day window that touches that day is permanently `incomparable` — and the admin loses trust in the flag rather than the data.

**Why it happens:** Append-only log + no closure discipline.

**How to avoid:** D-09's closure step is not optional. Two tests: (a) a healthy re-roll closes the open event; (b) an event older than the retry window stays open (so the UI keeps flagging it until a human backfills). Then `quality.ts` counts only `open` events — never all events — when deciding `incomparable`.

**Warning signs:** `incomparable` count never decreases after a successful backfill.

### Pitfall 6: `ownerUserId` nullable silently inflates the admin referral funnel

**What goes wrong:** Detailed in Pattern 8. `funnelStats`'s global branch has `ownerFilter = {}` (`[VERIFIED: lib/referral-stats.ts:71-72]`), so promo clicks join the referral click count.

**Why it happens:** The scope filter was written when every row was a referral row.

**How to avoid:** Add `kind: 'referral'` to the click count and a regression test that inserts one `kind: 'promo'` row and asserts the global funnel's `clicks` is unchanged.

**Warning signs:** Referral click counts jump on the day promo capture ships, with no traffic change.

### Pitfall 7: Hash written on a losing trial claim

**What goes wrong:** A user loses the `updateMany` race (count 0) but their IP hash was written anyway by a separate `UPDATE`, attributing a trial attempt to an account that never claimed.

**Why it happens:** Two statements instead of one.

**How to avoid:** Include `trialIpHash` in the *same* `updateMany` `data`. Assert in a test that a second claim attempt with a different IP leaves the original hash untouched.

**Warning signs:** Two Prisma calls in `claimTrial`.

### Pitfall 8: Migration order and the `DateTime @id @db.Date` key

**What goes wrong:** The new `data_quality_events.day` is declared `DateTime` (a `timestamp`) instead of `@db.Date`, or a `@db.Date` value is written with `mskDayStartInstant` instead of `mskDateKey` — storing the previous day for every event.

**Why it happens:** The two helpers differ by exactly one day and both return `Date` (`[VERIFIED: lib/analytics/time.ts]` — "They differ by one day").

**How to avoid:** `day DateTime @db.Date` + `mskDateKey(dayLabel)` on every write; a round-trip test that writes for `"2026-10-31"` and reads back `"2026-10-31"`. Also: name the migration directory with a timestamp sorting **after** `20261031113119_phase11_user_rfm`.

**Warning signs:** Every quality event appears one day early in the UI.

### Pitfall 9: The i18n test fails on registry-driven labels (see Pattern 10)

**What goes wrong:** `next build` is fine; `vitest run tests/unit` fails with `unused i18n keys: admin.analyticsMrr, …`.

**Why it happens:** The scan only sees literal `t('…')` call sites.

**How to avoid:** Pick one of the two documented options (extend the scan, or literal switch) **in the same task that introduces the registry** — not in a follow-up, or the branch is red.

**Warning signs:** A registry landing with a red `i18n.test.ts`.

### Pitfall 10: The retention sweep deletes by `createdAt` in the wrong timezone

**What goes wrong:** "13 months" computed as `new Date(Date.now() - 13*30*86400000)` deletes ~5 days too much (or too little). Or the sweep uses `createdAt < mskStartInstant(cutoff)` and shifts by three hours.

**Why it happens:** `createdAt` is a UTC `timestamp(3)`; the retention boundary is a policy date, not an MSK calendar day.

**How to avoid:** Compute the cutoff instant once, in JS, with an explicit, documented rule (recommend: calendar months via `addMonths` on the month label, then `mskDayStartInstant` of that day), and test it by seeding one row just inside and one just outside the boundary. Deletion is irreversible — the test is the only guard.

**Warning signs:** "Why did click history drop by a week."

## Code Examples

Verified patterns from in-repo sources. Sources are line-cited; the code is a recommended shape, not a verbatim copy.

### E1 — Comparison windows: pair derivation with today excluded (D-04)

```ts
// lib/analytics/windows.ts — PURE: no prisma, no next/*, no Date.now()
import { mskDayLabel, mskDayStartInstant } from './time';

const DAY_MS = 86_400_000;

export interface Window {
  fromDay: string;      // inclusive MSK day label
  toDay: string;        // inclusive MSK day label
  fromInstant: Date;    // timestamp(3) `gte`
  endExclusive: Date;   // timestamp(3) `lt` — the day AFTER toDay starts
}

function dayBack(fromDay: string, n: number): string {
  return mskDayLabel(new Date(mskDayStartInstant(fromDay).getTime() - n * DAY_MS));
}

function windowOf(toDay: string, length: number): Window {
  const fromDay = dayBack(toDay, length - 1);
  const endExclusive = mskDayStartInstant(mskDayLabel(
    new Date(mskDayStartInstant(toDay).getTime() + DAY_MS),
  ));
  return { fromDay, toDay, fromInstant: mskDayStartInstant(fromDay), endExclusive };
}

/** Last complete MSK day (D-04: today's partial day is never in either window). */
export function lastCompleteDay(now: Date): string {
  return mskDayLabel(new Date(now.getTime() - DAY_MS));
}

export function comparisonWindows(
  period: 7 | 30 | 90,
  now: Date,
): { current: Window; base: Window } {
  const currentEnd = lastCompleteDay(now);
  const current = windowOf(currentEnd, period);
  // Adjacent equal-length window (see Open Question Q1 for the MoM alternative).
  const baseEnd = dayBack(current.fromDay, 1);
  const base = windowOf(baseEnd, period);
  return { current, base };
}
```

### E2 — Flow delta with the three locked states (D-03, D-05)

```ts
// lib/analytics/compare.ts — PURE
export type MetricDelta =
  | { status: 'ok'; abs: number; pct: number | null; current: number; base: number }
  | { status: 'no-base'; abs: number; pct: null; current: number; reason: 'zero' | 'absent' }
  | { status: 'incomparable'; reason: 'degraded-base' | 'degraded-current' | 'coverage' };

export function compareFlow(current: number, base: number | null, opts: {
  incomparable?: boolean; incomparableReason?: 'degraded-base' | 'degraded-current' | 'coverage';
} = {}): MetricDelta {
  if (opts.incomparable) {
    return { status: 'incomparable', reason: opts.incomparableReason ?? 'coverage' };
  }
  if (base === null) {
    return { status: 'no-base', abs: current, pct: null, current, reason: 'absent' };
  }
  if (base === 0) {
    return { status: 'no-base', abs: current, pct: null, current, reason: 'zero' };
  }
  const abs = current - base;
  return { status: 'ok', abs, pct: abs / base, current, base };
}
```

`pct` is a fraction, not a percent — formatting (sign, one decimal, `%`) belongs in one `formatDelta` helper so ten cards cannot disagree.

### E3 — Degrade classifier covering the full `ArtemidaCode` union plus non-provider throws

```ts
// lib/analytics/quality.ts — PURE
import { ArtemidaError } from '../artemida';

export type DegradedReason =
  | 'unauthorized' | 'payment_required' | 'rate_limited'
  | 'bad_gateway' | 'unavailable' | 'server_error' | 'network';

export function classifyDegraded(err: unknown): DegradedReason | null {
  if (!(err instanceof ArtemidaError)) {
    // pRetry surfaces network failures (DNS, ECONNRESET, abort) as plain errors.
    return 'network';
  }
  switch (err.code) {
    case 'unauthorized':     return 'unauthorized';
    case 'payment_required': return 'payment_required';
    case 'rate_limited':     return 'rate_limited';   // post-retry exhaustion only
    case 'bad_gateway':      return 'bad_gateway';
    case 'unavailable':      return 'unavailable';
    case 'unknown':
      // 500/504 map to "unknown" (lib/artemida.ts mapStatus default branch).
      // A 200 + schema mismatch is deliberately NOT degraded (D-06).
      return err.status >= 500 ? 'server_error' : null;
    case 'not_found':
    case 'conflict':
      return null;   // business outcomes, not data-quality events (D-06)
  }
}
```

**Note:** `RETRYABLE` (`rate_limited`/`bad_gateway`/`unavailable`) is exhausted before this classifier ever sees them, because `pRetry` re-throws only after the last attempt. So `classifyDegraded` observing one of those three means "retries exhausted" by construction — do not add a retry counter.

### E4 — Write-guard: one loop, two conflict actions (D-08)

```ts
// lib/analytics/rollup.ts — guarded variant of the existing loop
const degradedDays = await openDegradedDays(fromDay, toDay, source);   // Set<string>

for (const a of series) {
  const guarded = degradedDays.has(a.day);
  const conflict = guarded
    ? sql`ON CONFLICT (day) DO NOTHING`   // degraded run never overwrites a healthy row
    : sql`ON CONFLICT (day) DO UPDATE SET
        paid_orders = EXCLUDED.paid_orders,
        /* … the existing 11 assignments, unchanged … */
        computed_at = now()`;
  // The conflict clause is a literal chosen per day, never interpolated user data.
  upserted += await prisma.$executeRaw(...);
}
```

Two constraints on the implementation:

- The two statements must stay **separate `$executeRaw` templates** (a template cannot parameterize a conflict clause). Build them as two module-level template functions and pick one — do not concatenate SQL strings.
- `openDegradedDays` must filter on **open** events only (Pitfall 5), and on the same `source` as the run.

### E5 — Generalized click capture with the `"direct"` guard

```ts
// lib/referral-stats.ts — generalized from the existing recordClick
export interface ClickInput {
  kind: 'referral' | 'promo';
  ownerUserId?: number | null;   // null for generic promo codes (D-11)
  promoCodeId?: string | null;
  code: string | null;
  ip: string;
  source: string;
}

export async function recordClick(input: ClickInput): Promise<boolean> {
  const ipHash = hashClientIp(input.ip);
  if (ipHash === null) return false;               // D-14: "direct" is never recorded as a hash
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);   // D-12: 1 hour, unchanged
  const recent = await prisma.referralClick.findFirst({
    where: { ipHash, kind: input.kind, createdAt: { gt: hourAgo } },
    select: { id: true },
  });
  if (recent) return false;
  await prisma.referralClick.create({
    data: {
      kind: input.kind,
      ownerUserId: input.ownerUserId ?? null,
      promoCodeId: input.promoCodeId ?? null,
      code: input.code,
      ipHash,
      source: input.source.slice(0, 32),           // existing column-width guard
    },
  });
  return true;
}
```

The dedupe predicate changes from `{ ownerUserId, ipHash }` (`[VERIFIED: lib/referral-stats.ts:44-47]`) to `{ ipHash, kind }` — scoping by kind is what keeps a promo click from suppressing the same IP's referral click (and vice versa). **Verify this does not break `recordClick`'s existing callers** in `app/api/referrals/click/route.ts`; the route must pass `kind: 'referral'` and the resolved `ownerUserId`.

### E6 — Atomic trial IP capture

```ts
// lib/keys-service.ts — one statement, hash written iff the claim is won
export async function claimTrial(
  telegramId: bigint,
  ipHash?: string | null,
): Promise<boolean> {
  const { count } = await prisma.user.updateMany({
    where: { telegramId, trialUsed: false },
    data: {
      trialUsed: true,
      ...(ipHash ? { trialIpHash: ipHash } : {}),   // null/undefined → column stays NULL
    },
  });
  return count === 1;
}
```

`ipHash ? … : {}` (not `trialIpHash: ipHash`) keeps the column untouched when the caller has no real IP, rather than writing an explicit `NULL` over a value another path may have set.

### E7 — Registry-driven KPI card

```tsx
// components/admin/AnalyticsKpi.tsx — after the registry lands
const d = METRIC_REGISTRY.mrr;
<MetricCard
  size="hero"
  label={t(d.labelKey)}
  value={formatRub(kpis.mrr)}
  sub={deltaSubtitle(d, mrrDelta)}   // e.g. «на 30 окт vs 30 сен» for a stock metric
  delta={mrrDelta}
  quality={qualityFor('mrr')}
/>
```

`MetricCard`'s current props are `{ label, value, sub, size }` (`[VERIFIED: components/admin/MetricCard.tsx:15-25]`), so `delta` and `quality` are **additive optional** — D-01's "все существующие отчёты наследуют одну подачу без переписывания блоков" holds: no existing call site changes.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Window = "last N days ending today", `gte`-only | Window = "last N complete MSK days", `gte` + `lt`, derived from one `now` | Phase 12 (D-04) | Every windowed loader and its tests change; deltas become honest. |
| `daily_metrics` written by unconditional absolute upsert | Conflict action chosen per run (`DO UPDATE` healthy / `DO NOTHING` degraded) | Phase 12 (D-08) | A degraded provider read can never launder a good row. |
| Quality inferred from "the number looks low" | Explicit append-only `data_quality_events` with reasons, closure, and UI badges | Phase 12 (D-06/D-07/D-10) | False-positive-free by design (D-06 excludes "suspiciously empty"). |
| Click funnel only for partner codes (`ownerUserId NOT NULL`) | One table, `kind` discriminator, one funnel for partner + promo | Phase 12 (D-11) | Phase 14 unions nothing; ROI is a single-table query. |
| No account IP signal | `signupIpHash` + `trialIpHash`, `"direct"` never hashed | Phase 12 (D-14) | Fraud clustering becomes possible *forward-only* — hence the urgency. |
| Metric labels hardcoded per block | `lib/analytics/metric-registry.ts` as the id/label/formula/source contract | Phase 12 (D-15) | Phase 16 dictionary test becomes mechanical. |

**Deprecated/outdated in this phase:**
- `windowStartDay()` as a private, `Date.now()`-reading helper — replaced by `windows.ts`.
- The `hashIp("direct")` sentinel — replaced by `hashClientIp → null`.
- Roadmap SC-3's `partial` state — superseded by D-05's `incomparable`.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | MoM for `?period=30` means the **adjacent equal-length 30-day window**, not the previous calendar month | Pattern 1 / Q1 | Calendar-month comparison produces unequal bucket lengths (28–31 vs 30 days), which PITFALLS #3 flags as a delta-distorting comparison; switching later changes every MoM number on the dashboard. Needs user confirmation. |
| A2 | SC-7 ("v1.1 values do not change") means **derivation identity given identical bounds**, not "no displayed number ever moves" | Open Question Q2 | If read literally, it contradicts D-04 (windows now end yesterday). The planner must write the regression test against `derivation identity`, and the verifier must accept shifted numbers. |
| A3 | The write-guard's degraded-day set can be forced in tests without a live ARTEMIDA outage | Pattern 7 | If the only way to test the guard is a real provider failure, the branch is effectively untested and SC-5 is unverifiable. The plan must add an injectable seam (`forceDegraded` flag or injected `getBalance` stub). |
| A4 | `ArtemidaError('unknown', 200)` (schema mismatch) is **not** a degraded event | Pattern 5 / Q3 | If the user wants it flagged, the classifier gains a branch and the UI badge may fire on provider contract drift rather than outages. |
| A5 | Promo clicks are captured on a **landing surface that does not exist yet** | Pattern 8 / Q4 | Without a new capture component, PRM-01 has no data source at all and Phase 14 ships empty. The scope of this phase grows by one client component. |
| A6 | `trialIpHash` survives `releaseTrialOnFailure*` (the hash records the attempt, not the success) | Pattern 9 / Q5 | If cleared, a failed trial attempt leaves no IP signal — the exact fraud case PRM-04 targets. |
| A7 | Account merge keeps one side's `trialIpHash` rather than reconciling both | Pattern 9 / Q5 | Losing the second account's IP forever; not recoverable after the merge. |
| A8 | The retention cutoff is computed as 13 **calendar months** in MSK terms | Pattern 11 / Q6 | Using 13×30 days changes the deletion boundary by up to 5 days — irreversible data loss difference. |
| A9 | The i18n scan may be extended with a `labelKey:` regex (option i) | Pattern 10 / Q7 | If extending a test is unacceptable, D-15's "labels from the registry" cannot be met and the user must downgrade the decision. |
| A10 | `funnelStats`'s global branch should filter `kind: 'referral'` | Pattern 8 | Without it the admin referral funnel silently inflates the day promo capture ships; no test catches it by default. |

## Open Questions

1. **MoM definition: adjacent equal-length window vs calendar month (A1).** D-02 says "30 → предыдущий месяц". Two readings: (a) the 30 complete days before the current 30, (b) the previous calendar month (e.g. current = 1–30 Oct → base = 1–30 Sep). What we know: SC-2 says "два соседних периода", and PITFALLS #3 requires equal bucket lengths. Recommendation: (a), and label the card with the actual date ranges so the admin can see what is compared. Planner must pin it explicitly in the plan, not leave it to the executor.

2. **SC-7 vs D-04 (A2).** ROADMAP SC-7 presumably asserts v1.1 numbers are unchanged; D-04 changes the window. Recommendation: interpret SC-7 as "the derivation from a given window is unchanged" (same `buildDailySeries`, same `cashOf`, same `mrrAt`), and prove it with a test that pins bounds and compares v1.1-era outputs. The displayed number *will* move by one day — the verifier must be told not to flag that as a regression.

3. **Is `ArtemidaError('unknown', 200)` degraded? (A4)** Recommendation: no (D-06's false-positive defence). Needs a one-line confirmation.

4. **Where do promo clicks originate? (A5)** No capture surface exists for promo codes today (`components/PromoField.tsx` is a typed input, `components/RefCapture.tsx` is referral-only). Recommendation: add a `PromoCapture` browser component on the landing route that reads `?promo=`, resolves the code server-side (or posts the raw code and resolves in the route), and beacons to the click route — always 200, no oracle (never reveal whether a code exists).

5. **`releaseTrialOnFailure*` and account merge semantics for `trialIpHash` (A6/A7).** Recommendation: keep on release; on merge keep the earlier non-null. Needs explicit sign-off because both are forward-only decisions.

6. **Retention cutoff arithmetic (A8).** Recommendation: 13 calendar months computed from the MSK month label via `addMonths(label, -13)`, then `mskDayStartInstant` of that day as the `lt` boundary. Test with rows one day either side.

7. **Registry labels vs the i18n scan (A9).** Recommendation: extend `collectUsedKeys()` with a registry-scoped `labelKey:` regex. Fallback: literal `metricLabel(id)` switch (Phase 9 precedent) — but that is a D-15 downgrade and needs user approval.

8. **Does the degraded-event `source` vocabulary need to be enumerable?** `data_quality_events.source` as a free string is flexible but makes `openDegradedDays(from,to,source)` typo-prone. Recommendation: a `const DEGRADED_SOURCES = ['artemida.balance', 'artemida.keys'] as const` union in `quality.ts`, stored as text.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | All | ✓ | 24 LTS ([CITED: .planning/research/STACK.md]; local env v24.15.0) | — |
| PostgreSQL | DB-backed rollup/cron/click tests, migration | ✓ | 17 ([CITED: .planning/research/STACK.md]) | — |
| `vitest` | All tests | ✓ | in lockfile | — |
| `prisma` CLI | `migrate dev` / `migrate deploy` | ✓ | `^7.10` | — |
| `tsx` | `scripts/backfill-analytics.ts` | ✓ | in devDeps | — |
| ARTEMIDA API (live) | **Not required** — every test must stub `fetch` or inject a fake client | ✗ by design | — | Inject `ArtemidaClientOptions.fetch` (`[VERIFIED: lib/artemida.ts:52-56]`) or stub `getBalance`; `vitest.config.ts` sets `ARTEMIDA_BASE_URL: 'https://artemida.test/v1'` |
| Cron scheduler (host) | Nightly run in prod only | n/a locally | — | Invoke `POST /api/cron/analytics` with `x-cron-secret` in a test, as `analytics-cron-route.test.ts` already does |
| Docker / nginx | Deploy only | n/a | — | Not needed for phase verification |

**Missing dependencies with no fallback:** none.

**Missing dependencies with fallback:** live ARTEMIDA — deliberately stubbed; the phase must not require a provider outage to exercise the degraded path (see A3).

## Validation Architecture

`workflow.nyquist_validation` is `true` in `.planning/config.json`, so this section is required.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest (in lockfile; no new dep) |
| Config file | `vitest.config.ts` — `include: ['tests/**/*.test.ts']`, `environment: 'node'`, `fileParallelism: false`, `@/` alias |
| Quick run command | `npx vitest run tests/unit/analytics-time.test.ts tests/unit/analytics-series.test.ts` (pure, no DB, < 2s) |
| Full suite command | `npm test` → `vitest run tests/unit` (real local Postgres required; ~6s per the config comment) |

**Two existing conventions the new tests must follow:**

1. **DB loader tests use the "identity pattern":** re-run the loader's own `WHERE`/`SELECT` against seeded rows and assert the loader's output equals that, rather than asserting a hand-computed number. See `tests/unit/analytics-phase8-loaders.test.ts` / `analytics-phase9-loaders.test.ts`.
2. **The cron test spies rather than re-implements:** `[VERIFIED: tests/unit/analytics-cron-route.test.ts]` uses `vi.mock(import(...), { spy: true })` on `rollupDays` and asserts the *window labels* passed plus idempotency. Phase 12's new cron behaviour (3-day retry, closure, retention) should be asserted the same way — assert the arguments and the calls, and test the effects in the rollup/click tests directly.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| ALR-01 | `comparisonWindows(7|30|90, fixedNow)` returns the exact two windows; today is in neither | unit (pure) | `npx vitest run tests/unit/analytics-windows.test.ts` | ❌ Wave 0 |
| ALR-01 | Windows for 7/30/90 are equal-length and adjacent with no gap/overlap | unit (pure) | same file | ❌ Wave 0 |
| ALR-01 | `compareFlow` → `ok` / `no-base(zero)` / `no-base(absent)` / `incomparable`; no `0%`, no `∞` | unit (pure) | `npx vitest run tests/unit/analytics-compare.test.ts` | ❌ Wave 0 |
| ALR-01 | `loadKpis` excludes an order paid **today** from window cash, coverage, and the payers denominator | integration (real DB) | `npx vitest run tests/unit/analytics-phase12-loaders.test.ts` | ❌ Wave 0 |
| ALR-01 | Stock metrics compare `mrrAt(endExclusive)` on both sides, not summed flows | unit + integration | same as above | ❌ Wave 0 |
| ALR-01 | Delta renders inside `MetricCard` without changing existing call sites (props optional) | contract (source-string) | `npx vitest run tests/unit/admin-analytics-phase12-contract.test.ts` | ❌ Wave 0 |
| ALR-01 | v1.1 regression: given pinned bounds, derivation output is byte-identical to pre-change | regression (real DB) | `npx vitest run tests/unit/analytics-v11-regression.test.ts` | ❌ Wave 0 |
| EXT-05 | `classifyDegraded` covers 401/402/429/502/503/500/504/network and rejects 404/409/`unknown@200` | unit (pure) | `npx vitest run tests/unit/analytics-quality.test.ts` | ❌ Wave 0 |
| EXT-05 | Healthy rollup overwrites; **degraded rollup leaves a pre-seeded healthy row untouched** | integration (real DB) | `npx vitest run tests/unit/analytics-rollup-guard.test.ts` | ❌ Wave 0 |
| EXT-05 | Degraded rollup on a **missing** day still inserts a row (no hole) and records an event | integration (real DB) | same file | ❌ Wave 0 |
| EXT-05 | 12 concurrent runs still leave exactly one absolute row per day (existing invariant preserved) | integration (real DB) | `npx vitest run tests/unit/analytics-rollup.test.ts` | ✅ (extend) |
| EXT-05 | In-window open events → `incomparable` + count N; a closed event no longer flags | unit (pure) + integration | `tests/unit/analytics-quality.test.ts` | ❌ Wave 0 |
| EXT-05 | Cron closes an event after a healthy re-roll; leaves >3-day-old events open | integration | `npx vitest run tests/unit/analytics-cron-route.test.ts` | ✅ (extend) |
| (PRM-01 base) | Promo click writes `kind='promo'`, `promoCodeId`, `ownerUserId=null`; same IP within 1 h dedupes | integration (real DB) | `npx vitest run tests/unit/referral-clicks.test.ts` | ❌ Wave 0 |
| (PRM-01 base) | Global `funnelStats` click count ignores `kind='promo'` rows | integration (real DB) | same file | ❌ Wave 0 |
| (PRM-01 base) | `ip === "direct"` records nothing and returns 200 from the route | unit + contract | `npx vitest run tests/unit/client-ip.test.ts` (extend) | ✅ (extend) |
| (PRM-04 base) | Register writes `signupIpHash`; `"direct"` → `null` | integration | `npx vitest run tests/unit/analytics-ip-capture.test.ts` | ❌ Wave 0 |
| (PRM-04 base) | Trial claim writes `trialIpHash` atomically; a losing re-claim with a different IP does not overwrite | integration | `npx vitest run tests/unit/trial-claim.test.ts` (extend) | ✅ (extend) |
| (D-15) | Every `MetricId` has a registry entry with all seven fields non-empty | unit (pure) | `npx vitest run tests/unit/metric-registry.test.ts` | ❌ Wave 0 |
| (D-15) | `i18n.test.ts` passes with registry-held labels | existing | `npx vitest run tests/unit/i18n.test.ts` | ✅ (must stay green) |
| (D-13) | Retention sweep deletes rows older than the cutoff, keeps rows inside | integration | `npx vitest run tests/unit/referral-clicks.test.ts` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** the pure suites for whatever module the task touched — `npx vitest run tests/unit/analytics-windows.test.ts tests/unit/analytics-compare.test.ts tests/unit/analytics-quality.test.ts tests/unit/metric-registry.test.ts` (no DB, seconds).
- **Per wave merge:** `npx vitest run tests/unit/analytics-*.test.ts tests/unit/admin-analytics-*.test.ts tests/unit/trial-*.test.ts tests/unit/i18n.test.ts` — catches the D-04 blast radius immediately.
- **Phase gate:** `npm test` (full suite, green) before `/gsd-verify-work`. The suite is small (~6s) — there is no reason to skip it.
- **Always:** `npm run build` once before the gate — `next build` is the only thing that typechecks RSC/page/route files, and the registry/label wiring touches them.

### Wave 0 Gaps

- [ ] `tests/unit/analytics-windows.test.ts` — window pair derivation, today excluded, equal lengths, adjacency, 7/30/90
- [ ] `tests/unit/analytics-compare.test.ts` — `compareFlow` all four outcomes; percent formatting helper
- [ ] `tests/unit/analytics-quality.test.ts` — classifier taxonomy + in-window open-event summary
- [ ] `tests/unit/analytics-rollup-guard.test.ts` — healthy-overwrites / degraded-preserves / degraded-inserts-into-hole / concurrency
- [ ] `tests/unit/analytics-phase12-loaders.test.ts` — upper bound present in every windowed loader (incl. the payers raw SQL)
- [ ] `tests/unit/analytics-v11-regression.test.ts` — SC-7 derivation identity under pinned bounds
- [ ] `tests/unit/referral-clicks.test.ts` — promo kind, hourly dedupe, `"direct"` rejection, funnel-scope isolation, retention sweep
- [ ] `tests/unit/analytics-ip-capture.test.ts` — register `signupIpHash`, trial `trialIpHash` atomicity, merge/release semantics
- [ ] `tests/unit/metric-registry.test.ts` — every id fully described; `kind`/`direction`/`sources` present
- [ ] `tests/unit/admin-analytics-phase12-contract.test.ts` — `MetricCard` accepts `delta`/`quality` optionally and existing call sites are unchanged
- [ ] **Extend** `tests/unit/analytics-rollup.test.ts`, `tests/unit/analytics-cron-route.test.ts`, `tests/unit/trial-claim.test.ts`, `tests/unit/client-ip.test.ts`, `tests/unit/i18n.test.ts`
- [ ] **Fix** the D-04 fallout in `analytics-phase8-loaders`, `analytics-phase9-loaders`, `analytics-phase10-loaders`, `analytics-phase11-loaders`, `admin-analytics-phase9-contract` (expect failures; decide old-semantics vs derivation per assertion)
- [ ] Framework install: none — vitest is already configured

## Security Domain

`security_enforcement` is `true`, `security_asvs_level` is `1`.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no (this phase adds no auth) | Existing session/Telegram auth untouched; the new beacon is unauthenticated by design, mirroring `app/api/referrals/click` |
| V3 Session Management | no | — |
| V4 Access Control | **yes** — read path only | `requireRole` stays on `/admin/analytics` (page) and any new admin API; the click beacon must not expose data (always 200, no oracle) |
| V5 Input Validation | **yes** | Zod (existing) — validate the click body (`code`, `source`, `promoCodeId`/`code` length caps), and the `?period` param (`7|30|90` only, reject anything else to a default). `source` must keep the `slice(0, 32)` column-width guard. |
| V6 Cryptography | **yes** — hashing only | `node:crypto` `createHash('sha256')` for IPs; never hand-roll, never store raw IPs (D-14). No reversible encoding. |
| V7 Error handling & logging | **yes** | Degraded events must never carry provider payloads or secrets — store `source`, `reason`, an enum-ish `detail`, and nothing from `lib/artemida`'s request headers (`ARTEMIDA_API_KEY`). |
| V8 Data protection | **yes** | New PII-adjacent columns (`signupIpHash`, `trialIpHash`) are one-way hashes of a quasi-identifier; 13-month retention applies to clicks (D-13). No raw IP, ever, in logs either. |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Click-count inflation / endpoint abuse (unauthenticated beacon) | Tampering / DoS | Existing hourly per-`ipHash` dedupe (D-12) + `source.slice(0,32)`; keep "always 200" so the endpoint is not an oracle; consider the existing rate-limit helper if a flood appears (not in scope) |
| CSRF on the beacon | Tampering | Beacon is write-only, unauthenticated, and idempotent-by-dedupe — a forged click only costs a deduped row; no state change for the attacker |
| IP spoofing to poison fraud clusters | Spoofing | `clientIp()` resolves the **last** XFF hop and prefers `X-Real-IP` set by nginx (`lib/client-ip.ts:1-25` documents the CR-02 hardening); the literal `"direct"` is never hashed, so an unproxied request cannot join a cluster |
| SQL injection via the guard | Tampering | The conflict action is a **literal** chosen per day; all values stay parameterized (`$executeRaw` template). Never interpolate `day` into the conflict clause |
| Secret leakage into `data_quality_events.detail` | Information disclosure | Store a reason enum + non-secret context (`status`, `requestId` at most); a test asserting `detail` contains no `ARTEMIDA_API_KEY` value is cheap |
| Admin data exposure via the new beacon | Information disclosure | The beacon resolves codes server-side and returns an unconditional 200 body (no "code exists" signal) |
| Unbounded growth of the quality log / clicks | DoS / resource | D-13 retention on clicks; quality events are low-volume by construction (only post-retry failures) — no retention needed, but note it |
| Tampering with the write-guard by a forged event | Tampering | Events are written only by server code; there is no public write surface. The guard reads events — it never trusts client input |

## Sources

### Primary (HIGH confidence)

All of the following were opened with `Read` in this session; line ranges are cited inline above.

- `lib/analytics/service.ts:106-185` — `windowStartDay` (120-123), `loadKpis` (136-180), `gte`-only query (144), payers raw SQL (151-156), stock-vs-flow split (169-172)
- `lib/analytics/rollup.ts:60-139` — source selects (60-75), absolute `DO UPDATE` (100-113), balance `DO NOTHING` + catch (116-131)
- `lib/artemida.ts:14-133` — `ArtemidaCode` (21-29), `ArtemidaError` (32-42), injectable `fetch`/retry options (52-56), `RETRYABLE` (58-62), `mapStatus` (90-112); no fetch timeout anywhere in the module
- `lib/referral-stats.ts:18-107` — `hashIp` (27-29), `recordClick` dedupe (42-52), `funnelStats` global `ownerFilter = {}` (70-80)
- `lib/client-ip.ts` — `clientIp` resolution order and the `"direct"` fallback (line 28)
- `prisma/schema.prisma` — `User` (23 onward), `PromoCode` (491-507), `ReferralClick` (546-557), `DailyMetric` (600-615), `ArtemidaBalanceSnapshot` (619-627)
- `lib/keys-service.ts:440-499` — `claimTrial` (448-454), `releaseTrialOnFailure` (461-466), `claimTrialByUserId` (475-481), `releaseTrialOnFailureByUserId` (487-492)
- `app/api/cron/analytics/route.ts` — `safeEq` gate, 503-when-unset, 7-day re-roll (45-51)
- `lib/analytics/time.ts` — `MSK_OFFSET_MS`, `mskDayLabel`, `mskDayStartInstant`, `mskDateKey`, `pgTimestamp`, `mskMonthLabel`, `addMonths`
- `components/admin/MetricCard.tsx:15-25` — props `{ label, value, sub, size }`
- `components/admin/AnalyticsKpi.tsx:49-71` — literal `t('admin.analyticsMrr')` call sites
- `tests/unit/i18n.test.ts:37-80` — `collectUsedKeys` regexes (37-55) and the unused-key assertion (76-80)
- `tests/unit/analytics-phase8-loaders.test.ts:602` — "Window identity: same fromInstant as loadKpis(30)"
- `tests/unit/analytics-rollup.test.ts:210-279` — DB-backed rollup tests incl. 12-concurrent-run (245)
- `vitest.config.ts` — include pattern, `fileParallelism: false`, dummy env
- `package.json` — scripts `test` / `build`
- `docs/DEPLOY.md:148-153` — cron schedule (analytics 03:05, rfm 03:10)
- `prisma/migrations/` — newest dir `20261031113119_phase11_user_rfm`

### Secondary (MEDIUM confidence)

- `.planning/research/PITFALLS.md` — partial-day comparison (Pitfall 3 equal bucket lengths), absolute-value overwrite, `windowStartDay` includes today, `clientIp() === "direct"`
- `.planning/research/ARCHITECTURE.md` — layers, seam placement, build order
- `.planning/research/STACK.md` — zero new dependencies; Node 24 / Next 16.3 / Prisma 7.10 / Postgres 17 pins
- `.planning/REQUIREMENTS.md` — ALR-01, EXT-05, milestone D1–D6
- `.planning/phases/12-.../12-CONTEXT.md` — D-01…D-15 (locked)

### Tertiary (LOW confidence)

- None — no web search was needed; this phase is entirely in-repo. All product-shaped ambiguities are recorded in `## Assumptions Log` and `## Open Questions` rather than guessed.

## Metadata

**Confidence breakdown:**

- **Standard stack: HIGH** — no new dependencies; every library claim is a line-cited in-repo file or the already-validated milestone STACK.md.
- **Architecture: HIGH on mechanics, MEDIUM on presentation** — the window math, bound placement, conflict-action guard, capture points, and i18n hazard are all verified against source. The MoM definition, promo-capture surface, and registry/label wiring are product choices the user has not pinned (A1, A5, A9).
- **Pitfalls: HIGH** — Pitfalls 1–4, 6, 7, 9 are derived from specific lines that will break; Pitfalls 5, 8, 10 are derived from the locked decisions' own wording.
- **Test strategy: HIGH** — the framework, run commands, DB requirement, and the two established test conventions are all read from `vitest.config.ts` and existing test files.

**Superseded roadmap wording (must not be implemented):** ROADMAP SC-3's `partial` comparison state is superseded by D-04/D-05 — the only non-numeric state is `incomparable`.

**Research date:** 2026-10-31
**Valid until:** 30 days (in-repo facts are stable; re-check only if `lib/analytics/*` changes before planning)





