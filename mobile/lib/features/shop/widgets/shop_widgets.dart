// Presentation-only leaves of the real Shop Screen (D-16).
//
// Every leaf is constructor-injected: it receives already-decided server values
// and callbacks, reads no provider and owns no price/entitlement authority.
// Russian copy is frozen here; no provider text or secret is rendered.
import "dart:math" as math;

import "package:flutter/material.dart";

import "../../../app/theme.dart";

/// One server-quoted term card. The «Хит» badge is keyed off the server's
/// 30-day term, never off a hardcoded price table.
class ShopTermCard extends StatelessWidget {
  /// Creates a term card.
  const ShopTermCard({
    required this.label,
    required this.perDayPerDevice,
    required this.amountRub,
    required this.selected,
    required this.onTap,
    this.isHit = false,
    super.key,
  });

  /// Server-derived duration label («1 месяц», …).
  final String label;

  /// Presentation-only per-day-per-device estimate.
  final String perDayPerDevice;

  /// Integer RUB amount quoted by the server for this term.
  final int amountRub;

  /// Whether this term is the current selection.
  final bool selected;

  /// Called when the term is tapped.
  final VoidCallback onTap;

  /// Shows the prototype's «Хит» badge only on the 1-month term.
  final bool isHit;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Semantics(
      button: true,
      selected: selected,
      label: "$label, $amountRub рублей",
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
          decoration: BoxDecoration(
            color: selected ? AppTheme.surface3 : AppTheme.surface2,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: selected ? AppTheme.lime : AppTheme.line,
              width: selected ? 2 : 1,
            ),
          ),
          child: Row(
            children: <Widget>[
              Icon(
                selected
                    ? Icons.check_circle
                    : Icons.radio_button_unchecked,
                color: selected ? AppTheme.lime : AppTheme.dim,
                size: 20,
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Row(
                      children: <Widget>[
                        Flexible(
                          child: Text(
                            label,
                            style: theme.textTheme.titleMedium?.copyWith(
                              color: AppTheme.text,
                            ),
                          ),
                        ),
                        if (isHit)
                          Container(
                            margin: const EdgeInsets.only(left: 6),
                            padding: const EdgeInsets.symmetric(
                              horizontal: 7,
                              vertical: 2,
                            ),
                            decoration: BoxDecoration(
                              color: AppTheme.lime,
                              borderRadius: BorderRadius.circular(999),
                            ),
                            child: Text(
                              "Хит",
                              style: theme.textTheme.labelSmall?.copyWith(
                                color: AppTheme.bg,
                              ),
                            ),
                          ),
                      ],
                    ),
                    const SizedBox(height: 2),
                    Text(
                      perDayPerDevice,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: AppTheme.muted,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Text(
                _money(amountRub),
                style: theme.textTheme.titleLarge?.copyWith(
                  color: AppTheme.lime2,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// 2..10 device stepper with the prototype's ten dots.
class DeviceStepper extends StatelessWidget {
  /// Creates the stepper.
  const DeviceStepper({
    required this.devices,
    required this.onDecrement,
    required this.onIncrement,
    super.key,
  });

  /// Current device count, always clamped by the caller to 2..10.
  final int devices;

  /// Decrements the count; never called below 2.
  final VoidCallback onDecrement;

  /// Increments the count; never called above 10.
  final VoidCallback onIncrement;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final count = devices < 2 ? 2 : (devices > 10 ? 10 : devices);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Text(
          "Устройства",
          style: theme.textTheme.titleSmall,
        ),
        const SizedBox(height: 8),
        Row(
          children: <Widget>[
            Semantics(
              button: true,
              label: "Меньше устройств",
              child: IconButton(
                tooltip: "Меньше устройств",
                icon: const Icon(Icons.remove_circle_outline),
                onPressed: count <= 2 ? null : onDecrement,
              ),
            ),
            Container(
              width: 46,
              alignment: Alignment.center,
              child: Text(
                "$count",
                style: theme.textTheme.displaySmall?.copyWith(
                  color: AppTheme.text,
                ),
              ),
            ),
            Semantics(
              button: true,
              label: "Больше устройств",
              child: IconButton(
                tooltip: "Больше устройств",
                icon: const Icon(Icons.add_circle_outline),
                onPressed: count >= 10 ? null : onIncrement,
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Semantics(
                label: "$count из 10 устройств",
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: List<Widget>.generate(10, (index) {
                    final on = index < count;
                    return Container(
                      key: ValueKey<int>(index),
                      width: 7,
                      height: 7,
                      margin: const EdgeInsets.only(left: 3),
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: on ? AppTheme.lime : AppTheme.surface3,
                      ),
                    );
                  }),
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 6),
        Text(
          "Все устройства работают одновременно, трафик без ограничений.",
          style: theme.textTheme.bodySmall?.copyWith(color: AppTheme.dim),
        ),
      ],
    );
  }
}

/// Promo input with a stable domain error and a shake on invalid input.
///
/// This leaf owns only its local shake animation. The code and the decision
/// come from the server preview; no discount table exists here (D-08).
class PromoField extends StatefulWidget {
  /// Creates the promo field.
  const PromoField({
    required this.controller,
    required this.onApply,
    this.errorText,
    this.successText,
    this.shake = false,
    super.key,
  });

  /// Text controller owned by the screen so the code persists across rebuilds.
  final TextEditingController controller;

  /// Applies the entered code (screen sends it to the preview provider).
  final VoidCallback onApply;

  /// Stable Russian error copy, or null when there is no error.
  final String? errorText;

  /// Stable Russian success copy, or null when no discount is active.
  final String? successText;

  /// Rising edge triggers the shake animation.
  final bool shake;

  @override
  State<PromoField> createState() => _PromoFieldState();
}

class _PromoFieldState extends State<PromoField>
    with SingleTickerProviderStateMixin {
  late final AnimationController _shake;

  @override
  void initState() {
    super.initState();
    _shake = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 450),
    );
  }

  @override
  void didUpdateWidget(covariant PromoField oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.shake && !oldWidget.shake && mounted) {
      _shake.forward(from: 0);
    }
  }

  @override
  void dispose() {
    _shake.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final message = widget.errorText ?? widget.successText;
    final isError = widget.errorText != null;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Text("Промокод", style: theme.textTheme.titleSmall),
        const SizedBox(height: 8),
        AnimatedBuilder(
          animation: _shake,
          builder: (context, child) {
            final offset =
                math.sin(_shake.value * math.pi * 6) * 8 * (1 - _shake.value);
            return Transform.translate(
              offset: Offset(offset, 0),
              child: child,
            );
          },
          child: Row(
            children: <Widget>[
              Expanded(
                child: TextField(
                  controller: widget.controller,
                  textCapitalization: TextCapitalization.characters,
                  decoration: const InputDecoration(
                    hintText: "Например, LIME15",
                  ),
                  onSubmitted: (_) => widget.onApply(),
                ),
              ),
              const SizedBox(width: 8),
              FilledButton(
                onPressed: widget.onApply,
                style: FilledButton.styleFrom(
                  minimumSize: const Size(110, 46),
                ),
                child: const Text("Применить"),
              ),
            ],
          ),
        ),
        if (message != null)
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Text(
              message,
              style: theme.textTheme.bodySmall?.copyWith(
                color: isError ? AppTheme.red : AppTheme.lime,
              ),
            ),
          ),
      ],
    );
  }
}

/// Persisted UI-only payment chip selection (REQ-SHOP-04).
///
/// These are presentation labels only. Platega's numeric codes do not
/// distinguish МИР/VISA/MC, so no chip is bound to a backend paymentMethod.
class PaymentChips extends StatelessWidget {
  /// Creates the chip row.
  const PaymentChips({
    required this.selected,
    required this.onSelected,
    super.key,
  });

