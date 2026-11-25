import 'package:dio/dio.dart';
import 'package:logger/logger.dart';
import 'package:mobile/core/api/auth_interceptor.dart';
import 'package:mobile/core/storage/secure_storage.dart';
import 'package:mobile/core/storage/token_store.dart';

/// Configured Dio HTTP client for the mobile app.
///
/// Includes:
/// - Base URL and timeouts
/// - AuthInterceptor for automatic token attachment and refresh
/// - LoggingInterceptor in debug mode
class DioClient {
  final Dio dio;
  final TokenStore tokenStore;
  final Logger _logger;

  DioClient({
    required this.tokenStore,
    Logger? logger,
  }) : _logger = logger ?? Logger(),
       dio = Dio(BaseOptions(
         baseUrl: 'https://dash.3set.online',
         connectTimeout: const Duration(seconds: 15),
         receiveTimeout: const Duration(seconds: 30),
         headers: {
           'Content-Type': 'application/json',
           'Accept': 'application/json',
         },
       )) {
    // Add interceptors
    dio.interceptors.add(AuthInterceptor(tokenStore: tokenStore, logger: _logger));

    // Debug logging only in debug mode
    assert(() {
      dio.interceptors.add(LogInterceptor(
        requestBody: true,
        responseBody: true,
        requestHeader: false,
        responseHeader: false,
        logPrint: (obj) => _logger.d(obj.toString()),
      ));
      return true;
    }());
  }

  /// Creates a DioClient with default dependencies.
  factory DioClient.create({
    TokenStore? tokenStore,
    Logger? logger,
  }) {
    return DioClient(
      tokenStore: tokenStore ?? TokenStore(SecureStorage.instance),
      logger: logger,
    );
  }
}