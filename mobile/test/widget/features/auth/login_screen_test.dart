import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mocktail/mocktail.dart';
import 'package:go_router/go_router.dart';
import 'package:logger/logger.dart';
import 'package:mobile/features/auth/screens/login_screen.dart';
import 'package:mobile/core/api/dio_client.dart';
import 'package:mobile/core/storage/token_store.dart';
import 'package:mobile/core/auth/auth_notifier.dart';
import 'package:mobile/models/auth_models.dart';
import 'package:dio/dio.dart';
import 'package:logger/logger.dart';

class MockDioClient extends Mock implements DioClient {}
class MockTokenStore extends Mock implements TokenStore {}
class MockDio extends Mock implements Dio {}
class MockResponse extends Mock implements Response {}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUpAll(() {
    registerFallbackValue(TokenPair(
      accessToken: 'test_access',
      refreshToken: 'test_refresh',
      expiresIn: 900,
      userId: 1,
    ));
    registerFallbackValue(User(id: 1, telegramId: null, email: 'test@example.com'));
    registerFallbackValue(Logger());
  });

  group('LoginScreen', () {
    late MockDioClient mockDioClient;
    late MockTokenStore mockTokenStore;
    late MockDio mockDio;
    late ProviderContainer container;

    setUp(() {
      mockDioClient = MockDioClient();
      mockTokenStore = MockTokenStore();
      mockDio = MockDio();

      when(() => mockDioClient.dio).thenReturn(mockDio);
      when(() => mockDioClient.tokenStore).thenReturn(mockTokenStore);

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

    Widget createWidgetUnderTest() {
      return UncontrolledProviderScope(
        container: container,
        child: MaterialApp.router(
          routerConfig: GoRouter(
            initialLocation: '/auth',
            routes: [
              GoRoute(
                path: '/auth',
                builder: (context, state) => const LoginScreen(),
              ),
              GoRoute(
                path: '/register',
                builder: (context, state) => const Scaffold(body: Text('Register')),
              ),
              GoRoute(
                path: '/telegram-wait',
                builder: (context, state) => const Scaffold(body: Text('Telegram Wait')),
              ),
              GoRoute(
                path: '/',
                builder: (context, state) => const Scaffold(body: Text('Home')),
              ),
            ],
          ),
        ),
      );
    }

    testWidgets('renders login screen with all elements', (WidgetTester tester) async {
      await tester.pumpWidget(createWidgetUnderTest());
      await tester.pumpAndSettle();

      expect(find.text('Вход'), findsOneWidget); // AppBar title
      expect(find.text('Добро пожаловать'), findsOneWidget); // Title
      expect(find.text('Войдите в свой аккаунт 3set VPN'), findsOneWidget); // Subtitle
      expect(find.byType(TextFormField), findsNWidgets(2)); // email + password
      expect(find.text('Войти'), findsOneWidget); // Submit button
      expect(find.text('Зарегистрироваться'), findsOneWidget); // Toggle link
      expect(find.byIcon(Icons.telegram), findsOneWidget); // Telegram button
    });

    testWidgets('shows validation errors for empty fields', (WidgetTester tester) async {
      await tester.pumpWidget(createWidgetUnderTest());
      await tester.pumpAndSettle();

      await tester.tap(find.text('Войти'));
      await tester.pumpAndSettle();

      expect(find.text('Введите email'), findsOneWidget);
      expect(find.text('Введите пароль'), findsOneWidget);
    });

    testWidgets('shows validation error for invalid email', (WidgetTester tester) async {
      await tester.pumpWidget(createWidgetUnderTest());
      await tester.pumpAndSettle();

      await tester.enterText(find.byType(TextFormField).first, 'invalid-email');
      await tester.tap(find.text('Войти'));
      await tester.pumpAndSettle();

      expect(find.text('Неверный формат email'), findsOneWidget);
    });

    testWidgets('shows validation error for short password', (WidgetTester tester) async {
      await tester.pumpWidget(createWidgetUnderTest());
      await tester.pumpAndSettle();

      await tester.enterText(find.byType(TextFormField).first, 'test@example.com');
      await tester.enterText(find.byType(TextFormField).last, '123');
      await tester.tap(find.text('Войти'));
      await tester.pumpAndSettle();

      expect(find.text('Пароль должен быть минимум 8 символов'), findsOneWidget);
    });

    testWidgets('navigates to register screen when tapping register link', (WidgetTester tester) async {
      await tester.pumpWidget(createWidgetUnderTest());
      await tester.pumpAndSettle();

      await tester.tap(find.text('Зарегистрироваться'));
      await tester.pumpAndSettle();

      expect(find.text('Register'), findsOneWidget);
    });

    testWidgets('calls login on valid form submission', (WidgetTester tester) async {
      // Setup successful login response
      final mockResponse = MockResponse();
      when(() => mockResponse.statusCode).thenReturn(200);
      when(() => mockResponse.data).thenReturn({
        'accessToken': 'test_access',
        'refreshToken': 'test_refresh',
        'expiresIn': 900,
        'userId': 1,
      });
      when(() => mockDio.post(any(), data: any(named: 'data'))).thenAnswer((_) async => mockResponse);

      // Setup subscription check response
      final mockSubResponse = MockResponse();
      when(() => mockSubResponse.statusCode).thenReturn(200);
      when(() => mockSubResponse.data).thenReturn({
        'user': {'id': 1, 'email': 'test@example.com', 'telegramId': null},
      });
      when(() => mockDio.get(any())).thenAnswer((_) async => mockSubResponse);

      await tester.pumpWidget(createWidgetUnderTest());
      await tester.pumpAndSettle();

      await tester.enterText(find.byType(TextFormField).first, 'test@example.com');
      await tester.pump();
      await tester.enterText(find.byType(TextFormField).last, 'password123');
      await tester.pump();
      await tester.tap(find.text('Войти'));
      await tester.pumpAndSettle();

      verify(() => mockDio.post(
        '/api/mobile/auth/login',
        data: {'email': 'test@example.com', 'password': 'password123'},
      )).called(1);
    });

    testWidgets('calls startTelegramAuth on Telegram button tap', (WidgetTester tester) async {
      final mockResponse = MockResponse();
      when(() => mockResponse.statusCode).thenReturn(200);
      when(() => mockResponse.data).thenReturn({'nonce': 'test_nonce_123'});
      when(() => mockDio.post('/api/mobile/auth/telegram/nonce')).thenAnswer((_) async => mockResponse);

      await tester.pumpWidget(createWidgetUnderTest());
      await tester.pumpAndSettle();

      await tester.ensureVisible(find.byIcon(Icons.telegram));
      await tester.tap(find.byIcon(Icons.telegram));
      await tester.pumpAndSettle();

      verify(() => mockDio.post('/api/mobile/auth/telegram/nonce')).called(1);
    });

    testWidgets('shows loading state during login', (WidgetTester tester) async {
      var callCount = 0;
      final mockResponse = MockResponse();
      when(() => mockResponse.statusCode).thenReturn(200);
      when(() => mockResponse.data).thenReturn({
        'accessToken': 'test_access',
        'refreshToken': 'test_refresh',
        'expiresIn': 900,
        'userId': 1,
      });
      when(() => mockDio.post(any(), data: any(named: 'data'))).thenAnswer((_) async {
        callCount++;
        if (callCount == 1) {
          // First call - delay to show loading state
          await Future.delayed(const Duration(milliseconds: 200));
        }
        return mockResponse;
      });

      final mockSubResponse = MockResponse();
      when(() => mockSubResponse.statusCode).thenReturn(200);
      when(() => mockSubResponse.data).thenReturn({
        'user': {'id': 1, 'email': 'test@example.com', 'telegramId': null},
      });
      when(() => mockDio.get(any())).thenAnswer((_) async => mockSubResponse);

      await tester.pumpWidget(createWidgetUnderTest());
      await tester.pumpAndSettle();

      await tester.enterText(find.byType(TextFormField).first, 'test@example.com');
      await tester.pump();
      await tester.enterText(find.byType(TextFormField).last, 'password123');
      await tester.pump();
      await tester.tap(find.text('Войти'));
      await tester.pump(); // Don't settle, check loading state

      expect(find.byType(CircularProgressIndicator), findsOneWidget);
      
      // Wait for the delayed response to complete
      await tester.pumpAndSettle();
    });
  });
}