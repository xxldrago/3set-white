import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:mobile/main.dart' as app;

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  group('Auth Flow Integration Tests', () {
    testWidgets('App launches and shows login screen', (WidgetTester tester) async {
      app.main();
      await tester.pumpAndSettle();

      expect(find.text('Вход'), findsOneWidget);
      expect(find.text('Добро пожаловать'), findsOneWidget);
      expect(find.text('Войти'), findsOneWidget);
    });

    testWidgets('Navigate to register screen', (WidgetTester tester) async {
      app.main();
      await tester.pumpAndSettle();

      await tester.tap(find.text('Зарегистрироваться'));
      await tester.pumpAndSettle();

      expect(find.text('Регистрация'), findsOneWidget);
      expect(find.text('Создать аккаунт'), findsOneWidget);
    });
  });
}
