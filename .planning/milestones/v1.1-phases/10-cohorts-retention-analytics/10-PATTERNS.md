# Phase 10: Cohorts & Retention Analytics - Pattern Map

**Mapped:** 2026-10-29
**Files analyzed:** 9 (6 new + 3 modified)
**Analogs found:** 9 / 9

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `lib/analytics/cohorts.ts` (new) | utility (pure derivation) | transform | `lib/analytics/funnel.ts` | exact |
| `components/admin/CohortMatrix.tsx` (new) | component (server) | request-response | `components/admin/ChurnTable.tsx` | role-match |
| `components/admin/CohortTabs.tsx` (new) | component (client) | request-response | `components/admin/PeriodSelector.tsx` | exact |
| `tests/unit/analytics-cohorts.test.ts` (new) | test | transform | `tests/unit/analytics-funnel.test.ts` | exact |
| `tests/unit/analytics-phase10-loaders.test.ts` (new) | test | CRUD/identity | `tests/unit/analytics-phase9-loaders.test.ts` | exact |
| `tests/unit/admin-analytics-phase10-contract.test.ts` (new) | test | request-response | `tests/unit/admin-analytics-phase9-contract.test.ts` | exact |
| `lib/analytics/service.ts` (modified) | service (loaders) | CRUD/transform | itself — `loadRetention`/`loadChurnTable` (lines 488-538) | exact |
| `app/admin/analytics/page.tsx` (modified) | page/controller | request-response | itself — Suspense + `AnalyticsSection` (lines 92-157) | exact |
| `lib/i18n/messages/ru.ts` (modified) | config | transform | itself — admin analytics keys (lines 439-503) | exact |

## Pattern Assignments

### `lib/analytics/cohorts.ts` (utility, transform)

**Analog:** `lib/analytics/funnel.ts`

**Module header / purity contract** (lines 1-53): pure module, no Prisma/next/React imports; derivation core owns math, loaders own DB access. Copy the header style and "PURE module" banner. Reuse the same division-guard house style (`=== 0`, never `||`).

**Constants + interface pattern** (lines 54-71):
```typescript
/** D-01 — the 24h payment window. Hardcoded; never read from env/config. */
export const PAYMENT_WINDOW_MS = 24 * 60 * 60 * 1000;

/** The order slice the Phase 9 loaders hand to these pure derivations. */
export interface FunnelRow {
  id: string;
  status: string;
  createdAt: Date;
  paidAt: Date | null;
  ...
}
```
For Phase 10, define `COHORT_MONTHS = 12` (D-04) the same way, plus `CohortUser`, `RegistrationCohort`, `PayerCohort`, `Channel`, `DeviceBucket`, `ChannelFilter`, `DeviceFilter` interfaces per RESEARCH.md §"Pure module API". Follow the `export const` + `export interface` + `export type` ordering (constants first, then types, then functions).

**Function pattern** (lines 111-134): pure function over plain rows, exact rationals, null on zero denominator:
```typescript
export function funnelOf(rows: FunnelRow[]): FunnelStepRow[] {
  const counts: Record<FunnelStep, number> = { ... };
  return FUNNEL_STEPS.map((step, index) => {
    const count = counts[step];
    if (index === 0) return { step, count, conversion: null, dropOff: null };
    const prev = counts[FUNNEL_STEPS[index - 1]!];
    const conversion = prev === 0 ? null : count / prev;
    return { step, count, conversion, dropOff: conversion === null ? null : 1 - conversion };
  });
}
```
Copy: `prev === 0 ? null : ...` guard, `!` non-null assertions on indexed access, no rounding in the module (component does `× 100`).

**Time helpers to import** (from `lib/analytics/time.ts`): `mskMonthLabel`, `mskDayLabel`, `addMonths`, `mskDayStartInstant`. Import style:
```typescript
import { addMonths, mskDayLabel, mskMonthLabel } from "./time";
```
And term coverage from `lib/analytics/retention.ts`: `buildKeyTermEvents`, `TermEvent`. And `PaidOrderRow`, `cashOf`, `keyRefOf` from `./series`.

**No error handling** — pure module; loaders own try/catch at the component boundary.

---

### `components/admin/CohortMatrix.tsx` (component, request-response)

**Analog:** `components/admin/ChurnTable.tsx`

