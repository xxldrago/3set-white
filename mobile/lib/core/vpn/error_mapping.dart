import "package:flutter/material.dart";
import "package:flutter_riverpod/flutter_riverpod.dart";

import "../../features/auth/widgets/error_toast.dart"
    show ErrorToastService;
import "../../utils/logger.dart";

/// Stable codes allowed to cross from native/BFF boundaries into the FSM (D-19).
///
/// Every value maps to one fixed Russian string; no raw libbox, Android, iOS,
/// config, link, token or fd text is ever carried in this vocabulary.
enum ErrorCode {
  /// OS VPN consent was denied; toast carries a «Повторить» action.
  permissionDenied("permission_denied"),
  /// Consent was revoked during an active tunnel (D-11).
  revoked("revoked"),
  /// Access token/auth gate failed.
  authFailed("auth_failed"),
  /// Backend reported no owned, active key.
  noActiveKey("no_active_key"),
  /// Selected server is unreachable.
  unreachable("unreachable"),
  /// Backend config was missing or malformed.
  configInvalid("config_invalid"),
  /// Native core stopped unexpectedly (backoff input for plan 06).
  coreStopped("core_stopped"),
  /// User cancelled a connecting attempt.
  cancelled("cancelled"),
  /// Network changed (reconnect toast; trigger wired in plan 06).
  networkChanged("network_changed"),
  /// Always-on kill switch notice (D-12).
  killSwitchNotice("kill_switch_notice");

  /// Creates a code with its stable wire value.
  const ErrorCode(this.wire);

  /// Machine-readable value sent to logs and the FSM.
  final String wire;
}

/// Maps any stable wire code to the vocabulary, fail-closed to config error.
ErrorCode errorCodeFrom(String code) => ErrorCode.values.firstWhere(
  (candidate) => candidate.wire == code,
  orElse: () => ErrorCode.configInvalid,
);

/// A fixed RU toast with an optional «Повторить» action flag.
class ErrorToast {
  /// Creates a toast from [message] and its [retry] flag.
  const ErrorToast(this.message, {this.retry = false});

  /// Exact locked Russian copy from 20-CONTEXT §specifics.
  final String message;

  /// Whether the UI must offer a «Повторить» action (permission denials).
  final bool retry;
}

/// Stable code → exact locked RU toast (D-12/D-19).
///
/// This function is the ONLY place user-visible error copy is produced. It
/// never accepts an exception, config fragment or platform message.
ErrorToast errorToastFor(ErrorCode code) => switch (code) {
  ErrorCode.permissionDenied => const ErrorToast(
    "Нужно разрешение VPN",
    retry: true,
  ),
  ErrorCode.revoked => const ErrorToast(
    "Нужно разрешение VPN",
    retry: true,
  ),
  ErrorCode.authFailed => const ErrorToast("Нет активного ключа"),
  ErrorCode.noActiveKey => const ErrorToast("Нет активного ключа"),
  ErrorCode.unreachable => const ErrorToast("Сервер недоступен"),
  ErrorCode.configInvalid => const ErrorToast(
    "Не удалось подготовить подключение",
  ),
  ErrorCode.coreStopped => const ErrorToast(
    "VPN остановлен, попробуйте снова",
  ),
  ErrorCode.cancelled => const ErrorToast("Подключение отменено"),
  ErrorCode.networkChanged => const ErrorToast(
    "Сеть изменена — переподключение",
  ),
  ErrorCode.killSwitchNotice => const ErrorToast(
    "Kill switch: трафик вне VPN заблокирован",
  ),
};

/// Builds the only structured error-log payload allowed (D-19).
///
/// Exactly `{code, state, durationMs}` — no exception text, config, link,
/// token, fd or raw provider message can reach this map.
Map<String, Object?> connectionErrorFields(
  ErrorCode code,
  String state, {
  int durationMs = 0,
}) =>
    <String, Object?>{
      "code": code.wire,
      "state": state,
      "durationMs": durationMs,
    };

/// Sink for user-visible connection toasts; overridden in unit tests.
typedef ConnectionToastSink = void Function(ErrorToast toast);

/// Default sink renders on the app's global ScaffoldMessenger key.
void _showConnectionToast(ErrorToast toast) {
  final messenger = ErrorToastService.scaffoldMessengerKey.currentState;
  if (messenger == null) return;
  messenger.hideCurrentSnackBar();
  messenger.showSnackBar(
    SnackBar(
      content: Text(toast.message),
      behavior: SnackBarBehavior.floating,
      action: toast.retry
          ? SnackBarAction(
              label: "Повторить",
              onPressed: messenger.hideCurrentSnackBar,
            )
          : null,
    ),
  );
}

/// Default toast provider; plan 07 may replace the surface without changing
/// the stable-code → fixed-copy mapping.
final Provider<ConnectionToastSink> connectionToastProvider =
    Provider<ConnectionToastSink>((ref) => _showConnectionToast);

/// Sink for structured connection error logs; overridden in unit tests.
typedef ConnectionErrorLogSink = void Function(Map<String, Object?> fields);

/// Default error log sink via `createLogger('ConnectionNotifier')`.
final Provider<ConnectionErrorLogSink> connectionErrorLogProvider =
    Provider<ConnectionErrorLogSink>((ref) {
  final logger = createLogger("ConnectionNotifier");
  return (fields) =>
      logger.logStructured(LogLevel.info, "connection_error", fields);
});
