// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint, type=warning, deprecated_member_use, deprecated_member_use_from_same_package
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'server.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// dart format off
T _$identity<T>(T value) => value;

/// @nodoc
mixin _$Server {

 String get id; String get name; String get city; String get cc; String get flag; String get proto; String? get sni; PoolTab get tab; String get host; int get port; String get protocol; Map<String, dynamic> get outbound;
/// Create a copy of Server
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$ServerCopyWith<Server> get copyWith => _$ServerCopyWithImpl<Server>(this as Server, _$identity);

  /// Serializes this Server to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  final _this = this as Server;
  return identical(this, other) || (other.runtimeType == runtimeType&&other is Server&&(identical(other.id, _this.id) || other.id == _this.id)&&(identical(other.name, _this.name) || other.name == _this.name)&&(identical(other.city, _this.city) || other.city == _this.city)&&(identical(other.cc, _this.cc) || other.cc == _this.cc)&&(identical(other.flag, _this.flag) || other.flag == _this.flag)&&(identical(other.proto, _this.proto) || other.proto == _this.proto)&&(identical(other.sni, _this.sni) || other.sni == _this.sni)&&(identical(other.tab, _this.tab) || other.tab == _this.tab)&&(identical(other.host, _this.host) || other.host == _this.host)&&(identical(other.port, _this.port) || other.port == _this.port)&&(identical(other.protocol, _this.protocol) || other.protocol == _this.protocol)&&const DeepCollectionEquality().equals(other.outbound, _this.outbound));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode {
  final _this = this as Server;
  return Object.hash(runtimeType,_this.id,_this.name,_this.city,_this.cc,_this.flag,_this.proto,_this.sni,_this.tab,_this.host,_this.port,_this.protocol,const DeepCollectionEquality().hash(_this.outbound));
}

@override
String toString() {
  final _this = this as Server;
  return 'Server(id: ${_this.id}, name: ${_this.name}, city: ${_this.city}, cc: ${_this.cc}, flag: ${_this.flag}, proto: ${_this.proto}, sni: ${_this.sni}, tab: ${_this.tab}, host: ${_this.host}, port: ${_this.port}, protocol: ${_this.protocol}, outbound: ${_this.outbound})';
}


}

/// @nodoc
abstract mixin class $ServerCopyWith<$Res>  {
  factory $ServerCopyWith(Server value, $Res Function(Server) _then) = _$ServerCopyWithImpl;
@useResult
$Res call({
 String id, String name, String city, String cc, String flag, String proto, String? sni, PoolTab tab, String host, int port, String protocol, Map<String, dynamic> outbound
});




}
/// @nodoc
class _$ServerCopyWithImpl<$Res>
    implements $ServerCopyWith<$Res> {
  _$ServerCopyWithImpl(this._self, this._then);

  final Server _self;
  final $Res Function(Server) _then;

/// Create a copy of Server
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? id = null,Object? name = null,Object? city = null,Object? cc = null,Object? flag = null,Object? proto = null,Object? sni = freezed,Object? tab = null,Object? host = null,Object? port = null,Object? protocol = null,Object? outbound = null,}) {
  return _then(Server(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,name: null == name ? _self.name : name // ignore: cast_nullable_to_non_nullable
as String,city: null == city ? _self.city : city // ignore: cast_nullable_to_non_nullable
as String,cc: null == cc ? _self.cc : cc // ignore: cast_nullable_to_non_nullable
as String,flag: null == flag ? _self.flag : flag // ignore: cast_nullable_to_non_nullable
as String,proto: null == proto ? _self.proto : proto // ignore: cast_nullable_to_non_nullable
as String,sni: freezed == sni ? _self.sni : sni // ignore: cast_nullable_to_non_nullable
as String?,tab: null == tab ? _self.tab : tab // ignore: cast_nullable_to_non_nullable
as PoolTab,host: null == host ? _self.host : host // ignore: cast_nullable_to_non_nullable
as String,port: null == port ? _self.port : port // ignore: cast_nullable_to_non_nullable
as int,protocol: null == protocol ? _self.protocol : protocol // ignore: cast_nullable_to_non_nullable
as String,outbound: null == outbound ? _self.outbound : outbound // ignore: cast_nullable_to_non_nullable
as Map<String, dynamic>,
  ));
}

}


