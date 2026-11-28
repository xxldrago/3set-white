import "package:freezed_annotation/freezed_annotation.dart";

part "pricing.freezed.dart";
part "pricing.g.dart";

/// One server-quoted term from `GET /api/mobile/pricing` (D-01).
///
/// [amount] is an integer RUB value already rounded up by the backend; the
/// client never generates or rounds a price of its own.
@freezed
abstract class PricingTerm with _$PricingTerm {
  /// Creates one pricing term.
  const factory PricingTerm({
    required int days,
    required int amount,
  }) = _PricingTerm;

  /// Parses one backend term.
  factory PricingTerm.fromJson(Map<String, dynamic> json) =>
      _$PricingTermFromJson(json);
}

/// Response of `GET /api/mobile/pricing?devices=N`.
///
/// Terms arrive in server order; `error` carries a stable machine code when
/// the backend degrades to `{ok:false,error}`. There is deliberately no
/// client-authoritative amount field and no provider key.
@freezed
abstract class PricingResponse with _$PricingResponse {
  /// Creates a pricing response.
  const factory PricingResponse({
    required bool ok,
    String? currency,
    @Default(<PricingTerm>[]) List<PricingTerm> terms,
    String? error,
    @JsonKey(name: "retryAfterSec") int? retryAfterSec,
  }) = _PricingResponse;

  /// Parses the backend response.
  factory PricingResponse.fromJson(Map<String, dynamic> json) =>
      _$PricingResponseFromJson(json);
}
