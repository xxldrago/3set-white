// REQ-NOTIF-01 / CR-01: the permission status row is honest about the real OS
// grant and offers an explicit re-request. All platform access goes through the
// fakeable dispatcher seam — no channel, no real alarm, no account data.
import "package:flutter/material.dart";
import "package:flutter_riverpod/flutter_riverpod.dart";
import "package:flutter_test/flutter_test.dart";
import "package:mobile/app/theme.dart";
import "package:mobile/core/notifications/local_notifications.dart"
    show
        LocalNotificationDispatcher,
        localNotificationDispatcherProvider,
        notificationStatusDenied,
        notificationStatusGranted,
        notificationStatusTitle;
import "package:mobile/features/profile/profile_sheet.dart"
    show NotificationStatusRow;
import "package:timezone/timezone.dart" as tz;

class FakePermissionDispatcher implements LocalNotificationDispatcher {
  FakePermissionDispatcher({this.granted = true});

  bool granted;
  int initializeCalls = 0;
  int requestCalls = 0;
  final List<String> events = <String>[];

  @override
  Future<void> initialize() async {
    initializeCalls++;
  }

  @override
  Future<bool> requestNotificationsPermission() async {
    requestCalls++;
    events.add("request");
    // A real grant may follow the OS prompt.
    granted = true;
    return true;
  }

  @override
  Future<bool> notificationsEnabled() async => granted;

  @override
  Future<void> schedule({
    required int id,
    required tz.TZDateTime when,
    required String title,
    required String body,
    required String payload,
  }) async {
    events.add("schedule:$id");
  }

  @override
  Future<void> cancel(int id) async {
    events.add("cancel:$id");
  }
}

Widget _rowApp(FakePermissionDispatcher dispatcher) {
  return ProviderScope(
    overrides: [
      localNotificationDispatcherProvider.overrideWithValue(dispatcher),
    ],
    child: MaterialApp(
      theme: AppTheme.dark,
      home: const Scaffold(body: NotificationStatusRow()),
    ),
  );
}

void main() {
  testWidgets("granted permission shows the fixed RU status, no re-request", (
    tester,
  ) async {
    final dispatcher = FakePermissionDispatcher(granted: true);
    await tester.pumpWidget(_rowApp(dispatcher));
    await tester.pumpAndSettle();

    expect(find.text(notificationStatusTitle), findsOneWidget);
    expect(find.text(notificationStatusGranted), findsOneWidget);
    expect(find.text("Разрешить"), findsNothing);
    expect(dispatcher.events, isEmpty);
  });

  testWidgets("denied permission is visible and can be re-requested", (
    tester,
  ) async {
    final dispatcher = FakePermissionDispatcher(granted: false);
    await tester.pumpWidget(_rowApp(dispatcher));
    await tester.pumpAndSettle();

    expect(find.text(notificationStatusDenied), findsOneWidget);
    expect(find.text("Разрешить"), findsOneWidget);
    expect(dispatcher.requestCalls, 0);

    await tester.tap(find.text("Разрешить"));
    await tester.pumpAndSettle();

    expect(dispatcher.requestCalls, 1);
    expect(dispatcher.events, <String>["request"]);
    expect(find.text(notificationStatusGranted), findsOneWidget);
    expect(find.text("Разрешить"), findsNothing);
  });
}
