import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mocktail/mocktail.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/features/auth/screens/register_screen.dart';
import 'package:mobile/core/auth/auth_notifier.dart';
import 'package:mobile/core/auth/auth_state.dart';
import 'package:mobile/features/auth/providers.dart';
import 'package:mobile/core/api/dio_client.dart';

class MockAuthNotifier extends Mock implements AuthNotifier {}
class MockDioClient extends Mock implements DioClient {}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('RegisterScreen', () {
    late MockAuthNotifier mockAuthNotifier;
    late MockDioClient mockDioClient;

    setUp(() {
      mockAuthNotifier = MockAuthNotifier();
      mockDioClient = MockDioClient();

      when(() => mockAuthNotifier.state).thenReturn(
        const AsyncData(AuthState.unauthenticated()),
      );
      when(() => mockAuthNotifier.register(any(), any())).thenAnswer((_) async => AuthState.unauthenticated());
      when(() => mockAuthNotifier.login(any(), any())).thenAnswer((_) async => AuthState.unauthenticated());
      when(() => mockAuthNotifier.startTelegramAuth()).thenAnswer((_) async => 'test_nonce');
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
                builder: (context, state) => const Scaffold(body: Text('Login')),
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

      expect(find.text('Регистрация'), findsOneWidget);
      expect(find.text('3set VPN'), findsOneWidget);
      expect(find.text('Создайте аккаунт для доступа к VPN'), findsOneWidget);
      expect(find.byType(TextFormField), findsNWidgets(3)); // email + password + confirm
      expect(find.text('Зарегистрироваться'), findsOneWidget);
      expect(find.text('Войти'), findsOneWidget);
    });

    testWidgets('shows validation errors for empty fields', (WidgetTester tester) async {
      await tester.pumpWidget(createWidgetUnderTest());
      await tester.pumpAndSettle();

      await tester.tap(find.text('Зарегистрироваться'));
      await tester.pumpAndSettle();

      expect(find.text('Введите email'), findsOneWidget);
      expect(find.text('Введите пароль'), findsOneWidget);
      expect(find.text('Подтвердите пароль'), findsOneWidget);
    });

    testWidgets('shows validation error for invalid email', (WidgetTester tester) async {
      await tester.pumpWidget(createWidgetUnderTest());
      await tester.pumpAndSettle();

      await tester.enterText(find.byType(TextFormField).first, 'invalid-email');
      await tester.tap(find.text('Зарегистрироваться'));
      await tester.pumpAndSettle();

      expect(find.text('Некорректный email'), findsOneWidget);
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

      await tester.tap(find.text('Войти'));
      await tester.pumpAndSettle();

      expect(find.text('Login'), findsOneWidget);
    });

    testWidgets('calls register on valid form submission', (WidgetTester tester) async {
      await tester.pumpWidget(createWidgetUnderTest());
      await tester.pumpAndSettle();

      await tester.enterText(find.byType(TextFormField).first, 'test@example.com');
      await tester.enterText(find.byType(TextFormField).at(1), 'password123');
      await tester.enterText(find.byType(TextFormField).at(2), 'password123');
      await tester.tap(find.text('Зарегистрироваться'));
      await tester.pumpAndSettle();

      verify(() => mockAuthNotifier.register('test@example.com', 'password123')).called(1);
    });

    testWidgets('shows loading state during registration', (WidgetTester tester) async {
      when(() => mockAuthNotifier.register(any(), any())).thenAnswer((_) async {
        await Future.delayed(const Duration(milliseconds: 100));
        return AuthState.unauthenticated();
      });

      await tester.pumpWidget(createWidgetUnderTest());
      await tester.pumpAndSettle();

      await tester.enterText(find.byType(TextFormField).first, 'test@example.com');
      await tester.enterText(find.byType(TextFormField).at(1), 'password123');
      await tester.enterText(find.byType(TextFormField).at(2), 'password123');
      await tester.tap(find.text('Зарегистрироваться'));
      await tester.pump(); // Don't settle, check loading state

      expect(find.byType(CircularProgressIndicator), findsOneWidget);
    });
  });
}