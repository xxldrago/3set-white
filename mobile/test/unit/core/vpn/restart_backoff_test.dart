import "dart:async";

import "package:dio/dio.dart";
import "package:flutter_riverpod/flutter_riverpod.dart";
import "package:flutter_test/flutter_test.dart";
import "package:mobile/core/ping/libbox_core.dart";
import "package:mobile/core/vpn/config_repository.dart";
import "package:mobile/core/vpn/connection_notifier.dart";
import "package:mobile/core/vpn/connection_state.dart";
import "package:mobile/core/vpn/error_mapping.dart";
import "package:mobile/core/vpn/restart_backoff.dart";
import "package:mobile/core/vpn/vpn_bridge.dart";
import "package:mobile/features/servers/providers.dart"
    show ConnectController, ConnectOutcome, connectControllerProvider;
import "package:mobile/features/servers/server.dart" show PoolTab;

/// Timer stand-in: fires only when the test explicitly says so.
class FakeTimer implements Timer {
  FakeTimer(this.callback);

  final void Function() callback;
  late Duration duration;
  bool _active = true;
  bool cancelled = false;
  int _ticks = 0;

  @override
  bool get isActive => _active;

  @override
  int get tick => _ticks;

  void fire() {
    if (!_active) return;
    _active = false;
    _ticks++;
    callback();
  }

  @override
  void cancel() {
    cancelled = true;
    _active = false;
  }
}

List<Duration> scheduledDelays(List<FakeTimer> timers) =>
    timers.map((timer) => timer.duration).toList();

class RecordingBackoffFactory {
  final List<FakeTimer> timers = <FakeTimer>[];

  Timer create(Duration duration, void Function() callback) {
    final timer = FakeTimer(callback)..duration = duration;
    timers.add(timer);
    return timer;
  }
}

class FakeSelection extends ConnectController {
  @override
  Future<ConnectOutcome> connect(
    PoolTab tab, {
    required bool auto,
    String? manualServerId,
  }) async =>
      const ConnectOutcome(ok: true, serverId: "srv-1");
}

class FakeConfig extends ConfigRepository {
  FakeConfig() : super(Dio());

  bool fail = false;

  @override
  Future<Map<String, dynamic>> fetch(String serverId) async {
    if (fail) throw const ConfigRepositoryException("unreachable");
    return <String, dynamic>{"inbounds": <Object?>[]};
  }
}

class FakeBridge implements VpnBridge {
  final StreamController<VpnBridgeEvent> _events =
      StreamController<VpnBridgeEvent>.broadcast();
  final List<String> calls = <String>[];

  @override
  Stream<VpnBridgeEvent> get events => _events.stream;

  /// Drives the real native → Dart event path; no direct FSM method call.
  void emit(String code) => _events.add(VpnBridgeEvent(code));

  /// Optional consent failure injected by a test (IN-01).
  VpnBridgeException? prepareError;

  @override
  Future<void> prepare() async {
    calls.add("prepare");
    final error = prepareError;
    if (error != null) throw error;
  }

  /// Optional non-bridge failure injected by a test (WR-01).
  Object? startError;

