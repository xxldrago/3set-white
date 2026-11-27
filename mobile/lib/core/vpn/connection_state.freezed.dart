// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint, type=warning, deprecated_member_use, deprecated_member_use_from_same_package
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'connection_state.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// dart format off
T _$identity<T>(T value) => value;
/// @nodoc
mixin _$ConnectionState {

 ConnPhase get phase; String? get serverId; DateTime? get connectedAt; int? get rtt; String? get ip; int get down; int get up; String? get errorCode;
/// Create a copy of ConnectionState
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$ConnectionStateCopyWith<ConnectionState> get copyWith => _$ConnectionStateCopyWithImpl<ConnectionState>(this as ConnectionState, _$identity);



@override
bool operator ==(Object other) {
  final _this = this as ConnectionState;
  return identical(this, other) || (other.runtimeType == runtimeType&&other is ConnectionState&&(identical(other.phase, _this.phase) || other.phase == _this.phase)&&(identical(other.serverId, _this.serverId) || other.serverId == _this.serverId)&&(identical(other.connectedAt, _this.connectedAt) || other.connectedAt == _this.connectedAt)&&(identical(other.rtt, _this.rtt) || other.rtt == _this.rtt)&&(identical(other.ip, _this.ip) || other.ip == _this.ip)&&(identical(other.down, _this.down) || other.down == _this.down)&&(identical(other.up, _this.up) || other.up == _this.up)&&(identical(other.errorCode, _this.errorCode) || other.errorCode == _this.errorCode));
}


@override
int get hashCode {
  final _this = this as ConnectionState;
  return Object.hash(runtimeType,_this.phase,_this.serverId,_this.connectedAt,_this.rtt,_this.ip,_this.down,_this.up,_this.errorCode);
}

@override
String toString() {
  final _this = this as ConnectionState;
  return 'ConnectionState(phase: ${_this.phase}, serverId: ${_this.serverId}, connectedAt: ${_this.connectedAt}, rtt: ${_this.rtt}, ip: ${_this.ip}, down: ${_this.down}, up: ${_this.up}, errorCode: ${_this.errorCode})';
}


}

/// @nodoc
abstract mixin class $ConnectionStateCopyWith<$Res>  {
  factory $ConnectionStateCopyWith(ConnectionState value, $Res Function(ConnectionState) _then) = _$ConnectionStateCopyWithImpl;
@useResult
$Res call({
 ConnPhase phase, String? serverId, DateTime? connectedAt, int? rtt, String? ip, int down, int up, String? errorCode
});




}
/// @nodoc
class _$ConnectionStateCopyWithImpl<$Res>
    implements $ConnectionStateCopyWith<$Res> {
  _$ConnectionStateCopyWithImpl(this._self, this._then);

  final ConnectionState _self;
  final $Res Function(ConnectionState) _then;

/// Create a copy of ConnectionState
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? phase = null,Object? serverId = freezed,Object? connectedAt = freezed,Object? rtt = freezed,Object? ip = freezed,Object? down = null,Object? up = null,Object? errorCode = freezed,}) {
  return _then(ConnectionState(
phase: null == phase ? _self.phase : phase // ignore: cast_nullable_to_non_nullable
as ConnPhase,serverId: freezed == serverId ? _self.serverId : serverId // ignore: cast_nullable_to_non_nullable
as String?,connectedAt: freezed == connectedAt ? _self.connectedAt : connectedAt // ignore: cast_nullable_to_non_nullable
as DateTime?,rtt: freezed == rtt ? _self.rtt : rtt // ignore: cast_nullable_to_non_nullable
as int?,ip: freezed == ip ? _self.ip : ip // ignore: cast_nullable_to_non_nullable
as String?,down: null == down ? _self.down : down // ignore: cast_nullable_to_non_nullable
as int,up: null == up ? _self.up : up // ignore: cast_nullable_to_non_nullable
as int,errorCode: freezed == errorCode ? _self.errorCode : errorCode // ignore: cast_nullable_to_non_nullable
as String?,
  ));
}

}


