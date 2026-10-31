# Phase 11: RFM Segments & Targeting - Research

**Researched:** 2026-10-29
**Domain:** RFM segmentation & targeted broadcasting (admin analytics surface)
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions (from 11-CONTEXT.md)

#### RFM-расчёт (SEG-01)

- **D-01:** Recency = количество дней от последней оплаты (`max(paidAt)` по оплаченным заказам) до `now`. Для trial-only (нет оплат) — дни от регистрации (`User.createdAt`). — **Reversibility:** reversible — чистая derivation.
- **D-02:** Frequency = количество оплаченных заказов (`status in paid/provisioning/provisioned`) за **trailing 12 месяцев**. — **Reversibility:** reversible.
- **D-03:** Monetary = сумма `cash (finalAmount − balanceUsed)` по всем оплаченным заказам **за всё время** (накопленная ценность). Консистентно с `cashOf` (D-02 Phase 7). — **Reversibility:** reversible.
- **D-04:** Окно: Monetary — вся история; Recency/Frequency — trailing 12 месяцев (Recency по последней оплате, которая и так недавняя; Frequency ограничена 12 мес). Компромисс: VIP не «замораживается» навсегда, но масштаб трат сохраняется. — **Reversibility:** reversible.

#### Сегменты и пороги (SEG-02, SEG-05)

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

#### Хранение и обновление (SEG-01)

- **D-10:** Новая таблица `user_rfm`: `userId` (PK, FK → users), `recencyDays` (int), `frequency` (int), `monetary` (int, nullable), `segment` (text), `computedAt` (datetime). Индекс по `segment`. Миграция Prisma. — **Reversibility:** one-way — новая таблица; откат = drop table (данные теряются, но пересчёт восстановит).
- **D-11:** Отдельный cron-маршрут `app/api/cron/rfm/route.ts` под `CRON_SECRET`, запускается в 03:10 (после analytics 03:00). Разделение ответственности. — **Reversibility:** reversible.
- **D-12:** Backfill через CLI-скрипт `scripts/backfill-rfm.ts` (идемпотентный, запускается вручную при деплое). — **Reversibility:** reversible.
- **D-13:** Trial-only пользователи включаются в `user_rfm`: `recencyDays` от регистрации, `frequency = 0`, `monetary = null`, `segment = 'trial-only'`. — **Reversibility:** reversible.

#### Drill-down и рассылка (SEG-03, SEG-04)

- **D-14:** Drill-down — существующая страница `/admin/users` с фильтром `?segment=`. Фильтрация по `user_rfm.segment`. Без новой страницы. — **Reversibility:** reversible.
- **D-15:** Предпросмотр числа получателей — API-эндпоинт `GET /api/admin/segments/:name/count`, возвращает `{ count }` (число пользователей сегмента с `chatId != null`). — **Reversibility:** reversible.
- **D-16:** Broadcast route (`POST /api/admin/broadcast`) расширяется: body `{ body, segment? }`, `segment` опционален (default `'all'` = все с chatId). Recipients = пользователи сегмента с `chatId != null`. Обратно совместимо. — **Reversibility:** reversible — расширение схемы, старые клиенты работают.
- **D-17:** `BroadcastComposer` получает dropdown «Аудитория»: «Все получатели» + список сегментов с размером. При выборе показывается предпросмотр числа получателей (вызов count endpoint). — **Reversibility:** reversible.

#### UI и композиция

- **D-18:** Отдельная страница `/admin/segments` (новый пункт в `AdminNav`). Карточки с числом (7 сегментов) + блок редактирования порогов. — **Reversibility:** reversible.
- **D-19:** Нейтральные токены (без red/green pass-fail, наследовано из Phase 7). Акцент (`--lime`) только для активного/выбранного. Сегменты различаются иконкой/подписью, не цветом. — **Reversibility:** reversible.
- **D-20:** Границы дат/периодов — **Europe/Moscow (+03:00)**, консистентно с D-15 Phase 7. — **Reversibility:** costly.

### the agent's Discretion (research recommends)

- Точные SQL-запросы и индексы для `user_rfm`.
- Имена i18n-ключей (по паттерну `admin.segments*`, `admin.rfm*`).
- Визуальная структура карточек сегментов (иконки, layout).
- Формат отображения Recency/Frequency/Monetary в drill-down (таблица пользователей).
- Как запускать пересчёт из admin-UI (синхронно или через cron-trigger).
- Имя cron-маршрута и расписание (03:10).

### Deferred Ideas (OUT OF SCOPE)

- Алерты на изменение сегментов (ALR).
- CSV-экспорт списков сегментов (EXT-06).
- Персональный LTV / drill-down по пользователю beyond segment list.
- Учёт возвратов/chargeback в Monetary.
- RFM-score (квантили) как альтернатива rule-based — отложено, rule-based выбран.

</user_constraints>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SEG-01 | Система считает для каждого пользователя Recency / Frequency / Monetary и сохраняет в `user_rfm` с ежедневным обновлением | `lib/analytics/rfm.ts` pure derivation + `PAID`/`cashOf`/`mskDayLabel`; nightly cron `app/api/cron/rfm/route.ts` + idempotent `scripts/backfill-rfm.ts`. |
| SEG-02 | Админ видит именованные сегменты (trial-only, new payer, active, at-risk, churned, sleeping, VIP) с размером каждого | `lib/analytics/rfm.ts` segment rule evaluation (D-05/D-06); `loadSegments()` in `lib/analytics/service.ts`. |
| SEG-03 | Админ видит размер сегмента и может провалиться в список пользователей, отфильтрованный по сегменту | `/admin/users?segment=` drill-down over `loadAdminUsersTable(segment)` + `/api/admin/users/search` composition (AND). |
| SEG-04 | Админ выбирает сегмент как аудиторию рассылки и видит предпросмотр числа получателей до отправки | Broadcast body `{ body, segment? }` (D-16) + `GET /api/admin/segments/:name/count` (D-15) + `BroadcastComposer` audience dropdown (D-17). |
| SEG-05 | Пороги сегментов конфигурируемы (не захардкожены) и меняются без деплоя | `Setting` key/value rows `rfm.threshold.*` (D-07) + `/admin/segments` thresholds form (D-08). |

## Summary

Phase 11 turns the existing analytics/broadcast substrate into an RFM-driven, segment-based
targeting surface. The phase adds a per-user RFM snapshot (`user_rfm`) recomputed nightly,
seven named rule-based segments evaluated over that snapshot, an admin drill-down into a
segment's user list, segment-based broadcast audience selection with a recipient-count
preview, and configurable segment thresholds stored in the existing `Setting` key/value table.

