# Phase 18: Foundation & Auth - Research

**Researched:** 2026-11-25
**Domain:** Flutter mobile app (Riverpod, biometric auth, deep links) + Next.js mobile auth API routes
**Confidence:** HIGH

## Summary

Phase 18 establishes the Flutter mobile client foundation with dual authentication (email/password + Telegram deep-link) and secure session persistence. The backend extends the existing Next.js App Router with `/api/mobile/auth/*` routes that issue JWT access tokens (15m) and refresh tokens (30d), validated against the existing Prisma User model and session infrastructure. The Flutter app uses Riverpod 3.x for state management, `flutter_secure_storage` 11.2+ for biometric-protected token storage, `dio` 5.9+ with interceptors for authenticated API calls, `app_links` 6.4+ (replacing deprecated `uni_links`) for Telegram deep-link handling, and `connectivity_plus` 7.3+ for network change detection.

**Primary recommendation:** Build the Flutter app as a separate module (`mobile/`) sharing the backend's Prisma schema and JWT secret via the existing Next.js API routes. Use `app_links` (not `uni_links`) for deep links. Implement a Dio interceptor that auto-attaches JWT and handles 401→refresh→retry transparently. Store both access and refresh tokens in `flutter_secure_storage` with `biometricAuth: true` on read (resume). The backend routes reuse the existing `lib/auth.ts` JWT signing (`signSession`) and `lib/session.ts` verification patterns, extended with a mobile-specific token pair response.

---

## User Constraints (from CONTEXT.md)

> No CONTEXT.md found for this phase. All decisions are at the agent's discretion.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Email/password registration | API / Backend | Flutter Client | Backend owns credential hashing (Argon2id), rate limiting, duplicate detection |
| Email/password login | API / Backend | Flutter Client | Backend verifies credentials, mints JWT pair, sets secure cookies |
| Telegram deep-link nonce exchange | API / Backend | Flutter Client + Telegram Bot | Backend issues nonce, bot binds it, Flutter polls for JWT |
| JWT issuance (access 15m / refresh 30d) | API / Backend | — | Server-only secret; tokens signed with `jose` HS256 |
| JWT validation on mobile | Flutter Client | API / Backend | Client validates expiry locally; calls `/api/mobile/subscription` for server-side validation |
| Secure token storage + biometric unlock | Flutter Client | — | `flutter_secure_storage` with Android Keystore / iOS Secure Enclave |
| Session restore on launch | Flutter Client | API / Backend | Client reads storage, validates via `/api/mobile/subscription` |
| Riverpod state management | Flutter Client | — | `authProvider`, `subscriptionProvider`, `currentTabProvider` |
| Network change detection | Flutter Client | — | `connectivity_plus` stream invalidates ping cache |
| VPN tunnel (out of scope this phase) | Flutter Client | — | libbox + VpnService / NEPacketTunnelProvider (later phases) |

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Flutter SDK | `^3.27` (stable channel) | Cross-platform mobile framework | Stable 3.27 supports Dart 3.6+, required for `app_links` 6.4+ |
| Dart SDK | `^3.6` | Language runtime | Bundled with Flutter 3.27 |
| Riverpod | `^3.4.2` (`flutter_riverpod: ^3.4.2`) | State management | Compile-time safety, no BuildContext, `AsyncNotifier` for auth flows |
| flutter_secure_storage | `^11.2.0` | Encrypted key-value storage with biometric auth | Android Keystore / iOS Secure Enclave; `requireBiometricsPerOperation` flag |
| dio | `^5.9.2` | HTTP client with interceptors | Global config, auth interceptors, token refresh retry logic |
| app_links | `^6.4.1` | Deep links (Universal Links / App Links / custom schemes) | Replaces deprecated `uni_links`; maintained by Flutter team |
| connectivity_plus | `^7.3.2` | Network connectivity stream (WiFi/LTE/offline) | Flutter Community maintained; invalidates ping cache on change |
| logger | `^2.7.0` | Structured logging (pretty in dev, JSON in prod) | ANSI colors, levels, filters; strips in release builds |
| freezed_annotation | `^3.1.0` | Immutable data models with `copyWith`, `fromJson`/`toJson` | Code-gen via `build_runner`; pairs with `json_serializable` |
| json_annotation | `^4.12.0` | JSON serialization annotations | Generates type-safe serialization |
| jwt_decoder | `^1.0.1` | JWT payload decoding (expiry check without crypto) | Lightweight; no signature verification needed client-side |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| local_auth | `^3.0.1` | Biometric prompt UI (Face ID, Touch ID, fingerprint) | If custom biometric UI needed beyond `flutter_secure_storage` built-in |
| retrofit | `^4.4.0` | Dio-based REST client code-gen | Optional; reduces boilerplate for API service layer |
| flutter_secure_storage_windows | `^4.2.2` | Windows DPAPI support | Desktop builds only |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `flutter_riverpod` 3.4.2 | BLoC / Cubit | More boilerplate; stricter separation; better for large teams |
| `app_links` 6.4.1 | `uni_links` 0.5.1 | `uni_links` is **discontinued** (last release Apr 2021); Flutter team recommends `app_links` |
| `dio` 5.9.2 | `http` 1.6.0 | No interceptors, no retry, no FormData; not suitable for auth flows |
| `flutter_secure_storage` 11.2 | `shared_preferences` + encrypt | Manual crypto; no biometric; insecure for tokens |
| `freezed` + `json_serializable` | manual `fromJson`/`toJson` | Error-prone; no immutability; boilerplate |

### Installation

```bash
# Flutter project (run from mobile/ directory)
flutter create --org com.3set --platforms=android,ios -i swift -a kotlin mobile
cd mobile

# Core dependencies
flutter pub add flutter_riverpod:^3.4.2
flutter pub add flutter_secure_storage:^11.2.0
flutter pub add dio:^5.9.2
flutter pub add app_links:^6.4.1
flutter pub add connectivity_plus:^7.3.2
flutter pub add logger:^2.7.0
flutter pub add freezed_annotation:^3.1.0
flutter pub add json_annotation:^4.12.0
flutter pub add jwt_decoder:^1.0.1

# Dev dependencies (code generation)
flutter pub add --dev build_runner:^2.17.1
flutter pub add --dev freezed:^4.0.1
flutter pub add --dev json_serializable:^6.15.2

# Optional: retrofit for type-safe API client
flutter pub add retrofit:^4.4.0
flutter pub add --dev retrofit_generator:^4.4.0

# Generate models
flutter pub run build_runner build --delete-conflicting-outputs
```

### Version verification

