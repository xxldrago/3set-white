// Live subscription state for the Shop screen (Phase 21, D-01/D-03/D-12).
//
// Every value here comes from our BFF: prices from /api/mobile/pricing, status
// from /api/mobile/subscription, promo percentages from /api/mobile/promo/apply
// and payment URLs from /api/mobile/payments/create. The AuthInterceptor owns
// Bearer tokens and 401 refresh; no token handling is duplicated here.
//
// Local state (term, devices, discount, chip) is presentation-only. It never
// becomes a price or entitlement authority: preview multiplies the server unit
// price and applies only a server-returned percentage (D-03), and payment
// create posts intent only — never an amount or discount.
import "package:dio/dio.dart";
import "package:flutter_riverpod/flutter_riverpod.dart";
import "package:flutter_riverpod/legacy.dart";

import "package:mobile/core/api/endpoints.dart";
import "package:mobile/core/auth/auth_notifier.dart";
import "package:mobile/features/subscription/models/payment.dart";
import "package:mobile/features/subscription/models/pricing.dart";
import "package:mobile/features/subscription/models/promo.dart";
import "package:mobile/features/subscription/models/subscription.dart";

/// Stable, provider-free failure surfaced by every subscription provider.
///
/// [code] is a machine-readable allowlisted code; [notice] is frozen Russian UI
/// copy. No upstream message, transport text or 5xx wording is ever carried.
class SubscriptionFailure implements Exception {
  /// Creates a stable failure.
  const SubscriptionFailure(this.code, this.notice);

  /// Allowlisted machine code (for example `no_active_key`).
  final String code;

  /// Russian notice safe to show to the user.
  final String notice;

  @override
  String toString() => "SubscriptionFailure: $code";
}

/// The single stable notice table used by all four backend routes (T-21-23).
const Map<String, String> subscriptionNotices = <String, String>{
  "no_active_key": "Нужен активный ключ",
  "unauthorized": "Войдите снова",
  "bad_request": "Некорректный запрос",
  "rate_limited": "Слишком много запросов. Попробуйте позже",
  "payment_required": "Недостаточно средств для оплаты",
  "provider_error": "Сервис временно недоступен. Попробуйте позже",
  "internal": "Ошибка сервиса. Попробуйте позже",
  "promo_invalid": "Промокод недействителен",
  "trial": "Триал не продлевается",
  "not_found": "Заказ не найден",
  "invalid_payment_url": "Не удалось открыть оплату",
  "invalid_response": "Не удалось загрузить данные. Повторите",
  "network": "Нет соединения. Повторите",
};

SubscriptionFailure _failure(String wireCode) {
  final code = subscriptionNotices.containsKey(wireCode) ? wireCode : "internal";
  return SubscriptionFailure(code, subscriptionNotices[code]!);
}

/// The one `AsyncValue.when(error: ...)` mapper for the Shop UI.
///
/// Unknown exceptions degrade to the retryable network notice, never to a raw
/// Dio message or a provider text fragment.
String subscriptionNotice(Object? error) =>
    error is SubscriptionFailure ? error.notice : subscriptionNotices["network"]!;

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

/// Executes one BFF request and maps transport errors to stable codes.
///
/// A `{ok:false,error}` envelope on a non-200 status (401/403/404/409) is read
/// first, so a domain failure never escapes as a `DioException` (T-21-23).
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

/// Device count used for the pricing request; locked mobile bounds are 2..10.
final deviceCountProvider = StateProvider<int>((ref) => 2);

/// Selected term duration in days. No price is stored in local state.
final selectedTermDaysProvider = StateProvider<int?>((ref) => null);

/// Promo code typed by the user; the server decides whether it is valid.
final promoCodeProvider = StateProvider<String>((ref) => "");

/// Percentage from the server preview; never a client-generated discount.
final discountPercentProvider = StateProvider<int>((ref) => 0);

/// UI-only payment chip selection (Platega has no brand-level code).
final paymentMethodProvider = StateProvider<String>((ref) => "МИР");

/// Whether a purchase request is in flight.
final paymentProcessingProvider = StateProvider<bool>((ref) => false);

/// Server-returned payment URL, populated only after a successful create call.
final paymentUrlProvider = StateProvider<String?>((ref) => null);

