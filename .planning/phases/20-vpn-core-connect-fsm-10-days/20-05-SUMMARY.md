---
phase: 20-vpn-core-connect-fsm-10-days
plan: 05
subsystem: mobile-vpn
tags: [flutter, riverpod, freezed, fsm, dio, vpn-bridge, error-mapping, toasts]

requires:
  - phase: 20-01
    provides: "GET /api/mobile/config?serverId=... backend-built full TUN config (D-01)"
  - phase: 20-02
    provides: "libbox TUN core + TrafficSnapshot seam"
  - phase: 20-03
    provides: "VpnBridge abstraction, method channel, stop contract"
  - phase: 19-06
    provides: "ConnectController.connect selection step + ConnectOutcome"
provides:
  - "ConnPhase + freezed ConnectionState (safe metadata only)"
  - "connectionNotifierProvider: guarded FSM with generation token and stop-before-idle cancel/revoke/disconnect"
  - "ConfigRepository: opaque BFF-only /config fetch with stable error codes"
  - "Endpoints.config constant"
  - "ErrorCode + errorToastFor + structured error logging and toast sinks"
  - "27 passing unit tests across the four VPN test files"
affects: [20-06-reconnect-backoff, 20-07-connected-panel, phase-20-verification]

actuals:
  tokens: 14497
  tasks: 2
  commits: 4

tech-stack:
  added: []
  patterns:
    - "Riverpod Notifier<ConnectionState> as single FSM owner; every write via one _transition that logs only {from,to,reason}"
    - "Generation integer guards stale async completions; cancel bumps it so an in-flight connect cannot set connected"
    - "await bridge.stop() strictly before idle — no orphan tunnel (D-14)"
    - "Opaque config map serialized straight to bridge; never logged, rendered or stored in state"
    - "Stable-code-only error vocabulary → exact fixed RU toasts; structured {code,state,durationMs} logs"
    - "Injectable sink providers (transition log, toast, error log) keep the FSM unit-testable without a Flutter engine"

key-files:
  created:
    - mobile/lib/core/vpn/connection_state.dart
    - mobile/lib/core/vpn/connection_state.freezed.dart
    - mobile/lib/core/vpn/config_repository.dart
    - mobile/lib/core/vpn/connection_notifier.dart
    - mobile/lib/core/vpn/error_mapping.dart
    - mobile/test/unit/core/vpn/connection_state_test.dart
    - mobile/test/unit/core/vpn/cancel_test.dart
    - mobile/test/unit/core/vpn/error_mapping_test.dart
    - mobile/test/unit/core/vpn/config_repository_test.dart
  modified:
    - mobile/lib/core/api/endpoints.dart

key-decisions:
  - "ConnPhase has exactly the six locked values; ConnectionState carries phase/serverId/connectedAt/rtt/ip/down/up/errorCode and no config/outbound/link/token/fd (D-05/D-13/D-19)."
  - "connect() calls phase-19 ConnectController.connect first, then backend /config via the shared Dio, then bridge.start; connected is set only after native success — no sleep, no fake IP, no simulation (D-20)."
  - "Cancel/revoke/disconnect all await the native stop before idle; the generation token makes the in-flight connect stale (D-11/D-14)."
  - "Permission denial and revocation both map to «Нужно разрешение VPN» with a «Повторить» flag; only stable codes cross to UI/loggers (D-10/D-11/D-19)."
  - "Kill-switch notice «Kill switch: трафик вне VPN заблокирован» is emitted on explicit disconnect; there is no kill-switch toggle (D-09/D-12)."
  - "Toasts and error logs are injected sink providers so unit tests never need a Flutter binding; plan 07 may swap the surface without changing copy."

patterns-established:
  - "Injectable sink providers for side effects (log/toast) in pure Dart notifiers"
  - "Completer-gated fake bridge proves stop-before-idle ordering without native code"
  - "Stub HttpClientAdapter tests BFF status mapping without network or secrets"

requirements-completed: [REQ-CONN-01, REQ-CONN-02, REQ-CONN-03, REQ-CONN-10]

