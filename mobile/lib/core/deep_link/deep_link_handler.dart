import 'dart:async';

import 'package:app_links/app_links.dart';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:logger/logger.dart';
import 'package:mobile/core/api/dio_client.dart';
import 'package:mobile/core/api/endpoints.dart';
import 'package:mobile/core/auth/auth_notifier.dart';
import 'package:mobile/core/storage/token_store.dart';
import 'package:mobile/models/auth_models.dart';
import 'package:mobile/utils/logger.dart';

/// Riverpod provider for DeepLinkHandler.
/// Handles Telegram deep links with nonce polling for authentication.
final deepLinkHandlerProvider = Provider<DeepLinkHandler>((ref) {
  final dioClient = ref.read(dioClientProvider);
  final tokenStore = ref.read(tokenStoreProvider);
  final authNotifier = ref.read(authNotifierProvider.notifier);
  final handler = DeepLinkHandler(
    dioClient: dioClient,
    tokenStore: tokenStore,
    authNotifier: authNotifier,
  );
  // Start listening for deep links when provider is read
  handler.startListening();
  ref.onDispose(() => handler.dispose());
  return handler;
});

/// Handles Telegram deep links and nonce polling for authentication flow.
///
/// Deep link formats supported:
/// - `t.me/set3vpn_bot?start=nonce_{nonce}` (Telegram bot deep link)
/// - `three-set-vpn://auth?nonce={nonce}` (custom scheme)
///
/// On receiving a nonce, starts polling `/api/mobile/auth/telegram/poll?nonce=...`
/// every 3 seconds (max 60 attempts = 3 minutes).
class DeepLinkHandler {
  DeepLinkHandler({
    required DioClient dioClient,
    required TokenStore tokenStore,
    required AuthNotifier authNotifier,
  })  : _dioClient = dioClient,
        _tokenStore = tokenStore,
        _authNotifier = authNotifier,
        _appLinks = AppLinks(),
        _log = createLogger('DeepLinkHandler');

  // Internal constructor for testing with mocked AppLinks
  @visibleForTesting
  DeepLinkHandler.internal({
    required DioClient dioClient,
    required TokenStore tokenStore,
    required AuthNotifier authNotifier,
    AppLinks? appLinks,
  })  : _dioClient = dioClient,
        _tokenStore = tokenStore,
        _authNotifier = authNotifier,
        _appLinks = appLinks ?? AppLinks(),
        _log = createLogger('DeepLinkHandler');

  final DioClient _dioClient;
  final TokenStore _tokenStore;
  final AuthNotifier _authNotifier;
  final AppLinks _appLinks;
  final Logger _log;

  Timer? _pollingTimer;
  int _pollAttempts = 0;
  static const int _maxPollAttempts = 60; // 3 minutes at 3s interval
  static const Duration _pollInterval = Duration(seconds: 3);
  String? _currentNonce;
  StreamSubscription<Uri>? _linkSubscription;

  /// Starts listening for deep links (both cold start and runtime).
  Future<void> startListening() async {
    // Handle cold start deep link
    try {
      final initialLink = await _appLinks.getInitialLink();
      if (initialLink != null) {
        _handleDeepLink(initialLink);
      }
    } catch (e) {
      _log.e('Error getting initial app link: $e');
    }

    // Listen for runtime deep links
    _linkSubscription = _appLinks.uriLinkStream.listen(
      _handleDeepLink,
      onError: (e) => _log.e('Deep link stream error: $e'),
    );
  }

  /// Parses deep link and extracts nonce if present.
  void _handleDeepLink(Uri uri) {
    final nonce = extractNonce(uri);
    if (nonce != null) {
      _log.i('Deep link received with nonce: $nonce');
      _startPolling(nonce);
    } else {
      _log.d('Deep link received without nonce: $uri');
    }
  }

