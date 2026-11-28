// Wave 0 widget contract for the real dark Profile Sheet (22-01 tracer slice).
// Every external value is injected; no network, no fake row, no toggle, no nav.
import "package:flutter/material.dart";
import "package:flutter_riverpod/flutter_riverpod.dart";
import "package:flutter_test/flutter_test.dart";
import "package:mobile/app/theme.dart";
import "package:mobile/core/payment/payment_flow.dart"
    show PaymentFlowResult, PaymentOutcome, PaymentRequest;
import "package:mobile/features/profile/devices/device.dart";
import "package:mobile/features/profile/devices/devices_providers.dart";
import "package:mobile/features/shop/shop_screen.dart"
    show linkCopierProvider, paymentFlowStarterProvider;
import "package:mobile/features/profile/profile_sheet.dart";
import "package:mobile/features/profile/settings/kill_switch_row.dart"
    show KillSwitchRow;
import "package:mobile/features/subscription/models/subscription.dart";
import "package:mobile/features/subscription/providers.dart";

const String _link = "https://sub.invalid/SECRET_LINK";

SubscriptionStatus _subscription() => SubscriptionStatus(
      ok: true,
      user: const SubscriptionUser(id: 7, telegramId: null, email: "alex@example.test"),
      deviceLimit: 5,
      devices: 2,
      link: _link,
    );

List<Device> _devices() => const <Device>[
      Device(token: "tok-a", label: "Телефон", name: "Pixel"),
      Device(token: "tok-b", label: null, name: "Ноутбук"),
    ];

Widget _profileApp({
  List<Device>? devices,
  SubscriptionStatus? subscription,
  Object? devicesError,
  List<String>? copiedLinks,
  List<PaymentRequest>? intents,
  List<String>? deletedTokens,
  SubscriptionUser? user,
}) {
  final base = subscription ?? _subscription();
  final effective = user == null ? base : base.copyWith(user: user);
  return ProviderScope(
    overrides: [
      devicesProvider.overrideWith((ref) async {
        if (devicesError != null) throw StateError(devicesError.toString());
        return devices ?? _devices();
      }),
      userSubscriptionProvider.overrideWith((ref) async => effective),
      linkCopierProvider.overrideWithValue((link) async {
        copiedLinks?.add(link);
      }),
      paymentFlowStarterProvider.overrideWithValue((context, request) async {
        intents?.add(request);
        return const PaymentFlowResult(PaymentOutcome.provisioned, "ord-1");
      }),
      deleteDeviceProvider.overrideWithValue((token) async {
        deletedTokens?.add(token);
      }),
    ],
    child: MaterialApp(
      theme: AppTheme.dark,
      home: const Scaffold(body: ProfileSheet()),
    ),
  );
}