/// Adds pattern-matching-related methods to [Server].
extension ServerPatterns on Server {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _Server value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _Server() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _Server value)  $default,){
final _that = this;
switch (_that) {
case _Server():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _Server value)?  $default,){
final _that = this;
switch (_that) {
case _Server() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String id,  String name,  String city,  String cc,  String flag,  String proto,  String? sni,  PoolTab tab,  String host,  int port,  String protocol,  Map<String, dynamic> outbound)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _Server() when $default != null:
return $default(_that.id,_that.name,_that.city,_that.cc,_that.flag,_that.proto,_that.sni,_that.tab,_that.host,_that.port,_that.protocol,_that.outbound);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String id,  String name,  String city,  String cc,  String flag,  String proto,  String? sni,  PoolTab tab,  String host,  int port,  String protocol,  Map<String, dynamic> outbound)  $default,) {final _that = this;
switch (_that) {
case _Server():
return $default(_that.id,_that.name,_that.city,_that.cc,_that.flag,_that.proto,_that.sni,_that.tab,_that.host,_that.port,_that.protocol,_that.outbound);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String id,  String name,  String city,  String cc,  String flag,  String proto,  String? sni,  PoolTab tab,  String host,  int port,  String protocol,  Map<String, dynamic> outbound)?  $default,) {final _that = this;
switch (_that) {
case _Server() when $default != null:
return $default(_that.id,_that.name,_that.city,_that.cc,_that.flag,_that.proto,_that.sni,_that.tab,_that.host,_that.port,_that.protocol,_that.outbound);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _Server implements Server {
  const _Server({required this.id, required this.name, required this.city, required this.cc, required this.flag, required this.proto, this.sni, required this.tab, required this.host, required this.port, required this.protocol, required  Map<String, dynamic> outbound}): _outbound = outbound;
  factory _Server.fromJson(Map<String, dynamic> json) => _$ServerFromJson(json);

@override final  String id;
@override final  String name;
@override final  String city;
@override final  String cc;
@override final  String flag;
@override final  String proto;
@override final  String? sni;
@override final  PoolTab tab;
@override final  String host;
@override final  int port;
@override final  String protocol;
 final  Map<String, dynamic> _outbound;
@override Map<String, dynamic> get outbound {
  if (_outbound is EqualUnmodifiableMapView) return _outbound;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableMapView(_outbound);
}


/// Create a copy of Server
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$ServerCopyWith<_Server> get copyWith => __$ServerCopyWithImpl<_Server>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$ServerToJson(this, );
}

@override
bool operator ==(Object other) {
    return identical(this, other) || (other.runtimeType == runtimeType&&other is _Server&&(identical(other.id, id) || other.id == id)&&(identical(other.name, name) || other.name == name)&&(identical(other.city, city) || other.city == city)&&(identical(other.cc, cc) || other.cc == cc)&&(identical(other.flag, flag) || other.flag == flag)&&(identical(other.proto, proto) || other.proto == proto)&&(identical(other.sni, sni) || other.sni == sni)&&(identical(other.tab, tab) || other.tab == tab)&&(identical(other.host, host) || other.host == host)&&(identical(other.port, port) || other.port == port)&&(identical(other.protocol, protocol) || other.protocol == protocol)&&const DeepCollectionEquality().equals(other.outbound, _outbound));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode {
    return Object.hash(runtimeType,id,name,city,cc,flag,proto,sni,tab,host,port,protocol,const DeepCollectionEquality().hash(_outbound));
}

@override
String toString() {
    return 'Server(id: $id, name: $name, city: $city, cc: $cc, flag: $flag, proto: $proto, sni: $sni, tab: $tab, host: $host, port: $port, protocol: $protocol, outbound: $outbound)';
}


}

/// @nodoc
abstract mixin class _$ServerCopyWith<$Res> implements $ServerCopyWith<$Res> {
  factory _$ServerCopyWith(_Server value, $Res Function(_Server) _then) = __$ServerCopyWithImpl;
@override @useResult
$Res call({
 String id, String name, String city, String cc, String flag, String proto, String? sni, PoolTab tab, String host, int port, String protocol, Map<String, dynamic> outbound
});




}
/// @nodoc
class __$ServerCopyWithImpl<$Res>
    implements _$ServerCopyWith<$Res> {
  __$ServerCopyWithImpl(this._self, this._then);

  final _Server _self;
  final $Res Function(_Server) _then;

/// Create a copy of Server
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? id = null,Object? name = null,Object? city = null,Object? cc = null,Object? flag = null,Object? proto = null,Object? sni = freezed,Object? tab = null,Object? host = null,Object? port = null,Object? protocol = null,Object? outbound = null,}) {
  return _then(_Server(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,name: null == name ? _self.name : name // ignore: cast_nullable_to_non_nullable
as String,city: null == city ? _self.city : city // ignore: cast_nullable_to_non_nullable
as String,cc: null == cc ? _self.cc : cc // ignore: cast_nullable_to_non_nullable
as String,flag: null == flag ? _self.flag : flag // ignore: cast_nullable_to_non_nullable
as String,proto: null == proto ? _self.proto : proto // ignore: cast_nullable_to_non_nullable
as String,sni: freezed == sni ? _self.sni : sni // ignore: cast_nullable_to_non_nullable
as String?,tab: null == tab ? _self.tab : tab // ignore: cast_nullable_to_non_nullable
as PoolTab,host: null == host ? _self.host : host // ignore: cast_nullable_to_non_nullable
as String,port: null == port ? _self.port : port // ignore: cast_nullable_to_non_nullable
as int,protocol: null == protocol ? _self.protocol : protocol // ignore: cast_nullable_to_non_nullable
as String,outbound: null == outbound ? _self._outbound : outbound // ignore: cast_nullable_to_non_nullable
as Map<String, dynamic>,
  ));
}


}


