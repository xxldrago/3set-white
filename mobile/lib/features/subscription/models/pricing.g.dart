// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'pricing.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_PricingTerm _$PricingTermFromJson(Map<String, dynamic> json) => _PricingTerm(
  days: (json['days'] as num).toInt(),
  amount: (json['amount'] as num).toInt(),
);

Map<String, dynamic> _$PricingTermToJson(_PricingTerm instance) =>
    <String, dynamic>{'days': instance.days, 'amount': instance.amount};

_PricingResponse _$PricingResponseFromJson(Map<String, dynamic> json) =>
    _PricingResponse(
      ok: json['ok'] as bool,
      currency: json['currency'] as String?,
      terms:
          (json['terms'] as List<dynamic>?)
              ?.map((e) => PricingTerm.fromJson(e as Map<String, dynamic>))
              .toList() ??
          const <PricingTerm>[],
      error: json['error'] as String?,
      retryAfterSec: (json['retryAfterSec'] as num?)?.toInt(),
    );

Map<String, dynamic> _$PricingResponseToJson(_PricingResponse instance) =>
    <String, dynamic>{
      'ok': instance.ok,
      'currency': instance.currency,
      'terms': instance.terms,
      'error': instance.error,
      'retryAfterSec': instance.retryAfterSec,
    };
