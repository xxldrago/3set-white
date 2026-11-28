---
phase: 21-subscription-purchase-7-days
plan: 02
subsystem: api
tags: [server-predicate, grace, jwt, artemida, vitest, prisma, mobile-bff, ownership]
requires:
  - phase: 21-subscription-purchase-7-days
    provides: Plan 01 payment routes and WebView flow; D-10 cross-phase gate change already human-approved at the 21-01 blocking decision gate
  - phase: 19-server-pools-auto-ping-7-days
    provides: isActiveKey gate in /servers and RenderedKey status derivation reused by one shared predicate
  - phase: 20-vpn-core-connect-fsm-10-days
    provides: /config import of isActiveKey plus the {ok:false,error} no-5xx envelope pattern
provides:
  - Pure server-side 24h grace/status predicate consumed by /subscription, /servers and /config
  - Real ownership-joined GET /api/mobile/subscription with one per-key getSubscriptionForUserId call
  - 48 passing Wave 0 unit tests including exact expiresAt+24h ±1ms boundary proof
affects:
  - 21-03 (pricing/promo), 21-04 (live providers), 21-05 (Shop Screen) consume the subscription envelope
  - Phase 22 takes over live device add/remove/limit enforcement
actuals:
  tokens: 7280
  tasks: 2
  commits: 5
tech-stack:
  added: []
  patterns:
    - One pure server-side entitlement predicate; routes delegate instead of re-deriving statusKind
    - 24h grace = 86_400_000ms (1 day), never 24 * DAY_MS
    - Per-key ownership join: listKeysByUserId → shared predicate → getSubscriptionForUserId(userId, active.id) once
    - Provider failures degrade to a stable 200 {ok:false,error} code; only stable codes are logged
key-files:
  created:
    - lib/subscription-view.ts
    - tests/unit/subscription-grace.test.ts
    - tests/unit/mobile-subscription-route.test.ts
  modified:
    - app/api/mobile/subscription/route.ts
    - app/api/mobile/servers/route.ts
    - tests/unit/mobile-servers-route.test.ts
    - tests/unit/mobile-config-route.test.ts
key-decisions:
  - D-10 implemented as one pure helper; /servers isActiveKey delegates to it and /config already imports isActiveKey, so no inline duplicate status check exists in either route.
  - Grace is exactly 24 hours (86_400_000ms) after an expired, non-trial key; trial keys get graceUntil null and raw revoked/disabled/trial-expired/expired keys stay disqualified.
  - The subscription route keeps the user identity block so Flutter session restore (which reads user.id on a 200) is not broken; no_active_key therefore returns 200 with a machine code, not 403.
  - deviceLimit/devices are surfaced from RenderedKey for display only; add/remove enforcement stays Phase 22.
  - No client-callable /keys/issue or /keys/renew route was added; the webhook → outbox → worker remains the sole issuer.
patterns-established:
  - Shared predicate pattern for cross-phase entitlement: change the helper, not each route gate.
  - Independent constant assertion in the test to catch a day-vs-hour unit error in a grace window.