**Imports + formatter pattern** (lines 14-24):
```typescript
import { t } from '@/lib/i18n';
import { loadChurnTable, type ChurnTableData } from '@/lib/analytics/service';
import { CARD } from './MetricCard';

const money = new Intl.NumberFormat('ru-RU');
const pct = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });
```
For Phase 10 import `loadRegistrationCohorts`/`loadPayerCohorts` and their data types; add a `countFmt` formatter identical to `money` for the registration absolute (`{retained}/{size}`).

**Async server component with try/catch** (lines 26-36):
```typescript
export default async function ChurnTable() {
  let data: ChurnTableData;
  try {
    data = await loadChurnTable();
  } catch {
    return (
      <div className={CARD}>
        <p className="text-sm text-muted">{t('common.errorLoad')}</p>
      </div>
    );
  }
  ...
}
```
Copy exactly: `let data; try { data = await load... } catch { return error panel }`. Props: `kind: 'registration' | 'payer'`, `channel`, `deviceBucket?` (per UI-SPEC §6.2/§6.3) — branch the loader call inside.

**Scroll-region table recipe** (lines 67-72):
```tsx
<div
  role="region"
  tabIndex={0}
  aria-label={t('admin.analyticsChurnTitle')}
  className="overflow-x-auto rounded-2xl border border-line focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green"
>
  <table className="w-full min-w-[36rem] text-left text-sm">
```
Phase 10: `min-w-[60rem]` (UI-SPEC §6.6), caption `sr-only` with `admin.analyticsCohortMatrixCaption`, 14 columns (month · size · M0..M11). Copy the `role="region"` / `tabIndex={0}` / focus ring verbatim.

**Empty-state panel** (lines 53-62):
```tsx
if (empty) {
  return (
    <div className="flex flex-col gap-2">
      {header}
      <div className="rounded-2xl border border-line bg-panel p-4">
        <p className="text-sm text-muted">{t('admin.analyticsChurnEmpty')}</p>
      </div>
    </div>
  );
}
```
Phase 10 empty condition: every cohort `size === 0` (UI-SPEC Pitfall 10); render `admin.analyticsCohortEmpty`. Keep the header (h3 title + meta) above the panel.

**Header recipe** (lines 45-50):
```tsx
<div className="flex flex-wrap items-baseline justify-between gap-2">
  <h3 className="text-base font-semibold text-foreground">{t('admin.analyticsChurnTitle')}</h3>
  <span className="text-xs text-muted">{windowLabel}</span>
</div>
```
Phase 10: title = `admin.analyticsCohortRegMatrixTitle` / `admin.analyticsCohortPayerMatrixTitle`, meta = `admin.analyticsCohortMeta`.

**Row mapping** (lines 98-113): `<tr key={row.month}>` with `<th scope="row">` month cell (`mmYYYY` formatter, lines 21-24) and `<td>` cells. Copy the `scope="row"` month header + `tabular-nums` cells. Add the tinted cell `<div>` per UI-SPEC §6.2/§6.3 (inline `linear-gradient(180deg, rgba(183,255,69,0.04), rgba(183,255,69,${v*0.32}))`).

**No `'use client'`** — server component (phase-9 contract test enforces).

---

### `components/admin/CohortTabs.tsx` (component, request-response)

**Analog:** `components/admin/PeriodSelector.tsx`

**Whole file** (lines 1-43) — clone verbatim, parameterize:
```tsx
'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { t } from '@/lib/i18n';

export default function PeriodSelector({ selected = 30 }: { selected?: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function choose(days: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('period', String(days));
    router.replace(`${pathname}?${params.toString()}`);
    router.refresh();
  }
  ...
}
```
Phase 10 changes: accept `param`, `label`, `options` (readonly string[]), `labels` (Record<string,string>) instead of a single selected number; read `current = searchParams.get(param) ?? 'all'`; active = `options.includes(current) ? current : 'all'`; `choose(value)` sets `params.set(param, value)`. Keep the `router.replace` + `router.refresh()` mechanism, the `role="group"` + `aria-pressed` buttons, `h-11` touch targets, and the active/inactive class strings (`bg-foreground ... text-lime` vs `border border-line`). The exact `CohortTabs` implementation is fully specified in UI-SPEC §6.4 — copy that block.

---

### `tests/unit/analytics-cohorts.test.ts` (test, transform)

**Analog:** `tests/unit/analytics-funnel.test.ts`

