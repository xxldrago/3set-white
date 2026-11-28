import "package:freezed_annotation/freezed_annotation.dart";

part "subscription.freezed.dart";
part "subscription.g.dart";

/// User identity block kept on `GET /api/mobile/subscription` so Flutter
/// session restore can still read `user.id` from a 200 response.
@freezed
abstract class SubscriptionUser with _$SubscriptionUser {
  /// Creates the identity block.
  const factory SubscriptionUser({
    required int id,
    @JsonKey(name: "telegramId") int? telegramId,
    String? email,
  }) = _SubscriptionUser;

  /// Parses the backend identity block.
  factory SubscriptionUser.fromJson(Map<String, dynamic> json) =>
      _$SubscriptionUserFromJson(json);
}

/// Subscription status from the single `GET /api/mobile/subscription` (D-12).
///
/// [statusKind] and [graceUntil] are server-derived (D-10): this model only
/// decodes them and never computes a grace window or an entitlement decision.
/// [devices] is display-only; add/remove enforcement is Phase 22.
@freezed
abstract class SubscriptionStatus with _$SubscriptionStatus {
  /// Creates a subscription status.
  const factory SubscriptionStatus({
    required bool ok,
    String? error,
    SubscriptionUser? user,
    @JsonKey(name: "expiresAt") String? expiresAt,
    @JsonKey(name: "remainingDays") int? remainingDays,
    @JsonKey(name: "deviceLimit") int? deviceLimit,
    String? link,
    int? devices,
    @JsonKey(name: "isTrial") @Default(false) bool isTrial,
    @JsonKey(name: "statusKind") String? statusKind,
    @JsonKey(name: "graceUntil") String? graceUntil,
  }) = _SubscriptionStatus;

  /// Parses the backend response.
  factory SubscriptionStatus.fromJson(Map<String, dynamic> json) =>
      _$SubscriptionStatusFromJson(json);
}
