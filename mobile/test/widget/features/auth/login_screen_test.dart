import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mocktail/mocktail.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/features/auth/screens/login_screen.dart';
import 'package:mobile/core/auth/auth_notifier.dart';
import 'package:mobile/core/auth/auth_state.dart';
import 'package:mobile/features/auth/providers.dart';
import 'package:mobile/core/api/dio_client.dart';

class MockAuthNotifier extends Mock implements AuthNotifier {}
class MockDioClient extends Mock implements DioClient {}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('LoginScreen', () {
    late MockAuthNotifier mockAuthNotifier;
    late MockDioClient mockDioClient;

    setUp(() {
      mockAuthNotifier = MockAuthNotifier();
      mockDioClient = MockDioClient();

      when(() => mockAuthNotifier.state).thenReturn(
        const AsyncData(AuthState.unauthenticated()),
      );
      when(() => mockAuthNotifier.login(any(), any())).thenAnswer((_) async => AuthState.unauthenticated());
      when(() => mockAuthNotifier.startTelegramAuth()).thenAnswer((_) async => 'test_nonce');
      when(() => mockAuthNotifier.register(any(), any())).thenAnswer((_) async => AuthState.unauthenticated());
      when(() => mockAuthNotifier.logout()).thenAnswer((_) async {});
      when(() => mockAuthNotifier.restoreSession()).thenAnswer((_) async {});
    });

    Widget createWidgetUnderTest() {
      return ProviderScope(
        overrides: [
          authNotifierProvider.overrideWith((ref) => mockAuthNotifier),
          dioClientProvider.overrideWith((ref) => mockDioClient),
        ],
        child: MaterialApp.router(
          routerConfig: GoRouter(
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

      expect(find.text('Вход'), findsOneWidget);
      expect(find.text('3set VPN'), findsOneWidget);
      expect(find.text('Войдите для доступа к VPN'), findsOneWidget);
      expect(find.byType(TextFormField), findsNWidgets(2)); // email + password
      expect(find.text('Войти'), findsOneWidget);
      expect(find.text('Зарегистрироваться'), findsOneWidget);
      expect(find.byIcon(Icons.telegram), findsOneWidget);
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

      expect(find.text('Некорректный email'), findsOneWidget);
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
      await tester.pumpWidget(createWidgetUnderTest());
      await tester.pumpAndSettle();

      await tester.enterText(find.byType(TextFormField).first, 'test@example.com');
      await tester.enterText(find.byType(TextFormField).last, 'password123');
      await tester.tap(find.text('Войти'));
      await tester.pumpAndSettle();

      verify(() => mockAuthNotifier.login(
        email: 'test@example.com',
        password: 'password123',
      )).called(1);
    });

    testWidgets('calls startTelegramAuth on Telegram button tap', (WidgetTester tester) async {
      await tester.pumpWidget(createWidgetUnderTest());
      await tester.pumpAndSettle();

      await tester.tap(find.byIcon(Icons.telegram));
      await tester.pumpAndSettle();

      verify(() => mockAuthNotifier.startTelegramAuth()).called(1);
    });

    testWidgets('shows loading state during login', (WidgetTester tester) async {
      // Make login take some time
      when(() => mockAuthNotifier.login(any(), any())).thenAnswer((_) async {
        await Future.delayed(const Duration(milliseconds: 100));
        return AuthState.unauthenticated();
      });

      await tester.pumpWidget(createWidgetUnderTest());
      await tester.pumpAndSettle();

      await tester.enterText(find.byType(TextFormField).first, 'test@example.com');
      await tester.enterText(find.byType(TextFormField).last, 'password123');
      await tester.tap(find.text('Войти'));
      await tester.pump(); // Don't settle, check loading state

      expect(find.byType(CircularProgressIndicator), findsOneWidget);
    });
  });
}