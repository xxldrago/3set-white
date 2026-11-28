// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint, type=warning, deprecated_member_use, deprecated_member_use_from_same_package
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'promo.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// dart format off
T _$identity<T>(T value) => value;

/// @nodoc
mixin _$PromoPreview {

 bool get ok; String? get code;@JsonKey(name: "discountPercent") int? get discountPercent; String? get error;
/// Create a copy of PromoPreview
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$PromoPreviewCopyWith<PromoPreview> get copyWith => _$PromoPreviewCopyWithImpl<PromoPreview>(this as PromoPreview, _$identity);

  /// Serializes this PromoPreview to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  final _this = this as PromoPreview;
  return identical(this, other) || (other.runtimeType == runtimeType&&other is PromoPreview&&(identical(other.ok, _this.ok) || other.ok == _this.ok)&&(identical(other.code, _this.code) || other.code == _this.code)&&(identical(other.discountPercent, _this.discountPercent) || other.discountPercent == _this.discountPercent)&&(identical(other.error, _this.error) || other.error == _this.error));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode {
  final _this = this as PromoPreview;
  return Object.hash(runtimeType,_this.ok,_this.code,_this.discountPercent,_this.error);
}

@override
String toString() {
  final _this = this as PromoPreview;
  return 'PromoPreview(ok: ${_this.ok}, code: ${_this.code}, discountPercent: ${_this.discountPercent}, error: ${_this.error})';
}


}

/// @nodoc
abstract mixin class $PromoPreviewCopyWith<$Res>  {
  factory $PromoPreviewCopyWith(PromoPreview value, $Res Function(PromoPreview) _then) = _$PromoPreviewCopyWithImpl;
@useResult
$Res call({
 bool ok, String? code,@JsonKey(name: "discountPercent") int? discountPercent, String? error
});




}
/// @nodoc
class _$PromoPreviewCopyWithImpl<$Res>
    implements $PromoPreviewCopyWith<$Res> {
  _$PromoPreviewCopyWithImpl(this._self, this._then);

  final PromoPreview _self;
  final $Res Function(PromoPreview) _then;

/// Create a copy of PromoPreview
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? ok = null,Object? code = freezed,Object? discountPercent = freezed,Object? error = freezed,}) {
  return _then(PromoPreview(
ok: null == ok ? _self.ok : ok // ignore: cast_nullable_to_non_nullable
as bool,code: freezed == code ? _self.code : code // ignore: cast_nullable_to_non_nullable
as String?,discountPercent: freezed == discountPercent ? _self.discountPercent : discountPercent // ignore: cast_nullable_to_non_nullable
as int?,error: freezed == error ? _self.error : error // ignore: cast_nullable_to_non_nullable
as String?,
  ));
}

}


/// Adds pattern-matching-related methods to [PromoPreview].
extension PromoPreviewPatterns on PromoPreview {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _PromoPreview value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _PromoPreview() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _PromoPreview value)  $default,){
final _that = this;
switch (_that) {
case _PromoPreview():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _PromoPreview value)?  $default,){
final _that = this;
switch (_that) {
case _PromoPreview() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( bool ok,  String? code, @JsonKey(name: "discountPercent")  int? discountPercent,  String? error)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _PromoPreview() when $default != null:
return $default(_that.ok,_that.code,_that.discountPercent,_that.error);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( bool ok,  String? code, @JsonKey(name: "discountPercent")  int? discountPercent,  String? error)  $default,) {final _that = this;
switch (_that) {
case _PromoPreview():
return $default(_that.ok,_that.code,_that.discountPercent,_that.error);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( bool ok,  String? code, @JsonKey(name: "discountPercent")  int? discountPercent,  String? error)?  $default,) {final _that = this;
switch (_that) {
case _PromoPreview() when $default != null:
return $default(_that.ok,_that.code,_that.discountPercent,_that.error);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _PromoPreview implements PromoPreview {
  const _PromoPreview({required this.ok, this.code, @JsonKey(name: "discountPercent") this.discountPercent, this.error});
  factory _PromoPreview.fromJson(Map<String, dynamic> json) => _$PromoPreviewFromJson(json);

@override final  bool ok;
@override final  String? code;
@override@JsonKey(name: "discountPercent") final  int? discountPercent;
@override final  String? error;

/// Create a copy of PromoPreview
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$PromoPreviewCopyWith<_PromoPreview> get copyWith => __$PromoPreviewCopyWithImpl<_PromoPreview>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$PromoPreviewToJson(this, );
}

@override
bool operator ==(Object other) {
    return identical(this, other) || (other.runtimeType == runtimeType&&other is _PromoPreview&&(identical(other.ok, ok) || other.ok == ok)&&(identical(other.code, code) || other.code == code)&&(identical(other.discountPercent, discountPercent) || other.discountPercent == discountPercent)&&(identical(other.error, error) || other.error == error));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode {
    return Object.hash(runtimeType,ok,code,discountPercent,error);
}

@override
String toString() {
    return 'PromoPreview(ok: $ok, code: $code, discountPercent: $discountPercent, error: $error)';
}


}

/// @nodoc
abstract mixin class _$PromoPreviewCopyWith<$Res> implements $PromoPreviewCopyWith<$Res> {
  factory _$PromoPreviewCopyWith(_PromoPreview value, $Res Function(_PromoPreview) _then) = __$PromoPreviewCopyWithImpl;
@override @useResult
$Res call({
 bool ok, String? code,@JsonKey(name: "discountPercent") int? discountPercent, String? error
});




}
/// @nodoc
class __$PromoPreviewCopyWithImpl<$Res>
    implements _$PromoPreviewCopyWith<$Res> {
  __$PromoPreviewCopyWithImpl(this._self, this._then);

  final _PromoPreview _self;
  final $Res Function(_PromoPreview) _then;

/// Create a copy of PromoPreview
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? ok = null,Object? code = freezed,Object? discountPercent = freezed,Object? error = freezed,}) {
  return _then(_PromoPreview(
ok: null == ok ? _self.ok : ok // ignore: cast_nullable_to_non_nullable
as bool,code: freezed == code ? _self.code : code // ignore: cast_nullable_to_non_nullable
as String?,discountPercent: freezed == discountPercent ? _self.discountPercent : discountPercent // ignore: cast_nullable_to_non_nullable
as int?,error: freezed == error ? _self.error : error // ignore: cast_nullable_to_non_nullable
as String?,
  ));
}


}

// dart format on
