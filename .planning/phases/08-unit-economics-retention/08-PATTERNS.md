# Phase 8: Unit Economics & Retention — Pattern Map

**Mapped:** 2026-10-22
**Files analyzed:** 15 (8 new + 3 modified + 4 test-first)
**Analogs found:** 15 / 15 (every new file maps to an existing analytics/component/test analog; no new npm packages)

All analog paths below are git-TRACKED source (verified `git ls-files` — none are mirror/gitignored paths).

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `lib/analytics/retention.ts` (new) | service (pure) | transform | `lib/analytics/series.ts` `buildKeyTerms` cursor (:82-119) + `lib/analytics/waterfall.ts` module shape | exact (same cursor math, guaranteed by invariant test) |
| `lib/analytics/economics.ts` (new) | service (pure) | transform | `lib/analytics/mrr.ts` (pure ratio helpers :152-175) + `series.ts` `cashOf` | role-match (exact money helpers) |
| `lib/analytics/service.ts` (modify) | service | request-response | itself — `loadKpis` (:100-144), `loadWaterfall` (:154-178), DISTINCT payers SQL (:115-120) | exact (self) |
| `components/admin/AnalyticsSection.tsx` (new) | component (server) | request-response | `components/admin/MetricCard.tsx` (shared presentational extraction) + block-header recipe from `MrrWaterfall.tsx:152-157` | exact |
| `components/admin/LtvCards.tsx` (new) | component (server) | request-response | `components/admin/AnalyticsKpi.tsx` (try/catch + GRID + «—»-on-null) | exact |
| `components/admin/MarginCards.tsx` (new) | component (server) | request-response | `components/admin/AnalyticsKpi.tsx` (period prop + windowed coverage meta) | exact |
| `components/admin/BurnRunwayCards.tsx` (new) | component (server) | request-response | `components/admin/AnalyticsKpi.tsx` + `lib/artemida.ts:641` `getBalance` | exact |
| `components/admin/RetentionCards.tsx` (new) | component (server) | request-response | `components/admin/AnalyticsKpi.tsx` (three-period-windowed cards) | exact |
| `components/admin/ChurnTable.tsx` (new) | component (server) | request-response | `components/admin/MrrWaterfall.tsx` (window slots, header, empty state, sr-only table) | role-match (visible-table markup itself is prescriptive UI-SPEC §6.6) |
| `app/admin/analytics/page.tsx` (modify) | page | request-response | itself — `page.tsx` (:34-49 skeletons, :76-84 Suspense) | exact (self) |
| `lib/i18n/messages/ru.ts` (modify) | config | config | itself — `admin` block `analytics*` keys (:395-426) | exact (self) |
| `tests/unit/analytics-retention.test.ts` (new) | test | pure | `tests/unit/analytics-waterfall.test.ts` (`row()` factory fixture, no DB) | exact |
| `tests/unit/analytics-economics.test.ts` (new) | test | pure | `tests/unit/analytics-mrr.test.ts` / `analytics-waterfall.test.ts` | exact |
| `tests/unit/analytics-phase8-loaders.test.ts` (new) | test | DB-backed | `tests/unit/analytics-rollup.test.ts` (OWNER id range, `cleanup()`, `makeOrder()`, `vi.spyOn(artemida)`) | exact |
| `tests/unit/admin-analytics-phase8-contract.test.ts` (new) | test | DB-backed + source-contract | `tests/unit/admin-analytics-page.test.ts` (RBAC digests + `readFileSync` scans) | exact |

---

## Pattern Assignments

### `lib/analytics/retention.ts` (pure — term events, grace, window metrics)

**Analog:** `lib/analytics/series.ts:82-119` (`buildKeyTerms` — the cursor this module mirrors byte-for-byte) and `lib/analytics/waterfall.ts:1-28` (module-header doc-comment + pure/no-Prisma-import shape).

**Module contract to copy** (from `waterfall.ts:1-27` and `series.ts:1-21`): a module-header comment stating money semantics, the term-chain cursor rule, D-06's "each term-end event, not just final termEnd", and the trial-filter + bonus-override caveats. Pure module — **no Prisma import, no `next/*`, no React** (Pattern 1).

