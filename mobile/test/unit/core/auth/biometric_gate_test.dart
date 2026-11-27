import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:mobile/core/auth/biometric_gate.dart';
import 'package:mobile/core/biometric/biometric_gate.dart' as bio;
import 'package:mobile/core/storage/token_store.dart';

class MockTokenStore extends Mock implements TokenStore {}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('BiometricGate (Auth)', () {
    late MockTokenStore mockTokenStore;
    late int lockedOutCalls;

    BiometricGate buildGate(Future<bio.BiometricResult> Function() authenticate) {
      return BiometricGate(
        mockTokenStore,
        authenticate: authenticate,
        onLockedOut: () => lockedOutCalls++,
      );
    }

    setUp(() {
      mockTokenStore = MockTokenStore();
      lockedOutCalls = 0;
      when(() => mockTokenStore.hasTokens()).thenAnswer((_) async => false);
      when(() => mockTokenStore.clearAll()).thenAnswer((_) async {});
    });

    group('registerObserver / unregisterObserver', () {
      test('registerObserver adds observer to WidgetsBinding', () {
        final gate = buildGate(() async => bio.BiometricResult.success);
        expect(() => gate.registerObserver(), returnsNormally);
        gate.unregisterObserver();
      });

      test('unregisterObserver removes observer from WidgetsBinding', () {
        final gate = buildGate(() async => bio.BiometricResult.success);
        gate.registerObserver();
        expect(() => gate.unregisterObserver(), returnsNormally);
      });

      test('can call unregisterObserver multiple times without error', () {
        final gate = buildGate(() async => bio.BiometricResult.success);
        gate.registerObserver();
        gate.unregisterObserver();
        expect(() => gate.unregisterObserver(), returnsNormally);
      });
    });

    group('didChangeAppLifecycleState', () {
      test('calls hasTokens when state is resumed', () async {
        final gate = buildGate(() async => bio.BiometricResult.success);

        gate.didChangeAppLifecycleState(AppLifecycleState.resumed);
        await Future.delayed(Duration.zero);

        verify(() => mockTokenStore.hasTokens()).called(1);
        gate.unregisterObserver();
      });

      test('does nothing for other lifecycle states', () {
        final gate = buildGate(() async => bio.BiometricResult.success);

        gate.didChangeAppLifecycleState(AppLifecycleState.paused);
        gate.didChangeAppLifecycleState(AppLifecycleState.inactive);
        gate.didChangeAppLifecycleState(AppLifecycleState.detached);

        verifyNever(() => mockTokenStore.hasTokens());
        gate.unregisterObserver();
      });
    });

    group('resume behavior', () {
      test('returns early when no tokens exist', () async {
        var prompted = false;
        final gate = buildGate(() async {
          prompted = true;
          return bio.BiometricResult.success;
        });

        await gate.onAppResumed();

        expect(prompted, false);
        verifyNever(() => mockTokenStore.clearAll());
        expect(lockedOutCalls, 0);
        gate.unregisterObserver();
      });

      test('success keeps the session', () async {
        when(() => mockTokenStore.hasTokens()).thenAnswer((_) async => true);
        final gate = buildGate(() async => bio.BiometricResult.success);

        await gate.onAppResumed();

        verifyNever(() => mockTokenStore.clearAll());
        expect(lockedOutCalls, 0);
        gate.unregisterObserver();
      });

      test('no biometric hardware does not lock the session', () async {
        when(() => mockTokenStore.hasTokens()).thenAnswer((_) async => true);
        final gate = buildGate(() async => bio.BiometricResult.notAvailable);

        await gate.onAppResumed();

        verifyNever(() => mockTokenStore.clearAll());
        expect(lockedOutCalls, 0);
        gate.unregisterObserver();
      });

      test('cancelled prompt clears tokens and locks out', () async {
        when(() => mockTokenStore.hasTokens()).thenAnswer((_) async => true);
        final gate = buildGate(() async => bio.BiometricResult.cancelled);

        await gate.onAppResumed();

        verify(() => mockTokenStore.clearAll()).called(1);
        expect(lockedOutCalls, 1);
        gate.unregisterObserver();
      });

      test('failed prompt clears tokens and locks out', () async {
        when(() => mockTokenStore.hasTokens()).thenAnswer((_) async => true);
        final gate = buildGate(() async => bio.BiometricResult.failed);

        await gate.onAppResumed();

        verify(() => mockTokenStore.clearAll()).called(1);
        expect(lockedOutCalls, 1);
        gate.unregisterObserver();
      });

      test('thrown biometric error clears tokens and locks out', () async {
        when(() => mockTokenStore.hasTokens()).thenAnswer((_) async => true);
        final gate = buildGate(() async => throw Exception('biometric error'));

        await gate.onAppResumed();

        verify(() => mockTokenStore.clearAll()).called(1);
        expect(lockedOutCalls, 1);
        gate.unregisterObserver();
      });
    });

    group('Provider', () {
      test('resumeBiometricGateProvider has the correct signature', () {
        expect(
          resumeBiometricGateProvider,
          isA<Provider<BiometricGate>>(),
        );
      });
    });
  });
}
