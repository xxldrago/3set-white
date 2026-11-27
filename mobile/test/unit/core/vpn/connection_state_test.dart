import "dart:async";

import "package:dio/dio.dart";
import "package:flutter_riverpod/flutter_riverpod.dart";
import "package:flutter_test/flutter_test.dart";
import "package:mobile/core/ping/libbox_core.dart";
import "package:mobile/core/vpn/config_repository.dart";
import "package:mobile/core/vpn/connection_notifier.dart";
import "package:mobile/core/vpn/connection_state.dart";
import "package:mobile/core/vpn/vpn_bridge.dart";
import "package:mobile/features/servers/providers.dart"
    show ConnectController, ConnectOutcome, connectControllerProvider;
import "package:mobile/features/servers/server.dart" show PoolTab;

/// Opaque config carrying a secret-like fragment: it may reach the bridge but
/// must NEVER appear in a transition log, toast or FSM state.
Map<String, dynamic> get opaqueConfig => <String, dynamic>{
  "inbounds": <Object?>[<String, Object?>{"type": "tun"}],
  "secret_marker": "SUPERSECRET-CONFIG-FRAGMENT",
};

class FakeConnectController extends ConnectController {
  FakeConnectController(this._outcomes, {this.firstGate});

  final List<ConnectOutcome> _outcomes;

  /// Optional gate held before the first selection resolves; lets a test park
  /// one connect attempt in `pinging` while a newer attempt runs.
  final Future<void>? firstGate;
  int calls = 0;

  @override
  Future<ConnectOutcome> connect(
    PoolTab tab, {
    required bool auto,
    String? manualServerId,
  }) async {
    final index = calls++;
    if (index == 0) await firstGate;
    return _outcomes[index < _outcomes.length ? index : _outcomes.length - 1];
  }
}

class FakeConfigRepository extends ConfigRepository {
  FakeConfigRepository({
    List<Future<Map<String, dynamic>> Function(String serverId)>? answers,
  })  : _answers = answers ?? <Future<Map<String, dynamic>> Function(String)>[
          (serverId) async => opaqueConfig,
        ],
        super(Dio());

  final List<Future<Map<String, dynamic>> Function(String serverId)> _answers;
  final List<String> fetches = <String>[];
  int _calls = 0;

  @override
  Future<Map<String, dynamic>> fetch(String serverId) {
    fetches.add(serverId);
    final index = _calls++;
    return _answers[index < _answers.length ? index : _answers.length - 1](
      serverId,
    );
  }
}

class FakeVpnBridge implements VpnBridge {
  final List<String> calls = <String>[];
  String? lastConfig;
  final StreamController<VpnBridgeEvent> _events =
      StreamController<VpnBridgeEvent>.broadcast();

  @override
  Stream<VpnBridgeEvent> get events => _events.stream;

  @override
  Future<void> prepare() async => calls.add("prepare");

  @override
  Future<void> start(String configJson) async {
    calls.add("start");
    lastConfig = configJson;
  }

  @override
  Future<void> stop() async => calls.add("stop");

  @override
  Future<TrafficSnapshot> traffic() async => const TrafficSnapshot.zero();

  @override
  Future<bool> protect(int fd) async => true;

  @override
  void dispose() => _events.close();
}

