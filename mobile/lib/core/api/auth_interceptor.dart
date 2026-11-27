import 'dart:async';

import 'package:dio/dio.dart';
import 'package:logger/logger.dart';
import 'package:mobile/app/constants.dart' show apiBaseUrl;
import 'package:mobile/core/api/endpoints.dart';
import 'package:mobile/core/storage/token_store.dart';
import 'package:mobile/models/auth_models.dart';

/// Interceptor that attaches Bearer tokens and handles 401 responses with automatic token refresh.
///
/// Implements the single-flight refresh pattern with request queuing:
/// - When a 401 occurs, only one refresh request is made
/// - Concurrent 401 requests wait for the refresh to complete
/// - On refresh success, all queued requests are retried with the new token
/// - On refresh failure, all queued requests fail and tokens are cleared
class AuthInterceptor extends Interceptor {
  final TokenStore tokenStore;
  final Logger _logger;

  bool _isRefreshing = false;
  final List<Completer<String>> _waitingRequests = [];

  AuthInterceptor({
    required this.tokenStore,
    Logger? logger,
  }) : _logger = logger ?? Logger();

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) async {
    // Skip auth for login, register, refresh, and telegram nonce endpoints
    final isAuthEndpoint = options.path.contains(Endpoints.authLogin) ||
        options.path.contains(Endpoints.authRegister) ||
        options.path.contains(Endpoints.authRefresh) ||
        options.path.contains(Endpoints.telegramNonce);

    if (!isAuthEndpoint) {
      // Use the non-biometric read: biometrics are enforced once per app
      // unlock by the resume gate, not on every HTTP request.
      final accessToken = await tokenStore.getAccessTokenNoBiometric();
      if (accessToken != null && accessToken.isNotEmpty) {
        options.headers['Authorization'] = 'Bearer $accessToken';
      }
    }

    handler.next(options);
  }

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) async {
    // Only handle 401 errors on non-auth endpoints
    if (err.response?.statusCode == 401) {
      final isAuthEndpoint = err.requestOptions.path.contains(Endpoints.authLogin) ||
          err.requestOptions.path.contains(Endpoints.authRegister) ||
          err.requestOptions.path.contains(Endpoints.authRefresh) ||
          err.requestOptions.path.contains(Endpoints.telegramNonce);

      if (!isAuthEndpoint) {
        _logger.w('401 received, attempting token refresh');
        try {
          final newAccessToken = await _refreshToken();
          _logger.i('Token refresh successful, retrying original request');

          // Update the header and retry
          err.requestOptions.headers['Authorization'] = 'Bearer $newAccessToken';
          final response = await Dio().fetch(err.requestOptions);
          handler.resolve(response);
          return;
        } catch (e) {
          _logger.e('Token refresh failed: $e');
          await tokenStore.clearAll();
          // Don't handle further, let the error propagate to trigger logout
        }
      }
    }

    handler.next(err);
  }

  /// Performs token refresh with single-flight + request queue pattern.
  Future<String> _refreshToken() async {
    // If already refreshing, queue this request
    if (_isRefreshing) {
      _logger.d('Refresh in progress, queuing request');
      return _waitForRefresh();
    }

    _isRefreshing = true;

    try {
      final refreshToken = await tokenStore.getRefreshToken();
      if (refreshToken == null || refreshToken.isEmpty) {
        throw Exception('No refresh token available');
      }

      _logger.d('Calling refresh endpoint');

      // Create a fresh Dio instance for the refresh call to avoid interceptor loops
      final refreshDio = Dio(BaseOptions(
        baseUrl: apiBaseUrl,
        connectTimeout: const Duration(seconds: 15),
        receiveTimeout: const Duration(seconds: 30),
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      ));

      final response = await refreshDio.post(
        Endpoints.authRefresh,
        data: {'refreshToken': refreshToken},
      );

      if (response.statusCode == 200) {
        final tokenPair = TokenPair.fromJson(response.data as Map<String, dynamic>);
        await tokenStore.saveTokenPair(tokenPair);

        // Notify all waiting requests
        for (final completer in _waitingRequests) {
          if (!completer.isCompleted) {
            completer.complete(tokenPair.accessToken);
          }
        }
        _waitingRequests.clear();

        return tokenPair.accessToken;
      } else {
        throw Exception('Refresh failed with status ${response.statusCode}');
      }
    } catch (e) {
      // Fail every queued request; otherwise they would hang forever.
      for (final completer in _waitingRequests) {
        if (!completer.isCompleted) {
          completer.completeError(e);
        }
      }
      _waitingRequests.clear();
      rethrow;
    } finally {
      _isRefreshing = false;
    }
  }

  /// Waits for an in-progress refresh to complete.
  Future<String> _waitForRefresh() async {
    final completer = Completer<String>();
    _waitingRequests.add(completer);
    return completer.future;
  }
}