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
  - Dry-run manifest of every planned V1 request (pricing x4, /keys, /balance + key-scoped chains)
affects: [02-02, 02-03, 02-04, 02-05, 02-06]

# Actuals (#2632) — chars/4 over the realized diff (scripts/artemida-probe.mjs, 10652 chars).
actuals:
  tokens: 2663
  tasks: 1
  commits: 1

# Tech tracking
tech-stack:
  added: []                # no dependencies installed; global fetch + crypto.randomUUID only
  patterns:
    - "Standalone dependency-free Node ESM diagnostic script (no lib/ imports)"
    - "Dry-run-before-secret: the probe enumerates its manifest with zero network before a key exists"
    - "Guarded destructive call: POST /trial only behind --confirm-trial <customerRef> + fresh Idempotency-Key"

key-files:
  created:
    - scripts/artemida-probe.mjs
  modified: []

key-decisions:
  - "Probe prints diagnostics to stderr in --json mode so stdout stays pure for redirection into docs/artemida-v1-contract.json"
  - "Key-scoped endpoints are recorded as UNKNOWN (no key available) rather than omitted when /keys returns no key"
  - "No lib/ import: the probe must run before lib/env.ts gains ARTEMIDA_API_KEY (D-20)"

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
    verification: []
    human_judgment: true
    rationale: "Blocked: requires owner-supplied ARTEMIDA_API_KEY in .env.local (absent) and a live authenticated run; cannot be automated without the secret"

# Metrics
duration: 1min
completed: 2026-09-30
status: halted   # deliberate stop at the blocking-human human-action gate (ARTEMIDA_API_KEY absent)
---

# Phase 02 Plan 01: ARTEMIDA V1 Contract Lock Summary

**Dependency-free ARTEMIDA V1 probe written and dry-run verified; live contract capture is blocked at the `ARTEMIDA_API_KEY` human-action gate.**

## Performance

- **Duration:** ~1 min (Task 1 only)
- **Started:** 2026-09-30T22:36:15Z
- **Halted:** 2026-09-30T22:37:18Z
- **Tasks:** 1 of 3 complete (Tasks 2–3 blocked)
- **Files modified:** 1 created

## Accomplishments
- `scripts/artemida-probe.mjs` created: reads `ARTEMIDA_API_KEY`/`ARTEMIDA_BASE_URL` from `process.env`, sends `Authorization: Bearer`, never prints the key or the Authorization header.
- `--dry-run` exits 0 and enumerates all six unconditional planned GETs (`/pricing?days={7,30,90}&devices=2`, `/pricing?days=7&devices=1`, `/keys`, `/balance`) plus the three key-scoped conditional calls — with no network and no key required.
- `--json` emits a machine-readable `{ pricing, keys, keyDetail?, subscriptionLinks?, devices?, balance, trial? }` summary to stdout while routing diagnostics to stderr, so redirection into `docs/artemida-v1-contract.json` stays valid JSON.
- `--confirm-trial <customerRef>` guards the one-time `POST /trial` behind an explicit flag and a fresh `crypto.randomUUID()` `Idempotency-Key` (T-02-02 mitigated).

## Task Commits

Each task was committed atomically:

1. **Task 1: Write the ARTEMIDA V1 live probe (dry-run first)** - `0866f43` (feat)
2. **Task 2: Owner supplies ARTEMIDA_API_KEY** - BLOCKED (human-action gate; no key present)
3. **Task 3: Run the live probe and record the locked V1 contract** - BLOCKED (precondition unmet)

**Plan metadata:** committed with this SUMMARY (docs)

## Files Created/Modified
- `scripts/artemida-probe.mjs` - Dependency-free ARTEMIDA V1 diagnostic probe: dry-run manifest, read-only endpoint sweep, key-scoped chaining, guarded trial, `--json` contract capture.

## Decisions Made
- Diagnostics go to stderr under `--json` so the redirected stdout is pure JSON (proven offline via a refusing loopback port: stdout parsed cleanly; `stderr` carried the human log).
- Tolerant first-key extraction (`data.items`/`data.keys`/`data`/`items`/`keys`; `id`/`uuid`/`shortUuid`) because the success shape is `[ASSUMED]` until the live run.
- Probe exits 0 on provider/network errors (diagnostic, not fail-fast); exits 2 only on usage errors.

## Deviations from Plan

None - plan executed exactly as written for Task 1.

## Issues Encountered

**BLOCKED — `ARTEMIDA_API_KEY` is absent.** No `.env.local` exists and the environment exposes no ARTEMIDA key (`node -e "process.loadEnvFile?.('.env.local'); ..."` raised `ENOENT: no such file or directory, open '.env.local'`). The plan itself marks this secret as unobtainable by the agent (developer docs are auth-gated). Per executor protocol, the probe and its dry-run proof were built and committed first; Tasks 2–3 are reported blocked rather than fabricated or silently skipped.

## User Setup Required

**External service requires manual configuration.** To unblock Tasks 2–3:

1. Open the ARTEMIDA developer account (https://artemida.cc/developer-api) and copy the Paid API V1 key.
2. Write `ARTEMIDA_API_KEY=<key>` into `.env.local` in the repo root (gitignored via `.env*`; never `.env.example`, never committed).
3. Confirm the Paid API tier trial offer (1 day / 2 devices) and that 7/30/90-day periods are supported for the account.
4. Verify: `node -e "process.loadEnvFile?.('.env.local'); console.log(Boolean(process.env.ARTEMIDA_API_KEY))"` prints `true`.
5. Resume with the resume-signal **"key set"**, then Task 3 runs:
   `node --env-file=.env.local scripts/artemida-probe.mjs --json > docs/artemida-v1-contract.json`
   and writes `docs/artemida-v1-contract.md` from the observed shapes (trial call only if the owner approves consuming the one-time offer).

## Next Phase Readiness
- Task 1 deliverable (`scripts/artemida-probe.mjs`) is committed and green in dry-run mode.
- `lib/artemida.ts` (plan 02-02) remains gated on the locked contract — do not implement response schemas against guessed field names.
- **Blocker:** `ARTEMIDA_API_KEY` missing → `docs/artemida-v1-contract.{md,json}` not produced; the plan is `halted`.

---

*Phase: 02-keys-trial*
*Halted: 2026-09-30 (blocking-human gate: ARTEMIDA_API_KEY)*

## Self-Check: PASSED

- FOUND: scripts/artemida-probe.mjs
- FOUND: .planning/phases/02-keys-trial/02-01-SUMMARY.md
- FOUND: commit 0866f43
- DRY-RUN: `node scripts/artemida-probe.mjs --dry-run` exits 0
