// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint, type=warning, deprecated_member_use, deprecated_member_use_from_same_package
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'pricing.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// dart format off
T _$identity<T>(T value) => value;

/// @nodoc
mixin _$PricingTerm {

 int get days; int get amount;
/// Create a copy of PricingTerm
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$PricingTermCopyWith<PricingTerm> get copyWith => _$PricingTermCopyWithImpl<PricingTerm>(this as PricingTerm, _$identity);

  /// Serializes this PricingTerm to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  final _this = this as PricingTerm;
  return identical(this, other) || (other.runtimeType == runtimeType&&other is PricingTerm&&(identical(other.days, _this.days) || other.days == _this.days)&&(identical(other.amount, _this.amount) || other.amount == _this.amount));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode {
  final _this = this as PricingTerm;
  return Object.hash(runtimeType,_this.days,_this.amount);
}

@override
String toString() {
  final _this = this as PricingTerm;
  return 'PricingTerm(days: ${_this.days}, amount: ${_this.amount})';
}


}

/// @nodoc
abstract mixin class $PricingTermCopyWith<$Res>  {
  factory $PricingTermCopyWith(PricingTerm value, $Res Function(PricingTerm) _then) = _$PricingTermCopyWithImpl;
@useResult
$Res call({
 int days, int amount
});




}
/// @nodoc
class _$PricingTermCopyWithImpl<$Res>
    implements $PricingTermCopyWith<$Res> {
  _$PricingTermCopyWithImpl(this._self, this._then);

  final PricingTerm _self;
  final $Res Function(PricingTerm) _then;

/// Create a copy of PricingTerm
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? days = null,Object? amount = null,}) {
  return _then(PricingTerm(
days: null == days ? _self.days : days // ignore: cast_nullable_to_non_nullable
as int,amount: null == amount ? _self.amount : amount // ignore: cast_nullable_to_non_nullable
as int,
  ));
}

}


