---
phase: 22-devices-settings-polish-5-days
plan: 02
subsystem: mobile
tags: [flutter, drift, riverpod, settings, auto-connect, biometric, secure-storage, reset-demo, unit-tests]

requires:
  - phase: 22-devices-settings-polish-5-days
    provides: 22-01 profile slice and the locked D-01/D-04 decisions this plan builds on
  - phase: 20-vpn-core-connect-fsm-10-days
    provides: the guarded connectionNotifier.connect(tab, auto:) and the single D-15 reconnect listener
  - phase: 21-subscription-purchase-7-days
    provides: userSubscriptionProvider active-key gate from /api/mobile/subscription
provides:
  - Drift v2 singleton settings table (autoConnect, wasConnected) with a real v1→v2 migration
  - One-shot launch listener calling connect(tab, auto: true) once after auth + key + biometric gate
  - Local-only Reset Demo clearing token store, both secure-storage namespaces and all Drift tables
  - Wave 0 unit tests for persistence, single-fire, gating and zero-server-effect reset
affects:
  - 22-03 (local expiry reminders share main.dart listener wiring), 22-04 (package gate), 22-05 (profile/settings UI rows: referral, reset row, accessibility)

actuals:
  tokens: 9834
  tasks: 2
  commits: 3

tech-stack:
  added:
    - Drift Settings table registered in AppDatabase schemaVersion 2 (generated bindings rebuilt via build_runner)
  patterns:
    - One-shot app-level Provider listener: ref.listen on auth + subscription, fired flag, ref.onDispose close, unawaited + catch
    - Injected caller seam (autoConnectCallerProvider) so the single connect is observable without a native bridge
    - Local-only reset sequence: TokenStore.clearAll → SecureStorage.clearAll → biometric namespace clear → Drift batch deleteAll → auth invalidate → navigation callback

key-files:
  created:
    - mobile/lib/core/settings/settings_table.dart
    - mobile/lib/core/settings/auto_connect_listener.dart
    - mobile/lib/core/settings/reset_demo.dart
    - mobile/test/unit/core/settings/auto_connect_test.dart
    - mobile/test/unit/core/settings/reset_demo_test.dart
  modified:
    - mobile/lib/core/db/app_database.dart
    - mobile/lib/core/db/app_database.g.dart
    - mobile/lib/main.dart

key-decisions:
  - "Auto-connect is a caller only: it invokes the existing connect(tab, auto: true) through an injectable seam, adds no second reconnect path and changes no FSM, native VPN, kill-switch or D-15 network-change code."
  - "The launch gate is authenticated state + active key from userSubscriptionProvider + persisted preference; a biometric lockout calls authNotifier.setUnauthenticated(), so the authenticated gate also covers the existing resume gate (flagged assumption A4: single-fire proven with fakes, real biometric resume stays manual)."
  - "Drift v2 migration creates only the settings table; the five phase-19 tables and their rows are preserved, and generated bindings are rebuilt rather than hand-edited."
  - "Reset Demo clears the biometric-scoped storage namespace explicitly because SecureStorage.clearAll() covers only the standard namespace (Rule 2 correction); it remains purely local with an injected /auth navigation callback for the later profile UI row."

patterns-established:
  - "Provider listener single-fire: guard with a local `fired` flag before any await, close both ref.listen subscriptions on dispose, swallow all errors so startup never breaks."
  - "Drift bulk clear: db.batch with deleteAll for every registered table, including settings, so Reset Demo leaves no local row behind."

requirements-completed: [REQ-SET-02, REQ-SET-04]

