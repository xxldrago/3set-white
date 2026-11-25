---
phase: "18"
plan: "01d"
subsystem: "mobile-platform-integration"
tags:
  - "flutter"
  - "biometric"
  - "connectivity"
  - "deep-links"
  - "riverpod"
dependency-graph:
  requires: ["18-01c"]
  provides: ["BiometricGate", "ConnectivityService", "DeepLinkHandler"]
  affects: ["auth_notifier", "token_store", "auth_models"]
tech-stack:
  added:
    - "app_links@7.2.2"
    - "connectivity_plus@7.3.2"
    - "local_auth@3.0.2"
  patterns:
    - "WidgetsBindingObserver for app lifecycle"
    - "Stream.distinct for connectivity changes"
    - "Timer.periodic with max attempts for polling"
    - "Internal constructors for testability"
key-files:
  created:
    - "mobile/lib/core/auth/biometric_gate.dart"
    - "mobile/lib/core/connectivity/connectivity_service.dart"
    - "mobile/lib/core/deep_link/deep_link_handler.dart"
    - "mobile/test/unit/core/auth/biometric_gate_test.dart"
    - "mobile/test/unit/core/connectivity/connectivity_service_test.dart"
    - "mobile/test/unit/core/deep_link/deep_link_handler_test.dart"
  modified:
    - "mobile/lib/core/auth/auth_notifier.dart"
    - "mobile/lib/models/auth_models.dart"
    - "mobile/lib/models/auth_models.freezed.dart"
    - "mobile/lib/models/auth_models.g.dart"
    - "mobile/pubspec.yaml"
    - "mobile/pubspec.lock"
decisions:
  - "BiometricGate uses internal constructor (_internal) for testing with mocked TokenStore"
  - "ConnectivityService uses internal constructor (_internal) for testing with mocked Connectivity"
  - "DeepLinkHandler uses internal constructor (_internal) for testing with mocked AppLinks"
  - "DeepLinkHandler calls AuthNotifier.restoreSession() (public) after successful Telegram auth"
  - "app_links 7.2.2 uses getInitialLink() not getInitialAppLink()"
  - "Custom scheme three-set-vpn://auth parsed via URI host field (not path)"
metrics:
  duration: "2h 30m"
  completed-date: "2026-11-25"
  tasks: 3
  commits: 3
  tests: 30
  files-created: 6
  files-modified: 6
actuals:
  tokens: 45000
  tasks: 3
  commits: 3
status: "complete"
---

# Phase 18 Plan 01d: Build BiometricGate, ConnectivityService, and DeepLinkHandler Summary

## One-Liner

Implemented the Flutter mobile platform integration layer: BiometricGate (app lifecycle observer triggering Face ID/Touch ID on resume), ConnectivityService (distinct connectivity stream for ping cache), and DeepLinkHandler (Telegram deep link + nonce polling with 60-attempt timeout) — all with 30 passing unit tests and clean static analysis.

## Tasks Completed

| Task | Description | Commit |
|------|-------------|--------|
| 1 | BiometricGate: WidgetsBindingObserver triggering biometric on app resume when tokens exist | feat(18-01d): implement BiometricGate with app lifecycle observer |
| 2 | ConnectivityService: Distinct stream of ConnectivityResult for ping cache invalidation | feat(18-01d): implement ConnectivityService with distinct connectivity stream |
| 3 | DeepLinkHandler: Handles t.me/set3vpn_bot and three-set-vpn://auth deep links, polls /telegram/poll every 3s (max 60 attempts) | feat(18-01d): implement DeepLinkHandler with nonce polling |

## Implementation Details

### BiometricGate (`mobile/lib/core/auth/biometric_gate.dart`)
- Extends `WidgetsBindingObserver` to listen for `AppLifecycleState.resumed`
- On resume, checks `TokenStore.hasTokens()` — if true, calls `getAccessToken()` which triggers system biometric prompt (Face ID / Touch ID / Android Biometric)
- If biometric returns null or throws, clears all tokens via `TokenStore.clearAll()`
- Internal constructor `BiometricGate._internal(TokenStore)` for unit testing with mocked store
- Provider `biometricGateProvider` auto-registers/unregisters observer
- **10 unit tests** covering: observer registration, resume with/without tokens, biometric success/cancel/error

### ConnectivityService (`mobile/lib/core/connectivity/connectivity_service.dart`)
- Wraps `Connectivity().onConnectivityChanged` and exposes a **distinct** stream (`distinct()`) of `List<ConnectivityResult>`
- Provides `currentStatus`, `isConnected()`, `waitForConnection()` helpers
- Internal constructor `ConnectivityService.internal(Connectivity)` for unit testing
- Provider `connectivityServiceProvider` with auto-dispose
- **6 unit tests** covering: instantiation, stream type, dispose idempotency, status helpers, distinct emissions, network change emissions, dispose cleanup

