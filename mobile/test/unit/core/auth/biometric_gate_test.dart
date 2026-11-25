import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mocktail/mocktail.dart';
import 'package:mobile/core/auth/biometric_gate.dart';
import 'package:mobile/core/storage/token_store.dart';

class MockTokenStore extends Mock implements TokenStore {}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('BiometricGate (Auth)', () {
    late MockTokenStore mockTokenStore;
    late BiometricGate biometricGate;

    setUp(() {
      mockTokenStore = MockTokenStore();
      biometricGate = BiometricGate(mockTokenStore);
    });

    tearDown(() {
      biometricGate.unregisterObserver();
    });

    group('registerObserver / unregisterObserver', () {
      test('registerObserver adds observer to WidgetsBinding', () {
        expect(() => biometricGate.registerObserver(), returnsNormally);
      });

      test('unregisterObserver removes observer from WidgetsBinding', () {
        biometricGate.registerObserver();
        expect(() => biometricGate.unregisterObserver(), returnsNormally);
      });

      test('can call unregisterObserver multiple times without error', () {
        biometricGate.registerObserver();
        biometricGate.unregisterObserver();
        expect(() => biometricGate.unregisterObserver(), returnsNormally);
      });
    });

    group('didChangeAppLifecycleState', () {
      test('calls hasTokens when state is resumed', () async {
        when(() => mockTokenStore.hasTokens()).thenAnswer((_) async => false);

        biometricGate.didChangeAppLifecycleState(AppLifecycleState.resumed);

        // Wait for the async _onAppResumed to complete
        await Future.delayed(Duration.zero);

        verify(() => mockTokenStore.hasTokens()).called(1);
      });

      test('does nothing for other lifecycle states', () {
        biometricGate.didChangeAppLifecycleState(AppLifecycleState.paused);
        biometricGate.didChangeAppLifecycleState(AppLifecycleState.inactive);
        biometricGate.didChangeAppLifecycleState(AppLifecycleState.detached);

        // Should not call hasTokens for non-resumed states
        verifyNever(() => mockTokenStore.hasTokens());
      });
    });

    group('resume behavior via lifecycle events', () {
      test('returns early when no tokens exist', () async {
        when(() => mockTokenStore.hasTokens()).thenAnswer((_) async => false);
        when(() => mockTokenStore.getAccessToken()).thenAnswer((_) async => 'token');
        when(() => mockTokenStore.clearAll()).thenAnswer((_) async {});

        biometricGate.didChangeAppLifecycleState(AppLifecycleState.resumed);
        await Future.delayed(Duration.zero);

        verify(() => mockTokenStore.hasTokens()).called(1);
        verifyNever(() => mockTokenStore.getAccessToken());
        verifyNever(() => mockTokenStore.clearAll());
      });

      test('calls getAccessToken when tokens exist and succeeds', () async {
        when(() => mockTokenStore.hasTokens()).thenAnswer((_) async => true);
        when(() => mockTokenStore.getAccessToken()).thenAnswer((_) async => 'token');
        when(() => mockTokenStore.clearAll()).thenAnswer((_) async {});

        biometricGate.didChangeAppLifecycleState(AppLifecycleState.resumed);
        await Future.delayed(Duration.zero);

        verify(() => mockTokenStore.hasTokens()).called(1);
        verify(() => mockTokenStore.getAccessToken()).called(1);
        verifyNever(() => mockTokenStore.clearAll());
      });

      test('clears tokens when getAccessToken returns null (biometric cancelled)', () async {
        when(() => mockTokenStore.hasTokens()).thenAnswer((_) async => true);
        when(() => mockTokenStore.getAccessToken()).thenAnswer((_) async => null);
        when(() => mockTokenStore.clearAll()).thenAnswer((_) async {});

        biometricGate.didChangeAppLifecycleState(AppLifecycleState.resumed);
        await Future.delayed(Duration.zero);

        verify(() => mockTokenStore.hasTokens()).called(1);
        verify(() => mockTokenStore.getAccessToken()).called(1);
        verify(() => mockTokenStore.clearAll()).called(1);
      });

      test('clears tokens when getAccessToken throws (biometric error)', () async {
        when(() => mockTokenStore.hasTokens()).thenAnswer((_) async => true);
        when(() => mockTokenStore.getAccessToken()).thenThrow(Exception('Biometric error'));
        when(() => mockTokenStore.clearAll()).thenAnswer((_) async {});

        biometricGate.didChangeAppLifecycleState(AppLifecycleState.resumed);
        await Future.delayed(Duration.zero);

        verify(() => mockTokenStore.hasTokens()).called(1);
        verify(() => mockTokenStore.getAccessToken()).called(1);
        verify(() => mockTokenStore.clearAll()).called(1);
      });
    });

    group('Provider', () {
      test('biometricGateProvider can be instantiated', () {
        // This test verifies the provider exists and has correct signature
        expect(biometricGateProvider, isA<Provider<BiometricGate>>());
      });
    });
  });
}