The technical plan reuses the Phase 7–10 house patterns rather than inventing new ones:

- **Pure derivation modules** in `lib/analytics/*` (no Prisma / next / React imports; unit
  tests without a DB) — the Phase 10 exemplar is `lib/analytics/cohorts.ts` (`buildRegistrationCohorts`,
  `buildPayerCohorts`, channel/device derivation).
- **DB loaders** in `lib/analytics/service.ts` that own user/order filtering and hand plain
  rows to the pure modules; typed payloads; `PAID = ["paid", "provisioning", "provisioned"]`;
  `cashOf = max(0, finalAmount − balanceUsed)`; BigInt → JS number serialization guards; raw SQL
  uses `::int` + `pgTimestamp`.
- **Nightly rollup + backfill** via the Phase 7 engine (`rollupDays` → absolute-value upsert into
  `daily_metrics`) plus the `app/api/cron/analytics` + `scripts/backfill-analytics.ts` pair, now
  pointed at the new `user_rfm` snapshot.
- **MSK discipline** via `lib/analytics/time.ts` helpers (`mskDayLabel`, `mskDayStartInstant`,
  `mskDateKey`, `mskMonthLabel`, `addMonths`, `pgTimestamp`) — Moscow calendar days are computed
  in JS, never in SQL.

**Primary recommendation:** implement the RFM core as a new pure module `lib/analytics/rfm.ts`
(per-user snapshot derivation + segment assignment), wire it through `lib/analytics/service.ts`
(`loadSegments()` / `loadRfmUser` / `recomputeAllRfm`), add the nightly cron route
`app/api/cron/rfm/route.ts` and the idempotent backfill `scripts/backfill-rfm.ts`, then add the
admin API routes, the `/admin/segments` page, the drill-down filter, the audience-aware
broadcast, and the thresholds form — following the Phase 10 task decomposition shape (pure core +
unit tests → loaders + DB tests → page/components/i18n/contract tests).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Per-user RFM snapshot derivation (pure) | API / Backend | — | Server-side pure module; no client data fetching needed (UI-SPEC non-goal). |
| `user_rfm` persistence + nightly recompute | Database / Storage | API / Backend | Prisma model + absolute-value upsert; cron route. |
| Segment list / cards rendering | Frontend Server (RSC) | — | Server component fed by loader; single source of truth for counts. |
| Thresholds form (client) | Browser / Client | API / Backend | Client component with `PUT /api/admin/segments/thresholds`; reads initial values from server-fetched props. |
| User drill-down (segment filter) | Browser / Client (search island) + API / Backend | — | Reuses `/api/admin/users/search` composition; `?segment=` AND-composes with free-text `q`. |
| Broadcast audience selection | API / Backend | Browser / Client | Audience-aware `POST /api/admin/broadcast` + count preview endpoint. |
| Broadcast enqueue/dispatch (outbox) | API / Backend | — | Unchanged infra; only recipient selection becomes segment-aware. |

## Standard Stack

No new packages for Phase 11 (UI-SPEC §Registry Safety: zero installs).

### Reused modules (authoritative paths)

| Module | Key exports | Used for |
|--------|-------------|----------|
| `lib/analytics/series.ts` | `PaidOrderRow`, `cashOf`, `buildKeyTerms`, `keyRefOf` | Cash base (`finalAmount − balanceUsed`) and key identity. |
| `lib/analytics/time.ts` | `mskDayLabel`, `mskDayStartInstant`, `mskDateKey`, `mskMonthLabel`, `addMonths`, `pgTimestamp` | MSK day/month labels and window bounds. |
| `lib/analytics/retention.ts` | `buildKeyTermEvents`, `TermEvent`, `retentionForWindow` | Per-key coverage events (renewals as separate spans) — the model for per-user recency/frequency. |
| `lib/analytics/mrr.ts` | `keyRefOf`, `totalMrrAt`, `activeKeysAt` | Per-key monetary context. |
| `lib/analytics/economics.ts` | division guards (`denominator === 0 ? null : …`) | VIP percentile denominator guard (top-5% over N users). |
| `lib/analytics/service.ts` | `loadPaidOrders`, `PAID`, `ORDER_SELECT`, loaders | DB read patterns for the RFM loader. |
| `lib/broadcast.ts` | `dispatchBroadcast`, `loadBroadcastStatus`, `enqueueBroadcastNotifications` | Outbox enqueue shape (`broadcast:{id}:{userId}` dedupe keys). |
| `lib/outbox.ts` | `enqueueBroadcastNotifications` | Recipient fan-out with `skipDuplicates`. |
| `lib/admin-auth.ts` | `requireRole`, `AdminSection`, `can`, `getAdminRole` | Admin gate (administrator + manager). |
| `lib/i18n/messages/ru.ts` | `admin.*`, `common.*`, `ticket.*` keys + `t`/`tp`, `I18nKey` | All new copy (UI-SPEC §Copywriting: exactly 34 new keys). |
| `components/admin/AnalyticsSection.tsx`, `MetricCard.tsx`, `CardsSkeleton` | UI primitives | Thresholds block + segment cards reuse. |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Prisma | ^7.10 (v7 stable) | `user_rfm` model + migration + reads | New table; `migrate deploy` in container entrypoint. |
| PostgreSQL | 17-alpine | Persist `user_rfm`, `Setting`, orders | Relational fit for per-user + config rows. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `user_rfm` snapshot table | Compute RFM on the fly per request from `orders` | Rejected by locked decision D-10/D-11: nightly snapshot + backfill, drill-down/preview read the snapshot. |
| Raw SQL RFM queries | Prisma `findMany` + pure JS derivation | Rejected: house pattern is pure modules + typed loaders. |

**Installation:**

```bash
# Phase 11 installs NO new packages (UI-SPEC §Registry Safety — zero installs).
```

**Version verification:** Phase 11 adds no packages — reuses the already-locked, registry-verified
versions (`next@16.3.7`, `react@19.3.0`, `telegraf@4.16.3`, `zod@4.6.5`, `@serwist/next@9.5.12`,
`tailwindcss@4.3.3`, `pino@10.3.1`, `prisma@7.10.0`).

## Package Legitimacy Audit

Phase 11 installs **zero** new external packages — the UI surface is cards, a form, a table column
set, and a native `<select>`. No install tasks and no package gates.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| _none_ | — | — | — | — | n/a | n/a — no installs |

