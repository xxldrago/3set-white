import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile/core/storage/token_store.dart';

/// Riverpod provider for BiometricGate.
/// Registers a [WidgetsBindingObserver] to listen for app lifecycle changes
/// and triggers biometric authentication on app resume when tokens exist.
final biometricGateProvider = Provider<BiometricGate>((ref) {
  final tokenStore = ref.read(tokenStoreProvider);
  final gate = BiometricGate(tokenStore);
  // Register the observer when the provider is first read
  gate.registerObserver();
  // Clean up on dispose
  ref.onDispose(() => gate.unregisterObserver());
  return gate;
});

/// Listens for app lifecycle events and triggers biometric authentication
/// when the app resumes and tokens exist in secure storage.
class BiometricGate extends WidgetsBindingObserver {
  BiometricGate(this._tokenStore);

  final TokenStore _tokenStore;
  bool _registered = false;

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
  /// If tokens exist, triggers biometric authentication by reading access token.
  /// Exposed for testing.
  @visibleForTesting
  Future<void> onAppResumed() async {
    final hasTokens = await _tokenStore.hasTokens();
    if (!hasTokens) {
      return; // No tokens, nothing to do
    }

    // Trigger biometric authentication by reading the access token.
    // This will show the Face ID / Touch ID / Android biometric prompt.
    try {
      final token = await _tokenStore.getAccessToken();
      if (token == null) {
        // Biometric cancelled or failed - clear tokens
        await _tokenStore.clearAll();
        // AuthNotifier will pick up the change on next build
      }
    } catch (e) {
      // Biometric error (e.g., not enrolled, hardware unavailable)
      // Clear tokens to force re-authentication
      await _tokenStore.clearAll();
    }
  }

  /// For testing: returns whether observer is registered.
  @visibleForTesting
  bool get isRegistered => _registered;
}
