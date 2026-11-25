import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:dio/dio.dart';
import 'package:logger/logger.dart';
import 'package:mobile/core/api/dio_client.dart';
import 'package:mobile/core/api/endpoints.dart';
import 'package:mobile/core/auth/auth_notifier.dart';
import 'package:mobile/core/auth/auth_state.dart';
import 'package:mobile/core/storage/token_store.dart';
import 'package:mobile/models/auth_models.dart';
import 'package:riverpod/riverpod.dart';

class MockDioClient extends Mock implements DioClient {}

class MockTokenStore extends Mock implements TokenStore {}

class MockDio extends Mock implements Dio {}

class MockResponse extends Mock implements Response {}

class MockLogger extends Mock implements Logger {}

void main() {
  // Register fallback values for all model types
  setUpAll(() {
    registerFallbackValue(const TokenPair(
      accessToken: 'test_access',
      refreshToken: 'test_refresh',
      expiresIn: 900,
      userId: 1,
    ));
    registerFallbackValue(const User(id: 1, telegramId: null, email: 'test@example.com'));
    registerFallbackValue(AuthState.loading());
    registerFallbackValue(const AuthState.unauthenticated());
    registerFallbackValue(const AuthState.error('test'));
  });

  group('AuthNotifier', () {
    late MockDioClient mockDioClient;
    late MockTokenStore mockTokenStore;
    late MockDio mockDio;
    late MockLogger mockLogger;
    late ProviderContainer container;

    setUp(() {
      mockDioClient = MockDioClient();
      mockTokenStore = MockTokenStore();
      mockDio = MockDio();
      mockLogger = MockLogger();

      when(() => mockDioClient.dio).thenReturn(mockDio);
      when(() => mockDioClient.tokenStore).thenReturn(mockTokenStore);

      when(() => mockLogger.i(any())).thenReturn(null);
      when(() => mockLogger.d(any())).thenReturn(null);
      when(() => mockLogger.w(any())).thenReturn(null);
      when(() => mockLogger.e(any())).thenReturn(null);

      // Default stubs for token store methods called during build
      when(() => mockTokenStore.hasTokens()).thenAnswer((_) async => false);
      when(() => mockTokenStore.getAccessTokenNoBiometric()).thenAnswer((_) async => null);
      when(() => mockTokenStore.getRefreshToken()).thenAnswer((_) async => null);
      when(() => mockTokenStore.getUserId()).thenAnswer((_) async => null);
      when(() => mockTokenStore.clearAll()).thenAnswer((_) async {});
      when(() => mockTokenStore.saveTokenPair(any())).thenAnswer((_) async {});

      container = ProviderContainer(
        overrides: [
          dioClientProvider.overrideWithValue(mockDioClient),
          tokenStoreProvider.overrideWithValue(mockTokenStore),
        ],
      );
    });

    tearDown(() {
      container.dispose();
    });

    group('build (session restore)', () {
      test('returns unauthenticated when no tokens exist', () async {
        when(() => mockTokenStore.hasTokens()).thenAnswer((_) async => false);

        final notifier = container.read(authNotifierProvider.notifier);
        // Wait for build to complete
        await container.pump();

        final state = container.read(authNotifierProvider);
        expect(
          state.value,
          isA<AuthState>().having(
            (s) => s.maybeWhen(unauthenticated: () => true, orElse: () => false),
            'unauthenticated',
            true,
          ),
        );
      });

      // Note: Testing the authenticated session restore path is difficult with
      // AsyncNotifier because _restoreSession runs asynchronously after build()
      // returns loading state. The provider may be disposed before the async
      // operation completes in test environment. This is tested via integration
      // tests instead.
    });

    group('login', () {
      test('returns authenticated on successful login', () async {
        // First call to hasTokens in build() returns false
        when(() => mockTokenStore.hasTokens()).thenAnswer((_) async => false);

        final loginResponse = MockResponse();
        when(() => loginResponse.statusCode).thenReturn(200);
        when(() => loginResponse.data).thenReturn({
          'accessToken': 'access_123',
          'refreshToken': 'refresh_456',
          'expires_in': 900,
          'user_id': 42,
        });

        when(() => mockDio.post(Endpoints.authLogin, data: any(named: 'data')))
            .thenAnswer((_) async => loginResponse);

        when(() => mockTokenStore.saveTokenPair(any())).thenAnswer((_) async {});

        // After login, _restoreSession is called - stub for that
        when(() => mockTokenStore.hasTokens()).thenAnswer((_) async => true);
        when(() => mockTokenStore.getAccessTokenNoBiometric()).thenAnswer((_) async => 'access_123');
        when(() => mockTokenStore.getRefreshToken()).thenAnswer((_) async => 'refresh_456');
        when(() => mockTokenStore.getUserId()).thenAnswer((_) async => 42);

        final subResponse = MockResponse();
        when(() => subResponse.statusCode).thenReturn(200);
        when(() => subResponse.data).thenReturn({
          'user': {'id': 42, 'telegram_id': null, 'email': 'test@example.com'},
        });

        when(() => mockDio.get(Endpoints.subscription)).thenAnswer((_) async => subResponse);

        final notifier = container.read(authNotifierProvider.notifier);
        final result = await notifier.login('test@example.com', 'password123');

        expect(
          result,
          isA<AuthState>().having(
            (s) => s.maybeWhen(authenticated: (_, _) => true, orElse: () => false),
            'authenticated',
            true,
          ),
        );
      });

      test('returns error on invalid credentials (401)', () async {
        when(() => mockTokenStore.hasTokens()).thenAnswer((_) async => false);

        final dioError = DioException(
          requestOptions: RequestOptions(path: Endpoints.authLogin),
          response: Response(statusCode: 401, requestOptions: RequestOptions(path: Endpoints.authLogin)),
          error: 'Unauthorized',
        );

        when(() => mockDio.post(Endpoints.authLogin, data: any(named: 'data')))
            .thenThrow(dioError);

        final notifier = container.read(authNotifierProvider.notifier);
        final result = await notifier.login('test@example.com', 'wrong');

        expect(
          result,
          isA<AuthState>().having(
            (s) => s.maybeWhen(error: (_) => true, orElse: () => false),
            'error',
            true,
          ),
        );
        expect(result.maybeWhen(error: (msg) => msg, orElse: () => ''), 'Неверный email или пароль');
      });

      test('returns error on rate limit (429)', () async {
        when(() => mockTokenStore.hasTokens()).thenAnswer((_) async => false);

        final dioError = DioException(
          requestOptions: RequestOptions(path: Endpoints.authLogin),
          response: Response(statusCode: 429, requestOptions: RequestOptions(path: Endpoints.authLogin)),
          error: 'Too Many Requests',
        );

        when(() => mockDio.post(Endpoints.authLogin, data: any(named: 'data')))
            .thenThrow(dioError);

        final notifier = container.read(authNotifierProvider.notifier);
        final result = await notifier.login('test@example.com', 'password123');

        expect(
          result,
          isA<AuthState>().having(
            (s) => s.maybeWhen(error: (_) => true, orElse: () => false),
            'error',
            true,
          ),
        );
        expect(result.maybeWhen(error: (msg) => msg, orElse: () => ''), 'Слишком много попыток. Попробуйте позже');
      });
    });

    group('register', () {
      test('returns authenticated on successful registration', () async {
        when(() => mockTokenStore.hasTokens()).thenAnswer((_) async => false);

        final registerResponse = MockResponse();
        when(() => registerResponse.statusCode).thenReturn(200);
        when(() => registerResponse.data).thenReturn({
          'accessToken': 'access_123',
          'refreshToken': 'refresh_456',
          'expires_in': 900,
          'user_id': 42,
        });

        when(() => mockDio.post(Endpoints.authRegister, data: any(named: 'data')))
            .thenAnswer((_) async => registerResponse);

        when(() => mockTokenStore.saveTokenPair(any())).thenAnswer((_) async {});

        // After register, _restoreSession is called
        when(() => mockTokenStore.hasTokens()).thenAnswer((_) async => true);
        when(() => mockTokenStore.getAccessTokenNoBiometric()).thenAnswer((_) async => 'access_123');
        when(() => mockTokenStore.getRefreshToken()).thenAnswer((_) async => 'refresh_456');
        when(() => mockTokenStore.getUserId()).thenAnswer((_) async => 42);

        final subResponse = MockResponse();
        when(() => subResponse.statusCode).thenReturn(200);
        when(() => subResponse.data).thenReturn({
          'user': {'id': 42, 'telegram_id': null, 'email': 'new@example.com'},
        });

        when(() => mockDio.get(Endpoints.subscription)).thenAnswer((_) async => subResponse);

        final notifier = container.read(authNotifierProvider.notifier);
        final result = await notifier.register('new@example.com', 'password123');

        expect(
          result,
          isA<AuthState>().having(
            (s) => s.maybeWhen(authenticated: (_, _) => true, orElse: () => false),
            'authenticated',
            true,
          ),
        );
      });

      test('returns error on duplicate email (409)', () async {
        when(() => mockTokenStore.hasTokens()).thenAnswer((_) async => false);

        final dioError = DioException(
          requestOptions: RequestOptions(path: Endpoints.authRegister),
          response: Response(statusCode: 409, requestOptions: RequestOptions(path: Endpoints.authRegister)),
          error: 'Conflict',
        );

        when(() => mockDio.post(Endpoints.authRegister, data: any(named: 'data')))
            .thenThrow(dioError);

        final notifier = container.read(authNotifierProvider.notifier);
        final result = await notifier.register('existing@example.com', 'password123');

        expect(
          result,
          isA<AuthState>().having(
            (s) => s.maybeWhen(error: (_) => true, orElse: () => false),
            'error',
            true,
          ),
        );
        expect(result.maybeWhen(error: (msg) => msg, orElse: () => ''), 'Email уже зарегистрирован');
      });
    });

    group('logout', () {
      test('clears tokens and sets unauthenticated', () async {
        when(() => mockTokenStore.hasTokens()).thenAnswer((_) async => false);
        when(() => mockTokenStore.clearAll()).thenAnswer((_) async {});

        final notifier = container.read(authNotifierProvider.notifier);
        await container.pump();

        await notifier.logout();

        final state = container.read(authNotifierProvider);
        expect(
          state.value,
          isA<AuthState>().having(
            (s) => s.maybeWhen(unauthenticated: () => true, orElse: () => false),
            'unauthenticated',
            true,
          ),
        );
        verify(() => mockTokenStore.clearAll()).called(1);
      });
    });

    group('startTelegramAuth', () {
      test('returns nonce on success', () async {
        when(() => mockTokenStore.hasTokens()).thenAnswer((_) async => false);

        final nonceResponse = MockResponse();
        when(() => nonceResponse.statusCode).thenReturn(200);
        when(() => nonceResponse.data).thenReturn({'nonce': 'nonce_abc123', 'expires_in': 300});

        when(() => mockDio.post(Endpoints.telegramNonce)).thenAnswer((_) async => nonceResponse);

        final notifier = container.read(authNotifierProvider.notifier);
        await container.pump();

        final nonce = await notifier.startTelegramAuth();

        expect(nonce, 'nonce_abc123');
      });

      test('returns null on failure', () async {
        when(() => mockTokenStore.hasTokens()).thenAnswer((_) async => false);

        final dioError = DioException(
          requestOptions: RequestOptions(path: Endpoints.telegramNonce),
          error: 'Network error',
        );

        when(() => mockDio.post(Endpoints.telegramNonce, data: any(named: 'data'), options: any(named: 'options'), queryParameters: any(named: 'queryParameters')))
            .thenThrow(dioError);

        final notifier = container.read(authNotifierProvider.notifier);
        await container.pump();

        final nonce = await notifier.startTelegramAuth();

        expect(nonce, null);
      });
    });
  });
}