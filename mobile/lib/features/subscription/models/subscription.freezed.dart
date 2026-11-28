// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint, type=warning, deprecated_member_use, deprecated_member_use_from_same_package
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'subscription.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// dart format off
T _$identity<T>(T value) => value;

/// @nodoc
mixin _$SubscriptionUser {

 int get id;@JsonKey(name: "telegramId") int? get telegramId; String? get email;@JsonKey(name: "firstName") String? get firstName;@JsonKey(name: "lastName") String? get lastName;@JsonKey(name: "username") String? get username;@JsonKey(name: "referralCode") String? get referralCode;
/// Create a copy of SubscriptionUser
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$SubscriptionUserCopyWith<SubscriptionUser> get copyWith => _$SubscriptionUserCopyWithImpl<SubscriptionUser>(this as SubscriptionUser, _$identity);

  /// Serializes this SubscriptionUser to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  final _this = this as SubscriptionUser;
  return identical(this, other) || (other.runtimeType == runtimeType&&other is SubscriptionUser&&(identical(other.id, _this.id) || other.id == _this.id)&&(identical(other.telegramId, _this.telegramId) || other.telegramId == _this.telegramId)&&(identical(other.email, _this.email) || other.email == _this.email)&&(identical(other.firstName, _this.firstName) || other.firstName == _this.firstName)&&(identical(other.lastName, _this.lastName) || other.lastName == _this.lastName)&&(identical(other.username, _this.username) || other.username == _this.username)&&(identical(other.referralCode, _this.referralCode) || other.referralCode == _this.referralCode));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode {
  final _this = this as SubscriptionUser;
  return Object.hash(runtimeType,_this.id,_this.telegramId,_this.email,_this.firstName,_this.lastName,_this.username,_this.referralCode);
}

@override
String toString() {
  final _this = this as SubscriptionUser;
  return 'SubscriptionUser(id: ${_this.id}, telegramId: ${_this.telegramId}, email: ${_this.email}, firstName: ${_this.firstName}, lastName: ${_this.lastName}, username: ${_this.username}, referralCode: ${_this.referralCode})';
}


}

/// @nodoc
abstract mixin class $SubscriptionUserCopyWith<$Res>  {
  factory $SubscriptionUserCopyWith(SubscriptionUser value, $Res Function(SubscriptionUser) _then) = _$SubscriptionUserCopyWithImpl;
@useResult
$Res call({
 int id,@JsonKey(name: "telegramId") int? telegramId, String? email,@JsonKey(name: "firstName") String? firstName,@JsonKey(name: "lastName") String? lastName,@JsonKey(name: "username") String? username,@JsonKey(name: "referralCode") String? referralCode
});




}
/// @nodoc
class _$SubscriptionUserCopyWithImpl<$Res>
    implements $SubscriptionUserCopyWith<$Res> {
  _$SubscriptionUserCopyWithImpl(this._self, this._then);

  final SubscriptionUser _self;
  final $Res Function(SubscriptionUser) _then;

/// Create a copy of SubscriptionUser
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? id = null,Object? telegramId = freezed,Object? email = freezed,Object? firstName = freezed,Object? lastName = freezed,Object? username = freezed,Object? referralCode = freezed,}) {
  return _then(SubscriptionUser(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as int,telegramId: freezed == telegramId ? _self.telegramId : telegramId // ignore: cast_nullable_to_non_nullable
as int?,email: freezed == email ? _self.email : email // ignore: cast_nullable_to_non_nullable
as String?,firstName: freezed == firstName ? _self.firstName : firstName // ignore: cast_nullable_to_non_nullable
as String?,lastName: freezed == lastName ? _self.lastName : lastName // ignore: cast_nullable_to_non_nullable
as String?,username: freezed == username ? _self.username : username // ignore: cast_nullable_to_non_nullable
as String?,referralCode: freezed == referralCode ? _self.referralCode : referralCode // ignore: cast_nullable_to_non_nullable
as String?,
  ));
}

}


