// Real dark profile sheet (phase 22-01/22-03, D-01/D-04/D-16).
//
// Identity comes from the already-fetched `userSubscriptionProvider`; devices
// come from the ownership-scoped `GET /api/mobile/devices`. The kill switch is a
// READ-ONLY status row (D-01/D-02): no Switch, no flag, no navigation. This
// sheet never touches native VPN code, the FSM or the connection toast.
import "package:flutter/material.dart";
import "package:flutter_riverpod/flutter_riverpod.dart";

import "../../app/theme.dart";
import "../subscription/models/subscription.dart";
import "../subscription/providers.dart"
    show subscriptionNotice, userSubscriptionProvider;
import "devices/devices_sheet.dart" show DevicesSheet;
import "settings/kill_switch_row.dart" show KillSwitchRow;

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
      child: Padding(
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