**The cursor to mirror EXACTLY — copy from `series.ts:103-108` (never a divergent `paidAt + days` loop):**
```ts
// lib/analytics/series.ts:103-108 (buildKeyTerms — the ONE shared cursor)
let cursorMs: number | null = null;
for (const op of chain) {
  const paidAtMs = (op.paidAt as Date).getTime();
  // A renew extends from the current expiry (never earlier than its own
  // paidAt) instead of restarting the term.
  cursorMs = Math.max(cursorMs ?? paidAtMs, paidAtMs) + (op.days as number) * DAY_MS;
}
```

**`buildKeyTermEvents` — prescriptive implementation in 08-RESEARCH.md §Code Examples (lines 507-554), copy verbatim.** It reuses the exact grouping/filter/sort conventions from `buildKeyTerms` (`series.ts:94-101`): group by `keyRef`, filter chain ops to `(kind === 'new' || kind === 'renew') && days !== null`, sort by `paidAt`; additionally emits `start`, `end`, `days`, `op`, `nextPaidAt` per event. Key identity is `keyRefOf` from `lib/analytics/mrr.ts:47-49`:
```ts
export function keyRefOf(o: { keyId: string | null; provisionedKeyId: string | null }): string | null {
  return o.keyId ?? o.provisionedKeyId ?? null;
}
```

**Imports pattern for the module:**
```ts
import type { PaidOrderRow } from './series';      // type-only, like mrr.ts:42
import { keyRefOf, totalMrrAt } from './mrr';
import { addMonths, mskDayLabel, mskDayStartInstant, mskMonthLabel } from './time';
```

**Grace classification (D-05, inclusive boundary `<=` — pin with a ±1 ms fixture):**
```ts
// 08-RESEARCH.md §Derivation 1 (classifyTerm) — copy verbatim
export type TermOutcome = 'open' | 'renewed' | 'pending' | 'churned';
export function classifyTerm(e: TermEvent, now: Date, graceMs = 7 * DAY_MS): TermOutcome {
  if (e.end.getTime() > now.getTime()) return 'open';
  if (e.nextPaidAt && e.nextPaidAt.getTime() <= e.end.getTime() + graceMs) return 'renewed'; // inclusive (D-05)
  if (now.getTime() < e.end.getTime() + graceMs) return 'pending';                            // [ASSUMED — A5]
  return 'churned';
}
```

**Trial filter (D-10) — DB-side in `service.ts`, pure side trusts input rows** (Phase 7 contract, `service.ts:48-51`): load `prisma.keyCache.findMany({ select: { keyId, isTrial, expiresAt } })`, drop orders whose `keyRefOf(op)` is in `trialRefs` **before** building events. Bonus-day liveness override (A2): extend only the **latest** event per keyRef from `KeyCache.expiresAt` when it is later (`retention.ts` receives a `Map<string, Date>` — never imports prisma).

**Invariant test vs `buildKeyTerms`** (Pattern 2 guard — for every keyRef, `events.at(-1)!.end.getTime() === buildKeyTerms(paid).get(keyRef)!.termEnd.getTime()`).

---

### `lib/analytics/economics.ts` (pure — LTV / margin / burn / runway arithmetic)

**Analog:** `lib/analytics/mrr.ts:152-175` — pure helpers over numbers, `null` on zero denominator, exact rationals, module comment pins the money base. **No Prisma import.**

**Money base — copy `cashOf` by import, never re-derive (`series.ts:41-43`):**
```ts
export function cashOf(row: { finalAmount: number; balanceUsed: number }): number {
  return Math.max(0, row.finalAmount - row.balanceUsed);
}
```

**Division guards — `mrr.ts:162-164` is the house style (`null`, never `||`-fabrication, never `0` for missing):**
```ts
export function computeArppu(windowCashRub: number, payingUsers: number): number | null {
  return payingUsers === 0 ? null : windowCashRub / payingUsers;
}
```

