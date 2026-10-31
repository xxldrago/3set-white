# Phase 10: Cohorts & Retention Analytics - Research

**Researched:** 2026-10-29
**Domain:** Cohort retention & revenue matrices on `/admin/analytics` (registration cohorts, payer revenue cohorts, channel & device slices)
**Confidence:** HIGH

## Summary

Phase 10 adds two 12×12 cohort matrices to the existing `/admin/analytics` page, computed on the fly from `User` + `Order` + `KeyCache` (no new tables, no migration — consistent with D-07 "derivative on the fly"). The work splits cleanly into three waves mirroring phases 8/9: (1) a pure derivation core `lib/analytics/cohorts.ts` + unit tests, (2) two loaders in `lib/analytics/service.ts` (`loadRegistrationCohorts`, `loadPayerCohorts`) with DB-backed identity tests, (3) the `CohortMatrix` server component, the `CohortTabs` client segmented control, i18n keys, and page wiring (two new Suspense boundaries → 15 total).

No new npm dependencies are required (UI-SPEC Registry Safety: zero installs). The derivation reuses `buildKeyTermEvents` (individual coverage spans, not the `KeyTerm` aggregate span — important for gap correctness), `cashOf`, `mskMonthLabel`/`addMonths`/`mskDayStartInstant`, and `loadKeyCacheState`/`withoutTrialOrders` from phases 7–9. Channel is derived on the fly (`referral > promo > organic`); device bucket comes from the first paid order's `devices`.

**Primary recommendation:** Implement `cohorts.ts` as a pure module taking plain rows (users, paid orders, term events) and filters; keep all DB access in `service.ts` loaders; render the matrix as a single server component parameterized by `kind`/`channel`/`deviceBucket`; drive tabs via URL params `regCh`/`payCh`/`payDev` exactly like `PeriodSelector`.

## User Constraints

### Locked Decisions (from 10-CONTEXT.md)

- **D-01:** Registration cohort = all users registered in MSK month M (`User.createdAt`). Retention in relative month N: user has ≥1 paid (non-trial) key whose coverage (`paidAt + days`) intersects calendar month M+N. Trial keys excluded. Gaps stay empty ("—", never zero-filled).
- **D-02:** Payer cohort month = MSK month of first paid order (`min(paidAt)` among `paid/provisioning/provisioned`). Membership fixed forever.
- **D-03:** Revenue retention = Σ cash of orders paid in month M+N by cohort members ÷ Σ cash of orders paid in first paid month (M0) by same cohort. `cash = finalAmount − balanceUsed`. All cohort orders (new/renew/upgrade). Denominator = first paid month.
- **D-04:** Matrix size = 12 cohort months × 12 relative offsets (M0..M11). Code constant.
- **D-05:** Return after a gap shows only months with active coverage (gaps empty); payer cohort never moves.
- **D-06:** Only paid keys (`isTrial = false`) count.
- **D-07:** Channel computed on the fly, no new column: `referral` if `User.referredById != null`; else `promo` if `User.pendingPromo != null` OR any paid order with `promoCode != null`; else `organic`.
- **D-08:** Priority `referral > promo`.
- **D-09:** Personal subdomain / referral links count as `referral`. Three channels total.
- **D-10:** Device count = `Order.devices` of the user's first paid order. Fixed forever; upgrades don't change the bucket.
- **D-11:** Device buckets: `1`, `2`, `3`, `4`, `5+`.
- **D-12:** Device slice applies only to payer matrices (COH-02, COH-05). Registration cohort is not device-filtered.
- **D-13:** Matrices are independent of `?period` — always 12×12. `?period` controls only KPI/waterfall/retention blocks.
- **D-14:** Slices switch via tabs over a single matrix (channel tabs + device tabs).
- **D-15:** Cell = percent + absolute in parens, gradient background 0–100%, numbers always present (a11y).
- **D-16:** Small cohorts shown as-is, no masking.
- **D-17:** Month/cohort boundaries in Europe/Moscow (+03:00).

### the agent's Discretion (research recommends)

