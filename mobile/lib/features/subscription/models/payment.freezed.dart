// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint, type=warning, deprecated_member_use, deprecated_member_use_from_same_package
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'payment.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// dart format off
T _$identity<T>(T value) => value;

/// @nodoc
mixin _$PaymentCreateResponse {

 bool get ok;@JsonKey(name: "orderId") String? get orderId;@JsonKey(name: "paymentUrl") String? get paymentUrl; String? get error;@JsonKey(name: "retryAfterSec") int? get retryAfterSec;
/// Create a copy of PaymentCreateResponse
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$PaymentCreateResponseCopyWith<PaymentCreateResponse> get copyWith => _$PaymentCreateResponseCopyWithImpl<PaymentCreateResponse>(this as PaymentCreateResponse, _$identity);

  /// Serializes this PaymentCreateResponse to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  final _this = this as PaymentCreateResponse;
  return identical(this, other) || (other.runtimeType == runtimeType&&other is PaymentCreateResponse&&(identical(other.ok, _this.ok) || other.ok == _this.ok)&&(identical(other.orderId, _this.orderId) || other.orderId == _this.orderId)&&(identical(other.paymentUrl, _this.paymentUrl) || other.paymentUrl == _this.paymentUrl)&&(identical(other.error, _this.error) || other.error == _this.error)&&(identical(other.retryAfterSec, _this.retryAfterSec) || other.retryAfterSec == _this.retryAfterSec));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode {
  final _this = this as PaymentCreateResponse;
  return Object.hash(runtimeType,_this.ok,_this.orderId,_this.paymentUrl,_this.error,_this.retryAfterSec);
}

@override
String toString() {
  final _this = this as PaymentCreateResponse;
  return 'PaymentCreateResponse(ok: ${_this.ok}, orderId: ${_this.orderId}, paymentUrl: ${_this.paymentUrl}, error: ${_this.error}, retryAfterSec: ${_this.retryAfterSec})';
}


}

/// @nodoc
abstract mixin class $PaymentCreateResponseCopyWith<$Res>  {
  factory $PaymentCreateResponseCopyWith(PaymentCreateResponse value, $Res Function(PaymentCreateResponse) _then) = _$PaymentCreateResponseCopyWithImpl;
@useResult
$Res call({
 bool ok,@JsonKey(name: "orderId") String? orderId,@JsonKey(name: "paymentUrl") String? paymentUrl, String? error,@JsonKey(name: "retryAfterSec") int? retryAfterSec
});




}
/// @nodoc
class _$PaymentCreateResponseCopyWithImpl<$Res>
    implements $PaymentCreateResponseCopyWith<$Res> {
  _$PaymentCreateResponseCopyWithImpl(this._self, this._then);

  final PaymentCreateResponse _self;
  final $Res Function(PaymentCreateResponse) _then;

/// Create a copy of PaymentCreateResponse
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? ok = null,Object? orderId = freezed,Object? paymentUrl = freezed,Object? error = freezed,Object? retryAfterSec = freezed,}) {
  return _then(PaymentCreateResponse(
ok: null == ok ? _self.ok : ok // ignore: cast_nullable_to_non_nullable
as bool,orderId: freezed == orderId ? _self.orderId : orderId // ignore: cast_nullable_to_non_nullable
as String?,paymentUrl: freezed == paymentUrl ? _self.paymentUrl : paymentUrl // ignore: cast_nullable_to_non_nullable
as String?,error: freezed == error ? _self.error : error // ignore: cast_nullable_to_non_nullable
as String?,retryAfterSec: freezed == retryAfterSec ? _self.retryAfterSec : retryAfterSec // ignore: cast_nullable_to_non_nullable
as int?,
  ));
}

}