**Formulas to implement (08-CONTEXT §Specifics, all compositions of existing primitives — do not re-invent):**
- LTV gross (hist) = Σ `cashOf(all PAID)` ÷ DISTINCT payers → `null` on 0 payers (D-01)
- LTV gross (pred) = `computeArppu(30dCash, 30dPayers)` ÷ logoChurnRate(30d) → `null` on churn `null`/0 (D-02)
- LTV net = Σ(cashOf − providerCost) over `providerCost !== null` subset ÷ DISTINCT payers in that subset (D-03)
- margin = Σ(cashOf − providerCost), marginPct = margin ÷ ΣcashOf, costPerKey = Σcost ÷ costedOrders — **same costed subset** (D-11/D-12/D-13)
- burn = ΣproviderCost(30 MSK days) ÷ 30 with full-coverage + ≥7-distinct-days gates (D-14); runway = `Math.floor(balance / burn)` on the **exact** burn (never pre-rounded; Pitfall 7)

**PRE-ROUNDING BANS (Pitfall 7):** payloads carry exact rationals; `Math.round`/`Intl`/`× 100` happen in the component only.

---

### `lib/analytics/service.ts` (modify — five new loaders)

**Analog: the file itself — copy the loader skeleton (`loadKpis`, `loadWaterfall`) verbatim:**

**PAID + ORDER_SELECT + window helpers stay one definition (`service.ts:48-91`, unchanged):**
```ts
// service.ts:51-53, 56-69, 85-91
const PAID = ["paid", "provisioning", "provisioned"] as const;
const DAY_MS = 86_400_000;
const ORDER_SELECT = { id: true, userId: true, kind: true, days: true, devices: true,
  finalAmount: true, balanceUsed: true, providerCost: true, keyId: true,
  provisionedKeyId: true, paidAt: true, status: true } as const;
function windowStartDay(period: 7 | 30 | 90): string {
  return mskDayLabel(new Date(Date.now() - (period - 1) * DAY_MS));
}
async function loadPaidOrders(): Promise<PaidOrderRow[]> {
  return prisma.order.findMany({ where: { status: { in: [...PAID] } }, select: ORDER_SELECT });
}
```
New loaders reuse `loadPaidOrders()` + a windowed `prisma.order.findMany({ where: { status: { in: [...PAID] }, paidAt: { gte: fromInstant } }, select: … })` exactly as `loadKpis` does at `service.ts:106-110`.

**DISTINCT payers — the only aggregate raw SQL, copy `::int` pattern from `service.ts:115-120`:**
```sql
SELECT COUNT(DISTINCT user_id)::int AS payers
FROM orders
WHERE status IN ('paid', 'provisioning', 'provisioned')
  AND paid_at >= ${pgTimestamp(fromInstant)}
```
LTV net adds `AND provider_cost IS NOT NULL`; all-time gross drops the predicate. Always `::int` (BigInt breaks the RSC payload — Pitfall 6). At MVP scale compute all-time cash/payers from the `loadPaidOrders()` array in JS (RESEARCH §Derivation 3) — `cashOf` stays the only money formula; add the `$queryRaw` branch only if rows grow.

**Month-slot derivation — extract `trailingMonthLabels(orders, now)` from `loadWaterfall`'s exact math (`service.ts:154-178`):** current month from `mskMonthLabel(mskDayLabel(new Date()))`, first paid month from earliest `paidAt`, `slots = Math.min(6, Math.max(1, span))`, labels `for (let i = slots - 1; i >= 0; i--) labels.push(mskMonthLabel(addMonths(currentMonth, -i)))`. `ChurnTable` and `Waterfall` share it — **do not change `loadWaterfall`'s output**.

**`loadBurnRunway` — the only ARTEMIDA call; copy the isolated-balance pattern (08-RESEARCH.md §Code Examples, lines 566-582).** Run the balance in the loader, not the component, and catch it there:
```ts
const balance = await artemida.getBalance()      // lib/artemida.ts:641
  .then((b) => (b.unlimited ? null : b.balance)) // Balance { balance; currency; unlimited } — artemida.ts:312-316
  .catch(() => null);                            // D-15: provider outage never rejects the loader
```
`runwayReason: 'no-burn' | 'no-balance' | null` drives the sub-line (UI-SPEC §6.4). A real zero burn is `0`, not `null` — the component maps `burn <= 0` to «расхода нет».

**Payload shapes are pinned in 08-UI-SPEC §6.7 (`loadLtv`, `loadMargin`, `loadBurnRunway`, `loadRetention`, `loadChurnTable`) — implement exactly; `null` is the only unknown sentinel; `0` is always real.**

