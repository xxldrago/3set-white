import "package:flutter/material.dart";

import "../../../app/theme.dart";
import "../server.dart";

/// Prototype toolbar: mode description, read-only network chip and refresh.
///
/// The network chip reflects the real `connectivity_plus` result only; there
/// is deliberately no manual network toggle or simulated status (D-11/D-19).
class PoolToolbar extends StatelessWidget {
  /// Creates the toolbar.
  const PoolToolbar({
    required this.tab,
    required this.networkLabel,
    required this.refreshing,
    required this.onRefresh,
    super.key,
  });

  /// Pool whose description is shown.
  final PoolTab tab;

  /// Read-only network label («Wi-Fi», «LTE», «Нет сети»).
  final String networkLabel;

  /// Whether a full ping refresh is running.
  final bool refreshing;

  /// Starts a full ping refresh for the active tab.
  final VoidCallback onRefresh;

  /// Locked prototype copy for each pool mode.
  static const Map<PoolTab, String> descriptions = <PoolTab, String>{
    PoolTab.simple: "Полный туннель · весь трафик через сервер · "
        "WireGuard / Hysteria2 / SS",
    PoolTab.whitelist: "Reality с SNI разрешённых доменов · "
        "работает при белых списках оператора",
  };

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 10),
      child: Row(
        children: <Widget>[
          Expanded(
            child: Text(
              descriptions[tab] ?? "",
              style: theme.textTheme.bodySmall?.copyWith(
                color: AppTheme.muted,
              ),
            ),
          ),
          const SizedBox(width: 8),
          _networkChip(theme),
          IconButton(
            tooltip: "Обновить пинг",
            icon: refreshing
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.refresh),
            onPressed: refreshing ? null : onRefresh,
          ),
        ],
      ),
    );
  }

  Widget _networkChip(ThemeData theme) {
    final offline = networkLabel == "Нет сети";
    return Container(
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
            networkLabel,
            style: theme.textTheme.labelSmall?.copyWith(
              color: AppTheme.text,
            ),
          ),
        ],
      ),
    );
  }
}
