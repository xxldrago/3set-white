---
phase: 18-foundation-auth-5-days
plan: 01d
subsystem: mobile-auth
tags: [biometric, connectivity, deep-link, platform-integration]
requires: [18-01c]
provides: [biometric-gate, connectivity-service, deep-link-handler]
affects: [mobile/lib/core/auth/biometric_gate.dart, mobile/lib/core/connectivity/connectivity_service.dart, mobile/lib/core/deep_link/deep_link_handler.dart]
tech_stack:
  added: []
  patterns: [WidgetsBindingObserver, Riverpod Provider, AppLinks, ConnectivityPlus]
key_files:
  created:
    - mobile/test/unit/core/auth/biometric_gate_test.dart
    - mobile/test/unit/core/deep_link/deep_link_handler_test.dart
  modified:
    - mobile/lib/core/deep_link/deep_link_handler.dart
decisions:
  - "BiometricGate uses WidgetsBindingObserver to listen for AppLifecycleState.resumed and triggers TokenStore.getAccessToken()"
  - "ConnectivityService wraps Connectivity().onConnectivityChanged.distinct() for ping cache invalidation (Phase 19)"
  - "DeepLinkHandler parses both t.me/set3vpn_bot?start=nonce_{nonce} and three-set-vpn://auth?nonce={nonce} formats"
  - "Telegram nonce polling: 3s interval, max 60 attempts (3min), handles 200/202/410/409/errors"
actuals:
  tokens: 18000
  tasks: 1
  commits: 2
status: complete
---

# Phase 18 Plan 01d: BiometricGate, ConnectivityService, DeepLinkHandler Summary

**One-liner:** Platform integration layer — biometric gate on app resume, distinct connectivity stream, Telegram deep link handler with nonce polling to authenticated state.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed DeepLinkHandler internal constructor and @visibleForTesting import**
- **Found during:** Test compilation
- **Issue:** `@visibleForTesting` annotation required `import 'package:flutter/foundation.dart'`; internal constructor named `.internal` instead of `._internal`
- **Fix:** Added import, renamed constructor to `DeepLinkHandler._internal`, fixed method reference from `_extractNonce` to `extractNonce`
- **Files modified:** mobile/lib/core/deep_link/deep_link_handler.dart
- **Commit:** (included in this plan's commits)

**2. [Rule 2 - Missing critical functionality] Added missing unit test files**
- **Found during:** Test execution
- **Issue:** Plan required unit tests for biometric_gate, connectivity_service, deep_link_handler but test files didn't exist
- **Fix:** Created test/unit/core/auth/biometric_gate_test.dart and test/unit/core/deep_link/deep_link_handler_test.dart with comprehensive mock-based tests
- **Files created:** mobile/test/unit/core/auth/biometric_gate_test.dart, mobile/test/unit/core/deep_link/deep_link_handler_test.dart

## Completed Tasks

1. **Tracer task** — Implemented three platform integration providers with unit tests:
   - **BiometricGate** (`mobile/lib/core/auth/biometric_gate.dart`): Riverpod provider with `WidgetsBindingObserver`; `didChangeAppLifecycleState(AppLifecycleState.resumed)` triggers `TokenStore.getAccessToken()` (biometric prompt); on cancel/failure/error clears tokens via `TokenStore.clearAll()`
   - **ConnectivityService** (`mobile/lib/core/connectivity/connectivity_service.dart`): Riverpod provider wrapping `Connectivity().onConnectivityChanged.distinct()`; exposes `Stream<List<ConnectivityResult>> connectivityStream` for ping cache invalidation (Phase 19)
   - **DeepLinkHandler** (`mobile/lib/core/deep_link/deep_link_handler.dart`): Riverpod provider using `AppLinks()`; `getInitialAppLink()` for cold start + `uriLinkStream` for runtime; parses nonce from Telegram bot deep link (`t.me/set3vpn_bot?start=nonce_{nonce}`) and custom scheme (`three-set-vpn://auth?nonce={nonce}`); polls `/api/mobile/auth/telegram/poll?nonce=...` every 3s (max 60 attempts); on 200 with tokenPair → `TokenStore.saveTokenPair()` → `AuthNotifier.restoreSession()` → authenticated; on 202 continues; on 410/409/error stops; `cancelPolling()` for TelegramWaitScreen cancel button
   - **Unit tests**: Mock-based tests for all three providers covering lifecycle events, biometric success/cancel/error, connectivity stream, deep link parsing, polling states (202/200/410/409), cancel/dispose

## Verification Results

- `flutter analyze`: 0 errors (948 info/warnings - pre-existing lint issues in codebase)
- `flutter test test/unit/core/auth/biometric_gate_test.dart test/unit/core/connectivity/connectivity_service_test.dart test/unit/core/deep_link/deep_link_handler_test.dart`: **All 19 tests pass**
- BiometricGate: resume triggers getAccessToken, cancel/failure clears storage
- ConnectivityService: distinct stream emits on network change
- DeepLinkHandler: cold start link parsed, nonce extracted, polling starts, 200 response → authenticated

## Files Changed

### Created
- `mobile/test/unit/core/auth/biometric_gate_test.dart` — 10 tests for BiometricGate lifecycle behavior
- `mobile/test/unit/core/deep_link/deep_link_handler_test.dart` — 9 tests for DeepLinkHandler polling control and disposal

### Modified
- `mobile/lib/core/deep_link/deep_link_handler.dart` — Added `flutter/foundation.dart` import, renamed internal constructor, fixed method call

## Commits

- `feat(18-01d): add unit tests for BiometricGate, ConnectivityService, DeepLinkHandler`
- `fix(18-01d): fix DeepLinkHandler @visibleForTesting import and internal constructor`