void main() {
  test("idle → pinging → connecting → connected runs the real slice safely",
      () async {
    final logs = <Map<String, Object?>>[];
    final selection = FakeConnectController(<ConnectOutcome>[
      const ConnectOutcome(ok: true, serverId: "srv-1"),
    ]);
    final config = FakeConfigRepository();
    final bridge = FakeVpnBridge();
    final container = ProviderContainer(
      overrides: [
        connectControllerProvider.overrideWith(() => selection),
        configRepositoryProvider.overrideWithValue(config),
        vpnBridgeProvider.overrideWithValue(bridge),
        connectionTransitionLogProvider.overrideWithValue(logs.add),
      ],
    );
    addTearDown(container.dispose);

    await container.read(connectionNotifierProvider.notifier).connect(
      PoolTab.simple,
      auto: true,
    );

    final state = container.read(connectionNotifierProvider);
    expect(state.phase, ConnPhase.connected);
    expect(state.serverId, "srv-1");
    expect(state.connectedAt, isNotNull);
    expect(config.fetches, <String>["srv-1"]);
    expect(bridge.calls, <String>["prepare", "start"]);
    // The opaque config is handed to the bridge verbatim, never simulated.
    expect(bridge.lastConfig, contains("SUPERSECRET-CONFIG-FRAGMENT"));

    expect(logs.map((event) => event["to"]), <String>[
      "pinging",
      "connecting",
      "connected",
    ]);
    for (final event in logs) {
      expect(event.keys.toSet(), <String>{"from", "to", "reason"});
      expect(
        event.values.any(
          (value) => value.toString().contains("SUPERSECRET-CONFIG-FRAGMENT"),
        ),
        isFalse,
      );
    }
  });

  test("no_active_key selection routes to error, never to config or bridge",
      () async {
    final selection = FakeConnectController(<ConnectOutcome>[
      const ConnectOutcome(ok: false, error: "no_active_key"),
    ]);
    final config = FakeConfigRepository();
    final bridge = FakeVpnBridge();
    final container = ProviderContainer(
      overrides: [
        connectControllerProvider.overrideWith(() => selection),
        configRepositoryProvider.overrideWithValue(config),
        vpnBridgeProvider.overrideWithValue(bridge),
        connectionTransitionLogProvider.overrideWithValue((_) {}),
      ],
    );
    addTearDown(container.dispose);

    await container.read(connectionNotifierProvider.notifier).connect(
      PoolTab.simple,
      auto: false,
    );

    final state = container.read(connectionNotifierProvider);
    expect(state.phase, ConnPhase.error);
    expect(state.errorCode, "no_active_key");
    expect(config.fetches, isEmpty);
    expect(bridge.calls, isEmpty);
  });

  test("a stale generation cannot overwrite a newer connected state", () async {
    final slowConfig = Completer<Map<String, dynamic>>();
    final selectionGate = Completer<void>();
    final selection = FakeConnectController(
      <ConnectOutcome>[
        const ConnectOutcome(ok: true, serverId: "slow"),
        const ConnectOutcome(ok: true, serverId: "fast"),
      ],
      firstGate: selectionGate.future,
    );
    final config = FakeConfigRepository(
      answers: <Future<Map<String, dynamic>> Function(String serverId)>[
        (serverId) => slowConfig.future,
        (serverId) async => opaqueConfig,
      ],
    );
    final bridge = FakeVpnBridge();
    final container = ProviderContainer(
      overrides: [
        connectControllerProvider.overrideWith(() => selection),
        configRepositoryProvider.overrideWithValue(config),
        vpnBridgeProvider.overrideWithValue(bridge),
        connectionTransitionLogProvider.overrideWithValue((_) {}),
      ],
    );
    addTearDown(container.dispose);

    final notifier = container.read(connectionNotifierProvider.notifier);
    final first = notifier.connect(PoolTab.simple, auto: true);
    // Park the first attempt in config fetch (awaiting slowConfig) before the
    // newer attempt starts, so the stale callback scenario is deterministic.
    selectionGate.complete();
    await Future<void>.value();
    await notifier.connect(PoolTab.simple, auto: true);

    expect(container.read(connectionNotifierProvider).phase,
        ConnPhase.connected);
    expect(container.read(connectionNotifierProvider).serverId, "fast");

    slowConfig.complete(opaqueConfig);
    await first;

    // The stale completion returned without writing an `idle`/`connected`
    // state over the newer attempt.
    expect(container.read(connectionNotifierProvider).phase,
        ConnPhase.connected);
    expect(container.read(connectionNotifierProvider).serverId, "fast");
  });

  test("locked button copy follows the phase", () {
    expect(ConnPhase.idle.buttonLabel, "Подключить");
    expect(ConnPhase.connecting.buttonLabel, "Подключение…");
    expect(ConnPhase.connected.buttonLabel, "Отключить");
  });
}
