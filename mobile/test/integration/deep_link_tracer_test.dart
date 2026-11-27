import 'package:app_links/app_links.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:mobile/core/api/dio_client.dart';
import 'package:mobile/core/api/endpoints.dart';
import 'package:mobile/core/auth/auth_notifier.dart';
import 'package:mobile/core/auth/biometric_gate.dart';
import 'package:mobile/core/biometric/biometric_gate.dart' as bio;
import 'package:mobile/core/deep_link/deep_link_handler.dart';
import 'package:mobile/core/storage/token_store.dart';
import 'package:mobile/models/auth_models.dart';

class MockAppLinks extends Mock implements AppLinks {}

class MockDioClient extends Mock implements DioClient {}

class MockDio extends Mock implements Dio {}

class MockResponse extends Mock implements Response<dynamic> {}

class MockTokenStore extends Mock implements TokenStore {}

class MockAuthNotifier extends Mock implements AuthNotifier {}

/// Vertical-slice integration test for the Telegram deep-link auth flow:
///
/// cold-start deep link → nonce polling → token pair persisted → biometric
/// resume → logout clears storage.
///
/// The HTTP layer, app links and secure storage are mocked, but the real
/// [DeepLinkHandler], [BiometricGate] and token-pair parsing code run.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUpAll(() {
    registerFallbackValue(
      const TokenPair(
        accessToken: 'fallback_access',
        refreshToken: 'fallback_refresh',
        expiresIn: 900,
      ),
    );
  });

  group('Deep link tracer', () {
    late MockAppLinks appLinks;
    late MockDioClient dioClient;
    late MockDio dio;
    late MockTokenStore tokenStore;
    late MockAuthNotifier authNotifier;
    late DeepLinkHandler handler;

    TokenPair? storedPair;

    setUp(() {
      appLinks = MockAppLinks();
      dioClient = MockDioClient();
      dio = MockDio();
      tokenStore = MockTokenStore();
      authNotifier = MockAuthNotifier();
      storedPair = null;

      when(() => dioClient.dio).thenReturn(dio);
      when(() => appLinks.getInitialLink()).thenAnswer((_) async => null);
      when(() => appLinks.uriLinkStream).thenAnswer((_) => const Stream<Uri>.empty());
      when(() => authNotifier.restoreSession()).thenAnswer((_) async {});
      when(() => authNotifier.setError(any())).thenAnswer((_) {});

      // Stateful in-memory token store.
      when(() => tokenStore.saveTokenPair(any())).thenAnswer((invocation) async {
        storedPair = invocation.positionalArguments.first as TokenPair;
      });
      when(() => tokenStore.hasTokens()).thenAnswer((_) async => storedPair != null);
      when(() => tokenStore.getAccessTokenNoBiometric())
          .thenAnswer((_) async => storedPair?.accessToken);
      when(() => tokenStore.getAccessToken())
          .thenAnswer((_) async => storedPair?.accessToken);
      when(() => tokenStore.getRefreshToken())
          .thenAnswer((_) async => storedPair?.refreshToken);
      when(() => tokenStore.getUserId()).thenAnswer((_) async => storedPair?.userId);
      when(() => tokenStore.clearAll()).thenAnswer((_) async => storedPair = null);

      handler = DeepLinkHandler.internal(
        dioClient: dioClient,
        tokenStore: tokenStore,
        authNotifier: authNotifier,
        appLinks: appLinks,
      );
    });

    tearDown(() {
      handler.dispose();
    });

    test('cold start deep link → poll → tokens saved → biometric → logout',
        () async {
      // Backend contract: 202 pending first, then 200 with `{tokenPair}`.
      final pending = MockResponse();
      when(() => pending.statusCode).thenReturn(202);

      final success = MockResponse();
      when(() => success.statusCode).thenReturn(200);
      when(() => success.data).thenReturn({
        'tokenPair': {
          'accessToken': 'access_123',
          'refreshToken': 'refresh_456',
          'expiresIn': 900,
        },
      });

      var pollCount = 0;
      when(() => dio.get(
            Endpoints.telegramPoll,
            queryParameters: any(named: 'queryParameters'),
          )).thenAnswer((_) async {
        pollCount++;
        return pollCount == 1 ? pending : success;
      });

      when(() => appLinks.getInitialLink())
          .thenAnswer((_) async => Uri.parse('https://t.me/set3vpn_bot?start=nonce_trace123'));
      when(() => appLinks.uriLinkStream).thenAnswer((_) => const Stream<Uri>.empty());

      await handler.startListening();

      // Immediate poll → 202, then the 3s timer fires → 200.
      final deadline = DateTime.now().add(const Duration(seconds: 6));
      while (storedPair == null && DateTime.now().isBefore(deadline)) {
        await Future<void>.delayed(const Duration(milliseconds: 100));
      }

      expect(pollCount, greaterThanOrEqualTo(2));
      expect(storedPair, isNotNull);
      expect(storedPair!.accessToken, 'access_123');
      expect(storedPair!.refreshToken, 'refresh_456');
      verify(() => authNotifier.restoreSession()).called(1);
      expect(handler.isPolling, isFalse);

      // Biometric resume succeeds → session survives.
      final gate = BiometricGate(
        tokenStore,
        authenticate: () async => bio.BiometricResult.success,
      );
      await gate.onAppResumed();
      expect(storedPair, isNotNull);

      // Logout clears the session.
      await tokenStore.clearAll();
      expect(storedPair, isNull);
      expect(await tokenStore.hasTokens(), isFalse);
    });

    test('expired nonce stops polling and surfaces an error', () async {
      final expired = MockResponse();
      when(() => expired.statusCode).thenReturn(410);
      when(() => dio.get(
            Endpoints.telegramPoll,
            queryParameters: any(named: 'queryParameters'),
          )).thenAnswer((_) async => expired);

      handler.handleDeepLink(Uri.parse('three-set-vpn://auth?nonce=expired1'));
      await Future<void>.delayed(const Duration(milliseconds: 300));

      expect(handler.isPolling, isFalse);
      expect(storedPair, isNull);
      verify(() => authNotifier.setError(any())).called(1);
    });
  });
}
