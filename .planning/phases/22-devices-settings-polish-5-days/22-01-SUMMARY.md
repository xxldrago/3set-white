---
phase: 22-devices-settings-polish-5-days
plan: 01
subsystem: api
tags: [jwt, artemida, ownership, devices, zod, vitest, flutter, riverpod, freezed, dio, deferred-delete, dark-ui]

requires:
  - phase: 18-foundation-auth-5-days
    provides: verifyAccessToken and claims.userId used by both device routes
  - phase: 21-subscription-purchase-7-days
    provides: isKeyConnectable single predicate, createOrder single issuer and the paid upgrade intent
provides:
  - JWT + ownership-scoped GET /api/mobile/devices with honest labels and server deviceLimit
  - zod-bounded DELETE /api/mobile/devices/{token} with stable {ok,error} envelope and Retry-After
  - Real dark Profile Sheet with device rows, empty state and read-only kill-switch status
  - Five-second deferred-delete controller with cancellable undo and no restore
  - Honest add handoff (subscription link) and paid limit growth through the single issuer
affects:
  - 22-02 (settings identity rows), 22-03 (local expiry reminders), 22-04 (package gate), 22-05 (polish)

actuals:
  tokens: 21094
  tasks: 3
  commits: 4

tech-stack:
  added:
    - fake_async (transitive via flutter_test) for deterministic undo-clock fixtures
  patterns:
    - Mobile BFF routes: verifyAccessToken -> single isKeyConnectable key -> ownership join -> HTTP 200 stable code
    - No client keyId: the active key is derived from claims.userId on both read and delete
    - Deferred DELETE: a cancellable Timer is the only provider call; undo cancels before it fires
    - Integer-only capacity comparison from server values; no local counter or percentage

key-files:
  created:
    - app/api/mobile/devices/route.ts
    - app/api/mobile/devices/[token]/route.ts
    - tests/unit/mobile-devices-route.test.ts
    - mobile/lib/features/profile/devices/device.dart
    - mobile/lib/features/profile/devices/devices_providers.dart
    - mobile/lib/features/profile/devices/deferred_delete_controller.dart
    - mobile/lib/features/profile/devices/devices_sheet.dart
    - mobile/lib/features/profile/profile_sheet.dart
    - mobile/test/unit/features/devices/deferred_delete_test.dart
    - mobile/test/unit/features/devices/device_limit_test.dart
    - mobile/test/widget/features/profile/profile_sheet_test.dart
  modified:
    - app/api/mobile/payments/create/route.ts
    - mobile/lib/core/api/endpoints.dart
    - mobile/lib/features/servers/server_pool_screen.dart

key-decisions:
  - "User selected proceed-locked at the blocking decision gate: D-01 kill switch always-on/read-only, D-04 no native VPN changes, D-05 honest device add via subscription link + paid upgrade only, D-06 deferred-delete undo with no fake restore, D-08 FCM deferred. Recorded in STATE.md before any code."
  - "Device tokens stay opaque: zod 1..300 on the server and Uri.encodeComponent on the client; no client-supplied keyId crosses either boundary."
  - "Missing active key, null ownership join and provider unauthorized collapse to one no_active_key HTTP 200 envelope so device ownership is never enumerable."
  - "Capacity growth posts intent-only {kind:'upgrade', addDevices:1}; /payments/create derives the active owned key from the JWT with isKeyConnectable, leaving createOrder as the sole issuer."
  - "The tracer slice passed its full automated verify end-to-end before expansion (no human-observable evidence in <verify>), so expansion proceeded without an extra checkpoint."

patterns-established:
  - "Stable 200 domain envelope with Retry-After on rate limits for device routes; logs carry only route/requestId/userId/outcome/code/durationMs."
  - "Freezed Device model with label ?? name ?? 'Устройство' fallback and no lastSeen field."
  - "Generation-token + onDispose discipline on the deferred-delete timer mirrors the connection FSM cancellation pattern."

requirements-completed: [REQ-BE-06, REQ-DEV-01, REQ-DEV-02, REQ-DEV-03, REQ-DEV-04, REQ-SUB-04]