/// @nodoc
mixin _$ServerKey {

 bool get active; String get keyId; bool get isTrial;@JsonKey(name: "remainingDays") int? get remainingDays;@JsonKey(name: "expireAt") String? get expireAt;
/// Create a copy of ServerKey
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$ServerKeyCopyWith<ServerKey> get copyWith => _$ServerKeyCopyWithImpl<ServerKey>(this as ServerKey, _$identity);

  /// Serializes this ServerKey to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  final _this = this as ServerKey;
  return identical(this, other) || (other.runtimeType == runtimeType&&other is ServerKey&&(identical(other.active, _this.active) || other.active == _this.active)&&(identical(other.keyId, _this.keyId) || other.keyId == _this.keyId)&&(identical(other.isTrial, _this.isTrial) || other.isTrial == _this.isTrial)&&(identical(other.remainingDays, _this.remainingDays) || other.remainingDays == _this.remainingDays)&&(identical(other.expireAt, _this.expireAt) || other.expireAt == _this.expireAt));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode {
  final _this = this as ServerKey;
  return Object.hash(runtimeType,_this.active,_this.keyId,_this.isTrial,_this.remainingDays,_this.expireAt);
}

@override
String toString() {
  final _this = this as ServerKey;
  return 'ServerKey(active: ${_this.active}, keyId: ${_this.keyId}, isTrial: ${_this.isTrial}, remainingDays: ${_this.remainingDays}, expireAt: ${_this.expireAt})';
}


}

/// @nodoc
abstract mixin class $ServerKeyCopyWith<$Res>  {
  factory $ServerKeyCopyWith(ServerKey value, $Res Function(ServerKey) _then) = _$ServerKeyCopyWithImpl;
@useResult
$Res call({
 bool active, String keyId, bool isTrial,@JsonKey(name: "remainingDays") int? remainingDays,@JsonKey(name: "expireAt") String? expireAt
});




}
/// @nodoc
class _$ServerKeyCopyWithImpl<$Res>
    implements $ServerKeyCopyWith<$Res> {
  _$ServerKeyCopyWithImpl(this._self, this._then);

  final ServerKey _self;
  final $Res Function(ServerKey) _then;

/// Create a copy of ServerKey
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? active = null,Object? keyId = null,Object? isTrial = null,Object? remainingDays = freezed,Object? expireAt = freezed,}) {
  return _then(ServerKey(
active: null == active ? _self.active : active // ignore: cast_nullable_to_non_nullable
as bool,keyId: null == keyId ? _self.keyId : keyId // ignore: cast_nullable_to_non_nullable
as String,isTrial: null == isTrial ? _self.isTrial : isTrial // ignore: cast_nullable_to_non_nullable
as bool,remainingDays: freezed == remainingDays ? _self.remainingDays : remainingDays // ignore: cast_nullable_to_non_nullable
as int?,expireAt: freezed == expireAt ? _self.expireAt : expireAt // ignore: cast_nullable_to_non_nullable
as String?,
  ));
}

}


