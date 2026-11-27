---
phase: 20-vpn-core-connect-fsm-10-days
plan: 03
subsystem: mobile
tags: [android, kotlin, vpnservice, foreground-service, method-channel, dart, riverpod, kill-switch, no-simulation]

# Dependency graph
requires:
  - phase: 20-vpn-core-connect-fsm-10-days
    provides: "20-01 GET /api/mobile/config builds the full TUN config; 20-02 libbox_start_with_tun(fd, config) + traffic() in the own C-shared shim"
  - phase: 19-server-pools-auto-ping-7-days
    provides: "Serialized LibboxPingCore facade and injectable-client test patterns"
provides:
  - "Kotlin ThreeSetVpnService: prepare/establish/protect, onRevoke fd close, always-on routes, fd handoff over com.u3set.mobile/vpn"
  - "Kotlin VpnForegroundService: ongoing «VPN активен · 3set» notification with «Отключить» action routed to the FSM"
  - "Corrected AndroidManifest: BIND_VPN_SERVICE + specialUse subtype vpn; both invalid permissions removed"
  - "Dart VpnBridge / MethodChannelVpnBridge / vpnBridgeProvider with opaque fd handoff and stable error codes"
  - "7 fake-bridge unit tests: deny, revoke, disconnect, stop-before-idle, no fd/config logging"
affects:
  - "Phase 20 plans 04-07: connection FSM, backoff, reconnect and Connected Panel consume VpnBridge and its events"

# Actuals (#2632) — same chars/4 scale as the plan's estimate (42000 tokens).
actuals:
  tokens: 231
  tasks: 3
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "One method channel (com.u3set.mobile/vpn) for prepare/start/stop/protect plus native onRevoked/onDisconnect events"
    - "Android VpnService owns the ParcelFileDescriptor; Dart receives the fd as an opaque int and consumes it immediately"
    - "Kill switch is structural: full IPv4/IPv6 routes, no bypass-permitting builder call, no underlying-network override, no toggle"
    - "specialUse foreground-service type with vpn subtype; no vpn FGS type and no background-service plugin"
    - "Only stable error codes cross the bridge; raw platform text, config and fd values are never logged"

key-files:
  created:
    - mobile/android/app/src/main/kotlin/com/u3set/mobile/VpnService.kt
    - mobile/android/app/src/main/kotlin/com/u3set/mobile/VpnForegroundService.kt
    - mobile/lib/core/vpn/vpn_bridge.dart
    - mobile/test/unit/core/vpn/vpn_bridge_test.dart
  modified:
    - mobile/android/app/src/main/AndroidManifest.xml
    - mobile/android/app/src/main/kotlin/com/u3set/mobile/MainActivity.kt

key-decisions:
  - "D-06 confirmed by the user at the blocking decision gate as kotlin-service (locked): Kotlin VpnService + Kotlin foreground service + method channel, no flutter_background_service plugin"
  - "D-09 confirmed by the user at the blocking decision gate as always-on (locked): kill switch permanently enabled, no toggle, no bypass"
  - "specialUse FGS type with PROPERTY_SPECIAL_USE_FGS_SUBTYPE=vpn; both bogus manifest permissions deleted"
  - "fd is an opaque integer handoff; Kotlin retains ParcelFileDescriptor and closes it on stop/cancel/revoke; Dart never stores or logs it"
  - "VpnBridge.stop() awaits the shim stop before the platform teardown so no orphan tunnel survives cancel or revoke (D-14)"

patterns-established:
  - "VpnCore/VpnChannel injectable seams let bridge tests run without a Flutter engine or native library"
  - "Native events are reduced to a fixed code vocabulary (revoked, disconnect, permission_denied, config_invalid)"
  - "Structured logs carry only stable result fields; config fragments and fd values never reach them"