/// Adds pattern-matching-related methods to [PaymentCreateResponse].
extension PaymentCreateResponsePatterns on PaymentCreateResponse {
/// A variant of `map` that fallback to returning `orElse`.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case _:
///     return orElse();
/// }
/// ```

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _PaymentCreateResponse value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _PaymentCreateResponse() when $default != null:
return $default(_that);case _:
  return orElse();

}
}
/// A `switch`-like method, using callbacks.
///
/// Callbacks receives the raw object, upcasted.
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case final Subclass2 value:
///     return ...;
/// }
/// ```

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _PaymentCreateResponse value)  $default,){
final _that = this;
switch (_that) {
case _PaymentCreateResponse():
return $default(_that);case _:
  throw StateError('Unexpected subclass');

}
}
/// A variant of `map` that fallback to returning `null`.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case _:
///     return null;
/// }
/// ```

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _PaymentCreateResponse value)?  $default,){
final _that = this;
switch (_that) {
case _PaymentCreateResponse() when $default != null:
return $default(_that);case _:
  return null;

}
}
/// A variant of `when` that fallback to an `orElse` callback.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case _:
///     return orElse();
/// }
/// ```

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( bool ok, @JsonKey(name: "orderId")  String? orderId, @JsonKey(name: "paymentUrl")  String? paymentUrl,  String? error, @JsonKey(name: "retryAfterSec")  int? retryAfterSec)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _PaymentCreateResponse() when $default != null:
return $default(_that.ok,_that.orderId,_that.paymentUrl,_that.error,_that.retryAfterSec);case _:
  return orElse();

}
}
/// A `switch`-like method, using callbacks.
///
/// As opposed to `map`, this offers destructuring.
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case Subclass2(:final field2):
///     return ...;
/// }
/// ```

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( bool ok, @JsonKey(name: "orderId")  String? orderId, @JsonKey(name: "paymentUrl")  String? paymentUrl,  String? error, @JsonKey(name: "retryAfterSec")  int? retryAfterSec)  $default,) {final _that = this;
switch (_that) {
case _PaymentCreateResponse():
return $default(_that.ok,_that.orderId,_that.paymentUrl,_that.error,_that.retryAfterSec);case _:
  throw StateError('Unexpected subclass');

}
}
/// A variant of `when` that fallback to returning `null`
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case _:
///     return null;
/// }
/// ```

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( bool ok, @JsonKey(name: "orderId")  String? orderId, @JsonKey(name: "paymentUrl")  String? paymentUrl,  String? error, @JsonKey(name: "retryAfterSec")  int? retryAfterSec)?  $default,) {final _that = this;
switch (_that) {
case _PaymentCreateResponse() when $default != null:
return $default(_that.ok,_that.orderId,_that.paymentUrl,_that.error,_that.retryAfterSec);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _PaymentCreateResponse implements PaymentCreateResponse {
  const _PaymentCreateResponse({required this.ok, @JsonKey(name: "orderId") this.orderId, @JsonKey(name: "paymentUrl") this.paymentUrl, this.error, @JsonKey(name: "retryAfterSec") this.retryAfterSec});
  factory _PaymentCreateResponse.fromJson(Map<String, dynamic> json) => _$PaymentCreateResponseFromJson(json);

@override final  bool ok;
@override@JsonKey(name: "orderId") final  String? orderId;
@override@JsonKey(name: "paymentUrl") final  String? paymentUrl;
@override final  String? error;
@override@JsonKey(name: "retryAfterSec") final  int? retryAfterSec;

/// Create a copy of PaymentCreateResponse
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$PaymentCreateResponseCopyWith<_PaymentCreateResponse> get copyWith => __$PaymentCreateResponseCopyWithImpl<_PaymentCreateResponse>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$PaymentCreateResponseToJson(this, );
}

@override
bool operator ==(Object other) {
    return identical(this, other) || (other.runtimeType == runtimeType&&other is _PaymentCreateResponse&&(identical(other.ok, ok) || other.ok == ok)&&(identical(other.orderId, orderId) || other.orderId == orderId)&&(identical(other.paymentUrl, paymentUrl) || other.paymentUrl == paymentUrl)&&(identical(other.error, error) || other.error == error)&&(identical(other.retryAfterSec, retryAfterSec) || other.retryAfterSec == retryAfterSec));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode {
    return Object.hash(runtimeType,ok,orderId,paymentUrl,error,retryAfterSec);
}

@override
String toString() {
    return 'PaymentCreateResponse(ok: $ok, orderId: $orderId, paymentUrl: $paymentUrl, error: $error, retryAfterSec: $retryAfterSec)';
}


}

/// @nodoc
abstract mixin class _$PaymentCreateResponseCopyWith<$Res> implements $PaymentCreateResponseCopyWith<$Res> {
  factory _$PaymentCreateResponseCopyWith(_PaymentCreateResponse value, $Res Function(_PaymentCreateResponse) _then) = __$PaymentCreateResponseCopyWithImpl;
@override @useResult
$Res call({
 bool ok,@JsonKey(name: "orderId") String? orderId,@JsonKey(name: "paymentUrl") String? paymentUrl, String? error,@JsonKey(name: "retryAfterSec") int? retryAfterSec
});




}
/// @nodoc
class __$PaymentCreateResponseCopyWithImpl<$Res>
    implements _$PaymentCreateResponseCopyWith<$Res> {
  __$PaymentCreateResponseCopyWithImpl(this._self, this._then);

  final _PaymentCreateResponse _self;
  final $Res Function(_PaymentCreateResponse) _then;

/// Create a copy of PaymentCreateResponse
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? ok = null,Object? orderId = freezed,Object? paymentUrl = freezed,Object? error = freezed,Object? retryAfterSec = freezed,}) {
  return _then(_PaymentCreateResponse(
ok: null == ok ? _self.ok : ok // ignore: cast_nullable_to_non_nullable
as bool,orderId: freezed == orderId ? _self.orderId : orderId // ignore: cast_nullable_to_non_nullable
as String?,paymentUrl: freezed == paymentUrl ? _self.paymentUrl : paymentUrl // ignore: cast_nullable_to_non_nullable
as String?,error: freezed == error ? _self.error : error // ignore: cast_nullable_to_non_nullable
as String?,retryAfterSec: freezed == retryAfterSec ? _self.retryAfterSec : retryAfterSec // ignore: cast_nullable_to_non_nullable
as int?,
  ));
}


}


