import "package:flutter/material.dart";

import "../../../app/theme.dart";

/// Inline banner for a key gate (D-21) or a retryable provider error (D-22).
///
/// The shop action is a phase-19 stub; the real purchase flow lands in phase
/// 21. No raw provider text or secret is ever rendered here.
class NoKeyBanner extends StatelessWidget {
  /// Creates the banner.
  const NoKeyBanner({
    required this.message,
    required this.actionLabel,
    required this.onAction,
    this.isError = false,
    super.key,
  });

  /// Russian copy shown to the user.
  final String message;

  /// Label of the single banner action («Купить» or «Повторить»).
  final String actionLabel;

  /// Callback for the banner action.
  final VoidCallback onAction;

  /// Uses the red accent for a provider/network error.
  final bool isError;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final accent = isError ? AppTheme.red : AppTheme.amber;
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 18),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: isError ? AppTheme.surface3 : AppTheme.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: accent.withValues(alpha: 0.5)),
      ),
      child: Row(
        children: <Widget>[
          Icon(
            isError ? Icons.wifi_off : Icons.vpn_key_off_outlined,
            color: accent,
            size: 20,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              message,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: AppTheme.text,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          TextButton(onPressed: onAction, child: Text(actionLabel)),
        ],
      ),
    );
  }
}