  /// The currently selected label.
  final String selected;

  /// Selects a new label; persists through the screen's UI state provider.
  final ValueChanged<String> onSelected;

  /// Prototype payment labels, UI-only.
  static const List<String> labels = <String>[
    "МИР",
    "VISA",
    "MC",
    "SBP",
    "CRYPTO",
  ];

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Text(
          "Способ оплаты",
          style: Theme.of(context).textTheme.titleSmall,
        ),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          children: <Widget>[
            for (final label in labels)
              FilterChip(
                label: Text(label),
                selected: label == selected,
                onSelected: (_) => onSelected(label),
              ),
          ],
        ),
      ],
    );
  }
}

/// Live, presentation-only price summary (base / devices / discount / total /
/// per-day-per-device). Every number is derived from server values by the
/// screen; this leaf only formats them.
class LiveSummary extends StatelessWidget {
  /// Creates the summary.
  const LiveSummary({
    required this.termLabel,
    required this.baseRub,
    required this.devices,
    required this.discountPercent,
    required this.discountRub,
    required this.totalRub,
    required this.perDayPerDevice,
    super.key,
  });

  /// Server-derived duration label.
  final String termLabel;

  /// Preview base in integer RUB before the discount.
  final int baseRub;

  /// Device count used for the preview.
  final int devices;

