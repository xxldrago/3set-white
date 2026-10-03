---
phase: 03-payments
plan: "03"
subsystem: payments
tags: [outbox, worker, fulfillment, idempotency, backoff, reconcile, instrumentation, artemida, pay-01]

# Dependency graph
requires:
  - phase: 03-payments
    provides: 03-01 createKey(input,{idempotencyKey}) OBSERVED create shape; 03-02 Order/Outbox schema + orders-service + Platega callback
  - phase: 02-keys-trial
    provides: lib/keys-service upsert/cache path, lib/artemida typed errors + p-retry, claimTrial atomic pattern, lib/bot.ts singleton guard
provides:
  - lib/outbox.ts — idempotent enqueue keyed (orderId,type) + atomic claimNextJob + job-state writers
  - lib/worker.ts — startWorker singleton, drainOutbox, processFulfillOrder, startReconcileTick, reconcileOnce
  - instrumentation.ts — register() first-start hook gated to nodejs / non-build
  - lib/orders-service.ts — applyConfirmedPayment (shared callback+reconcile) + provisioning transitions + listReconcilableOrders
  - app/api/cron/reconcile — secret-gated manual reconcile (A6 fallback)
affects: [03-04, 03-05, 03-06, 03-07]

# Actuals (#2632) — chars/4 over the realized plan diff (46665 chars / 4 ≈ 11666).
# Estimate was 62000 (raw 31000, low confidence); recorded honestly, not rounded.
actuals:
  tokens: 11666
  tasks: 3
  commits: 4

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Durable outbox fulfillment: idempotent enqueue keyed (orderId,type); atomic single-winner claim via updateMany({where:{id,status:'pending'}}) count===1 (mirrors claimTrial)"
    - "Deterministic write idempotency for retries: caller passes order:{id}:{kind} so a worker retry never mints a second provider key (D-18/D-41, Pitfall 2)"
    - "Retryable/terminal split: rate_limited|bad_gateway|unavailable → backoff + order stays provisioning; 402/exhausted → failed + alert + one notify-failed row"
    - "Process-lifetime singleton (globalThis.__setwhiteWorker) + NEXT_RUNTIME/NEXT_PHASE guards so dev HMR/build never spawns a duplicate loop"
    - "One shared pending→paid+enqueue helper (applyConfirmedPayment) for both the callback and the hourly reconcile, so the two money-path entries cannot diverge"
    - "Guarded intervals: every drain/reconcile rejection is caught; setInterval timers are unref'd; job-state writes use updateMany (vanished row = no-op)"
    - "Secret-gated machine route: timing-safe x-cron-secret compare; 503 when the secret env is unset (closed by default)"

key-files:
  created:
    - lib/outbox.ts
    - lib/worker.ts
    - instrumentation.ts
    - app/api/cron/reconcile/route.ts
    - tests/unit/outbox-worker.test.ts
    - tests/unit/order-service.test.ts
    - tests/unit/cron-reconcile-route.test.ts
  modified:
    - lib/orders-service.ts
    - lib/keys-service.ts
    - lib/env.ts
    - vitest.config.ts

key-decisions:
  - "Fulfillment enqueue key is deterministic: order:{orderId}:{kind} — order:{id}:new for the paid create, so a p-retry/worker retry reuses the same provider idempotency token"
  - "The Outbox fulfill-order job is the retry scheduler: drainOutbox reschedules it to pending with a future nextAttemptAt on a retryable error; terminal outcomes mark it done and enqueue exactly one notify-failed row"
  - "notify-provisioned / notify-failed rows are produced here but consumed by plan 03-07's bot-push branch; this worker claims only fulfill-order jobs so delivery rows are not orphaned"
  - "Reconcile is global (aged pending orders, non-null plategaTxId) and reuses applyConfirmedPayment; it never provisions inline. Orders with no tx id are left to the callback payload-recovery path"
  - "kind:'new' only is fulfilled; renew/upgrade are terminal not_implemented until Wave 3 (no such order can be created by the BFF yet)"
  - "CRON_SECRET is optional in lib/env.ts: unset closes POST /api/cron/reconcile (503) rather than opening it; the instrumentation worker stays the primary path (A6)"
  - "DB-backed test files run sequentially (vitest fileParallelism:false) because the worker/reconcile scanners are global over one shared Postgres"

