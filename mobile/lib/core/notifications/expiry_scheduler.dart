// REQ-NOTIF-01 / T-22-21: three absolute reminders from the server expiry.
//
// The only source of timing is `expiresAt` from /api/mobile/subscription. No
// client-side entitlement math, no simulated date and no payment effect. The
// OS is the only scheduler: zonedSchedule receives absolute TZDateTime
// instants, so a DST change cannot shift a reminder.
import "package:mobile/core/notifications/local_notifications.dart"
    show
        LocalNotificationDispatcher,
        expiryNavigationPayload,
        expiryNotificationBody,
        expiryNotificationTitle;
import "package:timezone/timezone.dart" as tz;

/// Offsets in days before the server expiry. Order is fixed: 7, 3, 1.
const List<int> expiryReminderOffsetDays = <int>[7, 3, 1];

/// Creates the stable id for an offset, so a reschedule cancels exactly the
/// prior reminders instead of stacking duplicates.
int expiryReminderId(int offsetDays) => offsetDays;

/// Pure scheduler over the fakeable plugin seam.
class ExpiryScheduler {
  /// Creates a scheduler over [dispatcher] with an optional clock and zone.
  ExpiryScheduler(
    this._dispatcher, {
    DateTime Function()? now,
    tz.Location? location,
  })  : _now = now ?? DateTime.now,
        _location = location ?? tz.local;

  final LocalNotificationDispatcher _dispatcher;
  final DateTime Function() _now;
  final tz.Location _location;

  /// Replaces all reminders for the given server-authoritative expiry string.
  /// A missing or unparseable expiry cancels stale reminders and schedules
  /// nothing. Past instants are skipped, never scheduled in the past.
  Future<void> scheduleFromServerExpiry(String? expiresAt) async {
    // Cancel first: a new expiry must never stack on top of older reminders
    // (T-22-21). This also clears reminders when the subscription is gone.
    for (final offsetDays in expiryReminderOffsetDays) {
      await _dispatcher.cancel(expiryReminderId(offsetDays));
    }

    final parsed = expiresAt == null ? null : DateTime.tryParse(expiresAt);
    if (parsed == null) return;
    final expiryUtc = parsed.toUtc();
    final now = tz.TZDateTime.from(_now().toUtc(), _location);

    for (final offsetDays in expiryReminderOffsetDays) {
      final when = tz.TZDateTime.from(
        expiryUtc.subtract(Duration(days: offsetDays)),
        _location,
      );
      if (when.isBefore(now)) continue;
      await _dispatcher.schedule(
        id: expiryReminderId(offsetDays),
        when: when,
        title: expiryNotificationTitle,
        body: expiryNotificationBody,
        payload: expiryNavigationPayload,
      );
    }
  }
}
