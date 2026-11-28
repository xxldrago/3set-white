---
phase: 22-devices-settings-polish-5-days
reviewed: 2026-11-28T11:03:20Z
depth: standard
files_reviewed: 33
files_reviewed_list:
  - app/api/mobile/devices/route.ts
  - app/api/mobile/devices/[token]/route.ts
  - app/api/mobile/payments/create/route.ts
  - app/api/mobile/subscription/route.ts
  - mobile/lib/features/profile/devices/deferred_delete_controller.dart
  - mobile/lib/features/profile/devices/devices_providers.dart
  - mobile/lib/features/profile/devices/devices_sheet.dart
  - mobile/lib/features/profile/devices/device.dart
  - mobile/lib/features/profile/profile_sheet.dart
  - mobile/lib/features/profile/settings/kill_switch_row.dart
  - mobile/lib/features/profile/settings/referral_row.dart
  - mobile/lib/features/profile/settings/reset_row.dart
  - mobile/lib/core/settings/settings_table.dart
  - mobile/lib/core/settings/auto_connect_listener.dart
  - mobile/lib/core/settings/reset_demo.dart
  - mobile/lib/core/db/app_database.dart
  - mobile/lib/core/notifications/local_notifications.dart
  - mobile/lib/core/notifications/expiry_scheduler.dart
  - mobile/lib/core/notifications/expiry_notification_listener.dart
  - mobile/lib/main.dart
  - mobile/android/app/src/main/AndroidManifest.xml
  - mobile/ios/Runner/AppDelegate.swift
  - mobile/lib/app/theme.dart
  - mobile/lib/features/servers/widgets/main_header.dart
  - mobile/lib/core/api/endpoints.dart
  - mobile/lib/features/servers/server_pool_screen.dart
  - mobile/lib/features/shop/painting/confetti_overlay.dart
  - mobile/lib/features/shop/painting/ring_painter.dart
  - mobile/lib/features/subscription/models/subscription.dart
  - mobile/pubspec.yaml
  - tests/unit/mobile-devices-route.test.ts
  - mobile/test/unit/features/devices/deferred_delete_test.dart
  - mobile/test/unit/core/notifications/expiry_scheduler_test.dart
findings:
  critical: 1
  warning: 5
  info: 1
  total: 7
status: issues_found
---

# Phase 22: Code Review Report

**Reviewed:** 2026-11-28T11:03:20Z
**Depth:** standard
**Files Reviewed:** 33
**Status:** issues_found

## Summary

Reviewed all changed source files in `1fe9614^..755c2df` at standard depth, cross-checking the called helpers (`lib/keys-service.ts`, `lib/orders-service.ts`, `lib/subscription-view.ts`) and the Wave 0 tests. Generated `.g.dart`/`.freezed.dart` parts and `pubspec.lock` were skimmed only.

**Hard-constraint verification (all PASS):**
- No free device-add POST — `/devices` exposes only GET and DELETE; client has no add call.
- No fake restore — `DeferredDeleteController.undo()` only cancels the timer; no row reinsertion path.
- No second key issuer — upgrade posts intent only; `/payments/create` derives the owned key and calls the single `createOrder`.
- No client→ARTEMIDA — endpoints are all `/api/mobile/*`; client never sends `keyId`/amount.
- No native VPN/FSM/kill-switch change — AndroidManifest VPN service and `allowBypass` untouched; iOS OnDemand untouched; kill-switch row is read-only text.
- No FCM fake route — no `firebase_*` dependency, token, or backend route; FCM only mentioned as deferred in comments.
- No fake network toggle — `NetworkStatusRow` has no tap handler; ping invalidation stays in the existing listener.
- No simulation/load/bottom nav — none in production code (only in explanatory comments and generated files).
- No secrets/token/link in logs/bodies — targeted grep over all four routes found no logger field carrying token, link, name, email, referral code or secret.
- Deferred-delete cancel-before-provider-call — proven by `deferred_delete_test.dart` (`undo at 4s → calls empty`).
- Notification payload navigation-only — payload is the literal `shop`; `handleExpiryNotificationTap` ignores every other value (tested).

The backend routes and the ownership/zod/degradation discipline are solid. The defects found are concentrated in (a) Android notification runtime permission, which is declared but never requested, making the whole expiry-reminder feature silent on modern Android, and (b) failure/edge handling in the deferred-delete UI, the notification listener, and capacity fallback.

