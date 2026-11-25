import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:local_auth/local_auth.dart';
import 'package:local_auth_android/local_auth_android.dart';
import 'package:local_auth_darwin/local_auth_darwin.dart';
import 'package:local_auth_platform_interface/local_auth_platform_interface.dart';

/// Result of biometric authentication.
enum BiometricResult {
  /// Authentication succeeded.
  success,
  /// Authentication failed (wrong biometric, too many attempts, etc.).
  failed,
  /// Biometric is not available on this device.
  notAvailable,
  /// User cancelled the authentication prompt.
  cancelled,
  /// Biometric is not enrolled (no fingerprint/face registered).
  notEnrolled,
  /// Biometric is locked out (too many failed attempts).
  lockedOut,
}

/// Service for biometric authentication (Face ID, Touch ID, Android Biometric).
/// Provides a unified API across iOS and Android using local_auth 3.x.
class BiometricGate {
  final LocalAuthentication _localAuth = LocalAuthentication();

  /// Checks if biometric authentication is available on the device.
  Future<bool> isAvailable() async {
    try {
      return await _localAuth.canCheckBiometrics;
    } catch (e) {
      return false;
    }
  }

  /// Checks if any biometric is enrolled on the device.
  Future<bool> isEnrolled() async {
    try {
      final available = await _localAuth.canCheckBiometrics;
      if (!available) return false;
      final biometrics = await _localAuth.getAvailableBiometrics();
      return biometrics.isNotEmpty;
    } catch (e) {
      return false;
    }
  }

  /// Gets the list of available biometric types.
  Future<List<BiometricType>> getAvailableBiometrics() async {
    try {
      return await _localAuth.getAvailableBiometrics();
    } catch (e) {
      return [];
    }
  }

  /// Authenticates the user with biometrics.
  ///
  /// [reason] - The reason shown to the user (e.g., "Authenticate to access your VPN").
  /// [androidAuthMessages] - Optional custom messages for Android biometric prompt.
  /// [iosAuthMessages] - Optional custom messages for iOS biometric prompt.
  Future<BiometricResult> authenticate({
    required String reason,
    AndroidAuthMessages? androidAuthMessages,
    IOSAuthMessages? iosAuthMessages,
  }) async {
    // Check availability first
    final available = await isAvailable();
    if (!available) {
      return BiometricResult.notAvailable;
    }

    final enrolled = await isEnrolled();
    if (!enrolled) {
      return BiometricResult.notEnrolled;
    }

    final authMessages = <AuthMessages>[
      androidAuthMessages ?? const AndroidAuthMessages(),
      iosAuthMessages ?? const IOSAuthMessages(),
    ];

    try {
      final authenticated = await _localAuth.authenticate(
        localizedReason: reason,
        authMessages: authMessages,
        biometricOnly: true,
        persistAcrossBackgrounding: true,
      );

      if (authenticated) {
        return BiometricResult.success;
      } else {
        return BiometricResult.cancelled;
      }
    } on LocalAuthException catch (e) {
      switch (e.code) {
        case LocalAuthExceptionCode.noBiometricHardware:
        case LocalAuthExceptionCode.biometricHardwareTemporarilyUnavailable:
          return BiometricResult.notAvailable;
        case LocalAuthExceptionCode.noBiometricsEnrolled:
        case LocalAuthExceptionCode.noCredentialsSet:
          return BiometricResult.notEnrolled;
        case LocalAuthExceptionCode.temporaryLockout:
        case LocalAuthExceptionCode.biometricLockout:
          return BiometricResult.lockedOut;
        case LocalAuthExceptionCode.userCanceled:
        case LocalAuthExceptionCode.systemCanceled:
        case LocalAuthExceptionCode.timeout:
        case LocalAuthExceptionCode.userRequestedFallback:
          return BiometricResult.cancelled;
        default:
          return BiometricResult.failed;
      }
    } catch (e) {
      return BiometricResult.failed;
    }
  }

  /// Authenticates with default reason and messages for the VPN app.
  Future<BiometricResult> authenticateForVpnAccess() async {
    return authenticate(
      reason: 'Authenticate to access your VPN keys and subscription',
      androidAuthMessages: const AndroidAuthMessages(
        signInTitle: '3set VPN',
        cancelButton: 'Cancel',
        signInHint: 'Use your fingerprint or face to unlock',
      ),
      iosAuthMessages: const IOSAuthMessages(
        cancelButton: 'Cancel',
        localizedFallbackTitle: 'Use Passcode',
      ),
    );
  }
}

/// Riverpod provider for BiometricGate.
final biometricGateProvider = Provider<BiometricGate>((ref) {
  return BiometricGate();
});