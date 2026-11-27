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
import "restart_backoff.dart";
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

  /// Last attempted selection, preserved so the snack bar's «Повторить»
  /// action retries the SAME failed attempt instead of just hiding (IN-01).
  PoolTab? _lastTab;
  String? _lastServerId;

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

  /// Cancels an in-flight attempt (`pinging` or `connecting`) without ever
  /// leaving an orphan tunnel.
  ///
  /// D-13/D-14: both phases show «Подключение…» and are therefore cancellable;
  /// `→ disconnecting`, then `await bridge.stop()` completes BEFORE `idle`.
  /// The generation bump makes a late selection/connect stale.
  Future<void> cancel() async {
    if (state.phase != ConnPhase.connecting &&
        state.phase != ConnPhase.pinging) return;
    ref.read(restartBackoffProvider).cancel();
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
    ref.read(restartBackoffProvider).cancel();
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
      case "core_stopped":
        // A native death/status-probe callback, never a simulated crash.
        handleCoreStopped();
    }
  }

  /// OS consent removed mid-tunnel: `error → disconnecting → idle` with the
  /// permission toast, and a real native stop before idle (D-11).
  Future<void> _handleRevoked() async {
    // IN-02: consent is gone; a queued 1/2/4 s retry must not fire a pointless
    // reconnect (and a second permission prompt) after revocation.
    ref.read(restartBackoffProvider).cancel();
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
    _lastTab = tab;
    _lastServerId = manualServerId;
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
  ///
  /// During a core restart, [onFailure] feeds the bounded backoff instead of
  /// going terminal immediately (auth/permission failures stay terminal).
  Future<void> _startTunnel(
    String serverId,
    int generation, {
    required String reason,
    String completionReason = "tunnel_up",
    void Function()? onFailure,
  }) async {
    _transition(
      ConnPhase.connecting,
      reason: reason,
      serverId: serverId,
    );
    // A reselect on reconnect may have changed the server; keep the latest.
    _lastServerId = serverId;

    final Map<String, dynamic> config;
    try {
      config = await ref.read(configRepositoryProvider).fetch(serverId);
    } on ConfigRepositoryException catch (error) {
      _handleStartFailure(
        error.code,
        "config_failed",
        generation,
        onFailure,
      );
      return;
    } on Object {
      // WR-01: never leave `connecting` on an unexpected config failure.
      _handleStartFailure(
        "config_invalid",
        "config_failed",
        generation,
        onFailure,
      );
      return;
    }
    if (generation != _generation) return;

    final bridge = ref.read(vpnBridgeProvider);
    try {
      // OS VPN consent (D-10). A denial stays an error with a stable code.
      await bridge.prepare();
    } on VpnBridgeException catch (error) {
      _handleStartFailure(
        error.code,
        "permission_denied",
        generation,
        onFailure,
      );
      return;
    } on Object {
      // WR-01: an unexpected prepare failure must still reach `error` + toast.
      _handleStartFailure(
        "config_invalid",
        "permission_denied",
        generation,
        onFailure,
      );
      return;
    }
    if (generation != _generation) return;

    try {
      // The config is opaque: serialized straight to the bridge, never logged
      // or rendered. No sleep, no fake connected, no simulated IP (D-20).
      await bridge.start(jsonEncode(config));
    } on VpnBridgeException catch (error) {
      _handleStartFailure(
        _safeBridgeCode(error.code),
        "bridge_start_failed",
        generation,
        onFailure,
      );
      return;
    } on Object {
      // WR-01 safety net: a bridge that throws something other than
      // VpnBridgeException still fails the FSM closed with a stable code.
      _handleStartFailure(
        "config_invalid",
        "bridge_start_failed",
        generation,
        onFailure,
      );
      return;
    }
    if (generation != _generation) return;

    _transition(
      ConnPhase.connected,
      reason: completionReason,
      serverId: serverId,
      connectedAt: DateTime.now(),
    );
    // A healthy session clears the restart failure count (D-18).
    ref.read(restartBackoffProvider).reset();
  }

  /// Maps a start failure to the next bounded retry, except for terminal auth
  /// and permission codes which must surface their fixed RU toast at once.
  void _handleStartFailure(
    String code,
    String reason,
    int generation,
    void Function()? onFailure,
  ) {
    if (generation != _generation) return;
    const terminal = <String>{
      "no_active_key",
      "auth_failed",
      "permission_denied",
    };
    if (onFailure != null && !terminal.contains(code)) {
      onFailure();
      return;
    }
    _fail(_safeBridgeCode(code), reason: reason);
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

  /// A native core stop / status-probe signal (D-18). Dart cannot catch a
  /// native abort, so this callback is the only crash input — no simulated
  /// crash, timer or `sleep` is ever created here.
  Future<void> handleCoreStopped() async {
    if (state.phase != ConnPhase.connected) return;
    final serverId = state.serverId;
    if (serverId == null || serverId.isEmpty) return;

    final generation = ++_generation;
    _transition(ConnPhase.disconnecting, reason: "core_stopped");
    if (!await _awaitStop(generation)) return;
    if (generation != _generation) return;
    // Keep serverId so a retry can restart without a new selection round.
    _transition(
      ConnPhase.idle,
      reason: "core_stopped_cleanup",
      serverId: serverId,
    );
    _scheduleCoreRetry(serverId);
  }

  /// Schedules the next bounded retry; terminal failure emits the fixed toast.
  void _scheduleCoreRetry(String serverId) {
    ref.read(restartBackoffProvider).schedule(
          onRetry: () => unawaited(_restartCore(serverId)),
          onExhausted: () =>
              _fail("core_stopped", reason: "core_stopped_exhausted"),
        );
  }

  /// Re-runs the same `connecting` path through the bridge with a fresh
  /// generation token; a failed retry feeds the next bounded delay.
  Future<void> _restartCore(String serverId) async {
    // A failed retry leaves the FSM in `connecting`; it is still retryable.
    if (state.phase != ConnPhase.idle &&
        state.phase != ConnPhase.connecting) {
      return;
    }
    final generation = ++_generation;
    await _startTunnel(
      serverId,
      generation,
      reason: "core_restart",
      completionReason: "core_restart_tunnel_up",
      onFailure: () => _scheduleCoreRetry(serverId),
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
    final toast = errorToastFor(errorCode);
    ref.read(connectionToastProvider)(
      toast.retry
          ? ErrorToast(
              toast.message,
              retry: true,
              // IN-01: the snack-bar action re-runs the failed connect.
              action: () => unawaited(retryLastAction()),
            )
          : toast,
    );
  }

  /// Re-runs the last failed attempt with its original tab/server (IN-01).
  /// No new selection round is started when a concrete server was chosen.
  Future<void> retryLastAction() async {
    final tab = _lastTab;
    if (tab == null) return;
    final serverId = _lastServerId;
    await connect(tab, auto: serverId == null, manualServerId: serverId);
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
