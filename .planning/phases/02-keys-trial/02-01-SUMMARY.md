---
phase: 02-keys-trial
plan: "01"
subsystem: api
tags: [artemida, probe, contract-lock, diagnostic, bearer-auth]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: Node 24 runtime + standalone `.mjs` script convention (scripts/check-manifest.mjs)
provides:
  - scripts/artemida-probe.mjs — dry-runnable ARTEMIDA V1 live probe (read-only + guarded trial)
  - docs/artemida-v1-contract.json — committed live `--json` probe output (observed shapes)
  - docs/artemida-v1-contract.md — locked observed field-name contract + transport section
affects: [02-02, 02-03, 02-04, 02-05, 02-06]

# Actuals (#2632) — chars/4 over the realized diff (probe 10652 + json 9040 + md 6189 = 25881 chars).
actuals:
  tokens: 6470
  tasks: 3
  commits: 4

# Tech tracking
tech-stack:
  added: []                # no dependencies installed; global fetch + crypto.randomUUID only
  patterns:
    - "Standalone dependency-free Node ESM diagnostic script (no lib/ imports)"
    - "Dry-run-before-secret: the probe enumerates its manifest with zero network before a key exists"
    - "Guarded destructive call: POST /trial only behind --confirm-trial <customerRef> + fresh Idempotency-Key"
    - "Contract-lock artifact: live `--json` output committed verbatim beside a hand-written field-name doc"

key-files:
  created:
    - scripts/artemida-probe.mjs
    - docs/artemida-v1-contract.json
    - docs/artemida-v1-contract.md
  modified:
    - .planning/phases/02-keys-trial/02-01-SUMMARY.md   # halted -> complete

key-decisions:
  - "devices=1 is rejected by ARTEMIDA (400 invalid_pricing_params; data.minDevices=2) — the pricing BFF and tariff picker MUST clamp the device minimum to 2 (A7 resolved; requirements-vs-provider clamp surfaced to owner)"
  - "POST /trial deliberately not run — the one-time offer was not consumed; trial request/response shape stays UNKNOWN (trial not run)"
  - "Key-scoped endpoints recorded as UNKNOWN (no key available) rather than omitted because the probe account held 0 keys"
  - "Probe routes diagnostics to stderr in --json mode so stdout stays pure for redirection into docs/artemida-v1-contract.json"
  - "Provider's data.periods includes 60 days; API input stays restricted to the locked [7,30,90] set (D-26) unless the owner expands the offering"

patterns-established:
  - "Contract-lock probe: one command turns [ASSUMED] provider shapes into a recorded contract"

requirements-completed: []   # gate plan — delivers no requirement behavior itself

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "ARTEMIDA V1 live probe script parses and its --dry-run enumerates every planned request without network or a key"
    requirement: null
    verification:
      - kind: other
        ref: "node --check scripts/artemida-probe.mjs && node scripts/artemida-probe.mjs --dry-run"
        status: pass
    human_judgment: false
  - id: D2
    description: "Live probe records the locked V1 success-body contract into docs/artemida-v1-contract.{md,json}"
    requirement: null
    verification:
      - kind: other
        ref: "node --env-file=.env.local scripts/artemida-probe.mjs --json > docs/artemida-v1-contract.json && test -s ... && grep -Eq 'GET +/pricing' ... && ! grep -q 'UNKNOWN (call failed)' ... && ! grep -Fq \"$ARTEMIDA_API_KEY\" ..."
        status: pass
    human_judgment: true
    rationale: "Automated capture + secret-hygiene verify passed. Human confirmation of the recorded shapes is the plan's final checkpoint item; the orchestrator resumed past the human-action gate and instructed finalization, so the checklist is preserved in the body below."

# Metrics
duration: 2min (active; halted 2026-09-30 -> resumed 2026-10-02)
completed: 2026-10-02
status: complete
---

# Phase 02 Plan 01: ARTEMIDA V1 Contract Lock Summary

**Live authenticated probe locked the ARTEMIDA Paid API V1 pricing/keys/balance contract; key-scoped Config/Devices and the one-time `/trial` shape remain deliberately unobserved (0-key account, trial not consumed) and are recorded as explicit `UNKNOWN` markers, not guesses.**

## Performance

- **Duration:** ~2 min active (Task 1 on 2026-09-30; resumed and finalized 2026-10-02)
- **Started:** 2026-09-30T22:36:15Z
- **Halted:** 2026-09-30T22:37:18Z (ARTEMIDA_API_KEY human-action gate)
- **Resumed/completed:** 2026-10-02T00:47Z
- **Tasks:** 3 of 3 complete (Task 2 cleared out-of-band by the owner; no commit)
- **Files created:** 3

## Accomplishments
- `scripts/artemida-probe.mjs` — dependency-free live probe: read-only pricing/keys/balance/sub-links/devices sweep, key-scoped chaining, guarded one-time trial, `--dry-run` and `--json` modes; never prints the key or `Authorization` header.
- `docs/artemida-v1-contract.json` — verbatim live `--json` probe output committed as the machine-readable contract source.
- `docs/artemida-v1-contract.md` — observed field-name table + transport section (base URL, Bearer auth, `X-Request-Id` echo, `X-RateLimit-Policy: adaptive-account-and-ip`, object **and** string error envelopes).
- Live capture (authenticated, read-only):
  - `GET /pricing?days=7&devices=2` → 200, `data.quote.amount=49` RUB
  - `GET /pricing?days=30&devices=2` → 200, `data.quote.amount=120` RUB
  - `GET /pricing?days=90&devices=2` → 200, `data.quote.amount=300` RUB
  - `GET /pricing?days=7&devices=1` → 400 `invalid_pricing_params` (**A7: provider min device count is 2**)
  - `GET /keys` → 200 `{ok:true, data:{items:[], count:0, query:""}}`
  - `GET /balance` → 200 `{ok:true, data:{balance:0, currency:"RUB", unlimited:false}}`
