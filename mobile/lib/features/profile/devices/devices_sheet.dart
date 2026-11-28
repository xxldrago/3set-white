// Device rows, honest add handoff and paid capacity growth (D-05/D-06,
// T-22-03/04). No write route for adding a device, no local counter and no
// simulation: the subscription link is copied through the existing clipboard
// seam and growth goes through the single paid payment flow.
import "dart:async";

import "package:flutter/material.dart";
import "package:flutter_riverpod/flutter_riverpod.dart";

import "../../../app/theme.dart";
import "../../../core/payment/payment_flow.dart" show PaymentRequest;
import "../../shop/shop_screen.dart"
    show linkCopierProvider, paymentFlowStarterProvider;
import "../../subscription/providers.dart"
    show subscriptionNotice, userSubscriptionProvider;
import "device.dart";
import "deferred_delete_controller.dart";
import "devices_providers.dart";

/// Integer-only capacity decision from server values. No rounding, no
/// percentage and no locally maintained count anywhere in this widget.
class DeviceCapacity {
  const DeviceCapacity({required this.atLimit, required this.canAdd});

  final bool atLimit;
  final bool canAdd;
}

DeviceCapacity deviceCapacity(int deviceLimit, int deviceCount) {
  final limit = deviceLimit < 0 ? 0 : deviceLimit;
  final count = deviceCount < 0 ? 0 : deviceCount;
  return DeviceCapacity(atLimit: count >= limit, canAdd: count < limit);
}

class DevicesSheet extends ConsumerStatefulWidget {
  const DevicesSheet({super.key});

  @override
  ConsumerState<DevicesSheet> createState() => _DevicesSheetState();
}

class _DevicesSheetState extends ConsumerState<DevicesSheet> {
  late final DeferredDeleteController _controller;

  @override
  void initState() {
    super.initState();
    _controller = DeferredDeleteController(
      onDelete: (token) async {
        // Only a fired timer reaches here. A completed delete is followed by a
        // fresh READ; no row is ever reinserted locally. A BFF failure is
        // handled here so it cannot become an unhandled async error: show one
        // stable notice, then refresh in `finally` so the row cannot stay
        // dimmed/pending forever (WR-01).
        try {
          await ref.read(deleteDeviceProvider)(token);
        } on Object {
          if (mounted) _notice(context, deviceDeleteFailedNotice);
        } finally {
          if (mounted) {
            ref.invalidate(devicesProvider);
            setState(() {});
          }
        }
      },
      // Past-tense copy is only honest after the BFF confirms the delete;
      // until then every surface reads «Отключение…» (WR-02).
      onDeleteCompleted: () {
        if (mounted) _notice(context, "Устройство отключено");
      },
    );
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _notice(BuildContext context, String text) {
    // A stale undo snackbar must never queue a newer outcome behind it.
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(text)));
  }

  void _remove(BuildContext context, String token) {
    if (!_controller.remove(token)) {
      // Repeated tap / double tick / concurrent second delete: one stable
      // Russian notice, zero extra provider calls, no fabricated row.
      _notice(context, deviceAlreadyPendingNotice);
      return;
    }
    setState(() {});
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          // Mirrors the controller's locked window exactly: the undo action
          // cannot vanish a second before the DELETE becomes irreversible.
          duration: _controller.window,
          content: const Text("Отключение…"),
          action: SnackBarAction(
            label: "Вернуть",
            onPressed: () {
              _controller.undo();
              if (mounted) setState(() {});
            },
          ),
        ),
      );
  }

  Future<void> _copyLink(BuildContext context) async {
    final link = ref.read(userSubscriptionProvider).value?.link;
    if (link == null || link.isEmpty) return;
    // Same injectable clipboard seam and frozen toast as the Shop screen.
    await ref.read(linkCopierProvider)(link);
    if (!context.mounted) return;
    _notice(context, "Ссылка скопирована");
  }

  Future<void> _upgrade(BuildContext context) async {
    try {
      // Intent only: no keyId, no amount and no locally computed capacity.
      // The server derives the owned key and quotes the price.
      await ref.read(paymentFlowStarterProvider)(
        context,
        const PaymentRequest(kind: "upgrade", addDevices: 1),
      );
    } on Object catch (error) {
      if (context.mounted) _notice(context, subscriptionNotice(error));
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final devicesAsync = ref.watch(devicesProvider);
    final subscriptionAsync = ref.watch(userSubscriptionProvider);

    if (devicesAsync.isLoading) return const SizedBox.shrink();
    if (devicesAsync.hasError) {
      return Text(
        subscriptionNotice(devicesAsync.error),
        style: theme.textTheme.bodySmall?.copyWith(color: AppTheme.red),
      );
    }

    final devices = devicesAsync.value ?? const <Device>[];
    final capacity = deviceCapacity(
      subscriptionAsync.value?.deviceLimit ?? 0,
      devices.length,
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        if (devices.isEmpty)
          Text("Нет устройств", style: theme.textTheme.bodyMedium)
        else
          for (final device in devices)
            _DeviceRow(
              device: device,
              pending: _controller.isPending(device.token),
              onRemove: () => _remove(context, device.token),
            ),
        const SizedBox(height: 12),
        if (capacity.canAdd)
          OutlinedButton.icon(
            onPressed: () => unawaited(_copyLink(context)),
            icon: const Icon(Icons.link),
            label: const Text("Добавить это устройство"),
          ),
        if (capacity.atLimit)
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text(
              "Лимит устройств достигнут",
              style: theme.textTheme.bodySmall?.copyWith(color: AppTheme.muted),
            ),
          ),
        const SizedBox(height: 4),
        FilledButton.icon(
          onPressed: () => unawaited(_upgrade(context)),
          icon: const Icon(Icons.upgrade),
          label: const Text("Увеличить лимит"),
        ),
      ],
    );
  }
}

class _DeviceRow extends StatelessWidget {
  const _DeviceRow({
    required this.device,
    required this.pending,
    required this.onRemove,
  });

  final Device device;
  final bool pending;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final name = deviceDisplayName(device);
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Opacity(
        opacity: pending ? 0.6 : 1,
        child: Row(
          children: <Widget>[
            const Icon(Icons.devices_other_outlined,
                color: AppTheme.lime, size: 18),
            const SizedBox(width: 12),
            Expanded(
              child: Text(name, style: theme.textTheme.bodyMedium),
            ),
            if (pending)
              Text("Отключение…", style: theme.textTheme.bodySmall)
            else
              Semantics(
                button: true,
                label: "Отключить $name",
                child: IconButton(
                  tooltip: "Отключить",
                  icon: const Icon(Icons.close, size: 18),
                  onPressed: onRemove,
                ),
              ),
          ],
        ),
      ),
    );
  }
}