---

### `components/admin/AnalyticsSection.tsx` (presentational, server)

**Analog:** `MetricCard.tsx` (shared presentational module with exported string constants) + block-header recipe from `MrrWaterfall.tsx:152-157`.

**Copy the §6.1 anatomy verbatim (it is only ~6 lines):**
```tsx
// 08-UI-SPEC §6.1 — the only new structural element on the page
<section aria-label={title} className="flex flex-col gap-4 border-t border-line pt-6">
  <h2 className="text-xl font-semibold text-foreground">{title}</h2>
  {children}
</section>
```
Props: `{ title: string; children: React.ReactNode }`. No `'use client'`. Used twice on the page.

---

### `components/admin/LtvCards.tsx` / `MarginCards.tsx` / `RetentionCards.tsx` (async server components)

**Analog: `components/admin/AnalyticsKpi.tsx` — copy the entire degradation skeleton + card grid.**

**Degradation skeleton (`AnalyticsKpi.tsx:19-29`, every block repeats this):**
```tsx
let data: LtvData;
try {
  data = await loadLtv();
} catch {
  return (
    <div className={CARD}>
      <p className="text-sm text-muted">{t('common.errorLoad')}</p>
    </div>
  );
}
```

**Block header recipe (`MrrWaterfall.tsx:152-157` / `MrrSparkline.tsx:42-51`) — heading survives a failure, meta is dropped when data-derived:**
```tsx
<div className="flex flex-wrap items-baseline justify-between gap-2">
  <h3 className="text-base font-semibold text-foreground">{title}</h3>  {/* 16px/600 — the ONE new type role, UI-SPEC §Typography */}
  <span className="text-xs text-muted">{windowMeta}</span>
</div>
```

**Card grid — import CARD/GRID from `MetricCard.tsx:7-8` (`'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3'`), all cards `size="compact"`, values `Intl.NumberFormat('ru-RU')` + `₽`, «—» on `null` — exactly `AnalyticsKpi.tsx:44-71`.**