## Critical Issues

### CR-01: Android 13+ notification permission is declared but never requested — reminders never display

**File:** `mobile/android/app/src/main/AndroidManifest.xml:9`, `mobile/lib/core/notifications/local_notifications.dart:71-84,143-155`
**Issue:** `POST_NOTIFICATIONS` is declared in the manifest, but a repository-wide grep for `requestNotificationsPermission`, `resolvePlatformSpecificImplementation`, `requestPermission`, and `requestAuthorization` returns **zero** matches. `FlutterLocalNotificationDispatcher.initialize()` only calls `_plugin.initialize(...)`; `localNotificationsReadyProvider` calls `_initializeSafely`, which also never requests the permission. On Android 13 (API 33+) `POST_NOTIFICATIONS` is a runtime-dangerous permission: without an explicit grant, scheduled notifications are silently dropped. REQ-NOTIF-01 therefore does not function on the dominant platform even though all scheduler unit tests pass (they use a fake dispatcher and never touch the platform channel). The iOS delegate is registered (`AppDelegate.swift:15`) but no explicit authorization request exists there either; FLN's iOS `initialize` may request it implicitly, so Android is the proven failure.
**Fix:** Request the permission as part of initialization and only consider the dispatcher ready afterwards, e.g.:
```dart
@override
Future<void> initialize() async {
  final pending = _initialization;
  if (pending != null) return pending;
  return _initialization = _plugin.initialize(
    settings: const InitializationSettings(
      android: AndroidInitializationSettings("@mipmap/ic_launcher"),
      iOS: IOSInitializationSettings(),
    ),
    onDidReceiveNotificationResponse: (r) => _onTap(r.payload),
  ).then<void>((_) async {
    await _plugin
        .resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin>()
        ?.requestNotificationsPermission();
  });
}
```
Gate `apply()` in `expiry_notification_listener.dart` on that completed future (see WR-03).

## Warnings

### WR-01: Failed deferred DELETE leaves an unhandled async error, no user notice, and a permanently dimmed row

**File:** `mobile/lib/features/profile/devices/devices_sheet.dart:48-54`, `mobile/lib/features/profile/devices/deferred_delete_controller.dart:59-64`
**Issue:** `onDelete` awaits `deleteDeviceProvider(token)` and only invalidates `devicesProvider` on success. Any BFF failure (network, `rate_limited`, `internal` — all of which the route deliberately returns as HTTP 200 `{ok:false}`) throws; `ref.invalidate` is skipped and no notice is shown. The exception propagates into `DeferredDeleteController`'s `unawaited(_onDelete(...).whenComplete(...))`; `whenComplete` rethrows, so the error becomes an unhandled async exception. Visually the row stays at `opacity 0.6` with "Отключается" forever because no `setState`/invalidate follows. This is the exact scenario the stable-envelope routes are designed to produce, and the UI has no path for it.
**Fix:** Handle the failure inside the callback and refresh in `finally`:
```dart
onDelete: (token) async {
  try {
    await ref.read(deleteDeviceProvider)(token);
  } on Object {
    if (mounted) _notice(context, "Не удалось отключить устройство");
  } finally {
    if (mounted) ref.invalidate(devicesProvider);
  }
},
```
Add a widget test where `deleteDeviceProvider` throws: assert a notice is shown, the row is no longer pending, and no unhandled exception is reported.

### WR-02: Undo SnackBar is not tied to the 5-second undo window

**File:** `mobile/lib/features/profile/devices/devices_sheet.dart:76-89`, `mobile/lib/features/profile/devices/deferred_delete_controller.dart:19`
**Issue:** The controller's locked window is `const Duration(seconds: 5)` (D-06), but the SnackBar carrying the "Вернуть" action sets no `duration` (Flutter's default is 4 seconds). The user therefore loses the undo affordance a second before the timer actually fires — during 4–5s the DELETE is still cancellable but cannot be cancelled from the UI. With a longer default the inverse occurs: "Вернуть" remains tappable after the provider call and silently does nothing.
**Fix:** Bind the two explicitly:
```dart
SnackBar(
  duration: _controller.window,
  content: const Text("Устройство отключено"),
  action: SnackBarAction(label: "Вернуть", onPressed: () { ... }),
)
```