- Secret hygiene verified: the plan's Task 3 verify passed end-to-end, including `! grep -Fq "$ARTEMIDA_API_KEY"` over both artifacts (T-02-01 mitigated).

## Task Commits

Each task was committed atomically:

1. **Task 1: Write the ARTEMIDA V1 live probe (dry-run first)** - `0866f43` (feat)
2. **Task 2: Owner supplies ARTEMIDA_API_KEY** - no commit (human-action gate; owner wrote `.env.local`, gitignored)
3. **Task 3: Run the live probe and record the locked V1 contract** - `c273a4f` (docs)
4. **Halted summary (intermediate)** - `89330b9` (docs)

**Plan metadata:** committed with this SUMMARY (docs).

## Files Created/Modified
- `scripts/artemida-probe.mjs` — Dependency-free ARTEMIDA V1 diagnostic probe (dry-run manifest, read-only sweep, key-scoped chaining, guarded trial, `--json` capture).
- `docs/artemida-v1-contract.json` — Live `--json` probe output (observed pricing/keys/balance bodies + explicit `unavailable` markers for key-scoped endpoints).
- `docs/artemida-v1-contract.md` — Locked field-name/transport contract with UNKNOWN policy and downstream findings.
- `.planning/phases/02-keys-trial/02-01-SUMMARY.md` — rewrote halted summary as complete.

## Decisions Made
- **`devices=1` clamp (finding + decision needed):** the provider rejects `devices=1` with `400 invalid_pricing_params` and returns `data.minDevices=2`. Requirement TRIAL-02 locks a 1–10 device selector, so plan 02-02's `/api/pricing` and the tariff picker must clamp the **minimum to 2** (server guard + UI stepper floor). Surfaced to the owner as the plan's A7 clamp decision.
- **Trial not consumed:** `POST /trial` was not called (one-time offer preserved); the trial response shape is `UNKNOWN (trial not run)`. The `/pricing` response does expose the trial offer metadata `data.trial = {days:1, devices:2, amount:2, currency:"RUB"}`.
- **Key-scoped contract still open:** the probe account had 0 keys, so `GET /keys/{id}`, `/subscription-links`, `/devices` are `UNKNOWN (no key available)`. Plan 02-02 must keep those schemas tolerant until a key exists to re-probe.
- **60-day period exists provider-side** but API input stays restricted to `[7,30,90]` (D-26) unless the owner expands the offering.

## Deviations from Plan

None — the plan executed exactly as written. The plan explicitly anticipated the `devices=1` rejection (A7) and the empty-account path (`UNKNOWN (no key available)`), and the Task 3 verify passed unmodified.

## Issues Encountered

- **Task 2 was a `blocking-human` gate** resolved out-of-band: the owner placed `ARTEMIDA_API_KEY` in `.env.local` (58-char key, gitignored via `.env*`). The executor never printed or persisted the value.
- **Task 3 is a `checkpoint:human-verify`** gate. The orchestrator resumed execution past the human-action gate and instructed finalization, so the automated capture + hygiene verification was run and the artifacts committed. The human confirmation checklist (below) is preserved for the owner.

## User Setup Required

None outstanding. The key is already in `.env.local`. Human confirmation remaining for the owner:

1. `docs/artemida-v1-contract.md` records observed field names (no guessed rows) for pricing, keys and balance.
2. No endpoint shows `UNKNOWN (call failed)`; `UNKNOWN (no key available)` / `UNKNOWN (trial not run)` appear only where the run genuinely could not reach a shape.
3. The recorded `/pricing` amounts (49 / 120 / 300 RUB) match the ARTEMIDA account.
4. Neither artifact contains the API key.

## Known Gaps

- **CAB-03/CAB-04 response shapes not observed** — `GET /keys/{id}`, `/subscription-links`, `/devices` returned no data because the probe account had 0 keys. Recorded as `UNKNOWN (no key available)` in the contract doc and appended to `.planning/WINDOWS.md` as an open `unmet-truth` for plan 02-02 to keep schemas tolerant until re-probed.
- **`POST /trial` shape not observed** — intentionally not run; marked `UNKNOWN (trial not run)`.

## Next Phase Readiness
- `docs/artemida-v1-contract.{md,json}` are committed and become the schema source of truth for `lib/artemida.ts` (plan 02-02).
- **Action for 02-02:** clamp pricing/picker device minimum to 2 (A7); keep key-detail/sub-links/devices schemas tolerant because their shapes remain unobserved.
- No new security surface introduced beyond the read-only probe; T-02-01 verified green (no key/Authorization value in any artifact).

---

*Phase: 02-keys-trial*
*Completed: 2026-10-02*

## Self-Check: PASSED

- FOUND: scripts/artemida-probe.mjs
- FOUND: docs/artemida-v1-contract.json
- FOUND: docs/artemida-v1-contract.md
- FOUND: .planning/phases/02-keys-trial/02-01-SUMMARY.md
- FOUND: commit 0866f43 (Task 1 probe)
- FOUND: commit 89330b9 (halted summary)
- FOUND: commit c273a4f (Task 3 contract artifacts)
- FOUND: commit 6b9e9e7 (finalized SUMMARY + WINDOWS ledger)
- DRY-RUN: `node scripts/artemida-probe.mjs --dry-run` exits 0
- SECRET: no `ARTEMIDA_API_KEY` value in probe, json, md, or SUMMARY
- VERIFY: plan Task 3 automated verify exits 0