**Imports + fixture helpers** (lines 7-43):
```typescript
import { describe, expect, it } from "vitest";
import { ... } from "../../lib/analytics/funnel";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function row(overrides: Partial<FunnelRow> & Pick<FunnelRow, "createdAt">): FunnelRow {
  const base = { id: "o", status: "pending", paidAt: null, ... };
  ...
  return { ...base, ...overrides, createdAt, updatedAt: overrides.updatedAt ?? createdAt };
}
```
Copy: pure vitest, no DB/mocks; build row factories with `Partial<T> & Pick<T, required>`; pin `NOW` as a fixed instant. Phase 10 tests `channelOf`, `deviceBucketOf`, `buildRegistrationCohorts`, `buildPayerCohorts`, `trailingCohortMonths` per RESEARCH.md edge cases (empty period, single-user cohort, zero denominator, trial keys, device upgrade stability, gap returns, no-paid-orders user, MSK boundaries).

---

### `tests/unit/analytics-phase10-loaders.test.ts` (test, CRUD/identity)

**Analog:** `tests/unit/analytics-phase9-loaders.test.ts`

**Harness** (lines 18-93): `afterAll`/`beforeAll`/`beforeEach`, `cleanup()` deleting ticketCompensation → ticket → order → keyCache → user for fixture telegramIds; `ensureUsers()` upserting users; fixture telegram-id range (Phase 9 uses `20000044x` — Phase 10 should pick a fresh range, e.g. `20000045x`, to avoid collisions).

**Identity pattern** (lines 147-191 + 249-251): re-run the loader's own scan and derive expected via the pure module:
```typescript
const rows = await scanFunnelRows(30);
expect(data.steps).toEqual(funnelOf(rows));
```
Phase 10: scan users + paid orders, rebuild expected cohorts with `buildRegistrationCohorts`/`buildPayerCohorts`, assert `data.cohorts === expected`. Include `windowIsExactly(rows, ids)` guards before hand-computed assertions.

**Order factory** (lines 113-145): `makeOrder(userId, overrides)` with `status`, `createdAt`, `paidAt`, `updatedAt`, `errorCode`, `provisionedKeyId`. Phase 10 needs orders with `finalAmount`, `balanceUsed`, `days`, `devices`, `promoCode`, `kind` — extend the factory accordingly (see `ORDER_SELECT` in service.ts for the column set).

---

### `tests/unit/admin-analytics-phase10-contract.test.ts` (test, request-response)

**Analog:** `tests/unit/admin-analytics-phase9-contract.test.ts`

**RBAC scaffold** (lines 23-122): hoisted session token, `vi.mock("next/headers")`, `ADMIN_TELEGRAM_IDS` env, `authorize()`/`cleanup()`, `callPage()` returning `{ ok }` or `{ digest }`. Fresh adminUser id range (Phase 9 uses `910000451-454`; Phase 10 should pick a new range, e.g. `910000461-464`).

**Composition assertions** (lines 147-181): source-level pins:
```typescript
expect(PAGE_SOURCE).toContain("requireRole('administrator', 'manager')");
expect(PAGE_SOURCE).toContain("dynamic = 'force-dynamic'");
const suspenses = PAGE_SOURCE.match(/<Suspense fallback=\{/g) ?? [];
expect(suspenses.length).toBe(15); // +2 over phase 9's 13
```
Phase 10: assert the two new sections sit strictly below `TimeToProvisionCards`/`ChurnTable`; assert `ChartSkeleton className="h-64"` count rises by 2 (to 4 total: churn + error + 2 matrices); assert `CohortTabs`/`CohortMatrix` imports; assert no `'use client'` in `CohortMatrix.tsx`; assert no-leak scan (`providerCost|provider_cost|userId`) over page + new components.

**i18n key count** (lines 217-223): regex count of new keys:
```typescript
const re = /^\s{4}analytics(Funnel|Error|Timing|Expired|Duration)/gm;
const matches = RU_SOURCE.match(re) ?? [];
expect(matches.length).toBe(31);
```
Phase 10: count the 14 `analyticsCohort*` / `analyticsRegCohort*` / `analyticsPayerCohort*` keys (exact set per UI-SPEC Copywriting).

---

### `lib/analytics/service.ts` (modified — add `loadRegistrationCohorts` + `loadPayerCohorts`)

**Analog:** existing `loadRetention` (lines 488-509) and `loadChurnTable` (lines 515-538) in the same file.

