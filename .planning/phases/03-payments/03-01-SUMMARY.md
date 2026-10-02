---
phase: 03-payments
plan: "01"
subsystem: api
tags: [artemida, probe, contract-lock, owner-gated, blocking-human, paid-endpoints]

# Dependency graph
requires:
  - phase: 02-keys-trial
    provides: scripts/artemida-probe.mjs guarded-flag pattern + docs/artemida-v1-contract.{md,json}
provides:
  - scripts/artemida-probe.mjs — owner-gated --confirm-create-key / --confirm-upgrade flags (automation only; live run pending)
affects: [03-02, 03-03, 03-04]

# Actuals (#2632) — chars/4 over the realized diff (7768 added chars / 4 ≈ 1942).
actuals:
  tokens: 1942
  tasks: 0            # Task 1 not complete — halted at the blocking-human gate before the live paid run
  commits: 1

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Owner-gated paid probe: the irreversible balance-consuming call sits behind an explicit --confirm-* flag, never run by default"
    - "Candidate route x body sweep for an unobserved create endpoint (stop at first success envelope => at most one charge)"
    - "Shape-independent charge capture: GET /balance before/after a paid upgrade to derive the exact charged amount regardless of response schema"

key-files:
  created: []
  modified:
    - scripts/artemida-probe.mjs   # +176 lines: guarded create/upgrade flags, dry-run manifest, arg guards, charge-delta capture

key-decisions:
  - "Halt at the blocking-human gate rather than run the live paid probe: ARTEMIDA account balance is 0 RUB (verified read-only), so no paid create/upgrade can be exercised and no shape can be observed without owner funding"
  - "Do NOT edit docs/artemida-v1-contract.{md,json} or lib/artemida.ts — doing so would require guessing the create/upgrade shapes, which the plan's prohibitions forbid (never build against [ASSUMED])"
  - "Do NOT start Tasks 2 and 3 — both depend on the observed create path/body and the recorded upgrade charge that only the live probe can produce"

patterns-established:
  - "Blocked-gate probe: ship the safe automation (flag implementation + dry-run manifest) so the owner has runnable tooling, then stop at the irreversible step"

requirements-completed: []   # halted before any requirement-level behavior; PAY-01/PAY-03 still blocked on the probe

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
    description: "Live probe observes the paid-key create request/response and the prorated upgrade charge, and the contract docs mark them OBSERVED"
    requirement: PAY-01
    verification: []
    human_judgment: true
    rationale: "Requires the owner to fund the ARTEMIDA account (currently 0 RUB) and approve consuming real balance, then run the paid --confirm-* flags. Automation cannot establish the precondition."

# Metrics
duration: ~4min (active) — halted
completed: 2026-10-02
status: halted
---

# Phase 03 Plan 01: ARTEMIDA Create + Upgrade Contract Lock — HALTED at owner-gated probe

**Shipped the guarded `--confirm-create-key` / `--confirm-upgrade` probe automation; halted before the live paid run because the ARTEMIDA account balance is 0 RUB, so the paid-key create and prorated upgrade shapes remain UNKNOWN — Tasks 2 and 3 are blocked pending owner funding and approval.**

## Performance

- **Duration:** ~4 min active, then halted at the blocking-human gate
- **Started:** 2026-10-02T22:08:42Z
- **Halted:** 2026-10-02T22:11Z
- **Tasks:** 1 of 3 (Task 1 automation committed; live run pending owner; Tasks 2–3 blocked)
- **Files modified:** 1

## Accomplishments

- `scripts/artemida-probe.mjs` now exposes two owner-gated, never-default flags:
  - `--confirm-create-key <customerRef>` — route × body sweep over `POST /keys` and
    `POST /keys/create` with bodies `{customerRef}` then `{customerRef,days:30,devices:2}`;
    skips a route on 404 and stops the sweep at the first success envelope (at most one charge).
  - `--confirm-upgrade <keyId> <addDevices>` — tolerant `GET /keys/{keyId}` read of the current
    device count + plan days, `POST /keys/{keyId}/upgrade` with the prorated body, and
    `GET /balance` before/after to derive the exact charged amount shape-independently.
