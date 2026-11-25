import 'package:jwt_decoder/jwt_decoder.dart';

/// JWT utilities for token expiry checking and decoding.
/// Uses jwt_decoder package for reliable JWT parsing.
class JwtUtils {
  static const int _refreshThresholdMinutes = 5;

  /// Checks if a JWT token is expired.
  /// Returns true if token is malformed or expired.
  static bool isExpired(String token) {
    try {
      return JwtDecoder.isExpired(token);
    } catch (_) {
      return true; // Treat malformed tokens as expired
    }
  }

  /// Checks if a JWT token is expiring soon (within threshold).
  /// Returns true if token expires within [_refreshThresholdMinutes] minutes.
  static bool isExpiringSoon(String token) {
    try {
      final expiry = JwtDecoder.getExpirationDate(token);
      final threshold = DateTime.now().add(Duration(minutes: _refreshThresholdMinutes));
      return expiry.isBefore(threshold);
    } catch (_) {
      return true; // Treat malformed tokens as expiring soon
    }
  }

  /// Gets the expiration date of a JWT token.
  /// Returns null if token is malformed.
  static DateTime? getExpiry(String token) {
    try {
      return JwtDecoder.getExpirationDate(token);
    } catch (_) {
      return null;
    }
  }

  /// Gets all claims from a JWT token.
  /// Returns null if token is malformed.
  static Map<String, dynamic>? getClaims(String token) {
    try {
      return JwtDecoder.decode(token);
    } catch (_) {
      return null;
    }
  }

  /// Gets the user ID (uid) claim from a JWT token.
  /// Returns null if token is malformed or claim is missing.
  static int? getUserId(String token) {
    final claims = getClaims(token);
    if (claims == null) return null;
    final uid = claims['uid'];
    if (uid is int) return uid;
    if (uid is String) return int.tryParse(uid);
    return null;
  }

  /// Gets the telegram ID (tid) claim from a JWT token.
  /// Returns null if token is malformed or claim is missing.
  static int? getTelegramId(String token) {
    final claims = getClaims(token);
    if (claims == null) return null;
    final tid = claims['tid'];
    if (tid is int) return tid;
    if (tid is String) return int.tryParse(tid);
    return null;
  }

  /// Checks if a token is valid (not expired and not malformed).
  static bool isValid(String token) {
    return !isExpired(token) && getClaims(token) != null;
  }

  /// Gets the time until token expiry in seconds.
  /// Returns null if token is malformed.
  static int? getTimeUntilExpiry(String token) {
    final expiry = getExpiry(token);
    if (expiry == null) return null;
    final diff = expiry.difference(DateTime.now());
    return diff.inSeconds > 0 ? diff.inSeconds : 0;
  }
}