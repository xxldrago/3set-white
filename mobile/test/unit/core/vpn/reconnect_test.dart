import "dart:async";

import "package:connectivity_plus/connectivity_plus.dart";
import "package:dio/dio.dart";
import "package:drift/native.dart";
import "package:flutter_riverpod/flutter_riverpod.dart";
import "package:flutter_test/flutter_test.dart";
import "package:mobile/core/connectivity/connectivity_service.dart";
import "package:mobile/core/db/app_database.dart";
import "package:mobile/core/db/ping_cache_dao.dart";
import "package:mobile/core/ping/libbox_core.dart";
import "package:mobile/core/ping/ping_repository.dart";
import "package:mobile/core/vpn/config_repository.dart";
import "package:mobile/core/vpn/connection_notifier.dart"
    show
        ConnectionNotifier,
        connectionNotifierProvider,
        connectionReconnectListenerProvider,
        connectionTransitionLogProvider;
import "package:mobile/core/vpn/connection_state.dart";
import "package:mobile/core/vpn/error_mapping.dart";
import "package:mobile/core/vpn/vpn_bridge.dart";
import "package:mobile/features/servers/providers.dart"
    show ConnectController, ConnectOutcome, connectControllerProvider;
import "package:mobile/features/servers/server.dart" show PoolTab;
import "package:mocktail/mocktail.dart";

const Map<String, dynamic> _opaqueConfig = <String, dynamic>{
  "inbounds": <Object?>[<String, Object?>{"type": "tun"}],
  "secret_marker": "SUPERSECRET-CONFIG-FRAGMENT",
};

class MockConnectivity extends Mock implements Connectivity {}

/// Selection seam returning one queued server id per call.
class FakeSelection extends ConnectController {
  FakeSelection(this.serverIds);

  final List<String> serverIds;
  final List<String> calls = <String>[];
  int _index = 0;

  @override
  Future<ConnectOutcome> connect(
    PoolTab tab, {
    required bool auto,
    String? manualServerId,
  }) async {
    calls.add("${tab.wireName}:auto=$auto:manual=$manualServerId");
    final id = serverIds[_index.clamp(0, serverIds.length - 1)];
    _index++;
    return ConnectOutcome(ok: true, serverId: id);
  }
}

/// `/config` seam recording each serverId and able to fail with D-03's code.
class FakeConfig extends ConfigRepository {
  FakeConfig() : super(Dio());

  final List<String> fetches = <String>[];
  Completer<Map<String, dynamic>>? gate;
  bool failWithNoActiveKey = false;

  @override
  Future<Map<String, dynamic>> fetch(String serverId) {
    fetches.add(serverId);
    final pending = gate;
    if (pending != null) {
      gate = null;
      return pending.future;
    }
    if (failWithNoActiveKey) {
      throw const ConfigRepositoryException("no_active_key");
    }
    return Future<Map<String, dynamic>>.value(_opaqueConfig);
  }
}

/// Bridge seam recording native calls in order.
class FakeBridge implements VpnBridge {
  final StreamController<VpnBridgeEvent> _events =
      StreamController<VpnBridgeEvent>.broadcast();
  final List<String> calls = <String>[];
  final List<String> startedConfigs = <String>[];

  @override
  Stream<VpnBridgeEvent> get events => _events.stream;

  @override
  Future<void> prepare() async {
    calls.add("prepare");
  }

  @override
  Future<void> start(String configJson) async {
    calls.add("start");
    startedConfigs.add(configJson);
  }

  @override
  Future<void> stop() async {
    calls.add("stop");
  }

  @override
  Future<TrafficSnapshot> traffic() async => const TrafficSnapshot.zero();

  @override
  Future<bool> protect(int fd) async => true;

  @override
  void dispose() => _events.close();
}