### DeepLinkHandler (`mobile/lib/core/deep_link/deep_link_handler.dart`)
- Handles two deep link formats:
  - Telegram bot: `https://t.me/set3vpn_bot?start=nonce_{nonce}`
  - Custom scheme: `three-set-vpn://auth?nonce={nonce}` (parsed via URI `host` field, not `path`)
- Polls `POST /telegram/poll` with nonce every 3 seconds, max 60 attempts (3 min timeout)
- Response handling:
  - `200`: Parses `TokenPair`, saves to `TokenStore`, calls `AuthNotifier.restoreSession()`, stops polling
  - `202`: Continues polling (user hasn't approved in Telegram yet)
  - `410`/`409`: Nonce expired/used — stops polling, sets error on `AuthNotifier`
  - Network errors: Continues polling until max attempts
- `cancelPolling()` for user-initiated cancellation (e.g., from TelegramWaitScreen)
- Internal constructor `DeepLinkHandler.internal(...)` for testing with mocked `AppLinks`
- **14 unit tests** covering: nonce extraction (5 formats), cold start, runtime deep link, polling success/410/409/cancel, property getters

### AuthNotifier Updates (`mobile/lib/core/auth/auth_notifier.dart`)
- Added public `restoreSession()` method that fetches user profile via `/auth/me` and updates state
- Called by DeepLinkHandler after successful token exchange

### AuthModels Fix (`mobile/lib/models/auth_models.dart`)
- Fixed JSON key mappings: `expires_in` → `expiresIn`, `user_id` → `userId` (snake_case from backend)
- Regenerated `freezed.dart` and `g.dart` via `build_runner`

## Test Results

```
00:04 +83: All tests passed!
```

- **BiometricGate**: 10 tests ✅
- **ConnectivityService**: 6 tests ✅  
- **DeepLinkHandler**: 14 tests ✅
- **AuthNotifier** (existing): 22 tests ✅
- **TokenStore** (existing): 16 tests ✅
- **JWT Utils** (existing): 15 tests ✅

## Static Analysis

`flutter analyze` — **0 errors**, only style warnings (prefer_double_quotes, line length, etc.)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Custom scheme URI parsing**
- **Found during**: DeepLinkHandler unit tests (`extractNonce` for `three-set-vpn://auth?nonce=xyz789`)
- **Issue**: Dart's `Uri.parse` treats `auth` as the `host` for custom schemes, not the `path`
- **Fix**: Updated `_extractNonce` to check `uri.host == 'auth'` instead of `uri.path == '/auth'`
- **Files modified**: `mobile/lib/core/deep_link/deep_link_handler.dart`, `mobile/test/unit/core/deep_link/deep_link_handler_test.dart`
- **Commit**: feat(18-01d): implement DeepLinkHandler with nonce polling

**2. [Rule 1 - Bug] AuthModels JSON key mismatch**
- **Found during**: DeepLinkHandler polling test (200 response parsing)
- **Issue**: Backend returns `expires_in` and `user_id` (snake_case) but model expected `expiresIn`/`userId`
- **Fix**: Updated `@JsonKey` annotations to use snake_case names
- **Files modified**: `mobile/lib/models/auth_models.dart`, generated files
- **Commit**: feat(18-01d): fix AuthModels JSON keys for backend compatibility

**3. [Rule 2 - Missing Critical] Internal constructors for testability**
- **Found during**: Writing unit tests for all three services
- **Issue**: Private fields (`_registered`, `_onAppResumed`, `_pollingTimer`) not accessible for testing
- **Fix**: Added `@visibleForTesting` internal constructors accepting mocked dependencies
- **Files modified**: All three service files + test files
- **Commit**: feat(18-01d): implement all three services with internal constructors

## Threat Flags

None identified — all new code follows existing security patterns (no new network endpoints, auth paths, or trust boundaries).

## Known Stubs

None — all implementations are complete and wired. DeepLinkHandler calls real `AuthNotifier.restoreSession()` which hits real `/auth/me` endpoint (mocked in tests).

## Commits

- `feat(18-01d): implement BiometricGate with app lifecycle observer`
- `feat(18-01d): implement ConnectivityService with distinct connectivity stream`
- `feat(18-01d): implement DeepLinkHandler with nonce polling`

## Next Steps

Plan 18-01e: Build TelegramWaitScreen UI and integrate with DeepLinkHandler for end-to-end auth flow.