---
phase: 07-analytics-foundation-revenue-metrics
plan: "03"
subsystem: payments
tags: [provider-cost, artemida, provisioning, concurrency, promise-all, admin, leak-guard, source-contract, vitest]

# Dependency graph
requires:
  - phase: 07-analytics-foundation-revenue-metrics
    provides: "Order.providerCost nullable column + generated Prisma client (07-01 migration 20261021064134_analytics_phase7)"
provides:
  - "lib/worker.ts quoteProviderCost(order) — per-kind ARTEMIDA expense quote (new/renew → getPricing; upgrade → getUpgradeQuote with mirror-recovered baseDevices)"
  - "processFulfillOrder wiring: Promise.all([provisionByKind, quoteProviderCost.catch]) — quote runs concurrently with provisioning, never delays key delivery (D-06)"
  - "lib/orders-service.ts markProvisioned(orderId, keyId, providerCost = null) — cost lands in the SAME atomic provisioning transition"
  - "lib/admin-service.ts AdminPaymentRow = OrderHistoryRow & { providerCost: number | null } + loadAdminPayments returning providerCost ?? null — admin-only read path (D-08)"
  - "tests/unit/analytics-provider-cost.test.ts — 11 tests: capture / outage→null / upgrade baseDevices / default-arg + no-leak source contract"
affects: [07-04, 07-05, phase-08]

# Actuals (#2632) — chars/4 over the realized diff (17.9k chars / 382 line-changes).
actuals:
  tokens: 4466
  tasks: 2
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Concurrent side-quote during provisioning: Promise.all(provider call, quote.catch(() => null)) — a metric never buys latency or reliability risk on the money path"
    - "Cost source discipline: always artemida.getPricing/getUpgradeQuote, never resolveTariffQuote (manual grid = retail → zero margin, Pitfall 6)"
    - "Admin-only extension type over a shared mapper: AdminPaymentRow = OrderHistoryRow & {...}, the base shape stays cost-free"

key-files:
  created:
    - tests/unit/analytics-provider-cost.test.ts
  modified:
    - lib/worker.ts
    - lib/orders-service.ts
    - lib/admin-service.ts

key-decisions:
  - "quoteProviderCost throws worker:upgrade_missing_key when an upgrade order lacks keyId (TS-typed guard on the plan's null keyId case) — error surfaces through the .catch→null path exactly like a provider outage"
  - "quoteProviderCost for kind=new uses order.days ?? 30 — mirrors the provisioning call's own fallback so both concurrent legs always see the same shape"
  - "No-leak scan includes lib/bot-payments.ts (a customer surface per RESEARCH anti-pattern list, Pitfall 5) in addition to the plan's three named UI surfaces — strengthening the T-07-03-01 mitigation at zero cost"
  - "ANL-12 marked Complete in REQUIREMENTS.md during the metadata step (shared-ID gate clear: both declaring plans 07-01 and 07-03 now have SUMMARYs)"

patterns-established:
  - "Money-path measurement belt-and-suspenders: measure (quote) concurrently, write in the same atomic transition, fail open to null"
  - "Region-scoped source-contract scans: assert field absence on the exact mapper block/interface, not the whole file"

requirements-completed: [ANL-12]

coverage:
  - id: D1
    description: "providerCost captured in the SAME atomic provisioning transition — getPricing/getUpgradeQuote run CONCURRENTLY with provisionByKind; a quote outage (5xx) logs provider_cost_unavailable and leaves providerCost null, never blocking key delivery (D-06/D-07)"
    requirement: "ANL-12"
    verification:
      - kind: unit
        ref: "tests/unit/analytics-provider-cost.test.ts#4 capture tests (new capture, 502 outage→null+warn, upgrade baseDevices=max(1,5−2)+delta assertion, markProvisioned default)"
        status: pass
      - kind: other
        ref: "npx tsc --noEmit (exit 0)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Admin-only cost visibility: AdminPaymentRow type + loadAdminPayments mapping {...toHistoryRow(o), providerCost: o.providerCost ?? null}; the shared OrderHistoryRow/toHistoryRow stay cost-free and the no-leak source contract verifies the field is absent from the mapper region and all customer surfaces (cabinet list/status panel/payments page/bot history) (D-08)"
    requirement: "ANL-12"
    verification:
      - kind: unit
        ref: "tests/unit/analytics-provider-cost.test.ts -t 'no leak' → 7 passed / 4 skipped (capture tests scoped out by the filter)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Manual reconciliation row (VALIDATION): a provisioned test order's cost renders on the admin payments surface, and a pre-implementation order renders — (the coverage gap), with the coverage flag visible"
    requirement: "ANL-12"
    verification: []
    human_judgment: true
    rationale: "Requires a deployed environment with real provisioning + the admin UI from the phase's UI plan (rendering is NOT in this plan's files_modified — the page consumes AdminPaymentRow later); structurally de-risked by the DB-backed capture tests and the source-contract suite."