### WR-03: Expiry scheduling races plugin initialization and permanently consumes a failed attempt

**File:** `mobile/lib/core/notifications/local_notifications.dart:143-155`, `mobile/lib/core/notifications/expiry_notification_listener.dart:29-46`
**Issue:** `localNotificationsReadyProvider` fires `unawaited(_initializeSafely(...))` and returns `true` immediately; the listener's `ref.listen(..., fireImmediately: true)` can call `zonedSchedule` before `plugin.initialize()` completes, which can fail on a real platform channel. Separately, `apply()` sets `hasScheduled = true` and `lastExpiry = expiresAt` **before** the `try`, and swallows any error. A transient scheduling failure is therefore never retried for that expiry for the rest of the process lifetime — dedupe treats the failed attempt as done. The fake-dispatcher tests cannot observe either condition.
**Fix:** Await a cached initialization future before scheduling, and only record the expiry after success:
```dart
// local_notifications.dart
final localNotificationsReadyProvider = Provider<Future<void>>((ref) {
  tzdata.initializeTimeZones();
  return _initializeSafely(ref.read(localNotificationDispatcherProvider));
});

// expiry_notification_listener.dart
Future<void> apply(String? expiresAt) async {
  if (hasScheduled && expiresAt == lastExpiry) return;
  try {
    await ref.read(localNotificationsReadyProvider);
    await scheduler.scheduleFromServerExpiry(expiresAt);
    hasScheduled = true;
    lastExpiry = expiresAt;
  } on Object catch (_) {
    // leave the attempt unconsumed so a later emission can retry
  }
}
```

### WR-04: `deviceCapacity` defaults a missing `deviceLimit` to 0, showing a false "limit reached" state

**File:** `mobile/lib/features/profile/devices/devices_sheet.dart:128-132,147-160`
**Issue:** `deviceCapacity(subscriptionAsync.value?.deviceLimit ?? 0, devices.length)`. When `userSubscriptionProvider` is still loading or has errored (`ProfileSheet` renders the sheet anyway and only appends an error line at `profile_sheet.dart:76-83`), `deviceLimit` becomes `0`, so `atLimit = count >= 0` is always true. The UI then shows "Лимит устройств достигнут" and hides "Добавить это устройство" even for an account with spare capacity and zero devices. This is misleading precisely when the server-derived truth is unavailable — the opposite of the "no local counter / no fabricated capacity" rule.
**Fix:** Only compute capacity from a real value; otherwise render neither the limit claim nor the add CTA:
```dart
final limit = subscriptionAsync.value?.deviceLimit;
if (limit == null) {
  // subscription unavailable: no honest capacity claim, no add handoff
  return const SizedBox.shrink();
}
final capacity = deviceCapacity(limit, devices.length);
```

### WR-05: Reset row passes a `BuildContext` across async gaps into the navigation callback

**File:** `mobile/lib/features/profile/settings/reset_row.dart:61-82`, `mobile/lib/core/settings/reset_demo.dart:35-42`
**Issue:** `_confirmAndReset` awaits `showDialog`, checks `context.mounted`, then passes `() => ref.read(resetNavigationProvider)(context)` into `resetDemo`. `resetDemo` performs four more `await`s (token clear, two storage clears, table batch) before invoking `onNavigateToAuth()`. The captured context can be deactivated by then (sheet dismissed, route popped, app backgrounded), so `context.go('/auth')` may run on an unmounted context and throw. The check at line 79 does not cover the later async gap.
**Fix:** Navigate through a router/navigator key that does not depend on the disposed widget context, e.g. resolve the router once in the provider (`final router = ref.read(routerProvider); return () => router.go('/auth');`), or re-check `context.mounted` inside the callback before calling `go`.

## Info

### IN-01: `AppTextScalePolicy` is an effective no-op

**File:** `mobile/lib/main.dart:83-89`
**Issue:** `data: media.copyWith(textScaler: media.textScaler)` copies the exact value it just read. The wrapper is retained for testability after removing the old 0.8–1.3 clamp, but it currently adds a `MediaQuery` layer with no behavioral effect.
**Fix:** Acceptable as a documented seam, but add a comment stating it is intentionally a pass-through (so a future clamp is not reintroduced), or drop the wrapper and apply the policy where it is actually needed.

---

_Reviewed: 2026-11-28T11:03:20Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