/// @nodoc
mixin _$PaymentStatusResponse {

 bool get ok; String? get status;@JsonKey(name: "paidAt") String? get paidAt;@JsonKey(name: "provisionedKeyId") String? get provisionedKeyId; String? get error;
/// Create a copy of PaymentStatusResponse
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$PaymentStatusResponseCopyWith<PaymentStatusResponse> get copyWith => _$PaymentStatusResponseCopyWithImpl<PaymentStatusResponse>(this as PaymentStatusResponse, _$identity);

  /// Serializes this PaymentStatusResponse to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  final _this = this as PaymentStatusResponse;
  return identical(this, other) || (other.runtimeType == runtimeType&&other is PaymentStatusResponse&&(identical(other.ok, _this.ok) || other.ok == _this.ok)&&(identical(other.status, _this.status) || other.status == _this.status)&&(identical(other.paidAt, _this.paidAt) || other.paidAt == _this.paidAt)&&(identical(other.provisionedKeyId, _this.provisionedKeyId) || other.provisionedKeyId == _this.provisionedKeyId)&&(identical(other.error, _this.error) || other.error == _this.error));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode {
  final _this = this as PaymentStatusResponse;
  return Object.hash(runtimeType,_this.ok,_this.status,_this.paidAt,_this.provisionedKeyId,_this.error);
}

@override
String toString() {
  final _this = this as PaymentStatusResponse;
  return 'PaymentStatusResponse(ok: ${_this.ok}, status: ${_this.status}, paidAt: ${_this.paidAt}, provisionedKeyId: ${_this.provisionedKeyId}, error: ${_this.error})';
}


}

