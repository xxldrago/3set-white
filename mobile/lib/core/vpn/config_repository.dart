import "package:dio/dio.dart";
import "package:flutter_riverpod/flutter_riverpod.dart";

import "../api/endpoints.dart";
import "../auth/auth_notifier.dart" show dioClientProvider;

/// Stable, machine-only failure code from the `/config` boundary (D-19).
///
/// The raw HTTP/provider message is deliberately discarded: it can echo a
/// config fragment, an outbound secret or a token. Only the fixed [code]
/// crosses into the connection FSM.
class ConfigRepositoryException implements Exception {
  /// Creates an exception carrying one stable [code].
  const ConfigRepositoryException(this.code);

  /// One of `auth_failed`, `no_active_key`, `config_invalid`, `unreachable`.
  final String code;

  @override
  String toString() => "ConfigRepositoryException: $code";
}

/// Fetches the complete backend-built config through the shared Dio client.
///
/// D-01/D-04: the client sends only `serverId`; it never assembles a config,
/// never calls ARTEMIDA and never opens a second HTTP client. The returned map
/// is opaque — it is handed straight to the native bridge and is never logged,
/// rendered or included in an exception message.
class ConfigRepository {
  /// Creates a repository over the app's configured Dio (JWT + refresh).
  ConfigRepository(this._dio);

  final Dio _dio;

  /// GET `/api/mobile/config?serverId=id` and return the opaque config map.
  Future<Map<String, dynamic>> fetch(String serverId) async {
    try {
      final response = await _dio.get<dynamic>(
        Endpoints.config,
        queryParameters: <String, Object?>{"serverId": serverId},
      );
      final data = response.data;
      if (data is Map<Object?, Object?>) {
        if (data["ok"] == true && data["config"] is Map<Object?, Object?>) {
          // Keep the config opaque: no inspection, no logging, no copy of any
          // nested secret beyond the shallow type-safe map the bridge needs.
          return Map<String, dynamic>.from(
            data["config"] as Map<Object?, Object?>,
          );
        }
        final error = data["error"];
        if (error == "no_active_key") {
          throw const ConfigRepositoryException("no_active_key");
        }
        if (error == "server_not_found") {
          throw const ConfigRepositoryException("config_invalid");
        }
      }
      throw const ConfigRepositoryException("config_invalid");
    } on DioException catch (error) {
      final status = error.response?.statusCode;
      if (status == 401) throw const ConfigRepositoryException("auth_failed");
      if (status == 403) throw const ConfigRepositoryException("no_active_key");
      throw const ConfigRepositoryException("unreachable");
    } on ConfigRepositoryException {
      rethrow;
    } on Object {
      // Any unexpected local failure is a generic reachability failure; never
      // propagate the raw exception text (D-19).
      throw const ConfigRepositoryException("unreachable");
    }
  }
}

/// Injectable `/config` repository provider, reusing the shared Dio (D-01).
final Provider<ConfigRepository> configRepositoryProvider =
    Provider<ConfigRepository>(
  (ref) => ConfigRepository(ref.read(dioClientProvider).dio),
);
