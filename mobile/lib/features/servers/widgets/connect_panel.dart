import "package:flutter/material.dart";

import "../../../app/theme.dart";
import "../../../core/db/app_database.dart";
import "../server.dart";

/// Prototype connect panel and «Подключить» button (D-18).
///
/// In phase 19 the button performs **server selection only**: no tunnel, no
/// `core.start`, no FSM and no simulated connection. IP, timer and traffic
/// cells render honest dashes because the VPN core arrives in phase 20.
class ConnectPanel extends StatelessWidget {
  /// Creates the connect panel.
  const ConnectPanel({
    required this.selected,
    required this.sample,
    required this.hasKey,
    required this.busy,
    required this.outcomeNotice,
    required this.onConnect,
    required this.onBuy,
    super.key,
  });

  /// Currently selected server, or `null` for auto/no selection.
  final Server? selected;

  /// Fresh ping sample of the selected server.
  final PingCacheData? sample;

  /// Whether selection is allowed (D-21 no-key gate).
  final bool hasKey;

  /// Whether a selection or refresh is in flight.
  final bool busy;

  /// Russian copy describing the last selection outcome.
  final String? outcomeNotice;

  /// Runs the selection algorithm for the active tab.
  final VoidCallback onConnect;

  /// Opens the shop stub when there is no active key.
  final VoidCallback onBuy;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      decoration: const BoxDecoration(
        color: AppTheme.bg2,
        border: Border(top: BorderSide(color: AppTheme.line)),
      ),
      padding: const EdgeInsets.fromLTRB(18, 10, 18, 14),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          _panel(theme),
          const SizedBox(height: 10),
          if (!hasKey) ...<Widget>[
            Text(
              "Нет активного ключа",
              style: theme.textTheme.bodyMedium?.copyWith(
                color: AppTheme.red,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 8),
            OutlinedButton(onPressed: onBuy, child: const Text("Купить")),
          ] else
            FilledButton(
              onPressed: busy ? null : onConnect,
              child: busy
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: AppTheme.bg,
                      ),
                    )
                  : const Text("Подключить"),
            ),
          if (outcomeNotice != null) ...<Widget>[
            const SizedBox(height: 8),
            Text(
              outcomeNotice!,
              textAlign: TextAlign.center,
              style: theme.textTheme.bodySmall?.copyWith(color: AppTheme.teal),
            ),
          ] else
            const SizedBox(height: 8),
          Text(
            "Автопинг перед подключением · быстрый путь по "
            "последним живым серверам",
            textAlign: TextAlign.center,
            style: theme.textTheme.labelSmall?.copyWith(color: AppTheme.dim),
          ),
        ],
      ),
    );
  }

  Widget _panel(ThemeData theme) => Container(
    padding: const EdgeInsets.all(12),
    decoration: BoxDecoration(
      color: AppTheme.surface,
      borderRadius: BorderRadius.circular(16),
      border: Border.all(color: AppTheme.line2),
    ),
    child: Column(
      children: <Widget>[
        Row(
          children: <Widget>[
            Expanded(
              child: _cell(
                "Сервер",
                selected == null
                    ? "Автовыбор"
                    : (selected!.city.isEmpty
                          ? selected!.name
                          : selected!.city),
                theme,
              ),
            ),
            Expanded(child: _cell("Протокол", selected?.proto ?? "—", theme)),
          ],
        ),
        const SizedBox(height: 10),
        Row(
          children: <Widget>[
            Expanded(child: _cell("IP", "—", theme)),
            Expanded(
              child: _cell(
                "Пинг",
                sample != null && sample!.online && sample!.rtt != null
                    ? "${sample!.rtt} мс"
                    : "—",
                theme,
              ),
            ),
          ],
        ),
        const SizedBox(height: 10),
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: <Widget>[
            Text(
              "—:—:—",
              style: theme.textTheme.labelMedium?.copyWith(
                fontFamily: AppTheme.fontMono,
                color: AppTheme.dim,
              ),
            ),
            Text(
              "↓ —   ↑ —",
              style: theme.textTheme.labelSmall?.copyWith(color: AppTheme.dim),
            ),
          ],
        ),
        const SizedBox(height: 4),
        Text(
          "Туннель, IP и трафик — фаза 20",
          textAlign: TextAlign.center,
          style: theme.textTheme.labelSmall?.copyWith(
            color: AppTheme.dim,
            fontSize: 9,
          ),
        ),
      ],
    ),
  );

  Widget _cell(String label, String value, ThemeData theme) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: <Widget>[
      Text(
        label,
        style: theme.textTheme.labelSmall?.copyWith(color: AppTheme.dim),
      ),
      const SizedBox(height: 2),
      Text(
        value,
        style: theme.textTheme.titleMedium?.copyWith(
          fontFamily: AppTheme.fontMono,
        ),
        overflow: TextOverflow.ellipsis,
      ),
    ],
  );
}
