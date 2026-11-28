// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint, type=warning, deprecated_member_use, deprecated_member_use_from_same_package
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'device.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// dart format off
T _$identity<T>(T value) => value;

/// @nodoc
mixin _$Device {

 String get token; String? get label; String? get name;
/// Create a copy of Device
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$DeviceCopyWith<Device> get copyWith => _$DeviceCopyWithImpl<Device>(this as Device, _$identity);

  /// Serializes this Device to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  final _this = this as Device;
  return identical(this, other) || (other.runtimeType == runtimeType&&other is Device&&(identical(other.token, _this.token) || other.token == _this.token)&&(identical(other.label, _this.label) || other.label == _this.label)&&(identical(other.name, _this.name) || other.name == _this.name));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode {
  final _this = this as Device;
  return Object.hash(runtimeType,_this.token,_this.label,_this.name);
}

@override
String toString() {
  final _this = this as Device;
  return 'Device(token: ${_this.token}, label: ${_this.label}, name: ${_this.name})';
}


}

/// @nodoc
abstract mixin class $DeviceCopyWith<$Res>  {
  factory $DeviceCopyWith(Device value, $Res Function(Device) _then) = _$DeviceCopyWithImpl;
@useResult
$Res call({
 String token, String? label, String? name
});




}
/// @nodoc
class _$DeviceCopyWithImpl<$Res>
    implements $DeviceCopyWith<$Res> {
  _$DeviceCopyWithImpl(this._self, this._then);

  final Device _self;
  final $Res Function(Device) _then;

/// Create a copy of Device
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? token = null,Object? label = freezed,Object? name = freezed,}) {
  return _then(Device(
token: null == token ? _self.token : token // ignore: cast_nullable_to_non_nullable
as String,label: freezed == label ? _self.label : label // ignore: cast_nullable_to_non_nullable
as String?,name: freezed == name ? _self.name : name // ignore: cast_nullable_to_non_nullable
as String?,
  ));
}

}


/// Adds pattern-matching-related methods to [Device].
extension DevicePatterns on Device {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _Device value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _Device() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _Device value)  $default,){
final _that = this;
switch (_that) {
case _Device():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _Device value)?  $default,){
final _that = this;
switch (_that) {
case _Device() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String token,  String? label,  String? name)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _Device() when $default != null:
return $default(_that.token,_that.label,_that.name);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String token,  String? label,  String? name)  $default,) {final _that = this;
switch (_that) {
case _Device():
return $default(_that.token,_that.label,_that.name);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String token,  String? label,  String? name)?  $default,) {final _that = this;
switch (_that) {
case _Device() when $default != null:
return $default(_that.token,_that.label,_that.name);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _Device implements Device {
  const _Device({required this.token, this.label, this.name});
  factory _Device.fromJson(Map<String, dynamic> json) => _$DeviceFromJson(json);

@override final  String token;
@override final  String? label;
@override final  String? name;

/// Create a copy of Device
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$DeviceCopyWith<_Device> get copyWith => __$DeviceCopyWithImpl<_Device>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$DeviceToJson(this, );
}

@override
bool operator ==(Object other) {
    return identical(this, other) || (other.runtimeType == runtimeType&&other is _Device&&(identical(other.token, token) || other.token == token)&&(identical(other.label, label) || other.label == label)&&(identical(other.name, name) || other.name == name));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode {
    return Object.hash(runtimeType,token,label,name);
}

@override
String toString() {
    return 'Device(token: $token, label: $label, name: $name)';
}


}

/// @nodoc
abstract mixin class _$DeviceCopyWith<$Res> implements $DeviceCopyWith<$Res> {
  factory _$DeviceCopyWith(_Device value, $Res Function(_Device) _then) = __$DeviceCopyWithImpl;
@override @useResult
$Res call({
 String token, String? label, String? name
});




}
/// @nodoc
class __$DeviceCopyWithImpl<$Res>
    implements _$DeviceCopyWith<$Res> {
  __$DeviceCopyWithImpl(this._self, this._then);

  final _Device _self;
  final $Res Function(_Device) _then;

/// Create a copy of Device
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? token = null,Object? label = freezed,Object? name = freezed,}) {
  return _then(_Device(
token: null == token ? _self.token : token // ignore: cast_nullable_to_non_nullable
as String,label: freezed == label ? _self.label : label // ignore: cast_nullable_to_non_nullable
as String?,name: freezed == name ? _self.name : name // ignore: cast_nullable_to_non_nullable
as String?,
  ));
}


}


/// @nodoc
mixin _$DevicesPayload {

 bool get ok; String? get error;@JsonKey(name: "deviceLimit") int? get deviceLimit; List<Device>? get devices;
/// Create a copy of DevicesPayload
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$DevicesPayloadCopyWith<DevicesPayload> get copyWith => _$DevicesPayloadCopyWithImpl<DevicesPayload>(this as DevicesPayload, _$identity);

  /// Serializes this DevicesPayload to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  final _this = this as DevicesPayload;
  return identical(this, other) || (other.runtimeType == runtimeType&&other is DevicesPayload&&(identical(other.ok, _this.ok) || other.ok == _this.ok)&&(identical(other.error, _this.error) || other.error == _this.error)&&(identical(other.deviceLimit, _this.deviceLimit) || other.deviceLimit == _this.deviceLimit)&&const DeepCollectionEquality().equals(other.devices, _this.devices));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode {
  final _this = this as DevicesPayload;
  return Object.hash(runtimeType,_this.ok,_this.error,_this.deviceLimit,const DeepCollectionEquality().hash(_this.devices));
}

@override
String toString() {
  final _this = this as DevicesPayload;
  return 'DevicesPayload(ok: ${_this.ok}, error: ${_this.error}, deviceLimit: ${_this.deviceLimit}, devices: ${_this.devices})';
}


}

