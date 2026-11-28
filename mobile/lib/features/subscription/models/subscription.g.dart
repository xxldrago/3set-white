// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'subscription.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_SubscriptionUser _$SubscriptionUserFromJson(Map<String, dynamic> json) =>
    _SubscriptionUser(
      id: (json['id'] as num).toInt(),
      telegramId: (json['telegramId'] as num?)?.toInt(),
      email: json['email'] as String?,
    );

Map<String, dynamic> _$SubscriptionUserToJson(_SubscriptionUser instance) =>
    <String, dynamic>{
      'id': instance.id,
      'telegramId': instance.telegramId,
      'email': instance.email,
    };

_SubscriptionStatus _$SubscriptionStatusFromJson(Map<String, dynamic> json) =>
    _SubscriptionStatus(
      ok: json['ok'] as bool,
      error: json['error'] as String?,
      user: json['user'] == null
          ? null
          : SubscriptionUser.fromJson(json['user'] as Map<String, dynamic>),
      expiresAt: json['expiresAt'] as String?,
      remainingDays: (json['remainingDays'] as num?)?.toInt(),
      deviceLimit: (json['deviceLimit'] as num?)?.toInt(),
      link: json['link'] as String?,
      devices: (json['devices'] as num?)?.toInt(),
      isTrial: json['isTrial'] as bool? ?? false,
      statusKind: json['statusKind'] as String?,
      graceUntil: json['graceUntil'] as String?,
    );

Map<String, dynamic> _$SubscriptionStatusToJson(_SubscriptionStatus instance) =>
    <String, dynamic>{
      'ok': instance.ok,
      'error': instance.error,
      'user': instance.user,
      'expiresAt': instance.expiresAt,
      'remainingDays': instance.remainingDays,
      'deviceLimit': instance.deviceLimit,
      'link': instance.link,
      'devices': instance.devices,
      'isTrial': instance.isTrial,
      'statusKind': instance.statusKind,
      'graceUntil': instance.graceUntil,
    };