**Loader pattern** (lines 488-509):
```typescript
export async function loadRetention(period: 7 | 30 | 90): Promise<RetentionData> {
  const now = new Date();
  const [ordersRaw, keyState] = await Promise.all([loadPaidOrders(), loadKeyCacheState()]);
  const orders = withoutTrialOrders(ordersRaw, keyState.trialRefs);
  const events = buildKeyTermEvents(orders, keyState.liveExpiry);
  const result = retentionForWindow(events, orders, { start: ..., endExclusive: now, now });
  return { renewalRate: result.renewalRate, ... };
}
```
Copy: `const now = new Date()`, `Promise.all([loadPaidOrders(), prisma.user.findMany(...)])`, trial filter via `withoutTrialOrders`, `buildKeyTermEvents` for registration coverage. New interfaces `RegistrationCohortData` / `PayerCohortData` follow the existing `*Data` interface style (lines 101-317).

**User select** (new, per RESEARCH.md loader wiring):
```typescript
prisma.user.findMany({ select: { id: true, createdAt: true, referredById: true, pendingPromo: true } })
```

**Paid-order → cohort input mapping** (RESEARCH.md §"Loader wiring"):
```typescript
const terms = events.map((e) => ({ userId: e.op.userId, termStart: e.start, termEnd: e.end }));
const ordersForChannel = paidOrders.map((o) => ({ userId: o.userId, promoCode: o.promoCode }));
```
Payer loader: `paidOrders.map((o) => ({ userId: o.userId, paidAt: o.paidAt!, cash: cashOf(o), devices: o.devices, promoCode: o.promoCode })).filter(o => o.paidAt)`.

**Trial filter helper** (lines 338-348):
```typescript
function withoutTrialOrders(orders: PaidOrderRow[], trialRefs: Set<string>): PaidOrderRow[] {
  if (trialRefs.size === 0) return orders;
  return orders.filter((o) => {
    const ref = keyRefOf(o);
    return !ref || !trialRefs.has(ref);
  });
}
```
Reuse verbatim. `loadKeyCacheState` (lines 322-336) gives `trialRefs` + `liveExpiry`.

**Cash helper** import already present: `cashOf` from `./series` (line 44). `ORDER_SELECT` (lines 85-98) reused via `loadPaidOrders()` (line 118).

---

### `app/admin/analytics/page.tsx` (modified — two new sections)

**Analog:** itself (lines 92-157).

**searchParams parsing** (lines 88-90):
```typescript
const params = await (searchParams ?? Promise.resolve({ period: undefined }));
const rawPeriod = Number(params.period ?? 30);
const period = rawPeriod === 7 || rawPeriod === 90 ? rawPeriod : 30;
```
Phase 10: extend searchParams type to `{ period?: string; regCh?: string; payCh?: string; payDev?: string }` and whitelist each:
```typescript
const rawRegCh = params.regCh;
const regCh = (['all','referral','promo','organic'] as const).includes(rawRegCh as any) ? rawRegCh! : 'all';
```
(same for `payCh`, and `payDev` against `['all','1','2','3','4','5+']`).

**Section wiring** (UI-SPEC §6.1, after the timing section, lines 147-154):
```tsx
<AnalyticsSection title={t('admin.analyticsTimingTitle')}>
  ...
</AnalyticsSection>
```
Append:
```tsx
<AnalyticsSection title={t('admin.analyticsRegCohortTitle')}>
  <CohortTabs param="regCh" label={t('admin.analyticsCohortChannelLabel')}
              options={['all', 'referral', 'promo', 'organic']}
              labels={{ all: t('admin.analyticsCohortTabAll'), referral: t('admin.analyticsCohortTabReferral'),
                        promo: t('admin.analyticsCohortTabPromo'), organic: t('admin.analyticsCohortTabOrganic') }} />
  <Suspense fallback={<ChartSkeleton className="h-64" />}>
    <CohortMatrix kind="registration" channel={regCh} />
  </Suspense>
</AnalyticsSection>

<AnalyticsSection title={t('admin.analyticsPayerCohortTitle')}>
  <div className="flex flex-col gap-2">
    <CohortTabs param="payCh" label={t('admin.analyticsCohortChannelLabel')} ... />
    <CohortTabs param="payDev" label={t('admin.analyticsCohortDevicesLabel')}
                options={['all', '1', '2', '3', '4', '5+']}
                labels={{ all: t('admin.analyticsCohortTabAll') }} />
  </div>
  <Suspense fallback={<ChartSkeleton className="h-64" />}>
    <CohortMatrix kind="payer" channel={payCh} deviceBucket={payDev} />
  </Suspense>
</AnalyticsSection>
```

**Imports to add** (lines 22-36): `CohortTabs` from `@/components/admin/CohortTabs`, `CohortMatrix` from `@/components/admin/CohortMatrix`. Keep the `requireRole` guard (lines 77-84) and `export const dynamic = 'force-dynamic'` (line 42) unchanged.