  /// Extracts nonce from supported deep link formats.
  ///
  /// Supported formats:
  /// - `t.me/set3vpn_bot?start=nonce_{nonce}`
  /// - `three-set-vpn://auth?nonce={nonce}`
  @visibleForTesting
  String? extractNonce(Uri uri) {
    // Telegram bot deep link: t.me/set3vpn_bot?start=nonce_xxx
    if (uri.host == 't.me' && uri.pathSegments.contains('set3vpn_bot')) {
      final startParam = uri.queryParameters['start'];
      if (startParam != null && startParam.startsWith('nonce_')) {
        return startParam.substring('nonce_'.length);
      }
    }

    // Custom scheme: three-set-vpn://auth?nonce=xxx
    // Note: For custom schemes like three-set-vpn://auth, the URI parser treats
    // 'auth' as the host, not the path. So we check host instead.
    if (uri.scheme == 'three-set-vpn' && uri.host == 'auth') {
      return uri.queryParameters['nonce'];
    }

    return null;
  }

  /// Starts polling for Telegram authentication result.
  void _startPolling(String nonce) {
    // Cancel any existing polling
    cancelPolling();

    _currentNonce = nonce;
    _pollAttempts = 0;

    _pollingTimer = Timer.periodic(_pollInterval, (_) => _pollForAuth());
    // Also poll immediately
    _pollForAuth();
  }

  /// Polls the backend for Telegram authentication result.
  Future<void> _pollForAuth() async {
    if (_currentNonce == null) return;

    _pollAttempts++;

    if (_pollAttempts > _maxPollAttempts) {
      _log.w('Polling timeout after $_maxPollAttempts attempts');
      _stopPolling(error: 'Время ожидания истекло');
      return;
    }

    try {
      final response = await _dioClient.dio.get(
        Endpoints.telegramPoll,
        queryParameters: {'nonce': _currentNonce},
      );

      if (response.statusCode == 200) {
        // Success - got token pair
        final tokenPair = TokenPair.fromJson(response.data as Map<String, dynamic>);
        await _tokenStore.saveTokenPair(tokenPair);
        _log.i('Telegram auth successful, restoring session');
        _stopPolling();
        // Trigger session restore via AuthNotifier
        await _authNotifier.restoreSession();
      } else if (response.statusCode == 202) {
        // Still pending - continue polling
        _log.d('Telegram auth pending (attempt $_pollAttempts/$_maxPollAttempts)');
      } else if (response.statusCode == 410 || response.statusCode == 409) {
        // Expired or already used nonce
        _log.w('Nonce expired or already used: ${response.statusCode}');
        _stopPolling(error: 'Ссылка недействительна или уже использована');
      } else {
        // Other error - stop polling
        _log.w('Telegram auth poll error: ${response.statusCode}');
        _stopPolling(error: 'Ошибка авторизации через Telegram');
      }
    } on DioException catch (e) {
      if (e.response?.statusCode == 410 || e.response?.statusCode == 409) {
        _log.w('Nonce expired or already used: ${e.response?.statusCode}');
        _stopPolling(error: 'Ссылка недействительна или уже использована');
      } else {
        _log.w('Telegram auth poll network error: $e');
        // Network errors - continue polling unless max attempts reached
        if (_pollAttempts >= _maxPollAttempts) {
          _stopPolling(error: 'Ошибка сети. Попробуйте позже');
        }
      }
    } catch (e) {
      _log.e('Telegram auth poll unexpected error: $e');
      _stopPolling(error: 'Ошибка авторизации');
    }
  }

  /// Stops polling and clears state.
  void _stopPolling({String? error}) {
    _pollingTimer?.cancel();
    _pollingTimer = null;
    _currentNonce = null;
    _pollAttempts = 0;

    if (error != null) {
      // Set error state via AuthNotifier
      _authNotifier.setError(error);
    }
  }

  /// Cancels active polling (e.g., when user taps cancel in TelegramWaitScreen).
  void cancelPolling() {
    if (_pollingTimer != null) {
      _log.i('Polling cancelled by user');
      _stopPolling(error: 'Авторизация отменена');
    }
  }

  /// Checks if polling is currently active.
  bool get isPolling => _pollingTimer != null;

  /// Returns the current nonce being polled, if any.
  String? get currentNonce => _currentNonce;

  /// Returns the current poll attempt count.
  int get pollAttempts => _pollAttempts;

  /// Disposes resources.
  void dispose() {
    cancelPolling();
    _linkSubscription?.cancel();
  }
}