/// Adds pattern-matching-related methods to [SubscriptionUser].
extension SubscriptionUserPatterns on SubscriptionUser {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _SubscriptionUser value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _SubscriptionUser() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _SubscriptionUser value)  $default,){
final _that = this;
switch (_that) {
case _SubscriptionUser():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _SubscriptionUser value)?  $default,){
final _that = this;
switch (_that) {
case _SubscriptionUser() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( int id, @JsonKey(name: "telegramId")  int? telegramId,  String? email, @JsonKey(name: "firstName")  String? firstName, @JsonKey(name: "lastName")  String? lastName, @JsonKey(name: "username")  String? username, @JsonKey(name: "referralCode")  String? referralCode)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _SubscriptionUser() when $default != null:
return $default(_that.id,_that.telegramId,_that.email,_that.firstName,_that.lastName,_that.username,_that.referralCode);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( int id, @JsonKey(name: "telegramId")  int? telegramId,  String? email, @JsonKey(name: "firstName")  String? firstName, @JsonKey(name: "lastName")  String? lastName, @JsonKey(name: "username")  String? username, @JsonKey(name: "referralCode")  String? referralCode)  $default,) {final _that = this;
switch (_that) {
case _SubscriptionUser():
return $default(_that.id,_that.telegramId,_that.email,_that.firstName,_that.lastName,_that.username,_that.referralCode);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( int id, @JsonKey(name: "telegramId")  int? telegramId,  String? email, @JsonKey(name: "firstName")  String? firstName, @JsonKey(name: "lastName")  String? lastName, @JsonKey(name: "username")  String? username, @JsonKey(name: "referralCode")  String? referralCode)?  $default,) {final _that = this;
switch (_that) {
case _SubscriptionUser() when $default != null:
return $default(_that.id,_that.telegramId,_that.email,_that.firstName,_that.lastName,_that.username,_that.referralCode);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _SubscriptionUser implements SubscriptionUser {
  const _SubscriptionUser({required this.id, @JsonKey(name: "telegramId") this.telegramId, this.email, @JsonKey(name: "firstName") this.firstName, @JsonKey(name: "lastName") this.lastName, @JsonKey(name: "username") this.username, @JsonKey(name: "referralCode") this.referralCode});
  factory _SubscriptionUser.fromJson(Map<String, dynamic> json) => _$SubscriptionUserFromJson(json);

@override final  int id;
@override@JsonKey(name: "telegramId") final  int? telegramId;
@override final  String? email;
@override@JsonKey(name: "firstName") final  String? firstName;
@override@JsonKey(name: "lastName") final  String? lastName;
@override@JsonKey(name: "username") final  String? username;
@override@JsonKey(name: "referralCode") final  String? referralCode;

/// Create a copy of SubscriptionUser
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$SubscriptionUserCopyWith<_SubscriptionUser> get copyWith => __$SubscriptionUserCopyWithImpl<_SubscriptionUser>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$SubscriptionUserToJson(this, );
}

@override
bool operator ==(Object other) {
    return identical(this, other) || (other.runtimeType == runtimeType&&other is _SubscriptionUser&&(identical(other.id, id) || other.id == id)&&(identical(other.telegramId, telegramId) || other.telegramId == telegramId)&&(identical(other.email, email) || other.email == email)&&(identical(other.firstName, firstName) || other.firstName == firstName)&&(identical(other.lastName, lastName) || other.lastName == lastName)&&(identical(other.username, username) || other.username == username)&&(identical(other.referralCode, referralCode) || other.referralCode == referralCode));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode {
    return Object.hash(runtimeType,id,telegramId,email,firstName,lastName,username,referralCode);
}

@override
String toString() {
    return 'SubscriptionUser(id: $id, telegramId: $telegramId, email: $email, firstName: $firstName, lastName: $lastName, username: $username, referralCode: $referralCode)';
}


}

/// @nodoc
abstract mixin class _$SubscriptionUserCopyWith<$Res> implements $SubscriptionUserCopyWith<$Res> {
  factory _$SubscriptionUserCopyWith(_SubscriptionUser value, $Res Function(_SubscriptionUser) _then) = __$SubscriptionUserCopyWithImpl;
@override @useResult
$Res call({
 int id,@JsonKey(name: "telegramId") int? telegramId, String? email,@JsonKey(name: "firstName") String? firstName,@JsonKey(name: "lastName") String? lastName,@JsonKey(name: "username") String? username,@JsonKey(name: "referralCode") String? referralCode
});




}
/// @nodoc
class __$SubscriptionUserCopyWithImpl<$Res>
    implements _$SubscriptionUserCopyWith<$Res> {
  __$SubscriptionUserCopyWithImpl(this._self, this._then);

  final _SubscriptionUser _self;
  final $Res Function(_SubscriptionUser) _then;

/// Create a copy of SubscriptionUser
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? id = null,Object? telegramId = freezed,Object? email = freezed,Object? firstName = freezed,Object? lastName = freezed,Object? username = freezed,Object? referralCode = freezed,}) {
  return _then(_SubscriptionUser(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as int,telegramId: freezed == telegramId ? _self.telegramId : telegramId // ignore: cast_nullable_to_non_nullable
as int?,email: freezed == email ? _self.email : email // ignore: cast_nullable_to_non_nullable
as String?,firstName: freezed == firstName ? _self.firstName : firstName // ignore: cast_nullable_to_non_nullable
as String?,lastName: freezed == lastName ? _self.lastName : lastName // ignore: cast_nullable_to_non_nullable
as String?,username: freezed == username ? _self.username : username // ignore: cast_nullable_to_non_nullable
as String?,referralCode: freezed == referralCode ? _self.referralCode : referralCode // ignore: cast_nullable_to_non_nullable
as String?,
  ));
}


}


/// @nodoc
mixin _$SubscriptionStatus {

 bool get ok; String? get error; SubscriptionUser? get user;@JsonKey(name: "expiresAt") String? get expiresAt;@JsonKey(name: "remainingDays") int? get remainingDays;@JsonKey(name: "deviceLimit") int? get deviceLimit; String? get link; int? get devices;@JsonKey(name: "isTrial") bool get isTrial;@JsonKey(name: "statusKind") String? get statusKind;@JsonKey(name: "graceUntil") String? get graceUntil;
/// Create a copy of SubscriptionStatus
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$SubscriptionStatusCopyWith<SubscriptionStatus> get copyWith => _$SubscriptionStatusCopyWithImpl<SubscriptionStatus>(this as SubscriptionStatus, _$identity);

  /// Serializes this SubscriptionStatus to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  final _this = this as SubscriptionStatus;
  return identical(this, other) || (other.runtimeType == runtimeType&&other is SubscriptionStatus&&(identical(other.ok, _this.ok) || other.ok == _this.ok)&&(identical(other.error, _this.error) || other.error == _this.error)&&(identical(other.user, _this.user) || other.user == _this.user)&&(identical(other.expiresAt, _this.expiresAt) || other.expiresAt == _this.expiresAt)&&(identical(other.remainingDays, _this.remainingDays) || other.remainingDays == _this.remainingDays)&&(identical(other.deviceLimit, _this.deviceLimit) || other.deviceLimit == _this.deviceLimit)&&(identical(other.link, _this.link) || other.link == _this.link)&&(identical(other.devices, _this.devices) || other.devices == _this.devices)&&(identical(other.isTrial, _this.isTrial) || other.isTrial == _this.isTrial)&&(identical(other.statusKind, _this.statusKind) || other.statusKind == _this.statusKind)&&(identical(other.graceUntil, _this.graceUntil) || other.graceUntil == _this.graceUntil));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode {
  final _this = this as SubscriptionStatus;
  return Object.hash(runtimeType,_this.ok,_this.error,_this.user,_this.expiresAt,_this.remainingDays,_this.deviceLimit,_this.link,_this.devices,_this.isTrial,_this.statusKind,_this.graceUntil);
}

@override
String toString() {
  final _this = this as SubscriptionStatus;
  return 'SubscriptionStatus(ok: ${_this.ok}, error: ${_this.error}, user: ${_this.user}, expiresAt: ${_this.expiresAt}, remainingDays: ${_this.remainingDays}, deviceLimit: ${_this.deviceLimit}, link: ${_this.link}, devices: ${_this.devices}, isTrial: ${_this.isTrial}, statusKind: ${_this.statusKind}, graceUntil: ${_this.graceUntil})';
}


}

/// @nodoc
abstract mixin class $SubscriptionStatusCopyWith<$Res>  {
  factory $SubscriptionStatusCopyWith(SubscriptionStatus value, $Res Function(SubscriptionStatus) _then) = _$SubscriptionStatusCopyWithImpl;
@useResult
$Res call({
 bool ok, String? error, SubscriptionUser? user,@JsonKey(name: "expiresAt") String? expiresAt,@JsonKey(name: "remainingDays") int? remainingDays,@JsonKey(name: "deviceLimit") int? deviceLimit, String? link, int? devices,@JsonKey(name: "isTrial") bool isTrial,@JsonKey(name: "statusKind") String? statusKind,@JsonKey(name: "graceUntil") String? graceUntil
});


$SubscriptionUserCopyWith<$Res>? get user;

}
/// @nodoc
class _$SubscriptionStatusCopyWithImpl<$Res>
    implements $SubscriptionStatusCopyWith<$Res> {
  _$SubscriptionStatusCopyWithImpl(this._self, this._then);

  final SubscriptionStatus _self;
  final $Res Function(SubscriptionStatus) _then;

/// Create a copy of SubscriptionStatus
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? ok = null,Object? error = freezed,Object? user = freezed,Object? expiresAt = freezed,Object? remainingDays = freezed,Object? deviceLimit = freezed,Object? link = freezed,Object? devices = freezed,Object? isTrial = null,Object? statusKind = freezed,Object? graceUntil = freezed,}) {
  return _then(SubscriptionStatus(
ok: null == ok ? _self.ok : ok // ignore: cast_nullable_to_non_nullable
as bool,error: freezed == error ? _self.error : error // ignore: cast_nullable_to_non_nullable
as String?,user: freezed == user ? _self.user : user // ignore: cast_nullable_to_non_nullable
as SubscriptionUser?,expiresAt: freezed == expiresAt ? _self.expiresAt : expiresAt // ignore: cast_nullable_to_non_nullable
as String?,remainingDays: freezed == remainingDays ? _self.remainingDays : remainingDays // ignore: cast_nullable_to_non_nullable
as int?,deviceLimit: freezed == deviceLimit ? _self.deviceLimit : deviceLimit // ignore: cast_nullable_to_non_nullable
as int?,link: freezed == link ? _self.link : link // ignore: cast_nullable_to_non_nullable
as String?,devices: freezed == devices ? _self.devices : devices // ignore: cast_nullable_to_non_nullable
as int?,isTrial: null == isTrial ? _self.isTrial : isTrial // ignore: cast_nullable_to_non_nullable
as bool,statusKind: freezed == statusKind ? _self.statusKind : statusKind // ignore: cast_nullable_to_non_nullable
as String?,graceUntil: freezed == graceUntil ? _self.graceUntil : graceUntil // ignore: cast_nullable_to_non_nullable
as String?,
  ));
}
/// Create a copy of SubscriptionStatus
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$SubscriptionUserCopyWith<$Res>? get user {
    if (_self.user == null) {
    return null;
  }

  return $SubscriptionUserCopyWith<$Res>(_self.user!, (value) {
    return _then(_self.copyWith(user: value));
  });
}
}