requirements-completed: [REQ-CONN-04, REQ-CONN-06]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "Kotlin VpnService calls prepare/establish/protect, handles onRevoke, and never permits VPN bypass"
    requirement: REQ-CONN-04
    verification:
      - kind: other
        ref: "grep prepare/establish/protect/onRevoke in mobile/android/app/src/main/kotlin/com/u3set/mobile/VpnService.kt; ! grep allowBypass"
        status: pass
    human_judgment: false
  - id: D2
    description: "Ongoing foreground notification titled exactly «VPN активен · 3set» with an «Отключить» action"
    requirement: REQ-CONN-04
    verification:
      - kind: other
        ref: "grep -q 'VPN активен · 3set' mobile/android/app/src/main/kotlin/com/u3set/mobile/VpnForegroundService.kt"
        status: pass
    human_judgment: false
  - id: D3
    description: "Manifest declares exactly one BIND_VPN_SERVICE, specialUse subtype vpn, and no invalid permissions"
    requirement: REQ-CONN-04
    verification:
      - kind: other
        ref: "grep -c BIND_VPN_SERVICE = 1; ! grep -E 'VPN_MANAGE|FOREGROUND_SERVICE_TYPE_VPN'; PROPERTY_SPECIAL_USE_FGS_SUBTYPE present"
        status: pass
    human_judgment: false
  - id: D4
    description: "Dart VpnBridge denies/revokes/stops in the right order, hands off the fd opaquely and leaks no config or fd to logs"
    requirement: REQ-CONN-06
    verification:
      - kind: unit
        ref: "mobile/test/unit/core/vpn/vpn_bridge_test.dart#7 tests; flutter test 7/7"
        status: pass
    human_judgment: false
  - id: D5
    description: "Real Android TUN fd, notification behavior, consent revocation and kill-switch leak test on device"
    requirement: REQ-CONN-06
    verification: []
    human_judgment: true
    rationale: "External blocker: no OpenJDK17 / Android SDK/NDK in this environment; a non-TUN fd aborts natively. CI artifacts and on-device UAT required. Recorded in .planning/WINDOWS.md entry 27."

# Metrics
duration: 8 min
completed: 2026-11-27
status: complete
---

# Phase 20 Plan 03: Android VPN Tunnel Seam Summary

**Kotlin VpnService + ongoing «VPN активен · 3set» foreground service over `com.u3set.mobile/vpn`, a corrected specialUse manifest, and a Dart VpnBridge that hands the OS TUN fd to libbox without storing or logging it**

## Performance

- **Duration:** 8 min
- **Started:** 2026-11-27T09:18:58Z
- **Completed:** 2026-11-27T09:27:00Z
- **Tasks:** 3 (2 blocking decision gates + 1 tracer)
- **Files modified:** 6 (4 created, 2 modified)

## Accomplishments

- Added `ThreeSetVpnService`: OS consent via `VpnService.prepare()`, `Builder` addresses/routes/DNS/MTU mirrored from libbox `TunOptions`, `establish()` fd handoff, `protect()` seam for outbound sockets, and `onRevoke()` that closes the descriptor and notifies Dart before idle.
- Added `VpnForegroundService`: a started foreground service whose ongoing, non-dismissible notification is titled exactly «VPN активен · 3set» and whose «Отключить» action routes through the method channel to FSM `disconnecting`.
- Corrected `AndroidManifest.xml`: one `BIND_VPN_SERVICE` declaration, `FOREGROUND_SERVICE_SPECIAL_USE`, `foregroundServiceType="specialUse"` with subtype `vpn`, and removal of both invalid permissions; all activity, deep-link and `<queries>` blocks preserved verbatim.
- Added an injectable `VpnBridge` with `MethodChannelVpnBridge` and `vpnBridgeProvider`: `prepare()` maps consent denial to `permission_denied`, `start()` consumes the fd immediately into `startWithTun`, and `stop()` awaits the shim before platform teardown.
- Added 7 fake-bridge tests covering deny/revoke/disconnect event ordering, stop-before-idle, opaque fd handoff, malformed replies and raw-platform-text sanitization; all pass with zero analyzer findings in the new files.
- Kill switch stays permanently on: full IPv4/IPv6 routes, no bypass-permitting builder call, no underlying-network override and no user toggle (D-09).

## Task Commits

Each task was committed atomically:

1. **Task 1 (checkpoint:decision, gate blocking): D-06 Android VpnService + Kotlin foreground service** — no file changes; the user explicitly selected `kotlin-service` (locked). Decision recorded here and in STATE.md; not auto-approved.
2. **Task 2 (checkpoint:decision, gate blocking): D-09 always-on kill switch** — no file changes; the user explicitly selected `always-on` (locked). Decision recorded here and in STATE.md; not auto-approved.
3. **Task 3 (tracer): end-to-end Android tunnel slice** — `a90cd30` (feat).

**Plan metadata:** see the final `docs(20-03): complete ...` commit.

## Files Created/Modified

