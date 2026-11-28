// Single real purchase path (Phase 21 tracer, D-04/D-05/D-06).
//
// 1. POST /api/mobile/payments/create with INTENT only — never an amount.
// 2. Open ONLY the server-returned https URL in an in-app WebView.
// 3. Poll our DB-only status route every 3s, at most 100 times (5 min).
// 4. Success comes ONLY from the stored DB status written by the shared
//    Platega webhook → outbox → worker; there is no timer-driven simulation.
//
// Only the non-secret order id is persisted. No URL, token, transaction id or
// provider text is logged or stored (T-21-07/T-21-08/T-21-09).
import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:mobile/core/api/endpoints.dart';

/// Terminal outcome of one purchase attempt. [provisioned] is the ONLY success:
/// `paid`/`provisioning` are not terminal — the key is not issued yet.
enum PaymentOutcome { provisioned, failed, canceled, refunded, timeout }

class PaymentFlowResult {
  const PaymentFlowResult(this.outcome, this.orderId);

  final PaymentOutcome outcome;
  final String? orderId;

  bool get isSuccess => outcome == PaymentOutcome.provisioned;
  bool get isTimedOut => outcome == PaymentOutcome.timeout;
}

/// Clean, provider-free failure code. The raw provider message is never kept.
class PaymentFlowException implements Exception {
  const PaymentFlowException(this.code);

  final String code;

  @override
  String toString() => "PaymentFlowException: $code";
}

/// Client checkout intent. Deliberately has NO amount/discount field: the
/// backend quotes the price (D-01/T-21-02).
class PaymentRequest {
  const PaymentRequest({
    required this.kind,
    this.days,
    this.devices,
    this.keyId,
    this.addDevices,
  });

  final String kind;
  final int? days;
  final int? devices;
  final String? keyId;
  final int? addDevices;

  Map<String, dynamic> toJson() => <String, dynamic>{
    "kind": kind,
    if (days != null) "days": days,
    if (devices != null) "devices": devices,
    if (keyId != null) "keyId": keyId,
    if (addDevices != null) "addDevices": addDevices,
  };
}

/// Seam for the non-secret pending order id (T-21-09).
abstract class PendingOrderStore {
  Future<void> save(String orderId);
  Future<String?> read();
  Future<void> clear();
}

class SecurePendingOrderStore implements PendingOrderStore {
  SecurePendingOrderStore(this._storage);

  /// Dedicated key — never reuse the JWT token keys from TokenStore.
  static const String pendingOrderIdKey = "pending_payment_order_id";

  final FlutterSecureStorage _storage;

  @override
  Future<void> save(String orderId) =>
      _storage.write(key: pendingOrderIdKey, value: orderId);

  @override
  Future<String?> read() => _storage.read(key: pendingOrderIdKey);

  @override
  Future<void> clear() => _storage.delete(key: pendingOrderIdKey);
}

/// Seam for launching the in-app WebView (D-05). Kept injectable so the whole
/// flow can be tested with a fake launcher and no platform plugin.
abstract class PaymentWebViewLauncher {
  Future<void> openPaymentPage(String url);
}

class InAppWebViewLauncher implements PaymentWebViewLauncher {
  InAppWebViewLauncher(this.context);

  final BuildContext context;

  @override
  Future<void> openPaymentPage(String url) {
    return Navigator.of(context).push<void>(
      MaterialPageRoute<void>(builder: (_) => PaymentWebViewPage(url: url)),
    );
  }
}

class PaymentWebViewPage extends StatelessWidget {
  const PaymentWebViewPage({super.key, required this.url});

  final String url;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text("Оплата")),
      // T-21-06: [url] is validated https by PaymentFlow before we get here.
      body: InAppWebView(initialUrlRequest: URLRequest(url: WebUri(url))),
    );
  }
}

class PaymentFlow {
  PaymentFlow({
    required this.dio,
    required this.store,
    required this.launcher,
    this.pollInterval = defaultPollInterval,
    this.maxAttempts = defaultMaxAttempts,
    this.onProvisioned,
  });

  /// 3s × 100 attempts = 5 minutes (D-06).
  static const Duration defaultPollInterval = Duration(seconds: 3);
  static const int defaultMaxAttempts = 100;

