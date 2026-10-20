---
phase: 03-payments
plan: "01"
subsystem: api
tags: [artemida, probe, contract-lock, owner-gated, paid-endpoints, create-key, upgrade-quote, idempotency, completed]

# Dependency graph
requires:
  - phase: 02-keys-trial
    provides: scripts/artemida-probe.mjs guarded-flag pattern + docs/artemida-v1-contract.{md,json}
provides:
  - "docs/artemida-v1-contract.{md,json} — OBSERVED POST /keys (paid create) and POST /keys/{id}/upgrade (request/error) shapes"
  - "lib/artemida.ts — createKey(input, {idempotencyKey}) + optional caller idempotencyKey on renewKey/upgradeKey"
  - "lib/artemida.ts — deriveUpgradeQuote()/getUpgradeQuote() prorated device delta"
  - "app/api/pricing — kind:new|renew|upgrade + addDevices upgrade quote mode"
affects: [03-03, 03-04, 03-07]

# Actuals (#2632) — chars/4 over the realized plan diff (77062 diff chars / 4 ≈ 19265).
# Estimate was 42000; recorded honestly, not rounded toward it.
actuals:
  tokens: 19265
  tasks: 3
  commits: 7

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Owner-gated paid probe: the irreversible balance-consuming call sits behind an explicit --confirm-* flag, never run by default"
    - "Observed-shape-first: contract docs record only live-returned field names; an unreached success body stays [UNOBSERVED], never guessed"
    - "Deterministic write idempotency: callers supply order:{id}:{kind}; ad-hoc calls fall back to a fresh randomUUID (D-18/Pitfall 2)"
    - "Local prorated delta derived from the observed apiPricing document when the provider exposes no upgrade-quote endpoint (D-28: exact observed basis, never fabricated)"

key-files:
  created:
    - docs/artemida-v1-contract-create-probe.json
    - docs/artemida-v1-contract-upgrade-probe.json
    - tests/unit/pricing-upgrade-quote.test.ts
  modified:
    - docs/artemida-v1-contract.md
    - docs/artemida-v1-contract.json
    - scripts/artemida-probe.mjs
    - lib/artemida.ts
    - app/api/pricing/route.ts
    - tests/unit/artemida-client.test.ts

key-decisions:
  - "Record only observed field names: the create 201 body is verbatim; the upgrade success body is marked [UNOBSERVED — request/error locked] (balance exhausted by the create), not fabricated"
  - "createKey POSTs the observed bare /keys body {customerRef, days, devices} (all required integers; a bare {customerRef} → 400 invalid_purchase_params)"
  - "The upgrade wire request is {addDevices} ONLY (observed 400 unsupported_fields for {days,devices}); upgradeKey's existing body was left unchanged per the plan must_have and 03-04's frozen call, and the mismatch is flagged in the contract for 03-04 rework"
  - "Upgrade quote is derived locally from the observed apiPricing deviceTiers/volume/upgradeRule (no provider quote endpoint); fixture +1 device on a 30-day key → 60 RUB"
  - "key:'new' pricing behavior kept byte-for-byte ({price} only, same error mapping)"
  - "No API key value appears in any committed artifact (the probe never prints the Authorization header)"

requirements-completed: [PAY-01, PAY-03]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "artemida-probe.mjs exposes guarded --confirm-create-key / --confirm-upgrade flags and enumerates them in --dry-run with no network and no key required"
    requirement: null
    verification:
      - kind: other
        ref: "node --check scripts/artemida-probe.mjs && node scripts/artemida-probe.mjs --dry-run | grep -c 'confirm-create-key'"
        status: pass
    human_judgment: false
  - id: D2
    description: "Live probe observed the paid-key create request/response and the upgrade request/error, and the contract docs mark them OBSERVED"
    requirement: PAY-01
    verification:
      - kind: other
        ref: "grep -c OBSERVED docs/artemida-v1-contract.md && JSON.parse(docs/artemida-v1-contract.json) createKey/upgrade sections"
        status: pass
    human_judgment: false
  - id: D3
    description: "createKey posts the observed body to /keys and writes accept a caller-supplied deterministic Idempotency-Key"
    requirement: PAY-01
    verification:
      - kind: test
        ref: "npx vitest run tests/unit/artemida-client.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "GET /api/pricing kind:'upgrade' returns the observed prorated fixture amount (+1 device/30d → 60 RUB); kind:'new' unchanged"
    requirement: PAY-03
    verification:
      - kind: test
        ref: "npx vitest run tests/unit/pricing-upgrade-quote.test.ts tests/unit/pricing-route.test.ts"
        status: pass
    human_judgment: false

