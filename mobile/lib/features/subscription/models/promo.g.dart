// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'promo.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_PromoPreview _$PromoPreviewFromJson(Map<String, dynamic> json) =>
    _PromoPreview(
      ok: json['ok'] as bool,
      code: json['code'] as String?,
      discountPercent: (json['discountPercent'] as num?)?.toInt(),
      error: json['error'] as String?,
    );

Map<String, dynamic> _$PromoPreviewToJson(_PromoPreview instance) =>
    <String, dynamic>{
      'ok': instance.ok,
      'code': instance.code,
      'discountPercent': instance.discountPercent,
      'error': instance.error,
    };