coverage:
  - id: D1
    description: "Freezed ConnPhase/ConnectionState with only safe fields and locked button copy"
    requirement: REQ-CONN-01
    verification:
      - kind: unit
        ref: "mobile/test/unit/core/vpn/connection_state_test.dart#locked button copy follows the phase"
        status: pass
    human_judgment: false
  - id: D2
    description: "Guarded connect FSM: phase-19 selection → /config → bridge, generation-guarded and safely logged"
    requirement: REQ-CONN-01
    verification:
      - kind: unit
        ref: "mobile/test/unit/core/vpn/connection_state_test.dart#idle → pinging → connecting → connected runs the real slice safely"
        status: pass
      - kind: unit
        ref: "mobile/test/unit/core/vpn/connection_state_test.dart#a stale generation cannot overwrite a newer connected state"
        status: pass
    human_judgment: false
  - id: D3
    description: "ConfigRepository fetches opaque backend config via shared Dio and maps 401/403/body/transport failures to stable codes"
    requirement: REQ-CONN-03
    verification:
      - kind: unit
        ref: "mobile/test/unit/core/vpn/config_repository_test.dart#opaque config returned verbatim; only serverId is sent"
        status: pass
      - kind: unit
        ref: "mobile/test/unit/core/vpn/config_repository_test.dart#401 maps to auth_failed, 403 and body no_active_key to no_active_key"
        status: pass
      - kind: unit
        ref: "mobile/test/unit/core/vpn/config_repository_test.dart#unknown server and transport failures fail closed without raw text"
        status: pass
    human_judgment: false
  - id: D4
    description: "Cancel and revoke await native stop before idle and emit the locked toasts"
    requirement: REQ-CONN-02
    verification:
      - kind: unit
        ref: "mobile/test/unit/core/vpn/cancel_test.dart#cancel stays disconnecting until stop completes, then idle + toast"
        status: pass
      - kind: unit
        ref: "mobile/test/unit/core/vpn/cancel_test.dart#revoke maps error → disconnecting → idle and stops the core"
        status: pass
    human_judgment: false
  - id: D5
    description: "Ten stable codes map to exact locked RU strings; structured error logs/toasts leak no raw text"
    requirement: REQ-CONN-10
    verification:
      - kind: unit
        ref: "mobile/test/unit/core/vpn/error_mapping_test.dart#every stable code maps to its exact locked RU string"
        status: pass
      - kind: unit
        ref: "mobile/test/unit/core/vpn/error_mapping_test.dart#no raw text, config, link, token or fd reaches toasts or error logs"
        status: pass
    human_judgment: false
  - id: D6
    description: "Real on-device cancel/revoke leaves no orphan tunnel with the Kotlin VpnService"
    requirement: REQ-CONN-02
    verification: []
    human_judgment: true
    rationale: "Only fake-bridge ordering is verifiable here; Android native build/UAT is blocked by missing JDK 17 + Android SDK/NDK in this environment."

duration: 13min
completed: 2026-11-27
status: complete
---

# Phase 20 Plan 05: VPN Connect FSM Summary

**Riverpod connect FSM with generation-guarded transitions, stop-before-idle cancel, opaque `/config` fetch and exact RU error toasts**

## Performance

- **Duration:** 13 min
- **Started:** 2026-11-27T09:54:22Z
- **Completed:** 2026-11-27T10:07:25Z
- **Tasks:** 2/2
- **Files modified:** 10 (9 created, 1 modified)
- **Tests:** 27 unit tests passing across `test/unit/core/vpn/`

## Accomplishments

- Built the single-owner FSM: `idle → pinging → connecting → connected → disconnecting → idle` plus `error`, with every write funnelled through one `_transition` that logs only `{from,to,reason}`.
- Wired `pinging` to the phase-19 `ConnectController.connect` selection step, mapped `no_active_key`/`all_offline` to `error`, carried `serverId` into `connecting`, fetched the opaque backend config and started the native bridge — `connected` only after native success.
- Added a generation token so a stale config/bridge callback cannot overwrite a newer attempt (proved by a deterministic completer test).
- Guaranteed cancel/revoke/disconnect await `bridge.stop()` before entering `idle`; no orphan tunnel in the fake-bridge harness, and the «Подключение отменено» toast fires exactly once.
- Mapped all ten stable codes to the exact locked Russian strings with a «Повторить» flag on permission errors, plus `{code,state,durationMs}` structured logs — no raw libbox/Android/config/token/fd text can cross.
- Added focused `/config` boundary tests (401/403/body/transport) beyond the planned test files to close the REQ-CONN-03 verification gap.

## Task Commits

Each task was committed atomically:

1. **Task 1 (tracer): End-to-end connect slice** — `34f7acf` (feat; tracer re-verified end-to-end before expansion)
2. **Task 2: Cancel ordering + error-to-toast mapping** — `62e4aba` (feat)
3. **Boundary test coverage (Task 1 artifact follow-up)** — `3e004e7` (test)

**Plan metadata:** `01f493c` (docs: summary + STATE/ROADMAP/WINDOWS close-out)

## Files Created/Modified

- `mobile/lib/core/api/endpoints.dart` — added `Endpoints.config` beside `servers` (no new API client).
- `mobile/lib/core/vpn/connection_state.dart` + generated `.freezed.dart` — six-phase enum and safe metadata-only state; locked button copy.
- `mobile/lib/core/vpn/config_repository.dart` — shared-Dio `/config?serverId=` GET, opaque config map, stable `ConfigRepositoryException` codes.
- `mobile/lib/core/vpn/connection_notifier.dart` — guarded FSM owner, generation token, connect/cancel/disconnect/revoke, safe transition/error/toast sinks.
- `mobile/lib/core/vpn/error_mapping.dart` — `ErrorCode`, exact RU `errorToastFor`, `{code,state,durationMs}` log payload and injectable sink providers.
- `mobile/test/unit/core/vpn/connection_state_test.dart` — happy path, `no_active_key`, stale generation and button copy.
- `mobile/test/unit/core/vpn/cancel_test.dart` — completer-gated stop ordering, no-op cancel and revoke path.
- `mobile/test/unit/core/vpn/error_mapping_test.dart` — exact strings, retry flags, no-leak assertions.
- `mobile/test/unit/core/vpn/config_repository_test.dart` — stub-transport status mapping and config opacity.