duration: 12min
completed: 2026-10-21
status: complete
---

# Phase 7 Plan 3: providerCost Capture Summary

**Per-order ARTEMIDA expense captured at provisioning via a concurrent quote written in the same atomic transition, with the admin-only `AdminPaymentRow` read path and an 11-test suite proving outage-resilience and a provably cost-free customer surface.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-10-21T07:27:42Z
- **Completed:** 2026-10-21T07:39:44Z
- **Tasks:** 2 of 2 (Task 1 TDD: RED + GREEN; Task 2 auto)
- **Files modified:** 4 (1 created, 3 modified)

## Accomplishments

- `lib/orders-service.ts`: `transitionOrder`'s `Partial<Pick<Order, …>>` data bag gains `"providerCost"`; `markProvisioned(orderId, keyId, providerCost: number | null = null)` now writes the cost inside the SAME atomic single-winner `provisioning→provisioned` transition — no second write. Only one caller exists (worker), and the no-third-arg call preserves today's behaviour (verified by test).
- `lib/worker.ts`: new `quoteProviderCost(order)` — `new`/`renew` → `artemida.getPricing({ days, devices })` (mirroring the provisioning input shape); `upgrade` → `artemida.getUpgradeQuote({ days: 30, devices: baseDevices, addDevices: order.devices })` with `baseDevices = Math.max(1, (cached?.deviceLimit ?? order.devices) − order.devices)` recovered from the key mirror (subtraction required: a retry after partial success already observes the post-upgrade limit). Cost is NEVER derived from `resolveTariffQuote`/`resolveUpgradeQuote` (manual grid = retail → structurally zero margin, Pitfall 6).
- `processFulfillOrder` now runs `Promise.all([provisionByKind(...), quoteProviderCost(order).catch((err) => { logger.warn({ route: 'worker', outcome: 'provider_cost_unavailable', orderId, code }); return null; })])` — the quote costs zero added latency, provisioning remains the gate, and a failed quote leaves `providerCost` null with a typed-code warn (ids/outcomes only, T-07-03-04).
- `lib/admin-service.ts`: `export type AdminPaymentRow = OrderHistoryRow & { providerCost: number | null }`; `loadAdminPayments` returns `orders.map((o) => ({ ...toHistoryRow(o), providerCost: o.providerCost ?? null }))`. The shared customer mapper/interface are untouched.
- `tests/unit/analytics-provider-cost.test.ts`: **11 tests green** — 4 capture behaviours (new capture → providerCost 5000, 502 outage → provisioned with null + warn, upgrade delta with `getUpgradeQuote` receiving `{ days: 30, devices: 3, addDevices: 2 }`, markProvisioned default) + 7 no-leak source-contract assertions (mapper region ×2, 4 customer surfaces, AdminPaymentRow declaration).
- **ANL-12 marked Complete** in `.planning/REQUIREMENTS.md` (checkbox + traceability table) — the pending item 07-01's executor never marked.
- Full suite: **507 passed / 59 files** (07-02 baseline 496/57); `npx tsc --noEmit` exit 0.

## Task Commits

Each task was committed atomically (Task 1 is TDD — RED before GREEN):

1. **Task 1a: RED — failing providerCost capture tests** - `8133667` (test)
2. **Task 1b: GREEN — capture wiring (D-06/D-07)** - `4aace4a` (feat)
3. **Task 2: admin-only providerCost row + no-leak contract (D-08)** - `c6429b2` (feat)

_No REFACTOR commit — the implementation needed no cleanup._

**Plan metadata:** committed with this SUMMARY (REQUIREMENTS.md ANL-12 flip included). STATE.md/ROADMAP.md are intentionally untouched — the orchestrator owns those writes.

## Files Created/Modified

