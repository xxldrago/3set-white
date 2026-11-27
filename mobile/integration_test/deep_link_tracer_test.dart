import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:mobile/main.dart' as app;
import 'package:app_links/app_links.dart';
import 'package:mobile/core/deep_link/deep_link_handler.dart';
import 'package:mobile/core/auth/auth_notifier.dart';
import 'package:mobile/core/storage/token_store.dart';
import 'package:mobile/core/api/dio_client.dart';
import 'package:dio/dio.dart';
import 'package:mocktail/mocktail.dart';

/// Mock classes for testing
class MockDioClient extends Mock implements DioClient {}
class MockTokenStore extends Mock implements TokenStore {}
class MockAuthNotifier extends Mock implements AuthNotifier {}
class MockAppLinks extends Mock implements AppLinks {}
class MockDio extends Mock implements Dio {}

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  group('Deep Link Tracer Integration Tests', () {
    // Test 1: Cold launch unauthenticated → shows auth screen
    testWidgets('App launches and shows login screen', (WidgetTester tester) async {
      app.main();
      await tester.pumpAndSettle();

      // Verify we're on the login screen (/auth) - Russian UI
      expect(find.text('Вход'), findsOneWidget);
      expect(find.text('Добро пожаловать'), findsOneWidget);
    });

    // Full deep-link → polling → token persistence → biometric resume → logout
    // coverage runs as a host-side integration test in
    // test/integration/deep_link_tracer_test.dart. This file is the on-device
    // smoke test for app launch and native deep-link configuration.
  });

  group('Unit Tests for Deep Link Handler (isolated)', () {
    late DeepLinkHandler handler;
    late MockDioClient mockDioClient;
    late MockTokenStore mockTokenStore;
    late MockAuthNotifier mockAuthNotifier;
    late MockAppLinks mockAppLinks;

    setUp(() {
      mockDioClient = MockDioClient();
      mockTokenStore = MockTokenStore();
      mockAuthNotifier = MockAuthNotifier();
      mockAppLinks = MockAppLinks();

      // Setup default mock behavior
      when(() => mockAppLinks.getInitialLink()).thenAnswer((_) async => null);
      when(() => mockAppLinks.uriLinkStream).thenAnswer((_) => const Stream.empty());

      handler = DeepLinkHandler.internal(
        dioClient: mockDioClient,
        tokenStore: mockTokenStore,
        authNotifier: mockAuthNotifier,
        appLinks: mockAppLinks,
      );
    });

    tearDown(() {
      handler.dispose();
    });

    test('extractNonce returns nonce from Telegram bot deep link', () {
      final uri = Uri.parse('https://t.me/set3vpn_bot?start=nonce_abc123');
      final nonce = handler.extractNonce(uri);
      expect(nonce, equals('abc123'));
    });

    test('extractNonce returns nonce from custom scheme deep link', () {
      final uri = Uri.parse('three-set-vpn://auth?nonce=xyz789');
      final nonce = handler.extractNonce(uri);
      expect(nonce, equals('xyz789'));
    });

    test('extractNonce returns null for unsupported deep link', () {
      final uri = Uri.parse('https://example.com/unknown');
      final nonce = handler.extractNonce(uri);
      expect(nonce, isNull);
    });

    test('extractNonce returns null for Telegram link without nonce', () {
      final uri = Uri.parse('https://t.me/set3vpn_bot?start=other');
      final nonce = handler.extractNonce(uri);
      expect(nonce, isNull);
    });
  });
}