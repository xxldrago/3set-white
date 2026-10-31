---
phase: 09-payment-funnel-failure-analysis
reviewed: 2026-10-27T03:26:42Z
depth: deep
commit_range: 8bc9d84..1d320cf
files_reviewed: 13
files_reviewed_list:
  - lib/analytics/funnel.ts
  - lib/analytics/service.ts
  - components/admin/FunnelCards.tsx
  - components/admin/ExpiredCards.tsx
  - components/admin/ErrorTable.tsx
  - components/admin/TimeToPayCards.tsx
  - components/admin/TimeToProvisionCards.tsx
  - app/admin/analytics/page.tsx
  - lib/i18n/messages/ru.ts
  - tests/unit/analytics-funnel.test.ts
  - tests/unit/analytics-phase9-loaders.test.ts
  - tests/unit/admin-analytics-phase9-contract.test.ts
  - tests/unit/admin-analytics-phase8-contract.test.ts
cross_referenced:
  - components/admin/MetricCard.tsx
  - components/admin/ChurnTable.tsx
  - components/admin/RetentionCards.tsx
  - components/admin/AnalyticsSection.tsx
  - lib/orders-service.ts
  - lib/worker.ts
  - lib/accounts.ts
  - app/api/platega/callback/route.ts
  - lib/analytics/time.ts
  - lib/i18n/index.ts
  - prisma/schema.prisma
findings:
  critical: 0
  high: 0
  medium: 4
  low: 8
  total: 12
status: issues
---

# Phase 09: Code Review Report

**Reviewed:** 2026-10-27T03:26:42Z
**Depth:** deep
**Range:** `8bc9d84..1d320cf` (12 commits)
**Files Reviewed:** 13
**Status:** issues

## Summary