coverage:
  - id: D1
    description: Drift v2 settings row persists the auto-connect preference across a rebuild
    requirement: REQ-SET-02
    verification:
      - kind: unit
        ref: mobile/test/unit/core/settings/auto_connect_test.dart#auto-connect preference persists across a store rebuild and defaults to false
        status: pass
      - kind: unit
        ref: mobile/test/unit/core/settings/auto_connect_test.dart#one singleton row holds the value instead of appending
        status: pass
    human_judgment: false
  - id: D2
    description: One launch listener connects exactly once only when authenticated, key-gated and enabled; re-watch and network events add no second call
    requirement: REQ-SET-02
    verification:
      - kind: unit
        ref: mobile/test/unit/core/settings/auto_connect_test.dart#calls connect once when authenticated, key-gated and enabled
        status: pass
      - kind: unit
        ref: mobile/test/unit/core/settings/auto_connect_test.dart#never connects while unauthenticated / without an active key / when the preference is false
        status: pass
      - kind: unit
        ref: mobile/test/unit/core/settings/auto_connect_test.dart#a storage failure never breaks startup and schedules no retry
        status: pass
    human_judgment: false
  - id: D3
    description: On-device biometric-resume behavior and a real on-disk v1→v2 database upgrade
    requirement: REQ-SET-02
    verification: []
    human_judgment: true
    rationale: "Flagged assumption REQ-SET-02/idempotency: single-fire is proven with fake providers, not a device with real biometric resume; the plan defers the real v1 database upgrade (22-VALIDATION.md)."
  - id: D4
    description: Reset Demo clears tokens, both storage namespaces and every Drift table, then invalidates auth and navigates once
    requirement: REQ-SET-04
    verification:
      - kind: unit
        ref: mobile/test/unit/core/settings/reset_demo_test.dart#clears tokens, both storage namespaces and every Drift table
        status: pass
      - kind: unit
        ref: mobile/test/unit/core/settings/reset_demo_test.dart#invalidates auth, navigates once and makes no outbound call
        status: pass
    human_judgment: false
  - id: D5
    description: Reset Demo makes zero outbound calls and cannot resurrect a session from a biometric-scoped token
    requirement: REQ-SET-04
    verification:
      - kind: unit
        ref: mobile/test/unit/core/settings/reset_demo_test.dart#hasTokens stays false after reset even with a stored biometric copy
        status: pass
    human_judgment: false
  - id: D6
    description: On-device check that no biometric prompt can resurrect a session after Reset Demo
    requirement: REQ-SET-04
    verification: []
    human_judgment: true
    rationale: "REQ-SET-04/unclassified flagged assumption: verified with a fake store; the on-device biometric prompt check remains manual (22-VALIDATION.md)."

duration: 12 min
completed: 2026-11-28
status: complete
---

# Phase 22 Plan 02: Settings Persistence & Local Reset Summary

**Drift v2 settings with a one-shot, gate-checked auto-connect caller on the existing FSM, plus a Reset Demo that clears both secure-storage namespaces and every local table without touching the server**

## Performance

- **Duration:** 12 min
- **Started:** 2026-11-28T09:56:17Z
- **Completed:** 2026-11-28T10:08:15Z
- **Tasks:** 2 (tracer slice, expansion)
- **Files modified:** 8 (5 created, 2 modified, 1 generated binding rebuilt)

## Accomplishments

- Added the client-local `Settings` table (`id = 1`, `autoConnect`, `wasConnected`) to Drift `AppDatabase` with a real v1→v2 migration that creates only the new table and preserves existing rows; rebuilt `.g.dart` with build_runner.
- Built `auto_connect_listener.dart`: a one-shot app-level provider that reads the persisted preference, gates on authenticated state, an active key from `userSubscriptionProvider` and the existing biometric resume gate, then calls `connect(tab, auto: true)` exactly once through an injectable seam. Subscriptions are closed on dispose and every failure is swallowed so startup never breaks.
- Watched the listener once in `main.dart` alongside the existing always-on listeners. No FSM transition, native VPN rule, kill-switch rule or second reconnect path was added; later network changes remain owned by `connectionReconnectListenerProvider` (D-15).
- Built `reset_demo.dart`: clears the token store, the standard secure-storage namespace, the biometric-scoped namespace and all six Drift tables, invalidates auth and issues one `/auth` navigation callback. No provider clear, session revocation, key/device delete, ARTEMIDA call or secret log.
- Added 10 Wave 0 unit tests: persistence and single-row behavior, single-fire gating (auth/key/preference), re-watch and no connectivity subscription, failure safety, full local clear, zero outbound calls, and no biometric token resurrection.

## Task Commits

Each task was committed atomically:

1. **Task 1: End-to-end auto-connect slice — one path only** (tracer) - `3dc0f62` (feat)
2. **Task 2: Local-only Reset Demo** - `def442f` (feat)

**Plan metadata:** pending final docs commit

_Note: the tracer feedback gate re-ran the full automated `<verify>` (build_runner → analyze → focused test) end-to-end and passed, so expansion continued without an added checkpoint. No `checkpoint:*` task exists in this plan._

## Files Created/Modified