**Packages removed due to [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** none for phase scope.

## Architecture Patterns

### Recommended new files

- `prisma/migrations/<ts>_phase11_user_rfm/migration.sql` (via `prisma migrate dev`) — new `user_rfm` table + index; Prisma model edit.
- `lib/analytics/rfm.ts` — pure derivation (no Prisma/React/next imports), unit-testable.
- `lib/analytics/rfm-service.ts` OR extend `lib/analytics/service.ts` with `recomputeAllRfm`, `loadSegments`, `loadThresholds`, `saveThresholds`, `loadRfmForUser`. Research recommends a **new** `lib/analytics/rfm-service.ts` to keep `service.ts` (analytics page loaders) untouched, mirroring the Phase 10 split of `cohorts.ts` (pure) vs loaders in `service.ts`. Either is acceptable; pick one and stay consistent. **Recommendation: new `lib/analytics/rfm-service.ts`** (keeps analytics-page loader module stable; tests import from there).
- `app/api/cron/rfm/route.ts` — nightly recompute trigger.
- `scripts/backfill-rfm.ts` — idempotent manual backfill.
- `app/admin/segments/page.tsx` — `/admin/segments` page.
- `components/admin/SegmentCards.tsx` — server component, 7 cards.
- `components/admin/SegmentThresholdsForm.tsx` — client component.
- `components/admin/SegmentBadge.tsx` — neutral pill.
- `app/api/admin/segments/[name]/count/route.ts` — count preview.
- `app/api/admin/segments/thresholds/route.ts` — GET/PUT thresholds.
- Edits: `app/api/admin/broadcast/route.ts`, `components/admin/BroadcastComposer.tsx`, `app/admin/users/page.tsx`, `components/admin/AdminNav.tsx`, `lib/admin-service.ts` (`loadAdminUsersTable` join), `lib/i18n/messages/ru.ts`, `prisma/schema.prisma`, `lib/admin-auth.ts` (new `segments` section).
- Tests: `tests/unit/analytics-rfm.test.ts`, `tests/unit/analytics-phase11-loaders.test.ts`, `tests/unit/admin-segments-contract.test.ts`.

### Pure module API (recommended) — `lib/analytics/rfm.ts`

```ts
// lib/analytics/rfm.ts — PURE (no Prisma / next / React imports).
import { mskDayLabel, mskDayStartInstant, addMonths } from "./time";

export const DAY_MS = 86_400_000;
export const TRAILING_12M_MONTHS = 12;

export type SegmentSlug =
  | "trial-only"
  | "new payer"
  | "VIP"
  | "active"
  | "at-risk"
  | "churned"
  | "sleeping";

export const SEGMENT_SLUGS: readonly SegmentSlug[] = [
  "trial-only", "new payer", "VIP", "active", "at-risk", "churned", "sleeping",
] as const;

export interface RfmThresholds {
  newPayerDays: number; // default 30
  activeDays: number;   // default 30
  atRiskDays: number;   // default 60
  churnedDays: number;  // default 60
  vipPercent: number;   // default 5, 1..100
}

export const DEFAULT_THRESHOLDS: RfmThresholds = {
  newPayerDays: 30,
  activeDays: 30,
  atRiskDays: 60,
  churnedDays: 60,
  vipPercent: 5,
};

export interface RfmUserInput {
  userId: number;
  createdAt: Date;
  trialUsed: boolean;
  // paid orders (status in paid/provisioning/provisioned) — ALL history
  paidOrders: { paidAt: Date; cash: number }[];
  // any non-trial KeyCache row with expiresAt > now
  coverageActive: boolean;
}

export interface RfmSnapshot {
  userId: number;
  recencyDays: number;
  frequency: number;       // trailing 12 MSK months
  monetary: number | null; // all-time cash; null when no paid orders
  segment: SegmentSlug;
}

/** MSK calendar-day difference (D-20). Never negative. */
export function daysBetweenMsk(a: Date, b: Date): number {
  const aDay = mskDayStartInstant(mskDayLabel(a)).getTime();
  const bDay = mskDayStartInstant(mskDayLabel(b)).getTime();
  return Math.max(0, Math.round((bDay - aDay) / DAY_MS));
}

export function recencyDaysOf(input: RfmUserInput, now: Date): number {
  if (input.paidOrders.length === 0) return daysBetweenMsk(input.createdAt, now);
  const lastPaid = input.paidOrders.reduce((m, o) =>
    o.paidAt.getTime() > m.getTime() ? o.paidAt : m, input.paidOrders[0]!.paidAt);
  return daysBetweenMsk(lastPaid, now);
}

export function frequencyOf(input: RfmUserInput, now: Date): number {
  // trailing 12 MSK months: orders with paidAt >= start of the MSK month 12 months ago
  const currentMonth = mskDayLabel(now).slice(0, 7) + "-01";
  const cutoffMonth = addMonths(currentMonth, -TRAILING_12M_MONTHS);
  const cutoffInstant = mskDayStartInstant(cutoffMonth);
  return input.paidOrders.filter((o) => o.paidAt.getTime() >= cutoffInstant.getTime()).length;
}

export function monetaryOf(input: RfmUserInput): number | null {
  if (input.paidOrders.length === 0) return null;
  return input.paidOrders.reduce((sum, o) => sum + o.cash, 0);
}

/** VIP = top vipPercent by monetary. Returns the set of userIds that are VIP. */
export function vipUserIds(
  entries: { userId: number; monetary: number }[],
  vipPercent: number,
): Set<number> {
  if (entries.length === 0) return new Set();
  const sorted = [...entries].sort((a, b) =>
    b.monetary - a.monetary || a.userId - b.userId);
  const k = Math.max(1, Math.round(sorted.length * (vipPercent / 100)));
  return new Set(sorted.slice(0, k).map((e) => e.userId));
}

export function vipThresholdValue(
  entries: { userId: number; monetary: number }[],
  vipPercent: number,
): number | null {
  const ids = vipUserIds(entries, vipPercent);
  if (ids.size === 0) return null;
  let min = Infinity;
  for (const e of entries) if (ids.has(e.userId) && e.monetary < min) min = e.monetary;
  return min === Infinity ? null : min;
}

export interface AssignSegmentArgs {
  trialUsed: boolean;
  paidOrderCount: number;   // all-time paid order count
  firstPaidAt: Date | null; // min paidAt
  lastPaidAt: Date | null;  // max paidAt
  monetary: number | null;
  coverageActive: boolean;
  now: Date;
  thresholds: RfmThresholds;
  isVip: boolean;
}

export function assignSegment(args: AssignSegmentArgs): SegmentSlug {
  const { trialUsed, paidOrderCount, firstPaidAt, lastPaidAt, coverageActive, now, thresholds } = args;

  // 1. trial-only (no paid orders) — includes the "no trial & no pay" fallback (D-06)
  if (paidOrderCount === 0) return "trial-only";

  // 2. new payer — first paid order within newPayerDays
  const firstPaidDays = firstPaidAt ? daysBetweenMsk(firstPaidAt, now) : Infinity;
  if (firstPaidDays <= thresholds.newPayerDays) return "new payer";

  // 3. VIP — top vipPercent by monetary (precomputed by caller)
  if (args.isVip) return "VIP";

  const lastPaidDays = lastPaidAt ? daysBetweenMsk(lastPaidAt, now) : Infinity;

  // 4. active — recent payment AND (coverage active OR renewed within 7 days)
  if (lastPaidDays <= thresholds.activeDays && (coverageActive || lastPaidDays <= 7)) {
    return "active";
  }

  // 5. at-risk — payment aging but coverage still active
  if (
    lastPaidDays > thresholds.activeDays &&
    lastPaidDays <= thresholds.atRiskDays &&
    coverageActive
  ) {
    return "at-risk";
  }

  // 6. churned — coverage expired
  if (!coverageActive) return "churned";

  // 7. sleeping — no recent payment but coverage still active (long tariff / bonus)
  if (lastPaidDays >= thresholds.churnedDays) return "sleeping";

  // Fallback for config where atRiskDays < churnedDays and coverage still active:
  // treat as at-risk rather than leaving unmatched.
  return "at-risk";
}

/** Build one snapshot from a user's raw inputs. VIP flag must be resolved by the caller (needs global monetary ranking). */
export function buildSnapshot(
  input: RfmUserInput,
  now: Date,
  thresholds: RfmThresholds,
  isVip: boolean,
): RfmSnapshot {
  const paidOrderCount = input.paidOrders.length;
  const firstPaidAt =
    paidOrderCount === 0
      ? null
      : input.paidOrders.reduce((m, o) =>
          o.paidAt.getTime() < m.getTime() ? o.paidAt : m, input.paidOrders[0]!.paidAt);
  const lastPaidAt =
    paidOrderCount === 0
      ? null
      : input.paidOrders.reduce((m, o) =>
          o.paidAt.getTime() > m.getTime() ? o.paidAt : m, input.paidOrders[0]!.paidAt);
  return {
    userId: input.userId,
    recencyDays: recencyDaysOf(input, now),
    frequency: frequencyOf(input, now),
    monetary: monetaryOf(input),
    segment: assignSegment({
      trialUsed: input.trialUsed,
      paidOrderCount,
      firstPaidAt,
      lastPaidAt,
      monetary: monetaryOf(input),
      coverageActive: input.coverageActive,
      now,
      thresholds,
      isVip,
    }),
  };
}

/** Resolve VIP flags across a cohort, then build snapshots. */
export function buildSnapshots(
  inputs: RfmUserInput[],
  now: Date,
  thresholds: RfmThresholds,
): RfmSnapshot[] {
  const vipEntries = inputs
    .map((i) => ({ userId: i.userId, monetary: monetaryOf(i) }))
    .filter((e): e is { userId: number; monetary: number } => e.monetary !== null);
  const vips = vipUserIds(vipEntries, thresholds.vipPercent);
  return inputs.map((i) => buildSnapshot(i, now, thresholds, vips.has(i.userId)));
}
```

**Segment rule clarifications (resolving D-06 ambiguities):**

- **Coverage (`coverageActive`)** is precomputed by the loader: `true` iff the user has at least one `KeyCache` row with `isTrial = false` and `expiresAt > now`. Trial keys never count. "Продление в пределах 7 дней" is folded into the `active` rule via `lastPaidDays <= 7` (a payment that recent implies renewal in flight even if the key row has not been refreshed yet) — no extra input needed.
- **VIP computed AFTER monetary for all payers**: `vipUserIds` ranks every user with `monetary !== null` (i.e. at least one paid order) by monetary desc, tie-broken by `userId` asc, and takes the top `round(N * vipPercent/100)` (min 1). The set is computed once over the whole cohort before per-user `assignSegment`, so VIP is mutually exclusive with `new payer`/`active` by priority (new payer first, then VIP).
- **Mutual exclusivity via priority order**: `assignSegment` returns on the first matching branch; later branches never override. Order is exactly D-06: trial-only → new payer → VIP → active → at-risk → churned → sleeping.
- **Trial-only fallback**: a user with no paid orders returns `trial-only` regardless of `trialUsed` (D-06 last line: "Пользователь без оплат и без trial → trial-only").
- **Monetary null**: only `trial-only` (no paid orders) has `monetary = null`; every payer has a number (sum of `cashOf`). `frequency` counts paid orders with `paidAt >=` the MSK month 12 months ago (rolling-ish by month boundary).
- **Recency for trial-only**: MSK day difference between `createdAt` and `now` (D-01).
- **Unmatched config edge case**: if `atRiskDays < churnedDays` and coverage is still active but the user is past `atRiskDays`, the final fallback returns `at-risk` rather than leaving the user unsegmented. Defaults keep `atRiskDays == churnedDays == 60`, so this branch is defensive only.

### Data model

**Prisma model (new) — `prisma/schema.prisma`:**

```prisma
model UserRfm {
  userId      Int      @id @map("user_id")
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  recencyDays Int      @map("recency_days")
  frequency   Int
  monetary    Int?
  segment     String
  computedAt  DateTime @default(now()) @map("computed_at")

  @@index([segment])
  @@map("user_rfm")
}
```

And add to `User`:
```prisma
rfm UserRfm?
```

Migration name suggestion: `phase11_user_rfm`. Apply via `prisma migrate deploy` in the container entrypoint (never `migrate dev` in prod).

**Setting keys (D-07, no migration — stored in existing `settings` table):**

| Key | Default | Validation |
|-----|---------|------------|
| `rfm.threshold.newPayerDays` | `30` | int ≥ 1 |
| `rfm.threshold.activeDays` | `30` | int ≥ 1 |
| `rfm.threshold.atRiskDays` | `60` | int ≥ 1 |
| `rfm.threshold.churnedDays` | `60` | int ≥ 1 |
| `rfm.threshold.vipPercent` | `5` | int 1..100 |

`loadThresholds()` returns `DEFAULT_THRESHOLDS` for any missing/invalid key (never throws). `saveThresholds()` upserts all five rows and then calls `recomputeAllRfm()` synchronously (D-08: "Сохранение … запускает пересчёт"). Research recommends synchronous recompute at MVP scale (single server, thousands of users); if recompute exceeds ~2s in practice, move to a background job — but keep the contract that thresholds are read from `Setting` on the next nightly run regardless.

### Cron / backfill patterns (copy from Phase 7)

**`app/api/cron/rfm/route.ts`** — mirror `app/api/cron/analytics/route.ts` verbatim except:
- route label `cron_rfm`;
- no 7-day re-roll window (RFM is a full snapshot, not a rolling window);
- call `recomputeAllRfm()` from `lib/analytics/rfm-service.ts`;
- schedule externally at **03:10 MSK** (after analytics 03:00).

```ts
export const dynamic = "force-dynamic";
export async function POST(req: Request): Promise<Response> {
  // safeEq header check against CRON_SECRET (identical to analytics route)
  // ...
  const { recomputeAllRfm } = await import("../../../lib/analytics/rfm-service");
  const result = await recomputeAllRfm();
  return Response.json({ ok: true, ...result });
}
```

Return shape: `{ ok, users, upserted, computedAt }` (numbers only, no DB URLs).

**`scripts/backfill-rfm.ts`** — mirror `scripts/backfill-analytics.ts`:
- relative imports (no `@/` alias under tsx);
- `prisma.$connect()` → `recomputeAllRfm()` → log counts → `prisma.$disconnect()`;
- idempotent (upsert by `userId` PK), safe to re-run.

Documented operator command:
```
docker compose -f docker-compose.prod.yml exec web npx tsx scripts/backfill-rfm.ts
```

### Loader contracts (`lib/analytics/rfm-service.ts`)

```ts
export interface SegmentSummary {
  name: SegmentSlug;
  size: number;      // total users in segment
  chatCount: number; // users in segment with chatId != null
}

export interface SegmentsData {
  segments: SegmentSummary[]; // 7 entries, D-06 priority order
}

export interface ThresholdsData {
  newPayerDays: number;
  activeDays: number;
  atRiskDays: number;
  churnedDays: number;
  vipPercent: number;
}

export async function loadThresholds(): Promise<ThresholdsData>;
export async function saveThresholds(next: ThresholdsData): Promise<ThresholdsData>; // upserts + recompute
export async function recomputeAllRfm(): Promise<{ users: number; upserted: number; computedAt: Date }>;
export async function loadSegments(): Promise<SegmentsData>;
export async function loadRfmForUser(userId: number): Promise<{ recencyDays: number; frequency: number; monetary: number | null; segment: SegmentSlug } | null>;
```

**`loadSegments()`** implementation notes:
- Size: `prisma.userRfm.groupBy({ by: ["segment"], _count: { _all: true } })`.
- Chat count: `prisma.userRfm.findMany({ where: { user: { chatId: { not: null } } }, select: { segment: true } })` then tally. (Or a single raw SQL join; either is fine — keep it Prisma for type safety.)
- Always return all 7 slugs in D-06 priority order, filling 0 for missing segments (UI never shows a missing card).
- `SegmentSlug` → localized label mapping lives in the component via a literal `switch`, never a dynamic key (same rule as Phase 9 funnel labels).

**`loadRfmForUser`** is consumed by `loadAdminUsersTable` to populate the segment badge + RFM columns.

### Integration points

**1. `prisma/schema.prisma`** — add `UserRfm` model + `rfm UserRfm?` on `User` (see Data model). Migration.

**2. `lib/admin-auth.ts`** — add `"segments"` to `AdminSection` union and to `MATRIX` for `administrator` and `manager` (page guard is `requireRole('administrator', 'manager')`). `support`/`partner` do not see it.

**3. `components/admin/AdminNav.tsx`** — add `'segments'` to `NavSection` Extract, `ITEMS`, and `itemLabel` (returns `t('admin.navSegments')` → «Сегменты»). Icon not needed (text nav).

**4. `lib/admin-service.ts` — `loadAdminUsersTable`** — extend `AdminUserTableRow` with `segment: SegmentSlug | null`, `recencyDays: number | null`, `frequency: number | null`, `monetary: number | null`. Left-join `user_rfm` (via `prisma.user.findMany({ include: { rfm: true } })` or a second query). Base view renders only the badge; RFM columns render only when `?segment=` is set (UI decision). Counts (`keysCount`/`ordersCount`) are currently hardcoded 0 in this loader (pre-existing) — do not change that here; out of scope.

Also add an optional `segment` filter parameter:
```ts
export async function loadAdminUsersTable(segment?: SegmentSlug): Promise<AdminUserTableRow[]>
```
When `segment` is provided, filter `where: { rfm: { segment } }`. Keep the 50-row cap.

**5. `app/admin/users/page.tsx`** — becomes `async function AdminUsersPage({ searchParams })`; whitelist `segment` against `SEGMENT_SLUGS` (unknown → undefined, no error). Render removable badge + 3 RFM columns in filtered view; base view gains the segment badge column only. Empty filtered list → `admin.usersSegmentEmpty` panel, no table header.

**6. `app/api/admin/segments/[name]/count/route.ts`** —
```ts
// GET /api/admin/segments/:name/count → { count }
```
- Guard `requireRole('administrator', 'manager')`.
- `name === 'all'` → count users with `chatId != null`.
- else validate against `SEGMENT_SLUGS`; invalid → 404 `{ error: "not_found" }`.
- count users where `chatId != null` AND `rfm.segment === name`.

**7. `app/api/admin/segments/thresholds/route.ts`** —
- `GET` → `loadThresholds()` (guard admin/manager).
- `PUT` body `{ newPayerDays, activeDays, atRiskDays, churnedDays, vipPercent }` validated with zod (int, min 1; vipPercent max 100). Invalid → 400. Then `saveThresholds()` → returns updated thresholds + recompute summary. Guard `requireRole('administrator')` (threshold editing is admin-only; manager reads).

**8. `app/api/admin/broadcast/route.ts`** — extend:
```ts
const bodySchema = z.object({
  body: z.string().trim().min(1).max(4000),
  segment: z.enum(SEGMENT_SLUGS).optional(), // or 'all' allowed
});
```
Recipients:
- if no `segment` or `segment === 'all'`: `prisma.user.findMany({ where: { chatId: { not: null } }, select: { id: true } })`.
- else: `prisma.user.findMany({ where: { chatId: { not: null }, rfm: { segment } }, select: { id: true } })`.
Keep `Broadcast` model unchanged (no segment column needed — recipients are materialized into `Notification` rows at enqueue time). Backward compatible: old clients sending a raw string body still work? The current route reads `body` from JSON. New schema reads `{ body, segment }`. To stay backward compatible with any client sending `{ body: "..." }`, accept both: parse `raw.body` if present else `raw` if string. Research recommends: accept JSON `{ body, segment? }` and also treat a bare string body as `{ body }` for safety. Simpler: `const raw = await req.json(); const body = typeof raw === 'string' ? raw : raw?.body; const segment = typeof raw === 'object' ? raw?.segment : undefined;`.

**9. `components/admin/BroadcastComposer.tsx`** — accept `segments: { name: string; size: number }[]` prop; add native `<select>` audience picker + count preview fetching `GET /api/admin/segments/${audience}/count` (or `/all/count`). Send `segment` only when non-`all`. Disable send when count is 0 or loading. `AdminBroadcastPage` passes `segments` from `loadSegments()`.

**10. `app/admin/segments/page.tsx`** — new page, guard `requireRole('administrator', 'manager')`, `force-dynamic`. Composition per UI-SPEC §6.1:
```tsx
<section className="flex flex-col gap-6">
  <header>…</header>
  <Suspense fallback={<CardsSkeleton count={7} />}>
    <SegmentCards />
  </Suspense>
  <AnalyticsSection title={t('admin.segmentsThresholdsTitle')}>
    …
    <SegmentThresholdsForm initial={await loadThresholds()} />
  </AnalyticsSection>
</section>
```
Empty (no `user_rfm` rows): render `admin.segmentsEmpty` panel instead of cards.

**11. `lib/i18n/messages/ru.ts`** — add exactly the 34 keys from UI-SPEC §Copywriting (nav + page + cards + thresholds + drill-down + broadcast audience). Do not add extras.

**12. `components/admin/AdminNav.tsx`** — add `segments` section + nav item (see Integration point 3).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| MSK day/month math | custom Date arithmetic | `mskDayLabel`/`mskDayStartInstant`/`addMonths` | Fixed +03:00, no DST; tested. |
| Cash calculation | `finalAmount` alone | `cashOf` (`max(0, finalAmount − balanceUsed)`) | Balance-covered rubles must be excluded (D-03, consistent with Phase 7). |
| Paid-status filter | ad-hoc status checks | `PAID = ["paid","provisioning","provisioned"]` constant | Single money definition across all modules. |
| VIP ranking | quantile/RFM-score | `vipUserIds` sort + slice | Rule-based, transparent (D-05/D-09). |
| Threshold storage | new config table / env | existing `Setting` key/value | D-07: no migration, admin-editable. |
| Cron auth | custom token | `CRON_SECRET` + `safeEq` (timing-safe) | Copied from analytics route; constant-time compare. |
| Broadcast fan-out | per-user loop | `enqueueBroadcastNotifications` (`createMany`, `skipDuplicates`) | Idempotent, atomic. |
| Table scroll region | custom overflow | clone `ChurnTable` recipe | Proven a11y. |
| Segmented control | new tab component | clone `PeriodSelector` | Proven a11y + styling (only if needed; audience uses native `<select>`). |

**Key insight:** Phase 11 is a *composition* phase — every primitive (cash, MSK days, paid-status, outbox, admin guards, card primitives) already exists. The only genuinely new code is the pure RFM derivation + segment assignment + the snapshot table. Resist building new infrastructure.

## Runtime State Inventory

N/A — greenfield data (new `user_rfm` table). No rename/refactor/migration of existing state. The `Setting` rows are created lazily with defaults; no existing rows are renamed.

## Common Pitfalls

### Pitfall 1: VIP computed before monetary is aggregated
**What goes wrong:** VIP set derived from a per-user partial sum or from a stale snapshot.
**How to avoid:** Compute monetary for ALL users first, then `vipUserIds` once over the full cohort, then `assignSegment` with `isVip` flag. Never interleave.

### Pitfall 2: Segment priority violated
**What goes wrong:** A new payer who is also top-5% monetary gets classified `VIP` instead of `new payer`.
**How to avoid:** `assignSegment` returns on the first matching branch (trial-only → new payer → VIP → …). Order is D-06; do not reorder.

### Pitfall 3: Trial keys leaking into coverage / monetary
**What goes wrong:** A trial subscription counts as `coverageActive` or its (zero) cash inflates monetary.
**How to avoid:** `coverageActive` checks `isTrial = false` only. Monetary sums `cashOf` over paid orders only (status in PAID) — trial keys never create orders, but filter paid orders by status regardless.

### Pitfall 4: Recency off-by-one near MSK midnight
**What goes wrong:** A payment at 23:50 MSK shows recency 1 day too many/low depending on `now`.
**How to avoid:** Use `daysBetweenMsk` (MSK calendar-day difference via `mskDayLabel`/`mskDayStartInstant`), never raw `floor((now-paidAt)/86400000)`.

### Pitfall 5: Frequency window using calendar months inconsistently
**What goes wrong:** Loader and pure module disagree on the 12-month cutoff.
**How to avoid:** Both use `addMonths(currentMonth, -12)` MSK month label → `mskDayStartInstant`. Documented in `frequencyOf`. Identity tests pin the wiring.

### Pitfall 6: `monetary` stored as 0 instead of NULL for trial-only
**What goes wrong:** Drill-down shows «0 ₽» instead of «—»; VIP denominator inflated.
**How to avoid:** `monetaryOf` returns `null` when `paidOrders.length === 0`. Schema column is nullable. Render «—» (U+2014) for null.

### Pitfall 7: Broadcast route breaking old clients
**What goes wrong:** Changing body from a raw string to `{ body, segment }` breaks existing callers sending `{"body":"..."}` (already object) — fine; but any caller sending a bare string body breaks.
**How to avoid:** Accept both: if `req.json()` yields a string, treat as `{ body }`. Keep `body` required, `segment` optional.

### Pitfall 8: `user_rfm` relation missing on `User`
**What goes wrong:** Prisma query `user.rfm` fails; broadcast segment filter can't join.
**How to avoid:** Add `rfm UserRfm?` to `User` model in the same migration. Verify `prisma generate` succeeds.

### Pitfall 9: Threshold save not triggering recompute
**What goes wrong:** Admin changes thresholds but segment sizes stay stale until nightly.
**How to avoid:** `saveThresholds` calls `recomputeAllRfm()` synchronously and returns updated thresholds; UI shows «Пороги сохранены. Пересчёт запущен.» only after 200. Nightly run remains the safety net.

### Pitfall 10: Segment slug with spaces in URL/DB
**What goes wrong:** `?segment=new payer` not URL-encoded; DB filter misses.
**How to avoid:** Whitelist exact slugs (`SEGMENT_SLUGS`); in links use `encodeURIComponent` or template with the slug; UI-SPEC uses `/admin/users?segment=${name}` with the raw slug — ensure `name` is one of the 7. For `new payer` and `trial-only` and `at-risk`, URL-encode in `<Link href>`. Research recommends `encodeURIComponent(name)` in the component.

### Pitfall 11: Suspense / contract test drift
**What goes wrong:** Contract tests assert exact counts; adding a Suspense boundary breaks them.
**How to avoid:** `/admin/segments` is a NEW page with its own contract test (not the analytics page). The analytics page Suspense count stays 15 — do not touch it. `loadAdminUsersTable` change is data-only.

### Pitfall 12: i18n unused/missing keys
**What goes wrong:** i18n test fails on unused or missing keys.
**How to avoid:** Add exactly the 34 keys from UI-SPEC §Copywriting; reference each via literal `t('...')`/`tp('...')` calls (no dynamic key construction). `SegmentSlug` → label uses a literal `switch`, never a dynamic key.

### Pitfall 13: RSC payload leak
**What goes wrong:** Segment payloads carry `providerCost`/`userId`/raw errors.
**How to avoid:** Payloads contain aggregates and per-user RFM scalars only (recencyDays, frequency, monetary, segment). Contract test scans for `providerCost|provider_cost|userId`.

### Pitfall 14: Manager role missing `segments` nav
**What goes wrong:** Manager can open `/admin/segments` (page guard allows) but nav hides it.
**How to avoid:** Add `"segments"` to `MATRIX.manager` AND `AdminNav`. Keep both in sync (same commit).

## Code Examples

### daysBetweenMsk + frequency cutoff

```ts
// lib/analytics/rfm.ts
import { mskDayLabel, mskDayStartInstant, addMonths } from "./time";

export function daysBetweenMsk(a: Date, b: Date): number {
  const aDay = mskDayStartInstant(mskDayLabel(a)).getTime();
  const bDay = mskDayStartInstant(mskDayLabel(b)).getTime();
  return Math.max(0, Math.round((bDay - aDay) / 86_400_000));
}

export function frequencyOf(input: RfmUserInput, now: Date): number {
  const currentMonth = `${mskDayLabel(now).slice(0, 7)}-01`;
  const cutoffMonth = addMonths(currentMonth, -12);
  const cutoffInstant = mskDayStartInstant(cutoffMonth);
  return input.paidOrders.filter((o) => o.paidAt.getTime() >= cutoffInstant.getTime()).length;
}
```

### Loader: recomputeAllRfm

```ts
// lib/analytics/rfm-service.ts
import { prisma } from "../prisma";
import { buildSnapshots, type RfmUserInput } from "./rfm";
import { loadThresholds } from "./rfm-service"; // self

export async function recomputeAllRfm() {
  const now = new Date();
  const thresholds = await loadThresholds();
  const users = await prisma.user.findMany({
    select: { id: true, createdAt: true, trialUsed: true },
  });
  const paidOrders = await prisma.order.findMany({
    where: { status: { in: ["paid", "provisioning", "provisioned"] } },
    select: { userId: true, paidAt: true, finalAmount: true, balanceUsed: true },
  });
  const keys = await prisma.keyCache.findMany({
    where: { isTrial: false, expiresAt: { not: null } },
    select: { userId: true, expiresAt: true },
  });
  const coverageByUser = new Map<number, boolean>();
  for (const k of keys) {
    if (k.expiresAt && k.expiresAt.getTime() > now.getTime()) {
      coverageByUser.set(k.userId, true);
    }
  }
  const ordersByUser = new Map<number, typeof paidOrders>();
  for (const o of paidOrders) {
    if (!o.paidAt) continue;
    const arr = ordersByUser.get(o.userId) ?? [];
    arr.push(o);
    ordersByUser.set(o.userId, arr);
  }
  const inputs: RfmUserInput[] = users.map((u) => ({
    userId: u.id,
    createdAt: u.createdAt,
    trialUsed: u.trialUsed,
    paidOrders: (ordersByUser.get(u.id) ?? [])
      .filter((o) => o.paidAt)
      .map((o) => ({
        paidAt: o.paidAt as Date,
        cash: Math.max(0, o.finalAmount - o.balanceUsed),
      })),
    coverageActive: coverageByUser.get(u.id) ?? false,
  }));
  const snapshots = buildSnapshots(inputs, now, thresholds);
  // upsert all
  await prisma.$transaction(
    snapshots.map((s) =>
      prisma.userRfm.upsert({
        where: { userId: s.userId },
        create: {
          userId: s.userId,
          recencyDays: s.recencyDays,
          frequency: s.frequency,
          monetary: s.monetary,
          segment: s.segment,
          computedAt: now,
        },
        update: {
          recencyDays: s.recencyDays,
          frequency: s.frequency,
          monetary: s.monetary,
          segment: s.segment,
          computedAt: now,
        },
      }),
    ),
  );
  return { users: users.length, upserted: snapshots.length, computedAt: now };
}
```

### Thresholds zod schema

```ts
const thresholdsSchema = z.object({
  newPayerDays: z.number().int().min(1),
  activeDays: z.number().int().min(1),
  atRiskDays: z.number().int().min(1),
  churnedDays: z.number().int().min(1),
  vipPercent: z.number().int().min(1).max(100),
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| RFM-score / quantiles | Rule-based named segments | D-05 (this phase) | Transparent thresholds, admin-editable without deploy. |
| Compute RFM on the fly per request | Nightly snapshot table `user_rfm` | D-10/D-11 (this phase) | Drill-down and broadcast preview read a snapshot; backfill restores history. |
| Hardcoded thresholds in code | `Setting` key/value rows | D-07/D-08 (this phase) | No redeploy to tune segments. |

**Deprecated/outdated:**
- Any prior hardcoded segment logic (none exists yet — greenfield).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `coverageActive` boolean is sufficient for the at-risk/sleeping distinction; "покрытие скоро истечёт" maps to `coverageActive === true` with aging payment. | Architecture Patterns | If the admin expects a "expires within N days" signal, at-risk would include long-dated-but-aging users. Mitigated by defaults where atRiskDays=churnedDays=60; revisit if thresholds diverge. |
| A2 | Synchronous recompute on threshold save is fast enough at MVP scale. | Data model | If recompute takes >2s, UX degrades; fallback is to run nightly only and show "применится при ночном пересчёте". |
| A3 | `vipPercent` top-N uses `round(N * pct/100)` with min 1. | Architecture Patterns | Off-by-one at small N (e.g. 1 payer → VIP). Documented; tests pin the exact formula. |
| A4 | Frequency cutoff uses MSK month boundary (12 months back) rather than rolling 365 days. | Architecture Patterns | Minor count differences near month edges; consistent with D-20. |
| A5 | `loadAdminUsersTable` gains an optional `segment` filter without breaking existing callers (default undefined = no filter). | Integration points | Existing callers pass no arg; behavior unchanged. |

**If this table is empty:** All claims in this research were verified or cited — no user confirmation needed. (Table is non-empty; items above are agent discretion, not blockers.)

## Open Questions

None blocking. The remaining items are the agent's discretion already listed in CONTEXT.md (SQL/index details, i18n key names, card layout, RFM display format, recompute trigger mode, cron route name). Research has made concrete recommendations for each; the planner may adjust.

## Environment Availability

No new external dependencies. Existing infra (Postgres 17, Node 24, Next 16, vitest, shared test Postgres) unchanged. Step 2.6 skipped for new deps; recompute uses the existing DB.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest (existing) |
| Config file | `vitest.config.ts` (existing) |
| Quick run command | `npx vitest run tests/unit/analytics-rfm.test.ts` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SEG-01 | Recency/Frequency/Monetary derivation | unit (pure) | `npx vitest run tests/unit/analytics-rfm.test.ts` | ❌ Wave 0 |
| SEG-01 | Nightly recompute + upsert | integration (DB) | `npx vitest run tests/unit/analytics-phase11-loaders.test.ts` | ❌ Wave 0 |
| SEG-02 | Segment assignment (7 rules, priority, VIP) | unit (pure) | `npx vitest run tests/unit/analytics-rfm.test.ts` | ❌ Wave 0 |
| SEG-02 | `loadSegments` sizes/chatCounts | integration (DB) | `npx vitest run tests/unit/analytics-phase11-loaders.test.ts` | ❌ Wave 0 |
| SEG-03 | Drill-down filter `?segment=` + RFM columns | contract | `npx vitest run tests/unit/admin-segments-contract.test.ts` | ❌ Wave 0 |
| SEG-04 | Broadcast body `{ body, segment? }` + count endpoint | contract | `npx vitest run tests/unit/admin-segments-contract.test.ts` | ❌ Wave 0 |
| SEG-05 | Thresholds read/write + recompute | integration (DB) | `npx vitest run tests/unit/analytics-phase11-loaders.test.ts` | ❌ Wave 0 |
| SEG-01..05 | Page composition, nav item, i18n 34 keys, no-leak | contract | `npx vitest run tests/unit/admin-segments-contract.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/unit/analytics-rfm.test.ts`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `tests/unit/analytics-rfm.test.ts` — pure derivation (recency, frequency, monetary, vipUserIds, assignSegment matrix, buildSnapshots, thresholds defaults, daysBetweenMsk).
- [ ] `tests/unit/analytics-phase11-loaders.test.ts` — DB-backed identity tests for `recomputeAllRfm`, `loadSegments`, `loadThresholds`, `saveThresholds`, `loadRfmForUser`, `loadAdminUsersTable(segment)`.
- [ ] `tests/unit/admin-segments-contract.test.ts` — page composition, nav item, i18n 34-key count (both directions), no-leak scan, broadcast route accepts `segment`, users page reads `?segment=`.

## Security Domain

Security enforcement enabled. Applicable ASVS categories:

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | yes (inherited) | `requireRole('administrator','manager')` on page + routes; session cookie. |
| V3 Session Management | yes (inherited) | httpOnly signed session via `jose`. |
| V4 Access Control | yes | Admin/manager only for segments page + count + thresholds; support/stranger → 404 (no distinct forbidden page). Threshold PUT is administrator-only. |
| V5 Input Validation | yes | Whitelist `segment` against `SEGMENT_SLUGS` ∪ `{'all'}`; zod validation on thresholds (int, min 1, vipPercent 1..100); `body` 1..4000 chars. |
| V6 Cryptography | no | No new crypto. |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Unauthorized segment/broadcast access | Elevation of privilege | `requireRole` re-run on every page and route (Pitfall 12, layouts are not a boundary). |
| SQL injection via `:name` path param | Tampering | `name` is whitelisted against `SEGMENT_SLUGS` ∪ `{'all'}` before any query; never interpolated into SQL. |
| RSC payload leak of per-user/provider data | Information disclosure | Payloads contain aggregates + RFM scalars only; contract test scans for `providerCost\|provider_cost\|userId`. |
| Threshold injection (negative/zero) | Tampering | zod `min(1)` on server; client clamps <1 to 1; invalid → 400. |
| Broadcast audience enumeration | Information disclosure | Count endpoint returns only a number; no user list. Recipient IDs never leave the server. |

## Sources

### Primary (HIGH confidence)
- `.planning/phases/11-rfm-segments-targeting/11-CONTEXT.md` — D-01..D-20 locked decisions.
- `.planning/phases/11-rfm-segments-targeting/11-UI-SPEC.md` — exact UI contract, 34 i18n keys, data shapes, component inventory.
- `prisma/schema.prisma` — `User`, `Order`, `KeyCache`, `Setting`, `Broadcast`, `Notification` (verified this session).
- `lib/analytics/series.ts` — `PaidOrderRow`, `cashOf`, `buildKeyTerms`, `keyRefOf` (verified).
- `lib/analytics/time.ts` — MSK helpers (verified).
- `lib/analytics/service.ts` — loader patterns, `PAID`, `ORDER_SELECT`, `loadKeyCacheState`, `withoutTrialOrders` (verified).
- `lib/broadcast.ts`, `lib/outbox.ts` — broadcast enqueue/dispatch (verified).
- `app/api/cron/analytics/route.ts`, `scripts/backfill-analytics.ts` — cron/backfill patterns (verified).
- `lib/admin-auth.ts`, `components/admin/AdminNav.tsx`, `app/admin/users/page.tsx`, `app/api/admin/broadcast/route.ts`, `components/admin/BroadcastComposer.tsx` — integration surfaces (verified).
- `.planning/phases/10-cohorts-retention-analytics/10-RESEARCH.md` — format template and established patterns (verified).

### Secondary (MEDIUM confidence)
- `tests/unit/analytics-phase10-loaders.test.ts`, `tests/unit/admin-analytics-phase10-contract.test.ts` — test patterns (verified).
- `.planning/STACK.md` — locked stack versions.

### Tertiary (LOW confidence)
- None — all claims verified against repo source this session.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new deps; reuses verified modules.
- Architecture: HIGH — mirrors established phase 7–10 patterns; pure-module + loader split proven; D-06 ambiguities resolved with concrete pseudocode.
- Pitfalls: HIGH — derived from CONTEXT/decisions and prior-phase lessons.

**Research date:** 2026-10-29
**Valid until:** 2026-11-28 (stable domain; revisit if RFM recompute performance becomes an issue).