Phase 9 adds a pure derivation module (`lib/analytics/funnel.ts`), five Prisma loaders, five async server components, three `<AnalyticsSection>` blocks and 31 i18n keys. The core is sound: the funnel is genuinely **reach-based** and monotone (verified against the state machine — `failed` is only reachable from `paid`/`provisioning`, so `provisioning ⊆ paid` holds and the tests' monotonicity assertion cannot be violated by the current writers); `null` vs real-zero separation is consistent everywhere (null rate → «—», zero count → `0`); `expired` is a correct point-in-time strict-`<` boundary derived from one constant; the page keeps `requireRole('administrator','manager')` + `notFound()` and `force-dynamic`; the new loaders use Prisma only (no raw SQL string interpolation, so no injection surface); no hardcoded Russian exists in the five components (only in comments); no secrets, no `dangerouslySetInnerHTML`, no client-component leak of `providerCost`/`userId`.

The findings below are mostly about **what the displayed numbers actually mean**: one metric measures the wrong interval under a real (if rare) production write path, two of the four funnel visuals do not match the locked D-02 shape, and the error table cannot distinguish its own "unknown" sentinel from a provider code that is literally `unknown`.

**Verified locally:** `npx tsc --noEmit` clean; `eslint` clean on all new files (only the two pre-existing warnings noted below); `vitest` green for `analytics-funnel.test.ts` (16), `analytics-phase9-loaders.test.ts` (9), `admin-analytics-phase9-contract.test.ts` (13), `i18n.test.ts` (5).

---

## Critical Issues

_None._

## High Issues

_None._ (The most consequential defect, MD-01, is a metric-accuracy issue bounded by how often accounts are merged; it is rated medium.)

## Medium Issues

### MD-01: `paid → provisioned` timing is measured with `updatedAt`, which non-provisioning writes move

**File:** `lib/analytics/funnel.ts:229` (rationale at `lib/analytics/funnel.ts:40-47`, `:219-223`; SQL scope at `lib/analytics/service.ts:650-661`)

**Problem:** `timingStats` computes `paidToProvisioned = updatedAt − paidAt`. `Order.updatedAt` is Prisma `@updatedAt` (`prisma/schema.prisma:187`), so **any** later UPDATE of the row moves it, and the module header's claim that "the `status === 'provisioned'` scope excludes any LATER `updatedAt` touch" is false for at least one shipped path:

```ts
// lib/accounts.ts:164 — account merge (AUTH-03), inside the merge transaction
await tx.order.updateMany({
  where: { userId: loser.id },
  data: { userId: survivor.id },   // Prisma stamps updatedAt here
});
```

A merge re-points *every* historical order of the loser account, including orders that have been `provisioned` for weeks. Status stays `provisioned`, `paidAt`/`provisionedKeyId` stay populated, so both the SQL WHERE (`service.ts:650-661`) and the defensive filter (`funnel.ts:225-227`) admit the row, and its `paid → provisioned` sample becomes "N days" instead of seconds. Because the mean is rendered next to the median (`TimeToProvisionCards.tsx:52-57`), a single merged account can move the average by days while the median barely moves — the worst possible failure mode for a headline metric.

**Fix:** persist the actual provisioning instant and read it instead of `updatedAt`.

```prisma
// prisma/schema.prisma — model Order
provisionedAt DateTime? @map("provisioned_at")
```

```ts
// lib/orders-service.ts — markProvisioned (:498-503)
return transitionOrder(orderId, "provisioning", "provisioned", {
  provisionedKeyId: keyId,
  providerCost,
  errorCode: null,
  nextAttemptAt: null,
  provisionedAt: new Date(),          // new column
});
```

```ts
// lib/analytics/funnel.ts — FunnelRow + timingStats
provisionedAt: Date | null;
// …
const paidToProvisioned = done.map(
  (o) => (o.provisionedAt ?? o.updatedAt).getTime() - o.paidAt!.getTime(),
);
```

Add `provisionedAt: true` to `FUNNEL_ORDER_SELECT` (`service.ts:556-564`). If a migration must wait, do **not** leave the header asserting an invariant that does not hold: amend `funnel.ts:40-47` and clamp the sample (e.g. drop `paidToProvisioned > 7 days` with a comment naming `lib/accounts.ts` as the reason).

### MD-02: Funnel conversion and drop-off render with no percent sign

**File:** `components/admin/FunnelCards.tsx:66-73`, dictionary at `lib/i18n/messages/ru.ts:480`

**Problem:** D-02 requires "conversion % от предыдущего шага, drop-off %". The component multiplies by 100 but the dictionary literal has no `%`:

```ts
analyticsFunnelConvSub: 'конверсия {conv} · отвал {drop}',
```

so a card renders «конверсия 80 · отвал 20» directly beneath a value line that is also a bare number (`countFmt.format(step.count)`). Every other rate on this page prints its unit — `RetentionCards.tsx:42`, `ChurnTable.tsx:106`, `ErrorTable.tsx:81` — so the funnel is the only block where a percentage is indistinguishable from a count.

**Fix:** put the unit in the dictionary literal (so it survives translation), not in the JSX:

```ts
analyticsFunnelConvSub: 'конверсия {conv}% · отвал {drop}%',
```

(Leave `'—'` as-is; it already renders correctly through the same interpolation.)

### MD-03: Four funnel cards do not render in one row — they wrap 3 + 1

**File:** `components/admin/FunnelCards.tsx:59`, grid constant at `components/admin/MetricCard.tsx:8`, skeleton at `app/admin/analytics/page.tsx:130`

**Problem:** D-02 locks "4 карточки в ряд", but `GRID` is three-up:

```ts
export const GRID = 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3';
```

At `lg` the fourth step (`provisioned` — the number the whole funnel exists to show) drops onto its own row at 1/3 width with 2/3 empty space beside it. The Suspense fallback (`CardsSkeleton count={4}`, which also uses `GRID`) repeats the same 3 + 1 layout, so the page visibly reflows on hydration. The contract test only counts components, so this shipped green.

**Fix:** give the funnel its own four-up grid (and use it for the skeleton):

```tsx
// FunnelCards.tsx
const FUNNEL_GRID = 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4';
```

Either export `FUNNEL_GRID` from `MetricCard.tsx` (alongside `CARD`/`GRID`, so the `CardsSkeleton` on the page can take it as a prop), or change the page's fallback to four inline `sm:col-span-…` placeholders.

### MD-04: "unknown" is both the null-group label and a real provider code — duplicate React key and two identical rows

**File:** `components/admin/ErrorTable.tsx:75` and `:77`, dictionary at `lib/i18n/messages/ru.ts:490`, producer at `lib/worker.ts:283`

**Problem:** `lib/worker.ts` writes the literal error code `"unknown"`:

```ts
await failOrder(orderId, "unknown");   // → markProvisionFailed → errorCode = 'unknown'
```

`errorBreakdown` therefore legitimately returns **two** groups — `{ code: null }` and `{ code: 'unknown' }` — and `ErrorTable` renders both as the same word:

```tsx
<tr key={row.code ?? 'unknown'}>                                    // :75
  <th …>{row.code === null ? t('admin.analyticsErrorUnknown') : row.code}</th>  // :77
```

Two consequences: (a) `key` collides whenever a real `'unknown'` group exists → React duplicate-key warning and reconciliation keyed to the wrong row; (b) the operator sees two rows labelled "unknown" with different counts, which reads as a grouping bug in the data rather than two distinct failure causes.

**Fix:** make the null sentinel structurally distinct from any provider string, in both the key and the label.

```tsx
<tr key={row.code === null ? 'code:__null__' : `code:${row.code}`}>
  <th …>{row.code === null ? t('admin.analyticsErrorUnknown') : row.code}</th>
```

```ts
// ru.ts:490 — do not reuse a value the provider itself can emit
analyticsErrorUnknown: 'не указан',
```

Raw non-null codes must stay verbatim (D-03); only the null label changes.

---

## Low Issues

### LO-01: The window is a `createdAt` cohort, but every block label reads like an event window

**File:** `lib/analytics/service.ts:587-593` (funnel / error breakdown), `:650-661` (timing); labels at `FunnelCards.tsx:52`, `ErrorTable.tsx:34`, `TimeToPayCards.tsx:46`, `TimeToProvisionCards.tsx:33`

**Problem:** All three windowed views cohort on `createdAt`, while the meta copy reuses «{n} дн. · МСК», which an operator reads as "activity in the last n days". A failed order created 31 days ago that failed inside the last 30 days is invisible in a 30-day view. The skew is bounded — payment lands within the 24h window and provisioning within hours of it, so only the boundary day is affected — but nothing in the UI states the cohort rule, and the funnel/error/timing blocks now disagree with the rest of the page (`loadKpis`, `loadMargin`, `loadRetention` window on `paidAt`/term events).

**Fix:** either state it (e.g. a dedicated `analyticsWindowCohortDays: 'созданные за {n} дн. · МСК'` key for the three new blocks), or window the error/timing loaders on the event (`updatedAt` for failures, `paidAt` for timing) and keep `createdAt` only where a funnel genuinely needs it.

### LO-02: The 24h expiry rule exists twice and the pure copy is production-dead

**File:** `lib/analytics/funnel.ts:141-148` vs `lib/analytics/service.ts:611-617`

**Problem:** `expiredCount` implements D-01 in JS, but nothing in the app calls it — only `tests/unit/analytics-funnel.test.ts` and the DB suite's cross-check. The shipped rule is a second, independent implementation in Prisma. A change to one (say, adding `<=` or excluding null-`plategaTxId` rows, see LO-06) leaves the other silently wrong and the tests green.

**Fix:** share one predicate:

```ts
// lib/analytics/funnel.ts
export function expiredWhere(now: Date = new Date(), windowMs = PAYMENT_WINDOW_MS) {
  return { status: "pending" as const, createdAt: { lt: new Date(now.getTime() - windowMs) } };
}
// service.ts
const count = await prisma.order.count({ where: expiredWhere() });
```

and keep `expiredCount` as the row-level equivalent of the same definition, or delete it and pin the rule only in SQL.

### LO-03: The two timing loaders re-run an identical query per render

**File:** `lib/analytics/service.ts:664-671` and `:678-685` (shared helper `:650-661`)

**Problem:** `loadTimeToPay` and `loadTimeToProvision` each call `loadProvisionedRows(period)`. The page mounts them in two separate Suspense boundaries (`page.tsx:145-150`), so every render issues the same `findMany` twice. Beyond the duplicate round-trip, the two blocks can report **different `orders` sample sizes** if a row is inserted between them — two cards in the same section disagreeing about the sample they describe.

**Fix:** one loader returning both pairs, or memoize per request:

```ts
import { cache } from "react";
const loadProvisionedRows = cache(async (period: 7 | 30 | 90) => { /* … */ });
```

### LO-04: `FunnelData.steps` re-declares `FunnelStepRow` instead of importing it

**File:** `lib/analytics/service.ts:567-574` vs `lib/analytics/funnel.ts:73-80`

**Problem:** The payload interface spells out the same five fields as the pure module's row type. Structural typing means a future field added to `FunnelStepRow` will not fail compilation here — the payload silently stops matching the derivation.

**Fix:** `import type { FunnelStepRow } from "./funnel"; export interface FunnelData { steps: FunnelStepRow[] }`.

### LO-05: Raw `OrderStatus` enum names embedded in Russian copy

**File:** `lib/i18n/messages/ru.ts:484` and `:491`

**Problem:** `analyticsExpiredSub: 'заказы в статусе «pending» без оплаты'` and `analyticsErrorEmpty: 'За период нет failed или canceled заказов'` expose DB enum names to the operator, while the rest of the admin surface localizes statuses (`components/PaymentStatusChip.tsx:40-70`). If the enum is ever renamed the copy silently becomes wrong (no type link between a dictionary string and the schema).

**Fix:** describe the state instead of naming it: «заказы без оплаты старше 24 ч» / «за период нет неудачных или отменённых заказов», or interpolate the localized status label.

### LO-06: Orders stranded in `pending` by a Platega create failure permanently inflate «Просроченные платежи»

**File:** `lib/analytics/service.ts:611-617` (definition per D-01), producer at `lib/orders-service.ts:249-266`, reconcile guard at `lib/orders-service.ts:555`

**Problem:** when `platega.createTransaction` throws, `createOrder` returns `{ kind: 'provider_error' }` and leaves the row `pending` with no `plategaTxId`/`paymentUrl`; `listReconcilableOrders` explicitly skips rows with a null `plategaTxId`, so such a row **never** leaves `pending`. Under D-01 (`pending && createdAt < now − 24h`) it is counted as «ждут оплаты более 24 ч» forever, even though the user was never given a payment page. D-01 is locked, so this is a definitional caveat rather than a code bug — but the card's label asserts something untrue about those rows.

**Fix:** keep D-01, but raise the question explicitly (CONTEXT amendment): either exclude `plategaTxId: null` rows in `loadExpired` (they were never payable) or add a note to the card sub-copy. If the former, add it to the shared predicate from LO-02 so both implementations move together.

### LO-07: Every hand-computed DB pin is behind a conditional that silently skips on a dirty database

**File:** `tests/unit/analytics-phase9-loaders.test.ts:186-190`, used at `:307`, `:325`, `:564`, `:613`

**Problem:** `windowIsExactly(...)` guards all exact assertions (counts `[5,4,3,2]`, `medianMs === 60_000`, etc.). On any database holding orders inside the 30-day window — dev data, a parallel suite's leftovers, a seed — the guard returns `false`, the block is skipped, and the suite is still green. What remains is `expect(data.steps).toEqual(funnelOf(await scanFunnelRows(30)))`, which re-runs a **copy of the loader's own query**; a wrong `WHERE` in both copies passes. The loader wiring assertions are therefore tautological exactly when they matter most.

**Fix:** make at least one exact pin unconditional by scoping it to fixture-owned rows (`where: { userId: { in: [ownerId, payer2Id, payer3Id] } }` inside the assertion scan), or run this file against a truncated `orders` table. Keep the identity assertions as a second layer, not the only one.

### LO-08: The 31-key contract assertion is pinned to source indentation

**File:** `tests/unit/admin-analytics-phase9-contract.test.ts:219`

**Problem:** `/^\s{4}analytics(Funnel|Error|Timing|Expired|Duration)/gm` counts keys only while they sit at exactly four spaces. Re-indenting the `admin` object, or moving the block one nesting level deeper, changes the count without any semantic change and fails the build for the wrong reason (or, after a compensating miscount, passes for the wrong reason).

**Fix:** count over the parsed object instead of the text: `import { ru } from "../../lib/i18n/messages/ru";` then `Object.keys(ru.admin).filter((k) => /^analytics(Funnel|Error|Timing|Expired|Duration)/.test(k))`.

---

## Verification Notes (what was checked and found sound)

| Check | Result |
| --- | --- |
| Funnel monotonicity at the data level | Sound. `failed` is only reachable from `paid`/`provisioning` (`orders-service.ts:528-539`), `provisioning` only from `paid` (`:483`), so `provisioned ⊆ provisioning ⊆ paid ⊆ created`; the over-count/under-count paths are declared as approximations (a)/(b) and fixture-pinned. |
| `pending → failed` without `paidAt` (would break conversion ≤ 100 %) | No such writer exists today; `createOrder` always creates `pending` (`orders-service.ts:188-202`). A future writer adding one would silently produce a >100 % conversion — worth a guard if the state machine ever grows. |
| Expired boundary | Correct: strict `<` in both implementations, point-in-time, no period, no status mutation, `windowHours` derived from `PAYMENT_WINDOW_MS`. |
| Null vs real zero | Consistent: `conversion`/`dropOff` null on zero previous step, `0`/`1` for a real zero; `TimingData` nulls on empty sample; `ExpiredData` renders a truthful `0`; components render «—» only for null. |
| Window bounds / MSK discipline | `mskDayStartInstant(windowStartDay(period))` for `timestamp(3)` columns only, no SQL-side day logic, no `@db.Date` misuse. |
| SQL correctness | All Phase 9 reads go through Prisma (`findMany`/`count`) — no `$queryRaw`, no interpolated SQL, no BigInt crossing the RSC boundary. |
| Authorization | Unchanged and intact: `requireRole('administrator','manager')` with `SessionError → /login`, `AdminError → notFound()`, re-checked in the page (not only the layout), `dynamic = 'force-dynamic'`. |
| i18n completeness | 31 keys added, all referenced through literal `t('admin.…')` calls, no Cyrillic in the five components outside comments; `i18n.test.ts` green. |
| RSC leakage | No `providerCost`/`userId`/`provider_cost` in the page or the five components; payloads carry aggregates only. |
| Typecheck / lint | `tsc --noEmit` clean; eslint clean on all new/modified files. |

**Out of scope (pre-existing, confirmed still present, not counted):** `lib/analytics/service.ts:39` unused `computeCoverage` import (Phase 7), `app/admin/analytics/page.tsx:76` unused `role` binding (pre-existing), `tests/unit/analytics-mrr.test.ts:190` (Phase 7 baseline), eslint issues in `components/admin/StatsPanel.tsx` (882be0c). Also noted but not counted: `components/admin/AnalyticsSection.tsx:3` still says "Used twice" (now five sections) — the file is outside this phase's diff.

---

_Reviewed: 2026-10-27T03:26:42Z_
_Reviewer: gsd-code-reviewer (adversarial pass)_
_Depth: deep_