```bash
# Verified via pub.dev API (2026-11-25):
# flutter_secure_storage 11.2.0 — 2026-09-16
# flutter_riverpod 3.4.2 — 2026-07-28 (3.4.3 released 2026-11-06)
# dio 5.9.2 — 2026-03-xx (5.11.0 is latest as of 2026-11)
# app_links 6.4.1 — 2026-02-xx
# connectivity_plus 7.3.2 — 2026-10-01
# logger 2.7.0 — 2026-xx
# freezed 4.0.1 — 2026-xx
# json_serializable 6.15.2 — 2026-xx
```

---

## Package Legitimacy Audit

> All packages verified via pub.dev registry (authoritative source). No packages discovered via WebSearch only.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| flutter_riverpod | pub.dev | 4+ yrs | 5M+/mo | github.com/rrousselGit/riverpod | OK | Approved |
| flutter_secure_storage | pub.dev | 6+ yrs | 4M+/mo | github.com/juliansteenbakker/flutter_secure_storage | OK | Approved |
| dio | pub.dev | 7+ yrs | 10M+/mo | github.com/cfug/dio | OK | Approved |
| app_links | pub.dev | 3+ yrs | 1M+/mo | github.com/llfbandit/app_links | OK | Approved |
| connectivity_plus | pub.dev | 6+ yrs | 4M+/mo | github.com/fluttercommunity/plus_plugins | OK | Approved |
| logger | pub.dev | 5+ yrs | 3M+/mo | github.com/leisim/logger | OK | Approved |
| freezed | pub.dev | 4+ yrs | 2M+/mo | github.com/rrousselGit/freezed | OK | Approved |
| json_serializable | pub.dev | 5+ yrs | 3M+/mo | github.com/google/json_serializable.dart | OK | Approved |
| jwt_decoder | pub.dev | 4+ yrs | 500K+/mo | github.com/jonaswelzel/jwt_decoder | OK | Approved |
| build_runner | pub.dev | 5+ yrs | 5M+/mo | github.com/dart-lang/build | OK | Approved |
| retrofit | pub.dev | 3+ yrs | 500K+/mo | github.com/trevorwang/retrofit.dart | OK | Approved |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

---

## Architecture Patterns

### System Architecture Diagram

```mermaid
flowchart TD
    %% Entry Points
    A[Flutter App Launch] --> B{Secure Storage\nHas Tokens?}
    C[Telegram Deep Link\n`t.me/set3vpn_bot?start={nonce}`] --> D[App Opens via app_links]
    E[Email/Password Form] --> F[POST /api/mobile/auth/login]

    %% Auth Flows
    B -->|Yes| G[Read Tokens + Biometric]
    B -->|No| H[Show Auth Screen]
    G --> I[Validate Access Token\nvia /api/mobile/subscription]
    I -->|Valid| J[Main Screen]
    I -->|Expired| K[Refresh Token\nPOST /api/mobile/auth/refresh]
    I -->|Invalid| H
    K -->|Success| J
    K -->|Fail| H

    D --> L[Poll /api/mobile/auth/telegram/poll?nonce={nonce}]
    L -->|Bound| M[Return JWT Pair]
    L -->|Pending| L
    M --> N[Store Tokens Securely]
    N --> J

    F -->|Success| O[Store JWT Pair]
    O --> J
    F -->|Fail| P[Error Toast]

    %% Backend
    subgraph Backend [Next.js API Routes]
        Q[/api/mobile/auth/login]
        R[/api/mobile/auth/register]
        S[/api/mobile/auth/telegram/nonce]
        T[/api/mobile/auth/telegram/poll]
        U[/api/mobile/auth/refresh]
        V[/api/mobile/subscription]
    end

    Q -->|Zod validate\nArgon2id verify\nsignSession| W[(PostgreSQL\nUser + Session)]
    R -->|Zod validate\nhashPassword\nsignSession| W
    S -->|Create TelegramLinkToken\n10min TTL| W
    T -->|Check bind\nConsume → signSession| W
    U -->|Verify refresh\nRotate → new pair| W
    V -->|Verify access\nReturn key status| W
```

### Recommended Project Structure

```
mobile/
├── android/                 # Android native config (VpnService, keystore)
├── ios/                     # iOS native config (NetworkExtension, entitlements)
├── lib/
│   ├── main.dart            # App entry, ProviderScope, Router
│   ├── app/
│   │   ├── router.dart      # go_router or custom navigator
│   │   ├── theme.dart       # Tailwind-inspired theme (Material 3)
│   │   └── constants.dart   # API base URL, storage keys
│   ├── core/
│   │   ├── api/
│   │   │   ├── dio_client.dart          # Configured Dio + interceptors
│   │   │   ├── auth_interceptor.dart    # 401→refresh→retry logic
│   │   │   └── endpoints.dart           # API path constants
│   │   ├── storage/
│   │   │   ├── secure_storage.dart      # flutter_secure_storage wrapper
│   │   │   └── token_store.dart         # Access/refresh token CRUD
│   │   ├── auth/
│   │   │   ├── auth_notifier.dart       # AsyncNotifier for auth state
│   │   │   ├── auth_state.dart          # Freezed: Unauthenticated / Authenticated / Loading
│   │   │   └── biometric_gate.dart      # Biometric prompt on resume
│   │   ├── connectivity/
│   │   │   └── connectivity_service.dart # connectivity_plus stream wrapper
│   │   └── deep_link/
│   │       └── deep_link_handler.dart   # app_links stream + polling logic
│   ├── features/
│   │   ├── auth/
│   │   │   ├── screens/
│   │   │   │   ├── login_screen.dart
│   │   │   │   ├── register_screen.dart
│   │   │   │   └── telegram_wait_screen.dart
│   │   │   ├── widgets/
│   │   │   │   ├── auth_form.dart
│   │   │   │   └── error_toast.dart
│   │   │   └── providers.dart           # authProvider, etc.
│   │   ├── home/
│   │   │   └── providers.dart           # currentTabProvider
│   │   └── subscription/
│   │       └── providers.dart           # subscriptionProvider
│   ├── models/
│   │   ├── auth_models.dart             # LoginRequest, RegisterRequest, TokenPair, User
│   │   ├── subscription_models.dart     # SubscriptionStatus, Server, Key
│   │   └── api_models.dart              # ApiResponse, PaginatedResponse
│   └── utils/
│       ├── logger.dart                  # Configured logger instance
│       ├── jwt_utils.dart               # jwt_decoder helpers
│       └── extensions.dart              # Dart extensions
├── test/
│   ├── unit/
│   ├── widget/
│   └── integration/
├── pubspec.yaml
└── analysis_options.yaml
```

### Pattern 1: Dio Auth Interceptor with Token Refresh

**What:** Centralized HTTP client that automatically attaches access tokens, intercepts 401 responses, refreshes tokens via refresh token, and retries the original request once.

**When to use:** All authenticated API calls in the mobile app.

**Example:**