coverage:
  - id: D1
    description: Ownership-scoped JWT device list with honest labels and server deviceLimit
    requirement: REQ-BE-06
    verification:
      - kind: unit
        ref: tests/unit/mobile-devices-route.test.ts#GET /devices honest rows and secret discipline
        status: pass
    human_judgment: false
  - id: D2
    description: zod-bounded opaque-token DELETE with stable outcomes and no ownership oracle
    requirement: REQ-DEV-02
    verification:
      - kind: unit
        ref: tests/unit/mobile-devices-route.test.ts#DELETE /devices/{token} auth zod bounds and ownership
        status: pass
    human_judgment: false
  - id: D3
    description: Freezed Device model with honest fallback and URL-encoded token helper
    requirement: REQ-DEV-01
    verification:
      - kind: widget
        ref: mobile/test/widget/features/profile/profile_sheet_test.dart#uses the neutral fallback when label and name are both absent
        status: pass
    human_judgment: false
  - id: D4
    description: Live devices provider over the shared BFF failure mapper with stable Russian notices
    requirement: REQ-DEV-01
    verification:
      - kind: widget
        ref: mobile/test/widget/features/profile/profile_sheet_test.dart#a failed device read shows a stable notice
        status: pass
    human_judgment: false
  - id: D5
    description: Five-second deferred delete with undo cancelling before any provider call
    requirement: REQ-DEV-04
    verification:
      - kind: unit
        ref: mobile/test/unit/features/devices/deferred_delete_test.dart#undo inside the window cancels before any provider call
        status: pass
    human_judgment: false
  - id: D6
    description: Real dark Profile Sheet with device rows, empty state, read-only kill switch and no bottom nav
    requirement: REQ-DEV-03
    verification:
      - kind: widget
        ref: mobile/test/widget/features/profile/profile_sheet_test.dart#Profile sheet device rows
        status: pass
    human_judgment: false
  - id: D7
    description: Honest add handoff and paid upgrade CTA at exactly deviceLimit with no local counter
    requirement: REQ-SUB-04
    verification:
      - kind: widget
        ref: mobile/test/widget/features/profile/profile_sheet_test.dart#honest add paid upgrade and deferred undo
        status: pass
    human_judgment: false
  - id: D8
    description: Server-side derivation of the upgrade key from the JWT with no client keyId and no second issuer
    requirement: REQ-BE-06
    verification:
      - kind: unit
        ref: tests/unit/mobile-devices-route.test.ts#paid upgrade handoff (D-05 no second issuer)
        status: pass
    human_judgment: false
  - id: D9
    description: Visual and accessibility parity of the dark profile sheet with the prototype
    verification: []
    human_judgment: true
    rationale: "No browser/screenshot MCP available; contrast, typography and layout parity require a human comparison against .planning/seeds/prototype-mobile-client.html."

duration: 43 min
completed: 2026-11-28
status: complete
---

# Phase 22 Plan 01: Device Slice Summary

**JWT ownership-scoped device list and five-second deferred-delete undo wired into a real dark profile sheet, with add as a subscription-link handoff and capacity growth through the existing paid issuer**

## Performance

- **Duration:** 43 min
- **Started:** 2026-11-28T09:08:12Z
- **Completed:** 2026-11-28T09:51:27Z
- **Tasks:** 3 (blocking decision gate, tracer slice, expansion)
- **Files modified:** 20 (11 created, 3 modified implementation, 1 test file extended, generated parts included)

## Accomplishments

- Confirmed the five costly locked decisions at a blocking gate before any code; recorded in STATE.md decision log.
- Built `GET /api/mobile/devices`: 401 without JWT with no reads, one active connectable key from claims.userId, identical `no_active_key` envelope for missing/non-owned keys, labelled rows and server `deviceLimit`.
- Built `DELETE /api/mobile/devices/[token]`: zod 1..300 opaque token before any provider call, ownership-joined removal, stable HTTP 200 codes and `Retry-After` on rate limits.
- Replaced the profile stub with a dark sheet using real subscription identity, one row per token in provider order, `Нет устройств` empty state and a read-only always-on kill-switch status row — no toggle, no bottom navigation.
- Added a five-second deferred-delete controller: only a fired timer calls the BFF; `Вернуть` cancels generation-guarded; no row is ever reinserted after a real delete.
- Add handoff copies the real subscription link; at exactly `deviceLimit` only the paid `upgrade` intent remains, with no local counter and no client `keyId`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Gate — confirm costly locked decisions** - `1fe9614` (docs)
2. **Task 2: End-to-end device slice tracer** - `910cdf5` (feat)
3. **Task 3: Deferred delete, honest add and device-limit handoff** - `9f645c4` (feat)

**Plan metadata:** pending final docs commit

_Note: tracer feedback gate passed end-to-end (automated-only `<verify>`), so expansion continued without an added checkpoint._

## Files Created/Modified

