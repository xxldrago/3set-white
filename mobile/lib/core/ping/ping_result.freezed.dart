// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint, type=warning, deprecated_member_use, deprecated_member_use_from_same_package
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'ping_result.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// dart format off
T _$identity<T>(T value) => value;

/// @nodoc
mixin _$PingResult {

 bool get online;/// `true` only for the silent TCP fallback; never shown in the UI.
 bool get approx; int get tsMs; int? get rttMs;
/// Create a copy of PingResult
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$PingResultCopyWith<PingResult> get copyWith => _$PingResultCopyWithImpl<PingResult>(this as PingResult, _$identity);

  /// Serializes this PingResult to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  final _this = this as PingResult;
  return identical(this, other) || (other.runtimeType == runtimeType&&other is PingResult&&(identical(other.online, _this.online) || other.online == _this.online)&&(identical(other.approx, _this.approx) || other.approx == _this.approx)&&(identical(other.tsMs, _this.tsMs) || other.tsMs == _this.tsMs)&&(identical(other.rttMs, _this.rttMs) || other.rttMs == _this.rttMs));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode {
  final _this = this as PingResult;
  return Object.hash(runtimeType,_this.online,_this.approx,_this.tsMs,_this.rttMs);
}

@override
String toString() {
  final _this = this as PingResult;
  return 'PingResult(online: ${_this.online}, approx: ${_this.approx}, tsMs: ${_this.tsMs}, rttMs: ${_this.rttMs})';
}


}

/// @nodoc
abstract mixin class $PingResultCopyWith<$Res>  {
  factory $PingResultCopyWith(PingResult value, $Res Function(PingResult) _then) = _$PingResultCopyWithImpl;
@useResult
$Res call({
 bool online, bool approx, int tsMs, int? rttMs
});




}
/// @nodoc
class _$PingResultCopyWithImpl<$Res>
    implements $PingResultCopyWith<$Res> {
  _$PingResultCopyWithImpl(this._self, this._then);

  final PingResult _self;
  final $Res Function(PingResult) _then;

/// Create a copy of PingResult
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? online = null,Object? approx = null,Object? tsMs = null,Object? rttMs = freezed,}) {
  return _then(PingResult(
online: null == online ? _self.online : online // ignore: cast_nullable_to_non_nullable
as bool,approx: null == approx ? _self.approx : approx // ignore: cast_nullable_to_non_nullable
as bool,tsMs: null == tsMs ? _self.tsMs : tsMs // ignore: cast_nullable_to_non_nullable
as int,rttMs: freezed == rttMs ? _self.rttMs : rttMs // ignore: cast_nullable_to_non_nullable
as int?,
  ));
}

}


/// Adds pattern-matching-related methods to [PingResult].
extension PingResultPatterns on PingResult {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _PingResult value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _PingResult() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _PingResult value)  $default,){
final _that = this;
switch (_that) {
case _PingResult():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _PingResult value)?  $default,){
final _that = this;
switch (_that) {
case _PingResult() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( bool online,  bool approx,  int tsMs,  int? rttMs)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _PingResult() when $default != null:
return $default(_that.online,_that.approx,_that.tsMs,_that.rttMs);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( bool online,  bool approx,  int tsMs,  int? rttMs)  $default,) {final _that = this;
switch (_that) {
case _PingResult():
return $default(_that.online,_that.approx,_that.tsMs,_that.rttMs);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( bool online,  bool approx,  int tsMs,  int? rttMs)?  $default,) {final _that = this;
switch (_that) {
case _PingResult() when $default != null:
return $default(_that.online,_that.approx,_that.tsMs,_that.rttMs);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _PingResult implements PingResult {
  const _PingResult({required this.online, required this.approx, required this.tsMs, this.rttMs});
  factory _PingResult.fromJson(Map<String, dynamic> json) => _$PingResultFromJson(json);

@override final  bool online;
/// `true` only for the silent TCP fallback; never shown in the UI.
@override final  bool approx;
@override final  int tsMs;
@override final  int? rttMs;

/// Create a copy of PingResult
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$PingResultCopyWith<_PingResult> get copyWith => __$PingResultCopyWithImpl<_PingResult>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$PingResultToJson(this, );
}

@override
bool operator ==(Object other) {
    return identical(this, other) || (other.runtimeType == runtimeType&&other is _PingResult&&(identical(other.online, online) || other.online == online)&&(identical(other.approx, approx) || other.approx == approx)&&(identical(other.tsMs, tsMs) || other.tsMs == tsMs)&&(identical(other.rttMs, rttMs) || other.rttMs == rttMs));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode {
    return Object.hash(runtimeType,online,approx,tsMs,rttMs);
}

@override
String toString() {
    return 'PingResult(online: $online, approx: $approx, tsMs: $tsMs, rttMs: $rttMs)';
}


}

/// @nodoc
abstract mixin class _$PingResultCopyWith<$Res> implements $PingResultCopyWith<$Res> {
  factory _$PingResultCopyWith(_PingResult value, $Res Function(_PingResult) _then) = __$PingResultCopyWithImpl;
@override @useResult
$Res call({
 bool online, bool approx, int tsMs, int? rttMs
});




}
/// @nodoc
class __$PingResultCopyWithImpl<$Res>
    implements _$PingResultCopyWith<$Res> {
  __$PingResultCopyWithImpl(this._self, this._then);

  final _PingResult _self;
  final $Res Function(_PingResult) _then;

/// Create a copy of PingResult
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? online = null,Object? approx = null,Object? tsMs = null,Object? rttMs = freezed,}) {
  return _then(_PingResult(
online: null == online ? _self.online : online // ignore: cast_nullable_to_non_nullable
as bool,approx: null == approx ? _self.approx : approx // ignore: cast_nullable_to_non_nullable
as bool,tsMs: null == tsMs ? _self.tsMs : tsMs // ignore: cast_nullable_to_non_nullable
as int,rttMs: freezed == rttMs ? _self.rttMs : rttMs // ignore: cast_nullable_to_non_nullable
as int?,
  ));
}


}

// dart format on