/// Adds pattern-matching-related methods to [ServerKey].
extension ServerKeyPatterns on ServerKey {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _ServerKey value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _ServerKey() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _ServerKey value)  $default,){
final _that = this;
switch (_that) {
case _ServerKey():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _ServerKey value)?  $default,){
final _that = this;
switch (_that) {
case _ServerKey() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( bool active,  String keyId,  bool isTrial, @JsonKey(name: "remainingDays")  int? remainingDays, @JsonKey(name: "expireAt")  String? expireAt)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _ServerKey() when $default != null:
return $default(_that.active,_that.keyId,_that.isTrial,_that.remainingDays,_that.expireAt);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( bool active,  String keyId,  bool isTrial, @JsonKey(name: "remainingDays")  int? remainingDays, @JsonKey(name: "expireAt")  String? expireAt)  $default,) {final _that = this;
switch (_that) {
case _ServerKey():
return $default(_that.active,_that.keyId,_that.isTrial,_that.remainingDays,_that.expireAt);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( bool active,  String keyId,  bool isTrial, @JsonKey(name: "remainingDays")  int? remainingDays, @JsonKey(name: "expireAt")  String? expireAt)?  $default,) {final _that = this;
switch (_that) {
case _ServerKey() when $default != null:
return $default(_that.active,_that.keyId,_that.isTrial,_that.remainingDays,_that.expireAt);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _ServerKey implements ServerKey {
  const _ServerKey({required this.active, required this.keyId, required this.isTrial, @JsonKey(name: "remainingDays") this.remainingDays, @JsonKey(name: "expireAt") this.expireAt});
  factory _ServerKey.fromJson(Map<String, dynamic> json) => _$ServerKeyFromJson(json);

@override final  bool active;
@override final  String keyId;
@override final  bool isTrial;
@override@JsonKey(name: "remainingDays") final  int? remainingDays;
@override@JsonKey(name: "expireAt") final  String? expireAt;

/// Create a copy of ServerKey
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$ServerKeyCopyWith<_ServerKey> get copyWith => __$ServerKeyCopyWithImpl<_ServerKey>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$ServerKeyToJson(this, );
}

@override
bool operator ==(Object other) {
    return identical(this, other) || (other.runtimeType == runtimeType&&other is _ServerKey&&(identical(other.active, active) || other.active == active)&&(identical(other.keyId, keyId) || other.keyId == keyId)&&(identical(other.isTrial, isTrial) || other.isTrial == isTrial)&&(identical(other.remainingDays, remainingDays) || other.remainingDays == remainingDays)&&(identical(other.expireAt, expireAt) || other.expireAt == expireAt));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode {
    return Object.hash(runtimeType,active,keyId,isTrial,remainingDays,expireAt);
}

@override
String toString() {
    return 'ServerKey(active: $active, keyId: $keyId, isTrial: $isTrial, remainingDays: $remainingDays, expireAt: $expireAt)';
}


}

/// @nodoc
abstract mixin class _$ServerKeyCopyWith<$Res> implements $ServerKeyCopyWith<$Res> {
  factory _$ServerKeyCopyWith(_ServerKey value, $Res Function(_ServerKey) _then) = __$ServerKeyCopyWithImpl;
@override @useResult
$Res call({
 bool active, String keyId, bool isTrial,@JsonKey(name: "remainingDays") int? remainingDays,@JsonKey(name: "expireAt") String? expireAt
});




}
/// @nodoc
class __$ServerKeyCopyWithImpl<$Res>
    implements _$ServerKeyCopyWith<$Res> {
  __$ServerKeyCopyWithImpl(this._self, this._then);

  final _ServerKey _self;
  final $Res Function(_ServerKey) _then;

/// Create a copy of ServerKey
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? active = null,Object? keyId = null,Object? isTrial = null,Object? remainingDays = freezed,Object? expireAt = freezed,}) {
  return _then(_ServerKey(
active: null == active ? _self.active : active // ignore: cast_nullable_to_non_nullable
as bool,keyId: null == keyId ? _self.keyId : keyId // ignore: cast_nullable_to_non_nullable
as String,isTrial: null == isTrial ? _self.isTrial : isTrial // ignore: cast_nullable_to_non_nullable
as bool,remainingDays: freezed == remainingDays ? _self.remainingDays : remainingDays // ignore: cast_nullable_to_non_nullable
as int?,expireAt: freezed == expireAt ? _self.expireAt : expireAt // ignore: cast_nullable_to_non_nullable
as String?,
  ));
}


}


/// @nodoc
mixin _$ServerPools {

 List<Server> get simple; List<Server> get whitelist; ServerKey? get key; String? get error; String? get notice; bool get stale;
/// Create a copy of ServerPools
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$ServerPoolsCopyWith<ServerPools> get copyWith => _$ServerPoolsCopyWithImpl<ServerPools>(this as ServerPools, _$identity);

  /// Serializes this ServerPools to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  final _this = this as ServerPools;
  return identical(this, other) || (other.runtimeType == runtimeType&&other is ServerPools&&const DeepCollectionEquality().equals(other.simple, _this.simple)&&const DeepCollectionEquality().equals(other.whitelist, _this.whitelist)&&(identical(other.key, _this.key) || other.key == _this.key)&&(identical(other.error, _this.error) || other.error == _this.error)&&(identical(other.notice, _this.notice) || other.notice == _this.notice)&&(identical(other.stale, _this.stale) || other.stale == _this.stale));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode {
  final _this = this as ServerPools;
  return Object.hash(runtimeType,const DeepCollectionEquality().hash(_this.simple),const DeepCollectionEquality().hash(_this.whitelist),_this.key,_this.error,_this.notice,_this.stale);
}

@override
String toString() {
  final _this = this as ServerPools;
  return 'ServerPools(simple: ${_this.simple}, whitelist: ${_this.whitelist}, key: ${_this.key}, error: ${_this.error}, notice: ${_this.notice}, stale: ${_this.stale})';
}


}

/// @nodoc
abstract mixin class $ServerPoolsCopyWith<$Res>  {
  factory $ServerPoolsCopyWith(ServerPools value, $Res Function(ServerPools) _then) = _$ServerPoolsCopyWithImpl;
@useResult
$Res call({
 List<Server> simple, List<Server> whitelist, ServerKey? key, String? error, String? notice, bool stale
});


$ServerKeyCopyWith<$Res>? get key;

}
/// @nodoc
class _$ServerPoolsCopyWithImpl<$Res>
    implements $ServerPoolsCopyWith<$Res> {
  _$ServerPoolsCopyWithImpl(this._self, this._then);

  final ServerPools _self;
  final $Res Function(ServerPools) _then;

/// Create a copy of ServerPools
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? simple = null,Object? whitelist = null,Object? key = freezed,Object? error = freezed,Object? notice = freezed,Object? stale = null,}) {
  return _then(ServerPools(
simple: null == simple ? _self.simple : simple // ignore: cast_nullable_to_non_nullable
as List<Server>,whitelist: null == whitelist ? _self.whitelist : whitelist // ignore: cast_nullable_to_non_nullable
as List<Server>,key: freezed == key ? _self.key : key // ignore: cast_nullable_to_non_nullable
as ServerKey?,error: freezed == error ? _self.error : error // ignore: cast_nullable_to_non_nullable
as String?,notice: freezed == notice ? _self.notice : notice // ignore: cast_nullable_to_non_nullable
as String?,stale: null == stale ? _self.stale : stale // ignore: cast_nullable_to_non_nullable
as bool,
  ));
}
/// Create a copy of ServerPools
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$ServerKeyCopyWith<$Res>? get key {
    if (_self.key == null) {
    return null;
  }

  return $ServerKeyCopyWith<$Res>(_self.key!, (value) {
    return _then(_self.copyWith(key: value));
  });
}
}