/// Adds pattern-matching-related methods to [PricingTerm].
extension PricingTermPatterns on PricingTerm {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _PricingTerm value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _PricingTerm() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _PricingTerm value)  $default,){
final _that = this;
switch (_that) {
case _PricingTerm():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _PricingTerm value)?  $default,){
final _that = this;
switch (_that) {
case _PricingTerm() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( int days,  int amount)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _PricingTerm() when $default != null:
return $default(_that.days,_that.amount);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( int days,  int amount)  $default,) {final _that = this;
switch (_that) {
case _PricingTerm():
return $default(_that.days,_that.amount);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( int days,  int amount)?  $default,) {final _that = this;
switch (_that) {
case _PricingTerm() when $default != null:
return $default(_that.days,_that.amount);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _PricingTerm implements PricingTerm {
  const _PricingTerm({required this.days, required this.amount});
  factory _PricingTerm.fromJson(Map<String, dynamic> json) => _$PricingTermFromJson(json);

@override final  int days;
@override final  int amount;

/// Create a copy of PricingTerm
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$PricingTermCopyWith<_PricingTerm> get copyWith => __$PricingTermCopyWithImpl<_PricingTerm>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$PricingTermToJson(this, );
}

@override
bool operator ==(Object other) {
    return identical(this, other) || (other.runtimeType == runtimeType&&other is _PricingTerm&&(identical(other.days, days) || other.days == days)&&(identical(other.amount, amount) || other.amount == amount));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode {
    return Object.hash(runtimeType,days,amount);
}

@override
String toString() {
    return 'PricingTerm(days: $days, amount: $amount)';
}


}

/// @nodoc
abstract mixin class _$PricingTermCopyWith<$Res> implements $PricingTermCopyWith<$Res> {
  factory _$PricingTermCopyWith(_PricingTerm value, $Res Function(_PricingTerm) _then) = __$PricingTermCopyWithImpl;
@override @useResult
$Res call({
 int days, int amount
});




}
/// @nodoc
class __$PricingTermCopyWithImpl<$Res>
    implements _$PricingTermCopyWith<$Res> {
  __$PricingTermCopyWithImpl(this._self, this._then);

  final _PricingTerm _self;
  final $Res Function(_PricingTerm) _then;

/// Create a copy of PricingTerm
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? days = null,Object? amount = null,}) {
  return _then(_PricingTerm(
days: null == days ? _self.days : days // ignore: cast_nullable_to_non_nullable
as int,amount: null == amount ? _self.amount : amount // ignore: cast_nullable_to_non_nullable
as int,
  ));
}


}


/// @nodoc
mixin _$PricingResponse {

 bool get ok; String? get currency; List<PricingTerm> get terms; String? get error;@JsonKey(name: "retryAfterSec") int? get retryAfterSec;
/// Create a copy of PricingResponse
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$PricingResponseCopyWith<PricingResponse> get copyWith => _$PricingResponseCopyWithImpl<PricingResponse>(this as PricingResponse, _$identity);

  /// Serializes this PricingResponse to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  final _this = this as PricingResponse;
  return identical(this, other) || (other.runtimeType == runtimeType&&other is PricingResponse&&(identical(other.ok, _this.ok) || other.ok == _this.ok)&&(identical(other.currency, _this.currency) || other.currency == _this.currency)&&const DeepCollectionEquality().equals(other.terms, _this.terms)&&(identical(other.error, _this.error) || other.error == _this.error)&&(identical(other.retryAfterSec, _this.retryAfterSec) || other.retryAfterSec == _this.retryAfterSec));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode {
  final _this = this as PricingResponse;
  return Object.hash(runtimeType,_this.ok,_this.currency,const DeepCollectionEquality().hash(_this.terms),_this.error,_this.retryAfterSec);
}

@override
String toString() {
  final _this = this as PricingResponse;
  return 'PricingResponse(ok: ${_this.ok}, currency: ${_this.currency}, terms: ${_this.terms}, error: ${_this.error}, retryAfterSec: ${_this.retryAfterSec})';
}


}

/// @nodoc
abstract mixin class $PricingResponseCopyWith<$Res>  {
  factory $PricingResponseCopyWith(PricingResponse value, $Res Function(PricingResponse) _then) = _$PricingResponseCopyWithImpl;
@useResult
$Res call({
 bool ok, String? currency, List<PricingTerm> terms, String? error,@JsonKey(name: "retryAfterSec") int? retryAfterSec
});




}
/// @nodoc
class _$PricingResponseCopyWithImpl<$Res>
    implements $PricingResponseCopyWith<$Res> {
  _$PricingResponseCopyWithImpl(this._self, this._then);

  final PricingResponse _self;
  final $Res Function(PricingResponse) _then;

/// Create a copy of PricingResponse
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? ok = null,Object? currency = freezed,Object? terms = null,Object? error = freezed,Object? retryAfterSec = freezed,}) {
  return _then(PricingResponse(
ok: null == ok ? _self.ok : ok // ignore: cast_nullable_to_non_nullable
as bool,currency: freezed == currency ? _self.currency : currency // ignore: cast_nullable_to_non_nullable
as String?,terms: null == terms ? _self.terms : terms // ignore: cast_nullable_to_non_nullable
as List<PricingTerm>,error: freezed == error ? _self.error : error // ignore: cast_nullable_to_non_nullable
as String?,retryAfterSec: freezed == retryAfterSec ? _self.retryAfterSec : retryAfterSec // ignore: cast_nullable_to_non_nullable
as int?,
  ));
}

}


