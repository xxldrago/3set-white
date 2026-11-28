// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'payment.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_PaymentCreateResponse _$PaymentCreateResponseFromJson(
  Map<String, dynamic> json,
) => _PaymentCreateResponse(
  ok: json['ok'] as bool,
  orderId: json['orderId'] as String?,
  paymentUrl: json['paymentUrl'] as String?,
  error: json['error'] as String?,
  retryAfterSec: (json['retryAfterSec'] as num?)?.toInt(),
);

Map<String, dynamic> _$PaymentCreateResponseToJson(
  _PaymentCreateResponse instance,
) => <String, dynamic>{
  'ok': instance.ok,
  'orderId': instance.orderId,
  'paymentUrl': instance.paymentUrl,
  'error': instance.error,
  'retryAfterSec': instance.retryAfterSec,
};

_PaymentStatusResponse _$PaymentStatusResponseFromJson(
  Map<String, dynamic> json,
) => _PaymentStatusResponse(
  ok: json['ok'] as bool,
  status: json['status'] as String?,
  paidAt: json['paidAt'] as String?,
  provisionedKeyId: json['provisionedKeyId'] as String?,
  error: json['error'] as String?,
);

Map<String, dynamic> _$PaymentStatusResponseToJson(
  _PaymentStatusResponse instance,
) => <String, dynamic>{
  'ok': instance.ok,
  'status': instance.status,
  'paidAt': instance.paidAt,
  'provisionedKeyId': instance.provisionedKeyId,
  'error': instance.error,
};