**Suspense count:** page goes from 13 to 15 (two new `ChartSkeleton className="h-64"` boundaries).

---

### `lib/i18n/messages/ru.ts` (modified — add 14 keys)

**Analog:** itself (lines 439-503, admin analytics keys).

**Existing key block** (lines 464-472):
```typescript
analyticsChurnTitle: 'Удержание по месяцам',
analyticsChurnCaption: 'Удержание и отток по месяцам, МСК. Суммы — в рублях.',
...
analyticsChurnEmpty: 'Пока нет истёкших подписок: ...',
```
Phase 10: append 14 new keys to the `admin` object, after the timing keys (lines 493-503), using the exact copy from UI-SPEC Copywriting:
```
analyticsRegCohortTitle: 'Когорты по регистрации',
analyticsPayerCohortTitle: 'Когорты по первой оплате',
analyticsCohortRegMatrixTitle: 'Удержание по регистрации',
analyticsCohortPayerMatrixTitle: 'Выручка по когортам плательщиков',
analyticsCohortMatrixCaption: 'Когортная матрица, МСК. Доля удержания по месяцам.',
analyticsCohortSize: 'Размер',
analyticsCohortMeta: '12 мес. · МСК · не зависит от периода',
analyticsCohortChannelLabel: 'Канал',
analyticsCohortDevicesLabel: 'Устройства',
analyticsCohortTabAll: 'Все',
analyticsCohortTabReferral: 'Реферал',
analyticsCohortTabPromo: 'Промокод',
analyticsCohortTabOrganic: 'Органика',
analyticsCohortEmpty: 'Пока нет данных для когорт: матрица заполнится после первых регистраций и оплат.',
```
Match the 4-space indent + trailing comma style (lines 439-503). Reuse (do not duplicate): `common.errorLoad`, `admin.analyticsTableMonth`, `admin.analyticsWaterfallWindowSingle`, `admin.analyticsWaterfallWindowMonths`, `admin.analyticsWindowDays`.

## Shared Patterns

### Authentication / role guard
**Source:** `app/admin/analytics/page.tsx` lines 77-84
**Apply to:** page (unchanged); new components inherit via RSC tree.
```tsx
let role: string | null = null;
try {
  ({ role } = await requireRole('administrator', 'manager'));
} catch (err) {
  if (err instanceof SessionError) redirect('/login');
  if (err instanceof AdminError) notFound();
  throw err;
}
```

### Error handling (block-level)
**Source:** `components/admin/ChurnTable.tsx` lines 27-36
**Apply to:** `CohortMatrix.tsx`
```tsx
let data: ChurnTableData;
try {
  data = await loadChurnTable();
} catch {
  return (<div className={CARD}><p className="text-sm text-muted">{t('common.errorLoad')}</p></div>);
}
```

### Trial filtering
**Source:** `lib/analytics/service.ts` lines 338-348 (`withoutTrialOrders`) + `loadKeyCacheState` lines 322-336
**Apply to:** both new loaders — run paid orders through `withoutTrialOrders` before `buildKeyTermEvents` (registration) so trial keys never leak into retention.

### MSK month math
**Source:** `lib/analytics/time.ts` (whole file)
**Apply to:** `cohorts.ts` — `mskMonthLabel(mskDayLabel(instant))` for month labels, `addMonths` for offsets, string comparison for reachability (`targetMonth <= currentMonth`).

### Segmented control (URL-driven)
**Source:** `components/admin/PeriodSelector.tsx` (whole file)
**Apply to:** `CohortTabs.tsx` — `router.replace` + `router.refresh()`, `role="group"` + `aria-pressed`.

### Scroll-region table
**Source:** `components/admin/ChurnTable.tsx` lines 67-72
**Apply to:** `CohortMatrix.tsx` — `role="region"`, `tabIndex={0}`, `overflow-x-auto`, focus ring.

## No Analog Found

None — every new file has a close in-repo analog (pure module → funnel.ts; server table → ChurnTable.tsx; client tabs → PeriodSelector.tsx; tests → phase 9 tests; loaders → existing loaders in service.ts; page/i18n → themselves).

## Metadata

**Analog search scope:** `lib/analytics/`, `components/admin/`, `tests/unit/`, `app/admin/analytics/`, `lib/i18n/messages/`
**Files scanned:** ~30 (analytics modules, admin components, contract/loader tests, page, i18n, schema)
**Pattern extraction date:** 2026-10-29