requirements-completed: [PAY-01]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "A paid order is claimed by the worker, provisioned exactly once via artemida.createKey with Idempotency-Key order:<id>:new, persisted through the shared key-cache upsert, and reaches provisioned (+ one notify-provisioned row)"
    requirement: PAY-01
    verification:
      - kind: unit
        ref: "npx vitest run tests/unit/outbox-worker.test.ts#claims a paid order, provisions it once under order:<id>:new, and reaches provisioned"
        status: pass
    human_judgment: false
  - id: D2
    description: "A retryable ARTEMIDA error (429/502/503) leaves the order provisioning with a future nextAttemptAt and the outbox job pending; the next attempt reuses the SAME Idempotency-Key"
    requirement: PAY-01
    verification:
      - kind: unit
        ref: "npx vitest run tests/unit/outbox-worker.test.ts#backs off a retryable error and reuses the SAME Idempotency-Key on the next attempt"
        status: pass
    human_judgment: false
  - id: D3
    description: "An exhausted attempt budget and an ARTEMIDA 402 both mark the order failed and enqueue exactly one notify-failed row"
    requirement: PAY-01
    verification:
      - kind: unit
        ref: "npx vitest run tests/unit/outbox-worker.test.ts (attempt-budget + 402 vectors)"
        status: pass
    human_judgment: false
  - id: D4
    description: "The hourly reconcile recovers a lost CONFIRMED callback through the SAME pending→paid + enqueue transition as the callback, never provisions inline, and skips a null-tx order without throwing"
    requirement: PAY-01
    verification:
      - kind: unit
        ref: "npx vitest run tests/unit/order-service.test.ts"
        status: pass
    human_judgment: false
  - id: D5
    description: "The worker starts once from instrumentation.ts, never during next build, and the manual POST /api/cron/reconcile is secret-gated (401 missing/forged, 200 valid)"
    requirement: null
    verification:
      - kind: unit
        ref: "npx vitest run tests/unit/cron-reconcile-route.test.ts"
        status: pass
      - kind: other
        ref: "npm run build | grep -c worker-started == 0; grep -c NEXT_RUNTIME instrumentation.ts == 2; npx tsc --noEmit"
        status: pass
    human_judgment: false

# Metrics
duration: ~8min
started: 2026-10-03T03:10:58Z
completed: 2026-10-03T03:18:31Z
status: complete
---

# Phase 03 Plan 03: Outbox Fulfillment Worker + Reconcile Summary

**Paid orders now become delivered keys asynchronously and durably: a single-instance outbox worker claims a fulfill job atomically, provisions `kind:'new'` via `artemida.createKey(..., {idempotencyKey: 'order:<id>:new'})`, backs off retryable ARTEMIDA errors under the same key, and turns 402/exhausted attempts into `failed` + exactly one `notify-failed` row — with an hourly reconcile that recovers lost callbacks through the same shared transition.**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-10-03T03:10:58Z
- **Completed:** 2026-10-03T03:18:31Z
- **Tasks:** 3 of 3
- **Files:** 7 created, 4 modified

## Accomplishments

- **Outbox layer (`lib/outbox.ts`).** Idempotent `enqueueOrderJob` keyed on the UNIQUE `(orderId,type)` pair; `claimNextJob` uses a candidate `findMany` + a per-row conditional `updateMany` so exactly one tick wins a job (same discipline as `claimTrial`). Job-state writers use `updateMany` so a vanished row is never a crash.
- **Fulfillment worker (`lib/worker.ts`).** `processFulfillOrder` claims `paid→provisioning`, branches on kind (`new` only), provisions under `order:{id}:new`, mirrors the key through the shared `upsertCachedKey`, marks `provisioned`, and enqueues one `notify-provisioned` row. Retryable codes back off (honoring `Retry-After`) and keep the order `provisioning`; 402 and an exhausted budget (5 attempts) mark `failed` + alert + one `notify-failed` row. `drainOutbox` runs every 5 s; `startWorker` is a `globalThis` singleton with unref'd intervals.
- **Startup (`instrumentation.ts`).** `register()` returns early unless `NEXT_RUNTIME === 'nodejs'` and not `NEXT_PHASE === 'phase-production-build'`; the `lib/worker` import is lazy and a bootstrap failure is caught.
- **Reconcile (`reconcileOnce` + `listReconcilableOrders`).** Hourly tick re-queries aged pending orders against Platega and, on CONFIRMED with matching amount/currency, applies the SAME `applyConfirmedPayment` helper now used by the callback — recovery and live delivery cannot diverge.
- **A6 fallback (`app/api/cron/reconcile`).** Session-less, `x-cron-secret` timing-safe-gated `POST` that runs one reconcile pass; closed with 503 when `CRON_SECRET` is unset.

