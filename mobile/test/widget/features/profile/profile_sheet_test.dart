// Wave 0 widget contract for the real dark Profile Sheet (22-01 tracer slice).
// Every external value is injected; no network, no fake row, no toggle, no nav.
import "package:flutter/material.dart";
import "package:flutter_riverpod/flutter_riverpod.dart";
import "package:flutter_test/flutter_test.dart";
import "package:mobile/app/theme.dart";
import "package:mobile/features/profile/devices/device.dart";
import "package:mobile/features/profile/devices/devices_providers.dart";
import "package:mobile/features/profile/profile_sheet.dart";
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
}) {
  return ProviderScope(
    overrides: [
      devicesProvider.overrideWith((ref) async {
        if (devicesError != null) throw StateError(devicesError.toString());
        return devices ?? _devices();
      }),
      userSubscriptionProvider.overrideWith((ref) async => subscription ?? _subscription()),
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
      expect(find.byType(Switch), findsNothing);
      expect(find.byType(SwitchListTile), findsNothing);
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
}
