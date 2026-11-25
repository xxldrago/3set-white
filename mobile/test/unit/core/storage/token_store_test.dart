import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:mobile/core/storage/secure_storage.dart';
import 'package:mobile/core/storage/token_store.dart' show TokenStore;
import 'package:mobile/models/auth_models.dart';

class MockFlutterSecureStorage extends Mock implements FlutterSecureStorage {}

class MockSecureStorage extends Mock implements SecureStorage {}

void main() {
  group('TokenStore', () {
    late MockSecureStorage mockSecureStorage;
    late MockFlutterSecureStorage mockStorage;
    late MockFlutterSecureStorage mockBiometricStorage;
    late TokenStore tokenStore;

    setUp(() {
      mockSecureStorage = MockSecureStorage();
      mockStorage = MockFlutterSecureStorage();
      mockBiometricStorage = MockFlutterSecureStorage();

      when(() => mockSecureStorage.storage).thenReturn(mockStorage);
      when(() => mockSecureStorage.biometricStorage).thenReturn(mockBiometricStorage);

      tokenStore = TokenStore(mockSecureStorage);
    });

    group('saveTokenPair', () {
      test('writes access token, refresh token, and user ID', () async {
        const tokenPair = TokenPair(
          accessToken: 'access_123',
          refreshToken: 'refresh_456',
          expiresIn: 900,
          userId: 789,
        );

        when(() => mockStorage.write(key: 'access_token', value: 'access_123'))
            .thenAnswer((_) async => Future<void>.value());
        when(() => mockStorage.write(key: 'refresh_token', value: 'refresh_456'))
            .thenAnswer((_) async => Future<void>.value());
        when(() => mockStorage.write(key: 'user_id', value: '789'))
            .thenAnswer((_) async => Future<void>.value());

        await tokenStore.saveTokenPair(tokenPair);

        verify(() => mockStorage.write(key: 'access_token', value: 'access_123')).called(1);
        verify(() => mockStorage.write(key: 'refresh_token', value: 'refresh_456')).called(1);
        verify(() => mockStorage.write(key: 'user_id', value: '789')).called(1);
      });

      test('writes empty string for userId when null', () async {
        const tokenPair = TokenPair(
          accessToken: 'access_123',
          refreshToken: 'refresh_456',
          expiresIn: 900,
          userId: null,
        );

        when(() => mockStorage.write(key: 'access_token', value: 'access_123'))
            .thenAnswer((_) async => Future<void>.value());
        when(() => mockStorage.write(key: 'refresh_token', value: 'refresh_456'))
            .thenAnswer((_) async => Future<void>.value());
        when(() => mockStorage.write(key: 'user_id', value: ''))
            .thenAnswer((_) async => Future<void>.value());

        await tokenStore.saveTokenPair(tokenPair);

        verify(() => mockStorage.write(key: 'user_id', value: '')).called(1);
      });
    });

    group('getAccessToken', () {
      test('calls biometric storage read for access token', () async {
        when(() => mockBiometricStorage.read(key: 'access_token'))
            .thenAnswer((_) async => 'access_123');

        final result = await tokenStore.getAccessToken();

        expect(result, 'access_123');
        verify(() => mockBiometricStorage.read(key: 'access_token')).called(1);
      });

      test('returns null when no access token stored', () async {
        when(() => mockBiometricStorage.read(key: 'access_token'))
            .thenAnswer((_) async => null);

        final result = await tokenStore.getAccessToken();

        expect(result, isNull);
      });
    });

    group('getAccessTokenNoBiometric', () {
      test('calls read without biometric for access token', () async {
        when(() => mockStorage.read(key: 'access_token'))
            .thenAnswer((_) async => 'access_123');

        final result = await tokenStore.getAccessTokenNoBiometric();

        expect(result, 'access_123');
        verify(() => mockStorage.read(key: 'access_token')).called(1);
      });
    });

    group('getRefreshToken', () {
      test('calls read without biometric for refresh token', () async {
        when(() => mockStorage.read(key: 'refresh_token'))
            .thenAnswer((_) async => 'refresh_456');

        final result = await tokenStore.getRefreshToken();

        expect(result, 'refresh_456');
        verify(() => mockStorage.read(key: 'refresh_token')).called(1);
      });
    });

    group('getUserId', () {
      test('parses and returns user ID', () async {
        when(() => mockStorage.read(key: 'user_id'))
            .thenAnswer((_) async => '789');

        final result = await tokenStore.getUserId();

        expect(result, 789);
      });

      test('returns null when user ID not stored', () async {
        when(() => mockStorage.read(key: 'user_id'))
            .thenAnswer((_) async => null);

        final result = await tokenStore.getUserId();

        expect(result, isNull);
      });

      test('returns null when user ID is empty string', () async {
        when(() => mockStorage.read(key: 'user_id'))
            .thenAnswer((_) async => '');

        final result = await tokenStore.getUserId();

        expect(result, isNull);
      });

      test('returns null when user ID is not a valid integer', () async {
        when(() => mockStorage.read(key: 'user_id'))
            .thenAnswer((_) async => 'invalid');

        final result = await tokenStore.getUserId();

        expect(result, isNull);
      });
    });

    group('hasTokens', () {
      test('returns true when both tokens exist', () async {
        when(() => mockStorage.read(key: 'access_token'))
            .thenAnswer((_) async => 'access_123');
        when(() => mockStorage.read(key: 'refresh_token'))
            .thenAnswer((_) async => 'refresh_456');

        final result = await tokenStore.hasTokens();

        expect(result, isTrue);
      });

      test('returns false when access token missing', () async {
        when(() => mockStorage.read(key: 'access_token'))
            .thenAnswer((_) async => null);
        when(() => mockStorage.read(key: 'refresh_token'))
            .thenAnswer((_) async => 'refresh_456');

        final result = await tokenStore.hasTokens();

        expect(result, isFalse);
      });

      test('returns false when refresh token missing', () async {
        when(() => mockStorage.read(key: 'access_token'))
            .thenAnswer((_) async => 'access_123');
        when(() => mockStorage.read(key: 'refresh_token'))
            .thenAnswer((_) async => null);

        final result = await tokenStore.hasTokens();

        expect(result, isFalse);
      });

      test('returns false when both tokens missing', () async {
        when(() => mockStorage.read(key: 'access_token'))
            .thenAnswer((_) async => null);
        when(() => mockStorage.read(key: 'refresh_token'))
            .thenAnswer((_) async => null);

        final result = await tokenStore.hasTokens();

        expect(result, isFalse);
      });
    });

    group('clearAll', () {
      test('deletes all three keys', () async {
        when(() => mockStorage.delete(key: 'access_token'))
            .thenAnswer((_) async => Future<void>.value());
        when(() => mockStorage.delete(key: 'refresh_token'))
            .thenAnswer((_) async => Future<void>.value());
        when(() => mockStorage.delete(key: 'user_id'))
            .thenAnswer((_) async => Future<void>.value());

        await tokenStore.clearAll();

        verify(() => mockStorage.delete(key: 'access_token')).called(1);
        verify(() => mockStorage.delete(key: 'refresh_token')).called(1);
        verify(() => mockStorage.delete(key: 'user_id')).called(1);
      });
    });
  });
}