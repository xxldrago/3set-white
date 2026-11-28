// REQ-NOTIF-01 / D-08 / D-09: local-only expiry notifications.
//
// This file owns the single plugin initialization and a narrow, fakeable
// dispatch seam. A notification is a navigation marker and nothing else:
// no link, token, amount, entitlement or payment effect ever crosses this
// boundary (T-22-22, T-22-23). REQ-NOTIF-02 (FCM) is deferred by D-08 — there
// is no Firebase project, credential or backend token route, so no remote-push
// SDK and no fabricated token are introduced here.
import "dart:async";

import "package:flutter_local_notifications/flutter_local_notifications.dart";
import "package:flutter_riverpod/flutter_riverpod.dart";
import "package:mobile/app/router.dart" show routerProvider;
// timezone 0.11.x moved initializeTimeZones() out of the main library into
// the bundled data library; no network or platform channel is involved.
import "package:timezone/data/latest.dart" as tzdata;
import "package:timezone/timezone.dart" as tz;

/// The only payload the app ever sends or accepts: a navigation marker.
const String expiryNavigationPayload = "shop";

/// A dedicated expiry channel, separate from the VPN foreground channel
/// (`3set-vpn`) owned by VpnForegroundService.kt (T-22-24).
const String expiryChannelId = "expiry";

/// Human-readable name of the dedicated expiry channel.
const String expiryChannelName = "Напоминания";

/// Description of the dedicated expiry channel.
const String expiryChannelDescription = "Срок подписки";

// Frozen Russian copy for the permission row (REQ-NOTIF-01). No account data,
// link or token is ever interpolated into any of these strings.
/// Title of the read-only reminder-permission row.
const String notificationStatusTitle = "Уведомления о сроке подписки";
/// Status copy when the OS grant is present.
const String notificationStatusGranted = "Включены";
/// Status copy when the user denied the OS grant.
const String notificationStatusDenied =
    "Отключены — включите в настройках системы";
/// Status copy while the OS permission state is still being read.
const String notificationStatusChecking = "Проверяем доступ…";

/// Fixed notification title. No account data is interpolated (T-22-22).
const String expiryNotificationTitle = "Подписка истекает";

/// Fixed notification body. No expiry instant, link or token is included.
const String expiryNotificationBody =
    "Продлите подписку, чтобы не потерять доступ";

/// Narrow seam over the plugin so unit tests never touch a platform channel.
abstract class LocalNotificationDispatcher {
  /// Creates a dispatcher.
  const LocalNotificationDispatcher();

  /// Initializes the plugin once and registers the tap handler.
  Future<void> initialize();

  /// Requests the Android 13+ `POST_NOTIFICATIONS` runtime permission.
  ///
  /// Returns whether notifications may be posted. A `null` platform answer
  /// (iOS / unsupported Android) is normalized to `true`: it is not a denial.
  Future<bool> requestNotificationsPermission();

  /// Reads the current OS-level notification permission state for the UI row.
  Future<bool> notificationsEnabled();

  /// Schedules one absolute reminder.
  Future<void> schedule({
    required int id,
    required tz.TZDateTime when,
    required String title,
    required String body,
    required String payload,
  });

  /// Cancels one reminder id (used before every reschedule).
  Future<void> cancel(int id);
}

