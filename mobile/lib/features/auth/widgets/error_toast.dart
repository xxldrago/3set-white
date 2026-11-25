import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Shows error messages as toast/snackbar.
/// Can be used globally via [showErrorToast] or [showSuccessToast].
final errorToastProvider = Provider<ErrorToastService>((ref) {
  return ErrorToastService();
});

/// Service for showing toast messages.
class ErrorToastService {
  static final GlobalKey<ScaffoldMessengerState> scaffoldMessengerKey =
      GlobalKey<ScaffoldMessengerState>();

  void showError(BuildContext context, String message, {Duration? duration}) {
    scaffoldMessengerKey.currentState?.hideCurrentSnackBar();
    scaffoldMessengerKey.currentState?.showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: Theme.of(context).colorScheme.error,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
        ),
        duration: duration ?? const Duration(seconds: 4),
        action: SnackBarAction(
          label: 'OK',
          textColor: Theme.of(context).colorScheme.onError,
          onPressed: () {
            scaffoldMessengerKey.currentState?.hideCurrentSnackBar();
          },
        ),
      ),
    );
  }

  void showSuccess(BuildContext context, String message, {Duration? duration}) {
    scaffoldMessengerKey.currentState?.hideCurrentSnackBar();
    scaffoldMessengerKey.currentState?.showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: Theme.of(context).colorScheme.secondary,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
        ),
        duration: duration ?? const Duration(seconds: 3),
      ),
    );
  }

  void showInfo(BuildContext context, String message, {Duration? duration}) {
    scaffoldMessengerKey.currentState?.hideCurrentSnackBar();
    scaffoldMessengerKey.currentState?.showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: Theme.of(context).colorScheme.primary,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
        ),
        duration: duration ?? const Duration(seconds: 3),
      ),
    );
  }
}

/// Convenience function to show error toast from anywhere.
void showErrorToast(BuildContext context, String message, {Duration? duration}) {
  ErrorToastService.scaffoldMessengerKey.currentState?.hideCurrentSnackBar();
  ErrorToastService.scaffoldMessengerKey.currentState?.showSnackBar(
    SnackBar(
      content: Text(message),
      backgroundColor: Theme.of(context).colorScheme.error,
      behavior: SnackBarBehavior.floating,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
      ),
      duration: duration ?? const Duration(seconds: 4),
      action: SnackBarAction(
        label: 'OK',
        textColor: Theme.of(context).colorScheme.onError,
        onPressed: () {
          ErrorToastService.scaffoldMessengerKey.currentState?.hideCurrentSnackBar();
        },
      ),
    ),
  );
}

/// Convenience function to show success toast from anywhere.
void showSuccessToast(BuildContext context, String message, {Duration? duration}) {
  ErrorToastService.scaffoldMessengerKey.currentState?.hideCurrentSnackBar();
  ErrorToastService.scaffoldMessengerKey.currentState?.showSnackBar(
    SnackBar(
      content: Text(message),
      backgroundColor: Theme.of(context).colorScheme.secondary,
      behavior: SnackBarBehavior.floating,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
      ),
      duration: duration ?? const Duration(seconds: 3),
    ),
  );
}

/// Convenience function to show info toast from anywhere.
void showInfoToast(BuildContext context, String message, {Duration? duration}) {
  ErrorToastService.scaffoldMessengerKey.currentState?.hideCurrentSnackBar();
  ErrorToastService.scaffoldMessengerKey.currentState?.showSnackBar(
    SnackBar(
      content: Text(message),
      backgroundColor: Theme.of(context).colorScheme.primary,
      behavior: SnackBarBehavior.floating,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
      ),
      duration: duration ?? const Duration(seconds: 3),
    ),
  );
}