/// Adds pattern-matching-related methods to [PricingResponse].
extension PricingResponsePatterns on PricingResponse {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _PricingResponse value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _PricingResponse() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _PricingResponse value)  $default,){
final _that = this;
switch (_that) {
case _PricingResponse():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _PricingResponse value)?  $default,){
final _that = this;
switch (_that) {
case _PricingResponse() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( bool ok,  String? currency,  List<PricingTerm> terms,  String? error, @JsonKey(name: "retryAfterSec")  int? retryAfterSec)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _PricingResponse() when $default != null:
return $default(_that.ok,_that.currency,_that.terms,_that.error,_that.retryAfterSec);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( bool ok,  String? currency,  List<PricingTerm> terms,  String? error, @JsonKey(name: "retryAfterSec")  int? retryAfterSec)  $default,) {final _that = this;
switch (_that) {
case _PricingResponse():
return $default(_that.ok,_that.currency,_that.terms,_that.error,_that.retryAfterSec);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( bool ok,  String? currency,  List<PricingTerm> terms,  String? error, @JsonKey(name: "retryAfterSec")  int? retryAfterSec)?  $default,) {final _that = this;
switch (_that) {
case _PricingResponse() when $default != null:
return $default(_that.ok,_that.currency,_that.terms,_that.error,_that.retryAfterSec);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _PricingResponse implements PricingResponse {
  const _PricingResponse({required this.ok, this.currency,  List<PricingTerm> terms = const <PricingTerm>[], this.error, @JsonKey(name: "retryAfterSec") this.retryAfterSec}): _terms = terms;
  factory _PricingResponse.fromJson(Map<String, dynamic> json) => _$PricingResponseFromJson(json);

@override final  bool ok;
@override final  String? currency;
 final  List<PricingTerm> _terms;
@override@JsonKey() List<PricingTerm> get terms {
  if (_terms is EqualUnmodifiableListView) return _terms;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_terms);
}

@override final  String? error;
@override@JsonKey(name: "retryAfterSec") final  int? retryAfterSec;

/// Create a copy of PricingResponse
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$PricingResponseCopyWith<_PricingResponse> get copyWith => __$PricingResponseCopyWithImpl<_PricingResponse>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$PricingResponseToJson(this, );
}

@override
bool operator ==(Object other) {
    return identical(this, other) || (other.runtimeType == runtimeType&&other is _PricingResponse&&(identical(other.ok, ok) || other.ok == ok)&&(identical(other.currency, currency) || other.currency == currency)&&const DeepCollectionEquality().equals(other.terms, _terms)&&(identical(other.error, error) || other.error == error)&&(identical(other.retryAfterSec, retryAfterSec) || other.retryAfterSec == retryAfterSec));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode {
    return Object.hash(runtimeType,ok,currency,const DeepCollectionEquality().hash(_terms),error,retryAfterSec);
}

@override
String toString() {
    return 'PricingResponse(ok: $ok, currency: $currency, terms: $terms, error: $error, retryAfterSec: $retryAfterSec)';
}


}

/// @nodoc
abstract mixin class _$PricingResponseCopyWith<$Res> implements $PricingResponseCopyWith<$Res> {
  factory _$PricingResponseCopyWith(_PricingResponse value, $Res Function(_PricingResponse) _then) = __$PricingResponseCopyWithImpl;
@override @useResult
$Res call({
 bool ok, String? currency, List<PricingTerm> terms, String? error,@JsonKey(name: "retryAfterSec") int? retryAfterSec
});




}
/// @nodoc
class __$PricingResponseCopyWithImpl<$Res>
    implements _$PricingResponseCopyWith<$Res> {
  __$PricingResponseCopyWithImpl(this._self, this._then);

  final _PricingResponse _self;
  final $Res Function(_PricingResponse) _then;

/// Create a copy of PricingResponse
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? ok = null,Object? currency = freezed,Object? terms = null,Object? error = freezed,Object? retryAfterSec = freezed,}) {
  return _then(_PricingResponse(
ok: null == ok ? _self.ok : ok // ignore: cast_nullable_to_non_nullable
as bool,currency: freezed == currency ? _self.currency : currency // ignore: cast_nullable_to_non_nullable
as String?,terms: null == terms ? _self._terms : terms // ignore: cast_nullable_to_non_nullable
as List<PricingTerm>,error: freezed == error ? _self.error : error // ignore: cast_nullable_to_non_nullable
as String?,retryAfterSec: freezed == retryAfterSec ? _self.retryAfterSec : retryAfterSec // ignore: cast_nullable_to_non_nullable
as int?,
  ));
}


}

// dart format on
