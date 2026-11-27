import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:mobile/main.dart' as app;

/// Offline UAT coverage for Phase 18 auth screens.
///
/// These cases assert the behaviour that does NOT require a live backend or a
/// real Telegram round trip, so they run in CI on a simulator:
///   * UAT #1 (partial) — the app cold-starts on «Вход» with no red error screen
///   * UAT #2 (partial) — client-side validation: short password and password
///     mismatch are rejected inline before any request is made
///   * register screen reachable from login
///
/// The network-dependent halves of UAT #2–#5 need a backend the app points at
/// and a real bot/hardware; see 18-UAT.md.
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  group('Auth screens — offline UAT', () {
    testWidgets('cold start lands on the login screen', (WidgetTester tester) async {
      app.main();
      await tester.pumpAndSettle();

      expect(find.text('Вход'), findsOneWidget);
      expect(find.text('Добро пожаловать'), findsOneWidget);
      expect(find.text('Войти'), findsWidgets);
      // No unhandled error surface on cold start.
      expect(find.textContaining('Exception'), findsNothing);
      expect(find.byType(ErrorWidget), findsNothing);
    });

    testWidgets('short password is rejected inline without a request', (
      WidgetTester tester,
    ) async {
      app.main();
      await tester.pumpAndSettle();

      await tester.enterText(find.byType(TextFormField).at(0), 'user@example.com');
      await tester.enterText(find.byType(TextFormField).at(1), 'short');

      await tester.tap(find.widgetWithText(FilledButton, 'Войти').first);
      await tester.pumpAndSettle();

      expect(find.text('Пароль должен быть минимум 8 символов'), findsOneWidget);
      // Still on the login screen — validation blocked the submit.
      expect(find.text('Добро пожаловать'), findsOneWidget);
    });

    testWidgets('invalid email is rejected inline', (WidgetTester tester) async {
      app.main();
      await tester.pumpAndSettle();

      await tester.enterText(find.byType(TextFormField).at(0), 'not-an-email');
      await tester.enterText(find.byType(TextFormField).at(1), 'longenoughpassword');

      await tester.tap(find.widgetWithText(FilledButton, 'Войти').first);
      await tester.pumpAndSettle();

      expect(find.text('Неверный формат email'), findsOneWidget);
    });

    testWidgets('register screen rejects a password mismatch', (
      WidgetTester tester,
    ) async {
      app.main();
      await tester.pumpAndSettle();

      await tester.tap(find.text('Зарегистрироваться'));
      await tester.pumpAndSettle();

      expect(find.text('Регистрация'), findsOneWidget);

      await tester.enterText(find.byType(TextFormField).at(0), 'new@example.com');
      await tester.enterText(find.byType(TextFormField).at(1), 'password123');
      await tester.enterText(find.byType(TextFormField).at(2), 'password124');

      // The submit button label on this screen is «Зарегистрироваться».
      await tester.tap(find.widgetWithText(FilledButton, 'Зарегистрироваться').first);
      await tester.pumpAndSettle();

      expect(find.text('Пароли не совпадают'), findsOneWidget);
    });
  });
}