  final Dio dio;
  final PendingOrderStore store;
  final PaymentWebViewLauncher launcher;
  final Duration pollInterval;
  final int maxAttempts;

  /// Called EXACTLY once when a terminal `provisioned` DB status is observed,
  /// in both the fresh-purchase and the killed-app resume path. The caller
  /// invalidates its subscription provider here; no timer or return URL can
  /// trigger it (T-21-34).
  final Future<void> Function()? onProvisioned;

  /// Only a server-returned absolute https URL may be navigated to.
  static bool isHttpsPaymentUrl(String value) {
    final uri = Uri.tryParse(value);
    return uri != null &&
        uri.isAbsolute &&
        uri.scheme.toLowerCase() == "https" &&
        uri.host.isNotEmpty;
  }

  Future<PaymentFlowResult> start(PaymentRequest request) async {
    final Response<dynamic> response;
    try {
      response = await dio.post<dynamic>(
        Endpoints.paymentCreate,
        data: request.toJson(),
      );
    } on DioException {
      throw const PaymentFlowException("network");
    }

    final data = response.data;
    if (response.statusCode != 200 || data is! Map || data["ok"] != true) {
      final code = data is Map && data["error"] is String
          ? data["error"] as String
          : "bad_response";
      throw PaymentFlowException(code);
    }
    final orderId = data["orderId"];
    final paymentUrl = data["paymentUrl"];
    if (orderId is! String ||
        orderId.isEmpty ||
        paymentUrl is! String ||
        paymentUrl.isEmpty) {
      throw const PaymentFlowException("bad_response");
    }
    if (!isHttpsPaymentUrl(paymentUrl)) {
      throw const PaymentFlowException("invalid_payment_url");
    }

    // Persist ONLY the non-secret order id, then open the hosted page.
    await store.save(orderId);
    await launcher.openPaymentPage(paymentUrl);
    return _poll(orderId);
  }

  /// Continue polling the last pending order after an app kill (D-06).
  /// Returns null when nothing was persisted.
  Future<PaymentFlowResult?> resumePending() async {
    final orderId = await store.read();
    if (orderId == null || orderId.isEmpty) return null;
    return _poll(orderId);
  }

  Future<PaymentFlowResult> _poll(String orderId) async {
    for (var attempt = 0; attempt < maxAttempts; attempt++) {
      await Future<void>.delayed(pollInterval);

      Response<dynamic> response;
      try {
        response = await dio.get<dynamic>(Endpoints.paymentStatus(orderId));
      } on DioException catch (error) {
        if (error.response?.statusCode == 404) {
          await store.clear();
          return PaymentFlowResult(PaymentOutcome.failed, orderId);
        }
        // Transient transport failure: keep polling within the cap.
        continue;
      }

      final data = response.data;
      if (data is! Map || data["ok"] != true) {
        if (data is Map && data["error"] == "not_found") {
          await store.clear();
          return PaymentFlowResult(PaymentOutcome.failed, orderId);
        }
        continue;
      }
      final status = data["status"];
      if (status is! String) continue;

      final outcome = terminalOutcome(status);
      if (outcome != null) {
        // Every terminal status clears the non-secret id. Only the DB-written
        // provisioned status may invalidate the subscription (exactly once).
        await store.clear();
        if (outcome == PaymentOutcome.provisioned) {
          await onProvisioned?.call();
        }
        return PaymentFlowResult(outcome, orderId);
      }
      // pending / paid / provisioning are NOT success: keep polling.
    }

    // Keep the pending id on timeout so the next launch can continue (D-06).
    return PaymentFlowResult(PaymentOutcome.timeout, orderId);
  }

  /// Only DB-written terminal statuses end the poll. Never derived from time.
  /// CANCELED / CHARGEBACKED / DISPUTED / refund end it WITHOUT success: the
  /// webhook issues no key for those states (D-07), so the poll must clear the
  /// pending id and report an honest non-success outcome.
  static PaymentOutcome? terminalOutcome(String status) {
    switch (status.trim().toLowerCase()) {
      case "provisioned":
        return PaymentOutcome.provisioned;
      case "failed":
      case "disputed":
        return PaymentOutcome.failed;
      case "canceled":
        return PaymentOutcome.canceled;
      case "refunded":
      case "chargebacked":
        return PaymentOutcome.refunded;
      default:
        return null;
    }
  }
}