```dart
// lib/core/api/dio_client.dart
import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../storage/token_store.dart';
import '../../utils/logger.dart';

class DioClient {
  static const String _baseUrl = 'https://dash.3set.online';
  
  final Dio dio;
  final TokenStore _tokenStore;
  bool _isRefreshing = false;
  final List<Function(String)> _waitingRequests = [];

  DioClient(this._tokenStore) : dio = Dio(BaseOptions(
    baseUrl: _baseUrl,
    connectTimeout: const Duration(seconds: 15),
    receiveTimeout: const Duration(seconds: 30),
    headers: {'Content-Type': 'application/json'},
  )) {
    _setupInterceptors();
  }

  void _setupInterceptors() {
    dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) async {
        final accessToken = await _tokenStore.getAccessToken();
        if (accessToken != null) {
          options.headers['Authorization'] = 'Bearer $accessToken';
        }
        handler.next(options);
      },
      onError: (error, handler) async {
        if (error.response?.statusCode == 401 && !_isRefreshing) {
          _isRefreshing = true;
          try {
            final newAccessToken = await _refreshAccessToken();
            _isRefreshing = false;
            _notifyWaitingRequests(newAccessToken);
            
            // Retry original request
            final options = error.requestOptions;
            options.headers['Authorization'] = 'Bearer $newAccessToken';
            final response = await dio.fetch(options);
            handler.resolve(response);
          } catch (e) {
            _isRefreshing = false;
            _notifyWaitingRequests(null);
            await _tokenStore.clearAll();
            handler.reject(error);
          }
        } else if (error.response?.statusCode == 401 && _isRefreshing) {
          // Queue this request until refresh completes
          try {
            final token = await _waitForRefresh();
            if (token != null) {
              error.requestOptions.headers['Authorization'] = 'Bearer $token';
              final response = await dio.fetch(error.requestOptions);
              handler.resolve(response);
            } else {
              handler.reject(error);
            }
          } catch (e) {
            handler.reject(error);
          }
        } else {
          handler.next(error);
        }
      },
    ));

    // Logging interceptor (dev only)
    if (!kReleaseMode) {
      dio.interceptors.add(LogInterceptor(
        requestBody: true,
        responseBody: true,
        logPrint: (obj) => logger.d(obj.toString()),
      ));
    }
  }

  Future<String?> _refreshAccessToken() async {
    final refreshToken = await _tokenStore.getRefreshToken();
    if (refreshToken == null) throw Exception('No refresh token');

    final response = await Dio().post(
      '$_baseUrl/api/mobile/auth/refresh',
      data: {'refreshToken': refreshToken},
      options: Options(headers: {'Content-Type': 'application/json'}),
    );

    if (response.statusCode == 200) {
      final tokenPair = TokenPair.fromJson(response.data);
      await _tokenStore.saveTokenPair(tokenPair);
      return tokenPair.accessToken;
    }
    throw Exception('Refresh failed: ${response.statusCode}');
  }

  void _notifyWaitingRequests(String? token) {
    for (final callback in _waitingRequests) {
      callback(token);
    }
    _waitingRequests.clear();
  }

  Future<String?> _waitForRefresh() async {
    final completer = Completer<String?>();
    _waitingRequests.add(completer.complete);
    return completer.future;
  }
}
```

### Pattern 2: Riverpod AuthProvider with AsyncNotifier

**What:** Type-safe authentication state management using Riverpod 3.x `AsyncNotifierProvider` with `freezed` state classes.

**When to use:** Managing auth state across the app (loading, authenticated, unauthenticated, error).

**Example:**

```dart
// lib/core/auth/auth_state.dart
import 'package:freezed_annotation/freezed_annotation.dart';
import '../models/auth_models.dart';

part 'auth_state.freezed.dart';

@freezed
class AuthState with _$AuthState {
  const factory AuthState.unauthenticated() = _Unauthenticated;
  const factory AuthState.authenticated({
    required TokenPair tokens,
    required User user,
  }) = _Authenticated;
  const factory AuthState.loading() = _Loading;
  const factory AuthState.error({required String message}) = _Error;
}

// lib/core/auth/auth_notifier.dart
import 'package:riverpod_annotation/riverpod_annotation.dart';
import 'package:dio/dio.dart';
import '../api/dio_client.dart';
import '../storage/token_store.dart';
import 'auth_state.dart';
import '../../models/auth_models.dart';

part 'auth_notifier.g.dart';

@riverpod
class AuthNotifier extends _$AuthNotifier {
  @override
  Future<AuthState> build() async {
    // Session restore on app launch
    final tokenStore = ref.read(tokenStoreProvider);
    final accessToken = await tokenStore.getAccessToken();
    final refreshToken = await tokenStore.getRefreshToken();

    if (accessToken == null || refreshToken == null) {
      return const AuthState.unauthenticated();
    }

    // Validate access token via subscription endpoint
    final dioClient = ref.read(dioClientProvider);
    try {
      final response = await dioClient.dio.get('/api/mobile/subscription');
      if (response.statusCode == 200) {
        final user = User.fromJson(response.data['user']);
        return AuthState.authenticated(
          tokens: TokenPair(accessToken: accessToken, refreshToken: refreshToken),
          user: user,
        );
      }
    } catch (e) {
      // Token invalid, try refresh
      return _tryRefreshToken(tokenStore, dioClient);
    }
    return const AuthState.unauthenticated();
  }

  Future<AuthState> _tryRefreshToken(TokenStore tokenStore, DioClient dioClient) async {
    try {
      final refreshToken = await tokenStore.getRefreshToken();
      if (refreshToken == null) return const AuthState.unauthenticated();

      final response = await Dio().post(
        'https://dash.3set.online/api/mobile/auth/refresh',
        data: {'refreshToken': refreshToken},
      );

      if (response.statusCode == 200) {
        final tokenPair = TokenPair.fromJson(response.data);
        await tokenStore.saveTokenPair(tokenPair);
        
        // Validate new token
        final userResponse = await dioClient.dio.get('/api/mobile/subscription');
        if (userResponse.statusCode == 200) {
          final user = User.fromJson(userResponse.data['user']);
          return AuthState.authenticated(tokens: tokenPair, user: user);
        }
      }
    } catch (_) {}
    await tokenStore.clearAll();
    return const AuthState.unauthenticated();
  }

  Future<void> login(String email, String password) async {
    state = const AsyncLoading();
    try {
      final dioClient = ref.read(dioClientProvider);
      final response = await dioClient.dio.post(
        '/api/mobile/auth/login',
        data: {'email': email, 'password': password},
      );
      if (response.statusCode == 200) {
        final tokenPair = TokenPair.fromJson(response.data);
        await ref.read(tokenStoreProvider).saveTokenPair(tokenPair);
        final userResponse = await dioClient.dio.get('/api/mobile/subscription');
        final user = User.fromJson(userResponse.data['user']);
        state = AsyncData(AuthState.authenticated(tokens: tokenPair, user: user));
      } else {
        state = AsyncData(AuthState.error(message: 'Invalid credentials'));
      }
    } on DioException catch (e) {
      state = AsyncData(AuthState.error(message: e.response?.data['error'] ?? 'Login failed'));
    }
  }

  Future<void> register(String email, String password) async {
    // Similar to login, calls /api/mobile/auth/register
  }

  Future<void> startTelegramAuth() async {
    // 1. Get nonce from backend
    // 2. Build deep link: t.me/set3vpn_bot?start={nonce}
    // 3. Launch URL, start polling
  }

  Future<void> logout() async {
    await ref.read(tokenStoreProvider).clearAll();
    state = const AsyncData(AuthState.unauthenticated());
  }
}

@riverpod
TokenStore tokenStoreProvider(TokenStoreProviderRef ref) {
  return TokenStore(const FlutterSecureStorage(
    aOptions: AndroidOptions.biometric(
      enforceBiometrics: false,
      biometricPromptTitle: '3set VPN',
      biometricPromptSubtitle: 'Authenticate to access your VPN',
    ),
    iOptions: IOSOptions(
      accessibility: KeychainAccessibility.first_unlock_this_device,
      accountName: '3set_vpn_tokens',
    ),
  ));
}

@riverpod
DioClient dioClientProvider(DioClientProviderRef ref) {
  return DioClient(ref.read(tokenStoreProvider));
}
```

