---
phase: 18-foundation-auth-5-days
plan: 01b
type: execute
wave: 1
depends_on:
  - 18-01a
files_modified:
  - mobile/lib/core/api/endpoints.dart
  - mobile/lib/core/api/dio_client.dart
  - mobile/lib/core/api/auth_interceptor.dart
  - mobile/lib/core/storage/secure_storage.dart
  - mobile/lib/core/storage/token_store.dart
  - mobile/test/unit/core/storage/token_store_test.dart
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
    - Dio client attaches Authorization header from secure storage when tokens exist
    - TokenStore saves and retrieves JWT pair from flutter_secure_storage
    - Biometric read triggers Face ID/Touch ID/Android biometric prompt
    - TokenStore clears all tokens on logout
  artifacts:
    - mobile/lib/core/api/endpoints.dart (API path constants)
    - mobile/lib/core/api/dio_client.dart (configured Dio with baseUrl, timeouts, interceptors)
    - mobile/lib/core/api/auth_interceptor.dart (attaches Bearer token, handles 401→refresh→retry with request queue)
    - mobile/lib/core/storage/secure_storage.dart (singleton FlutterSecureStorage with Android/iOS options)
    - mobile/lib/core/storage/token_store.dart (CRUD for access/refresh tokens + userId, biometric read for access token)
    - Unit tests for token_store
  key_links:
    - DioClient → TokenStore (interceptor reads tokens on each request)
    - TokenStore → SecureStorage (platform-specific encryption)
    - AuthInterceptor → DioClient (refresh logic)

---

<objective>
Build the secure storage layer (TokenStore) and HTTP client (Dio + AuthInterceptor) that handle token persistence, biometric protection, and automatic token refresh.
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
@.planning/phases/18-foundation-auth-5-days/18-01a-PLAN.md
@mobile/lib/models/auth_models.dart
@mobile/lib/utils/logger.dart
</context>

<tasks>

<task type="tracer">
  <name>Tracer: DioClient → TokenStore → SecureStorage → biometric read → token persisted</name>
  <files>
    mobile/lib/core/api/endpoints.dart
    mobile/lib/core/api/dio_client.dart
    mobile/lib/core/api/auth_interceptor.dart
    mobile/lib/core/storage/secure_storage.dart
    mobile/lib/core/storage/token_store.dart
  </files>
  <action>
    Implement the secure storage and HTTP client vertical slice:

    1. **Endpoints** (`endpoints.dart`): Constants for all mobile API paths:
       - `/api/mobile/auth/login`, `/register`, `/refresh`
       - `/api/mobile/auth/telegram/nonce`, `/poll`
       - `/api/mobile/subscription`
       - `/api/mobile/servers`, `/keys/*`, `/payments/*`, `/devices/*`

    2. **SecureStorage wrapper** (`secure_storage.dart`): Singleton `FlutterSecureStorage` with:
       - Android: `AndroidOptions(encryptedSharedPreferences: true, enforceBiometrics: false, keyAlias: '3set_vpn_keys')`
       - iOS: `IOSOptions(accessibility: KeychainAccessibility.first_unlock_this_device, synchronizable: false)`
       - Biometric read options: `aOptions = AndroidOptions(..., requireBiometricsPerOperation: true)`

    3. **TokenStore** (`token_store.dart`): CRUD for tokens + userId:
       - `saveTokenPair(TokenPair tokens, int userId)` — writes access, refresh, userId atomically
       - `getAccessToken()` — reads with biometric options (triggers Face ID/Touch ID/Android biometric)
       - `getRefreshToken()` — reads without biometric (for refresh calls)
       - `getUserId()` — reads userId
       - `hasTokens()` — checks both access and refresh exist
       - `clearAll()` — deletes all three keys

    4. **DioClient** (`dio_client.dart`): Configured Dio instance:
       - `baseUrl: 'https://dash.3set.online'`
       - 15s connect / 30s receive timeouts
       - Adds interceptors: `AuthInterceptor` + `LoggingInterceptor` (debug only)

    5. **AuthInterceptor** (`auth_interceptor.dart`):
       - `onRequest`: attaches `Authorization: Bearer <accessToken>` from `TokenStore.getAccessToken()`
       - `onError 401`: single-flight refresh via `/api/mobile/auth/refresh` using `TokenStore.getRefreshToken()` → retry original request once
       - Queue concurrent 401s during refresh (`_isRefreshing` + `_waitingRequests` pattern from RESEARCH.md)
       - On refresh failure: `TokenStore.clearAll()` + throw to trigger logout

    6. **Unit tests**: `token_store_test.dart` — mock `FlutterSecureStorage`, test save/read/clear/hasTokens/biometric options.

    All code follows RESEARCH.md patterns exactly — no deviations.
  </action>
  <verify>
    <automated>cd mobile && flutter analyze && flutter test test/unit/core/storage/token_store_test.dart</automated>
  </verify>
  <done>
    DioClient configured with interceptors, TokenStore persists/retrieves tokens with biometric gate, AuthInterceptor handles 401→refresh→retry with request queue, unit tests pass.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Mobile App ↔ Backend API | Untrusted network (public internet); JWT in Authorization header |
| Mobile App ↔ Secure Storage | Trusted local boundary; Android Keystore / iOS Secure Enclave |
| DioClient ↔ AuthInterceptor | Trusted; internal token handling |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-18-02 | Tampering | Token storage | critical | mitigate | `flutter_secure_storage` uses hardware-backed encryption; biometric required on read |
| T-18-04 | Information Disclosure | JWT in memory | medium | mitigate | Access token 15min TTL; refresh token 30d but rotated on each use |
| T-18-05 | Denial of Service | Auth interceptor refresh loop | medium | mitigate | `_isRefreshing` gate + request queue; max 1 refresh at a time; exponential backoff |
| T-18-06 | Elevation of Privilege | Biometric bypass | high | mitigate | `enforceBiometrics: false` allows device passcode fallback |
</threat_model>

<verification>
- `flutter analyze` returns 0 errors, 0 warnings
- `flutter test test/unit/core/storage/token_store_test.dart` passes
- TokenStore.saveTokenPair + getAccessToken (biometric) + getRefreshToken + clearAll all work
- AuthInterceptor attaches Bearer token, handles 401 refresh queue correctly
</verification>

<success_criteria>
- TokenStore CRUD operations work with flutter_secure_storage
- Biometric read triggers system prompt (Face ID/Touch ID/Android)
- DioClient attaches Authorization header from TokenStore
- AuthInterceptor handles 401 with single-flight refresh and request queue
- Unit tests cover all TokenStore methods
</success_criteria>

<output>
Create `.planning/phases/18-foundation-auth-5-days/18-01b-SUMMARY.md` when done
</output>