# Metrics
duration: ~15min (continuation) + ~4min (prior automation session)
completed: 2026-10-03
status: complete
---

# Phase 03 Plan 01: ARTEMIDA Create + Upgrade Contract Lock Summary

**The owner-gated live probe ran (paid create + upgrade attempts), the OBSERVED create/upgrade shapes replace the UNKNOWN/[ASSUMED] contract entries, and `lib/artemida.ts` now ships `createKey` with caller-supplied idempotency plus a locally derived prorated upgrade quote wired into `/api/pricing`.**

## Performance

- **Duration:** ~15 min active this continuation (+ ~4 min in the prior automation session)
- **Completed:** 2026-10-03
- **Tasks:** 3 of 3
- **Files:** 3 created, 6 modified

## Accomplishments

- **Task 1 — contract locked.** The owner-funded live probe produced
  `docs/artemida-v1-contract-create-probe.json` (a `201` paid create: `{customerRef,days:30,devices:2}`
  → `charged:120`, `key.id key_9f603bde96971407`, `subscriptionUrl` observed) and
  `docs/artemida-v1-contract-upgrade-probe.json`. `docs/artemida-v1-contract.md`/`.json` now record the
  create shape verbatim, the upgrade `{addDevices}` request + `400 unsupported_fields` for `{days,devices}`,
  the `402 insufficient_balance` prorated charge ("Нужно 60 ₽" for +1 device on a 30-day key), and mark the
  upgrade success body `[UNOBSERVED — request/error locked]`. The three formerly-UNKNOWN key-scoped GETs
  (`/keys/{id}`, `/subscription-links`, `/devices`) were also observed in the same session and documented.
- **Task 2 — client write surface.** `RequestOptions` gained `idempotencyKey` and writes now send
  `opts.idempotencyKey ?? randomUUID()`; `createKey(input, opts?)` POSTs the observed `POST /keys` body and
  normalizes via `normalizeKeyResponse`; `renewKey`/`upgradeKey` accept an optional `ArtemidaWriteOptions`.
  `normalizeKey` now reads the observed `trial` boolean (alongside `isTrial`/`is_trial`).
- **Task 3 — upgrade quote.** `deriveUpgradeQuote()` / `getUpgradeQuote()` mirror the observed
  `apiPricing.deviceTiers`/`volume`/`upgradeRule`; `/api/pricing` accepts `kind` (default `new`) + `addDevices`,
  returns the derived `{price}` for upgrades, and keeps the `new`/`renew` path byte-for-byte.

## Task Commits

1. **Task 1 (automation, prior session): guarded probe flags** — `8f43ee3` (feat)
2. **Task 1 (live capture + contract): OBSERVED create/upgrade** — `b490b34` (docs)
3. **Task 2 (RED): failing createKey/idempotency tests** — `a36d948` (test)
4. **Task 2 (GREEN): createKey + caller idempotencyKey** — `42821fc` (feat)
5. **Task 3: prorated upgrade quote (lib + /api/pricing)** — `76ded6e` (feat)
6. **Summary: complete 03-01** — (this commit) (docs)

## Files Created/Modified

- `docs/artemida-v1-contract.md`, `docs/artemida-v1-contract.json` — OBSERVED create + upgrade sections/entries.
- `docs/artemida-v1-contract-create-probe.json`, `docs/artemida-v1-contract-upgrade-probe.json` — raw owner-gated probe evidence (no key material).
- `scripts/artemida-probe.mjs` — upgrade dry-run manifest + wire body now `{addDevices}`.
- `lib/artemida.ts` — `createKey`, `ArtemidaWriteOptions`, `deriveUpgradeQuote`/`getUpgradeQuote`, `trial` normalizer.
- `app/api/pricing/route.ts` — `kind`/`addDevices` upgrade-quote mode.
- `tests/unit/artemida-client.test.ts`, `tests/unit/pricing-upgrade-quote.test.ts` — 12 new vectors.

