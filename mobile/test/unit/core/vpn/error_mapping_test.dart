import "package:flutter_test/flutter_test.dart";
import "package:mobile/core/vpn/error_mapping.dart";

void main() {
  test("every stable code maps to its exact locked RU string", () {
    expect(errorToastFor(ErrorCode.permissionDenied).message,
        "Нужно разрешение VPN");
    expect(errorToastFor(ErrorCode.revoked).message, "Нужно разрешение VPN");
    expect(errorToastFor(ErrorCode.authFailed).message, "Нет активного ключа");
    expect(errorToastFor(ErrorCode.noActiveKey).message, "Нет активного ключа");
    expect(errorToastFor(ErrorCode.unreachable).message, "Сервер недоступен");
    expect(errorToastFor(ErrorCode.configInvalid).message,
        "Не удалось подготовить подключение");
    expect(errorToastFor(ErrorCode.coreStopped).message,
        "VPN остановлен, попробуйте снова");
    expect(errorToastFor(ErrorCode.cancelled).message,
        "Подключение отменено");
    expect(errorToastFor(ErrorCode.networkChanged).message,
        "Сеть изменена — переподключение");
    expect(errorToastFor(ErrorCode.killSwitchNotice).message,
        "Kill switch: трафик вне VPN заблокирован");
  });

  test("permission errors carry the «Повторить» action flag only", () {
    expect(errorToastFor(ErrorCode.permissionDenied).retry, isTrue);
    expect(errorToastFor(ErrorCode.revoked).retry, isTrue);
    for (final code in ErrorCode.values) {
      if (code == ErrorCode.permissionDenied || code == ErrorCode.revoked) {
        continue;
      }
      expect(errorToastFor(code).retry, isFalse, reason: code.wire);
    }
  });

  test("errorCodeFrom is fail-closed and every code has a wire value", () {
    expect(errorCodeFrom("permission_denied"), ErrorCode.permissionDenied);
    expect(errorCodeFrom("kill_switch_notice"), ErrorCode.killSwitchNotice);
    expect(errorCodeFrom("SIGABRT: fatal error in libbox"),
        ErrorCode.configInvalid);
    expect(ErrorCode.values.map((code) => code.wire).toSet().length,
        ErrorCode.values.length);
  });

  test("no raw text, config, link, token or fd reaches toasts or error logs",
      () {
    // Simulates the kind of raw material a native/BFF failure could carry.
    const leakyFragments = <String>[
      "SUPERSECRET-CONFIG-FRAGMENT",
      "vless://",
      "Bearer eyJhbGciOi",
      "fd=42",
      "SIGABRT",
      "java.lang.IllegalStateException",
      "0xDEADBEEF",
    ];

    final rendered = StringBuffer();
    for (final code in ErrorCode.values) {
      rendered.writeln(errorToastFor(code).message);
      final fields = connectionErrorFields(code, "error", durationMs: 17);
      expect(fields.keys.toSet(), <String>{"code", "state", "durationMs"});
      expect(fields["code"], code.wire);
      expect(fields["state"], "error");
      expect(fields["durationMs"], 17);
      rendered.writeln(fields.values.join(" "));
    }
    final text = rendered.toString();
    for (final fragment in leakyFragments) {
      expect(text.contains(fragment), isFalse, reason: fragment);
    }
  });
}