/// Five server-quoted terms from `GET /api/mobile/pricing?devices=N`.
///
/// Re-fetches when the device stepper changes; no price is hardcoded in Dart.
final pricingPlansProvider = FutureProvider.autoDispose<List<PricingTerm>>((ref) async {
  final devices = ref.watch(deviceCountProvider);
  final dio = ref.read(dioClientProvider).dio;
  final body = await _send(
    () => dio.get<dynamic>(
      Endpoints.pricing,
      queryParameters: <String, dynamic>{"devices": devices},
    ),
  );
  return _decodeBody(body, PricingResponse.fromJson).terms;
});

/// Single ownership-joined subscription read from `GET /api/mobile/subscription`.
///
/// `statusKind` and `graceUntil` arrive server-derived; the client does not
/// compute a grace window or an entitlement decision (D-10/D-12).
final userSubscriptionProvider =
    FutureProvider.autoDispose<SubscriptionStatus>((ref) async {
  final dio = ref.read(dioClientProvider).dio;
  final body = await _send(() => dio.get<dynamic>(Endpoints.subscription));
  return _decodeBody(body, SubscriptionStatus.fromJson);
});

/// Read-only promo preview from `POST /api/mobile/promo/apply`.
///
/// The response carries a percentage only; consumption stays in `createOrder`.
final promoPreviewProvider =
    FutureProvider.autoDispose.family<PromoPreview, String>((ref, code) async {
  final dio = ref.read(dioClientProvider).dio;
  final body = await _send(
    () => dio.post<dynamic>(
      Endpoints.promoApply,
      data: <String, dynamic>{"code": code},
    ),
  );
  return _decodeBody(body, PromoPreview.fromJson);
});

/// Client purchase intent. Deliberately has NO amount or discount field.
typedef PaymentIntent = ({
  String kind,
  int? days,
  int? devices,
  String? keyId,
  int? addDevices,
});

/// Creates an order via `POST /api/mobile/payments/create`.
///
/// Only kind/days/devices/keyId/addDevices are posted; the server quotes the
/// amount and returns our order id plus the hosted payment URL (D-04).
final createPaymentProvider =
    FutureProvider.family<PaymentCreateResponse, PaymentIntent>((ref, intent) async {
  final dio = ref.read(dioClientProvider).dio;
  final body = await _send(
    () => dio.post<dynamic>(
      Endpoints.paymentCreate,
      data: <String, dynamic>{
        "kind": intent.kind,
        if (intent.days != null) "days": intent.days,
        if (intent.devices != null) "devices": intent.devices,
        if (intent.keyId != null) "keyId": intent.keyId,
        if (intent.addDevices != null) "addDevices": intent.addDevices,
      },
    ),
  );
  return _decodeBody(body, PaymentCreateResponse.fromJson);
});

/// Ownership-scoped DB status from `GET /api/mobile/payments/status/{orderId}`.
final paymentStatusProvider =
    FutureProvider.autoDispose.family<PaymentStatusResponse, String>((ref, orderId) async {
  final dio = ref.read(dioClientProvider).dio;
  final body = await _send(
    () => dio.get<dynamic>(Endpoints.paymentStatus(orderId)),
  );
  return _decodeBody(body, PaymentStatusResponse.fromJson);
});

/// Presentation-only live-sum preview: `unit × devices/2 × (1 − discount)`.
///
/// Integer RUB rounded up exactly like the server (D-03). This value is never
/// sent to `/payments/create` and never overrides the server-quoted amount.
int previewTotalRub({
  required int unitAmount,
  required int devices,
  int discountPercent = 0,
}) {
  if (unitAmount <= 0) return 0;
  final safeDevices = devices < 2 ? 2 : (devices > 10 ? 10 : devices);
  final percent = discountPercent < 0
      ? 0
      : (discountPercent > 100 ? 100 : discountPercent);
  final numerator = unitAmount * safeDevices * (100 - percent);
  return (numerator + 199) ~/ 200;
}

/// Human-readable label derived from a server term duration (no price).
extension PricingTermX on PricingTerm {
  /// Russian label for the duration.
  String get label => switch (days) {
        7 => "7 дней",
        30 => "1 месяц",
        90 => "3 месяца",
        180 => "6 месяцев",
        365 => "12 месяцев",
        _ => "$days дней",
      };
}