- Both flags are in the unexpected-argument guard (with required-value validation) and in the
  `--dry-run` manifest; the API key and Authorization header are still never printed.
- Read-only baseline re-verified live: `GET /pricing` 49/120/300 RUB, `GET /keys` empty,
  `GET /balance` `{balance:0,currency:"RUB",unlimited:false}` — the key is valid, the account is unfunded.

## Task Commits

1. **Task 1 (automation portion): guarded create/upgrade probe flags** - `8f43ee3` (feat)
   - Task 1 is NOT complete: the live paid run and the OBSERVED contract-doc update remain, gated on owner funding + approval.
2. **Tasks 2–3:** not started — blocked on the Task 1 observed shapes.

## Files Created/Modified

- `scripts/artemida-probe.mjs` — `--confirm-create-key` / `--confirm-upgrade` guarded flags, candidate create sweep, tolerant upgrade-charge capture, dry-run manifest + argument validation.

## Decisions Made

- **Halt, do not fabricate.** The plan's prohibitions are explicit: no `kind:'new'`/`kind:'upgrade'`
  implementation or contract entry may be authored before the live probe locks the shape. With
  balance 0 RUB a paid create/upgrade returns 402, so no observed shape is reachable — the correct
  action is the blocking-human checkpoint, not a guessed contract.
- **Ship the safe automation first.** The checkpoint's how-to-verify invokes `--confirm-create-key`,
  so the flags had to exist before presenting the checkpoint (a checkpoint must not rest on a broken
  verification environment).
- **No changes to `docs/artemida-v1-contract.{md,json}` or `lib/artemida.ts`.** Both await the
  observed output.

## Deviations from Plan

None — the plan is a `checkpoint:human-verify gate="blocking-human"` gate and execution stopped at
exactly that gate. No auto-fix rules were triggered.

## Issues Encountered

- **Precondition unmet — ARTEMIDA account is unfunded.** A read-only probe this session returned
  `data.balance = 0` (`unlimited:false`) and `GET /keys` empty. The plan's Task 1 precondition
  requires "enough balance … owner has approved consuming real balance", which cannot be satisfied
  from the executor side. Blocking-human checkpoint raised.

## User Setup Required

The owner must do the following before a continuation agent can finish this plan:

1. **Fund the ARTEMIDA API account** so a paid key create and a device upgrade can be charged
   (account balance is currently **0 RUB**). Location: ARTEMIDA account balance.
2. **Approve consuming real balance** for one paid create and one upgrade.
3. Run the guarded live probe (owner-approved; consumes real balance; the API key stays in `.env.local`):
   - `node --env-file=.env.local scripts/artemida-probe.mjs --confirm-create-key <customerRef> --json > docs/artemida-v1-contract.json`
   - `node --env-file=.env.local scripts/artemida-probe.mjs --confirm-upgrade <keyId> <addDevices> --json`
4. Confirm neither artifact contains the API key value, then resume `/gsd-execute-phase` so a
   continuation agent updates `docs/artemida-v1-contract.md` with the OBSERVED create/upgrade shapes
   and completes Tasks 2–3 (createKey + idempotencyKey; `/api/pricing` upgrade quote).

## Next Phase Readiness

- The guarded probe tooling is committed and dry-runnable; the live observation is the only missing input.
- **Blocked:** PAY-01 `kind:'new'` and PAY-03 upgrade-quote correctness cannot proceed until the
  create/upgrade shapes are OBSERVED. Recorded in `.planning/WINDOWS.md` as an open `unrun-verify`.
- No security surface introduced: the probe still never prints or persists the API key or Authorization header (T-03-01 preserved).

---

*Phase: 03-payments*
*Halted: 2026-10-02*

## Self-Check: PASSED

- FOUND: commit 8f43ee3 (Task 1 automation — guarded probe flags)
- FOUND: scripts/artemida-probe.mjs (dry-run exits 0; lists `confirm-create-key`)
- FOUND: .planning/phases/03-payments/03-01-SUMMARY.md
- VERIFY (automation): `node --check` and `--dry-run` pass; argument guards exit 2 on misuse
- BLOCKED: docs OBSERVED create/upgrade shapes + Tasks 2–3 (owner funding + live paid probe)
