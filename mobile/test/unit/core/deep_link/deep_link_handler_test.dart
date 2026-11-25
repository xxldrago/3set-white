import 'dart:async';

import 'package:app_links/app_links.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:mobile/core/api/dio_client.dart';
import 'package:mobile/core/api/endpoints.dart';
import 'package:mobile/core/auth/auth_notifier.dart';
import 'package:mobile/core/auth/auth_state.dart';
import 'package:mobile/core/deep_link/deep_link_handler.dart';
import 'package:mobile/core/storage/token_store.dart';
import 'package:mobile/models/auth_models.dart';
import 'package:riverpod/riverpod.dart';

class MockAppLinks extends Mock implements AppLinks {}
class MockDioClient extends Mock implements DioClient {}
class MockDio extends Mock implements Dio {}
class MockResponse extends Mock implements Response {}
class MockTokenStore extends Mock implements TokenStore {}
class MockAuthNotifier extends Mock implements AuthNotifier {}

void main() {
  setUpAll(() {
    registerFallbackValue(
      TokenPair(
        accessToken: 'test_access',
        refreshToken: 'test_refresh',
        expiresIn: 900,
        userId: 1,
      ),
    );
    registerFallbackValue(
      User(id: 1, telegramId: null, email: 'test@example.com'),
    );
    registerFallbackValue(
      AsyncData<AuthState>(const AuthState.unauthenticated()),
    );
  });

  group('DeepLinkHandler', () {
    late MockAppLinks mockAppLinks;
    late MockDioClient mockDioClient;
    late MockDio mockDio;
    late MockTokenStore mockTokenStore;
    late MockAuthNotifier mockAuthNotifier;
    late DeepLinkHandler handler;
    late StreamController<Uri> linkStreamController;

    setUp(() {
      TestWidgetsFlutterBinding.ensureInitialized();
      
      mockAppLinks = MockAppLinks();
      mockDioClient = MockDioClient();
      mockDio = MockDio();
      mockTokenStore = MockTokenStore();
      mockAuthNotifier = MockAuthNotifier();

      linkStreamController = StreamController<Uri>.broadcast();

      when(() => mockDioClient.dio).thenReturn(mockDio);
      when(() => mockAppLinks.getInitialLink()).thenAnswer((_) async => null);
      when(() => mockAppLinks.uriLinkStream).thenAnswer((_) => linkStreamController.stream);
      when(() => mockTokenStore.saveTokenPair(any())).thenAnswer((_) async {});
      when(() => mockAuthNotifier.restoreSession()).thenAnswer((_) async {});

      // Create handler with mocked AppLinks using internal constructor
      handler = DeepLinkHandler.internal(
        dioClient: mockDioClient,
        tokenStore: mockTokenStore,
        authNotifier: mockAuthNotifier,
        appLinks: mockAppLinks,
      );
    });

    tearDown(() {
      handler.dispose();
      linkStreamController.close();
    });

    group('extractNonce', () {
      test('parses Telegram bot deep link', () {
        final uri = Uri.parse('https://t.me/set3vpn_bot?start=nonce_abc123');
        final nonce = handler.extractNonce(uri);
        expect(nonce, 'abc123');
      });

      test('parses custom scheme deep link', () {
        final uri = Uri.parse('three-set-vpn://auth?nonce=xyz789');
        final nonce = handler.extractNonce(uri);
        expect(nonce, 'xyz789');
      });

      test('returns null for unsupported links', () {
        final uri = Uri.parse('https://example.com/something');
        final nonce = handler.extractNonce(uri);
        expect(nonce, null);
      });

      test('returns null for Telegram link without nonce', () {
        final uri = Uri.parse('https://t.me/set3vpn_bot');
        final nonce = handler.extractNonce(uri);
        expect(nonce, null);
      });

      test('returns null for custom scheme without nonce', () {
        final uri = Uri.parse('three-set-vpn://auth');
        final nonce = handler.extractNonce(uri);
        expect(nonce, null);
      });
    });

    group('startListening', () {
      test('cold start deep link triggers polling', () async {
        final coldStartUri = Uri.parse('https://t.me/set3vpn_bot?start=nonce_cold123');
        when(() => mockAppLinks.getInitialLink()).thenAnswer((_) async => coldStartUri);

        final response = MockResponse();
        when(() => response.statusCode).thenReturn(202);
        when(() => mockDio.get(
          Endpoints.telegramPoll,
          queryParameters: {'nonce': 'cold123'},
        )).thenAnswer((_) async => response);

        // Create new handler with cold start
        final coldHandler = DeepLinkHandler.internal(
          dioClient: mockDioClient,
          tokenStore: mockTokenStore,
          authNotifier: mockAuthNotifier,
          appLinks: mockAppLinks,
        );

        await coldHandler.startListening();
        await Future.delayed(const Duration(milliseconds: 100));

        expect(coldHandler.isPolling, true);
        expect(coldHandler.currentNonce, 'cold123');

        coldHandler.dispose();
      });

      test('runtime deep link triggers polling', () async {
        final response = MockResponse();
        when(() => response.statusCode).thenReturn(202);
        when(() => mockDio.get(
          Endpoints.telegramPoll,
          queryParameters: {'nonce': 'runtime456'},
        )).thenAnswer((_) async => response);

        await handler.startListening();
        
        // Emit a deep link
        linkStreamController.add(Uri.parse('three-set-vpn://auth?nonce=runtime456'));
        await Future.delayed(const Duration(milliseconds: 100));

        expect(handler.isPolling, true);
        expect(handler.currentNonce, 'runtime456');
      });
    });

    group('polling', () {
      test('polling on 200 saves tokens and triggers restore', () async {
        // Create response objects upfront
        final response202 = MockResponse();
        when(() => response202.statusCode).thenReturn(202);

        final response200 = MockResponse();
        when(() => response200.statusCode).thenReturn(200);
        when(() => response200.data).thenReturn({
          'accessToken': 'access_123',
          'refreshToken': 'refresh_456',
          'expiresIn': 900,
          'userId': 42,
        });

        int pollCount = 0;
        when(() => mockDio.get(
          Endpoints.telegramPoll,
          queryParameters: any(named: 'queryParameters'),
        )).thenAnswer((_) async {
          pollCount++;
          if (pollCount == 1) {
            return response202;
          } else {
            return response200;
          }
        });

        await handler.startListening();
        linkStreamController.add(Uri.parse('three-set-vpn://auth?nonce=test_nonce'));
        await Future.delayed(const Duration(milliseconds: 100));

        // Wait for both polls to complete (immediate + timer)
        await Future.delayed(const Duration(milliseconds: 3500));

        verify(() => mockTokenStore.saveTokenPair(any())).called(1);
        verify(() => mockAuthNotifier.restoreSession()).called(1);
        expect(handler.isPolling, false);
      });

      test('polling on 410 stops and sets error', () async {
        final response = MockResponse();
        when(() => response.statusCode).thenReturn(410);
        when(() => mockDio.get(
          Endpoints.telegramPoll,
          queryParameters: {'nonce': 'expired_nonce'},
        )).thenAnswer((_) async => response);

        await handler.startListening();
        linkStreamController.add(Uri.parse('three-set-vpn://auth?nonce=expired_nonce'));
        await Future.delayed(const Duration(milliseconds: 100));

        expect(handler.isPolling, false);
        // Verify error state was set on AuthNotifier
        verify(() => mockAuthNotifier.state = any(that: isA<AsyncData<AuthState>>())).called(1);
      });

      test('polling on 409 stops and sets error', () async {
        final dioError = DioException(
          requestOptions: RequestOptions(path: Endpoints.telegramPoll),
          response: Response(statusCode: 409, requestOptions: RequestOptions(path: Endpoints.telegramPoll)),
          error: 'Conflict',
        );

        when(() => mockDio.get(
          Endpoints.telegramPoll,
          queryParameters: {'nonce': 'used_nonce'},
        )).thenThrow(dioError);

        await handler.startListening();
        linkStreamController.add(Uri.parse('three-set-vpn://auth?nonce=used_nonce'));
        await Future.delayed(const Duration(milliseconds: 100));

        expect(handler.isPolling, false);
        verify(() => mockAuthNotifier.state = any(that: isA<AsyncData<AuthState>>())).called(1);
      });

      test('cancelPolling stops polling and sets error', () async {
        final response = MockResponse();
        when(() => response.statusCode).thenReturn(202);
        when(() => mockDio.get(
          Endpoints.telegramPoll,
          queryParameters: {'nonce': 'cancel_test'},
        )).thenAnswer((_) async => response);

        await handler.startListening();
        linkStreamController.add(Uri.parse('three-set-vpn://auth?nonce=cancel_test'));
        await Future.delayed(const Duration(milliseconds: 100));

        expect(handler.isPolling, true);

        handler.cancelPolling();

        expect(handler.isPolling, false);
        verify(() => mockAuthNotifier.state = any(that: isA<AsyncData<AuthState>>())).called(1);
      });
    });

    group('properties', () {
      test('isPolling returns false initially', () {
        expect(handler.isPolling, false);
      });

      test('currentNonce returns null initially', () {
        expect(handler.currentNonce, null);
      });

      test('pollAttempts returns 0 initially', () {
        expect(handler.pollAttempts, 0);
      });
    });
  });
}