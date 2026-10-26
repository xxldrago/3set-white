---
phase: 09-payment-funnel-failure-analysis
plan: 02
subsystem: analytics
tags: [funnel, loaders, prisma, postgres, error-breakdown, timing, vitest, identity-tests]

requires:
  - phase: 09-payment-funnel-failure-analysis
    provides: "lib/analytics/funnel.ts pure core — funnelOf, expiredCount, errorBreakdown, timingStats, PAYMENT_WINDOW_MS, FunnelRow (09-01)"
  - phase: 08-unit-economics-retention
    provides: "service.ts Phase 8 loader block + tests/unit/analytics-phase8-loaders.test.ts DB harness conventions (OWNER range, cleanup/ensureUsers/beforeEach, conditional identity assertions)"
  - phase: 07-analytics-foundation-revenue-metrics
    provides: "windowStartDay + mskDayStartInstant MSK-day window discipline, ORDER_SELECT style, JS-number payload guard"
provides:
  - "lib/analytics/service.ts — loadFunnel, loadExpired, loadErrorBreakdown, loadTimeToPay, loadTimeToProvision + FunnelData/ExpiredData/ErrorBreakdownData/TimingData + private FUNNEL_ORDER_SELECT, loadFunnelOrderRows, loadProvisionedRows"
  - "tests/unit/analytics-phase9-loaders.test.ts — 9 DB-backed identity rows over real Postgres"
affects:
  - 09-03 UI sections (funnel cards, error breakdown table, timing cards, expired badge) consume these payloads
  - Phase 10 cohorts / Phase 11 segments reuse the createdAt-cohort window + identity-test pattern

actuals:
  tokens: 7854
  tasks: 2
  commits: 4

tech-stack:
  added: []
  patterns:
    - "Identity-pattern DB tests: re-run the loader's own WHERE/SELECT in the test, derive the expectation through the pure module — global leftovers are absorbed, wiring is pinned"
    - "Conditional exact assertions: hand-computed values asserted only when the re-derived scan proves the fixture owns the whole window"
    - "One scan helper per sample (loadFunnelOrderRows / loadProvisionedRows); the SQL WHERE mirrors the pure module's defensive filter (belt and braces)"
    - "Point-in-time loader (loadExpired) takes no period; every windowed loader shares windowStartDay(period) with loadKpis"

key-files:
  created:
    - tests/unit/analytics-phase9-loaders.test.ts
  modified:
    - lib/analytics/service.ts

key-decisions:
  - "Funnel cohort is createdAt, never paidAt: pending orders have no paidAt and would silently drop out of the funnel base"
  - "loadExpired uses prisma.order.count with a strict `<` INSTANT bound (now − PAYMENT_WINDOW_MS) and derives windowHours from the same constant, so the component copy can never drift from the 24h rule"
  - "loadErrorBreakdown's total is Σ row.count (the failed+canceled denominator); grouping/sorting/null-preservation stay in the pure module"
  - "Timing loaders share loadProvisionedRows whose SQL WHERE mirrors timingStats' success filter, so a post-provision chargeback (status refunded) can never enter the sample"
  - "FunnelData.step typed as FunnelStep (09-01 tuple), not string — the payload carries the fixed four-step vocabulary"
  - "Fixtures set updatedAt explicitly then re-persist it via prisma.order.update because @updatedAt is client-stamped on create; the loader reads the persisted row"

patterns-established:
  - "Identity scan helper naming: scanFunnelRows / scanProvisionedRows mirror loadFunnelOrderRows / loadProvisionedRows one-for-one"
  - "windowIsExactly(rows, ids) helper gates every hand-computed assertion on fixture ownership"
  - "Delta assertions for point-in-time counts (baseline → +1 → still +1) pin inclusion/exclusion without assuming a clean global table"

requirements-completed: [ANL-08, ANL-09, ANL-10, ANL-11]

