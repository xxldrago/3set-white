import "package:flutter/material.dart";

/// Material 3 theme configuration for the 3set VPN app.
///
/// [AppTheme.dark] is the app-wide prototype theme (D-16). It reproduces the
/// seed prototype palette verbatim and uses the three prototype typefaces.
/// [AppTheme.light] is retained for a possible future toggle but is unused.
class AppTheme {
  /// Prototype `--bg`: main application background.
  static const Color bg = Color(0xFF0e1512);

  /// Prototype `--bg2`: slightly darker secondary background.
  static const Color bg2 = Color(0xFF0b110e);

  /// Prototype `--surface`: card / sheet surface.
  static const Color surface = Color(0xFF131c16);

  /// Prototype `--surface2`: raised surface.
  static const Color surface2 = Color(0xFF182419);

  /// Prototype `--surface3`: highest surface.
  static const Color surface3 = Color(0xFF1d2b1f);

  /// Prototype `--line`: `rgba(183,255,69,.14)`.
  static const Color line = Color(0x24b7ff45);

  /// Prototype `--line2`: `rgba(183,255,69,.3)`.
  static const Color line2 = Color(0x4db7ff45);

  /// Prototype `--lime`: primary accent.
  static const Color lime = Color(0xFFb7ff45);

  /// Prototype `--lime2`: light primary accent.
  static const Color lime2 = Color(0xFFd4ff85);

  /// Prototype `--lime3`: dark primary accent.
  static const Color lime3 = Color(0xFF7fd41f);

  /// Prototype `--teal`: secondary accent.
  static const Color teal = Color(0xFF3ee6b0);

  /// Prototype `--amber`: warning ping color.
  static const Color amber = Color(0xFFffc24b);

  /// Prototype `--red`: error / bad ping color.
  static const Color red = Color(0xFFff6b6b);

  /// Prototype `--blue`: informational accent.
  static const Color blue = Color(0xFF2aabee);

  /// Prototype `--text`: primary text.
  static const Color text = Color(0xFFf2f7ec);

  /// Prototype `--muted`: secondary text.
  static const Color muted = Color(0xFFa7b8a9);

  /// Prototype `--dim`: tertiary text.
  static const Color dim = Color(0xFF6f8272);

  /// `--grad` start color (linear gradient 135deg).
  static const Color gradStart = Color(0xFFd4ff85);

  /// `--grad` end color (linear gradient 135deg).
  static const Color gradEnd = Color(0xFF7fd41f);

  /// `--grad-teal` start color.
  static const Color gradTealStart = Color(0xFF8ffbe0);

  /// `--grad-teal` end color.
  static const Color gradTealEnd = Color(0xFF1fbf8f);

  /// Prototype `--r`: card corner radius.
  static const double radius = 18;

  /// Prototype body typeface family (bundled variable font).
  static const String fontBody = "Manrope";

  /// Prototype display typeface family (bundled variable font).
  static const String fontDisplay = "Unbounded";

  /// Prototype monospace typeface family (bundled variable font).
  static const String fontMono = "JetBrains Mono";

  /// Ping color: good up to 60 ms, mid up to 110 ms, warn up to 180 ms.
  static const Color pingGood = lime;

  /// Ping color for a healthy but slower response (61-110 ms).
  static const Color pingMid = teal;

  /// Ping color for a degraded response (111-180 ms).
  static const Color pingWarn = amber;

  /// Ping color for a slow response (over 180 ms).
  static const Color pingBad = red;

  /// Ping color for an offline / unanswered server.
  static const Color pingOffline = dim;

  /// Russian status copy for an offline server (D-17).
  static const String offlineLabel = "офлайн";

  /// Russian status copy when a server did not answer (D-17).
  static const String noResponseLabel = "нет ответа";

