import "package:flutter/material.dart";
import "package:flutter_riverpod/flutter_riverpod.dart";
import "package:mobile/app/theme.dart";

/// Shows error messages as toast/snackbar.
///
/// Can be used globally via [showErrorToast], [showSuccessToast] and
/// [showInfoToast]. Later phase-19 flows reuse the same dark surface for
/// «Пинг обновлён», «Нет активного ключа» and «Повторить».
final Provider<ErrorToastService> errorToastProvider =
    Provider<ErrorToastService>((Ref ref) {
  return ErrorToastService();
});

/// Service for showing toast messages on the dark prototype theme.
class ErrorToastService {
  /// Global key so toasts can be shown outside a widget subtree.
  static final GlobalKey<ScaffoldMessengerState> scaffoldMessengerKey =
      GlobalKey<ScaffoldMessengerState>();

  /// Shows a destructive message using the prototype red accent.
  void showError(
    BuildContext context,
    String message, {
    Duration? duration,
  }) {
    _show(
      message: message,
      background: AppTheme.red,
      foreground: AppTheme.bg,
      duration: duration ?? const Duration(seconds: 4),
      action: true,
    );
  }

  /// Shows a success message using the prototype teal accent.
  void showSuccess(
    BuildContext context,
    String message, {
    Duration? duration,
  }) {
    _show(
      message: message,
      background: AppTheme.teal,
      foreground: AppTheme.bg,
      duration: duration ?? const Duration(seconds: 3),
    );
  }

  /// Shows an informational message on a raised dark surface.
  void showInfo(
    BuildContext context,
    String message, {
    Duration? duration,
  }) {
    _show(
      message: message,
      background: AppTheme.surface3,
      foreground: AppTheme.text,
      duration: duration ?? const Duration(seconds: 3),
    );
  }

  void _show({
    required String message,
    required Color background,
    required Color foreground,
    required Duration duration,
    bool action = false,
  }) {
    scaffoldMessengerKey.currentState?.hideCurrentSnackBar();
    scaffoldMessengerKey.currentState?.showSnackBar(
      SnackBar(
        content: Text(
          message,
          style: TextStyle(
            fontFamily: AppTheme.fontBody,
            fontWeight: FontWeight.w700,
            color: foreground,
          ),
        ),
        backgroundColor: background,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(14),
          side: const BorderSide(color: AppTheme.line2),
        ),
        duration: duration,
        action: action
            ? SnackBarAction(
                label: "OK",
                textColor: foreground,
                onPressed: () {
                  scaffoldMessengerKey.currentState?.hideCurrentSnackBar();
                },
              )
            : null,
      ),
    );
  }
}

/// Convenience function to show an error toast from anywhere.
void showErrorToast(
  BuildContext context,
  String message, {
  Duration? duration,
}) {
  ErrorToastService.scaffoldMessengerKey.currentState?.hideCurrentSnackBar();
  ErrorToastService.scaffoldMessengerKey.currentState?.showSnackBar(
    _buildSnackBar(
      message: message,
      background: AppTheme.red,
      foreground: AppTheme.bg,
      duration: duration ?? const Duration(seconds: 4),
      action: true,
    ),
  );
}

/// Convenience function to show a success toast from anywhere.
void showSuccessToast(
  BuildContext context,
  String message, {
  Duration? duration,
}) {
  ErrorToastService.scaffoldMessengerKey.currentState?.hideCurrentSnackBar();
  ErrorToastService.scaffoldMessengerKey.currentState?.showSnackBar(
    _buildSnackBar(
      message: message,
      background: AppTheme.teal,
      foreground: AppTheme.bg,
      duration: duration ?? const Duration(seconds: 3),
    ),
  );
}

/// Convenience function to show an info toast from anywhere.
void showInfoToast(
  BuildContext context,
  String message, {
  Duration? duration,
}) {
  ErrorToastService.scaffoldMessengerKey.currentState?.hideCurrentSnackBar();
  ErrorToastService.scaffoldMessengerKey.currentState?.showSnackBar(
    _buildSnackBar(
      message: message,
      background: AppTheme.surface3,
      foreground: AppTheme.text,
      duration: duration ?? const Duration(seconds: 3),
    ),
  );
}

SnackBar _buildSnackBar({
  required String message,
  required Color background,
  required Color foreground,
  required Duration duration,
  bool action = false,
}) {
  return SnackBar(
    content: Text(
      message,
      style: TextStyle(
        fontFamily: AppTheme.fontBody,
        fontWeight: FontWeight.w700,
        color: foreground,
      ),
    ),
    backgroundColor: background,
    behavior: SnackBarBehavior.floating,
    shape: RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(14),
      side: const BorderSide(color: AppTheme.line2),
    ),
    duration: duration,
    action: action
        ? SnackBarAction(
            label: "OK",
            textColor: foreground,
            onPressed: () {
              ErrorToastService.scaffoldMessengerKey.currentState
                  ?.hideCurrentSnackBar();
            },
          )
        : null,
  );
}
