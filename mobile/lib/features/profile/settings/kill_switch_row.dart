// D-01/D-02/D-04 (REQ-SET-01): the kill switch is permanently ON.
//
// This is a plain, read-only presentation row. It has no Switch, no tap
// handler, no flag and no native VPN call. The always-on security rule lives
// in the native layer (Android `allowBypass=false`, iOS `NEOnDemandRuleConnect`)
// and phase 20's toast is deliberately untouched. The copy is frozen so every
// rebuild renders exactly the same two strings.
import "package:flutter/material.dart";

import "../../../app/theme.dart";

/// Read-only always-on kill-switch status. Never interactive.
class KillSwitchRow extends StatelessWidget {
  /// Creates the read-only status row.
  const KillSwitchRow({super.key});

  /// Frozen primary copy (D-02).
  static const String label = "Kill switch: включён";

  /// Frozen explanatory caption (D-02).
  static const String caption = "Трафик вне VPN заблокирован";

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
                Text(label, style: theme.textTheme.bodyMedium),
                const SizedBox(height: 2),
                Text(caption, style: theme.textTheme.bodySmall),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