late AppDatabase db;
late PingCacheDao dao;
late StreamController<List<ConnectivityResult>> changes;
late FakeSelection selection;
late FakeConfig config;
late FakeBridge bridge;
late List<Map<String, Object?>> logs;
late List<ErrorToast> toasts;
late ProviderContainer container;

ProviderContainer buildContainer(List<String> serverIds) {
  changes = StreamController<List<ConnectivityResult>>.broadcast();
  final connectivity = MockConnectivity();
  when(() => connectivity.onConnectivityChanged)
      .thenAnswer((_) => changes.stream);
  when(connectivity.checkConnectivity)
      .thenAnswer((_) async => <ConnectivityResult>[ConnectivityResult.wifi]);
  final service = ConnectivityService.internal(connectivity);

  selection = FakeSelection(serverIds);
  config = FakeConfig();
  bridge = FakeBridge();
  logs = <Map<String, Object?>>[];
  toasts = <ErrorToast>[];

  return ProviderContainer(
    overrides: [
      appDatabaseProvider.overrideWithValue(db),
      connectivityServiceProvider.overrideWithValue(service),
      connectControllerProvider.overrideWith(() => selection),
      configRepositoryProvider.overrideWithValue(config),
      vpnBridgeProvider.overrideWithValue(bridge),
      connectionTransitionLogProvider.overrideWithValue(logs.add),
      connectionToastProvider.overrideWithValue(toasts.add),
      connectionErrorLogProvider.overrideWithValue((_) {}),
    ],
  );
}

Future<void> seedState() async {
  final now = DateTime.now().millisecondsSinceEpoch;
  await dao.setSelection("simple", "srv-1");
  await dao.setCurrentTab("simple");
  await dao.upsert(
    PingCacheEntry(
      serverId: "srv-1",
      tab: "simple",
      rttMs: 12,
      online: true,
      approx: false,
      tsMs: now,
    ),
  );
  await dao.pushLastGood("simple", "srv-1", tsMs: now);
}

/// Brings the FSM to `connected` with a baseline WiFi event already observed.
Future<ConnectionNotifier> startConnected(List<String> serverIds) async {
  container = buildContainer(serverIds);
  final notifier = container.read(connectionNotifierProvider.notifier);
  container.read(connectionReconnectListenerProvider);
  changes.add(<ConnectivityResult>[ConnectivityResult.wifi]);
  await Future<void>.value();
  await seedState();
  await notifier.connect(PoolTab.simple, auto: true);
  expect(
    container.read(connectionNotifierProvider).phase,
    ConnPhase.connected,
  );
  return notifier;
}

Future<void> pumpUntil(bool Function() predicate) async {
  for (var i = 0; i < 300; i++) {
    if (predicate()) return;
    await Future<void>.delayed(const Duration(milliseconds: 10));
  }
  fail("condition not met within 3s");
}

