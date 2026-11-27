import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mocktail/mocktail.dart';
import 'package:go_router/go_router.dart';
import 'package:logger/logger.dart';
import 'package:mobile/app/theme.dart';
import 'package:mobile/features/auth/screens/register_screen.dart';
import 'package:mobile/features/auth/screens/login_screen.dart';
import 'package:mobile/core/api/dio_client.dart';
import 'package:mobile/core/storage/token_store.dart';
import 'package:mobile/core/auth/auth_notifier.dart';
import 'package:mobile/models/auth_models.dart';
import 'package:dio/dio.dart';

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

  group('RegisterScreen', () {
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
          theme: AppTheme.dark,
          darkTheme: AppTheme.dark,
          themeMode: ThemeMode.dark,
          routerConfig: GoRouter(
            initialLocation: '/register',
            routes: [
              GoRoute(
                path: '/auth',
                builder: (context, state) => const LoginScreen(),
              ),
              GoRoute(
                path: '/register',
                builder: (context, state) => const RegisterScreen(),
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

    testWidgets('renders register screen with all elements', (WidgetTester tester) async {
      await tester.pumpWidget(createWidgetUnderTest());
      await tester.pumpAndSettle();

      expect(find.text('Регистрация'), findsOneWidget); // AppBar title
      expect(find.text('Создать аккаунт'), findsOneWidget); // Title
      expect(find.text('Зарегистрируйтесь в 3set VPN'), findsOneWidget); // Subtitle
      expect(find.byType(TextFormField), findsNWidgets(3)); // email + password + confirm
      expect(find.text('Зарегистрироваться'), findsOneWidget); // Submit button
      expect(find.text('Войти'), findsOneWidget); // Toggle link
    });

    testWidgets('uses the dark prototype theme', (WidgetTester tester) async {
      await tester.pumpWidget(createWidgetUnderTest());
      await tester.pumpAndSettle();

      final ThemeData theme = Theme.of(
        tester.element(find.byType(RegisterScreen)),
      );
      expect(theme.brightness, Brightness.dark);
      expect(theme.colorScheme.primary, AppTheme.lime);
      expect(theme.scaffoldBackgroundColor, AppTheme.bg);
    });

    testWidgets('rejects a 6-character password (min is 8)', (
      WidgetTester tester,
    ) async {
      await tester.pumpWidget(createWidgetUnderTest());
      await tester.pumpAndSettle();

      await tester.enterText(
        find.byType(TextFormField).first,
        'test@example.com',
      );
      await tester.enterText(find.byType(TextFormField).at(1), '123456');
      await tester.tap(find.text('Зарегистрироваться'));
      await tester.pumpAndSettle();

      expect(
        find.text('Пароль должен быть минимум 8 символов'),
        findsOneWidget,
      );
    });

    testWidgets('shows validation errors for empty fields', (WidgetTester tester) async {
      await tester.pumpWidget(createWidgetUnderTest());
      await tester.pumpAndSettle();

      await tester.tap(find.text('Зарегистрироваться'));
      await tester.pumpAndSettle();

      expect(find.text('Введите email'), findsOneWidget);
      expect(find.text('Введите пароль'), findsOneWidget);
      expect(find.text('Введите пароль повторно'), findsOneWidget);
    });

    testWidgets('shows validation error for invalid email', (WidgetTester tester) async {
      await tester.pumpWidget(createWidgetUnderTest());
      await tester.pumpAndSettle();

      await tester.enterText(find.byType(TextFormField).first, 'invalid-email');
      await tester.tap(find.text('Зарегистрироваться'));
      await tester.pumpAndSettle();

      expect(find.text('Неверный формат email'), findsOneWidget);
    });

    testWidgets('shows validation error for short password', (WidgetTester tester) async {
      await tester.pumpWidget(createWidgetUnderTest());
      await tester.pumpAndSettle();

      await tester.enterText(find.byType(TextFormField).first, 'test@example.com');
      await tester.enterText(find.byType(TextFormField).at(1), '123');
      await tester.tap(find.text('Зарегистрироваться'));
      await tester.pumpAndSettle();

      expect(find.text('Пароль должен быть минимум 8 символов'), findsOneWidget);
    });

    testWidgets('shows validation error for mismatched passwords', (WidgetTester tester) async {
      await tester.pumpWidget(createWidgetUnderTest());
      await tester.pumpAndSettle();

      await tester.enterText(find.byType(TextFormField).first, 'test@example.com');
      await tester.enterText(find.byType(TextFormField).at(1), 'password123');
      await tester.enterText(find.byType(TextFormField).at(2), 'different456');
      await tester.tap(find.text('Зарегистрироваться'));
      await tester.pumpAndSettle();

      expect(find.text('Пароли не совпадают'), findsOneWidget);
    });

    testWidgets('navigates to login screen when tapping login link', (WidgetTester tester) async {
      await tester.pumpWidget(createWidgetUnderTest());
      await tester.pumpAndSettle();

      await tester.ensureVisible(find.text('Войти'));
      await tester.tap(find.text('Войти'));
      await tester.pumpAndSettle();

      // Check for the AppBar title on LoginScreen
      expect(find.text('Вход'), findsOneWidget);
    });

    testWidgets('calls register on valid form submission', (WidgetTester tester) async {
      final mockResponse = MockResponse();
      when(() => mockResponse.statusCode).thenReturn(200);
      when(() => mockResponse.data).thenReturn({
        'accessToken': 'test_access',
        'refreshToken': 'test_refresh',
        'expiresIn': 900,
        'userId': 1,
      });
      when(() => mockDio.post(any(), data: any(named: 'data'))).thenAnswer((_) async => mockResponse);

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
      await tester.enterText(find.byType(TextFormField).at(1), 'password123');
      await tester.pump();
      await tester.enterText(find.byType(TextFormField).at(2), 'password123');
      await tester.pump();
      await tester.tap(find.text('Зарегистрироваться'));
      await tester.pumpAndSettle();

      verify(() => mockDio.post(
        '/api/mobile/auth/register',
        data: {
          'email': 'test@example.com',
          'password': 'password123',
          'confirmPassword': 'password123',
        },
      )).called(1);
    });

    testWidgets('shows loading state during registration', (WidgetTester tester) async {
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
      await tester.enterText(find.byType(TextFormField).at(1), 'password123');
      await tester.pump();
      await tester.enterText(find.byType(TextFormField).at(2), 'password123');
      await tester.pump();
      await tester.tap(find.text('Зарегистрироваться'));
      await tester.pump(); // Don't settle, check loading state

      expect(find.byType(CircularProgressIndicator), findsOneWidget);
      
      // Wait for the delayed response to complete
      await tester.pumpAndSettle();
    });
  });
}