- `mobile/lib/core/settings/settings_table.dart` — singleton Drift settings row for autoConnect/wasConnected (schema v2).
- `mobile/lib/core/db/app_database.dart` — registers Settings, schemaVersion 2 and the v1→v2 migration strategy.
- `mobile/lib/core/db/app_database.g.dart` — regenerated bindings including `$SettingsTable`, `SettingsCompanion` and the table manager.
- `mobile/lib/core/settings/auto_connect_listener.dart` — AutoConnectStore, caller seam and one-shot launch listener with disposal and error swallowing.
- `mobile/lib/main.dart` — watches the new listener once at app startup.
- `mobile/test/unit/core/settings/auto_connect_test.dart` — 7 persistence/single-fire/gating tests with in-memory Drift and fake providers.
- `mobile/lib/core/settings/reset_demo.dart` — local-only reset function with the dual-namespace secure-storage clear.
- `mobile/test/unit/core/settings/reset_demo_test.dart` — 3 tests for full local clear, auth invalidation, one navigation and zero outbound calls.

## Decisions Made

- Kept auto-connect outside the FSM/native boundary: it is a single caller of the existing guarded `connect(tab, auto: true)`, observed in tests through `autoConnectCallerProvider` rather than a faked tunnel.
- Treated the biometric gate via its observable effect: a failed/cancelled unlock calls `authNotifier.setUnauthenticated()`, so the authenticated gate prevents a connect; the listener also reads `resumeBiometricGateProvider` at startup to keep the observer alive.
- Reset Demo clears `SecureStorage.biometricStorage` in addition to `TokenStore.clearAll()` and `SecureStorage.clearAll()`; a standard namespace clear alone would leave the biometric-scoped access token that a prompt could resurrect.
- Reset Demo is UI-free: the later profile plan supplies `() => context.go('/auth')` as the navigation callback, keeping this unit testable without a GoRouter.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Biometric-scoped access token survived the planned reset sequence**
- **Found during:** Task 2 (Local-only Reset Demo)
- **Issue:** The plan's action awaits `TokenStore.clearAll()` then `SecureStorage.clearAll()`. Research Pitfall 5 shows `SecureStorage.clearAll()` clears only the standard `_storage`; `TokenStore.getAccessToken()` reads the separate `_biometricStorage` namespace, so the biometric entry would survive Reset Demo and `hasTokens()`/a biometric prompt could still find a stale secret.
- **Fix:** Added `await secureStorage.biometricStorage.deleteAll()` after the standard clear in `reset_demo.dart`. The test seeds a biometric-only `access_token`, asserts the biometric map is empty afterwards and asserts `getAccessToken()`, `getRefreshToken()` and `hasTokens()` are all cleared.
- **Files modified:** `mobile/lib/core/settings/reset_demo.dart`, `mobile/test/unit/core/settings/reset_demo_test.dart`
- **Verification:** `flutter test test/unit/core/settings/reset_demo_test.dart` — 3/3 pass; full `flutter test` — 351/351 pass; `flutter analyze --no-fatal-infos --no-fatal-warnings` — 0 errors.
- **Committed in:** `def442f`

---

**Total deviations:** 1 auto-fixed (1 missing-critical). **Impact:** Required for REQ-SET-04's "no biometric prompt can resurrect a session" truth; purely local, no server effect and no new dependency. Recorded in `.planning/WINDOWS.md`.

## Issues Encountered

- Freezed variant classes for `AuthState` are private (`_Authenticated`), so the listener uses the generated `when()` extension instead of an `is` type test.
- `Override` is not importable as a named type from `flutter_riverpod` in this project; the test builds its override list inline so the element type is inferred.
- `flutter analyze` still reports the pre-existing ~1820 info-level lint baseline across the repository; the plan's `--no-fatal-infos --no-fatal-warnings` verification exits 0 with no errors in 22-02 files.
- Draft versions of the test files used an import after declarations and a mid-file `AuthState` import; both were corrected before verification. No issue remains.

## User Setup Required

None - no external service configuration or package install required by this plan. `flutter_local_notifications`/`timezone` remain behind the blocking-human gate in 22-04; FCM stays deferred (D-08).

## Next Phase Readiness

- The settings table and one-shot listener are available to later profile/settings UI plans; `wasConnected` is persisted for display history and is not yet read by any widget.
- Reset Demo is ready for a UI row to call `resetDemo(ref, onNavigateToAuth: () => context.go('/auth'))`; no UI row was added here by design.
- Manual-only items remain in `22-VALIDATION.md`: real biometric-resume timing with a live tunnel, a real on-disk v1→v2 upgrade, and an on-device check that a biometric prompt cannot resurrect a session after reset.
- Full local verification is green: build_runner success, `flutter analyze` 0 errors, `flutter test` 351/351.

---
*Phase: 22-devices-settings-polish-5-days*
*Completed: 2026-11-28*

## Self-Check: PASSED
