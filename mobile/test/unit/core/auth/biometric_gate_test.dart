import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart' as riverpod;
import 'package:mobile/core/auth/biometric_gate.dart';
import 'package:mobile/core/storage/token_store.dart';

class MockTokenStore extends Mock implements TokenStore {}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('BiometricGate (app lifecycle)', () {
    late MockTokenStore mockTokenStore;
    late BiometricGate gate;

    setUp(() {
      mockTokenStore = MockTokenStore();
      // Use internal constructor for testing
      gate = BiometricGate._internal(mockTokenStore);

      when(() => mockTokenStore.hasTokens()).thenAnswer((_) async => false);
      when(() => mockTokenStore.getAccessToken()).thenAnswer((_) async => null);
      when(() => mockTokenStore.clearAll()).thenAnswer((_) async {});
    });

    tearDown(() {
      gate.unregisterObserver();
    });

    test('registerObserver adds observer to WidgetsBinding', () {
      expect(gate._registered, false);
      gate.registerObserver();
      expect(gate._registered, true);
    });

    test('unregisterObserver removes observer from WidgetsBinding', () {
      gate.registerObserver();
      gate.unregisterObserver();
      expect(gate._registered, false);
    });

    test('on resume with no tokens does nothing', () async {
      when(() => mockTokenStore.hasTokens()).thenAnswer((_) async => false);

      await gate._onAppResumed();

      verify(() => mockTokenStore.hasTokens()).called(1);
      verifyNever(() => mockTokenStore.getAccessToken());
      verifyNever(() => mockTokenStore.clearAll());
    });

    test('on resume with tokens triggers biometric read', () async {
      when(() => mockTokenStore.hasTokens()).thenAnswer((_) async => true);
      when(() => mockTokenStore.getAccessToken()).thenAnswer((_) async => 'access_token_123');

      await gate._onAppResumed();

      verify(() => mockTokenStore.hasTokens()).called(1);
      verify(() => mockTokenStore.getAccessToken()).called(1);
      verifyNever(() => mockTokenStore.clearAll());
    });

    test('on resume with tokens but biometric returns null clears storage', () async {
      when(() => mockTokenStore.hasTokens()).thenAnswer((_) async => true);
      when(() => mockTokenStore.getAccessToken()).thenAnswer((_) async => null);

      await gate._onAppResumed();

      verify(() => mockTokenStore.hasTokens()).called(1);
      verify(() => mockTokenStore.getAccessToken()).called(1);
      verify(() => mockTokenStore.clearAll()).called(1);
    });

    test('on resume with tokens but biometric throws clears storage', () async {
      when(() => mockTokenStore.hasTokens()).thenAnswer((_) async => true);
      when(() => mockTokenStore.getAccessToken()).thenThrow(Exception('Biometric not enrolled'));

      await gate._onAppResumed();

      verify(() => mockTokenStore.hasTokens()).called(1);
      verify(() => mockTokenStore.getAccessToken()).called(1);
      verify(() => mockTokenStore.clearAll()).called(1);
    });

    test('biometricGateProvider can be instantiated', () {
      // This test verifies the provider exists and has correct signature
      expect(biometricGateProvider, isA<riverpod.Provider<BiometricGate>>());
    });
  });
}