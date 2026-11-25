import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Singleton wrapper for [FlutterSecureStorage] with platform-specific configuration.
///
/// Uses hardware-backed encryption on both Android (Keystore) and iOS (Keychain).
/// Provides separate options for biometric-protected reads vs standard reads.
class SecureStorage {
  SecureStorage._();

  static final SecureStorage _instance = SecureStorage._();

  /// The singleton instance.
  static SecureStorage get instance => _instance;

  /// Standard storage options (no biometric required).
  /// Used for refresh token and userId.
  late final FlutterSecureStorage _storage = const FlutterSecureStorage(
    aOptions: AndroidOptions(
      enforceBiometrics: false,
      keyCipherAlgorithm: KeyCipherAlgorithm.AES_GCM_NoPadding,
      storageCipherAlgorithm: StorageCipherAlgorithm.AES_GCM_NoPadding,
      preferencesKeyPrefix: '3set_vpn',
    ),
    iOptions: IOSOptions(
      accessibility: KeychainAccessibility.first_unlock_this_device,
      synchronizable: false,
    ),
  );

  /// Biometric-protected storage options.
  /// Used for access token reads — triggers Face ID / Touch ID / Android biometric prompt.
  late final FlutterSecureStorage _biometricStorage = const FlutterSecureStorage(
    aOptions: AndroidOptions.biometric(
      enforceBiometrics: false,
      requireBiometricsPerOperation: true,
      preferencesKeyPrefix: '3set_vpn',
    ),
    iOptions: IOSOptions(
      accessibility: KeychainAccessibility.first_unlock_this_device,
      synchronizable: false,
      accessControlFlags: [AccessControlFlag.userPresence],
    ),
  );

  /// Standard storage for writes and non-biometric reads.
  FlutterSecureStorage get storage => _storage;

  /// Biometric-protected storage for access token reads.
  FlutterSecureStorage get biometricStorage => _biometricStorage;

  /// Clears all stored data.
  Future<void> clearAll() async {
    await _storage.deleteAll();
  }
}