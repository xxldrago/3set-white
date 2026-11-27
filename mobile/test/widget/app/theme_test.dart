import "dart:io";

import "package:flutter/material.dart";
import "package:flutter_test/flutter_test.dart";
import "package:mobile/app/theme.dart";

void main() {
  group("AppTheme.dark app-wide (D-16)", () {
    test("dark theme is the Material 3 prototype theme", () {
      final ThemeData theme = AppTheme.dark;

      expect(theme.useMaterial3, isTrue);
      expect(theme.brightness, Brightness.dark);
      expect(theme.scaffoldBackgroundColor, AppTheme.bg);
      expect(theme.colorScheme.primary, AppTheme.lime);
      expect(theme.colorScheme.secondary, AppTheme.teal);
      expect(theme.colorScheme.error, AppTheme.red);
      expect(theme.colorScheme.surface, AppTheme.surface);
      expect(theme.colorScheme.onSurface, AppTheme.text);
    });

    test("verbatim prototype palette constants", () {
      expect(AppTheme.bg, const Color(0xFF0e1512));
      expect(AppTheme.bg2, const Color(0xFF0b110e));
      expect(AppTheme.surface, const Color(0xFF131c16));
      expect(AppTheme.surface2, const Color(0xFF182419));
      expect(AppTheme.surface3, const Color(0xFF1d2b1f));
      expect(AppTheme.line, const Color(0x24b7ff45));
      expect(AppTheme.line2, const Color(0x4db7ff45));
      expect(AppTheme.lime, const Color(0xFFb7ff45));
      expect(AppTheme.lime2, const Color(0xFFd4ff85));
      expect(AppTheme.lime3, const Color(0xFF7fd41f));
      expect(AppTheme.teal, const Color(0xFF3ee6b0));
      expect(AppTheme.amber, const Color(0xFFffc24b));
      expect(AppTheme.red, const Color(0xFFff6b6b));
      expect(AppTheme.blue, const Color(0xFF2aabee));
      expect(AppTheme.text, const Color(0xFFf2f7ec));
      expect(AppTheme.muted, const Color(0xFFa7b8a9));
      expect(AppTheme.dim, const Color(0xFF6f8272));
      expect(AppTheme.gradStart, const Color(0xFFd4ff85));
      expect(AppTheme.gradEnd, const Color(0xFF7fd41f));
      expect(AppTheme.gradTealStart, const Color(0xFF8ffbe0));
      expect(AppTheme.gradTealEnd, const Color(0xFF1fbf8f));
      expect(AppTheme.radius, 18);
    });

    test("component themes cover app bars, cards, buttons and inputs", () {
      final ThemeData theme = AppTheme.dark;

      expect(theme.appBarTheme.backgroundColor, AppTheme.surface);
      expect(theme.appBarTheme.foregroundColor, AppTheme.text);
      expect(theme.cardTheme.color, AppTheme.surface2);
      expect(
        theme.elevatedButtonTheme.style?.backgroundColor
            ?.resolve(<WidgetState>{}),
        AppTheme.lime2,
      );
      expect(
        theme.elevatedButtonTheme.style?.foregroundColor
            ?.resolve(<WidgetState>{}),
        AppTheme.bg,
      );
      expect(
        theme.outlinedButtonTheme.style?.side?.resolve(<WidgetState>{})?.color,
        AppTheme.line2,
      );
      expect(
        theme.textButtonTheme.style?.foregroundColor?.resolve(<WidgetState>{}),
        AppTheme.lime2,
      );
      expect(theme.inputDecorationTheme.fillColor, AppTheme.bg2);
      expect(theme.dividerTheme.color, AppTheme.line);
      expect(theme.snackBarTheme.backgroundColor, AppTheme.surface3);
      expect(theme.snackBarTheme.actionTextColor, AppTheme.lime2);
    });

    test("three prototype typefaces are wired into the text theme", () {
      final ThemeData theme = AppTheme.dark;

      expect(theme.textTheme.bodyLarge?.fontFamily, AppTheme.fontBody);
      expect(AppTheme.fontBody, "Manrope");
      expect(AppTheme.fontDisplay, "Unbounded");
      expect(AppTheme.fontMono, "JetBrains Mono");
      expect(theme.textTheme.displayLarge?.fontFamily, AppTheme.fontDisplay);
      expect(theme.textTheme.bodyMedium?.fontFamily, AppTheme.fontBody);
      expect(theme.textTheme.labelSmall?.fontFamily, AppTheme.fontMono);

      final String pubspec = File("pubspec.yaml").readAsStringSync();
      expect(pubspec, contains("- family: Manrope"));
      expect(pubspec, contains("- family: Unbounded"));
      expect(pubspec, contains("- family: JetBrains Mono"));
      expect(pubspec, contains("assets/fonts/Manrope-Variable.ttf"));
      expect(pubspec, contains("assets/fonts/Unbounded-Variable.ttf"));
      expect(pubspec, contains("assets/fonts/JetBrainsMono-Variable.ttf"));
    });

    test("ping classes use good/mid/warn/bad/offline only", () {
      expect(AppTheme.pingGood, AppTheme.lime);
      expect(AppTheme.pingMid, AppTheme.teal);
      expect(AppTheme.pingWarn, AppTheme.amber);
      expect(AppTheme.pingBad, AppTheme.red);
      expect(AppTheme.pingOffline, AppTheme.dim);
      expect(AppTheme.pingOffline, isNot(AppTheme.pingBad));

      expect(AppTheme.pingColor(false, 10), AppTheme.pingOffline);
      expect(AppTheme.pingColor(true, null), AppTheme.pingOffline);
      expect(AppTheme.pingColor(true, 0), AppTheme.pingGood);
      expect(AppTheme.pingColor(true, 60), AppTheme.pingGood);
      expect(AppTheme.pingColor(true, 61), AppTheme.pingMid);
      expect(AppTheme.pingColor(true, 110), AppTheme.pingMid);
      expect(AppTheme.pingColor(true, 111), AppTheme.pingWarn);
      expect(AppTheme.pingColor(true, 180), AppTheme.pingWarn);
      expect(AppTheme.pingColor(true, 181), AppTheme.pingBad);
      expect(AppTheme.offlineLabel, "офлайн");
      expect(AppTheme.noResponseLabel, "нет ответа");
    });

    test("main.dart forces ThemeMode.dark with AppTheme.dark", () {
      final String source = File("lib/main.dart").readAsStringSync();

      expect(source, contains("theme: AppTheme.dark"));
      expect(source, contains("darkTheme: AppTheme.dark"));
      expect(source, contains("themeMode: ThemeMode.dark"));
      expect(source, isNot(contains("ThemeMode.system")));
    });

    test("no load colors, light toggle or prototype simulation shipped", () {
      final String themeSource = File("lib/app/theme.dart").readAsStringSync();
      final String lower = themeSource.toLowerCase();

      expect(lower, isNot(contains("load")));
      expect(lower, isNot(contains("math.random")));
      expect(lower, isNot(contains("sleep(")));
      expect(lower, isNot(contains("vless://")));
      expect(themeSource, contains("AppTheme.light"));
    });

    test("light theme is retained for a deferred toggle", () {
      expect(AppTheme.light.brightness, Brightness.light);
    });
  });
}