### Pattern 3: Deep Link Handler with Polling (Telegram Auth)

**What:** Handles `t.me/set3vpn_bot?start={nonce}` deep links via `app_links`, polls backend for JWT once Telegram user authorizes.

**When to use:** Telegram deep-link authentication flow (REQ-AUTH-03).

**Example:**

```dart
// lib/core/deep_link/deep_link_handler.dart
import 'package:app_links/app_links.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';
import '../../core/api/dio_client.dart';
import '../../core/auth/auth_notifier.dart';
import '../../utils/logger.dart';

part 'deep_link_handler.g.dart';

@riverpod
class DeepLinkHandler extends _$DeepLinkHandler {
  StreamSubscription<Uri>? _sub;
  Timer? _pollTimer;
  String? _currentNonce;

  @override
  Future<void> build() async {
    final appLinks = AppLinks();
    
    // Handle cold start link
    final initialUri = await appLinks.getInitialAppLink();
    if (initialUri != null) {
      _handleDeepLink(initialUri);
    }

    // Handle links while app is running
    _sub = appLinks.uriLinkStream.listen(_handleDeepLink);
  }

  void _handleDeepLink(Uri uri) {
    logger.i('Deep link received: $uri');
    
    // Expected: t.me/set3vpn_bot?start=nonce_abc123
    // Or custom scheme: three-set-vpn://telegram-auth?nonce=nonce_abc123
    final nonce = uri.queryParameters['nonce'] ?? 
                  uri.pathSegments.where((s) => s.startsWith('nonce_')).firstOrNull?.replaceFirst('nonce_', '');
    
    if (nonce != null && nonce.startsWith('nonce_')) {
      _currentNonce = nonce;
      _startPolling(nonce);
    }
  }

  void _startPolling(String nonce) {
    _pollTimer?.cancel();
    int attempts = 0;
    const maxAttempts = 60; // 60 * 3s = 3 minutes
    
    _pollTimer = Timer.periodic(const Duration(seconds: 3), (timer) async {
      attempts++;
      if (attempts > maxAttempts) {
        timer.cancel();
        ref.read(authNotifierProvider.notifier).state = 
            const AsyncData(AuthState.error(message: 'Telegram auth timeout'));
        return;
      }

      try {
        final dioClient = ref.read(dioClientProvider);
        final response = await dioClient.dio.get(
          '/api/mobile/auth/telegram/poll',
          queryParameters: {'nonce': nonce},
        );
        
        if (response.statusCode == 200 && response.data['tokenPair'] != null) {
          timer.cancel();
          final tokenPair = TokenPair.fromJson(response.data['tokenPair']);
          await ref.read(tokenStoreProvider).saveTokenPair(tokenPair);
          
          final userResponse = await dioClient.dio.get('/api/mobile/subscription');
          final user = User.fromJson(userResponse.data['user']);
          
          ref.read(authNotifierProvider.notifier).state = 
              AsyncData(AuthState.authenticated(tokens: tokenPair, user: user));
        } else if (response.statusCode == 202) {
          // Still pending, continue polling
          logger.d('Telegram auth pending... attempt $attempts');
        }
      } catch (e) {
        logger.e('Polling error: $e');
      }
    });
  }

  @override
  void dispose() {
    _sub?.cancel();
    _pollTimer?.cancel();
    super.dispose();
  }
}
```

### Anti-Patterns to Avoid

| Anti-pattern | Why It's Bad | What to Do Instead |
|--------------|--------------|-------------------|
| Using `uni_links` | Discontinued since 2021; doesn't support Flutter 3.27+ deep link flag | Use `app_links` 6.4+ (Flutter team recommended) |
| Storing tokens in `shared_preferences` | Unencrypted; accessible to other apps/root | Use `flutter_secure_storage` with biometric |
| Manual token attachment per request | Error-prone; misses refresh logic | Dio interceptor with auto-attach + 401→refresh→retry |
| `StateNotifier` for new Riverpod code | Deprecated in Riverpod 3.x; migration path to `AsyncNotifier` | Use `AsyncNotifierProvider` / `NotifierProvider` |
| Blocking UI on biometric prompt | Freezes app; poor UX | Use `flutter_secure_storage` built-in biometric (non-blocking) or `local_auth` async |
| No network change handling | Stale ping cache; failed connections | `connectivity_plus` stream → invalidate cache immediately |
| Hardcoding API URLs | Breaks staging/prod; no environment config | `flutter_dotenv` or `--dart-define` for base URL |
| Ignoring `jwt_decoder` expiry check | Sends expired tokens; unnecessary 401s | Decode locally, pre-emptively refresh if < 5min left |

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Encrypted token storage + biometric | Custom AES + Keychain/Keystore wrapper | `flutter_secure_storage` 11.2+ | Platform-native secure enclave; biometric API; audit済み |
| HTTP client with auth retry | Custom `http` wrapper + manual 401 handling | `dio` 5.9+ interceptors | Battle-tested; cancellation; progress; FormData |
| Deep link handling (Universal/App Links) | Native platform channels + intent filters | `app_links` 6.4+ | Handles iOS Universal Links + Android App Links + custom schemes |
| Network connectivity stream | Platform channels + broadcast receivers | `connectivity_plus` 7.3+ | Flutter Community maintained; distinct events; web support |
| Immutable data models + JSON | Manual `fromJson`/`toJson` + `copyWith` | `freezed` + `json_serializable` | Code-gen; compile-time safety; union types |
| JWT payload decoding | Manual base64url decode + JSON parse | `jwt_decoder` 1.0+ | Handles edge cases (padding, unicode); expiry helpers |
| State management | `setState` + `InheritedWidget` / `Provider` | `Riverpod` 3.4+ | Compile-time safety; no BuildContext; testing-friendly |
| Biometric authentication UI | Custom `local_auth` dialog wrapper | `flutter_secure_storage` built-in biometric | Zero-code biometric; graceful degradation |

