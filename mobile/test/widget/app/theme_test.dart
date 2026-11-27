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
    });

    test("main.dart forces ThemeMode.dark with AppTheme.dark", () {
      final String source = File("lib/main.dart").readAsStringSync();

      expect(source, contains("theme: AppTheme.dark"));
      expect(source, contains("darkTheme: AppTheme.dark"));
      expect(source, contains("themeMode: ThemeMode.dark"));
      expect(source, isNot(contains("ThemeMode.system")));
    });

    test("light theme is retained for a deferred toggle", () {
      expect(AppTheme.light.brightness, Brightness.light);
    });
  });
}
