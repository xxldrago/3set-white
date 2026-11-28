// UI priority 3: the missing logout affordance.
//
// The row confirms in Russian, then calls ONLY the existing auth notifier's
// logout() through an injectable seam and navigates through a router-backed
// seam that does not capture a BuildContext across the await. It never clears
// a provider device/key, never calls ARTEMIDA and never revokes a server
// session — logout is local token cleanup, exactly as authNotifier.logout()
// defines it.
import "dart:async";

import "package:flutter/material.dart";
import "package:flutter_riverpod/flutter_riverpod.dart";

import "../../../app/router.dart" show routerProvider;
import "../../../app/theme.dart";
import "../../../core/auth/auth_notifier.dart" show authNotifierProvider;

/// Injectable logout call; production delegates to the existing notifier.
typedef LogoutCall = Future<void> Function();

final logoutCallProvider = Provider<LogoutCall>((ref) {
  return () => ref.read(authNotifierProvider.notifier).logout();
});

/// Navigation seam without a BuildContext: the router is resolved eagerly so
/// a dismissed sheet cannot strand navigation after the async logout (WR-05).
typedef AuthNavigation = void Function();

final logoutNavigationProvider = Provider<AuthNavigation>((ref) {
  final router = ref.read(routerProvider);
  return () => router.go("/auth");
});

/// Danger-styled, confirm-then-call logout row.
class LogoutRow extends ConsumerWidget {
  /// Creates the logout row.
  const LogoutRow({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    return Semantics(
      button: true,
      label: "Выйти из аккаунта",
      child: InkWell(
        onTap: () => unawaited(_confirmAndLogout(context, ref)),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 8),
          child: Row(
            children: <Widget>[
              const Icon(Icons.logout, color: AppTheme.red, size: 18),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  "Выйти из аккаунта",
                  style:
                      theme.textTheme.bodyMedium?.copyWith(color: AppTheme.red),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _confirmAndLogout(BuildContext context, WidgetRef ref) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text("Выйти из аккаунта?"),
        content: const Text("Токены доступа будут удалены с устройства."),
        actions: <Widget>[
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text("Отмена"),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: AppTheme.red),
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text("Выйти"),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    // Resolve the router seam before the await — no context crosses the gap.
    final navigate = ref.read(logoutNavigationProvider);
    await ref.read(logoutCallProvider)();
    navigate();
  }
}
