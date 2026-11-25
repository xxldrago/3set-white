---
phase: 18-foundation-auth-5-days
plan: 01c
subsystem: mobile-auth
tags:
  - auth
  - riverpod
  - freezed
  - dio
dependency_graph:
  requires:
    - 18-01b
  provides:
    - AuthState
    - AuthNotifier
  affects:
    - mobile/lib/core/auth/
    - mobile/test/unit/core/auth/
tech_stack:
  added:
    - flutter_riverpod: ^3.4.2
    - freezed_annotation: ^3.1.0
    - json_annotation: ^4.12.0
  patterns:
    - AsyncNotifierProvider for auth state management
    - Freezed sealed classes for state variants
    - Mocktail for unit testing with Riverpod ProviderContainer
key_files:
  created:
    - mobile/lib/core/auth/auth_state.dart
    - mobile/lib/core/auth/auth_notifier.dart
    - mobile/test/unit/core/auth/auth_notifier_test.dart
  modified: []
decisions:
  - "AuthNotifier uses AsyncNotifierProvider for async session restore on app launch"
  - "Session restore validates stored tokens via /api/mobile/subscription endpoint"
  - "On 401 during restore, attempts token refresh via /api/mobile/auth/refresh"
  - "Login/Register save tokens then call build() to re-trigger session restore"
  - "Unit tests use ProviderContainer with overridden providers for isolation"
  - "Telegram auth nonce endpoint stubbed for Plan 01d deep link integration"
metrics:
  duration: "2.5 hours"
  completed_date: "2026-11-25"
  tasks_completed: 1
  files_created: 3
  lines_added: 619
status: complete
actuals:
  tokens: 25000
  tasks: 1
  commits: 1
---

# Phase 18 Plan 01c: AuthNotifier State Machine Summary

## One-Liner
AuthNotifier state machine with session restore, login, register, logout — central auth logic connecting Flutter UI to backend APIs.

## Completed Tasks

### Task 1: AuthNotifier Implementation (Tracer)
**Files Created:**
- `mobile/lib/core/auth/auth_state.dart` — Freezed sealed class with 4 variants: `unauthenticated`, `authenticated(TokenPair, User)`, `loading`, `error(String)`
- `mobile/lib/core/auth/auth_notifier.dart` — `AsyncNotifierProvider<AuthNotifier, AuthState>` with full session restore and auth methods
- `mobile/test/unit/core/auth/auth_notifier_test.dart` — 10 unit tests covering all state transitions

**Key Implementation Details:**
- **Session Restore (`build()`):** Checks `TokenStore.hasTokens()` → if false returns `unauthenticated()` → else calls `GET /api/mobile/subscription` with Bearer token → on 200 returns `authenticated()` → on 401 tries `POST /api/mobile/auth/refresh` → validates new token via subscription → on failure clears storage and returns `unauthenticated()`
- **Login/Register:** Call respective backend endpoints, save token pair via `TokenStore.saveTokenPair()`, then call `build()` to re-validate via session restore
- **Logout:** Calls `TokenStore.clearAll()` and sets `unauthenticated()` state
- **Telegram Auth:** Calls `POST /api/mobile/auth/telegram/nonce` for deep link flow (Plan 01d)

## Verification Results

| Check | Result |
|-------|--------|
| `flutter analyze` | 0 errors, 0 warnings (only style infos) |
| `flutter test test/unit/core/auth/auth_notifier_test.dart` | 10/10 tests pass |
| `flutter test` (all) | 44/44 tests pass |
| `flutter pub run build_runner build` | Success, 0 outputs |

## Test Coverage

| Test Group | Tests | Scenarios |
|------------|-------|-----------|
| build (session restore) | 1 | No tokens → unauthenticated |
| login | 3 | Success → authenticated, 401 → error, 429 → error |
| register | 2 | Success → authenticated, 409 → error |
| logout | 1 | Clears storage → unauthenticated |
| startTelegramAuth | 2 | Success returns nonce, failure returns null |

## Deviations from Plan

None — implementation follows RESEARCH.md and PLAN.md exactly.

## Threat Flags

None — no new security-relevant surface introduced beyond what was modeled in PLAN.md threat model (T-18-03, T-18-04, T-18-05).

## Next Steps

Plan 18-01d: DeepLinkHandler + AppRouter — handle Telegram login deep links and route management.