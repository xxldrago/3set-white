// Real dark profile sheet (phase 22-01/22-03, D-01/D-04/D-16).
//
// Identity comes from the already-fetched `userSubscriptionProvider`; devices
// come from the ownership-scoped `GET /api/mobile/devices`. The kill switch is a
// READ-ONLY status row (D-01/D-02): no Switch, no flag, no navigation. This
// sheet never touches native VPN code, the FSM or the connection toast.
import "dart:async";

import "package:flutter/material.dart";
import "package:flutter_riverpod/flutter_riverpod.dart";

import "../../app/theme.dart";
import "../../core/notifications/local_notifications.dart"
    show
        localNotificationDispatcherProvider,
        notificationPermissionStatusProvider,
        notificationStatusChecking,
        notificationStatusDenied,
        notificationStatusGranted,
        notificationStatusTitle;
import "../../core/settings/auto_connect_listener.dart"
    show autoConnectStoreProvider;
import "../subscription/models/subscription.dart";
import "../subscription/providers.dart"
    show subscriptionNotice, userSubscriptionProvider;
import "../servers/server_pool_screen.dart" show networkLabelProvider;
import "devices/devices_sheet.dart" show DevicesSheet;
import "settings/kill_switch_row.dart" show KillSwitchRow;
import "settings/referral_row.dart" show ReferralRow;
import "settings/reset_row.dart" show ResetRow;

/// Deterministic display-name chain from REAL server fields only.
///
/// No email is invented: a missing name falls back to username, then to the
/// email local part, then to a neutral label. Pure so it is directly testable.
String profileDisplayName(SubscriptionUser? user) {
  final first = user?.firstName?.trim();
  if (first != null && first.isNotEmpty) return first;
  final username = user?.username?.trim();
  if (username != null && username.isNotEmpty) return username;
  final email = user?.email;
  if (email != null && email.isNotEmpty) {
    final localPart = email.split("@").first.trim();
    if (localPart.isNotEmpty) return localPart;
  }
  return "Пользователь";
}

/// Auth-method pill derived from the real identity block, never from a flag.
String profileAuthMethod(SubscriptionUser? user) =>
    user?.telegramId != null ? "Telegram" : "Email";

class ProfileSheet extends ConsumerWidget {
  const ProfileSheet({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final subscription = ref.watch(userSubscriptionProvider);

    return SafeArea(
      // The sheet can grow past the viewport once settings rows are present;
      // scrolling keeps every honest row reachable without a bottom nav.
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Text("Профиль", style: theme.textTheme.headlineSmall),
            const SizedBox(height: 16),
            _Identity(user: subscription.value?.user),
            const SizedBox(height: 12),
            const KillSwitchRow(),
            const SizedBox(height: 16),
            Text("Устройства", style: theme.textTheme.titleMedium),
            const SizedBox(height: 8),
            const DevicesSheet(),
            const SizedBox(height: 16),
            Text("Настройки", style: theme.textTheme.titleMedium),
            const SizedBox(height: 8),
            const AutoConnectRow(),
            ReferralRow(
              referralCode: subscription.value?.user?.referralCode,
              subscriptionLink: subscription.value?.link,
            ),
            const NotificationStatusRow(),
            const NetworkStatusRow(),
            const ResetRow(),
            if (subscription.hasError)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text(
                  subscriptionNotice(subscription.error),
                  style: theme.textTheme.bodySmall?.copyWith(color: AppTheme.red),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// Persisted auto-connect writer for REQ-SET-02.
///
/// The switch is read-only until the singleton settings row has been read, so
/// it can never overwrite a stored `true` with its default `false` on load.
/// Each user toggle issues exactly one `setAutoConnect` call through the store
/// seam; no FSM, native VPN or reconnect code is touched from this widget.
class AutoConnectRow extends ConsumerStatefulWidget {
  /// Creates the auto-connect preference row.
  const AutoConnectRow({super.key});

  @override
  ConsumerState<AutoConnectRow> createState() => _AutoConnectRowState();
}

class _AutoConnectRowState extends ConsumerState<AutoConnectRow> {
  bool _value = false;
  bool _loaded = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    bool stored;
    try {
      stored = await ref.read(autoConnectStoreProvider).readAutoConnect();
    } on Object {
      // A local storage failure must not break the sheet; leave the switch
      // read-only instead of presenting an unpersisted preference.
      return;
    }
    if (!mounted) return;
    setState(() {
      _value = stored;
      _loaded = true;
    });
  }

  Future<void> _write(bool value) async {
    setState(() => _value = value);
    try {
      await ref.read(autoConnectStoreProvider).setAutoConnect(value);
    } on Object {
      if (!mounted) return;
      setState(() => _value = !value);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Semantics(
      label: "Автоподключение",
      child: SwitchListTile(
        value: _value,
        // Read-only until the persisted value is known: no optimistic write.
        onChanged: _loaded ? _write : null,
        secondary: const Icon(Icons.auto_mode, color: AppTheme.lime, size: 18),
        title: Text("Автоподключение", style: theme.textTheme.bodyMedium),
        subtitle: Text("Подключаться при запуске",
            style: theme.textTheme.bodySmall),
      ),
    );
  }
}

/// Read-only expiry-reminder permission row (REQ-NOTIF-01, CR-01).
///
/// The OS grant is requested once at plugin init; this row never invents a
/// permission value and never enables notifications by itself. A denial is
/// surfaced in stable Russian copy with an explicit re-request affordance.
class NotificationStatusRow extends ConsumerWidget {
  /// Creates the permission status row.
  const NotificationStatusRow({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final status = ref.watch(notificationPermissionStatusProvider);
    final granted = status.value;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: <Widget>[
          const Icon(Icons.notifications_none, color: AppTheme.lime, size: 18),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(notificationStatusTitle,
                    style: theme.textTheme.bodyMedium),
                const SizedBox(height: 2),
                Text(
                  granted == null
                      ? notificationStatusChecking
                      : (granted ? notificationStatusGranted : notificationStatusDenied),
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: granted == false ? AppTheme.red : AppTheme.dim,
                  ),
                ),
              ],
            ),
          ),
          if (granted == false)
            TextButton(
              onPressed: () => unawaited(_requestAgain(ref)),
              child: const Text("Разрешить"),
            ),
        ],
      ),
    );
  }