/// @nodoc
abstract mixin class $DevicesPayloadCopyWith<$Res>  {
  factory $DevicesPayloadCopyWith(DevicesPayload value, $Res Function(DevicesPayload) _then) = _$DevicesPayloadCopyWithImpl;
@useResult
$Res call({
 bool ok, String? error,@JsonKey(name: "deviceLimit") int? deviceLimit, List<Device>? devices
});




}
/// @nodoc
class _$DevicesPayloadCopyWithImpl<$Res>
    implements $DevicesPayloadCopyWith<$Res> {
  _$DevicesPayloadCopyWithImpl(this._self, this._then);

  final DevicesPayload _self;
  final $Res Function(DevicesPayload) _then;

/// Create a copy of DevicesPayload
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? ok = null,Object? error = freezed,Object? deviceLimit = freezed,Object? devices = freezed,}) {
  return _then(DevicesPayload(
ok: null == ok ? _self.ok : ok // ignore: cast_nullable_to_non_nullable
as bool,error: freezed == error ? _self.error : error // ignore: cast_nullable_to_non_nullable
as String?,deviceLimit: freezed == deviceLimit ? _self.deviceLimit : deviceLimit // ignore: cast_nullable_to_non_nullable
as int?,devices: freezed == devices ? _self.devices : devices // ignore: cast_nullable_to_non_nullable
as List<Device>?,
  ));
}

}


/// Adds pattern-matching-related methods to [DevicesPayload].
extension DevicesPayloadPatterns on DevicesPayload {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _DevicesPayload value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _DevicesPayload() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _DevicesPayload value)  $default,){
final _that = this;
switch (_that) {
case _DevicesPayload():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _DevicesPayload value)?  $default,){
final _that = this;
switch (_that) {
case _DevicesPayload() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( bool ok,  String? error, @JsonKey(name: "deviceLimit")  int? deviceLimit,  List<Device>? devices)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _DevicesPayload() when $default != null:
return $default(_that.ok,_that.error,_that.deviceLimit,_that.devices);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( bool ok,  String? error, @JsonKey(name: "deviceLimit")  int? deviceLimit,  List<Device>? devices)  $default,) {final _that = this;
switch (_that) {
case _DevicesPayload():
return $default(_that.ok,_that.error,_that.deviceLimit,_that.devices);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( bool ok,  String? error, @JsonKey(name: "deviceLimit")  int? deviceLimit,  List<Device>? devices)?  $default,) {final _that = this;
switch (_that) {
case _DevicesPayload() when $default != null:
return $default(_that.ok,_that.error,_that.deviceLimit,_that.devices);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _DevicesPayload implements DevicesPayload {
  const _DevicesPayload({required this.ok, this.error, @JsonKey(name: "deviceLimit") this.deviceLimit,  List<Device>? devices}): _devices = devices;
  factory _DevicesPayload.fromJson(Map<String, dynamic> json) => _$DevicesPayloadFromJson(json);

@override final  bool ok;
@override final  String? error;
@override@JsonKey(name: "deviceLimit") final  int? deviceLimit;
 final  List<Device>? _devices;
@override List<Device>? get devices {
  final value = _devices;
  if (value == null) return null;
  if (_devices is EqualUnmodifiableListView) return _devices;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(value);
}


/// Create a copy of DevicesPayload
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$DevicesPayloadCopyWith<_DevicesPayload> get copyWith => __$DevicesPayloadCopyWithImpl<_DevicesPayload>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$DevicesPayloadToJson(this, );
}

@override
bool operator ==(Object other) {
    return identical(this, other) || (other.runtimeType == runtimeType&&other is _DevicesPayload&&(identical(other.ok, ok) || other.ok == ok)&&(identical(other.error, error) || other.error == error)&&(identical(other.deviceLimit, deviceLimit) || other.deviceLimit == deviceLimit)&&const DeepCollectionEquality().equals(other.devices, _devices));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode {
    return Object.hash(runtimeType,ok,error,deviceLimit,const DeepCollectionEquality().hash(_devices));
}

@override
String toString() {
    return 'DevicesPayload(ok: $ok, error: $error, deviceLimit: $deviceLimit, devices: $devices)';
}


}

/// @nodoc
abstract mixin class _$DevicesPayloadCopyWith<$Res> implements $DevicesPayloadCopyWith<$Res> {
  factory _$DevicesPayloadCopyWith(_DevicesPayload value, $Res Function(_DevicesPayload) _then) = __$DevicesPayloadCopyWithImpl;
@override @useResult
$Res call({
 bool ok, String? error,@JsonKey(name: "deviceLimit") int? deviceLimit, List<Device>? devices
});




}
/// @nodoc
class __$DevicesPayloadCopyWithImpl<$Res>
    implements _$DevicesPayloadCopyWith<$Res> {
  __$DevicesPayloadCopyWithImpl(this._self, this._then);

  final _DevicesPayload _self;
  final $Res Function(_DevicesPayload) _then;

/// Create a copy of DevicesPayload
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? ok = null,Object? error = freezed,Object? deviceLimit = freezed,Object? devices = freezed,}) {
  return _then(_DevicesPayload(
ok: null == ok ? _self.ok : ok // ignore: cast_nullable_to_non_nullable
as bool,error: freezed == error ? _self.error : error // ignore: cast_nullable_to_non_nullable
as String?,deviceLimit: freezed == deviceLimit ? _self.deviceLimit : deviceLimit // ignore: cast_nullable_to_non_nullable
as int?,devices: freezed == devices ? _self._devices : devices // ignore: cast_nullable_to_non_nullable
as List<Device>?,
  ));
}


}

// dart format on
