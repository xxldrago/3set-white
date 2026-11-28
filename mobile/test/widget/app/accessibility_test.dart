// Wave 0 accessibility contract for phase 22 (22.12, T-22-27/T-22-28).
//
// Dynamic type and contrast are verified on rendered tokens, not reported on
// paper: a forced 200% platform scale must reach the text block, and the small
// text tokens must clear WCAG AA 4.5:1 on the dark card surfaces.
import "package:flutter/material.dart";
import "package:flutter_test/flutter_test.dart";
import "package:mobile/app/theme.dart";
import "package:mobile/main.dart" show AppTextScalePolicy;

/// WCAG 2.x relative luminance is provided by Flutter's [Color].
double _contrast(Color foreground, Color background) {
  final double a = foreground.computeLuminance();
  final double b = background.computeLuminance();
  final double light = a > b ? a : b;
  final double dark = a > b ? b : a;
  return (light + 0.05) / (dark + 0.05);
}

void main() {
  /// A representative profile/device/settings text block, scrollable so a
  /// genuine 200% scale cannot be mistaken for a layout regression.
  Widget representativeBlock() => Builder(
        builder: (BuildContext context) {
          final ThemeData theme = Theme.of(context);
          return SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text("Профиль", style: theme.textTheme.headlineSmall),
                const SizedBox(height: 8),
                Text("Kill switch: включён", style: theme.textTheme.bodyMedium),
                const SizedBox(height: 4),
                Text(
                  "Трафик вне VPN заблокирован",
                  style: theme.textTheme.bodySmall,
                ),
                const SizedBox(height: 8),
                Text("Устройство", style: theme.textTheme.bodyMedium),
                Text("Нет устройств", style: theme.textTheme.bodySmall),
                const SizedBox(height: 8),
                Text("Обновить пинг", style: theme.textTheme.labelSmall),
              ],
            ),
          );
        },
      );

  Widget appAtScale(double scale) => MaterialApp(
        theme: AppTheme.dark,
        home: Builder(
          builder: (BuildContext context) => MediaQuery(
            data: MediaQuery.of(context).copyWith(
              textScaler: TextScaler.linear(scale),
            ),
            child: AppTextScalePolicy(
              child: Scaffold(body: representativeBlock()),
            ),
          ),
        ),
      );

  testWidgets("a 200% platform text scale reaches text unclamped", (
    tester,
  ) async {
    await tester.pumpWidget(appAtScale(2.0));

    final BuildContext textContext = tester.element(
      find.text("Kill switch: включён"),
    );
    expect(MediaQuery.of(textContext).textScaler.scale(16.0), 32.0);
    // No RenderFlex overflow and no clamped/phantom layout at real 200%.
    expect(tester.takeException(), isNull);
    expect(find.byType(NavigationBar), findsNothing);
    expect(find.byType(LinearProgressIndicator), findsNothing);
  });

  testWidgets("small text tokens are the AA token, not the prototype gray", (
    tester,
  ) async {
    expect(AppTheme.dark.textTheme.bodySmall?.color, AppTheme.dim);
    expect(AppTheme.dark.textTheme.labelSmall?.color, AppTheme.dim);
    expect(_contrast(AppTheme.dim, AppTheme.surface), greaterThanOrEqualTo(4.5));
    expect(_contrast(AppTheme.dim, AppTheme.surface2), greaterThanOrEqualTo(4.5));

    await tester.pumpWidget(appAtScale(2.0));
    final Text caption = tester.widget<Text>(
      find.text("Трафик вне VPN заблокирован"),
    );
    expect(caption.style?.color, AppTheme.dim);
  });
}