- Pure derivation in `lib/analytics/cohorts.ts`; loaders `loadRegistrationCohorts`/`loadPayerCohorts` in `service.ts`; component `components/admin/CohortMatrix.tsx` (+ `CohortTabs.tsx` client).
- i18n keys `analyticsCohort*` per the exact 14-key set in UI-SPEC.
- Cell gradient stops per UI-SPEC: `rgba(183,255,69,0.04)` → `rgba(183,255,69,v*0.32)`.
- Trailing 12 MSK months ending with the current month (UI-SPEC deviation from D-04's literal reading — keeps grid shape stable).

### Deferred Ideas (OUT OF SCOPE)

- Cohort snapshot/rollup table; tariff (days) slice; drill-down per cell (Phase 11); CSV export (EXT-06); alerts (ALR); chargeback accounting in revenue retention.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| COH-01 | Registration cohort matrix (month × month N) — share of accounts with active paid subscription | `buildRegistrationCohorts` + `loadRegistrationCohorts`; coverage intersection via `buildKeyTermEvents` spans. |
| COH-02 | Revenue retention by cohorts (month N revenue vs first paid month) | `buildPayerCohorts` + `loadPayerCohorts`; `cashOf` denominator. |
| COH-03 | Cohorts by acquisition channel (referral / promo / organic) | `channelOf` derived on the fly; `CohortTabs param="regCh"/"payCh"`. |
| COH-04 | Cohorts by device count of first paid order | `deviceBucketOf`; `CohortTabs param="payDev"`; payer matrices only. |
| COH-05 | Payer revenue cohorts (by first-payment month) | `buildPayerCohorts` with first-paid-month grouping. |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Cohort matrix derivation (pure) | API / Backend (server component) | — | Runs on the server; no client data fetching (UI-SPEC non-goal). |
| Acquisition-channel classification | API / Backend | — | Derived on the fly from `User` + paid orders (D-07). |
| Device-bucket classification | API / Backend | — | Derived from first paid order (D-10). |
| Tab filtering (channel/device) | Browser / Client (`CohortTabs`) | API / Backend (re-render) | Client only mutates URL params + `router.refresh()`; matrix stays server component. |
| Matrix rendering + gradient tint | Frontend Server (RSC) | — | Server component, no `'use client'`. |
| Month/cohort boundary math | API / Backend (`time.ts`) | — | MSK +03:00 fixed offset; JS-side only. |

## Standard Stack

No new packages. Reuse existing stack (Next 16.3, React 19, Tailwind v4, Prisma 7, vitest). UI-SPEC explicitly: "Phase 10 installs zero packages."

### Reused modules (authoritative paths)

| Module | Key exports | Used for |
|--------|-------------|----------|
| `lib/analytics/series.ts` | `PaidOrderRow`, `cashOf`, `buildKeyTerms`, `keyRefOf` | Cash base; key identity. |
| `lib/analytics/time.ts` | `mskDayLabel`, `mskDayStartInstant`, `mskMonthLabel`, `addMonths`, `pgTimestamp` | MSK month bounds and offsets. |
| `lib/analytics/retention.ts` | `buildKeyTermEvents`, `TermEvent` | **Individual coverage spans** per paid key (renewals as separate spans) — needed so gaps between renewals stay empty. |
| `lib/analytics/mrr.ts` | `keyRefOf` | Key identity (re-exported via series). |
| `lib/analytics/service.ts` | `loadPaidOrders`, `ORDER_SELECT`, `PAID`, `loadKeyCacheState`, `withoutTrialOrders` | DB scan + trial filtering. |
| `components/admin/PeriodSelector.tsx` | segmented-control recipe | Template for `CohortTabs`. |
| `components/admin/ChurnTable.tsx` | scroll-region table recipe | Template for `CohortMatrix`. |
| `components/admin/MetricCard.tsx` | `CARD`, `GRID` | Container primitives. |

## Architecture Patterns

### Recommended new files

- `lib/analytics/cohorts.ts` — pure derivation (no Prisma/React/next imports), unit-testable.
- `components/admin/CohortMatrix.tsx` — async server component, parameterized.
- `components/admin/CohortTabs.tsx` — client segmented control (only client component this phase).
- Tests: `tests/unit/analytics-cohorts.test.ts` (pure), `tests/unit/analytics-phase10-loaders.test.ts` (DB identity), `tests/unit/admin-analytics-phase10-contract.test.ts` (page contract).

### Pure module API (recommended)

```ts
// lib/analytics/cohorts.ts
export const COHORT_MONTHS = 12; // both axes (D-04)

export type Channel = "referral" | "promo" | "organic";
export type ChannelFilter = "all" | Channel;
export type DeviceBucket = "1" | "2" | "3" | "4" | "5+";
export type DeviceFilter = "all" | DeviceBucket;

export interface CohortUser {
  id: number;
  createdAt: Date;
  referredById: number | null;
  pendingPromo: string | null;
}

export function channelOf(user: CohortUser, hasPromoOrder: boolean): Channel {
  if (user.referredById != null) return "referral";          // D-08 priority
  if (user.pendingPromo != null || hasPromoOrder) return "promo";
  return "organic";
}

export function deviceBucketOf(devices: number): DeviceBucket {
  if (devices <= 1) return "1";
  if (devices === 2) return "2";
  if (devices === 3) return "3";
  if (devices === 4) return "4";
  return "5+";
}

export interface RegistrationCohort {
  month: string;                 // "YYYY-MM-01" MSK
  size: number;
  retained: (number | null)[];   // length 12; null = unreachable
}

export interface RegistrationCohortInput {
  users: CohortUser[];
  // paid non-trial coverage spans (from buildKeyTermEvents)
  terms: { userId: number; termStart: Date; termEnd: Date }[];
  orders: { userId: number; promoCode: string | null }[]; // paid only
  now: Date;
}

export function buildRegistrationCohorts(
  input: RegistrationCohortInput,
  channelFilter: ChannelFilter,
): RegistrationCohort[];

export interface PayerCohort {
  month: string;
  size: number;
  baseRevenue: number | null;    // cash of M0
  revenue: (number | null)[];    // length 12; null = unreachable
}

export interface PayerCohortInput {
  users: CohortUser[];
  orders: { userId: number; paidAt: Date; cash: number; devices: number; promoCode: string | null }[]; // paid only
  now: Date;
}

export function buildPayerCohorts(
  input: PayerCohortInput,
  channelFilter: ChannelFilter,
  deviceFilter: DeviceFilter,
): PayerCohort[];

export function trailingCohortMonths(now: Date): string[]; // 12 labels, current month last
```

### Derivation rules (for implementation + tests)

**Registration cohort:**
1. `cohortMonth(user) = mskMonthLabel(mskDayLabel(user.createdAt))`.
2. Filter users by `channelFilter` (or all).
3. `size = count` of users in that cohort month.
4. For each user, compute the set of MSK months where they hold active paid coverage: for each term span `[termStart, termEnd)` (exclusive end), mark every month label from `mskMonthLabel(termStart)` through `mskMonthLabel(termEnd − 1ms)` inclusive. Use `TermEvent` spans (not `KeyTerm` aggregate) so gaps between renewals stay unmarked.
5. For offset `o` in 0..11: `targetMonth = addMonths(cohortMonth, o)`. If `targetMonth > currentMonth` → `null` (unreachable). Else `retained[o] = count of cohort users whose active-month set contains targetMonth`. If `size === 0` → `null` for all offsets.
6. Emit 12 rows = `trailingCohortMonths(now)` (trailing 12 MSK months ending with current month). Empty cohorts get `size: 0`.

**Payer cohort:**
1. `firstPaidMonth(user) = mskMonthLabel(mskDayLabel(min paidAt among their paid orders))`.
2. `hasPromoOrder(user) = any paid order with promoCode != null`.
3. `channel = channelOf(user, hasPromoOrder)`.
4. `deviceBucket = deviceBucketOf(firstPaidOrder.devices)` (first by paidAt).
5. Filter users by `channelFilter` and `deviceFilter`.
6. `size = count`.
7. `baseRevenue (M0) = Σ cash of paid orders by cohort members with paidAt in cohort month`.
8. For offset `o`: `targetMonth = addMonths(cohortMonth, o)`. If `targetMonth > currentMonth` → `null`. Else `revenue[o] = Σ cash of paid orders by cohort members with paidAt in targetMonth` (0 if none). `revenue[0]` should equal `baseRevenue`.
9. Emit 12 rows = `trailingCohortMonths(now)`.

**Channel derivation (D-07/D-08):** `referredById != null` → referral (promo ignored). Else promo if `pendingPromo != null` OR any paid order `promoCode != null`. Else organic. Note: `customSubdomain` visitors are pinned to a referral code at registration, so they show up as `referredById != null` → referral (D-09).

### Loader wiring (service.ts)

```ts
export interface RegistrationCohortData { cohorts: RegistrationCohort[]; }
export interface PayerCohortData { cohorts: PayerCohort[]; }

export async function loadRegistrationCohorts(channel: "all"|"referral"|"promo"|"organic"): Promise<RegistrationCohortData> {
  const now = new Date();
  const [users, paidOrders] = await Promise.all([
    prisma.user.findMany({ select: { id: true, createdAt: true, referredById: true, pendingPromo: true } }),
    loadPaidOrders(),
  ]);
  const keyState = await loadKeyCacheState();
  const filtered = withoutTrialOrders(paidOrders, keyState.trialRefs);
  const events = buildKeyTermEvents(filtered, keyState.liveExpiry);
  const terms = events.map((e) => ({ userId: e.op.userId, termStart: e.start, termEnd: e.end }));
  const ordersForChannel = paidOrders.map((o) => ({ userId: o.userId, promoCode: o.promoCode }));
  const cohorts = buildRegistrationCohorts(
    { users, terms, orders: ordersForChannel, now },
    channel,
  );
  return { cohorts };
}

export async function loadPayerCohorts(channel, deviceBucket): Promise<PayerCohortData> {
  const now = new Date();
  const [users, paidOrders] = await Promise.all([
    prisma.user.findMany({ select: { id: true, createdAt: true, referredById: true, pendingPromo: true } }),
    loadPaidOrders(),
  ]);
  const orders = paidOrders.map((o) => ({ userId: o.userId, paidAt: o.paidAt!, cash: cashOf(o), devices: o.devices, promoCode: o.promoCode })).filter(o => o.paidAt);
  const cohorts = buildPayerCohorts({ users, orders, now }, channel, deviceBucket);
  return { cohorts };
}
```

Note: `loadPaidOrders` returns `PaidOrderRow[]` with `paidAt: Date | null`. Filter null. `cashOf` from series.ts.

### Page wiring (app/admin/analytics/page.tsx)

Append after the timing section (UI-SPEC §6.1). Add imports for `CohortTabs`, `CohortMatrix`. Parse `regCh`/`payCh`/`payDev` from searchParams with whitelist defaults `'all'`:

```tsx
const rawRegCh = params.regCh;
const regCh = (['all','referral','promo','organic'] as const).includes(rawRegCh as any) ? rawRegCh! : 'all';
// similarly payCh, payDev with device options
```

Add two new Suspense boundaries → total 15. Fallback `ChartSkeleton className="h-64"`.

### Component: CohortMatrix (server)

Per UI-SPEC §6.2/§6.3. Props: `kind: 'registration' | 'payer'`, `channel`, `deviceBucket?`. Calls `loadRegistrationCohorts(channel)` or `loadPayerCohorts(channel, deviceBucket)`. Renders 12 rows × 14 columns (month, size, M0..M11). Empty matrix (all sizes 0) → empty-state panel with `admin.analyticsCohortEmpty`. Error → `common.errorLoad`.

Cell tint: `linear-gradient(180deg, rgba(183,255,69,0.04), rgba(183,255,69,${(value)*0.32}))` where value = retained/size (registration) or revenue/baseRevenue clamped to [0,1] (payer). Empty/`—` cells transparent.

### Component: CohortTabs (client)

`'use client'`, mirrors `PeriodSelector`. Props: `param`, `label`, `options`, `labels`. URL-driven via `router.replace` + `router.refresh()`.

### i18n keys (exact 14, UI-SPEC Copywriting)

Add to `admin` object in `ru.ts`:
- `analyticsRegCohortTitle`: "Когорты по регистрации"
- `analyticsPayerCohortTitle`: "Когорты по первой оплате"
- `analyticsCohortRegMatrixTitle`: "Удержание по регистрации"
- `analyticsCohortPayerMatrixTitle`: "Выручка по когортам плательщиков"
- `analyticsCohortMatrixCaption`: "Когортная матрица, МСК. Доля удержания по месяцам."
- `analyticsCohortSize`: "Размер"
- `analyticsCohortMeta`: "12 мес. · МСК · не зависит от периода"
- `analyticsCohortChannelLabel`: "Канал"
- `analyticsCohortDevicesLabel`: "Устройства"
- `analyticsCohortTabAll`: "Все"
- `analyticsCohortTabReferral`: "Реферал"
- `analyticsCohortTabPromo`: "Промокод"
- `analyticsCohortTabOrganic`: "Органика"
- `analyticsCohortEmpty`: "Пока нет данных для когорт: матрица заполнится после первых регистраций и оплат."

Reused keys (no duplicates): `common.errorLoad`, `admin.analyticsTableMonth`, `admin.analyticsWaterfallWindowSingle/Months`, `admin.analyticsWindowDays`.

## Common Pitfalls

### Pitfall 1: Using `KeyTerm` aggregate span instead of `TermEvent` spans
**What goes wrong:** A key renewed after a gap shows the gap months as retained.
**Why:** `buildKeyTerms` produces one `KeyTerm` with `termStart = first op`, `termEnd = final expiry`, collapsing gaps.
**How to avoid:** Use `buildKeyTermEvents` (one span per chain op) for registration cohort coverage. Each `TermEvent.start/end` is an individual paid term.

### Pitfall 2: Zero-filling gaps
**What goes wrong:** A month with no active coverage renders `0%` instead of `—`.
**Why:** Confusing "reachable but zero retained" with "unreachable gap".
**How to avoid:** Track reachability separately: `targetMonth > currentMonth` → `null`. A reachable offset with 0 retained is a real `0%`. Component renders `—` only on `null` or `size === 0`.

### Pitfall 3: Mixing MSK month label with instant
**What goes wrong:** Off-by-one month near boundaries.
**How to avoid:** Always `mskMonthLabel(mskDayLabel(instant))` for a month label; `addMonths` for offsets; compare labels as strings (`"2026-08-01" > "2026-07-01"` works lexicographically for ISO).

### Pitfall 4: Trial keys leaking into registration cohort
**What goes wrong:** Trial subscriptions counted as retention.
**How to avoid:** Run paid orders through `withoutTrialOrders` before `buildKeyTermEvents`. Trial keys never create orders, but a paid order's keyRef could still be flagged trial in `KeyCache` — filter by `trialRefs`.

### Pitfall 5: RSC leak (providerCost / userId in payload)
**What goes wrong:** Cohort aggregates accidentally carry per-order detail, breaking the no-leak boundary.
**How to avoid:** Payload contains only `{ month, size, retained/revenue, baseRevenue }`. No `userId`, no `providerCost`, no raw errors. Contract test scans for `providerCost|provider_cost|userId`.

### Pitfall 6: Channel priority
**What goes wrong:** A user with both `referredById` and a promo order classified as `promo`.
**How to avoid:** `if (referredById != null) return 'referral'` first (D-08).

### Pitfall 7: Device bucket changes on upgrade
**What goes wrong:** Re-deriving device count from the latest order.
**How to avoid:** `firstPaidOrder = orders sorted by paidAt asc [0]`; bucket from its `devices`. Never recompute.

### Pitfall 8: Suspense count drift
**What goes wrong:** Contract tests assert exact Suspense counts.
**How to avoid:** Phase 10 adds exactly 2 new boundaries (one per matrix) → 15 total. Update the phase-10 contract test accordingly.

### Pitfall 9: i18n unused/missing keys
**What goes wrong:** i18n test fails on unused or missing keys.
**How to avoid:** Add exactly the 14 keys; reference each via literal `t('...')` calls (no dynamic key construction). Device/offset labels are literals, not keys.

### Pitfall 10: Empty matrix vs empty cell
**What goes wrong:** Showing a table with all `—` when there are no cohorts at all, or vice versa.
**How to avoid:** Empty matrix = every cohort size is 0 → render empty-state panel, no table. A single size-0 cohort row still renders with `—` cells.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| MSK month math | custom Date arithmetic | `mskMonthLabel`/`addMonths`/`mskDayStartInstant` | Fixed +03:00, no DST; tested. |
| Key coverage spans | new cursor implementation | `buildKeyTermEvents` | Identical cursor math to `buildKeyTerms`; invariant-tested. |
| Cash calculation | `finalAmount` alone | `cashOf` | Balance-covered rubles must be excluded. |
| Trial filtering | manual isTrial checks on orders | `loadKeyCacheState` + `withoutTrialOrders` | Established pattern. |
| Segmented control | new tab component | clone `PeriodSelector` | Proven a11y + styling. |
| Table scroll region | custom overflow | clone `ChurnTable` recipe | Proven a11y. |

## Code Examples

### trailingCohortMonths

```ts
export function trailingCohortMonths(now: Date): string[] {
  const current = mskMonthLabel(mskDayLabel(now));
  const out: string[] = [];
  for (let i = COHORT_MONTHS - 1; i >= 0; i--) {
    out.push(addMonths(current, -i));
  }
  return out; // oldest first, current month last
}
```

### Active-month set per user (registration)

```ts
function activeMonths(termStart: Date, termEnd: Date): Set<string> {
  const out = new Set<string>();
  // termEnd is exclusive; last active instant is termEnd - 1ms
  const lastActive = new Date(termEnd.getTime() - 1);
  let cursor = mskMonthLabel(mskDayLabel(termStart));
  const last = mskMonthLabel(mskDayLabel(lastActive));
  while (cursor <= last) {
    out.add(cursor);
    cursor = addMonths(cursor, 1);
  }
  return out;
}
```

### Month comparison (ISO labels sort lexicographically)

```ts
// "2026-08-01" > "2026-07-01" → true
const reachable = targetMonth <= currentMonth; // string compare
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Rollup tables for cohorts | On-the-fly derivation | D-07 (this phase) | No migration; reversible. |
| `KeyTerm` aggregate span | `TermEvent` per-op spans | This phase | Correct gap handling. |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `buildKeyTermEvents` spans are the right granularity for "coverage intersects month" (vs. KeyTerm aggregate) | Architecture | If wrong, gaps collapse; tests would need rework. Mitigated by D-01's "paidAt + days" wording per key. |
| A2 | Trailing 12 months ending with current month (UI-SPEC deviation) rather than "first 12 months of data" | UI | Grid shape stability; documented deviation. |
| A3 | `TermEvent.op.userId` is populated on the PaidOrderRow (it is — `PaidOrderRow.userId: number`) | Loader wiring | Verified in series.ts interface. |
| A4 | No new packages needed | Standard Stack | UI-SPEC Registry Safety confirms zero installs. |

## Open Questions

1. **Performance of on-the-fly scan** — D-12 notes a single `findMany` per loader. At MVP scale (thousands of orders) fine. If slow, cache within the request (one findMany per loader already). No rollup table this phase (deferred).
2. **Whether to share a single user/order scan between the two loaders** — they're separate Suspense boundaries, so separate scans are acceptable. Could memoize within request if needed; not required.

## Environment Availability

No new external dependencies. Existing infra (Postgres 17, Node 24, Next 16) unchanged. Vitest + shared test Postgres used for DB-backed loader tests (identity pattern, as phases 8/9).

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest (existing) |
| Config file | `vitest.config.ts` (existing) |
| Quick run command | `npx vitest run tests/unit/analytics-cohorts.test.ts` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| COH-01 | Registration cohort matrix retention counts | unit (pure) | `npx vitest run tests/unit/analytics-cohorts.test.ts` | ❌ Wave 0 |
| COH-01 | Loader wiring identity | integration (DB) | `npx vitest run tests/unit/analytics-phase10-loaders.test.ts` | ❌ Wave 0 |
| COH-02 | Revenue retention ratios | unit (pure) | `npx vitest run tests/unit/analytics-cohorts.test.ts` | ❌ Wave 0 |
| COH-03 | Channel derivation + filtering | unit (pure) | `npx vitest run tests/unit/analytics-cohorts.test.ts` | ❌ Wave 0 |
| COH-04 | Device bucket derivation | unit (pure) | `npx vitest run tests/unit/analytics-cohorts.test.ts` | ❌ Wave 0 |
| COH-05 | Payer cohort first-payment month | unit (pure) | `npx vitest run tests/unit/analytics-cohorts.test.ts` | ❌ Wave 0 |
| COH-01..05 | Page composition (Suspense count 15, no leak) | unit (contract) | `npx vitest run tests/unit/admin-analytics-phase10-contract.test.ts` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npx vitest run tests/unit/analytics-cohorts.test.ts`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd-verify-work`.

### Wave 0 Gaps

- [ ] `tests/unit/analytics-cohorts.test.ts` — pure derivation (channel, device bucket, registration/payer cohorts, gaps, MSK boundaries).
- [ ] `tests/unit/analytics-phase10-loaders.test.ts` — DB-backed identity tests for `loadRegistrationCohorts`/`loadPayerCohorts`.
- [ ] `tests/unit/admin-analytics-phase10-contract.test.ts` — page composition, Suspense count 15, no-leak scan, i18n key count.

## Security Domain

Security enforcement enabled. Applicable ASVS categories:

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | yes (inherited) | `requireRole('administrator','manager')` on page; session cookie. |
| V3 Session Management | yes (inherited) | httpOnly signed session via `jose`. |
| V4 Access Control | yes | Admin/manager only; support/stranger → 404 (no distinct forbidden page). |
| V5 Input Validation | yes | Whitelist `regCh`/`payCh`/`payDev`/`period` against allowed sets; unknown → `'all'`. |
| V6 Cryptography | no | No new crypto. |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| RSC payload leak of per-user/provider data | Information disclosure | Payload contains aggregates only; contract test scans for `providerCost|provider_cost|userId`. |
| SQL injection via filter params | Tampering | Filters are whitelisted TS unions, never interpolated into SQL. |
| Unauthorized analytics access | Elevation of privilege | `requireRole` re-run on page (Pitfall 12); direct RSC fetch still guarded. |

## Sources

### Primary (HIGH confidence)

- `.planning/phases/10-cohorts-retention-analytics/10-CONTEXT.md` — D-01..D-17 locked decisions.
- `.planning/phases/10-cohorts-retention-analytics/10-UI-SPEC.md` — exact UI contract, i18n keys, data shapes, Suspense count 15.
- `lib/analytics/series.ts`, `time.ts`, `retention.ts`, `mrr.ts`, `funnel.ts` — verified exports and cursor math.
- `lib/analytics/service.ts` — loader patterns, `ORDER_SELECT`, `PAID`, `loadKeyCacheState`, `withoutTrialOrders`.
- `prisma/schema.prisma` — `User` (createdAt, referredById, pendingPromo), `Order` (paidAt, finalAmount, balanceUsed, days, devices, promoCode, status), `KeyCache` (isTrial, expiresAt).

### Secondary (MEDIUM confidence)

- `components/admin/ChurnTable.tsx`, `PeriodSelector.tsx` — reusable UI recipes.
- `tests/unit/admin-analytics-phase8/9-contract.test.ts` — contract test patterns (Suspense counts, no-leak scan, i18n counts).

### Tertiary (LOW confidence)

- None — all claims verified against repo source this session.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new deps; reuses verified modules.
- Architecture: HIGH — mirrors established phase 8/9 patterns; pure-module + loader split proven.
- Pitfalls: HIGH — derived from CONTEXT/decisions and prior-phase lessons.

**Research date:** 2026-10-29
**Valid until:** 2026-11-28 (stable domain; revisit if cohort performance becomes an issue).