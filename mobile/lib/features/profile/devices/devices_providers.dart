// Live device list and removal from our BFF only (REQ-DEV-01/02, T-22-01/02).
//
// The client never calls ARTEMIDA and never sends a keyId: the active key is
// derived server-side from the JWT. This file mirrors the subscription
// providers' _send/_decodeBody path and reuses their single frozen Russian
// notice table, so an unknown wire code never becomes raw provider text.
import "package:dio/dio.dart";
import "package:flutter_riverpod/flutter_riverpod.dart";

import "../../../core/api/endpoints.dart";
import "../../../core/auth/auth_notifier.dart" show dioClientProvider;
import "../../subscription/providers.dart"
    show SubscriptionFailure, subscriptionNotices;
import "device.dart";

SubscriptionFailure _failure(String wireCode) {
  final code = subscriptionNotices.containsKey(wireCode) ? wireCode : "internal";
  return SubscriptionFailure(code, subscriptionNotices[code]!);
}

Map<String, dynamic> _bodyOf(dynamic raw) {
  if (raw is! Map) throw _failure("invalid_response");
  return Map<String, dynamic>.from(raw);
}

T _decodeBody<T>(Map<String, dynamic> body, T Function(Map<String, dynamic>) fromJson) {
  if (body["ok"] != true) {
    final wire = body["error"];
    throw _failure(wire is String ? wire : "internal");
  }
  try {
    return fromJson(body);
  } on SubscriptionFailure {
    rethrow;
  } on Object catch (_) {
    throw _failure("invalid_response");
  }
}

Future<Map<String, dynamic>> _send(Future<Response<dynamic>> Function() call) async {
  late final Response<dynamic> response;
  try {
    response = await call();
  } on DioException catch (error) {
    final data = error.response?.data;
    if (data is Map && data["ok"] == false) {
      final wire = data["error"];
      throw _failure(wire is String ? wire : "internal");
    }
    final status = error.response?.statusCode;
    if (status == 401) throw _failure("unauthorized");
    if (status == 403) throw _failure("no_active_key");
    if (status == 402) throw _failure("payment_required");
    if (status == 404) throw _failure("not_found");
    if (status == 409) throw _failure("trial");
    if (status != null && status >= 500) throw _failure("internal");
    throw _failure("network");
  }
  return _bodyOf(response.data);
}

/// One row per opaque token in provider order. No client-side ranking and no
/// fabricated row: an empty list is an empty list.
final devicesProvider = FutureProvider.autoDispose<List<Device>>((ref) async {
  final dio = ref.read(dioClientProvider).dio;
  final body = await _send(() => dio.get<dynamic>(Endpoints.devices));
  return _decodeBody(body, DevicesPayload.fromJson).devices ?? const <Device>[];
});

/// Imperative DELETE of one opaque token. Path token is URL-encoded by
/// [Endpoints.device]; no keyId or capacity counter is sent.
typedef DeviceDeleter = Future<void> Function(String token);

final deleteDeviceProvider = Provider<DeviceDeleter>((ref) {
  return (String token) async {
    final dio = ref.read(dioClientProvider).dio;
    final body = await _send(
      () => dio.delete<dynamic>(Endpoints.device(token)),
    );
    _decodeBody(body, (Map<String, dynamic> json) => json);
  };
});