  /// Maps a real ping sample to the prototype `pingClass` color.
  static Color pingColor(bool online, int? rttMs) {
    // Keep in sync with pingClass(): a negative sample is not a good RTT.
    if (!online || rttMs == null || rttMs < 0) {
      return pingOffline;
    }
    if (rttMs <= 60) {
      return pingGood;
    }
    if (rttMs <= 110) {
      return pingMid;
    }
    if (rttMs <= 180) {
      return pingWarn;
    }
    return pingBad;
  }

  /// App-wide dark prototype theme (D-16). Material 3 is kept.
  static ThemeData get dark => ThemeData(
        useMaterial3: true,
        brightness: Brightness.dark,
        fontFamily: fontBody,
        colorScheme: const ColorScheme.dark(
          primary: lime,
          onPrimary: bg,
          primaryContainer: surface3,
          onPrimaryContainer: lime2,
          secondary: teal,
          onSecondary: bg2,
          secondaryContainer: Color(0xFF10392F),
          onSecondaryContainer: Color(0xFF8ffbe0),
          tertiary: blue,
          onTertiary: bg,
          error: red,
          onError: bg2,
          errorContainer: Color(0xFF3a1f1f),
          onErrorContainer: Color(0xFFffb4b4),
          surface: surface,
          onSurface: text,
          onSurfaceVariant: muted,
          surfaceTint: lime,
          outline: line2,
          outlineVariant: line,
          shadow: Colors.black,
          scrim: Colors.black,
          inverseSurface: text,
          onInverseSurface: bg,
          inversePrimary: lime3,
        ),
        scaffoldBackgroundColor: bg,
        appBarTheme: const AppBarTheme(
          centerTitle: true,
          elevation: 0,
          scrolledUnderElevation: 1,
          surfaceTintColor: Colors.transparent,
          backgroundColor: surface,
          foregroundColor: text,
          iconTheme: IconThemeData(color: muted),
          titleTextStyle: TextStyle(
            fontFamily: fontDisplay,
            fontSize: 20,
            fontWeight: FontWeight.w700,
            color: text,
          ),
        ),
        cardTheme: CardThemeData(
          elevation: 0,
          color: surface2,
          shadowColor: Colors.transparent,
          margin: const EdgeInsets.all(0),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(radius),
            side: const BorderSide(color: line),
          ),
        ),
        elevatedButtonTheme: ElevatedButtonThemeData(
          style: ElevatedButton.styleFrom(
            backgroundColor: lime2,
            foregroundColor: bg,
            disabledBackgroundColor: surface3,
            disabledForegroundColor: dim,
            elevation: 0,
            shadowColor: Colors.transparent,
            padding: const EdgeInsets.symmetric(
              horizontal: 24,
              vertical: 14,
            ),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(14),
            ),
            textStyle: const TextStyle(
              fontFamily: fontBody,
              fontSize: 16,
              fontWeight: FontWeight.w800,
            ),
            minimumSize: const Size(double.infinity, 52),
          ),
        ),
        outlinedButtonTheme: OutlinedButtonThemeData(
          style: OutlinedButton.styleFrom(
            foregroundColor: text,
            side: const BorderSide(color: line2),
            padding: const EdgeInsets.symmetric(
              horizontal: 24,
              vertical: 14,
            ),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(14),
            ),
            textStyle: const TextStyle(
              fontFamily: fontBody,
              fontSize: 16,
              fontWeight: FontWeight.w700,
            ),
            minimumSize: const Size(double.infinity, 52),
          ),
        ),
        textButtonTheme: TextButtonThemeData(
          style: TextButton.styleFrom(
            foregroundColor: lime2,
            padding: const EdgeInsets.symmetric(
              horizontal: 16,
              vertical: 12,
            ),
            textStyle: const TextStyle(
              fontFamily: fontBody,
              fontSize: 14,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: bg2,
          contentPadding: const EdgeInsets.symmetric(
            horizontal: 16,
            vertical: 16,
          ),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(14),
            borderSide: const BorderSide(color: line),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(14),
            borderSide: const BorderSide(color: line),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(14),
            borderSide: const BorderSide(color: lime3, width: 2),
          ),
          errorBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(14),
            borderSide: const BorderSide(color: red),
          ),
          focusedErrorBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(14),
            borderSide: const BorderSide(color: red, width: 2),
          ),
          labelStyle: const TextStyle(color: muted, fontSize: 14),
          hintStyle: const TextStyle(color: dim, fontSize: 14),
          errorStyle: const TextStyle(color: red, fontSize: 12),
        ),
        textTheme: const TextTheme(
          displayLarge: TextStyle(
            fontFamily: fontDisplay,
            fontSize: 32,
            fontWeight: FontWeight.w700,
            color: text,
          ),
          displayMedium: TextStyle(
            fontFamily: fontDisplay,
            fontSize: 28,
            fontWeight: FontWeight.w700,
            color: text,
          ),
          displaySmall: TextStyle(
            fontFamily: fontDisplay,
            fontSize: 24,
            fontWeight: FontWeight.w700,
            color: text,
          ),
          headlineLarge: TextStyle(
            fontFamily: fontDisplay,
            fontSize: 22,
            fontWeight: FontWeight.w700,
            color: text,
          ),
          headlineMedium: TextStyle(
            fontFamily: fontDisplay,
            fontSize: 20,
            fontWeight: FontWeight.w700,
            color: text,
          ),
          headlineSmall: TextStyle(
            fontFamily: fontDisplay,
            fontSize: 18,
            fontWeight: FontWeight.w700,
            color: text,
          ),
          titleLarge: TextStyle(
            fontFamily: fontBody,
            fontSize: 16,
            fontWeight: FontWeight.w800,
            color: text,
          ),
          titleMedium: TextStyle(
            fontFamily: fontBody,
            fontSize: 14,
            fontWeight: FontWeight.w700,
            color: text,
          ),
          titleSmall: TextStyle(
            fontFamily: fontBody,
            fontSize: 12,
            fontWeight: FontWeight.w700,
            color: muted,
          ),
          bodyLarge: TextStyle(
            fontFamily: fontBody,
            fontSize: 16,
            fontWeight: FontWeight.w400,
            color: text,
          ),
          bodyMedium: TextStyle(
            fontFamily: fontBody,
            fontSize: 14,
            fontWeight: FontWeight.w400,
            color: muted,
          ),
          bodySmall: TextStyle(
            fontFamily: fontBody,
            fontSize: 12,
            fontWeight: FontWeight.w400,
            color: dim,
          ),
          labelLarge: TextStyle(
            fontFamily: fontBody,
            fontSize: 14,
            fontWeight: FontWeight.w800,
            color: lime2,
          ),
          labelMedium: TextStyle(
            fontFamily: fontMono,
            fontSize: 12,
            fontWeight: FontWeight.w700,
            color: muted,
          ),
          labelSmall: TextStyle(
            fontFamily: fontMono,
            fontSize: 10,
            fontWeight: FontWeight.w700,
            color: dim,
          ),
        ),
        dividerTheme: const DividerThemeData(
          color: line,
          thickness: 1,
          space: 1,
        ),
        snackBarTheme: SnackBarThemeData(
          behavior: SnackBarBehavior.floating,
          backgroundColor: surface3,
          closeIconColor: muted,
          contentTextStyle: const TextStyle(
            fontFamily: fontBody,
            fontSize: 14,
            fontWeight: FontWeight.w700,
            color: text,
          ),
          actionTextColor: lime2,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
            side: const BorderSide(color: line2),
          ),
        ),
        bottomSheetTheme: BottomSheetThemeData(
          backgroundColor: surface,
          surfaceTintColor: Colors.transparent,
          modalBackgroundColor: surface,
          shape: const RoundedRectangleBorder(
            borderRadius: BorderRadius.vertical(
              top: Radius.circular(26),
            ),
          ),
        ),
        dialogTheme: DialogThemeData(
          backgroundColor: surface,
          surfaceTintColor: Colors.transparent,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(radius),
            side: const BorderSide(color: line2),
          ),
          titleTextStyle: const TextStyle(
            fontFamily: fontDisplay,
            fontSize: 17,
            fontWeight: FontWeight.w700,
            color: text,
          ),
        ),
        navigationBarTheme: NavigationBarThemeData(
          backgroundColor: surface,
          surfaceTintColor: Colors.transparent,
          indicatorColor: surface3,
          labelTextStyle: WidgetStateProperty.all(
            const TextStyle(
              fontFamily: fontBody,
              fontSize: 12,
              color: muted,
            ),
          ),
          iconTheme: WidgetStateProperty.all(
            const IconThemeData(color: muted, size: 24),
          ),
          height: 70,
        ),
      );

  /// Retained light Material 3 theme. Unused: dark is forced app-wide (D-16).
  static ThemeData get light => ThemeData(
        useMaterial3: true,
        brightness: Brightness.light,
        colorScheme: const ColorScheme.light(
          primary: Color(0xFF2563EB),
          primaryContainer: Color(0xFFDBEAFE),
          secondary: Color(0xFF059669),
          error: Color(0xFFDC2626),
          surface: Color(0xFFFFFFFF),
          onPrimary: Colors.white,
          onPrimaryContainer: Color(0xFF1E3A8A),
          onSecondary: Colors.white,
          onError: Colors.white,
          onSurface: Color(0xFF0F172A),
        ),
        scaffoldBackgroundColor: const Color(0xFFF8FAFC),
        appBarTheme: const AppBarTheme(
          centerTitle: true,
          elevation: 0,
          scrolledUnderElevation: 1,
          backgroundColor: Color(0xFFFFFFFF),
          foregroundColor: Color(0xFF0F172A),
          titleTextStyle: TextStyle(
            fontSize: 20,
            fontWeight: FontWeight.w600,
            color: Color(0xFF0F172A),
          ),
        ),
        cardTheme: CardThemeData(
          elevation: 0,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
            side: const BorderSide(color: Color(0xFFE2E8F0)),
          ),
          color: const Color(0xFFFFFFFF),
          shadowColor: Colors.transparent,
        ),
        elevatedButtonTheme: ElevatedButtonThemeData(
          style: ElevatedButton.styleFrom(
            backgroundColor: const Color(0xFF2563EB),
            foregroundColor: Colors.white,
            elevation: 0,
            padding: const EdgeInsets.symmetric(
              horizontal: 24,
              vertical: 14,
            ),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
            ),
            minimumSize: const Size(double.infinity, 52),
          ),
        ),
        outlinedButtonTheme: OutlinedButtonThemeData(
          style: OutlinedButton.styleFrom(
            foregroundColor: const Color(0xFF2563EB),
            side: const BorderSide(color: Color(0xFF2563EB), width: 1.5),
            padding: const EdgeInsets.symmetric(
              horizontal: 24,
              vertical: 14,
            ),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
            ),
            minimumSize: const Size(double.infinity, 52),
          ),
        ),
        textButtonTheme: TextButtonThemeData(
          style: TextButton.styleFrom(
            foregroundColor: const Color(0xFF2563EB),
          ),
        ),
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: const Color(0xFFF8FAFC),
          contentPadding: const EdgeInsets.symmetric(
            horizontal: 16,
            vertical: 16,
          ),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(color: Color(0xFFCBD5E1)),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(
              color: Color(0xFF2563EB),
              width: 2,
            ),
          ),
        ),
        dividerTheme: const DividerThemeData(
          color: Color(0xFFE2E8F0),
          thickness: 1,
          space: 1,
        ),
        snackBarTheme: SnackBarThemeData(
          behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
        ),
      );
}