/// Adds pattern-matching-related methods to [SubscriptionStatus].
extension SubscriptionStatusPatterns on SubscriptionStatus {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _SubscriptionStatus value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _SubscriptionStatus() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _SubscriptionStatus value)  $default,){
final _that = this;
switch (_that) {
case _SubscriptionStatus():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _SubscriptionStatus value)?  $default,){
final _that = this;
switch (_that) {
case _SubscriptionStatus() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( bool ok,  String? error,  SubscriptionUser? user, @JsonKey(name: "expiresAt")  String? expiresAt, @JsonKey(name: "remainingDays")  int? remainingDays, @JsonKey(name: "deviceLimit")  int? deviceLimit,  String? link,  int? devices, @JsonKey(name: "isTrial")  bool isTrial, @JsonKey(name: "statusKind")  String? statusKind, @JsonKey(name: "graceUntil")  String? graceUntil)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _SubscriptionStatus() when $default != null:
return $default(_that.ok,_that.error,_that.user,_that.expiresAt,_that.remainingDays,_that.deviceLimit,_that.link,_that.devices,_that.isTrial,_that.statusKind,_that.graceUntil);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( bool ok,  String? error,  SubscriptionUser? user, @JsonKey(name: "expiresAt")  String? expiresAt, @JsonKey(name: "remainingDays")  int? remainingDays, @JsonKey(name: "deviceLimit")  int? deviceLimit,  String? link,  int? devices, @JsonKey(name: "isTrial")  bool isTrial, @JsonKey(name: "statusKind")  String? statusKind, @JsonKey(name: "graceUntil")  String? graceUntil)  $default,) {final _that = this;
switch (_that) {
case _SubscriptionStatus():
return $default(_that.ok,_that.error,_that.user,_that.expiresAt,_that.remainingDays,_that.deviceLimit,_that.link,_that.devices,_that.isTrial,_that.statusKind,_that.graceUntil);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( bool ok,  String? error,  SubscriptionUser? user, @JsonKey(name: "expiresAt")  String? expiresAt, @JsonKey(name: "remainingDays")  int? remainingDays, @JsonKey(name: "deviceLimit")  int? deviceLimit,  String? link,  int? devices, @JsonKey(name: "isTrial")  bool isTrial, @JsonKey(name: "statusKind")  String? statusKind, @JsonKey(name: "graceUntil")  String? graceUntil)?  $default,) {final _that = this;
switch (_that) {
case _SubscriptionStatus() when $default != null:
return $default(_that.ok,_that.error,_that.user,_that.expiresAt,_that.remainingDays,_that.deviceLimit,_that.link,_that.devices,_that.isTrial,_that.statusKind,_that.graceUntil);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _SubscriptionStatus implements SubscriptionStatus {
  const _SubscriptionStatus({required this.ok, this.error, this.user, @JsonKey(name: "expiresAt") this.expiresAt, @JsonKey(name: "remainingDays") this.remainingDays, @JsonKey(name: "deviceLimit") this.deviceLimit, this.link, this.devices, @JsonKey(name: "isTrial") this.isTrial = false, @JsonKey(name: "statusKind") this.statusKind, @JsonKey(name: "graceUntil") this.graceUntil});
  factory _SubscriptionStatus.fromJson(Map<String, dynamic> json) => _$SubscriptionStatusFromJson(json);

@override final  bool ok;
@override final  String? error;
@override final  SubscriptionUser? user;
@override@JsonKey(name: "expiresAt") final  String? expiresAt;
@override@JsonKey(name: "remainingDays") final  int? remainingDays;
@override@JsonKey(name: "deviceLimit") final  int? deviceLimit;
@override final  String? link;
@override final  int? devices;
@override@JsonKey(name: "isTrial") final  bool isTrial;
@override@JsonKey(name: "statusKind") final  String? statusKind;
@override@JsonKey(name: "graceUntil") final  String? graceUntil;

/// Create a copy of SubscriptionStatus
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$SubscriptionStatusCopyWith<_SubscriptionStatus> get copyWith => __$SubscriptionStatusCopyWithImpl<_SubscriptionStatus>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$SubscriptionStatusToJson(this, );
}

@override
bool operator ==(Object other) {
    return identical(this, other) || (other.runtimeType == runtimeType&&other is _SubscriptionStatus&&(identical(other.ok, ok) || other.ok == ok)&&(identical(other.error, error) || other.error == error)&&(identical(other.user, user) || other.user == user)&&(identical(other.expiresAt, expiresAt) || other.expiresAt == expiresAt)&&(identical(other.remainingDays, remainingDays) || other.remainingDays == remainingDays)&&(identical(other.deviceLimit, deviceLimit) || other.deviceLimit == deviceLimit)&&(identical(other.link, link) || other.link == link)&&(identical(other.devices, devices) || other.devices == devices)&&(identical(other.isTrial, isTrial) || other.isTrial == isTrial)&&(identical(other.statusKind, statusKind) || other.statusKind == statusKind)&&(identical(other.graceUntil, graceUntil) || other.graceUntil == graceUntil));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode {
    return Object.hash(runtimeType,ok,error,user,expiresAt,remainingDays,deviceLimit,link,devices,isTrial,statusKind,graceUntil);
}

@override
String toString() {
    return 'SubscriptionStatus(ok: $ok, error: $error, user: $user, expiresAt: $expiresAt, remainingDays: $remainingDays, deviceLimit: $deviceLimit, link: $link, devices: $devices, isTrial: $isTrial, statusKind: $statusKind, graceUntil: $graceUntil)';
}


}

/// @nodoc
abstract mixin class _$SubscriptionStatusCopyWith<$Res> implements $SubscriptionStatusCopyWith<$Res> {
  factory _$SubscriptionStatusCopyWith(_SubscriptionStatus value, $Res Function(_SubscriptionStatus) _then) = __$SubscriptionStatusCopyWithImpl;
@override @useResult
$Res call({
 bool ok, String? error, SubscriptionUser? user,@JsonKey(name: "expiresAt") String? expiresAt,@JsonKey(name: "remainingDays") int? remainingDays,@JsonKey(name: "deviceLimit") int? deviceLimit, String? link, int? devices,@JsonKey(name: "isTrial") bool isTrial,@JsonKey(name: "statusKind") String? statusKind,@JsonKey(name: "graceUntil") String? graceUntil
});


@override $SubscriptionUserCopyWith<$Res>? get user;

}
/// @nodoc
class __$SubscriptionStatusCopyWithImpl<$Res>
    implements _$SubscriptionStatusCopyWith<$Res> {
  __$SubscriptionStatusCopyWithImpl(this._self, this._then);

  final _SubscriptionStatus _self;
  final $Res Function(_SubscriptionStatus) _then;

/// Create a copy of SubscriptionStatus
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? ok = null,Object? error = freezed,Object? user = freezed,Object? expiresAt = freezed,Object? remainingDays = freezed,Object? deviceLimit = freezed,Object? link = freezed,Object? devices = freezed,Object? isTrial = null,Object? statusKind = freezed,Object? graceUntil = freezed,}) {
  return _then(_SubscriptionStatus(
ok: null == ok ? _self.ok : ok // ignore: cast_nullable_to_non_nullable
as bool,error: freezed == error ? _self.error : error // ignore: cast_nullable_to_non_nullable
as String?,user: freezed == user ? _self.user : user // ignore: cast_nullable_to_non_nullable
as SubscriptionUser?,expiresAt: freezed == expiresAt ? _self.expiresAt : expiresAt // ignore: cast_nullable_to_non_nullable
as String?,remainingDays: freezed == remainingDays ? _self.remainingDays : remainingDays // ignore: cast_nullable_to_non_nullable
as int?,deviceLimit: freezed == deviceLimit ? _self.deviceLimit : deviceLimit // ignore: cast_nullable_to_non_nullable
as int?,link: freezed == link ? _self.link : link // ignore: cast_nullable_to_non_nullable
as String?,devices: freezed == devices ? _self.devices : devices // ignore: cast_nullable_to_non_nullable
as int?,isTrial: null == isTrial ? _self.isTrial : isTrial // ignore: cast_nullable_to_non_nullable
as bool,statusKind: freezed == statusKind ? _self.statusKind : statusKind // ignore: cast_nullable_to_non_nullable
as String?,graceUntil: freezed == graceUntil ? _self.graceUntil : graceUntil // ignore: cast_nullable_to_non_nullable
as String?,
  ));
}

/// Create a copy of SubscriptionStatus
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$SubscriptionUserCopyWith<$Res>? get user {
    if (_self.user == null) {
    return null;
  }

  return $SubscriptionUserCopyWith<$Res>(_self.user!, (value) {
    return _then(_self.copyWith(user: value));
  });
}
}

// dart format on
