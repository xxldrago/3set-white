import "package:flutter/material.dart";

import "../../../app/theme.dart";
import "../server.dart";

/// Prototype main-screen header (`.main-head`).
///
/// Renders brand, greeting, status pill, key pill (D-20), date pill and the
/// refresh/shop/logic/avatar actions (D-15/D-19). The VPN status is idle-only
/// in phase 19: there is no tunnel and no simulated «VPN активен» state.
class MainHeader extends StatelessWidget {
  /// Creates the prototype header.
  const MainHeader({
    required this.keyMeta,
    required this.refreshing,
    required this.onRefresh,
    required this.onShop,
    required this.onLogic,
    required this.onProfile,
    this.greetingName = "друг",
    super.key,
  });

  /// Active-key metadata driving the key pill (D-20).
  final ServerKey? keyMeta;

  /// Whether a full ping refresh is currently running.
  final bool refreshing;

  /// Opens a full ping refresh and shows «Пинг обновлён» on completion.
  final VoidCallback onRefresh;

  /// Opens the shop stub («Купить» / «Магазин», phase 21).
  final VoidCallback onShop;

  /// Opens the «Как это работает» sheet stub.
  final VoidCallback onLogic;

  /// Opens the profile sheet stub (phase 21).
  final VoidCallback onProfile;

  /// Short user name used in the localized greeting.
  final String greetingName;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final now = DateTime.now();
    return Padding(
      padding: const EdgeInsets.fromLTRB(18, 10, 18, 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Row(
            children: <Widget>[
              Expanded(child: _brand(theme)),
              _actions(theme),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            "${_greeting(now)} $greetingName",
            style: theme.textTheme.headlineSmall?.copyWith(
              fontFamily: AppTheme.fontDisplay,
            ),
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: <Widget>[
              _statusPill(theme),
              _pill(
                label: _keyLabel(keyMeta),
                color: keyMeta?.active == true
                    ? AppTheme.lime
                    : AppTheme.muted,
                theme: theme,
              ),
              _pill(
                label: _ruDate(now),
                color: AppTheme.muted,
                theme: theme,
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _brand(ThemeData theme) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: <Widget>[
        Container(
          width: 32,
          height: 32,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(10),
            gradient: const LinearGradient(
              colors: <Color>[AppTheme.gradStart, AppTheme.gradEnd],
            ),
          ),
          child: const Icon(Icons.bolt, color: AppTheme.bg, size: 20),
        ),
        const SizedBox(width: 8),
        RichText(
          text: TextSpan(
            children: <TextSpan>[
              TextSpan(
                text: "3",
                style: TextStyle(
                  fontFamily: AppTheme.fontDisplay,
                  fontSize: 17,
                  fontWeight: FontWeight.w700,
                  color: theme.colorScheme.onSurface,
                ),
              ),
              TextSpan(
                text: "set",
                style: TextStyle(
                  fontFamily: AppTheme.fontDisplay,
                  fontSize: 17,
                  fontWeight: FontWeight.w700,
                  color: AppTheme.lime,
                ),
              ),
              TextSpan(
                text: ".online",
                style: TextStyle(
                  fontFamily: AppTheme.fontBody,
                  fontSize: 12,
                  color: AppTheme.muted,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _actions(ThemeData theme) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: <Widget>[
        IconButton(
          tooltip: "Как это работает",
          icon: const Icon(Icons.help_outline),
          onPressed: onLogic,
        ),
        IconButton(
          tooltip: "Купить ключ",
          icon: const Icon(Icons.shopping_bag_outlined),
          onPressed: onShop,
        ),
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
        const SizedBox(width: 2),
        Semantics(
          label: "Профиль",
          child: GestureDetector(
            onTap: onProfile,
            child: CircleAvatar(
              radius: 17,
              backgroundColor: AppTheme.surface3,
              child: Text(
                "А",
                style: theme.textTheme.titleMedium?.copyWith(
                  color: AppTheme.lime2,
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _statusPill(ThemeData theme) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: AppTheme.surface2,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: AppTheme.line),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          const Icon(Icons.circle, color: AppTheme.lime, size: 8),
          const SizedBox(width: 6),
          Text(
            "VPN выключен",
            style: theme.textTheme.labelMedium?.copyWith(
              color: AppTheme.text,
            ),
          ),
        ],
      ),
    );
  }

  Widget _pill({
    required String label,
    required Color color,
    required ThemeData theme,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: AppTheme.surface2,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: AppTheme.line),
      ),
      child: Text(
        label,
        style: theme.textTheme.labelMedium?.copyWith(color: color),
      ),
    );
  }

  String _greeting(DateTime now) {
    final hour = now.hour;
    if (hour >= 5 && hour < 12) {
      return "Доброе утро,";
    }
    if (hour >= 12 && hour < 18) {
      return "Добрый день,";
    }
    return "Добрый вечер,";
  }

  String _keyLabel(ServerKey? key) {
    if (key == null) {
      return "Нет ключа";
    }
    if (!key.active) {
      return "Ключ истёк";
    }
    final days = key.remainingDays ?? _daysUntil(key.expireAt);
    if (days == null) {
      return "ключ · активен";
    }
    if (days <= 0) {
      return "Ключ истёк";
    }
    return "ключ · $days дн.";
  }

  int? _daysUntil(String? expireAt) {
    if (expireAt == null) {
      return null;
    }
    final parsed = DateTime.tryParse(expireAt);
    if (parsed == null) {
      return null;
    }
    final now = DateTime.now();
    if (!parsed.isAfter(now)) {
      return 0;
    }
    return parsed.difference(now).inDays + 1;
  }

  String _ruDate(DateTime now) {
    const weekdays = <String>[
      "воскресенье",
      "понедельник",
      "вторник",
      "среда",
      "четверг",
      "пятница",
      "суббота",
    ];
    const months = <String>[
      "января",
      "февраля",
      "марта",
      "апреля",
      "мая",
      "июня",
      "июля",
      "августа",
      "сентября",
      "октября",
      "ноября",
      "декабря",
    ];
    return "${weekdays[now.weekday % 7]}, ${now.day} ${months[now.month - 1]}";
  }
}
