import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile/core/auth/auth_notifier.dart';
import 'package:mobile/core/biometric/biometric_gate.dart' as bio;
import 'package:mobile/core/storage/token_store.dart';

/// Riverpod provider for the resume biometric gate.
///
/// Reads the token store and auth notifier, and registers a
/// [WidgetsBindingObserver] that locks the session when the app resumes.
final resumeBiometricGateProvider = Provider<BiometricGate>((ref) {
  final tokenStore = ref.read(tokenStoreProvider);
  final authNotifier = ref.read(authNotifierProvider.notifier);
  final gate = BiometricGate(
    tokenStore,
    authenticate: () => bio.BiometricGate().authenticateForVpnAccess(),
    onLockedOut: authNotifier.setUnauthenticated,
  );
  // Register the observer when the provider is first read.
  gate.registerObserver();
  ref.onDispose(gate.unregisterObserver);
  return gate;
});

/// Locks the session with a biometric prompt whenever the app resumes while
/// tokens are present.
///
/// A failed/cancelled prompt clears the stored tokens and notifies
/// [onLockedOut] so the router can send the user back to the auth screen.
class BiometricGate extends WidgetsBindingObserver {
  BiometricGate(
    this._tokenStore, {
    required Future<bio.BiometricResult> Function() authenticate,
    VoidCallback? onLockedOut,
  })  : _authenticate = authenticate,
        _onLockedOut = onLockedOut;

  final TokenStore _tokenStore;
  final Future<bio.BiometricResult> Function() _authenticate;
  final VoidCallback? _onLockedOut;

  bool _registered = false;
  bool _authenticating = false;

  /// Registers this observer with the WidgetsBinding.
  void registerObserver() {
    if (!_registered) {
      WidgetsBinding.instance.addObserver(this);
      _registered = true;
    }
  }

  /// Unregisters this observer from the WidgetsBinding.
  void unregisterObserver() {
    if (_registered) {
      WidgetsBinding.instance.removeObserver(this);
      _registered = false;
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      onAppResumed();
    }
  }

  /// Called when the app resumes from background.
  ///
  /// If tokens exist, prompts for biometrics. A cancelled or failed prompt
  /// clears the session. Devices without biometric hardware/enrolment are not
  /// locked out (there is nothing to unlock with).
  @visibleForTesting
  Future<void> onAppResumed() async {
    if (_authenticating) return;

    final hasTokens = await _tokenStore.hasTokens();
    if (!hasTokens) return;

    _authenticating = true;
    try {
      final result = await _authenticate();

      switch (result) {
        case bio.BiometricResult.success:
        case bio.BiometricResult.notAvailable:
        case bio.BiometricResult.notEnrolled:
          return;
        case bio.BiometricResult.failed:
        case bio.BiometricResult.cancelled:
        case bio.BiometricResult.lockedOut:
          await _tokenStore.clearAll();
          _onLockedOut?.call();
      }
    } catch (_) {
      // Any unexpected biometric error locks the session.
      await _tokenStore.clearAll();
      _onLockedOut?.call();
    } finally {
      _authenticating = false;
    }
  }

  /// For testing: returns whether observer is registered.
  @visibleForTesting
  bool get isRegistered => _registered;
}