requirements-completed: [REQ-SUB-01, REQ-SUB-02, REQ-SUB-04, REQ-SUB-06, REQ-BE-03]
coverage:
  - id: D1
    description: Pure shared 24h grace/status predicate with exact ±1ms boundary fixtures and trial exclusion
    requirement: REQ-SUB-06
    verification:
      - kind: unit
        ref: tests/unit/subscription-grace.test.ts#24h grace boundary (D-10 / T-21-12)
        status: pass
    human_judgment: false
  - id: D2
    description: /servers and /config both allow a graced expired key and deny a post-grace key through the same predicate
    requirement: REQ-SUB-02
    verification:
      - kind: unit
        ref: tests/unit/mobile-servers-route.test.ts#shared grace gate (D-10)
        status: pass
      - kind: unit
        ref: tests/unit/mobile-config-route.test.ts#shared grace gate (D-10)
        status: pass
    human_judgment: false
  - id: D3
    description: Real ownership-joined /subscription envelope with one per-key provider read and identity preserved
    requirement: REQ-SUB-01
    verification:
      - kind: unit
        ref: tests/unit/mobile-subscription-route.test.ts#real owned-key subscription (D-12 / REQ-SUB-01/02/06)
        status: pass
    human_judgment: false
  - id: D4
    description: deviceLimit and devices surfaced for display only with no device mutation route
    requirement: REQ-SUB-04
    verification:
      - kind: unit
        ref: tests/unit/mobile-subscription-route.test.ts#returns expiresAt, remainingDays, deviceLimit, link, devices, isTrial, statusKind and graceUntil
        status: pass
    human_judgment: false
  - id: D5
    description: Stable no_active_key / 200 provider-error degradation with no link, key status or provider text in body or logs
    requirement: REQ-BE-03
    verification:
      - kind: unit
        ref: tests/unit/mobile-subscription-route.test.ts#no active key / provider degradation (D-11 / D-22)
        status: pass
    human_judgment: false
  - id: D6
    description: Grace connection on a device with an expired key and the expires-soon banner
    requirement: REQ-SUB-06
    verification: []
    human_judgment: true
    rationale: Needs a real expired key and a live tunnel on-device; recorded as manual-only in 21-VALIDATION.md.
duration: 6 min
completed: 2026-11-28
status: complete
---

# Phase 21 Plan 02: Subscription status and shared grace gate Summary

**One pure server-side 24h grace predicate now drives /subscription, /servers and /config, and the subscription stub is a real ownership-joined single-key read**

## Performance

- **Duration:** 6 min (2026-11-28T03:11:31Z → 03:17:34Z)
- **Started:** 2026-11-28T03:11:31Z
- **Completed:** 2026-11-28T03:17:34Z
- **Tasks:** 2 of 2 (both `tdd="true"`: RED + GREEN commits each)
- **Files modified:** 7

## Accomplishments

- Added `lib/subscription-view.ts`: a pure `deriveSubscriptionStatus` + `isKeyConnectable` pair with no I/O or logging. An expired, non-trial key receives `graceUntil = expiresAt + 24h` and stays connectable until that instant; trial keys and raw `expired`/`revoked`/`disabled`/`trial-expired` keys never do.
- Delegated `/api/mobile/servers` `isActiveKey` to the shared predicate. `/api/mobile/config` already imports `isActiveKey`, so both phase-19/20 gates now agree with `/subscription` without a second inline status check.
- Replaced the `/api/mobile/subscription` `keys: []` stub with a JWT-gated read: user identity preserved for Flutter session restore, one active owned key selected by the shared predicate, and exactly one `getSubscriptionForUserId(userId, active.id)` call.
- Response carries `expiresAt`, `remainingDays`, `deviceLimit`, `link`, `devices`, `isTrial`, `statusKind` and `graceUntil`; no client-side grace math and no device mutation endpoint.
- 48 unit tests pass; `npx prisma validate` and `npx tsc --noEmit` are clean (0 errors overall).

## Task Commits

1. **Task 1 (RED): failing grace boundary + gate agreement tests** - `e648e36` (test)
2. **Task 1 (GREEN): shared predicate + delegated /servers gate** - `92e2428` (feat)
3. **Task 2 (RED): failing subscription route contract tests** - `b4511c3` (test)
4. **Task 2 (GREEN): real owned-key subscription route** - `aaf570d` (feat)
5. **Plan metadata** - pending final docs commit

## Files Created/Modified

- `lib/subscription-view.ts` - pure shared status/grace derivation and connect predicate; 24h = 86_400_000ms
- `app/api/mobile/servers/route.ts` - `isActiveKey` delegates to the shared predicate; local status logic removed
- `app/api/mobile/subscription/route.ts` - real owned-key read with stable `{ok,error}` envelope and no provider text in logs
- `tests/unit/subscription-grace.test.ts` - ±1ms boundary fixtures, trial exclusion, raw-status exclusions, constant pin
- `tests/unit/mobile-servers-route.test.ts` - grace allow/deny and trial-no-grace gate vectors
- `tests/unit/mobile-config-route.test.ts` - matching grace allow/deny vectors for the second gate
- `tests/unit/mobile-subscription-route.test.ts` - full subscription contract, ownership, degradation and secrecy vectors

