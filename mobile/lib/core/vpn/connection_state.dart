import "package:freezed_annotation/freezed_annotation.dart";

part "connection_state.freezed.dart";

/// Lifecycle phases of the VPN connection (D-13).
///
/// The only owner of these transitions is the connection notifier; the
/// connected panel (plan 07) reads them but never writes them. `error` is
/// reachable from
/// every state. There is deliberately no simulated/fake phase.
enum ConnPhase {
  /// No tunnel. Button: «Подключить».
  idle,

  /// Phase-19 server selection (ping) in flight.
  pinging,

  /// Backend `/config` fetch + native tunnel start in flight. Button: «Подключение…».
  connecting,

  /// Native bridge reported the tunnel is up. Button: «Отключить».
  connected,

  /// Native `stop()` is awaited before returning to [idle].
  disconnecting,

  /// A stable error code was mapped; no raw provider/config text is carried.
  error;
}

/// Metadata-only, safe view of the connection (D-05/D-19).
///
/// Carries exactly: phase, serverId, connectedAt, rtt, ip, down, up, errorCode.
/// It NEVER carries config, outbound, subscription links, tokens, secrets or a
/// TUN fd — those stay machine-only and are never stored in UI state.
@freezed
abstract class ConnectionState with _$ConnectionState {
  /// Creates a connection snapshot; all fields are safe to render or log.
  const factory ConnectionState({
    @Default(ConnPhase.idle) ConnPhase phase,
    String? serverId,
    DateTime? connectedAt,
    int? rtt,
    String? ip,
    @Default(0) int down,
    @Default(0) int up,
    String? errorCode,
  }) = _ConnectionState;
}

/// Locked button copy derived from the phase (D-13; UI wired in plan 07).
extension ConnectionButtonCopy on ConnPhase {
  /// Text for the single connect/disconnect button in this phase.
  String get buttonLabel => switch (this) {
    ConnPhase.idle => "Подключить",
    ConnPhase.connecting || ConnPhase.pinging => "Подключение…",
    ConnPhase.connected => "Отключить",
    ConnPhase.disconnecting => "Отключение…",
    ConnPhase.error => "Повторить",
  };
}
