import "dart:async";
import "dart:convert";

import "package:flutter_riverpod/flutter_riverpod.dart";

import "../../features/servers/providers.dart"
    show ConnectOutcome, connectControllerProvider;
import "../../features/servers/server.dart" show PoolTab;
import "../../utils/logger.dart";
import "config_repository.dart";
import "connection_state.dart";
import "error_mapping.dart";
import "vpn_bridge.dart";

/// Sink for connection transition events. Each event is EXACTLY
/// `{from, to, reason}` — no config, link, token, fd or raw error text (D-13).
typedef ConnectionTransitionLog = void Function(Map<String, Object?> event);

/// Default structured sink: `createLogger('ConnectionNotifier')` + pino-style
/// fields. Tests override this provider with an in-memory recorder.
final Provider<ConnectionTransitionLog> connectionTransitionLogProvider =
    Provider<ConnectionTransitionLog>((ref) {
  final logger = createLogger("ConnectionNotifier");
  return (event) =>
      logger.logStructured(LogLevel.info, "transition", event);
});

/// The single owner of connection state (D-13).
///
/// Every phase change goes through `_transition`, which logs `{from,to,reason}`
/// and is guarded by the generation token so a stale completion can never
/// overwrite a newer state. Cancel/revoke await native stop before idle (D-14)
/// so no orphan tunnel survives; only stable codes reach toasts and logs.
final NotifierProvider<ConnectionNotifier, ConnectionState>
    connectionNotifierProvider =
    NotifierProvider<ConnectionNotifier, ConnectionState>(
  ConnectionNotifier.new,
);

/// Guarded connection FSM: pinging → connecting → connected, with `error`.
class ConnectionNotifier extends Notifier<ConnectionState> {
  /// Incremented on every new attempt/cancel; stale completions are ignored.
  int _generation = 0;

  /// Native `revoked`/`disconnect` events are fed into the same guarded FSM.
  StreamSubscription<VpnBridgeEvent>? _eventsSubscription;

  @override
  ConnectionState build() {
    _generation = 0;
    _eventsSubscription?.cancel();
    _eventsSubscription =
        ref.read(vpnBridgeProvider).events.listen(_onBridgeEvent);
    ref.onDispose(() => _eventsSubscription?.cancel());
    return const ConnectionState();
  }

  /// Cancels a `connecting` attempt without ever leaving an orphan tunnel.
  ///
  /// D-14: `connecting → disconnecting`, then `await bridge.stop()` completes
  /// BEFORE `idle`; the generation bump makes the in-flight connect stale.
  Future<void> cancel() async {
    if (state.phase != ConnPhase.connecting) return;
    final generation = ++_generation;
    _transition(ConnPhase.disconnecting, reason: "cancel_requested");
    if (!await _awaitStop(generation)) return;
    if (generation != _generation) return;
    _transition(ConnPhase.idle, reason: "cancelled");
    ref.read(connectionToastProvider)(errorToastFor(ErrorCode.cancelled));
  }

  /// Disconnects an active tunnel, awaiting stop before idle. Kill switch is
  /// always on, so the user is told traffic outside the VPN is blocked (D-12).
  Future<void> disconnect() async {
    if (state.phase != ConnPhase.connected) return;
    final generation = ++_generation;
    _transition(ConnPhase.disconnecting, reason: "disconnect_requested");
    if (!await _awaitStop(generation)) return;
    if (generation != _generation) return;
    _transition(ConnPhase.idle, reason: "disconnected");
    ref
        .read(connectionToastProvider)
        (errorToastFor(ErrorCode.killSwitchNotice));
  }

  /// Awaits the native stop; on failure stays in `error` (never a fake idle).
  Future<bool> _awaitStop(int generation) async {
    try {
      await ref.read(vpnBridgeProvider).stop();
      return true;
    } on VpnBridgeException catch (error) {
      if (generation == _generation) {
        _fail(error.code, reason: "stop_failed");
      }
      return false;
    }
  }

  void _onBridgeEvent(VpnBridgeEvent event) {
    switch (event.code) {
      case "revoked":
        _handleRevoked();
      case "disconnect":
        disconnect();
    }
  }

  /// OS consent removed mid-tunnel: `error → disconnecting → idle` with the
  /// permission toast, and a real native stop before idle (D-11).
  Future<void> _handleRevoked() async {
    final generation = ++_generation;
    _transition(
      ConnPhase.error,
      reason: "permission_revoked",
      errorCode: "revoked",
    );
    _emitError("revoked");
    _transition(ConnPhase.disconnecting, reason: "revoke_cleanup");
    if (!await _awaitStop(generation)) return;
    if (generation != _generation) return;
    _transition(ConnPhase.idle, reason: "revoked_cleanup_done");
  }

