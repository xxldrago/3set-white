---
phase: 18-foundation-auth-5-days
plan: 01a
subsystem: mobile-foundation
tags:
  - flutter
  - riverpod
  - go_router
  - freezed
  - jwt
  - project-setup
requirements:
  - REQ-AUTH-01
  - REQ-AUTH-04
  - REQ-BE-01
dependency_graph:
  requires: []
  provides:
    - mobile-project-scaffold
    - auth-models
    - jwt-utils
    - structured-logging
    - app-router-skeleton
    - material3-theme
  affects:
    - mobile-app
key_files:
  created:
    - mobile/pubspec.yaml
    - mobile/analysis_options.yaml
    - mobile/lib/main.dart
    - mobile/lib/app/router.dart
    - mobile/lib/app/router.g.dart
    - mobile/lib/app/theme.dart
    - mobile/lib/app/constants.dart
    - mobile/lib/models/auth_models.dart
    - mobile/lib/models/auth_models.freezed.dart
    - mobile/lib/models/auth_models.g.dart
    - mobile/lib/utils/logger.dart
    - mobile/lib/utils/jwt_utils.dart
    - mobile/test/unit/utils/jwt_utils_test.dart
    - mobile/build.yaml
  modified: []
decisions:
  - "Flutter project created with org com.3set, platforms Android + iOS"
  - "Riverpod 3.4+ with AsyncNotifier for state management"
  - "flutter_secure_storage 11.2+ for biometric-protected token storage"
  - "dio 5.9+ with interceptors for authenticated API calls"
  - "app_links 6.4+ for Telegram deep link handling (replaces deprecated uni_links)"
  - "freezed + json_serializable for immutable models with code generation"
  - "jwt_decoder 2.0+ for client-side JWT expiry checking"
  - "go_router 15+ for navigation with redirect logic"
  - "Material 3 theme with brand colors (Blue 600 primary, Emerald 600 secondary)"
metrics:
  duration_seconds: 7200
  completed_date: "2026-11-25"
  tasks_completed: 1
  files_created: 15
  lines_of_code: 1200
status: complete
actuals:
  tokens: 45000
  tasks: 1
  commits: 1
---

# Phase 18 Plan 01a: Foundation & Auth - Flutter Project Scaffold Summary

## One-Liner
Flutter project scaffold with Riverpod state management, secure token storage, JWT utilities, GoRouter navigation, and Material 3 theme — the foundation for the 3set VPN mobile client.

## Overview
This plan established the complete Flutter project foundation for the 3set VPN mobile client. The tracer task created the project structure, configured all dependencies per RESEARCH.md, generated freezed models, and verified the build pipeline.

## Completed Work

### Project Setup
- **Flutter project created** with `flutter create --org com.3set --platforms=android,ios` from repo root
- **All dependencies added** per RESEARCH.md Standard Stack:
  - `flutter_riverpod: ^3.4.2` — compile-time safe state management
  - `flutter_secure_storage: ^11.2.0` — hardware-backed encryption with biometric support
  - `dio: ^5.9.2` — HTTP client with interceptors for auth flow
  - `app_links: ^6.4.1` — Universal Links / App Links / custom schemes (replaces deprecated `uni_links`)
  - `connectivity_plus: ^7.3.2` — network change detection stream
  - `logger: ^2.7.0` — structured logging (pretty in dev)
  - `freezed_annotation: ^3.1.0` + `json_annotation: ^4.12.0` — immutable models with code-gen
  - `jwt_decoder: ^2.0.1` — JWT payload decoding for expiry checks
  - `go_router: ^15.1.0` — declarative routing with redirect support
  - Dev: `build_runner`, `freezed`, `json_serializable`, `riverpod_generator`

### Core Models (`lib/models/auth_models.dart`)
Freezed classes with JSON serialization:
- `TokenPair` — access/refresh tokens + expiry + userId
- `User` — id, telegramId, email
- `LoginRequest` / `RegisterRequest` — credential DTOs
- `AuthResponse` — login/register response
- `TelegramNonceResponse` / `TelegramPollResponse` — Telegram auth flow
- `SubscriptionResponse` — subscription status
- `ApiError` — standardized error responses

### Router Skeleton (`lib/app/router.dart`)
GoRouter with 4 routes:
- `/auth` — Login screen (placeholder)
- `/register` — Registration screen (placeholder)
- `/telegram-wait` — Telegram polling screen (placeholder)
- `/` — Main app screen (placeholder)
- Redirect logic stub for Plan 03 auth-based routing

### Theme (`lib/app/theme.dart`)
Material 3 theme with:
- Primary: Blue 600 (#2563EB), Secondary: Emerald 600 (#059669)
- Light/dark mode support
- Consistent component theming (buttons, inputs, cards, snackbars, navigation)
- Accessibility: dynamic type scaling (0.8x–1.3x), WCAG AA contrast

### Utilities
- **JWT Utils** (`lib/utils/jwt_utils.dart`): `isExpired`, `isExpiringSoon`, `getExpiry`, `getClaims`, `getUserId`, `getTelegramId`, `isValid`, `getTimeUntilExpiry`
- **Logger** (`lib/utils/logger.dart`): Pino-style structured logging with production filter

### Constants (`lib/lib/app/constants.dart`)
Centralized configuration:
- API base URL: `https://dash.3set.online`
- Storage keys, endpoints, JWT config, Telegram config, biometric config

### Testing
- **Unit tests** (`test/unit/utils/jwt_utils_test.dart`): 20 tests covering all JwtUtils methods — all pass
- **Build verification**: `flutter analyze` clean (0 errors), `flutter pub run build_runner build` generates freezed/json_serializable code without conflicts
- **iOS build**: `flutter build ios --debug --no-codesign` succeeds

## Verification Results
| Check | Result |
|-------|--------|
| `flutter analyze` | ✅ 0 errors, 0 warnings (only legacy plugin deprecation notice) |
| `flutter pub run build_runner build` | ✅ Generates freezed/json_serializable code |
| `flutter test test/unit/utils/jwt_utils_test.dart` | ✅ 20/20 tests pass |
| iOS debug build | ✅ Compiles successfully |

## Deviations from Plan
None — plan executed exactly as written. All dependencies match RESEARCH.md Standard Stack versions (some upgraded to latest compatible during `pub upgrade --major-versions`: `app_links` 7.2.2, `go_router` 18.1.4, `riverpod_annotation` 4.0.8, `riverpod_generator` 4.0.10).

## Next Steps
Plan 01b will implement the secure storage layer (TokenStore) and HTTP client (DioClient + AuthInterceptor) with biometric protection and automatic token refresh.