- `mobile/android/app/src/main/kotlin/com/u3set/mobile/VpnService.kt` — OS tunnel service, method-channel handler, revoke handling, fd handoff.
- `mobile/android/app/src/main/kotlin/com/u3set/mobile/VpnForegroundService.kt` — ongoing notification, channel and disconnect action.
- `mobile/android/app/src/main/AndroidManifest.xml` — corrected VPN/FGS declarations.
- `mobile/android/app/src/main/kotlin/com/u3set/mobile/MainActivity.kt` — Rule 2 channel registration on the Flutter engine.
- `mobile/lib/core/vpn/vpn_bridge.dart` — abstract bridge, MethodChannel implementation, provider, injectable seams.
- `mobile/test/unit/core/vpn/vpn_bridge_test.dart` — 7 fake-bridge tests.

## Decisions Made

- **D-06 (user-confirmed at the blocking gate):** Kotlin `VpnService` + Kotlin foreground service + method channel; no `flutter_background_service`, no `systemExempted` FGS type.
- **D-09 (user-confirmed at the blocking gate):** always-on kill switch with no toggle, no bypass, no exclusion routes; revocation stops the core before idle.
- Android FGS type is `specialUse` with subtype `vpn` (ToyVpn/official docs), not the non-existent `vpn` type.
- The fd is a one-shot opaque handoff: Kotlin keeps the `ParcelFileDescriptor`; Dart passes the int straight into `startWithTun`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical] Register the method channel on the Flutter engine**
- **Found during:** Task 3 (tracer implementation)
- **Issue:** `MainActivity` was a bare `FlutterActivity`, so no Kotlin handler was attached to `com.u3set.mobile/vpn`. Every bridge call and the notification disconnect action would have been dead code, breaking D-06/D-11/D-14.
- **Fix:** override `configureFlutterEngine` and call `VpnMethodChannel.register(...)` with the engine's binary messenger and application context. One line of wiring; no plugin or new dependency.
- **Files modified:** `mobile/android/app/src/main/kotlin/com/u3set/mobile/MainActivity.kt`
- **Verification:** no runtime build here; source-level check that a single registration exists and analyzer/test gates remain green.
- **Committed in:** `a90cd30` (part of the Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 Rule 2 missing critical wiring). **Impact on plan:** no new dependency, no scope creep; required for the channel to exist at runtime.

## Issues Encountered

- `flutter analyze` exits 1 on 1622 pre-existing `info`/`warning` lints in unrelated files; **0 errors and 0 findings in 20-03 files**. `flutter analyze --no-fatal-warnings --no-fatal-infos` exits 0. Per the scope boundary these pre-existing lints were not fixed.
- Android native build/UAT could not run here (no JDK17/Android SDK/NDK); a non-TUN fd aborts natively, so only source-level assertions and Dart fake-bridge tests are locally verifiable. Recorded as `unrun-verify` in `.planning/WINDOWS.md` entry 27.
- The two blocking gates paused the first executor session with no production commits; the user confirmed both explicitly, so neither was auto-approved.

## Authentication Gates

None. No CLI/credential gate occurred.

## User Setup Required

None - no external service configuration is introduced by this plan. Native artifacts remain gitignored CI outputs built by `mobile/native/libbox_shim/build.sh`.

## Known Stubs

None. No TODO/FIXME/placeholder, fake data or empty handoff exists in the new files; the `TrafficSnapshot.zero()` fallback is an intentional safe default, not a placeholder.

## Threat Flags

None new. All changes stay inside the plan's threat register (T-20-08..T-20-11, T-20-SC): no new network endpoint, no auth path, no new schema, no package install, and no fd/config/secret logging.

## Next Phase Readiness

- Plan 05 can build the Riverpod connection FSM on `VpnBridge`: `prepare()` denial, `events` (`revoked`/`disconnect`) and the awaited `stop()` are the seams for D-10/D-11/D-13/D-14.
- Remaining external checks: CI-built Android `.so`, real `establish()` fd, notification visibility/action, consent revocation and kill-switch leak test on device; iOS stays compile-only until Apple entitlement approval.

## Self-Check: PASSED

- All 6 created/modified files exist on disk; the Task 3 commit `a90cd30` is present in `git log` with no unexpected deletions.
- `flutter test test/unit/core/vpn/vpn_bridge_test.dart` 7/7; full ping suite 45/45; `npx prisma validate` valid.
- Source gates: one `BIND_VPN_SERVICE`, zero invalid permissions, zero bypass call, exact notification title, `specialUse` subtype present.
- Analyzer: 0 errors and 0 findings in 20-03 files (project-wide 1622 pre-existing infos/warnings remain out of scope).
- No simulation, no fd/config logging, no package install and no new secret surface in the new code.

---
*Phase: 20-vpn-core-connect-fsm-10-days*
*Completed: 2026-11-27*