coverage:
  - id: D1
    description: "loadFunnel(period) — 4-step funnel over orders CREATED in the shared MSK-day window with exact-rational conversions/drop-offs"
    requirement: ANL-08
    verification:
      - kind: unit
        ref: "tests/unit/analytics-phase9-loaders.test.ts#Test 1: loadFunnel — 4 fixed steps + createdAt cohort window identity"
        status: pass
      - kind: unit
        ref: "tests/unit/analytics-phase9-loaders.test.ts#Test 2: loadFunnel monotone non-increasing + exact-rational conversions"
        status: pass
    human_judgment: false
  - id: D2
    description: "loadErrorBreakdown(period) — failed/canceled grouped by raw errorCode with null preserved, count-desc/code-asc order and Σ total"
    requirement: ANL-09
    verification:
      - kind: unit
        ref: "tests/unit/analytics-phase9-loaders.test.ts#Test 5: loadErrorBreakdown — raw-code grouping, null preserved, count-desc sorting"
        status: pass
      - kind: unit
        ref: "tests/unit/analytics-phase9-loaders.test.ts#Test 6: loadErrorBreakdown — empty failed/canceled sample"
        status: pass
    human_judgment: false
  - id: D3
    description: "loadTimeToPay / loadTimeToProvision(period) — median/mean over successful chains for created→paid and paid→provisioned (updatedAt proxy)"
    requirement: ANL-10
    verification:
      - kind: unit
        ref: "tests/unit/analytics-phase9-loaders.test.ts#Test 7: loadTimeToPay"
        status: pass
      - kind: unit
        ref: "tests/unit/analytics-phase9-loaders.test.ts#Test 8: loadTimeToProvision"
        status: pass
      - kind: unit
        ref: "tests/unit/analytics-phase9-loaders.test.ts#Test 9: timing loaders — zero sample"
        status: pass
    human_judgment: false
  - id: D4
    description: "loadExpired() — point-in-time pending-by-age count (no period) with windowHours derived from PAYMENT_WINDOW_MS"
    requirement: ANL-11
    verification:
      - kind: unit
        ref: "tests/unit/analytics-phase9-loaders.test.ts#Test 3: loadExpired — point-in-time pending-by-age, no period"
        status: pass
      - kind: unit
        ref: "tests/unit/analytics-phase9-loaders.test.ts#Test 4: loadExpired windowHours mirrors PAYMENT_WINDOW_MS"
        status: pass
    human_judgment: false

duration: 6min
completed: 2026-10-27
status: complete
---

# Phase 09 Plan 02: Payment Funnel & Failure Analysis Loaders Summary

**Five DB-backed Phase 9 loaders wired to the 09-01 pure core: one createdAt-cohort funnel scan, a point-in-time 24h expired count, raw-errorCode grouping, and two successful-chain timing payloads — pinned by 9 identity tests against real Postgres.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-10-27T08:16:21Z (Task 1 RED run)
- **Completed:** 2026-10-27T08:19:35Z (full-suite gate)
- **Tasks:** 2/2
- **Files modified:** 2 (1 created, 1 modified; +811 lines)

## Accomplishments

- `lib/analytics/service.ts` gains a Phase 9 block (below the Phase 8 block, which is untouched) with the five loaders, their four payload types, and two private scan helpers. Every derivation still happens in `lib/analytics/funnel.ts`; the loaders only build SQL WHERE clauses and shape payloads.
- Window identity is enforced structurally: all four windowed loaders call `mskDayStartInstant(windowStartDay(period))` — the exact `loadKpis` bound — so a funnel/error/timing number can never disagree with the KPI row's period. The funnel base is orders *created* in the window (a `paidAt` window would drop pending orders out of step 1).
- `loadExpired()` takes **no** period (D-06): one `prisma.order.count` with `status: 'pending'` and a strict `<` instant bound of `now − PAYMENT_WINDOW_MS`. `windowHours` is computed from the imported constant, so the «Ждут оплаты более {hours} ч» copy cannot drift from the 24h rule (D-01). No status mutation, no enum change.
- `loadErrorBreakdown` returns the pure module's grouped rows verbatim (null preserved, count-desc/code-asc) plus `total = Σ count`; payload rows contain only `{ code, count }` — no per-order or provider-internal data crosses the RSC boundary (T-09-02-02).
- `loadProvisionedRows` mirrors `timingStats`' success filter in SQL (`status='provisioned'` + `paidAt` + `provisionedKeyId` not null + createdAt window), so a post-provision chargeback (status `refunded`, `updatedAt` = refund instant) can never enter either timing sample.
- 9 DB-backed tests, all green, each named for its behaviour: window identity + fixture ownership, monotone funnel with hand-computed rationals (`4/5`, `3/4`, `2/3`), real-zero vs null conversion, point-in-time expired inclusion/exclusion by age and status, `windowHours === 24`, error grouping with null-tie-break, empty breakdown, both timing intervals with deliberately different hand-computed deltas (2h/3h vs 60s/110s), and the zero-sample nulls.