  @override
  Future<void> start(String configJson) async {
    calls.add("start");
    final error = startError;
    if (error is Exception) throw error;
    if (error is Error) throw error;
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

Future<void> pumpUntil(bool Function() predicate) async {
  for (var i = 0; i < 200; i++) {
    if (predicate()) return;
    await Future<void>.delayed(const Duration(milliseconds: 10));
  }
  fail("condition not met within 2s");
}

void main() {
  test("delays are exactly 1/2/4 s, max three, then exhaustion", () {
    final factory = RecordingBackoffFactory();
    final backoff = RestartBackoff(timerFactory: factory.create);
    final retries = <int>[];
    var exhausted = 0;

    for (var i = 0; i < 3; i++) {
      expect(
        backoff.schedule(
          onRetry: () => retries.add(i),
          onExhausted: () => exhausted++,
        ),
        isTrue,
      );
      factory.timers.last.fire();
    }
    expect(
      scheduledDelays(factory.timers),
      <Duration>[
        const Duration(seconds: 1),
        const Duration(seconds: 2),
        const Duration(seconds: 4),
      ],
    );
    expect(backoff.attempts, 3);

    // A fourth retry MUST NOT be scheduled: the loop is bounded.
    expect(
      backoff.schedule(
        onRetry: () => retries.add(99),
        onExhausted: () => exhausted++,
      ),
      isFalse,
    );
    expect(factory.timers.length, 3);
    expect(exhausted, 1);

    expect(retries, <int>[0, 1, 2]);
  });

  test("reset after a successful connected restores the 1 s first delay", () {
    final factory = RecordingBackoffFactory();
    final backoff = RestartBackoff(timerFactory: factory.create);

    for (var i = 0; i < 3; i++) {
      backoff.schedule(onRetry: () {}, onExhausted: () {});
    }
    expect(factory.timers.last.duration, const Duration(seconds: 4));

    backoff.reset();
    expect(backoff.attempts, 0);
    expect(backoff.isScheduled, isFalse);
    backoff.schedule(onRetry: () {}, onExhausted: () {});
    expect(factory.timers.last.duration, const Duration(seconds: 1));
  });

  test("cancel and dispose kill a pending timer with no later callback", () {
    final factory = RecordingBackoffFactory();
    final backoff = RestartBackoff(timerFactory: factory.create);
    var retries = 0;

    backoff
      ..schedule(onRetry: () => retries++, onExhausted: () {})
      ..cancel();
    factory.timers.single.fire();
    expect(retries, 0);
    expect(backoff.isScheduled, isFalse);

    backoff
      ..schedule(onRetry: () => retries++, onExhausted: () {})
      ..dispose();
    factory.timers.last.fire();
    expect(retries, 0);
    expect(factory.timers.last.cancelled, isTrue);
  });

  test("core stop feeds the notifier backoff and exhaustion emits the toast",
      () async {
    final factory = RecordingBackoffFactory();
    final backoff = RestartBackoff(timerFactory: factory.create);
    final config = FakeConfig();
    final bridge = FakeBridge();
    final toasts = <ErrorToast>[];
    final logs = <Map<String, Object?>>[];
    final container = ProviderContainer(
      overrides: [
        connectControllerProvider.overrideWith(FakeSelection.new),
        configRepositoryProvider.overrideWithValue(config),
        vpnBridgeProvider.overrideWithValue(bridge),
        connectionToastProvider.overrideWithValue(toasts.add),
        connectionErrorLogProvider.overrideWithValue((_) {}),
        connectionTransitionLogProvider.overrideWithValue(logs.add),
        restartBackoffProvider.overrideWithValue(backoff),
      ],
    );
    addTearDown(container.dispose);

    final notifier = container.read(connectionNotifierProvider.notifier);
    await notifier.connect(PoolTab.simple, auto: true);
    expect(
      container.read(connectionNotifierProvider).phase,
      ConnPhase.connected,
    );
    // A successful connected cleared any previous failure count.
    expect(backoff.attempts, 0);
    toasts.clear();
    config.fail = true;

    await notifier.handleCoreStopped();
    expect(
      container.read(connectionNotifierProvider).phase,
      ConnPhase.idle,
    );
    expect(backoff.attempts, 1);
    expect(factory.timers.single.duration, const Duration(seconds: 1));

    factory.timers[0].fire();
    await pumpUntil(() => factory.timers.length == 2);
    expect(factory.timers[1].duration, const Duration(seconds: 2));

    factory.timers[1].fire();
    await pumpUntil(() => factory.timers.length == 3);
    expect(factory.timers[2].duration, const Duration(seconds: 4));

    factory.timers[2].fire();
    await pumpUntil(
      () =>
          container.read(connectionNotifierProvider).phase == ConnPhase.error,
    );

    final state = container.read(connectionNotifierProvider);
    expect(state.errorCode, "core_stopped");
    expect(
      toasts.map((toast) => toast.message),
      <String>["VPN остановлен, попробуйте снова"],
    );
    expect(bridge.calls.where((call) => call == "start").length, 1);
    expect(backoff.attempts, 3);
    expect(logs.length, greaterThan(0));
  });

  test(
      "native core-stop event drives backoff; retry reconnects and resets",
      () async {
    final factory = RecordingBackoffFactory();
    final backoff = RestartBackoff(timerFactory: factory.create);
    final config = FakeConfig();
    final bridge = FakeBridge();
    final toasts = <ErrorToast>[];
    final logs = <Map<String, Object?>>[];
    final container = ProviderContainer(
      overrides: [
        connectControllerProvider.overrideWith(FakeSelection.new),
        configRepositoryProvider.overrideWithValue(config),
        vpnBridgeProvider.overrideWithValue(bridge),
        connectionToastProvider.overrideWithValue(toasts.add),
        connectionErrorLogProvider.overrideWithValue((_) {}),
        connectionTransitionLogProvider.overrideWithValue(logs.add),
        restartBackoffProvider.overrideWithValue(backoff),
      ],
    );
    addTearDown(container.dispose);

    final notifier = container.read(connectionNotifierProvider.notifier);
    await notifier.connect(PoolTab.simple, auto: true);
    expect(
      container.read(connectionNotifierProvider).phase,
      ConnPhase.connected,
    );
    final startsBefore = bridge.calls.where((call) => call == "start").length;
    toasts.clear();

    // The ONLY production input is a real native event — not a direct FSM call.
    bridge.emit("core_stopped");
    await pumpUntil(
      () =>
          container.read(connectionNotifierProvider).phase == ConnPhase.idle &&
          backoff.isScheduled,
    );
    expect(factory.timers.single.duration, const Duration(seconds: 1));
    // The core is stopped exactly once before the FSM is allowed back to idle:
    // no orphan tunnel survives the crash (D-14).
    expect(bridge.calls.where((call) => call == "stop").length, 1);
    expect(logs.any((event) => event["reason"] == "core_stopped"), isTrue);
    expect(toasts, isEmpty);

    // 1 s later the bounded retry re-runs the SAME connecting path.
    factory.timers.first.fire();
    await pumpUntil(
      () =>
          container.read(connectionNotifierProvider).phase ==
          ConnPhase.connected,
    );
    expect(
      bridge.calls.where((call) => call == "start").length,
      startsBefore + 1,
    );
    expect(logs.any((event) => event["reason"] == "core_restart"), isTrue);
    // A healthy session resets the failure counter; no error toast was needed.
    expect(backoff.attempts, 0);
    expect(backoff.isScheduled, isFalse);
    expect(toasts, isEmpty);
  });

  test("an unexpected bridge failure reaches error + toast, never connecting",
      () async {
    final backoff = RestartBackoff();
    final config = FakeConfig();
    final bridge = FakeBridge()
      ..startError = StateError("native exploded");
    final toasts = <ErrorToast>[];
    final logs = <Map<String, Object?>>[];
    final container = ProviderContainer(
      overrides: [
        connectControllerProvider.overrideWith(FakeSelection.new),
        configRepositoryProvider.overrideWithValue(config),
        vpnBridgeProvider.overrideWithValue(bridge),
        connectionToastProvider.overrideWithValue(toasts.add),
        connectionErrorLogProvider.overrideWithValue((_) {}),
        connectionTransitionLogProvider.overrideWithValue(logs.add),
        restartBackoffProvider.overrideWithValue(backoff),
      ],
    );
    addTearDown(container.dispose);

    await container.read(connectionNotifierProvider.notifier).connect(
          PoolTab.simple,
          auto: true,
        );

    final state = container.read(connectionNotifierProvider);
    expect(state.phase, ConnPhase.error);
    expect(state.errorCode, "config_invalid");
    expect(
      toasts.map((toast) => toast.message),
      <String>["Не удалось подготовить подключение"],
    );
    expect(bridge.calls, contains("prepare"));
    expect(bridge.calls, contains("start"));
    expect(
      logs.map((event) => event["reason"]),
      contains("bridge_start_failed"),
    );
  });

  test("the retry toast action actually retries the failed connect (IN-01)",
      () async {
    final backoff = RestartBackoff();
    final config = FakeConfig();
    final bridge = FakeBridge()
      ..prepareError = const VpnBridgeException("permission_denied");
    final toasts = <ErrorToast>[];
    final container = ProviderContainer(
      overrides: [
        connectControllerProvider.overrideWith(FakeSelection.new),
        configRepositoryProvider.overrideWithValue(config),
        vpnBridgeProvider.overrideWithValue(bridge),
        connectionToastProvider.overrideWithValue(toasts.add),
        connectionErrorLogProvider.overrideWithValue((_) {}),
        connectionTransitionLogProvider.overrideWithValue((_) {}),
        restartBackoffProvider.overrideWithValue(backoff),
      ],
    );
    addTearDown(container.dispose);

    final notifier = container.read(connectionNotifierProvider.notifier);
    await notifier.connect(PoolTab.simple, auto: true);
    expect(
      container.read(connectionNotifierProvider).phase,
      ConnPhase.error,
    );
    expect(toasts.length, 1);
    expect(toasts.single.retry, isTrue);
    expect(toasts.single.action, isNotNull);
    final preparesBefore = bridge.calls.where((call) => call == "prepare").length;

    // Consent is granted now; tapping «Повторить» must reconnect, not dismiss.
    bridge.prepareError = null;
    toasts.single.action!();
    await pumpUntil(
      () =>
          container.read(connectionNotifierProvider).phase ==
          ConnPhase.connected,
    );
    expect(
      bridge.calls.where((call) => call == "prepare").length,
      preparesBefore + 1,
    );
  });
}
