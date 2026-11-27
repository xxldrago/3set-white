import "dart:async";

import "package:dio/dio.dart";
import "package:flutter_riverpod/flutter_riverpod.dart";
import "package:flutter_test/flutter_test.dart";
import "package:mobile/core/ping/libbox_core.dart";
import "package:mobile/core/vpn/config_repository.dart";
import "package:mobile/core/vpn/connection_notifier.dart";
import "package:mobile/core/vpn/connection_state.dart";
import "package:mobile/core/vpn/error_mapping.dart";
import "package:mobile/core/vpn/vpn_bridge.dart";
import "package:mobile/features/servers/providers.dart"
    show ConnectController, ConnectOutcome, connectControllerProvider;
import "package:mobile/features/servers/server.dart" show PoolTab;

const Map<String, dynamic> _opaqueConfig = <String, dynamic>{
  "inbounds": <Object?>[<String, Object?>{"type": "tun"}],
  "secret_marker": "SUPERSECRET-CONFIG-FRAGMENT",
};

class FakeSelection extends ConnectController {
  @override
  Future<ConnectOutcome> connect(
    PoolTab tab, {
    required bool auto,
    String? manualServerId,
  }) async =>
      const ConnectOutcome(ok: true, serverId: "srv-1");
}

/// Selection that parks the FSM in `pinging` until the test releases [gate].
class PendingSelection extends ConnectController {
  final Completer<void> started = Completer<void>();
  final Completer<ConnectOutcome> gate = Completer<ConnectOutcome>();

  @override
  Future<ConnectOutcome> connect(
    PoolTab tab, {
    required bool auto,
    String? manualServerId,
  }) {
    if (!started.isCompleted) started.complete();
    return gate.future;
  }
}

/// Config fetch that parks `connecting` until the test releases [gate].
class PendingConfig extends ConfigRepository {
  PendingConfig() : super(Dio());

  final Completer<void> fetchStarted = Completer<void>();
  final Completer<Map<String, dynamic>> gate =
      Completer<Map<String, dynamic>>();

  @override
  Future<Map<String, dynamic>> fetch(String serverId) {
    if (!fetchStarted.isCompleted) fetchStarted.complete();
    return gate.future;
  }
}

/// Bridge whose `stop()` only returns when [stopGate] is completed.
class GatedBridge implements VpnBridge {
  final Completer<void> stopGate = Completer<void>();
  final Completer<void> _stopFinished = Completer<void>();
  final StreamController<VpnBridgeEvent> _events =
      StreamController<VpnBridgeEvent>.broadcast();

  int stopCalls = 0;
  final List<String> calls = <String>[];
  Future<void> get stopFinished => _stopFinished.future;

  @override
  Stream<VpnBridgeEvent> get events => _events.stream;

  void emit(String code) => _events.add(VpnBridgeEvent(code));

  @override
  Future<void> prepare() async {
    calls.add("prepare");
  }

  @override
  Future<void> start(String configJson) async {
    calls.add("start");
  }

  @override
  Future<void> stop() async {
    stopCalls++;
    calls.add("stop");
    await stopGate.future;
    if (!_stopFinished.isCompleted) _stopFinished.complete();
  }

  @override
  Future<TrafficSnapshot> traffic() async => const TrafficSnapshot.zero();

  @override
  Future<bool> protect(int fd) async => true;

  @override
  void dispose() => _events.close();
}

ProviderContainer buildContainer({
  required ConfigRepository config,
  required VpnBridge bridge,
  required List<Map<String, Object?>> logs,
  required List<ErrorToast> toasts,
}) =>
    ProviderContainer(
      overrides: [
        connectControllerProvider.overrideWith(FakeSelection.new),
        configRepositoryProvider.overrideWithValue(config),
        vpnBridgeProvider.overrideWithValue(bridge),
        connectionTransitionLogProvider.overrideWithValue(logs.add),
        connectionToastProvider.overrideWithValue(toasts.add),
        connectionErrorLogProvider.overrideWithValue((_) {}),
      ],
    );