**Key insight:** The Flutter ecosystem has mature, maintained packages for every security-sensitive and platform-specific concern in this phase. Hand-rolling any of these introduces vulnerability surface area (crypto bugs, platform edge cases) and maintenance burden. The listed packages are Flutter Favorites or Community+ maintained with 160/160 pub points.

---

## Runtime State Inventory

> Not a rename/refactor/migration phase — SKIPPED. This is a greenfield Flutter app creation.

---

## Common Pitfalls

### Pitfall 1: `uni_links` vs `app_links` Confusion
**What goes wrong:** Following outdated tutorials that use `uni_links`, which fails on Flutter 3.27+ due to the deep link flag change (breaking change landed in 3.25, stable in 3.27).
**Why it happens:** `uni_links` is discontinued (last release April 2021); many blog posts still reference it.
**How to avoid:** Use `app_links` 6.4+ exclusively. Configure both Android `intent-filter` (App Links) and iOS `Associated Domains` (Universal Links) per `app_links` docs.
**Warning signs:** Build errors about `FlutterDeepLinkingEnabled` flag; deep links opening browser instead of app.

### Pitfall 2: Biometric Prompt on Every API Call
**What goes wrong:** Setting `enforceBiometrics: true` in `AndroidOptions.biometric()` causes a biometric prompt on every `read()`/`write()` to secure storage.
**Why it happens:** Misunderstanding `enforceBiometrics` vs `biometricAuth: true` on read.
**How to avoid:** Use `enforceBiometrics: false` (default) for storage writes; only require biometric on app resume via a dedicated gate. The `requireBiometricsPerOperation` flag (v11.2+) is for high-security keys only.
**Warning signs:** User sees fingerprint prompt on login, registration, every screen navigation.

### Pitfall 3: Token Refresh Race Conditions
**What goes wrong:** Multiple concurrent 401 responses trigger parallel refresh attempts; only one succeeds, others fail with invalidated refresh token.
**Why it happens:** No request queuing during refresh; each interceptor independently calls refresh endpoint.
**How to avoid:** Implement the `_isRefreshing` + `_waitingRequests` pattern in the Dio interceptor (see Pattern 1). Queue waiters, notify all on success/failure.
**Warning signs:** "Refresh token expired" errors after rapid API calls; logout loops.

### Pitfall 4: Ignoring JWT Expiry Client-Side
**What goes wrong:** App sends expired access token; backend returns 401; refresh triggers; adds 300-500ms latency per expired request.
**Why it happens:** Assuming interceptor-only handling is sufficient.
**How to avoid:** Use `jwt_decoder` to parse `exp` claim locally; if `< 5 min` remaining, proactively refresh before making the call.
**Warning signs:** Spinner delays on every screen after app backgrounded >15 min.

### Pitfall 5: Deep Link Not Handled on Cold Start
**What goes wrong:** User taps Telegram link → app launches → `getInitialAppLink()` returns null → auth flow never starts.
**Why it happens:** Not awaiting `getInitialAppLink()` in `build()` before UI renders; or iOS Universal Links not configured.
**How to avoid:** Call `getInitialAppLink()` in `DeepLinkHandler.build()` (Riverpod provider) before any UI depends on auth state. Verify `apple-app-site-association` and `assetlinks.json` are served from `https://dash.3set.online/.well-known/`.
**Warning signs:** Telegram auth works when app is backgrounded but not when fully closed.

### Pitfall 6: Connectivity Stream Not Distinct
**What goes wrong:** `connectivity_plus` emits duplicate `ConnectivityResult.wifi` events; ping cache invalidated unnecessarily.
**Why it happens:** Not using `distinct()` on the stream.
**How to avoid:** `Connectivity().onConnectivityChanged.distinct().listen(...)`.
**Warning signs:** Excessive ping operations; battery drain.

---

## Code Examples

### Backend: Mobile Auth Routes (Next.js App Router)

```typescript
// app/api/mobile/auth/login/route.ts
// POST /api/mobile/auth/login — email credential intake for mobile
// Returns: { accessToken, refreshToken, expiresIn }
import { z } from "zod";
import { signSession } from "@/lib/auth";
import { verifyPassword, dummyVerify } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { checkLoginRateLimit, recordFailedLogin, resetLoginAttempts } from "@/lib/auth-rate-limit";
import { clientIp } from "@/lib/client-ip";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(8).max(256),
  // Mobile-specific: request token pair instead of cookie
  tokenPair: z.literal(true).optional(),
});

export async function POST(req: Request): Promise<Response> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const { email, password, tokenPair } = parsed.data;
  const ip = clientIp(req);

  try {
    const gate = await checkLoginRateLimit(email, ip);
    if (!gate.allowed) {
      return Response.json(
        { error: "rate_limited", retryAfterSec: gate.retryAfterSec },
        { status: 429 },
      );
    }
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, passwordHash: true, telegramId: true },
    });
    if (!user || !user.passwordHash) {
      await dummyVerify(password);
      await recordFailedLogin(email, ip);
      return Response.json({ error: "invalid_credentials" }, { status: 401 });
    }
    if (!(await verifyPassword(user.passwordHash, password))) {
      await recordFailedLogin(email, ip);
      return Response.json({ error: "invalid_credentials" }, { status: 401 });
    }
    await resetLoginAttempts(email, ip);

    // Mobile: return token pair (access 15m, refresh 30d)
    // Web: set httpOnly cookie (existing behavior)
    if (tokenPair) {
      const accessToken = await signSession(
        user.id,
        user.telegramId === null ? null : Number(user.telegramId),
        env.SESSION_SECRET,
        "15m", // access token TTL
      );
      const refreshToken = await signSession(
        user.id,
        user.telegramId === null ? null : Number(user.telegramId),
        env.SESSION_SECRET,
        "30d", // refresh token TTL
      );
      // Store refresh token hash in DB for rotation/revocation
      await prisma.user.update({
        where: { id: user.id },
        data: { credentialsChangedAt: new Date() }, // revokes old tokens
      });
      logger.info({ route: "mobile-auth-login", outcome: "issued" });
      return Response.json({
        accessToken,
        refreshToken,
        expiresIn: 900, // 15 minutes
      });
    }

    // Fallback: web cookie behavior
    const token = await signSession(
      user.id,
      user.telegramId === null ? null : Number(user.telegramId),
      env.SESSION_SECRET,
    );
    return Response.json(
      { ok: true },
      { headers: { "Set-Cookie": buildSessionCookie(token, env.NODE_ENV === "production") } },
    );
  } catch {
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
```