## Decisions Made

- **No fabrication.** The upgrade success body was unreachable (balance exhausted by the create); it is recorded as `[UNOBSERVED]` with the request/error locked, rather than invented.
- **Keep `upgradeKey`'s existing `{days,devices}` body in 03-01.** The plan's must_have requires "without changing existing call behavior", and 03-04's frozen test expects `{days,devices}`. The observed provider rejection is instead flagged as contract finding #5 so 03-04 is revised to `{addDevices}` before wiring.
- **Derive the quote locally from observed provider data**, not from a scraped 402 message (D-19 discards provider text). The result matches the recorded fixture exactly.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] `normalizeKey` did not read the observed `trial` boolean**
- **Found during:** Task 2
- **Issue:** The observed create/upgrade key uses field `trial` (not `isTrial`/`is_trial`); `isTrial` would be mis-detected for any `trial:true` key, which controls whether renew/upgrade is allowed.
- **Fix:** `isTrial: asBool(d.isTrial) || asBool(d.is_trial) || asBool(d.trial)`.
- **Files modified:** `lib/artemida.ts`
- **Commit:** `42821fc`

**2. [Rule 2 - Missing critical functionality] Local upgrade-quote helper added to `lib/artemida.ts`**
- **Found during:** Task 3
- **Issue:** The plan framed the quote as route-only, but the objective requires `lib/artemida.ts` to carry the upgrade method/quote and the provider exposes no quote endpoint.
- **Fix:** `deriveUpgradeQuote()` + `getUpgradeQuote()` in the client; the route delegates to it.
- **Files modified:** `lib/artemida.ts`, `app/api/pricing/route.ts`
- **Commit:** `76ded6e`

No other deviations — the plan executed as written once the live-probe input existed.

## Issues Encountered

- **Upgrade success body unobservable.** The account balance was 0 after the paid create, so `{addDevices}` returned `402 insufficient_balance`. Recorded as the authoritative request/error shape with the success body explicitly `[UNOBSERVED]`.
- **Known follow-up (not a stub):** `lib/artemida.ts::upgradeKey` still posts `{days,devices}`, which the probe shows the provider rejects (`400 unsupported_fields`). It has no shipped caller in 03-01; plan 03-04 MUST switch it to `{addDevices}` (documented as contract finding #5). Not fixed here to preserve source compatibility with 03-04's frozen call and this plan's `without changing existing call behavior` must_have.

## Authentication Gates

None — the owner-gated probe ran out-of-band and its artifacts were supplied; no auth gate was hit during this continuation.

## User Setup Required

None remaining. (The prior session's requirement — fund the ARTEMIDA account and approve the paid probe — was satisfied by the owner; the resulting probe artifacts are now committed.)

## Next Phase Readiness

- PAY-01 `kind:'new'` can build against the OBSERVED `POST /keys` shape; `createKey` is ready with deterministic idempotency (`order:{id}:new`).
- PAY-03 has a quote source (local formula + observed fixture) via `/api/pricing?kind=upgrade&addDevices=…`.
- 03-03/03-04/03-07 can cite `docs/artemida-v1-contract.md` observed shapes. Plan 03-04 must adopt the observed `{addDevices}` upgrade body.
- `.planning/WINDOWS.md` item 9 (03-01 Task 1 `unrun-verify`) is now resolved by this plan's run; the ledger entry was left untouched per the task instruction not to write planning state (verifier may close it).

---

*Phase: 03-payments*
*Completed: 2026-10-03*

## Self-Check: PASSED

- FOUND: commit b490b34 (Task 1 — OBSERVED create/upgrade contract + probe evidence)
- FOUND: commit a36d948 (Task 2 RED — failing tests)
- FOUND: commit 42821fc (Task 2 GREEN — createKey + idempotencyKey)
- FOUND: commit 76ded6e (Task 3 — upgrade quote)
- FOUND: docs/artemida-v1-contract.md marks create/upgrade OBSERVED; canonical JSON parses
- VERIFY: `npx tsc --noEmit` clean; `npx vitest run tests/unit` 14 files / 112 tests green (local `setwhite` Postgres)
- SECURITY: no Authorization/Bearer/API-key literal in any committed artifact
- BLOCKED: none (upgrade success body remains `[UNOBSERVED]` by provider balance limits, documented)
