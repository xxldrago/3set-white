// WR-03: scheduling must wait for plugin initialization, and a failed attempt
// must stay unconsumed so a later emission retries. T-7/T-3/T-1 and the
// cancel-before-reschedule contract stay owned by ExpiryScheduler (tested
// separately); this suite only proves the listener's ordering + retry guard.
import "dart:async";

import "package:flutter_riverpod/flutter_riverpod.dart";
import "package:flutter_test/flutter_test.dart";
import "package:mobile/core/notifications/expiry_notification_listener.dart"
    show expiryNotificationListenerProvider;
import "package:mobile/core/notifications/local_notifications.dart"
    show LocalNotificationDispatcher, localNotificationDispatcherProvider;
import "package:mobile/features/subscription/models/subscription.dart"
    show SubscriptionStatus;
import "package:mobile/features/subscription/providers.dart"
    show userSubscriptionProvider;
import "package:timezone/data/latest.dart" as tzdata;
import "package:timezone/timezone.dart" as tz;

/// Mutable test holder: a new expiry is published by mutating it and calling
/// `ref.invalidate(userSubscriptionProvider)`, which forces a fresh emission.
class ExpiryHolder {
  String? expiry;
}

final expiryHolderProvider = Provider<ExpiryHolder>((_) => ExpiryHolder());

/// Real (non-overridden) provider so `invalidate` reliably re-runs it and
/// publishes a fresh AsyncValue to the overridden subscription provider.
final testSubscriptionProvider = FutureProvider<SubscriptionStatus>((ref) async {
  return SubscriptionStatus(
    ok: true,
    expiresAt: ref.watch(expiryHolderProvider).expiry,
  );
});

class FakeDispatcher implements LocalNotificationDispatcher {
  FakeDispatcher({this.failFirstSchedule = false, this.gateInitialization = false});

  final bool failFirstSchedule;
  final bool gateInitialization;

  final Completer<void> initGate = Completer<void>();
  int initializeCalls = 0;
  int scheduleAttempts = 0;
  final List<String> events = <String>[];

  @override
  Future<void> initialize() async {
    initializeCalls++;
    events.add("init");
    if (gateInitialization) await initGate.future;
  }

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
  }) async {
    scheduleAttempts++;
    events.add("schedule:$id");
    if (failFirstSchedule && scheduleAttempts == 1) {
      throw StateError("transient platform failure");
    }
  }

  @override
  Future<void> cancel(int id) async {
    events.add("cancel:$id");
  }
}

Future<void> _settle() async {
  for (var i = 0; i < 40; i++) {
    await Future<void>.delayed(Duration.zero);
  }
}

ProviderContainer _container(FakeDispatcher dispatcher, ExpiryHolder holder) {
  return ProviderContainer(
    overrides: [
      localNotificationDispatcherProvider.overrideWithValue(dispatcher),
      expiryHolderProvider.overrideWithValue(holder),
      userSubscriptionProvider.overrideWith(
        (ref) => ref.watch(testSubscriptionProvider.future),
      ),
    ],
  );
}

void main() {
  setUp(tzdata.initializeTimeZones);

  test("does not schedule until plugin initialization completes", () async {
    final dispatcher = FakeDispatcher(gateInitialization: true);
    final holder = ExpiryHolder()..expiry = "2026-12-20T12:00:00.000Z";
    final container = _container(dispatcher, holder);
    addTearDown(container.dispose);

    container.read(expiryNotificationListenerProvider);
    await _settle();

    expect(dispatcher.initializeCalls, 1);
    // No cancel / schedule may touch the channel before init resolves.
    expect(dispatcher.events.where((e) => e.startsWith("cancel")), isEmpty);
    expect(dispatcher.events.where((e) => e.startsWith("schedule")), isEmpty);

    dispatcher.initGate.complete();
    await _settle();

    expect(
      dispatcher.events.where((e) => e.startsWith("schedule")).toList(),
      <String>["schedule:7", "schedule:3", "schedule:1"],
    );
  });

  test("a transient schedule failure leaves the attempt retryable", () async {
    final dispatcher = FakeDispatcher(failFirstSchedule: true);
    final holder = ExpiryHolder()..expiry = "2026-12-20T12:00:00.000Z";
    final container = _container(dispatcher, holder);
    addTearDown(container.dispose);

    container.read(expiryNotificationListenerProvider);
    await _settle();

    // First attempt failed on the first reminder: nothing was consumed.
    expect(dispatcher.scheduleAttempts, 1);

    // A later emission of a different expiry re-enters apply() and schedules
    // T-7/T-3/T-1 again, each time after cancelling the old ids.
    holder.expiry = "2026-12-25T12:00:00.000Z";
    // A second mounted consumer is what keeps the autoDispose subscription
    // alive across invalidation in a real app.
    final probe = container.listen<AsyncValue<SubscriptionStatus>>(
      userSubscriptionProvider,
      (_, __) {},
      fireImmediately: true,
    );
    addTearDown(probe.close);
    container.invalidate(testSubscriptionProvider);
    await _settle();

    // The failed attempt was NOT consumed: scheduling was retried. The extra
    // passes come from the loading emission cancelling stale reminders, which
    // is the intended T-22-21 cancel-before-reschedule behaviour.
    expect(dispatcher.scheduleAttempts, greaterThan(1));
    expect(
      dispatcher.events.where((e) => e.startsWith("cancel")).length,
      greaterThan(3),
    );
  });
}