## Decisions Made

- The D-10 cross-phase gate change was NOT re-gated: it was explicitly human-approved as `proceed-locked` in Plan 01 (2026-11-27) and recorded in STATE.md.
- `/config` was listed in the plan's `files_modified` but needed no edit: it imports `isActiveKey` from `/servers`, so delegating that one function covers both gates.
- `no_active_key` returns HTTP 200 with a machine code (plus the identity block) rather than 403, so a freshly registered user without a key is not logged out by Flutter session restore.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 24h grace constant was 24 days**
- **Found during:** Task 1 GREEN (first test run after adding the helper)
- **Issue:** The research snippet used `24 * 86_400_000`; since `86_400_000ms` is already one day, that produced a 24-DAY window and made a 3-day-expired key connectable.
- **Fix:** Set `GRACE_MS = 86_400_000` (24h) and added an independent `expect(GRACE_MS).toBe(24 * 60 * 60 * 1000)` assertion so a unit regression cannot slip through the ±1ms fixtures (which derive their boundary from the constant).
- **Files modified:** `lib/subscription-view.ts`, `tests/unit/subscription-grace.test.ts`, both gate route tests
- **Verification:** Grace boundary tests pass at exactly `expiresAt + 24h ± 1ms`; expired 3-day fixtures stay denied.
- **Committed in:** `92e2428`

**2. [Rule 1 - Bug] Legacy gate fixtures no longer represented their intended states**
- **Found during:** Task 1 GREEN
- **Issue:** The old fixtures marked keys `statusKind: 'expired'/'pending'` while leaving raw `status: 'active'` and a future/1-day-past expiry. The new predicate correctly derives statusKind from raw status + expiry, so those keys became connectable.
- **Fix:** Moved expired fixtures to 3 days past (outside grace) and gave the pending fixture raw `status: 'pending'` with `expiresAt: null`.
- **Files modified:** `tests/unit/mobile-servers-route.test.ts`, `tests/unit/mobile-config-route.test.ts`
- **Verification:** All 38 gate/grace tests pass.
- **Committed in:** `92e2428`

---

**Total deviations:** 2 auto-fixed (2 correctness bugs). **Impact:** Both were necessary for the locked 24h semantics and for the pre-existing tests to keep asserting genuine non-entitlement; no scope creep, no new endpoint, no schema change.

## Issues Encountered

- `npx tsc --noEmit` exits 0 on the current working tree; there were no 21-02 type errors to triage.
- The Vite config emits an ESM/CommonJS `configLoader: 'native'` advisory warning on every vitest run; it is pre-existing and unrelated to this plan.
- `requirements.ready-ids` gated 3 of 5 IDs (REQ-SUB-01/02/06 are shared with sibling plans) and `requirements.mark-complete` reported `not_found` for the 2 ready IDs because `REQUIREMENTS.md` has no checkbox/status surface for them. No status table was invented — this is a pre-existing artifact structure, out of scope here.
- Manual grace connection on a device remains a human-only validation item in `21-VALIDATION.md` (needs a real expired key and a live tunnel).

## User Setup Required

None. No new service, credential or environment variable was introduced.

## Next Phase Readiness

- `/subscription` is now a live contract the Flutter subscription provider and Shop Screen can consume in Plans 04/05; `graceUntil` arrives server-derived so the client never computes the window.
- The phase-19/20 connect gates are aligned in code; on-device confirmation of a graced connection is still pending in `21-VALIDATION.md`.
- No device add/remove capability was introduced; REQ-SUB-04 enforcement remains deferred to Phase 22 as required.

---
*Phase: 21-subscription-purchase-7-days*
*Completed: 2026-11-28*

## Self-Check: PASSED