/// @nodoc
abstract mixin class $PaymentStatusResponseCopyWith<$Res>  {
  factory $PaymentStatusResponseCopyWith(PaymentStatusResponse value, $Res Function(PaymentStatusResponse) _then) = _$PaymentStatusResponseCopyWithImpl;
@useResult
$Res call({
 bool ok, String? status,@JsonKey(name: "paidAt") String? paidAt,@JsonKey(name: "provisionedKeyId") String? provisionedKeyId, String? error
});




}
/// @nodoc
class _$PaymentStatusResponseCopyWithImpl<$Res>
    implements $PaymentStatusResponseCopyWith<$Res> {
  _$PaymentStatusResponseCopyWithImpl(this._self, this._then);

  final PaymentStatusResponse _self;
  final $Res Function(PaymentStatusResponse) _then;

/// Create a copy of PaymentStatusResponse
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? ok = null,Object? status = freezed,Object? paidAt = freezed,Object? provisionedKeyId = freezed,Object? error = freezed,}) {
  return _then(PaymentStatusResponse(
ok: null == ok ? _self.ok : ok // ignore: cast_nullable_to_non_nullable
as bool,status: freezed == status ? _self.status : status // ignore: cast_nullable_to_non_nullable
as String?,paidAt: freezed == paidAt ? _self.paidAt : paidAt // ignore: cast_nullable_to_non_nullable
as String?,provisionedKeyId: freezed == provisionedKeyId ? _self.provisionedKeyId : provisionedKeyId // ignore: cast_nullable_to_non_nullable
as String?,error: freezed == error ? _self.error : error // ignore: cast_nullable_to_non_nullable
as String?,
  ));
}

}


