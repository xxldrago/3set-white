---
phase: 18-foundation-auth-5-days
plan: 01a
type: execute
wave: 1
depends_on: []
files_modified:
  - mobile/pubspec.yaml
  - mobile/analysis_options.yaml
  - mobile/lib/main.dart
  - mobile/lib/app/router.dart
  - mobile/lib/app/theme.dart
  - mobile/lib/app/constants.dart
  - mobile/lib/models/auth_models.dart
  - mobile/lib/utils/logger.dart
  - mobile/lib/utils/jwt_utils.dart
  - mobile/test/unit/utils/jwt_utils_test.dart
autonomous: true
requirements:
  - REQ-AUTH-01
  - REQ-AUTH-04
  - REQ-BE-01

estimate:
  tokens: 18000
  raw_tokens: 9000
  tasks: 1
  confidence: high

must_haves:
  truths:
    - Flutter project compiles and runs on Android/iOS simulators
    - Freezed models generate JSON serialization without errors
    - JWT utils correctly parse expiry from tokens
    - App launches showing placeholder screen
  artifacts:
    - mobile/pubspec.yaml with all dependencies (flutter_riverpod, flutter_secure_storage, dio, app_links, connectivity_plus, logger, freezed_annotation, json_annotation, jwt_decoder, build_runner, freezed, json_serializable)
    - mobile/analysis_options.yaml with lint rules
    - mobile/lib/main.dart with ProviderScope and MaterialApp.router
    - mobile/lib/app/router.dart with GoRouter skeleton (routes: /auth, /register, /telegram-wait, /)
    - mobile/lib/app/theme.dart with Material 3 theme
    - mobile/lib/app/constants.dart (API base URL, storage keys)
    - mobile/lib/models/auth_models.dart (TokenPair, User, LoginRequest, RegisterRequest as freezed)
    - mobile/lib/utils/logger.dart (pino-style structured logger)
    - mobile/lib/utils/jwt_utils.dart (isExpired, isExpiringSoon, getExpiry)
    - Unit tests for jwt_utils
  key_links:
    - main.dart → ProviderScope → router.dart
    - auth_models.dart freezed classes used by all subsequent plans

---

<objective>
Create Flutter project scaffold with all dependencies, core models, utilities, and router skeleton — the foundation everything else builds on.
</objective>

<execution_context>
@/Users/alekseimikhalkin/.config/opencode/gsd-core/workflows/execute-plan.md
@/Users/alekseimikhalkin/.config/opencode/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/phases/18-foundation-auth-5-days/18-RESEARCH.md
</context>

<tasks>

<task type="tracer">
  <name>Tracer: flutter create → pub get → build_runner → app launches</name>
  <files>
    mobile/pubspec.yaml
    mobile/analysis_options.yaml
    mobile/lib/main.dart
    mobile/lib/app/router.dart
    mobile/lib/app/theme.dart
    mobile/lib/app/constants.dart
    mobile/lib/models/auth_models.dart
    mobile/lib/utils/logger.dart
    mobile/lib/utils/jwt_utils.dart
  </files>
  <action>
    Create the Flutter project and wire the minimal scaffold:

    1. **Project setup**: `flutter create --org com.3set --platforms=android,ios -i swift -a kotlin mobile` from repo root. Add all dependencies from RESEARCH.md Standard Stack:
       - `flutter_riverpod: ^3.4.2`
       - `flutter_secure_storage: ^11.2.0`
       - `dio: ^5.9.2`
       - `app_links: ^6.4.1`
       - `connectivity_plus: ^7.3.2`
       - `logger: ^2.7.0`
       - `go_router: ^15.1.0`
       - `freezed_annotation: ^3.0.0`
       - `json_annotation: ^4.9.0`
       - `jwt_decoder: ^1.0.1`
       - Dev: `build_runner: ^2.5.0`, `freezed: ^3.0.0`, `json_serializable: ^6.9.0`, `integration_test` (from SDK)
       Run `flutter pub get` and `flutter pub run build_runner build --delete-conflicting-outputs`.

    2. **Core models** (`auth_models.dart`): Define `TokenPair`, `User`, `LoginRequest`, `RegisterRequest` as freezed classes with JSON serialization. Include `copyWith`, `fromJson`/`toJson`.

    3. **Router skeleton** (`router.dart`): `GoRouter` with routes: `/auth`, `/register`, `/telegram-wait`, `/` (placeholder). Redirect logic stub.

    4. **Utils**: `jwt_utils.dart` (isExpired, isExpiringSoon, getExpiry using `jwt_decoder`), `logger.dart` (pino-style with levels).

    5. **Unit tests**: `jwt_utils_test.dart` — test expiry parsing with mock tokens.

    All code follows RESEARCH.md patterns exactly — no deviations.
  </action>
  <verify>
    <automated>cd mobile && flutter analyze && flutter pub run build_runner build --delete-conflicting-outputs && flutter test test/unit/utils/jwt_utils_test.dart</automated>
  </verify>
  <done>
    Flutter project compiles (analyze clean), build_runner generates freezed code, app launches on simulator showing placeholder, jwt_utils tests pass.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Mobile App ↔ Backend API | Untrusted network (public internet); JWT in Authorization header |
| Mobile App ↔ Secure Storage | Trusted local boundary; Android Keystore / iOS Secure Enclave |
| Mobile App ↔ Telegram Deep Link | External app (Telegram) launches app with nonce; nonce validated server-side |
| User ↔ Mobile App | Biometric authentication gate on resume |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-18-01 | Spoofing | Deep link handler | high | mitigate | Nonce validated server-side via `/telegram/poll`; nonce TTL 10min; consumed once |
| T-18-02 | Tampering | Token storage | critical | mitigate | `flutter_secure_storage` uses hardware-backed encryption; biometric required on read |
| T-18-03 | Repudiation | Auth state transitions | medium | mitigate | Structured logging (pino) on backend for login/refresh/telegram-bind; client logs via logger |
| T-18-04 | Information Disclosure | JWT in memory | medium | mitigate | Access token 15min TTL; refresh token 30d but rotated on each use; `credentialsChangedAt` watermark revokes old |
| T-18-05 | Denial of Service | Auth interceptor refresh loop | medium | mitigate | `_isRefreshing` gate + request queue; max 1 refresh at a time; exponential backoff on refresh failure |
| T-18-06 | Elevation of Privilege | Biometric bypass | high | mitigate | `enforceBiometrics: false` allows device passcode fallback; `credentialsChangedAt` revokes tokens on password change |
| T-18-SC | Supply Chain | flutter_secure_storage, dio, app_links, riverpod | high | mitigate | All packages verified in RESEARCH.md Package Legitimacy Audit (OK verdict); pinned versions in pubspec.yaml |
</threat_model>

<verification>
- `flutter analyze` returns 0 errors, 0 warnings
- `flutter test test/unit/utils/jwt_utils_test.dart` passes
- App cold launches to placeholder screen in <2s
- Freezed models generate without conflicts
</verification>

<success_criteria>
- Flutter project created with all dependencies resolved
- build_runner generates freezed/json_serializable code without conflicts
- App launches on Android emulator and iOS simulator
- JWT utils correctly parse token expiry
- Router has all 4 routes defined
</success_criteria>

<output>
Create `.planning/phases/18-foundation-auth-5-days/18-01a-SUMMARY.md` when done
</output>