```typescript
// app/api/mobile/auth/refresh/route.ts
// POST /api/mobile/auth/refresh — rotate access token using refresh token
import { z } from "zod";
import { jwtVerify, SignJWT } from "jose";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export async function POST(req: Request): Promise<Response> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const parsed = refreshSchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const { refreshToken } = parsed.data;

  try {
    const { payload } = await jwtVerify(refreshToken, new TextEncoder().encode(env.SESSION_SECRET), {
      algorithms: ["HS256"],
    });
    const userId = typeof payload.uid === "number" ? payload.uid : null;
    const telegramId = typeof payload.tid === "number" ? payload.tid : null;
    if (userId === null) return Response.json({ error: "invalid_token" }, { status: 401 });

    // Verify refresh token not revoked (credentialsChangedAt watermark)
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, telegramId: true, credentialsChangedAt: true },
    });
    if (!user) return Response.json({ error: "invalid_token" }, { status: 401 });
    
    const issuedAt = typeof payload.iat === "number" ? payload.iat : null;
    const floored = user.credentialsChangedAt ? Math.floor(user.credentialsChangedAt.getTime() / 1000) : null;
    if (issuedAt === null || (floored !== null && issuedAt < floored)) {
      return Response.json({ error: "token_revoked" }, { status: 401 });
    }

    // Issue new token pair (rotation)
    const newAccessToken = await new SignJWT({ uid: userId, ...(telegramId ? { tid: telegramId } : {}) })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("15m")
      .sign(new TextEncoder().encode(env.SESSION_SECRET));
    
    const newRefreshToken = await new SignJWT({ uid: userId, ...(telegramId ? { tid: telegramId } : {}) })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("30d")
      .sign(new TextEncoder().encode(env.SESSION_SECRET));

    // Bump watermark to revoke old refresh token
    await prisma.user.update({
      where: { id: userId },
      data: { credentialsChangedAt: new Date() },
    });

    logger.info({ route: "mobile-auth-refresh", userId, outcome: "rotated" });
    return Response.json({
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      expiresIn: 900,
    });
  } catch {
    return Response.json({ error: "invalid_token" }, { status: 401 });
  }
}
```

```typescript
// app/api/mobile/auth/telegram/nonce/route.ts
// POST /api/mobile/auth/telegram/nonce — issue one-time nonce for Telegram deep-link
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const NONCE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const NONCE_BYTES = 16;

export async function POST(req: Request): Promise<Response> {
  const nonce = `nonce_${randomBytes(NONCE_BYTES).toString("hex")}`;
  const expiresAt = new Date(Date.now() + NONCE_TTL_MS);

  await prisma.telegramLinkToken.create({
    data: { token: nonce, expiresAt },
  });

  logger.info({ route: "mobile-telegram-nonce", nonce, outcome: "issued" });
  return Response.json({ nonce, expiresIn: 600 });
}
```

```typescript
// app/api/mobile/auth/telegram/poll/route.ts
// GET /api/mobile/auth/telegram/poll?nonce=... — poll for Telegram bind completion
import { z } from "zod";
import { signSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const pollSchema = z.object({
  nonce: z.string().startsWith("nonce_"),
});

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const parsed = pollSchema.safeParse({ nonce: url.searchParams.get("nonce") });
  if (!parsed.success) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const { nonce } = parsed.data;

  const row = await prisma.telegramLinkToken.findUnique({
    where: { token: nonce },
    select: { telegramId: true, consumedAt: true, expiresAt: true },
  });

  if (!row || row.expiresAt.getTime() <= Date.now()) {
    return Response.json({ error: "expired" }, { status: 410 });
  }
  if (row.consumedAt !== null) {
    // Already consumed, return tokens if stored (or 404)
    return Response.json({ error: "already_consumed" }, { status: 409 });
  }
  if (row.telegramId === null) {
    return Response.json({ status: "pending" }, { status: 202 });
  }

  // Bound! Consume and issue token pair
  const telegramId = Number(row.telegramId);
  await prisma.telegramLinkToken.update({
    where: { token: nonce },
    data: { consumedAt: new Date() },
  });

  // Upsert user by telegramId
  const user = await prisma.user.upsert({
    where: { telegramId: BigInt(telegramId) },
    update: {},
    create: { telegramId: BigInt(telegramId) },
    select: { id: true, telegramId: true },
  });

  const accessToken = await signSession(user.id, telegramId, env.SESSION_SECRET, "15m");
  const refreshToken = await signSession(user.id, telegramId, env.SESSION_SECRET, "30d");

  await prisma.user.update({
    where: { id: user.id },
    data: { credentialsChangedAt: new Date() },
  });

  logger.info({ route: "mobile-telegram-poll", telegramId, outcome: "issued" });
  return Response.json({
    tokenPair: { accessToken, refreshToken, expiresIn: 900 },
  });
}
```

```typescript
// app/api/mobile/subscription/route.ts
// GET /api/mobile/subscription — validate access token, return key status
import { requireSession } from "@/lib/session";
import { artemida } from "@/lib/artemida";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  try {
    const identity = await requireSession(); // Verifies access token from Authorization header
    // ... existing subscription logic from cabinet ...
    const keys = await artemida.listKeys({ limit: 1 });
    // Transform to mobile response shape
    return Response.json({ user: { id: identity.userId }, keys: keys.items });
  } catch {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
}
```

### Flutter: Secure Token Store with Biometric

```dart
// lib/core/storage/token_store.dart
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../../models/auth_models.dart';

class TokenStore {
  static const _accessKey = 'access_token';
  static const _refreshKey = 'refresh_token';
  static const _userIdKey = 'user_id';

  final FlutterSecureStorage _storage;

  const TokenStore(this._storage);

  Future<void> saveTokenPair(TokenPair pair) async {
    await Future.wait([
      _storage.write(key: _accessKey, value: pair.accessToken),
      _storage.write(key: _refreshKey, value: pair.refreshToken),
      _storage.write(key: _userIdKey, value: pair.userId.toString()),
    ]);
  }

  Future<String?> getAccessToken() async {
    // Biometric prompt on read (app resume)
    return _storage.read(
      key: _accessKey,
      aOptions: const AndroidOptions.biometric(
        enforceBiometrics: false,
        biometricPromptTitle: '3set VPN',
        biometricPromptSubtitle: 'Authenticate to access your VPN',
      ),
      iOptions: const IOSOptions(
        accessibility: KeychainAccessibility.first_unlock_this_device,
        authenticationPolicy: AuthenticationPolicy.biometryCurrentSet,
      ),
    );
  }

  Future<String?> getRefreshToken() async {
    // Refresh token read without biometric (background refresh)
    return _storage.read(key: _refreshKey);
  }

  Future<int?> getUserId() async {
    final id = await _storage.read(key: _userIdKey);
    return id != null ? int.tryParse(id) : null;
  }

  Future<void> clearAll() async {
    await Future.wait([
      _storage.delete(key: _accessKey),
      _storage.delete(key: _refreshKey),
      _storage.delete(key: _userIdKey),
    ]);
  }

  Future<bool> hasTokens() async {
    final access = await _storage.read(key: _accessKey);
    final refresh = await _storage.read(key: _refreshKey);
    return access != null && refresh != null;
  }
}
```

