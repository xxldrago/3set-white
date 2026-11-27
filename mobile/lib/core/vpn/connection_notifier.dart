import "dart:async";
import "dart:convert";

import "package:connectivity_plus/connectivity_plus.dart";
import "package:flutter_riverpod/flutter_riverpod.dart";

import "../../app/constants.dart" show ConnectivityConfig;
import "../../core/connectivity/connectivity_service.dart"
    show connectivityServiceProvider;
import "../../features/home/providers.dart" show currentTabProvider;
import "../../features/servers/providers.dart"
    show
        ConnectOutcome,
        connectControllerProvider,
        pingCacheProvider,
        pingDaoProvider,
        selectionProvider;
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

/// App-level listener wiring real OS connectivity changes into the FSM (D-15).
///
/// `App.build` watches this so the subscription lives as long as the app, the
/// same pattern used by `networkPingInvalidationProvider`. Keeping the stream
/// subscription here (rather than in [ConnectionNotifier.build]) lets pure
/// unit tests exercise the FSM without a Flutter platform binding.
final Provider<bool> connectionReconnectListenerProvider =
    Provider<bool>((ref) {
  final service = ref.read(connectivityServiceProvider);
  final subscription = service.connectivityStream.distinct().listen(
        (results) => ref
            .read(connectionNotifierProvider.notifier)
            .onConnectivityChanged(results),
      );
  ref.onDispose(subscription.cancel);
  return true;
});

/// Guarded connection FSM: pinging → connecting → connected, with `error`.
class ConnectionNotifier extends Notifier<ConnectionState> {
  /// Incremented on every new attempt/cancel; stale completions are ignored.
  int _generation = 0;

  /// Native `revoked`/`disconnect` events are fed into the same guarded FSM.
  StreamSubscription<VpnBridgeEvent>? _eventsSubscription;

  /// Coalesces genuine network changes with the locked 500 ms debounce (D-15).
  Timer? _reconnectDebounce;

  /// Previous result set, used to ignore `ConnectivityResult.vpn` self-changes.
  List<ConnectivityResult>? _lastConnectivity;

  @override
  ConnectionState build() {
    _generation = 0;
    _eventsSubscription?.cancel();
    _eventsSubscription =
        ref.read(vpnBridgeProvider).events.listen(_onBridgeEvent);
    ref.onDispose(() {
      _eventsSubscription?.cancel();
      _reconnectDebounce?.cancel();
    });
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

    await _startTunnel(serverId, generation, reason: "server_selected");
  }

  /// Runs the one shared `connecting` path: refetch `/config`, OS consent and
  /// the native start. Guarded by the same [generation] used by [connect] and
  /// [reconnect], so a stale completion can never announce a second tunnel.
  Future<void> _startTunnel(
    String serverId,
    int generation, {
    required String reason,
    String completionReason = "tunnel_up",
  }) async {
    _transition(
      ConnPhase.connecting,
      reason: reason,
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
      reason: completionReason,
      serverId: serverId,
      connectedAt: DateTime.now(),
    );
  }

  /// D-15/REQ-PING-05: a genuine network change while connected invalidates
  /// the phase-19 ping cache, reselects by RTT and re-runs the SAME FSM with
  /// one fixed toast. VPN-only self-changes never reach this method.
  Future<void> reconnect() async {
    if (state.phase != ConnPhase.connected) return;
    final generation = ++_generation;
    final tab = ref.read(currentTabProvider);

    _transition(ConnPhase.pinging, reason: "network_changed");
    // Selection and current_tab are deliberately preserved by the DAO (D-11).
    await ref.read(pingDaoProvider).clearPingCacheAndLastGood();
    ref.invalidate(pingCacheProvider(tab));
    if (generation != _generation) return;

    final ConnectOutcome outcome;
    try {
      outcome = await ref.read(connectControllerProvider.notifier).connect(
            tab,
            auto: true,
          );
    } on Object {
      if (generation == _generation) {
        _fail("unreachable", reason: "reconnect_selection_error");
      }
      return;
    }
    if (generation != _generation) return;

    if (!outcome.ok) {
      _fail(
        outcome.blocked ? "no_active_key" : "unreachable",
        reason: "reconnect_selection_failed",
      );
      return;
    }
    final serverId = outcome.serverId;
    if (serverId == null || serverId.isEmpty) {
      _fail("config_invalid", reason: "reconnect_missing_server_id");
      return;
    }

    // The server MAY change; persist it before any native restart so the next
    // connect uses the reselected server (Pitfall 5).
    await ref.read(selectionProvider(tab).notifier).select(serverId);
    if (generation != _generation) return;

    // Exactly one toast per network change, not per FSM transition.
    ref
        .read(connectionToastProvider)
        (errorToastFor(ErrorCode.networkChanged));

    _transition(
      ConnPhase.disconnecting,
      reason: "network_change_restart",
      serverId: serverId,
    );
    if (!await _awaitStop(generation)) return;
    if (generation != _generation) return;

    // Refetch /config for the possibly-new serverId: D-03's per-request key
    // gate turns a key that expired mid-tunnel into `no_active_key` → error.
    await _startTunnel(
      serverId,
      generation,
      reason: "network_change_connecting",
      completionReason: "network_change_tunnel_up",
    );
  }

  /// Real connectivity event from [connectionReconnectListenerProvider]. The
  /// first event seeds the baseline; a set-equal event is not a change; a
  /// VPN-only delta is the tunnel reporting itself; every other delta is
  /// debounced and reconnects only while `connected`.
  void onConnectivityChanged(List<ConnectivityResult> results) {
    final previous = _lastConnectivity;
    _lastConnectivity = results;
    if (previous == null) return;
    if (_sameResults(previous, results)) return;
    if (_vpnOnly(previous, results)) return;
    if (state.phase != ConnPhase.connected) return;

    _reconnectDebounce?.cancel();
    _reconnectDebounce = Timer(ConnectivityConfig.debounceDuration, () {
      _reconnectDebounce = null;
      unawaited(reconnect());
    });
  }

  /// Order-independent comparison of two full result sets.
  static bool _sameResults(
    List<ConnectivityResult> left,
    List<ConnectivityResult> right,
  ) {
    final a = left.toSet();
    final b = right.toSet();
    return a.length == b.length && a.every(b.contains);
  }

  /// True when dropping `vpn` (and the no-interface sentinel `none`) makes the
  /// two sets equal — i.e. the only change is the VPN interface itself.
  static bool _vpnOnly(
    List<ConnectivityResult> previous,
    List<ConnectivityResult> current,
  ) {
    Set<ConnectivityResult> realInterfaces(
      List<ConnectivityResult> results,
    ) =>
        results
            .where(
              (result) =>
                  result != ConnectivityResult.vpn &&
                  result != ConnectivityResult.none,
            )
            .toSet();
    final a = realInterfaces(previous);
    final b = realInterfaces(current);
    return a.length == b.length && a.every(b.contains);
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