## Decisions Made

- Used `Notifier<ConnectionState>` (not `AsyncNotifier`) because the FSM state is synchronous metadata; async work stays inside methods with generation guards.
- Built transition state explicitly in `_transition` instead of freezed `copyWith`, so nullable fields can be cleared deterministically between phases.
- Put the default toast surface behind `connectionToastProvider` using the existing global `ScaffoldMessenger` key; plan 07 can replace the surface without touching stable-code → copy mapping.
- `cancel()` is guarded strictly to `connecting` per the plan acceptance criteria; `disconnect()` handles `connected`, and `revoked` follows `error → disconnecting → idle`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] OS consent gate added to `connect()`**
- **Found during:** Task 1 (connect slice)
- **Issue:** The plan's connect chain named selection → `/config` → `bridge.start()` but omitted `bridge.prepare()`; without it the locked D-10 permission flow (`permission_denied` → «Нужно разрешение VPN» + «Повторить») could never fire before tunnel start.
- **Fix:** `connect()` calls `await bridge.prepare()` after the opaque config fetch and before `bridge.start()`, mapping `VpnBridgeException` to a stable error code.
- **Files modified:** `mobile/lib/core/vpn/connection_notifier.dart`
- **Verification:** happy-path test asserts `prepare` precedes `start`; error paths covered by mapping tests.
- **Committed in:** `34f7acf`

**2. [Rule 1 - Bug] Unit-test isolation after error toasts were added**
- **Found during:** Task 2 verification (full `flutter test test/unit/core/vpn/`)
- **Issue:** Once `_fail()` emitted a toast, the Task 1 tests used the default toast sink, which reads `ErrorToastService.scaffoldMessengerKey.currentState` and throws "Binding has not yet been initialized" without a widget binding.
- **Fix:** Injected no-op `connectionToastProvider`/`connectionErrorLogProvider` overrides into every Task 1 `ProviderContainer`, keeping pure-Dart tests engine-free.
- **Files modified:** `mobile/test/unit/core/vpn/connection_state_test.dart`
- **Verification:** all 27 VPN tests pass in one `flutter test test/unit/core/vpn/` run.
- **Committed in:** `62e4aba`

---

**Total deviations:** 2 auto-fixed (1 Rule 2 missing-critical, 1 Rule 1 bug).
**Impact on plan:** Both are required for locked permission/error behavior and test determinism; no scope creep into reconnect (20-06) or panel UI (20-07).

## Issues Encountered

- Bare `flutter analyze` exits 1 on ~1623 pre-existing `info`/`warning` lints in unrelated files (0 errors). `flutter analyze --no-fatal-infos --no-fatal-warnings` exits 0 and no findings occur in 20-05 files. Per the scope boundary this lint debt was not fixed; recorded in `.planning/WINDOWS.md`.
- `error_mapping.dart:1` inherits the repo-wide `flutter/material.dart` deprecation info (already present in `error_toast.dart`); kept because the default toast sink needs `SnackBar`/`Text`. Not a 20-05 regression.
- Real on-device cancel/revoke and native orphan-tunnel verification remain external (no JDK 17 / Android SDK/NDK here); recorded as an `unrun-verify` window entry.
- `requirements.mark-complete` could not check off REQ-CONN-01/02/03/10: `REQUIREMENTS.md` provides only a table with no checkbox surface for these IDs. Completion is recorded in this SUMMARY's `requirements-completed` frontmatter and STATE.md decisions; no requirement row was edited.

## User Setup Required

None - no external service configuration required by this plan. (Existing Apple entitlement and Android toolchain blockers are recorded in STATE.md.)

## Next Phase Readiness

- Ready for 20-06 (reconnect + restart backoff): it extends `ConnectionNotifier` with `network_changed` and `core_stopped` inputs on top of this single FSM; do not build a second state machine.
- Ready for 20-07 (connected panel): consume `connectionNotifierProvider` state and `ConnPhase.buttonLabel`; IP/timer/traffic still need their live wiring, with no fake values.
- Blocker carried forward: on-device Android cancel/revoke UAT and iOS entitlement approval are unchanged external blockers.

## Self-Check: PASSED

- All 10 created/modified files exist on disk (including generated `connection_state.freezed.dart`).
- All 3 production/test commits verified in git history: `34f7acf`, `62e4aba`, `3e004e7`.
- 27/27 VPN unit tests pass; `build_runner` green; `flutter analyze` 0 errors; `npx prisma validate` green.

---
*Phase: 20-vpn-core-connect-fsm-10-days*
*Completed: 2026-11-27*
