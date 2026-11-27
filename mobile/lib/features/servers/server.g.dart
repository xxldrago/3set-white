// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'server.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_Server _$ServerFromJson(Map<String, dynamic> json) => _Server(
  id: json['id'] as String,
  name: json['name'] as String,
  city: json['city'] as String,
  cc: json['cc'] as String,
  flag: json['flag'] as String,
  proto: json['proto'] as String,
  sni: json['sni'] as String?,
  tab: $enumDecode(_$PoolTabEnumMap, json['tab']),
  host: json['host'] as String,
  port: (json['port'] as num).toInt(),
  protocol: json['protocol'] as String,
  outbound: json['outbound'] as Map<String, dynamic>,
);

Map<String, dynamic> _$ServerToJson(_Server instance) => <String, dynamic>{
  'id': instance.id,
  'name': instance.name,
  'city': instance.city,
  'cc': instance.cc,
  'flag': instance.flag,
  'proto': instance.proto,
  'sni': instance.sni,
  'tab': _$PoolTabEnumMap[instance.tab]!,
  'host': instance.host,
  'port': instance.port,
  'protocol': instance.protocol,
  'outbound': instance.outbound,
};

const _$PoolTabEnumMap = {
  PoolTab.simple: 'simple',
  PoolTab.whitelist: 'whitelist',
};

_ServerKey _$ServerKeyFromJson(Map<String, dynamic> json) => _ServerKey(
  active: json['active'] as bool,
  keyId: json['keyId'] as String,
  isTrial: json['isTrial'] as bool,
  remainingDays: (json['remainingDays'] as num?)?.toInt(),
  expireAt: json['expireAt'] as String?,
);

Map<String, dynamic> _$ServerKeyToJson(_ServerKey instance) =>
    <String, dynamic>{
      'active': instance.active,
      'keyId': instance.keyId,
      'isTrial': instance.isTrial,
      'remainingDays': instance.remainingDays,
      'expireAt': instance.expireAt,
    };

_ServerPools _$ServerPoolsFromJson(Map<String, dynamic> json) => _ServerPools(
  simple:
      (json['simple'] as List<dynamic>?)
          ?.map((e) => Server.fromJson(e as Map<String, dynamic>))
          .toList() ??
      const <Server>[],
  whitelist:
      (json['whitelist'] as List<dynamic>?)
          ?.map((e) => Server.fromJson(e as Map<String, dynamic>))
          .toList() ??
      const <Server>[],
  key: json['key'] == null
      ? null
      : ServerKey.fromJson(json['key'] as Map<String, dynamic>),
  error: json['error'] as String?,
  notice: json['notice'] as String?,
  stale: json['stale'] as bool? ?? false,
);

Map<String, dynamic> _$ServerPoolsToJson(_ServerPools instance) =>
    <String, dynamic>{
      'simple': instance.simple,
      'whitelist': instance.whitelist,
      'key': instance.key,
      'error': instance.error,
      'notice': instance.notice,
      'stale': instance.stale,
    };