## Task Commits

Each task was committed atomically (TDD RED → GREEN per task):

1. **Task 1 RED: failing DB-backed funnel/expired loader suite** — `4851ca9` (test)
2. **Task 1 GREEN: loadFunnel + loadExpired** — `317732c` (feat)
3. **Task 2 RED: failing error-breakdown + timing loader rows** — `c32bae7` (test)
4. **Task 2 GREEN: loadErrorBreakdown + loadTimeToPay / loadTimeToProvision** — `1617dc1` (feat)

**Plan metadata:** docs commit below (SUMMARY + STATE + ROADMAP).

## Files Created/Modified

- `lib/analytics/service.ts` (+155) — Phase 9 block: `FunnelData`, `ExpiredData`, `ErrorBreakdownData`, `TimingData`; `FUNNEL_ORDER_SELECT`; `loadFunnelOrderRows`, `loadFunnel`, `loadExpired`, `loadErrorBreakdown`, `loadProvisionedRows`, `loadTimeToPay`, `loadTimeToProvision`. Only `./funnel` import additions (`PAYMENT_WINDOW_MS`, `funnelOf`, `errorBreakdown`, `timingStats`, `type FunnelRow`, `type FunnelStep`).
- `tests/unit/analytics-phase9-loaders.test.ts` (new, 656 lines) — harness (`20000044x` ids, cleanup/ensureUsers/beforeEach/afterAll), `makeOrder` with status/createdAt/paidAt/updatedAt/errorCode overrides, `windowStart`/`scanFunnelRows`/`scanProvisionedRows`/`windowIsExactly` identity helpers, Tests 1–4 (funnel/expired) and 5–9 (error/timing).

## Decisions Made

