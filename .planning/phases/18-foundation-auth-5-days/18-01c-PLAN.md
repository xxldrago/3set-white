---
phase: 18-foundation-auth-5-days
plan: 01c
type: execute
wave: 1
depends_on:
  - 18-01b
files_modified:
  - mobile/lib/core/auth/auth_state.dart
  - mobile/lib/core/auth/auth_notifier.dart
  - mobile/test/unit/core/auth/auth_notifier_test.dart
autonomous: true
requirements:
  - REQ-AUTH-01
  - REQ-AUTH-02
  - REQ-AUTH-04
  - REQ-AUTH-05
  - REQ-BE-01
  - REQ-BE-03

estimate:
  tokens: 16000
  raw_tokens: 8000
  tasks: 1
  confidence: high

must_haves:
  truths:
    - AuthNotifier restores session on launch by validating JWT via /api/mobile/subscription
    - Valid tokens → authenticated state; expired/invalid → unauthenticated state
    - Login and register methods call backend and store resulting token pair
    - Logout clears storage and sets unauthenticated state
  artifacts:
    - mobile/lib/core/auth/auth_state.dart (freezed AuthState: unauthenticated, authenticated, loading, error)
    - mobile/lib/core/auth/auth_notifier.dart (AsyncNotifierProvider with session restore, login, register, logout, startTelegramAuth)
    - Unit tests for auth_notifier
  key_links:
    - AuthNotifier → DioClient + TokenStore (session restore, login, register, logout)
    - AuthNotifier → auth_state.dart (state transitions)
    - Router (later) → AuthNotifier (redirect based on state)

---

<objective>
Build the AuthNotifier state machine with session restore, login, register, and logout — the central auth logic that connects UI to backend.
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
@.planning/phases/18-foundation-auth-5-days/18-01b-PLAN.md
@mobile/lib/core/api/dio_client.dart
@mobile/lib/core/storage/token_store.dart
@mobile/lib/models/auth_models.dart
</context>

<tasks>

<task type="tracer">
  <name>Tracer: AuthNotifier.build() → TokenStore.hasTokens → /subscription → authenticated/unauthenticated</name>
  <files>
    mobile/lib/core/auth/auth_state.dart
    mobile/lib/core/auth/auth_notifier.dart
  </files>
  <action>
    Implement the AuthNotifier with session restore and auth methods:

    1. **AuthState** (`auth_state.dart`): Freezed sealed class with:
       - `unauthenticated()`
       - `authenticated(TokenPair tokens, User user)`
       - `loading()`
       - `error(String message)`

    2. **AuthNotifier** (`auth_notifier.dart`): `AsyncNotifierProvider<AuthNotifier, AuthState>` with:
       - `build()`: **Session Restore** — `TokenStore.hasTokens()` → if false return `unauthenticated()` → else `GET /api/mobile/subscription` with Bearer token from TokenStore → if 200 return `authenticated(tokens, user)` → if 401 try `POST /api/mobile/auth/refresh` with refresh token → if refresh succeeds validate new token via subscription → else `TokenStore.clearAll()` return `unauthenticated()`
       - `login(email, password)`: `POST /api/mobile/auth/login` → on 200 `TokenStore.saveTokenPair()` → `build()` (triggers session restore) → return result
       - `register(email, password)`: `POST /api/mobile/auth/register` → on 200 `TokenStore.saveTokenPair()` → `build()` → return result
       - `logout()`: `TokenStore.clearAll()` → set `unauthenticated()`
       - `startTelegramAuth()`: stub for now, calls DeepLinkHandler (Plan 01d)

    3. **Unit tests**: `auth_notifier_test.dart` — mock DioClient and TokenStore, test:
       - build() restores session when valid tokens exist
       - build() returns unauthenticated when no tokens
       - build() tries refresh on 401, succeeds → authenticated
       - build() refresh fails → unauthenticated + storage cleared
       - login() saves tokens and triggers restore
       - register() saves tokens and triggers restore
       - logout() clears storage and sets unauthenticated

    All code follows RESEARCH.md patterns exactly — no deviations.
  </action>
  <verify>
    <automated>cd mobile && flutter analyze && flutter test test/unit/core/auth/auth_notifier_test.dart</automated>
  </verify>
  <done>
    AuthNotifier session restore validates JWT via /api/mobile/subscription, login/register save tokens and re-validate, logout clears storage, all unit tests pass with mocked dependencies.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| AuthNotifier ↔ DioClient | Trusted; token-authenticated API calls |
| AuthNotifier ↔ TokenStore | Trusted; secure storage operations |
| AuthNotifier ↔ Backend API | Untrusted network; TLS + JWT auth |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-18-03 | Repudiation | Auth state transitions | medium | mitigate | Structured logging on backend for login/refresh; client logs via logger |
| T-18-04 | Information Disclosure | JWT in memory | medium | mitigate | Short TTL (15m); not logged; cleared on logout |
| T-18-05 | Denial of Service | Auth interceptor refresh loop | medium | mitigate | Handled in AuthInterceptor (Plan 01b) |
</threat_model>

<verification>
- `flutter analyze` returns 0 errors, 0 warnings
- `flutter test test/unit/core/auth/auth_notifier_test.dart` all pass
- Session restore: valid tokens → authenticated, expired → refresh → authenticated, invalid → unauthenticated
- Login/Register: backend success → tokens stored → session restored → authenticated
- Logout: storage cleared → unauthenticated state
</verification>

<success_criteria>
- AuthState freezed class with all 4 variants
- AuthNotifier.build() performs complete session restore logic
- Login/Register/Logout methods work end-to-end with mocked backend
- Unit tests cover all state transitions
- No provider-not-found errors when used in widget tests
</success_criteria>

<output>
Create `.planning/phases/18-foundation-auth-5-days/18-01c-SUMMARY.md` when done
</output>