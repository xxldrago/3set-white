// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'device.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_Device _$DeviceFromJson(Map<String, dynamic> json) => _Device(
  token: json['token'] as String,
  label: json['label'] as String?,
  name: json['name'] as String?,
);

Map<String, dynamic> _$DeviceToJson(_Device instance) => <String, dynamic>{
  'token': instance.token,
  'label': instance.label,
  'name': instance.name,
};

_DevicesPayload _$DevicesPayloadFromJson(Map<String, dynamic> json) =>
    _DevicesPayload(
      ok: json['ok'] as bool,
      error: json['error'] as String?,
      deviceLimit: (json['deviceLimit'] as num?)?.toInt(),
      devices: (json['devices'] as List<dynamic>?)
          ?.map((e) => Device.fromJson(e as Map<String, dynamic>))
          .toList(),
    );

Map<String, dynamic> _$DevicesPayloadToJson(_DevicesPayload instance) =>
    <String, dynamic>{
      'ok': instance.ok,
      'error': instance.error,
      'deviceLimit': instance.deviceLimit,
      'devices': instance.devices,
    };