  Future<void> _requestAgain(WidgetRef ref) async {
    await ref.read(localNotificationDispatcherProvider)
        .requestNotificationsPermission();
    ref.invalidate(notificationPermissionStatusProvider);
  }
}

/// Read-only network chip for the settings section (D-07 / D-11).
///
/// The label comes from the real `connectivity_plus` stream via
/// `networkLabelProvider`; there is NO tap handler, no WiFi/LTE switch and no
/// toast on tap. Cache invalidation stays owned by the existing
/// `networkPingInvalidationProvider` listener in `main.dart`.
class NetworkStatusRow extends ConsumerWidget {
  /// Creates the read-only network chip row.
  const NetworkStatusRow({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final label = ref.watch(networkLabelProvider).value ?? "Онлайн";
    final offline = label == "Нет сети";
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: <Widget>[
          Text("Сеть", style: theme.textTheme.bodyMedium),
          const SizedBox(width: 12),
          Semantics(
            label: "Сеть: $label",
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                color: AppTheme.surface2,
                borderRadius: BorderRadius.circular(999),
                border: Border.all(color: AppTheme.line),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: <Widget>[
                  Icon(
                    offline ? Icons.wifi_off : Icons.wifi,
                    size: 14,
                    color: offline ? AppTheme.red : AppTheme.teal,
                  ),
                  const SizedBox(width: 5),
                  Text(
                    label,
                    style: theme.textTheme.labelSmall
                        ?.copyWith(color: AppTheme.text),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Identity extends StatelessWidget {
  const _Identity({required this.user});

  final SubscriptionUser? user;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final name = profileDisplayName(user);
    final method = profileAuthMethod(user);

    return Row(
      children: <Widget>[
        CircleAvatar(
          radius: 24,
          backgroundColor: AppTheme.surface3,
          child: Text(
            name.substring(0, 1).toUpperCase(),
            style: theme.textTheme.titleLarge?.copyWith(color: AppTheme.lime2),
          ),
        ),
        const SizedBox(width: 14),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Text(name, style: theme.textTheme.titleMedium),
              const SizedBox(height: 2),
              Text(method, style: theme.textTheme.bodySmall),
            ],
          ),
        ),
      ],
    );
  }
}
