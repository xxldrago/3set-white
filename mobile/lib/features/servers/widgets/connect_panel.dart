import "package:flutter/material.dart";

import "../../../app/theme.dart";
import "../../../core/db/app_database.dart";
import "../../../core/vpn/connected_stats.dart";
import "../../../core/vpn/connection_state.dart";
import "../server.dart";

/// Live Connected Panel (D-13/D-16/D-17).
///
/// All six cells come from real sources: flag+city and protocol from the
/// selected server, IP from a real request through the tunnel, ping from the
/// phase-19 sample, session timer and ↓/↑ MB from the 1 Hz stats provider.
/// There is no simulation, no `load` bar, no bottom nav and no shop purchase.
class ConnectPanel extends StatelessWidget {
  /// Creates the live connect panel.
  const ConnectPanel({
    required this.selected,
    required this.sample,
    required this.hasKey,
    required this.phase,
    required this.stats,
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

  /// The single FSM phase; the panel reads it but never writes it.
  final ConnPhase phase;

  /// Live 1 Hz stats for the current session.
  final ConnectedStats stats;

  /// Optional Russian copy describing a stable FSM error.
  final String? outcomeNotice;

  /// Connect / cancel / disconnect, driven by [phase].
  final VoidCallback onConnect;

  /// Routes to the real /shop when there is no active key (D-11).
  /// Entitlement is never computed here: [hasKey] comes from the server's
  /// shared grace-aware predicate, and the /servers gate stays authoritative.
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
          _action(context, theme),
          if (outcomeNotice != null) ...<Widget>[
            const SizedBox(height: 8),
            Text(
              outcomeNotice!,
              textAlign: TextAlign.center,
              style: theme.textTheme.bodySmall?.copyWith(color: AppTheme.red),
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

  /// D-11: a connect attempt without a connectable key is refused locally as
  /// an honest UI mirror, with the locked toast and a shop destination. The
  /// server gate is unchanged and remains authoritative.
  void _noKey(BuildContext context) {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text("Нужен активный ключ")),
    );
    onBuy();
  }

  void _connect(BuildContext context) {
    if (!hasKey) {
      _noKey(context);
      return;
    }
    onConnect();
  }

  Widget _action(BuildContext context, ThemeData theme) {
    if (!hasKey) {
      return Column(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          Text(
            "Нет активного ключа",
            style: theme.textTheme.bodyMedium?.copyWith(
              color: AppTheme.red,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 8),
          OutlinedButton(
            onPressed: () => _noKey(context),
            child: const Text("Купить"),
          ),
        ],
      );
    }
    // The button copy follows the FSM exactly (D-13). Tapping during
    // «Подключение…» routes to cancel; «Отключить» routes to disconnect.
    // «Отключение…» is disabled so a second stop cannot be triggered.
    final enabled = phase != ConnPhase.disconnecting;
    return FilledButton(
      onPressed: enabled ? () => _connect(context) : null,
      child: Text(phase.buttonLabel),
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
            Expanded(child: _serverCell(theme)),
            Expanded(child: _cell("Протокол", selected?.proto ?? "—", theme)),
          ],
        ),
        const SizedBox(height: 10),
        Row(
          children: <Widget>[
            Expanded(child: _cell("IP", stats.ipLabel, theme)),
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
              stats.timerLabel,
              style: theme.textTheme.labelMedium?.copyWith(
                fontFamily: AppTheme.fontMono,
                color: phase == ConnPhase.connected
                    ? AppTheme.teal
                    : AppTheme.dim,
              ),
            ),
            Text(
              stats.trafficLabel,
              style: theme.textTheme.labelSmall?.copyWith(color: AppTheme.dim),
            ),
          ],
        ),
      ],
    ),
  );

  /// Flag and city as distinct texts so the flag glyph stays monospaced-safe.
  Widget _serverCell(ThemeData theme) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: <Widget>[
      Text(
        "Сервер",
        style: theme.textTheme.labelSmall?.copyWith(color: AppTheme.dim),
      ),
      const SizedBox(height: 2),
      Row(
        children: <Widget>[
          if (selected != null && selected!.flag.isNotEmpty)
            Text(
              selected!.flag,
              style: theme.textTheme.titleMedium?.copyWith(
                fontFamily: AppTheme.fontMono,
              ),
            ),
          if (selected != null && selected!.flag.isNotEmpty)
            const SizedBox(width: 4),
          Flexible(
            child: Text(
              selected == null
                  ? "Автовыбор"
                  : (selected!.city.isEmpty
                        ? selected!.name
                        : selected!.city),
              style: theme.textTheme.titleMedium?.copyWith(
                fontFamily: AppTheme.fontMono,
              ),
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    ],
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
