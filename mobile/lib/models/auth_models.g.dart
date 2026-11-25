// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'auth_models.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_TokenPair _$TokenPairFromJson(Map<String, dynamic> json) => _TokenPair(
  accessToken: json['accessToken'] as String,
  refreshToken: json['refreshToken'] as String,
  expiresIn: (json['expires_in'] as num).toInt(),
  userId: (json['user_id'] as num?)?.toInt(),
);

Map<String, dynamic> _$TokenPairToJson(_TokenPair instance) =>
    <String, dynamic>{
      'accessToken': instance.accessToken,
      'refreshToken': instance.refreshToken,
      'expires_in': instance.expiresIn,
      'user_id': instance.userId,
    };

_User _$UserFromJson(Map<String, dynamic> json) => _User(
  id: (json['id'] as num).toInt(),
  telegramId: (json['telegram_id'] as num?)?.toInt(),
  email: json['email'] as String?,
);

Map<String, dynamic> _$UserToJson(_User instance) => <String, dynamic>{
  'id': instance.id,
  'telegram_id': instance.telegramId,
  'email': instance.email,
};

_LoginRequest _$LoginRequestFromJson(Map<String, dynamic> json) =>
    _LoginRequest(
      email: json['email'] as String,
      password: json['password'] as String,
      tokenPair: json['token_pair'] as bool? ?? true,
    );

Map<String, dynamic> _$LoginRequestToJson(_LoginRequest instance) =>
    <String, dynamic>{
      'email': instance.email,
      'password': instance.password,
      'token_pair': instance.tokenPair,
    };

_RegisterRequest _$RegisterRequestFromJson(Map<String, dynamic> json) =>
    _RegisterRequest(
      email: json['email'] as String,
      password: json['password'] as String,
      confirmPassword: json['confirm_password'] as String,
    );

Map<String, dynamic> _$RegisterRequestToJson(_RegisterRequest instance) =>
    <String, dynamic>{
      'email': instance.email,
      'password': instance.password,
      'confirm_password': instance.confirmPassword,
    };

_AuthResponse _$AuthResponseFromJson(Map<String, dynamic> json) =>
    _AuthResponse(
      accessToken: json['accessToken'] as String,
      refreshToken: json['refreshToken'] as String,
      expiresIn: (json['expires_in'] as num).toInt(),
    );

Map<String, dynamic> _$AuthResponseToJson(_AuthResponse instance) =>
    <String, dynamic>{
      'accessToken': instance.accessToken,
      'refreshToken': instance.refreshToken,
      'expires_in': instance.expiresIn,
    };

_TelegramNonceResponse _$TelegramNonceResponseFromJson(
  Map<String, dynamic> json,
) => _TelegramNonceResponse(
  nonce: json['nonce'] as String,
  expiresIn: (json['expires_in'] as num).toInt(),
);

Map<String, dynamic> _$TelegramNonceResponseToJson(
  _TelegramNonceResponse instance,
) => <String, dynamic>{
  'nonce': instance.nonce,
  'expires_in': instance.expiresIn,
};

_Pending _$PendingFromJson(Map<String, dynamic> json) => _Pending(
  status: json['status'] as String? ?? 'pending',
  $type: json['runtimeType'] as String?,
);

Map<String, dynamic> _$PendingToJson(_Pending instance) => <String, dynamic>{
  'status': instance.status,
  'runtimeType': instance.$type,
};

_Success _$SuccessFromJson(Map<String, dynamic> json) => _Success(
  tokenPair: TokenPair.fromJson(json['tokenPair'] as Map<String, dynamic>),
  $type: json['runtimeType'] as String?,
);

Map<String, dynamic> _$SuccessToJson(_Success instance) => <String, dynamic>{
  'tokenPair': instance.tokenPair,
  'runtimeType': instance.$type,
};

_Error _$ErrorFromJson(Map<String, dynamic> json) => _Error(
  error: json['error'] as String,
  $type: json['runtimeType'] as String?,
);

Map<String, dynamic> _$ErrorToJson(_Error instance) => <String, dynamic>{
  'error': instance.error,
  'runtimeType': instance.$type,
};

_SubscriptionResponse _$SubscriptionResponseFromJson(
  Map<String, dynamic> json,
) => _SubscriptionResponse(
  user: User.fromJson(json['user'] as Map<String, dynamic>),
  keys: json['keys'] as List<dynamic>? ?? const [],
);

Map<String, dynamic> _$SubscriptionResponseToJson(
  _SubscriptionResponse instance,
) => <String, dynamic>{'user': instance.user, 'keys': instance.keys};

_ApiError _$ApiErrorFromJson(Map<String, dynamic> json) => _ApiError(
  error: json['error'] as String,
  retryAfterSec: (json['retryAfterSec'] as num?)?.toInt(),
);

Map<String, dynamic> _$ApiErrorToJson(_ApiError instance) => <String, dynamic>{
  'error': instance.error,
  'retryAfterSec': instance.retryAfterSec,
};
