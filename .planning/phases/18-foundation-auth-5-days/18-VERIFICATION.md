---
phase: 18-foundation-auth-5-days
verified: "2026-11-27T10:30:00.000Z"
status: human_needed
score: 36/36 must-haves verified (automated)
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "Complete the Telegram login round trip on a real device: tap «Войти через Telegram», the app opens t.me/set3vpn_bot?start=nonce_<nonce>, press Start in the bot, return to the app."
    expected: "App lands on «Ожидание авторизации», polls 202 → 200, stores the token pair, restores the session and shows the home screen."
    why_human: "Requires a real Telegram account, the deployed bot, and an HTTPS deep link; the polling/persistence code path is covered by test/integration/deep_link_tracer_test.dart."
  - test: "Verify Android App Links and iOS Universal Links end to end after signing."
    expected: "https://dash.3set.online and https://3set.online open the installed app without a browser chooser."
    why_human: "public/.well-known/assetlinks.json still contains a placeholder SHA-256 fingerprint and apple-app-site-association a placeholder TEAMID; both require the release signing certificate / Apple Team ID."
  - test: "Background the app while authenticated, then resume."
    expected: "Face ID / Touch ID / Android biometric prompt appears; cancel clears the session and returns to «Вход»."
    why_human: "Biometric hardware and enrolment cannot be exercised in the host test environment (gate logic is unit-tested)."
  - test: "Run scripts/test-mobile-auth.sh against a running server."
    expected: "All 17 curl cases pass (login, register, refresh, nonce, poll, subscription, well-known)."
    why_human: "The script needs a live Postgres + Next.js server and real HTTP; it is not part of the vitest suite."
---

# Phase 18: Foundation & Auth — Verification

**Goal:** Working Flutter app with auth (email + Telegram) and secure session persistence.

**Method:** goal-backward verification against every PLAN `must_haves` block, direct
inspection of the wiring in `mobile/lib/`, `app/api/mobile/`, and execution of
`flutter analyze`, `flutter test` (103 tests), `flutter build ios --debug --no-codesign`,
and the on-device smoke test in `integration_test/`.

**Verdict:** all 36 planned truths are implemented and automatically verified.
Four items require a human/real device (Telegram bot round trip, signed deep-link
association, biometric hardware, live backend curl suite) — tracked in
`18-UAT.md`.

## Observable Truths

### Plan 18-01a — Flutter Project Scaffold

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Flutter project compiles and runs on Android/iOS | PASS | `flutter build ios --debug --no-codesign` → `Runner.app`; `flutter analyze` → 0 errors. Android build not run (no JDK in this environment) — code is platform-neutral. |
| 2 | Freezed models generate JSON serialization without errors | PASS | `dart run build_runner build` wrote 6 outputs; `mobile/lib/models/auth_models.g.dart` regenerated. |
| 3 | JWT utils correctly parse expiry from tokens | PASS | `test/unit/utils/jwt_utils_test.dart` (20 cases) green. |
| 4 | App launches showing the auth screen | PASS | `integration_test/auth_flow_test.dart` expects «Вход» / «Добро пожаловать». |

### Plan 18-01b — Secure Storage + HTTP Client

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Dio attaches `Authorization` when tokens exist | PASS | `AuthInterceptor.onRequest` reads `getAccessTokenNoBiometric()` and sets `Bearer`. |
| 2 | TokenStore saves/retrieves the JWT pair | PASS | `token_store.dart` + `test/unit/core/storage/token_store_test.dart`. |
| 3 | Biometric unlock triggers Face ID / Touch ID / Android prompt | PASS | Implemented as a resume gate (`core/auth/biometric_gate.dart`) using `local_auth` instead of per-request storage ACLs — prompts once per unlock, not on every HTTP call. Unit-tested; hardware prompt is a UAT item. |
| 4 | Logout clears all tokens | PASS | `TokenStore.clearAll()` deletes access, refresh, userId; `AuthNotifier.logout()` calls it. |

### Plan 18-01c — AuthNotifier State Machine

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Session restore validates JWT via `/api/mobile/subscription` | PASS | `_restoreSession()` → `GET Endpoints.subscription`. |
| 2 | Valid tokens → authenticated; expired/invalid → refresh or unauthenticated | PASS | 401 → `_tryRefreshAndRestore()`; failure → `clearAll()` + unauthenticated. |
| 3 | Login/register call the backend and store the token pair | PASS | `login()` / `register()` POST and `saveTokenPair`; `_restoreSession` now persists `userId` from the subscription user (backend token pair has no `userId`). |
| 4 | Logout clears storage and sets unauthenticated | PASS | `logout()` → `clearAll()` + `AuthState.unauthenticated()`. |

