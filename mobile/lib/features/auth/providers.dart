import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/legacy.dart';
import 'package:mobile/core/auth/auth_notifier.dart';
import 'package:mobile/core/auth/auth_state.dart';
import 'package:mobile/core/storage/token_store.dart';
import 'package:mobile/core/api/dio_client.dart';
import 'package:mobile/core/deep_link/deep_link_handler.dart';
import 'package:mobile/core/biometric/biometric_gate.dart';
import 'package:mobile/core/connectivity/connectivity_service.dart';
import 'package:mobile/models/auth_models.dart';

/// Core providers re-exported for convenience
export 'package:mobile/core/auth/auth_notifier.dart' show
    dioClientProvider,
    authNotifierProvider,
    tokenStoreProvider,
    AuthNotifier;

export 'package:mobile/core/deep_link/deep_link_handler.dart' show
    deepLinkHandlerProvider;

export 'package:mobile/core/biometric/biometric_gate.dart' show
    biometricGateProvider;

export 'package:mobile/core/connectivity/connectivity_service.dart' show
    connectivityServiceProvider;

/// Re-exports core providers for feature modules.
/// This allows features to depend on a single provider file.

/// Provider for the current authentication state.
/// Watches the AuthNotifier and exposes the AsyncValue<AuthState>.
final authStateProvider = Provider<AsyncValue<AuthState>>((ref) {
  return ref.watch(authNotifierProvider);
});

/// Provider for the AuthNotifier to trigger auth actions.
/// Used by UI to call login, register, logout, startTelegramAuth, etc.
final authNotifierProviderForUI = Provider<AuthNotifier>((ref) {
  return ref.read(authNotifierProvider.notifier);
});

/// Convenience provider to check if user is authenticated.
final isAuthenticatedProvider = Provider<bool>((ref) {
  final authState = ref.watch(authStateProvider);
  return authState.maybeWhen(
    data: (state) => state.maybeWhen(
      authenticated: (_, __) => true,
      orElse: () => false,
    ),
    orElse: () => false,
  );
});

/// Convenience provider to get current user if authenticated.
final currentUserProvider = Provider<User?>((ref) {
  final authState = ref.watch(authStateProvider);
  return authState.maybeWhen(
    data: (state) => state.maybeWhen(
      authenticated: (_, user) => user,
      orElse: () => null,
    ),
    orElse: () => null,
  );
});

/// Convenience provider to get current user ID if authenticated.
final currentUserIdProvider = Provider<int?>((ref) {
  final user = ref.watch(currentUserProvider);
  return user?.id;
});

/// Convenience provider to get current access token if authenticated.
final currentAccessTokenProvider = Provider<String?>((ref) {
  final authState = ref.watch(authStateProvider);
  return authState.maybeWhen(
    data: (state) => state.maybeWhen(
      authenticated: (tokens, _) => tokens.accessToken,
      orElse: () => null,
    ),
    orElse: () => null,
  );
});