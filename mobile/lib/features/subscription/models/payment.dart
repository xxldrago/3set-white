import "package:freezed_annotation/freezed_annotation.dart";

part "payment.freezed.dart";
part "payment.g.dart";

/// Response of `POST /api/mobile/payments/create` (plan 01, D-04).
///
/// The client sends intent only; the server quotes the amount. This model
/// carries our non-secret order id and the server-returned hosted payment URL
/// and deliberately has no `amount` or provider transaction field.
@freezed
abstract class PaymentCreateResponse with _$PaymentCreateResponse {
  /// Creates a payment-create response.
  const factory PaymentCreateResponse({
    required bool ok,
    @JsonKey(name: "orderId") String? orderId,
    @JsonKey(name: "paymentUrl") String? paymentUrl,
    String? error,
    @JsonKey(name: "retryAfterSec") int? retryAfterSec,
  }) = _PaymentCreateResponse;

  /// Parses the backend response.
  factory PaymentCreateResponse.fromJson(Map<String, dynamic> json) =>
      _$PaymentCreateResponseFromJson(json);
}

/// Response of `GET /api/mobile/payments/status/{orderId}` (D-06).
///
/// Success is the DB status written by the shared webhook → outbox → worker;
/// the poll has no side effect and never carries a provider URL/transaction.
@freezed
abstract class PaymentStatusResponse with _$PaymentStatusResponse {
  /// Creates a payment-status response.
  const factory PaymentStatusResponse({
    required bool ok,
    String? status,
    @JsonKey(name: "paidAt") String? paidAt,
    @JsonKey(name: "provisionedKeyId") String? provisionedKeyId,
    String? error,
  }) = _PaymentStatusResponse;

  /// Parses the backend response.
  factory PaymentStatusResponse.fromJson(Map<String, dynamic> json) =>
      _$PaymentStatusResponseFromJson(json);
}
