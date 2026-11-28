// Wave 0 for REQ-NOTIF-01: server expiry → three absolute reminders, past
// skip, cancel-before-reschedule, and a navigation-only payload (T-22-21/22).
// The platform plugin is replaced by a fake, so no channel or real OS alarm
// is involved and no payment/entitlement path is exercised.
import "package:flutter_test/flutter_test.dart";
import "package:mobile/core/notifications/expiry_scheduler.dart";
import "package:mobile/core/notifications/local_notifications.dart"
    show
        LocalNotificationDispatcher,
        expiryNavigationPayload,
        expiryNotificationBody,
        expiryNotificationTitle,
        handleExpiryNotificationTap;
import "package:timezone/data/latest.dart" as tzdata;
import "package:timezone/timezone.dart" as tz;

class ScheduledCall {
  const ScheduledCall({
    required this.id,
    required this.when,
    required this.title,
    required this.body,
    required this.payload,
  });

  final int id;
  final tz.TZDateTime when;
  final String title;
  final String body;
  final String payload;
}

class FakeNotificationDispatcher implements LocalNotificationDispatcher {
  @override
  Future<void> initialize() async {}

  @override
  Future<void> schedule({
    required int id,
    required tz.TZDateTime when,
    required String title,
    required String body,
    required String payload,
  }) async {
    events.add("schedule:$id");
    scheduled.add(ScheduledCall(
      id: id,
      when: when,
      title: title,
      body: body,
      payload: payload,
    ));
  }

  @override
  Future<void> cancel(int id) async {
    events.add("cancel:$id");
    scheduled.removeWhere((call) => call.id == id);
  }

  final List<String> events = <String>[];
  final List<ScheduledCall> scheduled = <ScheduledCall>[];
}

void main() {
  setUp(tzdata.initializeTimeZones);

  ExpiryScheduler schedulerFor(
    FakeNotificationDispatcher dispatcher, {
    DateTime? now,
  }) =>
      ExpiryScheduler(
        dispatcher,
        now: () => now ?? DateTime.utc(2026, 11, 28, 12),
        location: tz.UTC,
      );

  test("schedules exactly three future instants at T-7/T-3/T-1", () async {
    final dispatcher = FakeNotificationDispatcher();
    await schedulerFor(dispatcher).scheduleFromServerExpiry(
      "2026-12-20T12:00:00.000Z",
    );

    expect(dispatcher.scheduled, hasLength(3));
    expect(
      dispatcher.scheduled.map((call) => call.id).toList(),
      <int>[7, 3, 1],
    );
    expect(
      dispatcher.scheduled
          .map((call) => call.when.toUtc().toIso8601String())
          .toList(),
      <String>[
        "2026-12-13T12:00:00.000Z",
        "2026-12-17T12:00:00.000Z",
        "2026-12-19T12:00:00.000Z",
      ],
    );
  });

  test("skips instants already in the past", () async {
    final dispatcher = FakeNotificationDispatcher();
    await schedulerFor(dispatcher).scheduleFromServerExpiry(
      "2026-11-30T12:00:00.000Z",
    );

    expect(dispatcher.scheduled, hasLength(1));
    expect(dispatcher.scheduled.single.id, 1);
    expect(dispatcher.events, <String>["cancel:7", "cancel:3", "cancel:1",
      "schedule:1"]);
  });

  test("cancels prior reminders before rescheduling, with no duplicates",
      () async {
    final dispatcher = FakeNotificationDispatcher();
    final scheduler = schedulerFor(dispatcher);

    await scheduler.scheduleFromServerExpiry("2026-12-20T12:00:00.000Z");
    await scheduler.scheduleFromServerExpiry("2026-12-15T12:00:00.000Z");

    expect(dispatcher.events.take(3).toList(),
        <String>["cancel:7", "cancel:3", "cancel:1"]);
    expect(dispatcher.events.skip(6).take(3).toList(),
        <String>["cancel:7", "cancel:3", "cancel:1"]);
    expect(dispatcher.scheduled, hasLength(3));
    expect(
      dispatcher.scheduled
          .map((call) => call.when.toUtc().toIso8601String())
          .toList(),
      <String>[
        "2026-12-08T12:00:00.000Z",
        "2026-12-12T12:00:00.000Z",
        "2026-12-14T12:00:00.000Z",
      ],
    );
  });

  test("missing or unparseable expiry cancels only and schedules nothing",
      () async {
    final dispatcher = FakeNotificationDispatcher();
    final scheduler = schedulerFor(dispatcher);

    await scheduler.scheduleFromServerExpiry(null);
    await scheduler.scheduleFromServerExpiry("not-a-date");

    expect(dispatcher.scheduled, isEmpty);
    expect(dispatcher.events, hasLength(6));
  });

  test("payload is navigation-only; no link, token or expiry leaks", () async {
    final dispatcher = FakeNotificationDispatcher();
    const expiry = "2026-12-20T12:00:00.000Z";
    await schedulerFor(dispatcher).scheduleFromServerExpiry(expiry);

    for (final call in dispatcher.scheduled) {
      expect(call.payload, expiryNavigationPayload);
      expect(call.title, expiryNotificationTitle);
      expect(call.body, expiryNotificationBody);
      expect(call.payload.contains("http"), isFalse);
      expect(call.payload.contains("token"), isFalse);
      expect(call.body.contains(expiry), isFalse);
      expect(call.body.contains("http"), isFalse);
    }
  });

  test("tap opens shop only for the navigation marker", () {
    var opened = 0;
    void openShop() => opened++;

    handleExpiryNotificationTap(openShop, expiryNavigationPayload);
    expect(opened, 1);

    for (final payload in <String?>[
      null,
      "https://dash.3set.online/shop",
      "token=abc",
      "confirmed",
    ]) {
      handleExpiryNotificationTap(openShop, payload);
    }
    expect(opened, 1);
  });
}
