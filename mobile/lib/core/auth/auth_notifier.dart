import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:logger/logger.dart' as logger_pkg;
import 'package:mobile/core/api/dio_client.dart';
import 'package:mobile/core/api/endpoints.dart';
import 'package:mobile/core/auth/auth_state.dart';
import 'package:mobile/core/storage/token_store.dart';
import 'package:mobile/models/auth_models.dart';
import 'package:mobile/utils/logger.dart';

/// Riverpod provider for DioClient.
final dioClientProvider = Provider<DioClient>((ref) {
  return DioClient.create();
});

/// Riverpod provider for AuthNotifier.
final authNotifierProvider = AsyncNotifierProvider<AuthNotifier, AuthState>(() {
  return AuthNotifier();
});

/// Authentication state notifier with session restore, login, register, and logout.
///
/// Handles the complete authentication lifecycle:
/// - Session restore on app launch via [build()]
/// - Email/password login and registration
/// - Token refresh coordination with AuthInterceptor
/// - Logout with secure storage cleanup
class AuthNotifier extends AsyncNotifier<AuthState> {
  late final DioClient _dioClient;
  late final TokenStore _tokenStore;
  late final logger_pkg.Logger _logger;

  @override
  AuthState build() {
    _dioClient = ref.read(dioClientProvider);
    _tokenStore = ref.read(tokenStoreProvider);
    _logger = createLogger('AuthNotifier');

    // Trigger session restore asynchronously
    _restoreSession();

    return const AuthState.loading();
  }

  /// Restores session on app launch.
  ///
  /// Checks for stored tokens, validates them via /api/mobile/subscription,
  /// attempts refresh on 401, and updates state accordingly.
  Future<void> _restoreSession() async {
    _logger.i('Starting session restore');

    final hasTokens = await _tokenStore.hasTokens();
    if (!hasTokens) {
      _logger.i('No stored tokens, setting unauthenticated');
      state = AsyncData(const AuthState.unauthenticated());
      return;
    }

    _logger.d('Tokens found, validating via subscription endpoint');

    try {
      final response = await _dioClient.dio.get(Endpoints.subscription);

      if (response.statusCode == 200) {
        final user = User.fromJson(response.data['user'] as Map<String, dynamic>);
        final accessToken = await _tokenStore.getAccessTokenNoBiometric();
        final refreshToken = await _tokenStore.getRefreshToken();

        if (accessToken != null && refreshToken != null) {
          final tokens = TokenPair(
            accessToken: accessToken,
            refreshToken: refreshToken,
            expiresIn: 900, // Will be updated by interceptor on next request
            userId: user.id,
          );
          // Backend token pairs do not carry userId; persist it from the
          // validated subscription payload so the fast path stays valid.
          await _tokenStore.saveTokenPair(tokens);
          _logger.i('Session restored for user ${user.id}');
          state = AsyncData(AuthState.authenticated(tokens: tokens, user: user));
          return;
        }
      }

      // If we get here, tokens might be stale - try refresh
      _logger.w('Subscription validation failed, attempting refresh');
      await _tryRefreshAndRestore();
    } on DioException catch (e) {
      if (e.response?.statusCode == 401) {
        _logger.w('Got 401 on session restore, attempting refresh');
        await _tryRefreshAndRestore();
      } else {
        _logger.e('Session restore failed: $e');
        await _tokenStore.clearAll();
        state = AsyncData(const AuthState.unauthenticated());
      }
    } catch (e) {
      _logger.e('Session restore error: $e');
      await _tokenStore.clearAll();
      state = AsyncData(const AuthState.unauthenticated());
    }
  }

  /// Attempts token refresh and restores session if successful.
  Future<void> _tryRefreshAndRestore() async {
    try {
      final refreshToken = await _tokenStore.getRefreshToken();
      if (refreshToken == null || refreshToken.isEmpty) {
        throw Exception('No refresh token');
      }

      final refreshDio = DioClient.create().dio; // Fresh instance without interceptor
      final response = await refreshDio.post(
        Endpoints.authRefresh,
        data: {'refreshToken': refreshToken},
      );

      if (response.statusCode == 200) {
        final tokenPair = TokenPair.fromJson(response.data as Map<String, dynamic>);
        await _tokenStore.saveTokenPair(tokenPair);

        // Validate new tokens
        final dio = DioClient.create().dio;
        final subResponse = await dio.get(Endpoints.subscription);

        if (subResponse.statusCode == 200) {
          final user = User.fromJson(subResponse.data['user'] as Map<String, dynamic>);
          _logger.i('Session restored after refresh for user ${user.id}');
          state = AsyncData(AuthState.authenticated(tokens: tokenPair, user: user));
          return;
        }
      }

      throw Exception('Refresh failed');
    } catch (e) {
      _logger.e('Refresh failed during session restore: $e');
      await _tokenStore.clearAll();
      state = AsyncData(const AuthState.unauthenticated());
    }
  }

