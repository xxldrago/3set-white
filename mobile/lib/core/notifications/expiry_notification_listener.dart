// REQ-NOTIF-01: app-level always-on listener for local expiry reminders.
//
// Mirrors paymentResumeListenerProvider: App.build watches this once, the
// subscription expiry is the only trigger, and startup work is wrapped so it
// can never break the app. A notification tap only opens /shop — never a
// payment, entitlement or key-issuing path (D-08, T-22-23).
import "dart:async";

import "package:flutter_riverpod/flutter_riverpod.dart";

import "package:mobile/core/notifications/expiry_scheduler.dart";
import "package:mobile/core/notifications/local_notifications.dart"
    show localNotificationDispatcherProvider, localNotificationsReadyProvider;
import "package:mobile/features/subscription/models/subscription.dart"
    show SubscriptionStatus;
import "package:mobile/features/subscription/providers.dart"
    show userSubscriptionProvider;

/// The single scheduler instance, built on the fakeable plugin seam.
final expirySchedulerProvider = Provider<ExpiryScheduler>(
  (ref) => ExpiryScheduler(ref.read(localNotificationDispatcherProvider)),
);

/// Watches server expiry once for the whole app lifetime.
///
/// `fireImmediately` covers an already-loaded subscription; the dedupe guard
/// makes a repeated emission of the same expiry a no-op. The listener
/// subscription is closed on dispose, matching the other app-level listeners.
final expiryNotificationListenerProvider = Provider<bool>((ref) {
  // Timezone + plugin initialization happen once at startup here.
  ref.watch(localNotificationsReadyProvider);
  final scheduler = ref.read(expirySchedulerProvider);

  String? lastExpiry;
  var hasScheduled = false;

  Future<void> apply(String? expiresAt) async {
    if (hasScheduled && expiresAt == lastExpiry) return;
    try {
      // The plugin (and the Android runtime grant) must be ready before any
      // zonedSchedule call; a platform channel that is still initializing can
      // otherwise drop the alarm silently (WR-03).
      await ref.read(localNotificationsReadyProvider);
      await scheduler.scheduleFromServerExpiry(expiresAt);
      // Only a confirmed schedule consumes the attempt. A transient failure
      // leaves the dedupe guard open so a later emission can retry.
      hasScheduled = true;
      lastExpiry = expiresAt;
    } on Object catch (_) {
      // Startup must never break, and no error text is ever logged.
    }
  }

  final subscription = ref.listen<AsyncValue<SubscriptionStatus>>(
    userSubscriptionProvider,
    (_, next) {
      if (next.hasValue) unawaited(apply(next.value?.expiresAt));
    },
    fireImmediately: true,
  );
  ref.onDispose(subscription.close);
  return true;
});
