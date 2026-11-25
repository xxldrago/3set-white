import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile/core/storage/secure_storage.dart';
import 'package:mobile/models/auth_models.dart';

/// Riverpod provider for the SecureStorage singleton.
final secureStorageProvider = Provider<SecureStorage>((ref) {
  return SecureStorage.instance;
});

/// Riverpod provider for TokenStore.
final tokenStoreProvider = Provider<TokenStore>((ref) {
  return TokenStore(ref.read(secureStorageProvider));
});

/// Manages JWT token pair (access + refresh) and user ID in secure storage.
/// Access token reads require biometric authentication.
/// Refresh token reads do NOT require biometric (for background refresh).
class TokenStore {
  static const String _accessKey = 'access_token';
  static const String _refreshKey = 'refresh_token';
  static const String _userIdKey = 'user_id';

  final SecureStorage _storage;

  const TokenStore(this._storage);

  /// Saves the complete token pair and user ID atomically.
  Future<void> saveTokenPair(TokenPair tokens) async {
    await Future.wait<void>([
      _storage.storage.write(key: _accessKey, value: tokens.accessToken),
      _storage.storage.write(key: _refreshKey, value: tokens.refreshToken),
      _storage.storage.write(key: _userIdKey, value: tokens.userId?.toString() ?? ''),
    ]);
  }

  /// Reads the access token WITH biometric authentication.
  /// Triggers Face ID / Touch ID / Android biometric prompt.
  Future<String?> getAccessToken() async {
    return _storage.biometricStorage.read(key: _accessKey);
  }

  /// Reads the access token WITHOUT biometric (for internal use).
  Future<String?> getAccessTokenNoBiometric() async {
    return _storage.storage.read(key: _accessKey);
  }

  /// Reads the refresh token WITHOUT biometric.
  /// Used for background token refresh - no user interaction needed.
  Future<String?> getRefreshToken() async {
    return _storage.storage.read(key: _refreshKey);
  }

  /// Reads the stored user ID.
  Future<int?> getUserId() async {
    final id = await _storage.storage.read(key: _userIdKey);
    return id != null && id.isNotEmpty ? int.tryParse(id) : null;
  }

  /// Checks if both access and refresh tokens exist.
  Future<bool> hasTokens() async {
    final access = await _storage.storage.read(key: _accessKey);
    final refresh = await _storage.storage.read(key: _refreshKey);
    return access != null && access.isNotEmpty && refresh != null && refresh.isNotEmpty;
  }

  /// Clears all tokens and user ID from secure storage.
  Future<void> clearAll() async {
    await Future.wait<void>([
      _storage.storage.delete(key: _accessKey),
      _storage.storage.delete(key: _refreshKey),
      _storage.storage.delete(key: _userIdKey),
    ]);
  }
}