/// Adds pattern-matching-related methods to [ConnectionState].
extension ConnectionStatePatterns on ConnectionState {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _ConnectionState value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _ConnectionState() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _ConnectionState value)  $default,){
final _that = this;
switch (_that) {
case _ConnectionState():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _ConnectionState value)?  $default,){
final _that = this;
switch (_that) {
case _ConnectionState() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( ConnPhase phase,  String? serverId,  DateTime? connectedAt,  int? rtt,  String? ip,  int down,  int up,  String? errorCode)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _ConnectionState() when $default != null:
return $default(_that.phase,_that.serverId,_that.connectedAt,_that.rtt,_that.ip,_that.down,_that.up,_that.errorCode);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( ConnPhase phase,  String? serverId,  DateTime? connectedAt,  int? rtt,  String? ip,  int down,  int up,  String? errorCode)  $default,) {final _that = this;
switch (_that) {
case _ConnectionState():
return $default(_that.phase,_that.serverId,_that.connectedAt,_that.rtt,_that.ip,_that.down,_that.up,_that.errorCode);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( ConnPhase phase,  String? serverId,  DateTime? connectedAt,  int? rtt,  String? ip,  int down,  int up,  String? errorCode)?  $default,) {final _that = this;
switch (_that) {
case _ConnectionState() when $default != null:
return $default(_that.phase,_that.serverId,_that.connectedAt,_that.rtt,_that.ip,_that.down,_that.up,_that.errorCode);case _:
  return null;

}
}

}

/// @nodoc


class _ConnectionState implements ConnectionState {
  const _ConnectionState({this.phase = ConnPhase.idle, this.serverId, this.connectedAt, this.rtt, this.ip, this.down = 0, this.up = 0, this.errorCode});
  

@override@JsonKey() final  ConnPhase phase;
@override final  String? serverId;
@override final  DateTime? connectedAt;
@override final  int? rtt;
@override final  String? ip;
@override@JsonKey() final  int down;
@override@JsonKey() final  int up;
@override final  String? errorCode;

/// Create a copy of ConnectionState
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$ConnectionStateCopyWith<_ConnectionState> get copyWith => __$ConnectionStateCopyWithImpl<_ConnectionState>(this, _$identity);



@override
bool operator ==(Object other) {
    return identical(this, other) || (other.runtimeType == runtimeType&&other is _ConnectionState&&(identical(other.phase, phase) || other.phase == phase)&&(identical(other.serverId, serverId) || other.serverId == serverId)&&(identical(other.connectedAt, connectedAt) || other.connectedAt == connectedAt)&&(identical(other.rtt, rtt) || other.rtt == rtt)&&(identical(other.ip, ip) || other.ip == ip)&&(identical(other.down, down) || other.down == down)&&(identical(other.up, up) || other.up == up)&&(identical(other.errorCode, errorCode) || other.errorCode == errorCode));
}


@override
int get hashCode {
    return Object.hash(runtimeType,phase,serverId,connectedAt,rtt,ip,down,up,errorCode);
}

@override
String toString() {
    return 'ConnectionState(phase: $phase, serverId: $serverId, connectedAt: $connectedAt, rtt: $rtt, ip: $ip, down: $down, up: $up, errorCode: $errorCode)';
}


}

/// @nodoc
abstract mixin class _$ConnectionStateCopyWith<$Res> implements $ConnectionStateCopyWith<$Res> {
  factory _$ConnectionStateCopyWith(_ConnectionState value, $Res Function(_ConnectionState) _then) = __$ConnectionStateCopyWithImpl;
@override @useResult
$Res call({
 ConnPhase phase, String? serverId, DateTime? connectedAt, int? rtt, String? ip, int down, int up, String? errorCode
});




}
/// @nodoc
class __$ConnectionStateCopyWithImpl<$Res>
    implements _$ConnectionStateCopyWith<$Res> {
  __$ConnectionStateCopyWithImpl(this._self, this._then);

  final _ConnectionState _self;
  final $Res Function(_ConnectionState) _then;

/// Create a copy of ConnectionState
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? phase = null,Object? serverId = freezed,Object? connectedAt = freezed,Object? rtt = freezed,Object? ip = freezed,Object? down = null,Object? up = null,Object? errorCode = freezed,}) {
  return _then(_ConnectionState(
phase: null == phase ? _self.phase : phase // ignore: cast_nullable_to_non_nullable
as ConnPhase,serverId: freezed == serverId ? _self.serverId : serverId // ignore: cast_nullable_to_non_nullable
as String?,connectedAt: freezed == connectedAt ? _self.connectedAt : connectedAt // ignore: cast_nullable_to_non_nullable
as DateTime?,rtt: freezed == rtt ? _self.rtt : rtt // ignore: cast_nullable_to_non_nullable
as int?,ip: freezed == ip ? _self.ip : ip // ignore: cast_nullable_to_non_nullable
as String?,down: null == down ? _self.down : down // ignore: cast_nullable_to_non_nullable
as int,up: null == up ? _self.up : up // ignore: cast_nullable_to_non_nullable
as int,errorCode: freezed == errorCode ? _self.errorCode : errorCode // ignore: cast_nullable_to_non_nullable
as String?,
  ));
}


}

// dart format on
