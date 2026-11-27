import "package:flutter/material.dart";

import "../../../app/theme.dart";
import "../../../core/db/app_database.dart";
import "../server.dart";

import "server_card.dart";

/// Prototype «Автовыбор» card (`.auto`).
///
/// Always the first row. When a best online server is known it shows
/// «Лучший: {city} · {proto}» with the real ping; otherwise only the wait
/// dash. Selecting this card arms automatic selection (no tunnel, D-18).
class AutoSelectCard extends StatelessWidget {
  /// Creates the auto-select card.
  const AutoSelectCard({
    required this.best,
    required this.sample,
    required this.selected,
    required this.onTap,
    super.key,
  });

  /// Best online server for the active tab, or `null`.
  final Server? best;

  /// Fresh ping sample of the best server, or `null`.
  final PingCacheData? sample;

  /// Whether automatic selection is armed.
  final bool selected;

  /// Arms automatic selection.
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
              Container(
                width: 34,
                height: 34,
                decoration: BoxDecoration(
                  color: AppTheme.lime.withValues(alpha: 0.14),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Icon(
                  Icons.bolt,
                  color: AppTheme.lime,
                  size: 20,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Text(
                      "Автовыбор",
                      style: theme.textTheme.titleLarge,
                    ),
                    const SizedBox(height: 3),
                    Text(
                      best == null
                          ? "Выберу самый быстрый сервер"
                          : "Лучший: ${best!.city} · ${best!.proto}",
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: best == null ? AppTheme.muted : AppTheme.lime2,
                      ),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 10),
              PingBadge(sample: sample, compact: true),
            ],
          ),
        ),
      ),
    );
  }
}
