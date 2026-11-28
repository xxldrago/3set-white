// Real dark profile sheet (phase 22-01 tracer slice, D-01/D-04/D-16).
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
import "devices/device.dart";
import "devices/devices_providers.dart" show devicesProvider;

class ProfileSheet extends ConsumerWidget {
  const ProfileSheet({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final subscription = ref.watch(userSubscriptionProvider);
    final devices = ref.watch(devicesProvider);

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
            const _KillSwitchStatus(),
            const SizedBox(height: 16),
            Text("Устройства", style: theme.textTheme.titleMedium),
            const SizedBox(height: 8),
            _DevicesSection(state: devices),
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
    // No invented email: use the real email local part, then a neutral label.
    final email = user?.email;
    final localPart = email != null && email.contains("@")
        ? email.split("@").first
        : email;
    final name = (localPart != null && localPart.isNotEmpty)
        ? localPart
        : "Пользователь";
    final method = user?.telegramId != null ? "Telegram" : "Email";

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

/// Read-only copy only — D-01 kill switch is always on and D-04 forbids any
/// native toggle or hidden flag. This is a plain Row, not a ListTile/button.
class _KillSwitchStatus extends StatelessWidget {
  const _KillSwitchStatus();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: AppTheme.surface2,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppTheme.line),
      ),
      child: Row(
        children: <Widget>[
          const Icon(Icons.shield_outlined, color: AppTheme.lime, size: 20),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text("Kill switch: включён", style: theme.textTheme.bodyMedium),
                const SizedBox(height: 2),
                Text(
                  "Трафик вне VPN заблокирован",
                  style: theme.textTheme.bodySmall,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _DevicesSection extends StatelessWidget {
  const _DevicesSection({required this.state});

  final AsyncValue<List<Device>> state;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    // No load indicator and no simulated row: while the BFF request is in
    // flight the section is simply empty.
    if (state.isLoading) return const SizedBox.shrink();
    if (state.hasError) {
      return Text(
        subscriptionNotice(state.error),
        style: theme.textTheme.bodySmall?.copyWith(color: AppTheme.red),
      );
    }
    final devices = state.value ?? const <Device>[];
    if (devices.isEmpty) {
      return Text("Нет устройств", style: theme.textTheme.bodyMedium);
    }
    return Column(
      children: <Widget>[
        for (final device in devices)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Row(
              children: <Widget>[
                const Icon(Icons.devices_other_outlined,
                    color: AppTheme.lime, size: 18),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    deviceDisplayName(device),
                    style: theme.textTheme.bodyMedium,
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }
}
