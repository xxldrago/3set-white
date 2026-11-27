import "package:flutter/material.dart";
import "package:flutter_riverpod/flutter_riverpod.dart";

import "../../app/theme.dart";

/// Placeholder destination for the prototype's «Купить» action.
///
/// The real shop and purchase flow ship in phase 21. This screen performs no
/// purchase, starts no payment and has no simulated state (D-15/D-19).
class ShopScreen extends ConsumerWidget {
  /// Creates the phase-21 shop stub.
  const ShopScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);

    return Scaffold(
      backgroundColor: AppTheme.bg,
      appBar: AppBar(
        title: const Text("Магазин"),
        centerTitle: true,
      ),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              const Icon(
                Icons.shopping_bag_outlined,
                size: 56,
                color: AppTheme.teal,
              ),
              const SizedBox(height: 16),
              Text(
                "Купить",
                style: theme.textTheme.headlineMedium?.copyWith(
                  color: AppTheme.text,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 12),
              Text(
                "Магазин ключей появится в фазе 21. "
                "Это заглушка — покупка не выполняется.",
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: AppTheme.muted,
                ),
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
