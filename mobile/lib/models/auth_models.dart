import 'package:freezed_annotation/freezed_annotation.dart';

part 'auth_models.freezed.dart';
part 'auth_models.g.dart';

@freezed
abstract class TokenPair with _$TokenPair {
  const factory TokenPair({
    required String accessToken,
    required String refreshToken,
    @JsonKey(name: 'expires_in') required int expiresIn,
    @JsonKey(name: 'user_id') int? userId,
  }) = _TokenPair;

  factory TokenPair.fromJson(Map<String, dynamic> json) => _$TokenPairFromJson(json);
}

@freezed
abstract class User with _$User {
  const factory User({
    required int id,
    @JsonKey(name: 'telegram_id') int? telegramId,
    String? email,
  }) = _User;

  factory User.fromJson(Map<String, dynamic> json) => _$UserFromJson(json);
}

@freezed
abstract class LoginRequest with _$LoginRequest {
  const factory LoginRequest({
    required String email,
    required String password,
    @JsonKey(name: 'token_pair') @Default(true) bool tokenPair,
  }) = _LoginRequest;

  factory LoginRequest.fromJson(Map<String, dynamic> json) => _$LoginRequestFromJson(json);
}

@freezed
abstract class RegisterRequest with _$RegisterRequest {
  const factory RegisterRequest({
    required String email,
    required String password,
    @JsonKey(name: 'confirm_password') required String confirmPassword,
  }) = _RegisterRequest;

  factory RegisterRequest.fromJson(Map<String, dynamic> json) => _$RegisterRequestFromJson(json);
}

@freezed
abstract class AuthResponse with _$AuthResponse {
  const factory AuthResponse({
    required String accessToken,
    required String refreshToken,
    @JsonKey(name: 'expires_in') required int expiresIn,
  }) = _AuthResponse;

  factory AuthResponse.fromJson(Map<String, dynamic> json) => _$AuthResponseFromJson(json);
}

@freezed
abstract class TelegramNonceResponse with _$TelegramNonceResponse {
  const factory TelegramNonceResponse({
    required String nonce,
    @JsonKey(name: 'expires_in') required int expiresIn,
  }) = _TelegramNonceResponse;

  factory TelegramNonceResponse.fromJson(Map<String, dynamic> json) => _$TelegramNonceResponseFromJson(json);
}

@freezed
abstract class TelegramPollResponse with _$TelegramPollResponse {
  const factory TelegramPollResponse.pending({@Default('pending') String status}) = _Pending;
  const factory TelegramPollResponse.success({required TokenPair tokenPair}) = _Success;
  const factory TelegramPollResponse.error({required String error}) = _Error;

  factory TelegramPollResponse.fromJson(Map<String, dynamic> json) => _$TelegramPollResponseFromJson(json);
}

@freezed
abstract class SubscriptionResponse with _$SubscriptionResponse {
  const factory SubscriptionResponse({
    required User user,
    @Default([]) List<dynamic> keys,
  }) = _SubscriptionResponse;

  factory SubscriptionResponse.fromJson(Map<String, dynamic> json) => _$SubscriptionResponseFromJson(json);
}

@freezed
abstract class ApiError with _$ApiError {
  const factory ApiError({required String error, int? retryAfterSec}) = _ApiError;

  factory ApiError.fromJson(Map<String, dynamic> json) => _$ApiErrorFromJson(json);
}