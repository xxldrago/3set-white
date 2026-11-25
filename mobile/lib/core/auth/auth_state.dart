import 'package:freezed_annotation/freezed_annotation.dart';
import 'package:mobile/models/auth_models.dart';

part 'auth_state.freezed.dart';

/// Authentication state sealed class.
///
/// Represents all possible authentication states:
/// - [unauthenticated]: No valid session
/// - [authenticated]: Valid session with tokens and user info
/// - [loading]: Session restore or auth operation in progress
/// - [error]: Error occurred during auth operation
@freezed
sealed class AuthState with _$AuthState {
  /// User is not authenticated.
  const factory AuthState.unauthenticated() = _Unauthenticated;

  /// User is authenticated with valid tokens.
  const factory AuthState.authenticated({
    required TokenPair tokens,
    required User user,
  }) = _Authenticated;

  /// Authentication operation in progress (session restore, login, register).
  const factory AuthState.loading() = _Loading;

  /// Authentication error with message.
  const factory AuthState.error(String message) = _Error;
}