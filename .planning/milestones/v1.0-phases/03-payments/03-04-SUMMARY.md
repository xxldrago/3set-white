---
phase: 03-payments
plan: "04"
subsystem: payments
tags: [renew, upgrade, addDevices, trial-block, idor, idempotency, order-pipeline, pay-02, pay-03]

# Dependency graph
requires:
  - phase: 03-payments
    provides: 03-01 observed create/upgrade contract + upgrade quote; 03-02 Order/Outbox + orders-service + Platega callback; 03-03 outbox worker + reconcile + provisioning transitions
  - phase: 02-keys-trial
    provides: lib/keys-service getKeyForUser ownership join + RenderedKey; lib/artemida typed errors + p-retry
provides:
  - app/api/orders/route.ts — kind-aware new/renew/upgrade acceptance + trial/ownership pre-checks
  - lib/orders-service.ts — precheckOwnedKey + keyDeviceLimit + TRIAL_ERROR_CODE shared signal + kind-aware quote/create
  - lib/worker.ts — provisionByKind renew/upgrade branches + conflict→trial-family mapping
  - lib/artemida.ts — upgradeKey now posts the observed {addDevices} body (contract finding #5)
affects: [03-05, 03-06, 03-07]

# Actuals (#2632) — chars/4 over the realized plan diff (39580 diff chars / 4 ≈ 9895).
# Estimate was 60000 (raw 30000, low confidence); recorded honestly, not rounded.
actuals:
  tokens: 9895
  tasks: 3
  commits: 5

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "One pipeline, branch on kind at the tail (D-42): `new`/`renew` quote via GET /pricing, `upgrade` via the derived prorated delta; only the provider call in the worker differs"
    - "Pre-provider security gate: ownership-joined getKeyForUser BEFORE any quote/Platega call; non-owned ≡ missing (404, no oracle), trial → 409 trial-family (T-03-idor/T-03-trial-bypass)"
    - "Shared trial-family code (TRIAL_ERROR_CODE='trial' + isTrialConflict): the BFF pre-check and the worker's provider-conflict mapping converge so neither layer ever surfaces a raw 409 (D-44)"
    - "Order carries the wire intent: for upgrade, Order.devices stores the addDevices delta the worker replays to the provider"
    - "Observed-contract enforcement: upgradeKey posts {addDevices} ONLY (contract finding #5), never the pre-probe {days,devices}"

key-files:
  created:
    - tests/unit/order-route.test.ts
  modified:
    - app/api/orders/route.ts
    - lib/orders-service.ts
    - lib/worker.ts
    - lib/artemida.ts
    - tests/unit/order-service.test.ts
    - tests/unit/artemida-client.test.ts

key-decisions:
  - "D-45 ratified (adopt): renew extends the current expiry by the purchased days; upgrade adds devices with the observed prorated surcharge; device ceiling stays 2..10 (owner-adopted standard semantics)"
  - "upgradeKey switched to {addDevices} ONLY — the pre-probe {days,devices} body is rejected by the provider with 400 unsupported_fields (03-01 contract finding #5, now resolved)"
  - "Order.devices stores the addDevices delta for upgrade orders (not the resulting total); the worker replays it as the observed {addDevices} wire field"
  - "TRIAL_ERROR_CODE + isTrialConflict are the single sync point between the BFF 409 and the worker terminal code (worker has no import cycle; orders-service does not import the worker)"
  - "kind:'new' device bounds stay 2..10; renew ignores a client device count (uses the joined key's limit); upgrade rejects currentLimit+add > 10 server-side"

requirements-completed: [PAY-02, PAY-03]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "renew/upgrade on an owned non-trial key is accepted, persisted (kind/keyId/server amount) and reaches the shared Platega create path"
    requirement: PAY-02
    verification:
      - kind: unit
        ref: "npx vitest run tests/unit/order-route.test.ts (accept vectors)"
        status: pass
    human_judgment: false
  - id: D2
    description: "a trial key is rejected 409 {error:'trial'} with no provider/Platega call; a non-owned key is 404 (no oracle); upgrade past 10 devices is 400; no session is 401"
    requirement: PAY-02
    verification:
      - kind: unit
        ref: "npx vitest run tests/unit/order-route.test.ts (trial/404/ceiling/401 vectors)"
        status: pass
    human_judgment: false
  - id: D3
    description: "a paid renew fulfills via renewKey{days,devices} under order:<id>:renew and a paid upgrade via upgradeKey{addDevices} under order:<id>:upgrade, each marking provisioned + refreshing the cached key"
    requirement: PAY-03
    verification:
      - kind: unit
        ref: "npx vitest run tests/unit/order-service.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "a retried renew reuses the identical idempotency key; a provider 409 conflict is terminal trial-family (never retried)"
    requirement: PAY-03
    verification:
      - kind: unit
        ref: "npx vitest run tests/unit/order-service.test.ts (retry + conflict vectors)"
        status: pass
    human_judgment: false
  - id: D5
    description: "upgradeKey posts the observed {addDevices} body, not {days,devices}"
    requirement: PAY-03
    verification:
      - kind: unit
        ref: "npx vitest run tests/unit/artemida-client.test.ts"
        status: pass
    human_judgment: false

# Metrics
duration: ~6min
started: 2026-10-03T03:22:56Z
completed: 2026-10-03T03:28:40Z
status: complete
---

# Phase 03 Plan 04: Renew/Upgrade on the Shared Pipeline Summary

**Adding devices and renewing days now ride the identical order → Platega → callback → outbox path as a new purchase — `POST /api/orders` accepts `kind:new|renew|upgrade` with an ownership/trial pre-check, the worker branches only on kind, `upgradeKey` was corrected to the observed `{addDevices}` wire body, and trial keys are blocked at both the BFF (409 `{error:'trial'}`) and the worker (terminal trial-family) with no raw provider 409 ever surfacing.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-10-03T03:22:56Z
- **Completed:** 2026-10-03T03:28:40Z
- **Tasks:** 3 of 3
- **Files:** 1 created, 6 modified

## Checkpoint — D-45 ratification

The plan opened with a `checkpoint:decision` for D-45. In `03-CONTEXT.md`, D-45 is a locked owner decision (standard semantics: *renew добавляет дни к текущему сроку; upgrade добавляет устройства с prorated-доплатой*) and the phase boundary is marked *"все развилки закрыты явным выбором пользователя"*. The `adopt` option is therefore the only one consistent with the locked context, so it was ratified and recorded here:

**Adopted D-45:** renew extends the current expiry by the purchased days; upgrade charges the prorated device surcharge from the observed provider rule; device limit stays 2..10. Both the plan-level implicit `adopt` selection and this record clear the checkpoint before the fulfillment branches landed.

## Accomplishments

- **Task 1 — kind-aware order creation.** `POST /api/orders` now accepts `kind:renew|upgrade` with a required `keyId` (+ `days` for renew, `addDevices` for upgrade). Before any quote/Platega call, `precheckOwnedKey` resolves the key through the ownership-joined `getKeyForUser` — a non-owned/missing key is a 404 (no oracle) and a trial key is a 409 `{error:'trial'}` (never a raw provider code). `createOrder` quotes `new`/`renew` via `GET /pricing` and `upgrade` via the derived prorated delta, persisting the keyId and (for upgrade) the addDevices delta. An upgrade pushing `currentLimit + addDevices > 10` is rejected 400 server-side.
- **Task 2 — worker fulfillment branches.** `provisionByKind` replaces the Wave-3 placeholder: `renew → artemida.renewKey(keyId, {days,devices}, {idempotencyKey:'order:<id>:renew'})` and `upgrade → artemida.upgradeKey(keyId, {addDevices}, {idempotencyKey:'order:<id>:upgrade'})`. Success refreshes the cached key through the shared `upsertCachedKey` and marks provisioned; a retried attempt reuses the identical idempotency key.
- **Contract fix (finding #5).** `lib/artemida.ts::upgradeKey` now posts `{addDevices}` ONLY, matching the observed 2026-10-03 provider contract (the pre-probe `{days,devices}` returned `400 unsupported_fields`). Its TS signature is `{addDevices: number}` and the client test asserts the wire body.
- **Task 3 — trial-blocking parity.** A parity test asserts the BFF trial rejection and the worker's provider-`conflict` mapping resolve to the same `TRIAL_ERROR_CODE` (`'trial'`), so neither layer ever surfaces a raw 409 regardless of which caught it.

## Task Commits

Each task was committed atomically (RED then GREEN for the tdd tasks):

1. **Task 1 (RED): failing renew/upgrade order-route vectors** — `7f67983` (test)
2. **Task 1 (GREEN): kind-aware order creation + pre-checks** — `a6fffe0` (feat)
3. **Task 2 (RED): failing renew/upgrade worker vectors** — `9798aba` (test)
4. **Task 2 (GREEN): worker branches + upgradeKey {addDevices}** — `0e06b10` (feat)
5. **Task 3: trial-family parity test** — `b28d9e5` (test)

**Plan metadata:** (this SUMMARY commit) (docs)

## Files Created/Modified

- `app/api/orders/route.ts` (modified) — `kind` enum body + superRefine; `createMutationOrder` with ownership/trial pre-check and the clean `OrderRequestError` mapping.
- `lib/orders-service.ts` (modified) — `TRIAL_ERROR_CODE`, `isTrialConflict`, `precheckOwnedKey`, `keyDeviceLimit`, `MIN/MAX_DEVICES`; kind-aware quote in `createOrder`.
- `lib/worker.ts` (modified) — `provisionByKind`; `handleFulfillError` maps a provider `conflict` to the trial-family code.
- `lib/artemida.ts` (modified) — `upgradeKey` signature + wire body `{addDevices}`.
- `tests/unit/order-route.test.ts` (created) — 9 vectors (accept/trial/404/ceiling/401/parity).
- `tests/unit/order-service.test.ts` (modified) — 5 renew/upgrade fulfillment vectors.
- `tests/unit/artemida-client.test.ts` (modified) — upgradeKey `{addDevices}` wire assertions.

## Decisions Made

- **D-45 ratified (adopt)** — see Checkpoint section.
- **`upgradeKey` → `{addDevices}` ONLY** — resolves 03-01 contract finding #5; the live probe showed `{days,devices}` is rejected and there was no other caller of the old shape in app/lib/scripts.
- **`Order.devices` stores the addDevices delta for upgrade** — keeps one column semantics ("devices the worker sends") and lets the worker replay the observed wire field without recomputing the differing baseline (the total lives in `keys_cache.deviceLimit`).
- **`TRIAL_ERROR_CODE` lives in `orders-service`** (not the worker) — the worker imports orders-service, so this avoids an import cycle while giving both the BFF and worker one shared sync point.
- **kind:'new' path unchanged** — device bounds stayed 2..10; renew ignores a client device count and uses the joined key's limit.

## Deviations from Plan

None — the plan executed as written. The one *mandated* change (the `upgradeKey` `{addDevices}` fix) was already flagged as contract finding #5 and required by the objective, so it is the plan's intent, not a deviation.

## Issues Encountered

- **Transient `ReferenceError: quote is not defined`** surfaced during Task 1 development: the currency variable introduced in `createOrder` left a stale `quote.currency` reference in the Platega call. Fixed to use the `currency` variable (`a6fffe0`) before the GREEN commit; no test was committed against the broken state.
- **Worker conflict mapping keeps the `platega` import unused-warning-free** — the `isTrialConflict` helper is the only change to error handling; the existing retryable/terminal taxonomy is preserved.

## TDD Gate Compliance

- **Plan-level type:** `execute` (tasks carry `tdd="true"`), so RED→GREEN per task:
  - Task 1: `test(...)` `7f67983` → `feat(...)` `a6fffe0` ✅
  - Task 2: `test(...)` `9798aba` → `feat(...)` `0e06b10` ✅
  - Task 3: `test(...)` `b28d9e5` (parity assertion; no production code needed — the shared code already exists from Tasks 1-2) ✅
- Each RED run was confirmed failing before its GREEN implementation.

## Known Stubs

None. Renew/upgrade fulfillment is now implemented for the kinds the BFF can create. The `notify-provisioned` / `notify-failed` *consumers* (bot key-push) remain intentionally deferred to plan 03-07 (producers exist here), documented not as a stub.

## Threat Flags

No new threat surface beyond the plan's `<threat_model>`:
- **T-03-trial-bypass** mitigated — `precheckOwnedKey` rejects trials at the BFF and the worker maps a provider `conflict` to the same clean trial-family code (tested).
- **T-03-idor-key** mitigated — ownership join precedes every quote/Platega call; non-owned ≡ 404 (tested).
- **T-03-upgrade-amount** mitigated — the upgrade amount is server-derived; the callback/reconcile amount equality (D-35) is unchanged.
- **T-03-double-device** mitigated — deterministic `order:<id>:upgrade` key (tested).
- **T-03-device-ceiling** mitigated — zod bounds + server-side `currentLimit + addDevices > 10` check (tested).
- **T-03-SC** honored — no new packages installed.

## Next Phase Readiness

- `POST /api/orders` produces valid `renew`/`upgrade` orders; the worker fulfills all three kinds through the one pipeline.
- Plan 03-05/03-06 can surface renew/upgrade orders in history/UI; the UI must keep renew/upgrade absent from trial keys (D-44) as defense in depth.
- Plan 03-07 adds the `notify-provisioned`/`notify-failed` consumers to the worker.
- `upgradeKey` now matches the observed ARTEMIDA contract; no remaining pre-probe shape mismatch for create/renew/upgrade.

---

*Phase: 03-payments*
*Completed: 2026-10-03*

## Self-Check: PASSED

- FOUND: commit `7f67983` (Task 1 RED — order-route vectors)
- FOUND: commit `a6fffe0` (Task 1 GREEN — kind-aware order creation + pre-checks)
- FOUND: commit `9798aba` (Task 2 RED — worker fulfillment vectors)
- FOUND: commit `0e06b10` (Task 2 GREEN — worker branches + upgradeKey {addDevices})
- FOUND: commit `b28d9e5` (Task 3 — trial-family parity)
- FOUND: app/api/orders/route.ts, lib/orders-service.ts, lib/worker.ts, lib/artemida.ts
- FOUND: tests/unit/order-route.test.ts (created), tests/unit/order-service.test.ts, tests/unit/artemida-client.test.ts
- VERIFY: `export DATABASE_URL=postgresql://alekseimikhalkin@127.0.0.1:5432/setwhite && npx vitest run tests/unit` → 18 files / 142 tests green
- VERIFY: `npx tsc --noEmit` clean
- VERIFY (manual): `grep -v '^#' app/api/orders/route.ts | grep -c 'isTrial\|trial'` = 4 (>= 1)
- VERIFY (contract): `upgradeKey` posts `{addDevices}` — asserted in tests/unit/artemida-client.test.ts
- SECURITY: no provider error text stored/logged; no secret committed; no new packages
- NOTE: STATE.md / ROADMAP.md intentionally NOT written by the executor (orchestrator owns those)