  /// Connect using the phase-19 selection step, then backend config, then the
  /// native bridge. `connected` is set only after [VpnBridge.start] returns.
  Future<void> connect(
    PoolTab tab, {
    required bool auto,
    String? manualServerId,
  }) async {
    final generation = ++_generation;
    _transition(ConnPhase.pinging, reason: "connect_requested");

    final ConnectOutcome outcome;
    try {
      outcome = await ref.read(connectControllerProvider.notifier).connect(
            tab,
            auto: auto,
            manualServerId: manualServerId,
          );
    } on Object {
      if (generation == _generation) {
        _fail("unreachable", reason: "selection_error");
      }
      return;
    }
    if (generation != _generation) return;

    // D-13: blocked → auth error; all_offline/no_servers → unreachable.
    if (!outcome.ok) {
      _fail(
        outcome.blocked ? "no_active_key" : "unreachable",
        reason: "selection_failed",
      );
      return;
    }
    final serverId = outcome.serverId;
    if (serverId == null || serverId.isEmpty) {
      _fail("config_invalid", reason: "missing_server_id");
      return;
    }

    _transition(
      ConnPhase.connecting,
      reason: "server_selected",
      serverId: serverId,
    );

    final Map<String, dynamic> config;
    try {
      config = await ref.read(configRepositoryProvider).fetch(serverId);
    } on ConfigRepositoryException catch (error) {
      if (generation != _generation) return;
      _fail(error.code, reason: "config_failed");
      return;
    }
    if (generation != _generation) return;

    final bridge = ref.read(vpnBridgeProvider);
    try {
      // OS VPN consent (D-10). A denial stays an error with a stable code.
      await bridge.prepare();
    } on VpnBridgeException catch (error) {
      if (generation != _generation) return;
      _fail(error.code, reason: "permission_denied");
      return;
    }
    if (generation != _generation) return;

    try {
      // The config is opaque: serialized straight to the bridge, never logged
      // or rendered. No sleep, no fake connected, no simulated IP (D-20).
      await bridge.start(jsonEncode(config));
    } on VpnBridgeException catch (error) {
      if (generation != _generation) return;
      _fail(_safeBridgeCode(error.code), reason: "bridge_start_failed");
      return;
    }
    if (generation != _generation) return;

    _transition(
      ConnPhase.connected,
      reason: "tunnel_up",
      serverId: serverId,
      connectedAt: DateTime.now(),
    );
  }

  /// Maps a bridge code to the stable vocabulary (no raw platform text).
  String _safeBridgeCode(String code) {
    const allowed = <String>{
      "permission_denied",
      "revoked",
      "auth_failed",
      "no_active_key",
      "unreachable",
      "config_invalid",
      "core_stopped",
    };
    return allowed.contains(code) ? code : "config_invalid";
  }

  /// Enters `error` with a stable [code]; never a raw message. The matching
  /// fixed RU toast and `{code,state,durationMs}` log are emitted here too.
  void _fail(String code, {required String reason}) {
    _transition(ConnPhase.error, reason: reason, errorCode: code);
    _emitError(code);
  }

  /// Emits only a stable-code toast and a structured, secret-free log.
  void _emitError(String code) {
    final errorCode = errorCodeFrom(_safeBridgeCode(code));
    ref.read(connectionErrorLogProvider)(
      connectionErrorFields(errorCode, state.phase.name),
    );
    ref.read(connectionToastProvider)(errorToastFor(errorCode));
  }

  /// The only place state is written. Logs exactly `{from,to,reason}`.
  void _transition(
    ConnPhase to, {
    required String reason,
    String? serverId,
    DateTime? connectedAt,
    int? rtt,
    String? ip,
    int? down,
    int? up,
    String? errorCode,
  }) {
    final from = state.phase;
    ref.read(connectionTransitionLogProvider)(<String, Object?>{
      "from": from.name,
      "to": to.name,
      "reason": reason,
    });
    // Build explicitly: freezed nullable copyWith cannot distinguish "clear"
    // from "unchanged", so every transition states the safe fields it carries.
    state = ConnectionState(
      phase: to,
      serverId: serverId,
      connectedAt: connectedAt,
      rtt: rtt,
      ip: ip,
      down: down ?? 0,
      up: up ?? 0,
      errorCode: errorCode,
    );
  }
}