- `app/api/mobile/devices/route.ts` — JWT ownership-joined device list with stable degradation.
- `app/api/mobile/devices/[token]/route.ts` — zod-bounded opaque-token delete through the ownership join.
- `app/api/mobile/payments/create/route.ts` — upgrade with no client keyId now resolves the active owned key from the JWT.
- `tests/unit/mobile-devices-route.test.ts` — 14 backend contract vectors (auth, ownership, zod, Retry-After, no secret in body/logs, paid handoff).
- `mobile/lib/core/api/endpoints.dart` — URL-encoded device token path helper.
- `mobile/lib/features/profile/devices/device.dart` — freezed `Device`/`DevicesPayload` and honest display fallback.
- `mobile/lib/features/profile/devices/devices_providers.dart` — live list and delete providers over the shared BFF failure mapper.
- `mobile/lib/features/profile/devices/deferred_delete_controller.dart` — cancellable five-second DELETE timer with generation guard.
- `mobile/lib/features/profile/devices/devices_sheet.dart` — rows, add handoff, paid CTA and integer-only capacity decision.
- `mobile/lib/features/profile/profile_sheet.dart` — real dark profile sheet replacing the stub.
- `mobile/lib/features/servers/server_pool_screen.dart` — avatar `onProfile` opens the new sheet; stub removed.
- `mobile/test/unit/features/devices/deferred_delete_test.dart` — 5 fakeAsync undo-clock vectors.
- `mobile/test/unit/features/devices/device_limit_test.dart` — 4 integer-only capacity boundary vectors.
- `mobile/test/widget/features/profile/profile_sheet_test.dart` — 10 widget vectors (rows, empty state, safety copy, handoffs, undo).

## Decisions Made

- User selected `proceed-locked` at the blocking gate — D-01, D-04, D-05, D-06 and D-08 explicitly confirmed before any implementation file was written.
- Device tokens remain opaque end to end: zod bounds on the server, `Uri.encodeComponent` on the client, never a client `keyId`.
- Provider unauthorized collapses to `no_active_key`; a null ownership join is indistinguishable from a missing key.
- Capacity growth reuses the single webhook → outbox → worker issuer; the client posts intent only.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Upgrade intent had no way to identify the owned key**
- **Found during:** Task 3 (device-limit paid handoff)
- **Issue:** The CTA posts `{kind:'upgrade', addDevices:1}` with no client `keyId` (the plan forbids exposing one), but `/api/mobile/payments/create` required `keyId` for upgrade and would answer 400 — the paid capacity path could never complete.
- **Fix:** `/payments/create` now derives the single active owned key from `claims.userId` with `isKeyConnectable` when `keyId` is omitted for upgrade; `createOrder` remains the one issuer and no amount/keyId is exposed to the client.
- **Files modified:** `app/api/mobile/payments/create/route.ts`, `tests/unit/mobile-devices-route.test.ts`
- **Verification:** Two new vectors assert derivation from the JWT and `no_active_key`→404 with no provider call; the full 35-test backend suite (including the unchanged phase-21 payment suite) passes; `tsc --noEmit` exits 0.
- **Committed in:** `9f645c4`

---

**Total deviations:** 1 auto-fixed (1 missing-critical). **Impact:** Required for the paid upgrade CTA to function; no new issuer, no client keyId exposure and no change to the money pipeline. Recorded in `.planning/WINDOWS.md`.

## Issues Encountered

- Widget error fixture initially threw a bare `Object()`, which Riverpod left in a loading state; switched to `StateError` so the stable notice renders.
- Three relative import paths in two new Dart files were one directory too shallow; corrected and re-verified with `flutter analyze` and `flutter test`.
- `fake_async` 1.3.3 exposes `FakeAsync.elapse`, not `tick`; fixtures updated accordingly.
- Bare `flutter analyze` still reports the pre-existing ~1787 info/warning lint baseline across the repository; the plan's `--no-fatal-infos --no-fatal-warnings` verification exits 0 with no errors in 22-01 files.

## User Setup Required

None - no external service configuration required by this plan. Live ARTEMIDA device list/delete with a paid key and app-kill during the undo window remain manual-only items in `22-VALIDATION.md`.

## Next Phase Readiness

- Device/provider architecture slice is proven end to end and committed; settings identity rows, local expiry reminders and final polish can expand from it in 22-02..22-05.
- FCM registration (REQ-NOTIF-02) stays deferred (D-08); `flutter_local_notifications` install remains behind the blocking-human package gate in 22-04.
- Live provider calls, visual/accessibility parity and app-kill during the undo window need human verification before milestone close.

---
*Phase: 22-devices-settings-polish-5-days*
*Completed: 2026-11-28*

## Self-Check: PASSED

- All 12 key files exist on disk.
- All three task commits (`1fe9614`, `910cdf5`, `9f645c4`) are present in git history.
- Verification chain green: vitest 35/35, `tsc --noEmit` exit 0, `prisma validate` valid, `build_runner` success, `flutter analyze` exit 0 (0 errors), Flutter tests 19/19.