/// Real plugin implementation. The underlying `initialize` future is cached
/// so the plugin is prepared exactly once even if several listeners read it.
class FlutterLocalNotificationDispatcher
    implements LocalNotificationDispatcher {
  /// Creates a plugin-backed dispatcher with a tap callback.
  FlutterLocalNotificationDispatcher(this._plugin, this._onTap);

  final FlutterLocalNotificationsPlugin _plugin;
  final void Function(String? payload) _onTap;
  Future<void>? _initialization;

  @override
  Future<void> initialize() {
    final pending = _initialization;
    if (pending != null) return pending;
    return _initialization = _initializeOnce();
  }

  /// Plugin setup plus the explicit Android runtime grant. A manifest
  /// declaration alone is silently ignored on API 33+, so the reminder stream
  /// would otherwise be dropped on the dominant platform (CR-01).
  Future<void> _initializeOnce() async {
    await _plugin.initialize(
      settings: const InitializationSettings(
        android: AndroidInitializationSettings("@mipmap/ic_launcher"),
        iOS: IOSInitializationSettings(),
      ),
      onDidReceiveNotificationResponse:
          (NotificationResponse response) => _onTap(response.payload),
    );
    await requestNotificationsPermission();
  }

  @override
  Future<bool> requestNotificationsPermission() async {
    final android = _plugin.resolvePlatformSpecificImplementation<
        AndroidFlutterLocalNotificationsPlugin>();
    // FLN returns null when there is no Android implementation (iOS or an
    // unsupported platform) — that is not a denial.
    return await android?.requestNotificationsPermission() ?? true;
  }

  @override
  Future<bool> notificationsEnabled() async {
    final android = _plugin.resolvePlatformSpecificImplementation<
        AndroidFlutterLocalNotificationsPlugin>();
    return await android?.areNotificationsEnabled() ?? true;
  }

  @override
  Future<void> schedule({
    required int id,
    required tz.TZDateTime when,
    required String title,
    required String body,
    required String payload,
  }) =>
      _plugin.zonedSchedule(
        id: id,
        title: title,
        body: body,
        scheduledDate: when,
        notificationDetails: const NotificationDetails(
          android: AndroidNotificationDetails(
            expiryChannelId,
            expiryChannelName,
            channelDescription: expiryChannelDescription,
            importance: Importance.high,
            priority: Priority.high,
          ),
          iOS: DarwinNotificationDetails(),
        ),
        androidScheduleMode: AndroidScheduleMode.exactAllowWhileIdle,
        payload: payload,
      );

  @override
  Future<void> cancel(int id) => _plugin.cancel(id: id);
}

/// T-22-23: a tap is navigation-only. Any other payload — including a link,
/// token or payment marker — is ignored and can never grant an entitlement.
void handleExpiryNotificationTap(void Function() openShop, String? payload) {
  if (payload != expiryNavigationPayload) return;
  openShop();
}

/// The router seam used by the tap callback. Override in tests.
final notificationTapHandlerProvider = Provider<void Function(String?)>(
  (ref) => (payload) => handleExpiryNotificationTap(
        () => ref.read(routerProvider).go("/shop"),
        payload,
      ),
);

/// The one plugin instance, behind the fakeable seam.
final localNotificationDispatcherProvider =
    Provider<LocalNotificationDispatcher>(
  (ref) => FlutterLocalNotificationDispatcher(
    FlutterLocalNotificationsPlugin(),
    ref.read(notificationTapHandlerProvider),
  ),
);

/// Timezone database and plugin are prepared exactly once per process.
/// Startup must never break on a platform that refuses notification access.
final localNotificationsReadyProvider = Provider<bool>((ref) {
  tzdata.initializeTimeZones();
  unawaited(_initializeSafely(ref.read(localNotificationDispatcherProvider)));
  return true;
});

Future<void> _initializeSafely(LocalNotificationDispatcher dispatcher) async {
  try {
    await dispatcher.initialize();
  } on Object catch (_) {
    // Deliberately silent: no token, payload or provider text is ever logged.
  }
}

/// Current permission state for the read-only settings row. Goes through the
/// cached dispatcher seam, so no widget test ever touches a platform channel.
/// A platform that cannot answer is not reported as a denial.
final notificationPermissionStatusProvider = FutureProvider<bool>((ref) async {
  final dispatcher = ref.read(localNotificationDispatcherProvider);
  try {
    await dispatcher.initialize();
    return await dispatcher.notificationsEnabled();
  } on Object catch (_) {
    return true;
  }
});
