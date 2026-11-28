import "package:freezed_annotation/freezed_annotation.dart";

part "promo.freezed.dart";
part "promo.g.dart";

/// Read-only promo preview from `POST /api/mobile/promo/apply` (D-08).
///
/// The backend returns a percentage only — never an authoritative amount — and
/// the real code consumption stays inside `createOrder`. No price field exists
/// here so no client state can accidentally become a discount authority.
@freezed
abstract class PromoPreview with _$PromoPreview {
  /// Creates a promo preview.
  const factory PromoPreview({
    required bool ok,
    String? code,
    @JsonKey(name: "discountPercent") int? discountPercent,
    String? error,
  }) = _PromoPreview;

  /// Parses the backend response.
  factory PromoPreview.fromJson(Map<String, dynamic> json) =>
      _$PromoPreviewFromJson(json);
}