## Task Commits

Each task was committed atomically:

1. **Task 1 (tracer): outbox fulfillment worker** — `1afd2d2` (feat)
2. **Task 2: reconcile + shared transition vectors** — `b987cc1` (test)
3. **Task 2: converge callback onto `applyConfirmedPayment`** — `3d7aa6a` (feat)
4. **Task 3: secret-gated cron route + bootstrap hardening** — `683fdbb` (feat)

**Plan metadata:** (this SUMMARY commit) (docs)

## Files Created/Modified

- `lib/outbox.ts` (created) — idempotent enqueue + atomic claim + job-state writers.
- `lib/worker.ts` (created) — singleton start, drain loop, fulfillment, hourly reconcile.
- `instrumentation.ts` (created) — gated first-start hook.
- `app/api/cron/reconcile/route.ts` (created) — secret-gated manual reconcile (A6 fallback).
- `tests/unit/outbox-worker.test.ts` (created) — 6 DB-backed vectors.
- `tests/unit/order-service.test.ts` (created) — 7 DB-backed reconcile/transition vectors.
- `tests/unit/cron-reconcile-route.test.ts` (created) — 3 secret-gate vectors.
- `lib/orders-service.ts` (modified) — `applyConfirmedPayment`, `transitionToProvisioning`, `markProvisioned`, `markProvisionError`, `markProvisionFailed`, `listReconcilableOrders`; `enqueueFulfillOrder` delegates to `lib/outbox.ts`.
- `lib/keys-service.ts` (modified) — exported `upsertCachedKey` for the worker's shared cache path.
- `lib/env.ts` (modified) — optional `CRON_SECRET`.
- `vitest.config.ts` (modified) — dummy `CRON_SECRET`; `fileParallelism: false` for shared-DB global-worker safety.

## Decisions Made

- **Deterministic key `order:{id}:new`** on every fulfillment attempt (reused across retries), per D-18/D-41 and the 03-01 observed create contract.
- **Order stays `provisioning` on a retryable error**; the Outbox `fulfill-order` row is the retry scheduler (pending + future `nextAttemptAt`). Terminal outcomes mark the job done and enqueue one `notify-failed`.
- **Delivery rows are produced, not consumed, here.** The worker claims only `fulfill-order`; `notify-provisioned`/`notify-failed` are consumed by plan 03-07's bot-push branch, so no delivery row is orphaned or double-consumed.
- **`renew`/`upgrade` are terminal `not_implemented`** until Wave 3; no such order can be created (`POST /api/orders` accepts `kind:'new'` only).
- **`CRON_SECRET` optional, closed-by-default route** — the instrumentation worker remains primary (A6).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Exported `upsertCachedKey` from `lib/keys-service.ts`**
- **Found during:** Task 1 (worker fulfillment)
- **Issue:** The plan requires the worker to persist the created key "via the keys-service upsert path", but `upsertCachedKey` was module-private.
- **Fix:** exported it so the worker reuses the single cache-mapping path instead of duplicating field normalization.
- **Files modified:** `lib/keys-service.ts`
- **Verification:** success vector asserts the key lands in `keys_cache`; `tsc` clean.
- **Committed in:** `1afd2d2`

**2. [Rule 1 - Bug] Worker job-state writers threw on a vanished row**
- **Found during:** Task 3 (full-suite run)
- **Issue:** `markJobFailed`/`markJobDone`/`rescheduleJob` used `prisma.outbox.update`, which throws "No record was found" when a job row is cascade-deleted mid-drain — violating the prohibition that a worker error must never crash the loop.
- **Fix:** switched all three to `updateMany` (a missing row is a no-op).
- **Files modified:** `lib/outbox.ts`
- **Verification:** full unit suite green; the drain loop no longer propagates a missing-row error.
- **Committed in:** `683fdbb`

**3. [Rule 3 - Blocking] Shared-Postgres global-worker test race**
- **Found during:** Task 3 (full-suite run)
- **Issue:** Vitest ran DB-backed files in parallel; the worker/reconcile scanners are global (not user-scoped), so one file's drain could claim/mutate another file's jobs and orders, intermittently failing `outbox-worker.test.ts`.
- **Fix:** set `fileParallelism: false` (files run one at a time, each cleans up before the next) and added a dummy `CRON_SECRET` to the test env.
- **Files modified:** `vitest.config.ts`
- **Verification:** `npx vitest run tests/unit` → 17 files / 128 tests green, deterministic.
- **Committed in:** `683fdbb`