- **LtvCards:** no props; block meta `t('admin.analyticsLtvMeta')` (the window is per-card — D-04); card 2 sub shows the monthly churn rate divisor; card 3 sub date from `coverageFrom` (`net === null` → `analyticsLtvNetNoCost`, date never fabricated — A4).
- **MarginCards({ period }):** meta is the coverage badge: `totalOrders > 0` → `t('admin.analyticsWindowCoverage', { n: period, known, total })`, else `t('admin.analyticsWindowCoverageNoOrders', { n: period })` (`MarginCards` header styles identical to `AnalyticsKpi.tsx:31-42`'s three-way coverage ternary but rendered as one meta line). Negative margin renders the Intl minus sign in `text-foreground` — no red, it is not an error (UI-SPEC §Color).
- **RetentionCards({ period }):** meta `t('admin.analyticsWindowDays', { n: period })`; absolute counts ALWAYS in the subs (D-08) even when the rate is «—»; no color semantics on churn values.

---

### `components/admin/BurnRunwayCards.tsx` (async server component — the only balance caller)

**Analog:** `AnalyticsKpi.tsx` for the degradation skeleton; layout is a **2-up grid**, not GRID: `'grid grid-cols-1 gap-4 sm:grid-cols-2'` (UI-SPEC §6.4).

- Calls `loadBurnRunway()` only; **never calls `artemida` directly** — the balance is inside the loader with `.catch(() => null)` (D-15, Pitfall 8). A provider outage renders the burn card from DB data + runway sub `t('admin.analyticsRunwayNoBalance')`.
- Runway sub states (§6.4):
  - `balance !== null && burn > 0` → `t('admin.analyticsRunwaySub', { balance: money.format(balance), burn: money.format(burn) })` — values from the payload, not re-fetched
  - `burn === null || burn <= 0` → `t('admin.analyticsRunwayNoBurn')`
  - `balance === null` → `t('admin.analyticsRunwayNoBalance')`
- `runwayDays` is already floored in the loader (exact burn); the component just appends « дн.».

---

### `components/admin/ChurnTable.tsx` (async server component)

**Analog:** `components/admin/MrrWaterfall.tsx` — window-label derivation (:135-140), empty state (:159-168), header (:152-157), table markup (:214-239). The **visible** table markup itself is prescriptive UI-SPEC §6.6 (no in-repo visible table exists — waterfall's is `sr-only`).

**Window label — never hardcoded, copy `MrrWaterfall.tsx:137-140`:**
```tsx
const windowLabel =
  months.length === 1
    ? t('admin.analyticsWaterfallWindowSingle')
    : t('admin.analyticsWaterfallWindowMonths', { n: months.length });
```

**Empty state = every rendered month has `expiring === 0` — copy `MrrWaterfall.tsx:159-168` shape:** heading + panel with `text-sm text-muted` + `t('admin.analyticsChurnEmpty')`. A single empty month inside a populated window is NOT empty — it keeps its row.

**Table recipe (visible, accessible — UI-SPEC §6.6, copy the markup):**
```tsx
<div role="region" tabIndex={0} aria-label={t('admin.analyticsChurnTitle')}
     className="overflow-x-auto rounded-2xl border border-line focus-visible:outline-2
                focus-visible:outline-offset-2 focus-visible:outline-green">
  <table className="w-full min-w-[36rem] text-left text-sm">
    <caption className="sr-only">{t('admin.analyticsChurnCaption')}</caption>
    <thead className="bg-panel text-xs uppercase text-muted">
      <tr><th scope="col" className="px-4 py-3">…</th></tr>
    </thead>
    <tbody className="divide-y divide-line">
      <tr><th scope="row" className="px-4 py-3 font-normal text-muted">07.2026</th>
          <td className="px-4 py-3 text-right tabular-nums">…</td></tr>
    </tbody>
  </table>
</div>
```
Six columns in order: `analyticsTableMonth` (reused), `analyticsColExpiring`, `analyticsColRenewed`, `analyticsColRenewalPct` («—» when `expiring === 0`, never `0%`), `analyticsColChurned`, `analyticsColLostMrr`. Month label `MM.YYYY` — format via `MrrWaterfall.tsx:34-37`'s `monthFull()` helper shape. No hover, no zebra, no sort.

---

### `app/admin/analytics/page.tsx` (modify)

**Analog: itself.** Append after `<MrrSparkline period={period} />` (:82-84) exactly the §6.1 composition; nothing above moves (D-17).

**`CardsSkeleton` — add next to `KpiSkeleton`/`ChartSkeleton` (:34-49):**
```tsx
// page.tsx §6.1 loading
function CardsSkeleton({ count, twoUp }: { count: number; twoUp?: boolean }) {
  return (
    <div className={twoUp ? 'grid grid-cols-1 gap-4 sm:grid-cols-2' : GRID} aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="h-32 animate-pulse rounded-2xl bg-foreground/5" />
      ))}
    </div>
  );
}
```
Five new `<Suspense>` boundaries: `LtvCards` (count=3), `MarginCards period={period}` (count=3), `BurnRunwayCards` (count=2, twoUp) inside the «Юнит-экономика» `AnalyticsSection`; `RetentionCards period={period}` (count=3) + `ChurnTable` (`ChartSkeleton className="h-64"`) inside «Удержание». Guard / `force-dynamic` / period normalization (:52-65) unchanged.

---

### `lib/i18n/messages/ru.ts` (modify)

**Analog: itself.** Add exactly the **44 keys** enumerated in 08-UI-SPEC §Copywriting (:513-557, 43 locked + `analyticsLtvGrossHistSubActive`, the D-01 under-amortization marker) to the flat `admin` object, after the existing `analytics*` block (ru.ts:395-426, near `analyticsTableMrr`). Reused (do not duplicate): `common.errorLoad` (:655), `admin.analyticsTableMonth` (:423), `admin.analyticsWaterfallWindowSingle` (:410), `admin.analyticsWaterfallWindowMonths` (:411).

**Landmine (Pitfall 10):** `tests/unit/i18n.test.ts` regex-scans `app/`, `components/`, `lib/` and fails on unused AND missing keys; a dynamically built key (`t('admin.' + x)`) counts as unused. Every key must be referenced by a literal `t('…')` / `tp('…')` call in the new components.

---

### Tests (4 new files)

**Pure suites — harness copied from `tests/unit/analytics-waterfall.test.ts:1-30`** (no DB, `describe/expect/it` from vitest, `row()` factory with `Partial<PaidOrderRow> & Pick<PaidOrderRow, "paidAt">`, relative imports `../../lib/analytics/…`):

- **`tests/unit/analytics-retention.test.ts`** — the phase's safety net (Wave 0). Boundary fixture from 08-RESEARCH.md §Code Examples (:556-564): new 06-10 +30d → end 07-10; renew paid exactly `end + 7d` → `renewed`; `+1 ms` → `churned` once grace elapses; upgrade (days null) → NOT a renewal; bonus/wallet renew → `renewed` with 0 lost MRR; trial excluded; multi-term 90-day window counts BOTH term ends; cohort clamp (`churnedKeys ≤ activeAtStart`); month slots match `loadWaterfall`; `buildKeyTermEvents` invariant vs `buildKeyTerms`. Do NOT touch `tests/unit/analytics-mrr.test.ts` — line 190 is a **pre-existing red test** (stale pre-CR-01 expectation; RESEARCH §Pitfall 11). Phase gate = "no new failures", not "zero failures".
- **`tests/unit/analytics-economics.test.ts`** — LTV gross/net/predictive (null denominators), margin over costed subset only (wallet-only row → negative margin; 0 costed → all null), costPerKey = Σcost ÷ costedOrders, burn coverage rules (100 % + ≥ 7 distinct days), real zero burn = 0, runway `floor(balance/exactBurn)`, `providerCost = null` never zero-filled.

**DB-backed loader suite — harness copied from `tests/unit/analytics-rollup.test.ts:1-69`:** fresh OWNER `BigInt("2000003xx")` range, `cleanup()` deleting `ticketCompensation → ticket → order → keyCache → user` + `dailyMetric`, `makeOrder()` fixture factory, `vi.spyOn(artemida, 'getBalance').mockResolvedValue({ balance, currency: 'RUB', unlimited: false })`. Asserts §6.7 shape parity, `null` vs `0`, `::int` numbers, trial filter via a `keyCache` row with `isTrial: true`, and balance isolation (`getBalance` reject → `balance: null`, other payload fields intact).

**Source-contract sibling — harness copied from `tests/unit/admin-analytics-page.test.ts:1-141`:** `vi.hoisted` `ADMIN_TELEGRAM_IDS`, mocked `next/headers` session, RBAC digests (`NEXT_REDIRECT` → login, `NEXT_HTTP_ERROR_FALLBACK;404` for support/stranger, `ok: true` for administrator/manager), and `readFileSync` scans: two `<AnalyticsSection>`s below the sparkline (string `AnalyticsSection` present after `MrrSparkline`), five Suspense boundaries, no `'use client'` in the five new components, `artemida.getBalance` appears only in `service.ts`/`BurnRunwayCards` path, and the no-leak scan extended to the five new component sources (`providerCost`, `provider_cost`, `userId` must not appear — pages/components may only consume §6.7 aggregate payloads; RESEARCH Security Domain).

---

## Shared Patterns

### Money definition (D-01/D-13 — every file that touches rubles)
**Source:** `lib/analytics/series.ts:41-43` — `cashOf = Math.max(0, finalAmount - balanceUsed)`; `PAID = ['paid','provisioning','provisioned']` at `service.ts:51`.
**Apply to:** `economics.ts`, `retention.ts` (lost-MRR base), `service.ts` (LTV/margin loaders).
**A1 caveat (plan-time flag):** revenue churn's lost MRR uses the **literal D-07 formula** `finalAmount × 30 / days` — NOT `cashOf` (D-13's cash principle applies to margin only). 08-RESEARCH Assumptions Log A1; one-line switch to `cashOf(e.op)` if the user prefers cash consistency. Pin whichever is chosen with a fixture.

### MSK bucket discipline (D-15 — every window bound)
**Source:** `lib/analytics/time.ts:18-71` — `mskDayLabel` / `mskDayStartInstant` / `mskDateKey` / `pgTimestamp` / `mskMonthLabel` / `addMonths`. Never `new Date(label)` as a window bound; the label/instant split is a documented one-day trap (`time.ts:9-15`).
**Apply to:** all five loaders, `retentionForWindow` boundaries, ChurnTable month slots, all tests.

### `null` is a value, not an error (D-20)
**Source:** `AnalyticsKpi.tsx:62-72` — «—» is a RENDER decision on `null`; `0` always renders truthfully (`0 ₽`, `0%`); no loader returns a pre-formatted string or a pre-multiplied percentage. Ratios cross the boundary as exact rationals.
**Apply to:** all five components; percent formatting (`× 100`, `Intl.NumberFormat('ru-RU')`) happens in the component only.

### Independent degradation (D-19)
**Source:** `AnalyticsKpi.tsx:19-29` per-block `try/catch → t('common.errorLoad')` + page-level `<Suspense>` boundaries; balance failure isolated inside `loadBurnRunway`'s `.catch(() => null)`.
**Apply to:** all five new blocks — one failing block never fails the page or its sibling blocks.

### Term-cursor identity (Pattern 2)
**Source:** `series.ts:103-108` — `buildKeyTermEvents` mirrors `Math.max(cursorMs ?? paidAtMs, paidAtMs) + days * DAY_MS` exactly; `buildKeyTerms` itself is frozen (Phase 7 behavior cannot change). Guarded by the invariant test in `analytics-retention.test.ts`.
**Apply to:** `retention.ts` only; a second divergent cursor is the top anti-pattern (Pitfall 1).

### RSC leak guard (Phase 7 Pitfall 5 carried over)
**Source:** `tests/unit/admin-analytics-page.test.ts:134-140` — pages/components never receive `providerCost`/`provider_cost`/`userId`/API key; loaders expose §6.7 aggregates only.
**Apply to:** the five new components + their loader payloads; extend the scan in the new source-contract test.

### i18n literal-key discipline
**Source:** `tests/unit/i18n.test.ts:33-77` — literal `t('…')` calls only; unused or missing keys fail the suite.
**Apply to:** all new components and `ru.ts` (exactly 44 keys, §Copywriting).

### Baseline-aware phase gate
**Source:** `tests/unit/analytics-mrr.test.ts:190` — pre-existing red (`expected 4000 to be 3600`; the code froze `termEnd` at upgrade time in Phase 7 CR-01, the test encodes the stale expectation). Do NOT touch it in Phase 8; the gate is "no new failures".

---

## No Analog Found

| File | Role | Data Flow | Reason / Guidance |
|------|------|-----------|-------------------|
| `components/admin/ChurnTable.tsx` (visible table markup) | component (server) | request-response | No in-repo VISIBLE analytics table exists — `MrrWaterfall.tsx:214-239` and `MrrSparkline.tsx:111-128` are `sr-only`. The visible markup is prescriptive in 08-UI-SPEC §6.6 (scroll region, `sr-only` caption, `scope="col"/"row"`, `divide-y`); copy the recipe verbatim, borrow window/empty/header patterns from `MrrWaterfall.tsx`. |
| `components/admin/AnalyticsSection.tsx` (section anatomy) | component (server) | request-response | Only ~6 lines; prescribed verbatim in 08-UI-SPEC §6.1 (`border-t border-line pt-6`, h2 20/600, `aria-label`). Sheet a presentational module like `MetricCard.tsx` (exported constants, no data loading). |

Everything else has a direct, verified analog. `retention.ts` / `economics.ts` follow the Phase 7 pure-module contract (no Prisma, module-header doc comment, unit-testable without Postgres) — the term-event emission is genuinely new logic, which is exactly where the pure tests must concentrate (Wave 0).

## Metadata

**Analog search scope:** `lib/analytics/`, `lib/artemida.ts`, `lib/referrals.ts`, `components/admin/`, `app/admin/analytics/`, `lib/i18n/messages/ru.ts`, `prisma/schema.prisma`, `tests/unit/analytics-*.test.ts`, `tests/unit/admin-analytics-page.test.ts`
**Files scanned:** 15 source/component/config files + 4 test files + 3 planning artifacts (08-CONTEXT, 08-RESEARCH, 08-UI-SPEC)
**Pattern extraction date:** 2026-10-22
**Tracked-source gate:** all named analogs verified via `git ls-files` (15/15 tracked)
**Zero new npm packages** — RESEARCH Package Legitimacy Audit is binding (D-19); any plan containing `npm install` is wrong.