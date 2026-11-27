import "package:flutter/material.dart";

import "../../../app/theme.dart";
import "../../../core/db/app_database.dart";
import "../../../core/ping/ping_result.dart";
import "../server.dart";

/// Real ping sample rendered with the prototype `pingClass` palette.
///
/// Never shows a `load` bar (D-04) and never fabricates a sample: a missing
/// row renders the prototype wait dash «— мс».
class PingBadge extends StatelessWidget {
  /// Creates a ping badge.
  const PingBadge({required this.sample, this.compact = false, super.key});

  /// Fresh Drift row for the server, or `null` before the first probe.
  final PingCacheData? sample;

  /// Uses the smaller typography for dense rows.
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final sample = this.sample;
    if (sample == null) {
      return _value("—", AppTheme.dim, theme);
    }
    if (!sample.online || sample.rtt == null) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.end,
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          _value(AppTheme.offlineLabel, AppTheme.pingOffline, theme),
          Text(
            AppTheme.noResponseLabel,
            style: theme.textTheme.labelSmall?.copyWith(
              color: AppTheme.dim,
              fontSize: 9,
            ),
          ),
        ],
      );
    }
    final color = _color(pingClass(sample.rtt, sample.online));
    return _value("${sample.rtt}", color, theme);
  }

  Color _color(PingClass classification) => switch (classification) {
    PingClass.good => AppTheme.pingGood,
    PingClass.mid => AppTheme.pingMid,
    PingClass.warn => AppTheme.pingWarn,
    PingClass.bad => AppTheme.pingBad,
    PingClass.offline => AppTheme.pingOffline,
  };

  Widget _value(String text, Color color, ThemeData theme) => Row(
    mainAxisSize: MainAxisSize.min,
    crossAxisAlignment: CrossAxisAlignment.baseline,
    textBaseline: TextBaseline.alphabetic,
    children: <Widget>[
      Text(
        text,
        style:
            (compact
                    ? theme.textTheme.titleMedium
                    : theme.textTheme.headlineSmall)
                ?.copyWith(color: color, fontFamily: AppTheme.fontMono),
      ),
      const SizedBox(width: 2),
      Text(
        "мс",
        style: theme.textTheme.labelSmall?.copyWith(color: AppTheme.muted),
      ),
    ],
  );
}

/// One metadata-only server row from the prototype (`.srv`).
///
/// Shows flag/city/cc, the secondary host line, protocol badge, whitelist
/// SNI and the real ping. «последний» marks the newest last-good server
/// (REQ-PING-07). There is deliberately no load bar (D-04).
class ServerCard extends StatelessWidget {
  /// Creates a server card.
  const ServerCard({
    required this.server,
    required this.sample,
    required this.selected,
    required this.lastGood,
    required this.onTap,
    super.key,
  });

  /// Metadata card supplied by `GET /api/mobile/servers`.
  final Server server;

  /// Fresh ping sample, or `null` before the first probe.
  final PingCacheData? sample;

  /// Whether this server is the current manual selection.
  final bool selected;

  /// Whether this is the most recent last-good server for the tab.
  final bool lastGood;

  /// Selects this server manually (persisted per tab).
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Semantics(
      button: true,
      selected: selected,
      child: GestureDetector(
        onTap: onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 150),
          margin: const EdgeInsets.only(bottom: 10),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          decoration: BoxDecoration(
            color: selected ? AppTheme.surface3 : AppTheme.surface,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
              color: selected ? AppTheme.line2 : AppTheme.line,
            ),
          ),
          child: Row(
            children: <Widget>[
              Text(server.flag, style: const TextStyle(fontSize: 26)),
              const SizedBox(width: 12),
              Expanded(child: _details(theme)),
              const SizedBox(width: 10),
              PingBadge(sample: sample),
            ],
          ),
        ),
      ),
    );
  }

  Widget _details(ThemeData theme) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: <Widget>[
      Row(
        children: <Widget>[
          Flexible(
            child: Text(
              server.city.isEmpty ? server.name : server.city,
              style: theme.textTheme.titleLarge,
              overflow: TextOverflow.ellipsis,
            ),
          ),
          if (server.cc.isNotEmpty) ...<Widget>[
            const SizedBox(width: 6),
            Text(
              server.cc,
              style: theme.textTheme.labelSmall?.copyWith(
                fontFamily: AppTheme.fontMono,
              ),
            ),
          ],
          if (lastGood) ...<Widget>[
            const SizedBox(width: 6),
            _chip("последний", AppTheme.teal, theme),
          ],
        ],
      ),
      const SizedBox(height: 4),
      Text(
        "${server.host}:${server.port}",
        style: theme.textTheme.labelSmall?.copyWith(
          fontFamily: AppTheme.fontMono,
          color: AppTheme.dim,
        ),
        overflow: TextOverflow.ellipsis,
      ),
      const SizedBox(height: 6),
      Wrap(
        spacing: 6,
        runSpacing: 4,
        crossAxisAlignment: WrapCrossAlignment.center,
        children: <Widget>[
          _chip(server.proto, AppTheme.lime, theme),
          if (server.tab == PoolTab.whitelist &&
              server.sni != null &&
              server.sni!.isNotEmpty)
            _chip("SNI: ${server.sni}", AppTheme.blue, theme),
        ],
      ),
    ],
  );

  Widget _chip(String label, Color color, ThemeData theme) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
    decoration: BoxDecoration(
      color: color.withValues(alpha: 0.12),
      borderRadius: BorderRadius.circular(8),
      border: Border.all(color: color.withValues(alpha: 0.4)),
    ),
    child: Text(
      label,
      style: theme.textTheme.labelSmall?.copyWith(color: color),
    ),
  );
}