- `lib/orders-service.ts` — `providerCost` added to the transitionOrder data bag; `markProvisioned` third param
- `lib/worker.ts` — `quoteProviderCost` + `Promise.all` wiring in `processFulfillOrder`
- `lib/admin-service.ts` — `AdminPaymentRow` type + admin-only mapping in `loadAdminPayments`
- `tests/unit/analytics-provider-cost.test.ts` — capture + no-leak suite (new)

## Decisions Made

- `quoteProviderCost` throws `worker:upgrade_missing_key` on an upgrade order without `keyId` (the plan left the null-keyId TS shape open); the error surfaces through the `.catch → null` path exactly like a provider outage.
- For `kind=new` the quote uses `order.days ?? 30`, mirroring the provisioning call's own fallback so both concurrent legs always agree; for renew, days is non-null (the provisioning path enforces it).
- The no-leak source contract also scans `lib/bot-payments.ts` — a customer-facing surface in RESEARCH's Pitfall 5 list — beyond the three UI surfaces named in the task (zero-cost strengthening of T-07-03-01).
- The admin user-detail page / ticket context already consume `loadAdminPayments`; widening the return type to `AdminPaymentRow[]` is compile-safe (structurally a subtype), and the actual `—` rendering lands with the phase's UI plan since no UI file is in this plan's `files_modified`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Self-authored no-leak test used callback-API `readFile` from `node:fs`**
- **Found during:** Task 2 (first green run of the new source-contract suite)
- **Issue:** `await readFile(path, 'utf8')` imported from `node:fs` (callback API) threw `TypeError: The "cb" argument must be of type function`; the AdminPaymentRow assertion failed.
- **Fix:** Switched to `readFileSync` (consistent with the mapper test and the admin-route.test.ts pattern); `node:fs/promises` import removed.
- **Files modified:** `tests/unit/analytics-provider-cost.test.ts`
- **Verification:** full file → 11 passed
- **Committed in:** `c6429b2` (fixed before the task commit landed)

---

**Total deviations:** 1 auto-fixed (1 self-authored test bug, pre-commit). Plus one plan-strengthening extension documented under Decisions (no-leak scan adds `lib/bot-payments.ts` — Rule 2 hardening of T-07-03-01).
**Impact on plan:** Both were inside the new test file; no behaviour, schema, or signature deviations from the plan's prescriptive shapes.

## Issues Encountered

- **RED-phase note (TDD):** Test 4 (`markProvisioned` default arg) passed during RED — expected, not a fail-fast violation: it is a regression guard pinning today's behaviour, written deliberately so the GREEN commit cannot silently change the no-cost path. Tests 1–3 failed for the right reasons (no quote call, no warn log, no upgrade quote).
- `.planning/STATE.md` carried an uncommitted orchestrator modification at start; left untouched per this plan's execution mode.

## User Setup Required

None — no external service configuration required. (The phase-level `07-USER-SETUP.md` crontab/backfill runbook from 07-02 is unaffected by this plan.)

## Next Phase Readiness

- Every order provisioned from now on carries its provider cost; pre-existing orders stay null (D-08), and the rollup's `providerCostOrders / paidOrders` coverage flag (07-02) consumes the honest gap directly.
- `AdminPaymentRow` is exported for the admin UI plans (07-04/07-05): render `—` for null, per the D-08 contract.
- Phase 8 (ANL-05/ANL-13 margin metrics) can read `Order.providerCost` without another schema change.

---
*Phase: 07-analytics-foundation-revenue-metrics*
*Completed: 2026-10-21*

## Self-Check: PASSED

- All 4 planned artifacts exist on disk (worker, orders-service, admin-service, test file).
- All task commits present: `8133667` (RED), `4aace4a` (GREEN), `c6429b2` (Task 2).
- TDD gates: RED `8133667` precedes GREEN `4aace4a`; no REFACTOR needed.
- Task 1 verify re-run: `npx vitest run tests/unit/analytics-provider-cost.test.ts` → 4 capture tests green after the implementation.
- Task 2 verify re-run: `-t 'no leak'` → 7 passed / 4 skipped.
- Plan-level verification re-run: full `npm test` → **507 passed (59 files)**; `npx tsc --noEmit` → exit 0.
- Restrictions honored: no new migration (07-01's applied), no new npm dependencies, no prettier run, STATE.md/ROADMAP.md untouched (orchestrator-owned).
