import "package:flutter/services.dart";
import "package:flutter_test/flutter_test.dart";
import "package:mobile/core/ping/libbox_core.dart";
import "package:mobile/core/vpn/vpn_bridge.dart";

/// Overridable channel invoke function used by [FakeVpnChannel].
typedef FakeInvoke = Future<Object?> Function(String method, Object? args);

/// Fake native method channel: no Flutter engine and no real platform calls.
class FakeVpnChannel implements VpnChannel {
  /// Creates a fake channel with a fixed consent answer and start result.
  FakeVpnChannel({
    this.prepared = true,
    this.startResponse,
  });

  /// Whether `prepare` reports that the OS granted consent.
  bool prepared;

  /// Raw platform reply to `start` (normally a map carrying an opaque fd).
  Object? startResponse;

  /// Recorded method names in invocation order.
  final List<String> calls = <String>[];

  /// Every method recorded by this fake, in order.
  List<String> get invoked => calls;

  /// Optional per-method override for error and ordering vectors.
  FakeInvoke? onInvoke;

  Future<Object?> Function(String method, Object? args)? _handler;

  @override
  Future<Object?> invoke(String method, [Object? arguments]) async {
    calls.add(method);
    final override = onInvoke;
    if (override != null) {
      return override(method, arguments);
    }
    switch (method) {
      case "prepare":
        return prepared;
      case "start":
        return startResponse ?? <Object?, Object?>{};
      default:
        return null;
    }
  }

  @override
  void setCallHandler(
    Future<Object?> Function(String method, Object? args)? handler,
  ) {
    _handler = handler;
  }

  /// Simulates a native → Dart event on the registered handler.
  Future<void> emit(String method) async {
    await _handler?.call(method, null);
  }
}

/// Fake libbox core that records the fd handoff and stop ordering.
class FakeVpnCore implements VpnCore {
  /// Number of `startWithTun` calls observed by this fake.
  int startCalls = 0;

  /// Opaque fd value handed over by the bridge, if any.
  int? lastFd;

  /// Config string handed over by the bridge, if any.
  String? lastConfig;

  /// Records stop ordering in the shared [order] list when provided.
  List<String>? order;

  @override
  Future<void> startWithTun(int fd, String configJson) async {
    startCalls++;
    lastFd = fd;
    lastConfig = configJson;
  }

  @override
  Future<void> stop() async {
    order?.add("core.stop");
    await Future<void>.delayed(Duration.zero);
  }

  @override
  Future<TrafficSnapshot> traffic() async => const TrafficSnapshot.zero();
}

void main() {
  const config = '{"secret":"TOP_SECRET_CONFIG_FRAGMENT"}';
  const fd = 99173;

  late FakeVpnChannel channel;
  late FakeVpnCore core;
  late List<Map<String, Object?>> logs;
  late MethodChannelVpnBridge bridge;

  setUp(() {
    channel = FakeVpnChannel();
    core = FakeVpnCore();
    logs = <Map<String, Object?>>[];
    bridge = MethodChannelVpnBridge(
      channel: channel,
      core: core,
      log: (String event, Map<String, Object?> fields) {
        logs.add(<String, Object?>{"event": event, ...fields});
      },
    );
  });

  tearDown(() {
    bridge.dispose();
  });

  /// Renders captured log fields so tests can assert secret non-leakage.
  String describeLogs() => logs.toString();

  test("permission denial stays idle and never reaches the shim", () async {
    channel.prepared = false;

    await expectLater(
      bridge.prepare(),
      throwsA(
        isA<VpnBridgeException>().having(
          (VpnBridgeException error) => error.code,
          "code",
          "permission_denied",
        ),
      ),
    );

    expect(channel.invoked, <String>["prepare"]);
    expect(core.startCalls, 0);
    expect(describeLogs(), isNot(contains("$fd")));
  });

  test("revoked event reaches the FSM with a stable code", () async {
    final codes = <String>[];
    final subscription = bridge.events.listen(
      (VpnBridgeEvent event) => codes.add(event.code),
    );
    try {
      await channel.emit("onRevoked");
      await Future<void>.delayed(Duration.zero);
      expect(codes, <String>["revoked"]);
    } finally {
      await subscription.cancel();
    }
  });

  test("disconnect action reaches the FSM as disconnect", () async {
    final codes = <String>[];
    final subscription = bridge.events.listen(
      (VpnBridgeEvent event) => codes.add(event.code),
    );
    try {
      await channel.emit("onDisconnect");
      await Future<void>.delayed(Duration.zero);
      expect(codes, <String>["disconnect"]);
    } finally {
      await subscription.cancel();
    }
  });

  test("stop awaits shim stop before the platform teardown", () async {
    final order = <String>[];
    core.order = order;
    channel.onInvoke = (String method, Object? args) async {
      if (method == "stop") {
        order.add("channel.stop");
      }
      return null;
    };

    await bridge.stop();

    expect(order, <String>["core.stop", "channel.stop"]);
  });

  test("fd is handed off opaquely and never logged", () async {
    channel.startResponse = <Object?, Object?>{"fd": fd};

    await bridge.prepare();
    await bridge.start(config);

    expect(core.startCalls, 1);
    expect(core.lastFd, fd);
    expect(core.lastConfig, config);
    expect(describeLogs(), isNot(contains("$fd")));
    expect(describeLogs(), isNot(contains("TOP_SECRET_CONFIG_FRAGMENT")));
  });

  test("malformed start reply yields config_invalid without shim call",
      () async {
    channel.startResponse = <Object?, Object?>{"not_fd": "oops"};

    await expectLater(
      bridge.start(config),
      throwsA(
        isA<VpnBridgeException>().having(
          (VpnBridgeException error) => error.code,
          "code",
          "config_invalid",
        ),
      ),
    );

    expect(core.startCalls, 0);
  });

  test("raw platform text is mapped to a safe stable code", () async {
    channel.onInvoke = (String method, Object? args) async {
      throw PlatformException(
        code: "java.lang.IllegalArgumentException: fd=$fd",
        message: "TOP_SECRET_CONFIG_FRAGMENT",
      );
    };

    await expectLater(
      bridge.start(config),
      throwsA(
        isA<VpnBridgeException>().having(
          (VpnBridgeException error) => error.code,
          "code",
          "config_invalid",
        ),
      ),
    );

    expect(describeLogs(), isNot(contains("TOP_SECRET_CONFIG_FRAGMENT")));
    expect(describeLogs(), isNot(contains("$fd")));
  });
}