- **Funnel cohort = createdAt.** Pending orders carry no `paidAt`; windowing by `paidAt` would silently remove them from the funnel base and inflate every conversion.
- **`expiredCount` is not called by the loader.** The plan's action specifies a `prisma.order.count` (DB-side count of a potentially large pending set); the test cross-checks the loader count against `expiredCount(pendingRows, now)` so both implementations of the strict-`<` rule are proven to agree.
- **`FunnelData.step` typed `FunnelStep`** rather than `string` — the payload carries the fixed four-step vocabulary from 09-01, so the consumer cannot render an unknown step.
- **`updatedAt` fixtures.** `@updatedAt` is client-stamped on create; the factory re-persists the fixture value with `prisma.order.update` (as the plan anticipated) so the timing proxy is pinned to a known delta. Verified by Test 8's exact `60_000 / 110_000` assertions.
- **Fixture counts 5/4/3/2** (created/paid/provisioning/provisioned). The plan's `5/4/3/3` illustration is not reachable without a `provisionedKeyId` on a failed row; the chosen fixture still exercises the failed-implies-provisioning approximation (failed row counts at provisioning, not at provisioned).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test 5 expected row order contradicted the documented 09-01 tie-break**
- **Found during:** Task 2 RED authoring
- **Issue:** The plan's `<behavior>` listed `[api_down 2, null 2, timeout 1, manual 1]`, but 09-01's `errorBreakdown` (and its SUMMARY deviation #2) sorts ties by code ASC with `null` treated as `''`, so the unknown group must lead its tie block: `[null 2, api_down 2, manual 1, timeout 1]`.
- **Fix:** Asserted the documented order and added a generic sort-invariant check (`count DESC`, then `code ASC` with null as `''`) that holds regardless of global leftovers.
- **Files modified:** `tests/unit/analytics-phase9-loaders.test.ts`
- **Verification:** Test 5 green; pure-module ordering already pinned by `tests/unit/analytics-funnel.test.ts`.
- **Committed in:** `c32bae7` (Task 2 RED)

---

**Total deviations:** 1 auto-fixed (1 bug in the plan's illustrative expectation)
**Impact on plan:** Test-only correction consistent with the locked 09-01 contract. No implementation change, no scope change, no schema/enum/package work.

## Issues Encountered

- None during implementation. The local test Postgres (`postgresql://test:test@127.0.0.1:5432/test`) was reachable and its `orders` table empty, so every `windowIsExactly` fixture-ownership branch ran — the hand-computed assertions (funnel 5/4/3/2, rationals, timing 2h/3h and 60s/110s) were actually exercised, not skipped.
- `npx eslint lib/analytics/service.ts` reports one **pre-existing** warning: `computeCoverage` imported but unused (line 39, Phase 7 code). Left untouched per the scope-boundary rule; not introduced by this plan.

## Threat Flags

None. The loaders are read-only over the existing `orders` table; no new route/handler, no schema change, no new dependency (T-09-02-SC satisfied — zero installs). Payloads are counts, exact-rational rates and aggregated `{ code, count }` rows only (T-09-02-02); every scan is bounded by the period window and the expired count is a single `pending` count (T-09-02-03); the only input is the page-normalized `?period` reaching parameterized Prisma queries and `mskDayStartInstant`-derived instants (T-09-02-04). T-09-02-01 remains with the existing page-level `requireRole` guard (09-03).

## Known Stubs

None.

## Verification Results

```
DATABASE_URL='postgresql://test:test@127.0.0.1:5432/test' npx vitest run tests/unit/analytics-phase9-loaders.test.ts
✓ tests/unit/analytics-phase9-loaders.test.ts (9)
Test Files  1 passed (1)
Tests       9 passed (9)

# wave gate (loaders + pure core)
npx vitest run tests/unit/analytics-phase9-loaders.test.ts tests/unit/analytics-funnel.test.ts
Test Files  2 passed (2)
Tests       25 passed (25)
```

Full suite (`npm test`): `Test Files 1 failed | 68 passed (69)`, `Tests 1 failed | 606 passed (607)` — the only failure is the pinned pre-existing baseline `tests/unit/analytics-mrr.test.ts:190` (received 4000, expected 3600; Phase 7 CR-01 behaviour, untouched). **No new failures** (597 → 606 passing includes these 9). `npx tsc --noEmit` clean.

## Next Phase Readiness

- All five Phase 9 payload shapes are frozen for 09-03: `{ steps: [{ step, count, conversion, dropOff }] }`, `{ count, windowHours }`, `{ rows: [{ code, count }], total }`, `{ medianMs, meanMs, orders }` ×2.
- 09-03 can render `conversion * 100` / `dropOff * 100` and the `«Ждут оплаты более {windowHours} ч»` copy directly — no rounding happens below the component, and no 24h constant needs re-declaring.
- Remaining risk for 09-03 is presentation only (empty states: `conversion === null` → «—», `orders === 0` → «—»), already contracted in 09-CONTEXT D-02.

## Self-Check: PASSED

- FOUND: lib/analytics/service.ts (loadFunnel, loadExpired, loadErrorBreakdown, loadTimeToPay, loadTimeToProvision)
- FOUND: tests/unit/analytics-phase9-loaders.test.ts
- FOUND: 4851ca9 (task 1 RED)
- FOUND: 317732c (task 1 GREEN)
- FOUND: c32bae7 (task 2 RED)
- FOUND: 1617dc1 (task 2 GREEN)