  /// Server-returned percentage, never a client-generated discount.
  final int discountPercent;

  /// Preview discount in integer RUB; zero means hide the row.
  final int discountRub;

  /// Preview total in integer RUB (never posted to the backend).
  final int totalRub;

  /// Human-readable per-day-per-device estimate.
  final String perDayPerDevice;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      children: <Widget>[
        _row(theme, termLabel, _money(baseRub)),
        _row(theme, "Устройства", "$devices"),
        if (discountRub > 0)
          _row(
            theme,
            "Скидка ($discountPercent%)",
            "−${_money(discountRub)}",
            accent: AppTheme.lime,
          ),
        const SizedBox(height: 8),
        _row(
          theme,
          "К оплате",
          _money(totalRub),
          accent: AppTheme.lime2,
          strong: true,
        ),
        const SizedBox(height: 4),
        Text(
          perDayPerDevice,
          style: theme.textTheme.bodySmall?.copyWith(color: AppTheme.muted),
        ),
      ],
    );
  }

  Widget _row(
    ThemeData theme,
    String label,
    String value, {
    Color? accent,
    bool strong = false,
  }) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: <Widget>[
          Text(
            label,
            style: theme.textTheme.bodyMedium?.copyWith(color: AppTheme.muted),
          ),
          Text(
            value,
            style: theme.textTheme.titleMedium?.copyWith(
              color: accent ?? AppTheme.text,
              fontWeight: strong ? FontWeight.w800 : FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}

/// Key summary card: real days/link/expiry from the subscription provider.
/// The days/30 ring is layered in by the painting task (D-13).
class ShopKeyCard extends StatelessWidget {
  /// Creates the key summary card.
  const ShopKeyCard({
    required this.days,
    required this.expiryLabel,
    required this.link,
    required this.onCopyLink,
    super.key,
  });

  /// Server-derived remaining days (never client-computed).
  final int? days;

  /// Russian expiry copy derived from the real expiresAt.
  final String expiryLabel;

  /// Server-provided subscription URL, or null when no key is active.
  final String? link;

  /// Copies [link] through the injected clipboard seam.
  final VoidCallback onCopyLink;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppTheme.surface2,
        borderRadius: BorderRadius.circular(AppTheme.radius),
        border: Border.all(color: AppTheme.line),
      ),
      child: Row(
        children: <Widget>[
          Container(
            width: 64,
            height: 64,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: AppTheme.surface3,
              border: Border.all(color: AppTheme.line2, width: 2),
            ),
            child: Text(
              days == null ? "—" : "$days",
              style: theme.textTheme.displaySmall?.copyWith(
                color: AppTheme.lime,
              ),
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(
                  "Персональный ключ",
                  style: theme.textTheme.titleMedium?.copyWith(
                    color: AppTheme.text,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  expiryLabel,
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: AppTheme.muted,
                  ),
                ),
                if (link != null && link!.isNotEmpty)
                  Row(
                    children: <Widget>[
                      Expanded(
                        child: Text(
                          link!,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: theme.textTheme.labelMedium?.copyWith(
                            color: AppTheme.teal,
                          ),
                        ),
                      ),
                      IconButton(
                        tooltip: "Скопировать ссылку",
                        icon: const Icon(Icons.copy, size: 18),
                        onPressed: onCopyLink,
                      ),
                    ],
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Inline key gate (D-11/D-16): the copy is frozen and the action points back
/// into this shop, never into a simulated purchase.
class ShopNoKeyBanner extends StatelessWidget {
  /// Creates the banner.
  const ShopNoKeyBanner({
    required this.onAction,
    this.message = "Нужен активный ключ",
    this.actionLabel = "Выбрать тариф",
    super.key,
  });

  /// Stable Russian gate copy.
  final String message;

  /// Action label leading back to the tariff list.
  final String actionLabel;

  /// Scrolls/focuses the tariff list.
  final VoidCallback onAction;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: AppTheme.surface3,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppTheme.amber.withValues(alpha: 0.5)),
      ),
      child: Row(
        children: <Widget>[
          const Icon(Icons.vpn_key_off_outlined, color: AppTheme.amber),
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

/// Trial block (D-09): renew/upgrade actions are hidden and this copy is shown
/// from the server's `isTrial` flag. The backend still enforces the 409.
class TrialNotice extends StatelessWidget {
  /// Creates the trial notice.
  const TrialNotice({super.key});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: <Widget>[
        const Icon(Icons.info_outline, color: AppTheme.amber, size: 18),
        const SizedBox(width: 8),
        Text(
          "Триал не продлевается",
          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: AppTheme.amber,
                fontWeight: FontWeight.w700,
              ),
        ),
      ],
    );
  }
}

/// Pinned buy bar: live total plus the single purchase action.
class ShopPayBar extends StatelessWidget {
  /// Creates the pinned bar.
  const ShopPayBar({
    required this.totalRub,
    required this.perDayPerDevice,
    required this.buttonLabel,
    required this.onPressed,
    this.processing = false,
    super.key,
  });

  /// Presentation-only total in integer RUB.
  final int totalRub;

  /// Human-readable per-day-per-device estimate.
  final String perDayPerDevice;

  /// «Купить ключ» / «Купить и продлить» / «Купить новый ключ».
  final String buttonLabel;

  /// Starts the real plan-01 payment flow.
  final VoidCallback onPressed;

  /// Disables the button while an order is in flight.
  final bool processing;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.fromLTRB(18, 12, 18, 18),
      decoration: const BoxDecoration(
        color: AppTheme.bg2,
        border: Border(top: BorderSide(color: AppTheme.line)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: <Widget>[
              Text(
                "К оплате",
                style: theme.textTheme.titleSmall,
              ),
              Text(
                _money(totalRub),
                style: theme.textTheme.displaySmall?.copyWith(
                  color: AppTheme.lime2,
                ),
              ),
            ],
          ),
          const SizedBox(height: 2),
          Text(
            perDayPerDevice,
            style: theme.textTheme.bodySmall?.copyWith(color: AppTheme.muted),
          ),
          const SizedBox(height: 12),
          FilledButton(
            onPressed: processing ? null : onPressed,
            child: Text(processing ? "Создаём платёж…" : buttonLabel),
          ),
        ],
      ),
    );
  }
}

/// Whole-ruble RUB formatting with the prototype's `ru-RU` spacing.
String _money(int value) => "$value ₽";