/// Adds pattern-matching-related methods to [PaymentStatusResponse].
extension PaymentStatusResponsePatterns on PaymentStatusResponse {
/// A variant of `map` that fallback to returning `orElse`.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case _:
///     return orElse();
/// }
/// ```

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _PaymentStatusResponse value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _PaymentStatusResponse() when $default != null:
return $default(_that);case _:
  return orElse();

}
}
/// A `switch`-like method, using callbacks.
///
/// Callbacks receives the raw object, upcasted.
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case final Subclass2 value:
///     return ...;
/// }
/// ```

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _PaymentStatusResponse value)  $default,){
final _that = this;
switch (_that) {
case _PaymentStatusResponse():
return $default(_that);case _:
  throw StateError('Unexpected subclass');

}
}
/// A variant of `map` that fallback to returning `null`.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case _:
///     return null;
/// }
/// ```

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _PaymentStatusResponse value)?  $default,){
final _that = this;
switch (_that) {
case _PaymentStatusResponse() when $default != null:
return $default(_that);case _:
  return null;

}
}
/// A variant of `when` that fallback to an `orElse` callback.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case _:
///     return orElse();
/// }
/// ```

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( bool ok,  String? status, @JsonKey(name: "paidAt")  String? paidAt, @JsonKey(name: "provisionedKeyId")  String? provisionedKeyId,  String? error)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _PaymentStatusResponse() when $default != null:
return $default(_that.ok,_that.status,_that.paidAt,_that.provisionedKeyId,_that.error);case _:
  return orElse();

}
}
/// A `switch`-like method, using callbacks.
///
/// As opposed to `map`, this offers destructuring.
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case Subclass2(:final field2):
///     return ...;
/// }
/// ```

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( bool ok,  String? status, @JsonKey(name: "paidAt")  String? paidAt, @JsonKey(name: "provisionedKeyId")  String? provisionedKeyId,  String? error)  $default,) {final _that = this;
switch (_that) {
case _PaymentStatusResponse():
return $default(_that.ok,_that.status,_that.paidAt,_that.provisionedKeyId,_that.error);case _:
  throw StateError('Unexpected subclass');

}
}
/// A variant of `when` that fallback to returning `null`
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case _:
///     return null;
/// }
/// ```

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( bool ok,  String? status, @JsonKey(name: "paidAt")  String? paidAt, @JsonKey(name: "provisionedKeyId")  String? provisionedKeyId,  String? error)?  $default,) {final _that = this;
switch (_that) {
case _PaymentStatusResponse() when $default != null:
return $default(_that.ok,_that.status,_that.paidAt,_that.provisionedKeyId,_that.error);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _PaymentStatusResponse implements PaymentStatusResponse {
  const _PaymentStatusResponse({required this.ok, this.status, @JsonKey(name: "paidAt") this.paidAt, @JsonKey(name: "provisionedKeyId") this.provisionedKeyId, this.error});
  factory _PaymentStatusResponse.fromJson(Map<String, dynamic> json) => _$PaymentStatusResponseFromJson(json);

@override final  bool ok;
@override final  String? status;
@override@JsonKey(name: "paidAt") final  String? paidAt;
@override@JsonKey(name: "provisionedKeyId") final  String? provisionedKeyId;
@override final  String? error;

/// Create a copy of PaymentStatusResponse
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$PaymentStatusResponseCopyWith<_PaymentStatusResponse> get copyWith => __$PaymentStatusResponseCopyWithImpl<_PaymentStatusResponse>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$PaymentStatusResponseToJson(this, );
}

@override
bool operator ==(Object other) {
    return identical(this, other) || (other.runtimeType == runtimeType&&other is _PaymentStatusResponse&&(identical(other.ok, ok) || other.ok == ok)&&(identical(other.status, status) || other.status == status)&&(identical(other.paidAt, paidAt) || other.paidAt == paidAt)&&(identical(other.provisionedKeyId, provisionedKeyId) || other.provisionedKeyId == provisionedKeyId)&&(identical(other.error, error) || other.error == error));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode {
    return Object.hash(runtimeType,ok,status,paidAt,provisionedKeyId,error);
}

@override
String toString() {
    return 'PaymentStatusResponse(ok: $ok, status: $status, paidAt: $paidAt, provisionedKeyId: $provisionedKeyId, error: $error)';
}


}

/// @nodoc
abstract mixin class _$PaymentStatusResponseCopyWith<$Res> implements $PaymentStatusResponseCopyWith<$Res> {
  factory _$PaymentStatusResponseCopyWith(_PaymentStatusResponse value, $Res Function(_PaymentStatusResponse) _then) = __$PaymentStatusResponseCopyWithImpl;
@override @useResult
$Res call({
 bool ok, String? status,@JsonKey(name: "paidAt") String? paidAt,@JsonKey(name: "provisionedKeyId") String? provisionedKeyId, String? error
});




}
/// @nodoc
class __$PaymentStatusResponseCopyWithImpl<$Res>
    implements _$PaymentStatusResponseCopyWith<$Res> {
  __$PaymentStatusResponseCopyWithImpl(this._self, this._then);

  final _PaymentStatusResponse _self;
  final $Res Function(_PaymentStatusResponse) _then;

/// Create a copy of PaymentStatusResponse
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? ok = null,Object? status = freezed,Object? paidAt = freezed,Object? provisionedKeyId = freezed,Object? error = freezed,}) {
  return _then(_PaymentStatusResponse(
ok: null == ok ? _self.ok : ok // ignore: cast_nullable_to_non_nullable
as bool,status: freezed == status ? _self.status : status // ignore: cast_nullable_to_non_nullable
as String?,paidAt: freezed == paidAt ? _self.paidAt : paidAt // ignore: cast_nullable_to_non_nullable
as String?,provisionedKeyId: freezed == provisionedKeyId ? _self.provisionedKeyId : provisionedKeyId // ignore: cast_nullable_to_non_nullable
as String?,error: freezed == error ? _self.error : error // ignore: cast_nullable_to_non_nullable
as String?,
  ));
}


}

// dart format on