void main() {
  test("cancel stays disconnecting until stop completes, then idle + toast",
      () async {
    final logs = <Map<String, Object?>>[];
    final toasts = <ErrorToast>[];
    final config = PendingConfig();
    final bridge = GatedBridge();
    final container = buildContainer(
      config: config,
      bridge: bridge,
      logs: logs,
      toasts: toasts,
    );
    addTearDown(container.dispose);

    final notifier = container.read(connectionNotifierProvider.notifier);
    final connecting = notifier.connect(PoolTab.simple, auto: true);
    await config.fetchStarted.future;
    expect(container.read(connectionNotifierProvider).phase,
        ConnPhase.connecting);

    final cancelling = notifier.cancel();
    expect(container.read(connectionNotifierProvider).phase,
        ConnPhase.disconnecting);
    expect(bridge.stopCalls, 1);

    // The stale in-flight connect must not announce a tunnel after cancel.
    config.gate.complete(_opaqueConfig);
    await connecting;
    expect(container.read(connectionNotifierProvider).phase,
        ConnPhase.disconnecting);
    expect(toasts, isEmpty);

    bridge.stopGate.complete();
    await cancelling;

    final state = container.read(connectionNotifierProvider);
    expect(state.phase, ConnPhase.idle);
    expect(state.serverId, isNull);
    expect(toasts.length, 1);
    expect(toasts.single.message, "Подключение отменено");
    expect(
      logs.map((event) => event["to"]),
      containsAll(<String>["pinging", "connecting", "disconnecting", "idle"]),
    );
    // A cancel toast is not a permission retry.
    expect(toasts.single.retry, isFalse);
  });

  test("cancel is a no-op outside connecting (no orphan stop)", () async {
    final logs = <Map<String, Object?>>[];
    final toasts = <ErrorToast>[];
    final bridge = GatedBridge();
    final container = buildContainer(
      config: PendingConfig(),
      bridge: bridge,
      logs: logs,
      toasts: toasts,
    );
    addTearDown(container.dispose);

    await container.read(connectionNotifierProvider.notifier).cancel();

    expect(container.read(connectionNotifierProvider).phase, ConnPhase.idle);
    expect(bridge.stopCalls, 0);
    expect(toasts, isEmpty);
  });

  test("cancel during pinging reaches idle with the locked toast", () async {
    final logs = <Map<String, Object?>>[];
    final toasts = <ErrorToast>[];
    final selection = PendingSelection();
    final bridge = GatedBridge();
    final container = ProviderContainer(
      overrides: [
        connectControllerProvider.overrideWith(() => selection),
        configRepositoryProvider.overrideWithValue(PendingConfig()),
        vpnBridgeProvider.overrideWithValue(bridge),
        connectionTransitionLogProvider.overrideWithValue(logs.add),
        connectionToastProvider.overrideWithValue(toasts.add),
        connectionErrorLogProvider.overrideWithValue((_) {}),
      ],
    );
    addTearDown(container.dispose);

    final notifier = container.read(connectionNotifierProvider.notifier);
    final connecting = notifier.connect(PoolTab.simple, auto: true);
    await selection.started.future;
    expect(
      container.read(connectionNotifierProvider).phase,
      ConnPhase.pinging,
    );

    final cancelling = notifier.cancel();
    // A late selection success must never announce a tunnel after cancel.
    selection.gate.complete(
      const ConnectOutcome(ok: true, serverId: "srv-1"),
    );
    await connecting;
    bridge.stopGate.complete();
    await cancelling;

    final state = container.read(connectionNotifierProvider);
    expect(state.phase, ConnPhase.idle);
    expect(state.serverId, isNull);
    expect(toasts.length, 1);
    expect(toasts.single.message, "Подключение отменено");
    expect(
      logs.map((event) => event["to"]),
      containsAll(<String>["pinging", "disconnecting", "idle"]),
    );
    expect(logs.any((event) => event["to"] == "connecting"), isFalse);
    expect(bridge.stopCalls, 1);
  });

  test("revoke maps error → disconnecting → idle and stops the core", () async {
    final logs = <Map<String, Object?>>[];
    final toasts = <ErrorToast>[];
    final config = PendingConfig();
    final bridge = GatedBridge();
    final container = buildContainer(
      config: config,
      bridge: bridge,
      logs: logs,
      toasts: toasts,
    );
    addTearDown(container.dispose);

    final notifier = container.read(connectionNotifierProvider.notifier);
    final connecting = notifier.connect(PoolTab.simple, auto: true);
    await config.fetchStarted.future;
    config.gate.complete(_opaqueConfig);
    await connecting;
    expect(container.read(connectionNotifierProvider).phase,
        ConnPhase.connected);

    bridge.emit("revoked");
    // Stream delivery is scheduled in a microtask; the listener then maps
    // error → disconnecting before parking on the gated native stop.
    await Future<void>.value();
    expect(container.read(connectionNotifierProvider).phase,
        ConnPhase.disconnecting);
    expect(bridge.stopCalls, 1);
    expect(toasts.single.message, "Нужно разрешение VPN");
    expect(toasts.single.retry, isTrue);

    bridge.stopGate.complete();
    await bridge.stopFinished;
    await Future<void>.value();

    expect(container.read(connectionNotifierProvider).phase, ConnPhase.idle);
    expect(
      logs.map((event) => event["to"]),
      containsAll(<String>["connected", "error", "disconnecting", "idle"]),
    );
    expect(bridge.stopCalls, 1);
  });
}