/// Adds pattern-matching-related methods to [ServerPools].
extension ServerPoolsPatterns on ServerPools {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _ServerPools value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _ServerPools() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _ServerPools value)  $default,){
final _that = this;
switch (_that) {
case _ServerPools():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _ServerPools value)?  $default,){
final _that = this;
switch (_that) {
case _ServerPools() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( List<Server> simple,  List<Server> whitelist,  ServerKey? key,  String? error,  String? notice,  bool stale)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _ServerPools() when $default != null:
return $default(_that.simple,_that.whitelist,_that.key,_that.error,_that.notice,_that.stale);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( List<Server> simple,  List<Server> whitelist,  ServerKey? key,  String? error,  String? notice,  bool stale)  $default,) {final _that = this;
switch (_that) {
case _ServerPools():
return $default(_that.simple,_that.whitelist,_that.key,_that.error,_that.notice,_that.stale);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( List<Server> simple,  List<Server> whitelist,  ServerKey? key,  String? error,  String? notice,  bool stale)?  $default,) {final _that = this;
switch (_that) {
case _ServerPools() when $default != null:
return $default(_that.simple,_that.whitelist,_that.key,_that.error,_that.notice,_that.stale);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _ServerPools implements ServerPools {
  const _ServerPools({ List<Server> simple = const <Server>[],  List<Server> whitelist = const <Server>[], this.key, this.error, this.notice, this.stale = false}): _simple = simple,_whitelist = whitelist;
  factory _ServerPools.fromJson(Map<String, dynamic> json) => _$ServerPoolsFromJson(json);

 final  List<Server> _simple;
@override@JsonKey() List<Server> get simple {
  if (_simple is EqualUnmodifiableListView) return _simple;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_simple);
}

 final  List<Server> _whitelist;
@override@JsonKey() List<Server> get whitelist {
  if (_whitelist is EqualUnmodifiableListView) return _whitelist;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_whitelist);
}

@override final  ServerKey? key;
@override final  String? error;
@override final  String? notice;
@override@JsonKey() final  bool stale;

/// Create a copy of ServerPools
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$ServerPoolsCopyWith<_ServerPools> get copyWith => __$ServerPoolsCopyWithImpl<_ServerPools>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$ServerPoolsToJson(this, );
}

@override
bool operator ==(Object other) {
    return identical(this, other) || (other.runtimeType == runtimeType&&other is _ServerPools&&const DeepCollectionEquality().equals(other.simple, _simple)&&const DeepCollectionEquality().equals(other.whitelist, _whitelist)&&(identical(other.key, key) || other.key == key)&&(identical(other.error, error) || other.error == error)&&(identical(other.notice, notice) || other.notice == notice)&&(identical(other.stale, stale) || other.stale == stale));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode {
    return Object.hash(runtimeType,const DeepCollectionEquality().hash(_simple),const DeepCollectionEquality().hash(_whitelist),key,error,notice,stale);
}

@override
String toString() {
    return 'ServerPools(simple: $simple, whitelist: $whitelist, key: $key, error: $error, notice: $notice, stale: $stale)';
}


}

/// @nodoc
abstract mixin class _$ServerPoolsCopyWith<$Res> implements $ServerPoolsCopyWith<$Res> {
  factory _$ServerPoolsCopyWith(_ServerPools value, $Res Function(_ServerPools) _then) = __$ServerPoolsCopyWithImpl;
@override @useResult
$Res call({
 List<Server> simple, List<Server> whitelist, ServerKey? key, String? error, String? notice, bool stale
});


@override $ServerKeyCopyWith<$Res>? get key;

}
/// @nodoc
class __$ServerPoolsCopyWithImpl<$Res>
    implements _$ServerPoolsCopyWith<$Res> {
  __$ServerPoolsCopyWithImpl(this._self, this._then);

  final _ServerPools _self;
  final $Res Function(_ServerPools) _then;

/// Create a copy of ServerPools
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? simple = null,Object? whitelist = null,Object? key = freezed,Object? error = freezed,Object? notice = freezed,Object? stale = null,}) {
  return _then(_ServerPools(
simple: null == simple ? _self._simple : simple // ignore: cast_nullable_to_non_nullable
as List<Server>,whitelist: null == whitelist ? _self._whitelist : whitelist // ignore: cast_nullable_to_non_nullable
as List<Server>,key: freezed == key ? _self.key : key // ignore: cast_nullable_to_non_nullable
as ServerKey?,error: freezed == error ? _self.error : error // ignore: cast_nullable_to_non_nullable
as String?,notice: freezed == notice ? _self.notice : notice // ignore: cast_nullable_to_non_nullable
as String?,stale: null == stale ? _self.stale : stale // ignore: cast_nullable_to_non_nullable
as bool,
  ));
}

/// Create a copy of ServerPools
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$ServerKeyCopyWith<$Res>? get key {
    if (_self.key == null) {
    return null;
  }

  return $ServerKeyCopyWith<$Res>(_self.key!, (value) {
    return _then(_self.copyWith(key: value));
  });
}
}

// dart format on