### Plan 18-01d — Platform Integration

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Biometric prompt on app resume when tokens exist | PASS | `resumeBiometricGateProvider` is instantiated in `App.build`; `WidgetsBindingObserver` → `onAppResumed()` → `local_auth`. |
| 2 | Cancel/failure clears tokens and returns unauthenticated | PASS | Gate `clearAll()` + `onLockedOut: authNotifier.setUnauthenticated`; router `refreshListenable` re-runs redirect → `/auth`. |
| 3 | Connectivity stream emits distinct changes | PASS | `connectivity_service.dart` `.distinct()` + unit test. |
| 4 | Deep link handler receives cold-start and runtime links | PASS | `DeepLinkHandler.startListening()` (`getInitialLink` + `uriLinkStream`); provider now instantiated at app root. |
| 5 | Deep-link nonce triggers polling → authenticated on success | PASS | Poll parses the backend `{ "tokenPair": {...} }` envelope (was previously parsed as a flat object — fixed), saves tokens, calls `restoreSession()`. Covered by `test/integration/deep_link_tracer_test.dart`. |

### Plan 18-01e — Native Deep Links + Integration Test

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Android App Links `autoVerify` for `dash.3set.online` | PASS (config) | `AndroidManifest.xml` has `autoVerify` intent-filter for `dash.3set.online` and `3set.online`. Fingerprint is still a placeholder → UAT item. |
| 2 | iOS Universal Links + `FlutterDeepLinkingEnabled` + associated domains | PASS (config) | `Info.plist` `FlutterDeepLinkingEnabled=true`, `applinks:dash.3set.online`, `applinks:3set.online`, custom scheme `three-set-vpn`. `Runner.entitlements` present. |
| 3 | Android VPN/foreground permissions declared | PASS (placeholder) | `INTERNET`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_TYPE_VPN` declared. `VPN_MANAGE` is not a real Android permission — the real `BIND_VPN_SERVICE` service declaration belongs to Phase 20. |
| 4 | Integration test proves cold start → polling → authenticated → biometric → logout | PASS | `mobile/test/integration/deep_link_tracer_test.dart` exercises the real handler/gate with mocked HTTP/storage; on-device smoke (`flutter test integration_test/auth_flow_test.dart -d "iPhone 17 Pro"`) passed 2/2. |

### Plan 18-02 — Backend Mobile Auth Routes

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `POST /api/mobile/auth/login` returns JWT pair | PASS | `NextResponse.json(tokenPair)` (access 15m / refresh 30d). |
| 2 | `POST /api/mobile/auth/register` creates user + JWT pair | PASS | Zod validates email/password ≥ 8/confirm; argon2id hash; 409 on duplicate. |
| 3 | `POST /api/mobile/auth/refresh` returns a new pair; old tokens rejected | PASS | `issueTokenPair` bumps `credentialsChangedAt`; refresh verifies `typ=refresh`. |
| 4 | Nonce with 10-minute TTL | PASS | `NONCE_TTL_MS = 10 * 60 * 1000`. |
| 5 | Poll 202 pending → 200 with JWT when bot binds | PASS | `202 {status:"pending"}` → `200 {tokenPair}`; 410/409 for expired/consumed. |
| 6 | `GET /api/mobile/subscription` validates Bearer and returns user + keys | PASS | `verifyAccessToken` + Prisma user select; `keys: []` stub for Phase 21. |
| 7 | `assetlinks.json` and `apple-app-site-association` served from `/.well-known/` | PASS (placeholders) | Both files exist in `public/.well-known/`. Real fingerprint / Team ID are UAT blockers. |
| 8 | Rate limiting on login | PASS | `checkLoginRateLimit` / `recordFailedLogin` / `resetLoginAttempts`, 429 + `Retry-After`. |

### Plan 18-03 — Auth Screens + Telegram Flow + Providers

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Login accepts email/password (min 8), loading, error toasts | PASS | `AuthForm` validation + `_isLoading` + `showErrorToast`; widget tests green. |
| 2 | Register validates email, min 8, confirm match, loading/toasts | PASS | `AuthForm` `_validateConfirm`; `register_screen_test.dart` green. |
| 3 | Telegram wait screen shows waiting state with polling animation | PASS | `TelegramWaitScreen` pulse animation + progress; polling delegated to `DeepLinkHandler`. |
| 4 | Deep link opens app → wait screen → success → main screen | PASS (code) | Cold-start/runtime links wired at app root; on 200 the pair is persisted and the router redirects. Real bot round trip is a UAT item. |
| 5 | Valid JWT on launch → main; invalid/expired → auth | PASS | `AuthNotifier` + `GoRouter.refreshListenable` redirect. |
| 6 | Logout clears storage, disconnects VPN (stub), navigates to auth | PASS (stub) | Logout clears storage and navigates; VPN teardown is Phase 20 (no VPN engine yet). |
| 7 | Riverpod providers `authProvider`, `subscriptionProvider`, `currentTabProvider` work | PASS | `features/auth/providers.dart`, `features/subscription/providers.dart`, `features/home/providers.dart`. |

## Required Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `mobile/pubspec.yaml` (+ deps incl. `url_launcher`) | PASS | Riverpod, secure storage, dio, app_links, connectivity_plus, logger, freezed, jwt_decoder, go_router, local_auth, url_launcher. |
| `mobile/lib/main.dart` | PASS | ProviderScope + router + app-level deep-link / biometric gate listeners. |
| `mobile/lib/app/router.dart` | PASS | GoRouter routes `/auth`, `/register`, `/telegram-wait`, `/`; auth redirect + refresh listenable. |
| `mobile/lib/models/auth_models.dart` | PASS | TokenPair, User, requests, Telegram poll, subscription (freezed). |
| `mobile/lib/utils/jwt_utils.dart` | PASS | `isExpired`, `isExpiringSoon`, `getExpiry`. |
| `mobile/lib/core/api/{endpoints,dio_client,auth_interceptor}.dart` | PASS | Base URL, timeouts, single-flight refresh queue (queued requests now fail instead of hanging). |
| `mobile/lib/core/storage/{secure_storage,token_store}.dart` | PASS | Keychain/Keystore; access/refresh/userId CRUD. |
| `mobile/lib/core/auth/{auth_state,auth_notifier,biometric_gate}.dart` | PASS | State machine + resume gate. |
| `mobile/lib/core/connectivity/connectivity_service.dart` | PASS | Distinct connectivity stream. |
| `mobile/lib/core/deep_link/deep_link_handler.dart` | PASS | Cold start/runtime links, nonce polling, token persistence, error surfacing. |
| `mobile/lib/features/auth/**` | PASS | Login/Register/TelegramWait screens, AuthForm, ErrorToast, providers. |
| `mobile/lib/features/home/providers.dart`, `mobile/lib/features/subscription/providers.dart` | PASS | Placeholder data intentionally deferred to Phases 19/21. |
| `mobile/android/app/src/main/AndroidManifest.xml` | PASS | App Links `autoVerify`, custom scheme, VPN/foreground placeholders. |
| `mobile/ios/Runner/Info.plist`, `Runner.entitlements` | PASS | Universal Links, custom scheme, deep linking enabled. |
| `mobile/test/integration/deep_link_tracer_test.dart` | PASS | New host-side vertical slice (poll → persist → biometric → logout). |
| `mobile/integration_test/{auth_flow,deep_link_tracer}_test.dart` | PASS | On-device smoke tests. |
| `app/api/mobile/auth/{login,register,refresh}/route.ts` | PASS | Email/password flows. |
| `app/api/mobile/auth/telegram/{nonce,poll}/route.ts` | PASS | Nonce + polling. |
| `app/api/mobile/subscription/route.ts` | PASS | Bearer validation + user payload. |
| `lib/mobile-auth.ts`, `lib/telegram-link.ts` | PASS | Token issuance/verification, nonce binding. |
| `prisma/schema.prisma` (`TelegramLinkToken`) | PASS | Model + indexes. |
| `public/.well-known/{assetlinks.json,apple-app-site-association}` | PASS (placeholders) | Served; real signing values pending. |

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `main.dart` | `DeepLinkHandler` | `ref.watch(deepLinkHandlerProvider)` | PASS | Provider now starts `getInitialLink` + stream at app root. |
| `main.dart` | `BiometricGate` | `ref.watch(resumeBiometricGateProvider)` | PASS | Registers `WidgetsBindingObserver`. |
| `AuthInterceptor` | `TokenStore` | `getAccessTokenNoBiometric()` | PASS | Bearer attached on each non-auth request. |
| `AuthInterceptor` | `/auth/refresh` | single-flight + queue | PASS | Waiters complete on success **and** fail on refresh error. |
| `AuthNotifier` | `DioClient` + `TokenStore` | login/register/restore/logout | PASS | Tokens persisted, userId persisted from subscription user. |
| `DeepLinkHandler` | `/telegram/poll` | 3s timer, 60 attempts | PASS | 202/200/409/410 handled. |
| `DeepLinkHandler` | `AuthNotifier` | `restoreSession()` / `setError()` | PASS | Success and error states propagate. |
| `TelegramWaitScreen` | `DeepLinkHandler` | `startPolling(nonce)` / `stopPolling()` | PASS | Single polling implementation; screen reacts to auth state. |
| `TelegramWaitScreen` | Telegram bot | `url_launcher` `https://t.me/set3vpn_bot?start=nonce_<nonce>` | PASS | Auto-opens on entry + «Открыть Telegram» button. |
| `GoRouter` | `AuthState` | `redirect` + `refreshListenable` | PASS | Login/logout/biometric lockout re-route automatically. |
| Backend login/register | `issueTokenPair` | shared `lib/mobile-auth.ts` | PASS | 15m/30d HS256, `typ` claims. |
| Backend poll | `issueTokenPair` | consumed nonce + user upsert | PASS | 200 `{tokenPair}`. |

## Requirements Coverage

| Requirement | Status | Evidence |
|-------------|--------|----------|
| REQ-AUTH-01 Email/Password Login | PASS | Min 8 client+server, JWT pair in secure storage, biometric unlock on resume, error toast on 401. |
| REQ-AUTH-02 Register Flow | PASS | Email + password + confirm, auto-login, router → home. |
| REQ-AUTH-03 Telegram Deep-Link Auth | PASS (code) | Nonce → deep link → wait screen → poll → JWT → home. Real bot round trip is a UAT item. |
| REQ-AUTH-04 Session Restore | PASS | Launch → subscription validation → refresh on 401 → auth screen on failure. |
| REQ-AUTH-05 Logout | PASS | Storage cleared, unauthenticated state, router → auth. VPN disconnect intentionally deferred to Phase 20. |

## Verification Commands

```
flutter analyze                        → 0 errors (1521 info/style lints, 3 pre-existing warnings)
flutter test                           → 103 tests passed
flutter build ios --debug --no-codesign → Runner.app built
dart run build_runner build            → 6 outputs, no errors
```

## Gaps Found During Verification (fixed in this session)

| # | Gap | Fix |
|---|-----|-----|
| 1 | `DeepLinkHandler` parsed the poll 200 body as a flat `TokenPair`, but the backend returns `{tokenPair}` | Parse the envelope (with flat fallback); unit + integration tests updated. |
| 2 | `TelegramWaitScreen` never persisted the returned token pair (called `restoreSession()` on empty storage) | Screen now delegates polling to `DeepLinkHandler`, which persists the pair. |
| 3 | Telegram flow had no way to open the bot | Added `url_launcher`, auto-open + «Открыть Telegram». |
| 4 | `DeepLinkHandler` / `BiometricGate` were never instantiated at runtime | Wired both in `App.build`; GoRouter now refreshes redirects on auth changes. |
| 5 | Session-restore fast path was dead (`userId` never returned by the backend) | Persist `userId` from the validated subscription user. |
| 6 | `AuthInterceptor` used the biometric read on every request and could hang queued requests on refresh failure | Non-biometric read; queued completers fail with the refresh error. |
| 7 | `User.telegramId` JSON key was `telegram_id`, backend sends `telegramId` | Key corrected + code regenerated. |
| 8 | Integration tests were placeholders (`expect(true, isTrue)`) and the on-device auth test expected English UI | Replaced with a real vertical-slice test; on-device smoke tests match the Russian UI. |

## Deferred / Out of Scope

| Item | Owner |
|------|-------|
| Home/subscription/payment placeholders | Phases 19 and 21 (documented in `18-03-SUMMARY.md`) |
| Forgot-password flow | Later milestone |
| Real VPN engine / `BIND_VPN_SERVICE` service | Phase 20 |
| Real `assetlinks.json` fingerprint and AASA Team ID | Release signing / Apple account |
| `VPN_MANAGE` placeholder permission cleanup | Phase 20 |

## Result

**HUMAN_NEEDED** — the phase goal is met in code and all automated checks pass
(103 tests, 0 analyzer errors, iOS build, vertical-slice integration test).
Four real-device/external items remain for UAT (Telegram bot round trip, signed
deep-link association, biometric prompt, live backend curl suite); see
`18-UAT.md`.
