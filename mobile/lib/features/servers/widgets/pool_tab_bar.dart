import "package:flutter/material.dart";

import "../../../app/theme.dart";
import "../server.dart";

/// Segmented pool tabs from the prototype (`.tabs`/`.tab`).
///
/// A `Semantics.selected` flag is the Flutter equivalent of `aria-selected`.
/// Both tabs stay mounted, so switching never tears down ping or selection
/// state (D-14/D-17).
class PoolTabBar extends StatelessWidget {
  /// Creates the tab bar.
  const PoolTabBar({
    required this.selected,
    required this.onChanged,
    super.key,
  });

  /// Currently visible pool.
  final PoolTab selected;

  /// Called when the user switches pool.
  final ValueChanged<PoolTab> onChanged;

  /// Russian labels locked by D-17 and the prototype.
  static const Map<PoolTab, String> labels = <PoolTab, String>{
    PoolTab.simple: "Простой VPN",
    PoolTab.whitelist: "Обход белых списков",
  };

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(horizontal: 18),
    child: Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: AppTheme.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppTheme.line),
      ),
      child: Row(
        children: <Widget>[
          for (final tab in PoolTab.values)
            Expanded(child: _segment(context, tab)),
        ],
      ),
    ),
  );

  Widget _segment(BuildContext context, PoolTab tab) {
    final isSelected = tab == selected;
    final theme = Theme.of(context);
    final label = labels[tab] ?? tab.wireName;
    return Semantics(
      button: true,
      selected: isSelected,
      label: label,
      child: GestureDetector(
        onTap: () => onChanged(tab),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 150),
          padding: const EdgeInsets.symmetric(vertical: 10),
          decoration: BoxDecoration(
            color: isSelected ? AppTheme.surface3 : Colors.transparent,
            borderRadius: BorderRadius.circular(11),
            border: isSelected
                ? Border.all(color: AppTheme.line2)
                : Border.all(color: Colors.transparent),
          ),
          child: Center(
            child: Text(
              label,
              textAlign: TextAlign.center,
              style: theme.textTheme.titleMedium?.copyWith(
                color: isSelected ? AppTheme.lime2 : AppTheme.muted,
              ),
            ),
          ),
        ),
      ),
    );
  }
}
