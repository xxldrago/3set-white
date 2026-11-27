// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'ping_result.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_PingResult _$PingResultFromJson(Map<String, dynamic> json) => _PingResult(
  online: json['online'] as bool,
  approx: json['approx'] as bool,
  tsMs: (json['tsMs'] as num).toInt(),
  rttMs: (json['rttMs'] as num?)?.toInt(),
);

Map<String, dynamic> _$PingResultToJson(_PingResult instance) =>
    <String, dynamic>{
      'online': instance.online,
      'approx': instance.approx,
      'tsMs': instance.tsMs,
      'rttMs': instance.rttMs,
    };