  /// Logs in with email and password.
  ///
  /// On success, saves tokens and triggers session restore.
  /// Returns the AuthState (authenticated or error).
  Future<AuthState> login(String email, String password) async {
    _logger.i('Login attempt for $email');
    state = const AsyncData(AuthState.loading());

    try {
      final response = await _dioClient.dio.post(
        Endpoints.authLogin,
        data: {'email': email, 'password': password},
      );

      if (response.statusCode == 200) {
        final tokenPair = TokenPair.fromJson(response.data as Map<String, dynamic>);
        await _tokenStore.saveTokenPair(tokenPair);
        _logger.i('Login successful, restoring session');
        await _restoreSession();
        return state.value!;
      }

      throw Exception('Login failed with status ${response.statusCode}');
    } on DioException catch (e) {
      String message;
      if (e.response?.statusCode == 401) {
        message = 'Неверный email или пароль';
      } else if (e.response?.statusCode == 429) {
        message = 'Слишком много попыток. Попробуйте позже';
      } else {
        message = 'Ошибка входа: ${e.message}';
      }
      _logger.w('Login failed: $message');
      state = AsyncData(AuthState.error(message));
      return state.value!;
    } catch (e) {
      _logger.e('Login error: $e');
      state = AsyncData(AuthState.error('Ошибка входа: $e'));
      return state.value!;
    }
  }

  /// Registers a new user with email and password.
  ///
  /// On success, saves tokens and triggers session restore.
  /// Returns the AuthState (authenticated or error).
  Future<AuthState> register(String email, String password) async {
    _logger.i('Registration attempt for $email');
    state = const AsyncData(AuthState.loading());

    try {
      final response = await _dioClient.dio.post(
        Endpoints.authRegister,
        data: {'email': email, 'password': password, 'confirmPassword': password},
      );

      if (response.statusCode == 200) {
        final tokenPair = TokenPair.fromJson(response.data as Map<String, dynamic>);
        await _tokenStore.saveTokenPair(tokenPair);
        _logger.i('Registration successful, restoring session');
        await _restoreSession();
        return state.value!;
      }

      throw Exception('Registration failed with status ${response.statusCode}');
    } on DioException catch (e) {
      String message;
      if (e.response?.statusCode == 409) {
        message = 'Email уже зарегистрирован';
      } else if (e.response?.statusCode == 400) {
        message = 'Неверные данные для регистрации';
      } else if (e.response?.statusCode == 429) {
        message = 'Слишком много попыток. Попробуйте позже';
      } else {
        message = 'Ошибка регистрации: ${e.message}';
      }
      _logger.w('Registration failed: $message');
      state = AsyncData(AuthState.error(message));
      return state.value!;
    } catch (e) {
      _logger.e('Registration error: $e');
      state = AsyncData(AuthState.error('Ошибка регистрации: $e'));
      return state.value!;
    }
  }

  /// Public method to trigger session restore.
  /// Used by DeepLinkHandler after Telegram auth succeeds.
  Future<void> restoreSession() => _restoreSession();

  /// Sets an error state (used by DeepLinkHandler for Telegram auth errors).
  void setError(String message) {
    _logger.w('Setting error state: $message');
    state = AsyncData(AuthState.error(message));
  }

  /// Sets unauthenticated state without touching storage.
  /// Used by the biometric resume gate after a failed unlock (storage is
  /// cleared by the gate itself).
  void setUnauthenticated() {
    _logger.i('Setting unauthenticated state');
    state = AsyncData(const AuthState.unauthenticated());
  }

  /// Logs out the current user.
  ///
  /// Clears all tokens from secure storage and sets unauthenticated state.
  Future<void> logout() async {
    _logger.i('Logging out');
    await _tokenStore.clearAll();
    state = AsyncData(const AuthState.unauthenticated());
  }

  /// Starts Telegram authentication flow.
  ///
  /// Gets a nonce from the backend and returns it for deep link generation.
  Future<String?> startTelegramAuth() async {
    _logger.i('Starting Telegram auth');
    try {
      final response = await _dioClient.dio.post(Endpoints.telegramNonce);
      if (response.statusCode == 200) {
        final nonce = response.data['nonce'] as String?;
        _logger.i('Got Telegram nonce: $nonce');
        return nonce;
      }
      throw Exception('Failed to get nonce');
    } catch (e) {
      _logger.e('Telegram auth start failed: $e');
      return null;
    }
  }
}