// WR-01: a fired DELETE that fails at the BFF must show one stable Russian
// notice, refetch the list and clear the pending row — with no unhandled async
// error. Every external seam is injected; no real HTTP, native or OS access.
import "package:drift/native.dart";
import "package:flutter/material.dart";
import "package:flutter_riverpod/flutter_riverpod.dart";
import "package:flutter_test/flutter_test.dart";
import "package:mobile/app/theme.dart";
import "package:mobile/core/db/app_database.dart" show AppDatabase;
import "package:mobile/core/notifications/local_notifications.dart"
    show LocalNotificationDispatcher, localNotificationDispatcherProvider;
import "package:mobile/core/payment/payment_flow.dart"
    show PaymentFlowResult, PaymentOutcome;
import "package:mobile/core/settings/auto_connect_listener.dart"
    show AutoConnectStore, autoConnectStoreProvider;
import "package:mobile/features/profile/devices/device.dart" show Device;
import "package:mobile/features/profile/devices/deferred_delete_controller.dart"
    show deviceDeleteFailedNotice;
import "package:mobile/features/profile/devices/devices_providers.dart"
    show deleteDeviceProvider, devicesProvider;
import "package:mobile/features/profile/profile_sheet.dart" show ProfileSheet;
import "package:mobile/features/servers/server_pool_screen.dart"
    show networkLabelProvider;
import "package:mobile/features/shop/shop_screen.dart"
    show linkCopierProvider, paymentFlowStarterProvider;
import "package:mobile/features/subscription/models/subscription.dart"
    show SubscriptionStatus, SubscriptionUser;
import "package:mobile/features/subscription/providers.dart"
    show userSubscriptionProvider;
import "package:timezone/timezone.dart" as tz;

class _MemoryAutoConnectStore extends AutoConnectStore {
  _MemoryAutoConnectStore(AppDatabase db) : super(db);

  @override
  Future<bool> readAutoConnect() async => false;

  @override
  Future<void> setAutoConnect(bool enabled) async {}
}

class _FakeDispatcher implements LocalNotificationDispatcher {
  @override
  Future<void> initialize() async {}

  @override
  Future<bool> requestNotificationsPermission() async => true;

  @override
  Future<bool> notificationsEnabled() async => true;

  @override
  Future<void> schedule({
    required int id,
    required tz.TZDateTime when,
    required String title,
    required String body,
    required String payload,
  }) async {}

  @override
  Future<void> cancel(int id) async {}
}

void main() {
  testWidgets("a failed fired DELETE notifies, refetches and clears pending", (
    tester,
  ) async {
    final deleteCalls = <String>[];
    var reads = 0;
    final db = AppDatabase(NativeDatabase.memory());
    addTearDown(db.close);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          devicesProvider.overrideWith((ref) async {
            reads++;
            return const <Device>[Device(token: "tok-1", label: "Телефон")];
          }),
          userSubscriptionProvider.overrideWith((ref) async => SubscriptionStatus(
                ok: true,
                user: const SubscriptionUser(id: 1, email: "a@b.test"),
                deviceLimit: 5,
              )),
          deleteDeviceProvider.overrideWithValue((token) async {
            deleteCalls.add(token);
            throw StateError("rate_limited");
          }),
          linkCopierProvider.overrideWithValue((_) async {}),
          paymentFlowStarterProvider.overrideWithValue((_, __) async =>
              const PaymentFlowResult(PaymentOutcome.provisioned, "ord")),
          autoConnectStoreProvider.overrideWithValue(
            _MemoryAutoConnectStore(db),
          ),
          localNotificationDispatcherProvider.overrideWithValue(
            _FakeDispatcher(),
          ),
          networkLabelProvider.overrideWith((_) => Stream<String>.value("Wi-Fi")),
        ],
        child: MaterialApp(
          theme: AppTheme.dark,
          home: const Scaffold(body: ProfileSheet()),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byIcon(Icons.close).first);
    await tester.pumpAndSettle();
    // Both the row and the snackbar read «Отключение…» while the timer runs.
    expect(find.text("Отключение…"), findsNWidgets(2));

    // Wait past the five-second undo window so the timer fires the DELETE.
    for (var second = 0; second < 6; second++) {
      await tester.pump(const Duration(seconds: 1));
    }
    await tester.pumpAndSettle();

    expect(deleteCalls, <String>["tok-1"]);
    expect(find.text(deviceDeleteFailedNotice), findsOneWidget);
    // The row is no longer dimmed/pending and the list was refetched.
    expect(find.text("Отключение…"), findsNothing);
    expect(find.text("Телефон"), findsOneWidget);
    expect(reads, greaterThanOrEqualTo(2));
  });
}