void main() {
  group("Profile sheet device rows", () {
    testWidgets("renders one row per token in provider order with honest fallbacks", (
      tester,
    ) async {
      await tester.pumpWidget(_profileApp());
      await tester.pumpAndSettle();

      expect(find.text("Телефон"), findsOneWidget); // label wins
      expect(find.text("Ноутбук"), findsOneWidget); // name fallback
      expect(find.text("Устройство"), findsNothing); // no fabricated placeholder row
      // Provider order is preserved: label row appears before the name row.
      final labelY = tester.getTopLeft(find.text("Телефон")).dy;
      final nameY = tester.getTopLeft(find.text("Ноутбук")).dy;
      expect(labelY, lessThan(nameY));
    });

    testWidgets("shows the empty state for no devices instead of a fake row", (
      tester,
    ) async {
      await tester.pumpWidget(_profileApp(devices: const <Device>[]));
      await tester.pumpAndSettle();

      expect(find.text("Нет устройств"), findsOneWidget);
      expect(find.text("Устройство"), findsNothing);
    });

    testWidgets("uses the neutral fallback when label and name are both absent", (
      tester,
    ) async {
      await tester.pumpWidget(
        _profileApp(devices: const <Device>[Device(token: "tok-c")]),
      );
      await tester.pumpAndSettle();

      expect(find.text("Устройство"), findsOneWidget);
    });
  });

  group("Profile sheet safety copy", () {
    testWidgets("kill switch is a read-only status row, not a toggle", (
      tester,
    ) async {
      await tester.pumpWidget(_profileApp());
      await tester.pumpAndSettle();

      expect(find.text("Kill switch: включён"), findsOneWidget);
      expect(find.text("Трафик вне VPN заблокирован"), findsOneWidget);
      // The kill switch itself is still read-only; the only switch in the
      // sheet is the separate persisted auto-connect preference (REQ-SET-02).
      expect(
        find.descendant(
          of: find.byType(KillSwitchRow),
          matching: find.byType(Switch),
        ),
        findsNothing,
      );
      expect(
        find.descendant(
          of: find.byType(KillSwitchRow),
          matching: find.byType(SwitchListTile),
        ),
        findsNothing,
      );
    });

    testWidgets("read-only kill switch copy is identical on every rebuild", (
      tester,
    ) async {
      await tester.pumpWidget(_profileApp());
      await tester.pumpAndSettle();

      expect(find.text("Kill switch: включён"), findsOneWidget);
      expect(find.text("Трафик вне VPN заблокирован"), findsOneWidget);
      // The kill switch itself is still read-only; the only switch in the
      // sheet is the separate persisted auto-connect preference (REQ-SET-02).
      expect(
        find.descendant(
          of: find.byType(KillSwitchRow),
          matching: find.byType(Switch),
        ),
        findsNothing,
      );
      expect(
        find.descendant(
          of: find.byType(KillSwitchRow),
          matching: find.byType(SwitchListTile),
        ),
        findsNothing,
      );

      await tester.pump(); // a plain rebuild must not change the copy
      expect(find.text("Kill switch: включён"), findsOneWidget);
      expect(find.text("Трафик вне VPN заблокирован"), findsOneWidget);
      expect(
        find.descendant(
          of: find.byType(KillSwitchRow),
          matching: find.byType(Switch),
        ),
        findsNothing,
      );
    });

    testWidgets("identity prefers the real firstName over username and email", (
      tester,
    ) async {
      await tester.pumpWidget(
        _profileApp(
          user: const SubscriptionUser(
            id: 7,
            telegramId: 55,
            email: "a@b.test",
            firstName: "Алик",
            lastName: "Иванов",
            username: "tg_user",
            referralCode: "3SET-ABC123",
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text("Алик"), findsOneWidget);
      expect(find.text("tg_user"), findsNothing);
      expect(find.text("a"), findsNothing);
      expect(find.text("Telegram"), findsOneWidget);
    });

    testWidgets("identity falls back to username before email local part", (
      tester,
    ) async {
      await tester.pumpWidget(
        _profileApp(
          user: const SubscriptionUser(
            id: 7,
            email: "alex@example.test",
            username: "tg_user",
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text("tg_user"), findsOneWidget);
      expect(find.text("alex"), findsNothing);
    });

    testWidgets("identity falls back to the real email local part", (
      tester,
    ) async {
      await tester.pumpWidget(
        _profileApp(
          user: const SubscriptionUser(id: 7, email: "alex@example.test"),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text("alex"), findsOneWidget);
      expect(find.text("Email"), findsOneWidget);
    });

    testWidgets("identity ends at the neutral label when no field is present", (
      tester,
    ) async {
      await tester.pumpWidget(
        _profileApp(user: const SubscriptionUser(id: 7)),
      );
      await tester.pumpAndSettle();
      expect(find.text("Пользователь"), findsOneWidget);
    });

    testWidgets("no bottom navigation and identity comes from the server user", (
      tester,
    ) async {
      await tester.pumpWidget(_profileApp());
      await tester.pumpAndSettle();

      expect(find.byType(NavigationBar), findsNothing);
      expect(find.byType(BottomNavigationBar), findsNothing);
      expect(find.text("alex"), findsOneWidget); // email local part, not invented
      expect(find.text("Email"), findsOneWidget);
    });

    testWidgets("a failed device read shows a stable notice, never provider text", (
      tester,
    ) async {
      await tester.pumpWidget(_profileApp(devicesError: Object()));
      await tester.pumpAndSettle();

      expect(find.text("Нет соединения. Повторите"), findsOneWidget);
      expect(find.text(_link), findsNothing);
    });
  });

  group("honest add, paid upgrade and deferred undo", () {
    testWidgets("below the limit the add button only copies the real link", (
      tester,
    ) async {
      final copied = <String>[];
      final intents = <PaymentRequest>[];
      final deleted = <String>[];
      await tester.pumpWidget(
        _profileApp(copiedLinks: copied, intents: intents, deletedTokens: deleted),
      );
      await tester.pumpAndSettle();

      expect(find.text("Добавить это устройство"), findsOneWidget);
      await tester.tap(find.text("Добавить это устройство"));
      await tester.pumpAndSettle();

      expect(copied, <String>[_link]);
      expect(intents, isEmpty);
      expect(deleted, isEmpty);
      expect(find.text("Ссылка скопирована"), findsOneWidget);
    });

    testWidgets("at exactly deviceLimit only the paid upgrade is offered", (
      tester,
    ) async {
      final copied = <String>[];
      final intents = <PaymentRequest>[];
      final subscription = SubscriptionStatus(
        ok: true,
        user: const SubscriptionUser(id: 7, telegramId: null, email: "a@b.test"),
        deviceLimit: 2,
        devices: 2,
        link: _link,
      );
      await tester.pumpWidget(
        _profileApp(
          subscription: subscription,
          copiedLinks: copied,
          intents: intents,
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text("Добавить это устройство"), findsNothing);
      expect(find.text("Лимит устройств достигнут"), findsOneWidget);
      expect(find.text("Увеличить лимит"), findsOneWidget);

      await tester.tap(find.text("Увеличить лимит"));
      await tester.pumpAndSettle();

      expect(intents, hasLength(1));
      final intent = intents.single;
      expect(intent.kind, "upgrade");
      expect(intent.addDevices, 1);
      expect(intent.keyId, isNull);
      expect(intent.days, isNull);
      expect(intent.devices, isNull);
      expect(intent.toJson().containsKey("amount"), isFalse);
      expect(copied, isEmpty);
    });

    testWidgets("undo cancels before the DELETE reaches the BFF", (
      tester,
    ) async {
      final deleted = <String>[];
      await tester.pumpWidget(
        _profileApp(deletedTokens: deleted),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.byIcon(Icons.close).first);
      await tester.pumpAndSettle();
      expect(find.text("Отключение…"), findsNWidgets(2));
      expect(find.text("Устройство отключено"), findsNothing);
      expect(find.text("Вернуть"), findsOneWidget);

      await tester.tap(find.text("Вернуть"));
      await tester.pump(const Duration(seconds: 6));

      expect(deleted, isEmpty);
      expect(find.text("Нет соединения. Повторите"), findsNothing);
    });

    testWidgets("a fired timer sends exactly one DELETE", (
      tester,
    ) async {
      final deleted = <String>[];
      await tester.pumpWidget(
        _profileApp(deletedTokens: deleted),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.byIcon(Icons.close).first);
      await tester.pump(const Duration(seconds: 6));

      expect(deleted, <String>["tok-a"]);
    });

    testWidgets("undo action lasts the full window; done copy waits for the BFF", (
      tester,
    ) async {
      final deleted = <String>[];
      await tester.pumpWidget(_profileApp(deletedTokens: deleted));
      await tester.pumpAndSettle();

      await tester.tap(find.byIcon(Icons.close).first);
      await tester.pumpAndSettle();

      expect(
        tester.widget<SnackBar>(find.byType(SnackBar)).duration,
        const Duration(seconds: 5),
      );
      expect(find.text("Отключение…"), findsNWidgets(2));
      expect(find.text("Устройство отключено"), findsNothing);

      for (var second = 0; second < 6; second++) {
        await tester.pump(const Duration(seconds: 1));
      }
      await tester.pumpAndSettle();

      expect(deleted, <String>["tok-a"]);
      expect(find.text("Устройство отключено"), findsOneWidget);
      expect(find.text("Отключение…"), findsNothing);
    });
  });
}