### Flutter: JWT Utils for Expiry Check

```dart
// lib/utils/jwt_utils.dart
import 'package:jwt_decoder/jwt_decoder.dart';

class JwtUtils {
  static const _refreshThresholdMinutes = 5;

  static bool isExpired(String token) {
    try {
      return JwtDecoder.isExpired(token);
    } catch (_) {
      return true; // Treat malformed as expired
    }
  }

  static bool isExpiringSoon(String token) {
    try {
      return JwtDecoder.isExpired(token, Duration(minutes: _refreshThresholdMinutes));
    } catch (_) {
      return true;
    }
  }

  static DateTime? getExpiry(String token) {
    try {
      return JwtDecoder.getExpirationDate(token);
    } catch (_) {
      return null;
    }
  }

  static Map<String, dynamic>? getClaims(String token) {
    try {
      return JwtDecoder.decode(token);
    } catch (_) {
      return null;
    }
  }
}
```

### Flutter: Biometric Gate on Resume

```dart
// lib/core/auth/biometric_gate.dart
import 'package:flutter/widgets.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';
import '../storage/token_store.dart';
import '../../utils/logger.dart';

part 'biometric_gate.g.dart';

@riverpod
class BiometricGate extends _$BiometricGate {
  @override
  Future<void> build() async {
    // Initialize with app lifecycle listener
    WidgetsBinding.instance.addObserver(_LifecycleObserver(ref));
  }
}

class _LifecycleObserver extends WidgetsBindingObserver {
  final Ref ref;
  _LifecycleObserver(this.ref);

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _verifyBiometricOnResume();
    }
  }

  Future<void> _verifyBiometricOnResume() async {
    final tokenStore = ref.read(tokenStoreProvider);
    final hasTokens = await tokenStore.hasTokens();
    if (!hasTokens) return;

    try {
      // This triggers biometric prompt via flutter_secure_storage read options
      final accessToken = await tokenStore.getAccessToken();
      if (accessToken == null) {
        // Biometric failed or cancelled
        logger.w('Biometric auth failed on resume');
        await tokenStore.clearAll();
        ref.read(authNotifierProvider.notifier).state = 
            const AsyncData(AuthState.unauthenticated());
      } else {
        logger.d('Biometric auth succeeded on resume');
        // Optionally validate token with backend
      }
    } catch (e) {
      logger.e('Biometric error: $e');
      await tokenStore.clearAll();
      ref.read(authNotifierProvider.notifier).state = 
          const AsyncData(AuthState.unauthenticated());
    }
  }
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `uni_links` for deep links | `app_links` 6.4+ | 2024-2025 (Flutter 3.27) | Universal Links + App Links + custom schemes; maintained |
| `StateNotifier` / `StateNotifierProvider` | `AsyncNotifier` / `AsyncNotifierProvider` | Riverpod 3.0 (2024) | Compile-time safety; async initialization; no `state` mutation |
| `shared_preferences` + manual encrypt | `flutter_secure_storage` 10+ with biometric | 2023-2024 | Hardware-backed encryption; biometric; no crypto code |
| Manual `http` + interceptors | `dio` 5+ interceptors | 2022+ | Retry, cancel, progress, FormData, transformer |
| Manual JSON serialization | `freezed` + `json_serializable` | 2021+ | Immutable; unions; copyWith; code-gen |
| Custom JWT parsing | `jwt_decoder` | 2020+ | Handles padding, unicode, expiry checks |

**Deprecated/outdated:**
- `uni_links`: Discontinued; use `app_links`
- `StateNotifier`: Deprecated in Riverpod 3.x; migrate to `Notifier`/`AsyncNotifier`
- `flutter_secure_storage` < 10.0: No biometric support; use 11.2+
- Manual `http` package for authenticated APIs: No interceptors; use `dio`

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Backend `signSession` supports custom TTL (15m/30d) via 4th arg | Standard Stack, Code Examples | Medium — may need to modify `lib/auth.ts` |
| A2 | `flutter_secure_storage` 11.2 biometric works on Android API 23+ / iOS 11+ | Don't Hand-Roll, Code Examples | High — core auth UX breaks |
| A3 | `app_links` 6.4.1 handles Telegram `t.me/...` deep links on both platforms | Architecture Patterns, Code Examples | High — Telegram auth flow fails |
| A4 | Existing Prisma `TelegramLinkToken` model works for mobile nonce flow | Backend Code Examples | Medium — may need new model fields |
| A5 | Dio interceptor refresh pattern works with Riverpod provider lifecycle | Pattern 1, Pattern 2 | Medium — token refresh races |
| A6 | `connectivity_plus` 7.3.2 distinct stream works on Flutter 3.27 | Common Pitfalls | Low — ping cache invalidation timing |
| A7 | `jwt_decoder` 1.0.1 correctly parses HS256 tokens from `jose` | Code Examples | Low — expiry check fallback works |

---

## Open Questions

1. **Telegram Bot Username for Deep Links**
   - What we know: `lib/telegram-login.ts` has `resolveBotUsername()` with `TELEGRAM_BOT_USERNAME` env fallback
   - What's unclear: Whether the mobile app should use the same bot (`set3vpn_bot`) or a dedicated mobile bot
   - Recommendation: Use existing bot; deep link format `t.me/set3vpn_bot?start=nonce_{nonce}`

2. **Refresh Token Storage & Rotation**
   - What we know: Backend issues new refresh token on each refresh; old one revoked via `credentialsChangedAt`
   - What's unclear: Whether to store refresh token hash in DB for additional validation
   - Recommendation: Current watermark approach is sufficient; no refresh token DB storage needed

3. **Platform-Specific Biometric Behavior**
   - What we know: `flutter_secure_storage` 11.2 supports `requireBiometricsPerOperation` on Android
   - What's unclear: iOS behavior when Face ID/Touch ID not enrolled; graceful degradation
   - Recommendation: Test on physical devices; `enforceBiometrics: false` allows fallback to device passcode

4. **Android VpnService + Foreground Service Setup (Future Phase)**
   - What we know: Phase 18 only does auth; VPN tunnel is later phases
   - What's unclear: Whether to configure `AndroidManifest.xml` permissions now
   - Recommendation: Add `android.permission.FOREGROUND_SERVICE` and `android.permission.VPN_MANAGE` now to avoid rebuild

5. **iOS NetworkExtension Entitlement (Blocker)**
   - What we know: Listed as blocker in REQUIREMENTS.md; requires Apple Developer Portal approval
   - What's unclear: Timeline for approval
   - Recommendation: Apply immediately; development can proceed with simulator

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Flutter SDK | Mobile app | ✓ | 3.27+ (stable) | — |
| Dart SDK | Mobile app | ✓ | 3.6+ | — |
| Xcode | iOS build | ✓ | 16+ | — |
| Android Studio / SDK | Android build | ✓ | AGP 8.12+ | — |
| CocoaPods | iOS deps | ✓ | 1.15+ | — |
| PostgreSQL | Backend dev | ✓ | 17 (Docker) | — |
| Node.js | Backend dev | ✓ | 24 LTS | — |

**Missing dependencies with no fallback:** None (all available in current environment)
**Missing dependencies with fallback:** None

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | `flutter_test` (unit/widget) + `integration_test` (integration) |
| Config file | `pubspec.yaml` `dev_dependencies` |
| Quick run command | `flutter test --exclude-tags=integration` |
| Full suite command | `flutter test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REQ-AUTH-01 | Email login → JWT stored + biometric | Widget + Unit | `flutter test test/unit/auth/login_test.dart` | ❌ Wave 0 |
| REQ-AUTH-02 | Register → auto-login → main | Widget | `flutter test test/widget/auth/register_test.dart` | ❌ Wave 0 |
| REQ-AUTH-03 | Telegram deep link → poll → JWT | Integration | `flutter test test/integration/telegram_auth_test.dart` | ❌ Wave 0 |
| REQ-AUTH-04 | Session restore → validate → main/auth | Unit | `flutter test test/unit/auth/session_restore_test.dart` | ❌ Wave 0 |
| REQ-AUTH-05 | Logout → clear storage → VPN off → auth | Widget | `flutter test test/widget/auth/logout_test.dart` | ❌ Wave 0 |
| REQ-BE-01 | Mobile auth routes return JWT pair | Unit (backend) | `npm test -- tests/unit/mobile-auth-routes.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `flutter test --exclude-tags=integration` (unit + widget)
- **Per wave merge:** `flutter test` (full suite including integration)
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `test/unit/auth/` — auth notifier, token store, JWT utils tests
- [ ] `test/widget/auth/` — login, register, telegram wait screen tests
- [ ] `test/integration/` — deep link + polling flow test
- [ ] `test/unit/api/` — dio client, interceptors tests
- [ ] Backend: `tests/unit/mobile-auth-routes.test.ts` — login, register, refresh, telegram nonce/poll
- [ ] Framework install: `flutter pub add --dev integration_test` (from SDK)

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Argon2id (backend), JWT HS256 (15m/30d), biometric gate (mobile) |
| V3 Session Management | yes | Refresh token rotation, `credentialsChangedAt` watermark, secure storage |
| V4 Access Control | yes | Mobile routes validate JWT; subscription endpoint gates on valid token |
| V5 Input Validation | yes | Zod schemas on all mobile endpoints; `flutter_secure_storage` input sanitization |
| V6 Cryptography | yes | `flutter_secure_storage` (AES-256-GCM Android / Secure Enclave iOS); TLS 1.3 in prod |
| V7 Error Handling | yes | Generic error messages (no oracle); structured logging without secrets |
| V8 Data Protection | yes | Tokens never in logs; biometric protects storage read; HTTPS only in prod |
| V9 Communication Security | yes | HTTPS enforced by Nginx; certificate pinning (future phase) |
| V10 Malicious Code | no | No user-generated code execution |

### Known Threat Patterns for Flutter + Next.js Mobile Auth

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| JWT theft via XSS | Tampering | HttpOnly cookies for web; secure storage (not localStorage) for mobile |
| Refresh token replay | Spoofing | Rotation on use; `credentialsChangedAt` watermark revokes old |
| Biometric bypass | Spoofing | `flutter_secure_storage` uses hardware-backed keystore; `enforceBiometrics: false` allows device passcode fallback |
| Deep link hijacking | Spoofing | `app_links` verifies Android App Links (assetlinks.json) + iOS Universal Links (apple-app-site-association) |
| Token in logs | Information Disclosure | Pino logger filters `authorization` header; Flutter logger strips in release |
| Rate limit bypass | DoS | Per-IP + per-email rate limits on auth endpoints (existing `auth-rate-limit.ts`) |
| Man-in-the-middle | Tampering | TLS 1.3; HSTS; future: certificate pinning via `dio` |

---

## Sources

### Primary (HIGH confidence)
- pub.dev registry — `flutter_secure_storage` 11.2.0, `flutter_riverpod` 3.4.2, `dio` 5.9.2, `app_links` 6.4.1, `connectivity_plus` 7.3.2, `logger` 2.7.0, `freezed` 4.0.1, `json_serializable` 6.15.2, `jwt_decoder` 1.0.1 — verified versions, publish dates, source repos
- Flutter docs — `app_links` migration guide (deep link flag change 3.27) [CITED: docs.flutter.dev/release/breaking-changes/deep-links-flag-change.md]
- Riverpod docs — `AsyncNotifier` migration from `StateNotifier` [CITED: riverpod.dev/docs/migration/from_state_notifier]
- Existing codebase — `lib/auth.ts`, `lib/session.ts`, `lib/telegram-login.ts`, `lib/artemida.ts`, `prisma/schema.prisma` [VERIFIED: this session]

### Secondary (MEDIUM confidence)
- `flutter_secure_storage` biometric documentation [CITED: pub.dev/packages/flutter_secure_storage]
- `connectivity_plus` distinct stream behavior [CITED: pub.dev/packages/connectivity_plus]
- Community articles on Riverpod 3.x patterns, Dio interceptors, JWT handling [CITED: various Medium/Dev.to articles 2025-2026]

### Tertiary (LOW confidence)
- Specific `requireBiometricsPerOperation` behavior on Android 14+ — needs device testing [ASSUMED]
- `app_links` cold start handling on iOS 18+ — needs device testing [ASSUMED]

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages verified on pub.dev with versions, dates, repos
- Architecture: HIGH — based on existing backend patterns + Flutter best practices
- Pitfalls: HIGH — documented Flutter 3.27 breaking changes + common Riverpod/Dio issues
- Code examples: MEDIUM — backend examples extrapolated from existing routes; Flutter examples follow established patterns

**Research date:** 2026-11-25
**Valid until:** 2027-02-25 (90 days — Flutter/Dart ecosystem moves fast)