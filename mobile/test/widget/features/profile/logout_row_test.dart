// UI priority 3: the profile sheet's confirm-then-call logout row. The call,
// navigation and device list are all injected — one logout, one /auth handoff,
// zero provider device/key deletes, and no native/server side effect.
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
import "package:mobile/features/profile/devices/devices_providers.dart"
    show deleteDeviceProvider, devicesProvider;
import "package:mobile/features/profile/profile_sheet.dart"
    show ProfileSheet;
import "package:mobile/features/profile/settings/logout_row.dart"
    show logoutCallProvider, logoutNavigationProvider;
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
  testWidgets("confirm then call only logout once, with one /auth handoff", (
    tester,
  ) async {
    final logoutCalls = <int>[];
    final navigations = <int>[];
    final deletedTokens = <String>[];
    final db = AppDatabase(NativeDatabase.memory());
    addTearDown(db.close);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          devicesProvider.overrideWith((ref) async => const <Device>[]),
          userSubscriptionProvider.overrideWith((ref) async => SubscriptionStatus(
                ok: true,
                user: const SubscriptionUser(id: 1, email: "a@b.test"),
                deviceLimit: 5,
                link: "https://sub.invalid/link",
              )),
          deleteDeviceProvider.overrideWithValue((token) async {
            deletedTokens.add(token);
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
          logoutCallProvider.overrideWithValue(() async {
            logoutCalls.add(1);
          }),
          logoutNavigationProvider.overrideWithValue(() {
            navigations.add(1);
          }),
        ],
        child: MaterialApp(
          theme: AppTheme.dark,
          home: const Scaffold(body: ProfileSheet()),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text("Выйти из аккаунта"), findsOneWidget);
    await tester.scrollUntilVisible(
      find.text("Выйти из аккаунта"),
      100,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text("Выйти из аккаунта"));
    await tester.pumpAndSettle();
    expect(find.text("Выйти из аккаунта?"), findsOneWidget);
    expect(logoutCalls, isEmpty); // dismissal alone does nothing

    await tester.tap(find.text("Выйти"));
    await tester.pumpAndSettle();

    expect(logoutCalls, <int>[1]);
    expect(navigations, <int>[1]);
    expect(deletedTokens, isEmpty);
  });
}
