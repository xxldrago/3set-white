// REQ-SET-04 / T-22-17: local-only Reset Demo action (plan 22-02 seam).
//
// The row confirms, then calls the LOCAL reset function with an injected
// navigation callback. It never issues a server request, clears a provider
// device/key or calls ARTEMIDA. Both the reset call and the navigation are
// provider seams so tests can observe zero outbound effects.
import "dart:async";

import "package:flutter/material.dart";
import "package:flutter_riverpod/flutter_riverpod.dart";

import "../../../app/router.dart" show routerProvider;
import "../../../core/settings/reset_demo.dart" show resetDemo;
import "../../../app/theme.dart";

/// Local reset call with an injected /auth navigation callback.
typedef ResetDemoCall = Future<void> Function(void Function() onNavigateToAuth);

/// Navigation seam; production returns to the auth route.
///
/// Deliberately context-free: `resetDemo` clears storage and tables across
/// several awaits, so a captured widget `BuildContext` could be deactivated
/// before navigation (WR-05).
typedef ResetNavigation = void Function();

/// Default: the real plan-02 local-only reset, closing over this provider ref.
final resetDemoCallProvider = Provider<ResetDemoCall>((ref) {
  return (onNavigateToAuth) =>
      resetDemo(ref, onNavigateToAuth: onNavigateToAuth);
});

/// Default auth navigation for the reset row: resolve the router eagerly so
/// navigation outlives the sheet that initiated the reset.
final resetNavigationProvider = Provider<ResetNavigation>((ref) {
  final router = ref.read(routerProvider);
  return () => router.go("/auth");
});

/// Confirm-then-reset row. No server, key or provider operation.
class ResetRow extends ConsumerWidget {
  /// Creates the reset row.
  const ResetRow({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    return Semantics(
      button: true,
      label: "Сбросить демо-данные",
      child: InkWell(
        onTap: () => unawaited(_confirmAndReset(context, ref)),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 8),
          child: Row(
            children: <Widget>[
              const Icon(Icons.restart_alt, color: AppTheme.amber, size: 18),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  "Сбросить демо-данные",
                  style: theme.textTheme.bodyMedium,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _confirmAndReset(BuildContext context, WidgetRef ref) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text("Сбросить демо-данные?"),
        content: const Text("Все локальные данные будут удалены."),
        actions: <Widget>[
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text("Отмена"),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text("Сбросить"),
          ),
        ],
      ),
    );
    if (confirmed != true || !context.mounted) return;
    // Resolve the router-backed seam before any await — no BuildContext is
    // carried into resetDemo's token/storage/table clears.
    final navigate = ref.read(resetNavigationProvider);
    await ref.read(resetDemoCallProvider)(navigate);
  }
}