void main() {
  setUp(() {
    db = AppDatabase(NativeDatabase.memory());
    dao = PingCacheDao(db);
  });

  tearDown(() {
    container.dispose();
    db.close();
    changes.close();
  });

  test("WiFi to LTE invalidates, reselects, reconnects and toasts once",
      () async {
    await startConnected(<String>["srv-1", "srv-2"]);
    toasts.clear();
    final startsBefore = bridge.calls.where((call) => call == "start").length;

    changes.add(<ConnectivityResult>[ConnectivityResult.mobile]);
    await pumpUntil(
      () =>
          container.read(connectionNotifierProvider).phase ==
              ConnPhase.connected &&
          logs.any((event) => event["reason"] == "network_change_tunnel_up"),
    );

    // D-15: the newly selected server is persisted before the native restart.
    expect(await dao.getSelection("simple"), "srv-2");
    expect(selection.calls.last, contains("auto=true:manual=null"));
    // REQ-PING-05: cache + last-good cleared, selection/current_tab preserved.
    expect(
      await dao.fresh(
        "srv-1",
        "simple",
        nowMs: DateTime.now().millisecondsSinceEpoch,
      ),
      isNull,
    );
    expect(await dao.getCurrentTab(), "simple");
    // D-03: /config is refetched for the possibly-new serverId.
    expect(config.fetches, <String>["srv-1", "srv-2"]);
    // One full FSM cycle with a real stop before the new start.
    expect(
      bridge.calls.indexOf("stop"),
      lessThan(bridge.calls.lastIndexOf("start")),
    );
    expect(
      bridge.calls.where((call) => call == "start").length,
      startsBefore + 1,
    );
    expect(toasts.length, 1);
    expect(
      toasts.single.message,
      "Сеть изменена — переподключение",
    );
    expect(
      logs.map((event) => event["to"]),
      containsAll(<String>[
        "pinging",
        "disconnecting",
        "connecting",
        "connected",
      ]),
    );
    // No raw config fragment reaches the bridge log surface.
    for (final started in bridge.startedConfigs) {
      expect(started.contains("SUPERSECRET-CONFIG-FRAGMENT"), isTrue);
      expect(started.contains("secret_marker"), isTrue);
    }
  });

  test("VPN-only result-set deltas are ignored — no self-triggered loop",
      () async {
    await startConnected(<String>["srv-1", "srv-2"]);
    toasts.clear();

    // The tunnel announcing itself while WiFi stays up is not a change.
    changes.add(<ConnectivityResult>[
      ConnectivityResult.wifi,
      ConnectivityResult.vpn,
    ]);
    await Future<void>.delayed(const Duration(milliseconds: 700));
    // Nor is its disappearance.
    changes.add(<ConnectivityResult>[ConnectivityResult.wifi]);
    await Future<void>.delayed(const Duration(milliseconds: 700));

    expect(
      container.read(connectionNotifierProvider).phase,
      ConnPhase.connected,
    );
    expect(toasts, isEmpty);
    expect(config.fetches, <String>["srv-1"]);
    expect(bridge.calls.where((call) => call == "start").length, 1);
    expect(
      logs.where((event) => event["reason"] == "network_changed"),
      isEmpty,
    );
  });

  test("a stale reconnect callback cannot announce a second tunnel",
      () async {
    await startConnected(<String>["srv-1", "srv-2"]);
    final gate = Completer<Map<String, dynamic>>();
    config.gate = gate;

    changes.add(<ConnectivityResult>[ConnectivityResult.mobile]);
    await pumpUntil(
      () =>
          container.read(connectionNotifierProvider).phase ==
              ConnPhase.connecting &&
          config.fetches.length == 2,
    );

    await container.read(connectionNotifierProvider.notifier).cancel();
    gate.complete(_opaqueConfig);
    await Future<void>.delayed(const Duration(milliseconds: 50));

    final state = container.read(connectionNotifierProvider);
    expect(state.phase, ConnPhase.idle);
    expect(state.serverId, isNull);
    expect(
      logs.any(
        (event) =>
            event["to"] == "connected" &&
            event["reason"] == "network_change_tunnel_up",
      ),
      isFalse,
    );
    expect(bridge.calls.where((call) => call == "start").length, 1);
  });

  test("no_active_key on the reconnect refetch maps to error + auth toast",
      () async {
    await startConnected(<String>["srv-1", "srv-2"]);
    config.failWithNoActiveKey = true;
    toasts.clear();

    changes.add(<ConnectivityResult>[ConnectivityResult.mobile]);
    await pumpUntil(
      () =>
          container.read(connectionNotifierProvider).phase == ConnPhase.error,
    );

    final state = container.read(connectionNotifierProvider);
    expect(state.errorCode, "no_active_key");
    expect(
      toasts.map((toast) => toast.message),
      contains("Нет активного ключа"),
    );
    expect(config.fetches, <String>["srv-1", "srv-2"]);
    expect(bridge.calls.where((call) => call == "start").length, 1);
  });
}