**4. [Rule 2 - Missing critical functionality] Bootstrap failure could crash the server**
- **Found during:** Task 3 (hardening)
- **Issue:** `instrumentation.register()` called `startWorker()` unguarded; a throw during worker import/start would surface at server boot.
- **Fix:** wrapped the lazy import + start in try/catch with a dynamic logger import so a bootstrap failure is logged, never fatal.
- **Files modified:** `instrumentation.ts`
- **Verification:** `npm run build` succeeds with 0 `worker-started` log lines; `tsc` clean.
- **Committed in:** `683fdbb`

---

**Total deviations:** 4 auto-fixed (2 missing-critical, 1 bug, 1 blocking)
**Impact on plan:** All are correctness/robustness hardening within the plan's intent. No scope creep, no new packages (T-03-SC honored: no installs).

## Issues Encountered

- **Cross-file DB interference surfaced by the new global worker scanners** — resolved by serializing Vitest files (deviation 3). This is a test-infra consequence of the design (one global outbox/reconcile), not a product defect.
- **`npm run build` needs a full env set locally** (`.env.local` holds only ARTEMIDA creds); the verification build was run with dummy in-shell values, matching the vitest dummy-env discipline. No real secrets used or committed.

## TDD Gate Compliance

- **Plan-level type:** `execute` (not a `type: tdd` plan), so no plan-level RED/GREEN gate sequence is mandated.
- **Task 2 (`tdd="true"`):** committed `test(...)` → `feat(...)` (`b987cc1` then `3d7aa6a`).
- **Nuance recorded honestly:** Task 1 (the tracer) necessarily implemented the reconcile spine — `startReconcileTick`, `listReconcilableOrders`, and `reconcileOnce` are Task-1 `must_haves` — so Task 2's behavior tests passed against pre-existing implementation rather than failing-first. The tests are correct and guard the contract (including "never provisions inline" and "skips null-tx"); the fail-fast rule was investigated and the cause is the intentional Task-1 forward implementation, not a mis-targeted test. The Task 2 `feat` commit is the callback→`applyConfirmedPayment` convergence required by the task action.

## Known Stubs

None. The `notify-provisioned` / `notify-failed` consumers (bot key-push) are intentionally deferred to plan 03-07 and documented (not stubs); both rows have a producer here. `renew`/`upgrade` fulfillment branches are terminal `not_implemented` by design until Wave 3, and no such order can be created yet.

## Threat Flags

No new threat surface beyond the plan's `<threat_model>`. The one new untrusted boundary — `POST /api/cron/reconcile` (T-03-cronopen) — is mitigated with a timing-safe shared-secret gate, closed-by-default when `CRON_SECRET` is unset, and tested (401 missing/forged).

## Next Phase Readiness

- `applyConfirmedPayment` + `listReconcilableOrders` + the provisioning transitions are the shared money-path API for 03-04/03-05.
- Plan 03-07 must add the `notify-provisioned` / `notify-failed` consumers to the worker branch (claim by type) and the renew/upgrade fulfillment branches.
- A6 fallback route is live for an external scheduler if the standalone image does not run `instrumentation.register()`.

---

*Phase: 03-payments*
*Completed: 2026-10-03*

## Self-Check: PASSED

- FOUND: commit `1afd2d2` (Task 1 — outbox fulfillment worker)
- FOUND: commit `b987cc1` (Task 2 RED — reconcile/transition vectors)
- FOUND: commit `3d7aa6a` (Task 2 GREEN — callback converges on applyConfirmedPayment)
- FOUND: commit `683fdbb` (Task 3 — cron route + bootstrap hardening)
- FOUND: lib/outbox.ts, lib/worker.ts, instrumentation.ts, app/api/cron/reconcile/route.ts
- FOUND: tests/unit/outbox-worker.test.ts, tests/unit/order-service.test.ts, tests/unit/cron-reconcile-route.test.ts
- VERIFY: `export DATABASE_URL=postgresql://alekseimikhalkin@127.0.0.1:5432/setwhite && npx vitest run tests/unit` → 17 files / 128 tests green
- VERIFY: `npx tsc --noEmit` clean; `npm run build` clean with 0 `worker-started` log lines
- VERIFY (manual): `grep -v '^#' instrumentation.ts | grep -c 'NEXT_RUNTIME'` = 2
- SECURITY: no provider error text or sub-link logged/stored; no secret value committed; no new packages
- NOTE: STATE.md / ROADMAP.md intentionally NOT written by the executor (orchestrator owns those)
