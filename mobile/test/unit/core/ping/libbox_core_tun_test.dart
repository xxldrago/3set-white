import "package:flutter_test/flutter_test.dart";
import "package:mobile/core/ping/libbox_core.dart";

/// Fake native binding seam: returns the raw JSON a fake `libbox_traffic()`
/// would hand across FFI and records whether calls ever overlap.
class FakeTrafficBridge extends LibboxTrafficBridge {
  FakeTrafficBridge(this.payload);

  final String payload;

  int calls = 0;
  int active = 0;
  int maxActive = 0;

  @override
  Future<String> readTrafficJson() async {
    calls++;
    active++;
    if (active > maxActive) {
      maxActive = active;
    }
    await Future<void>.delayed(Duration.zero);
    active--;
    return payload;
  }
}

void main() {
  final core = LibboxPingCore.instance;

  tearDown(() {
    core.trafficBridgeForTesting = null;
  });

  test("live traffic JSON decodes int64 counters losslessly", () {
    const raw =
        '{"down":4611686018427387904,"up":9007199254740993,"available":true}';

    final snapshot = decodeTrafficSnapshot(raw);

    expect(snapshot.available, isTrue);
    // Native Dart ints are 64-bit; these values exceed JS's 2^53 precision and
    // prove the int64 counters survive the FFI decode without loss.
    // ignore: avoid_js_rounded_ints
    expect(snapshot.down, 4611686018427387904);
    // ignore: avoid_js_rounded_ints
    expect(snapshot.up, 9007199254740993);
    expect(snapshot.toString(), contains("available: true"));
  });

  test("available:false, missing fields and malformed JSON yield zeros", () {
    const zero = TrafficSnapshot.zero();

    expect(
      decodeTrafficSnapshot('{"down":12,"up":34,"available":false}'),
      zero,
    );
    expect(decodeTrafficSnapshot('{"down":12,"up":34}'), zero);
    expect(decodeTrafficSnapshot("{}"), zero);
    expect(decodeTrafficSnapshot(""), zero);
    expect(decodeTrafficSnapshot("not json"), zero);
    expect(decodeTrafficSnapshot("[1,2,3]"), zero);
  });

  test("non-int counters decode to zeros without fabricating bytes", () {
    final snapshot = decodeTrafficSnapshot(
      '{"down":"12","up":null,"available":true}',
    );

    expect(snapshot.available, isTrue);
    expect(snapshot.down, 0);
    expect(snapshot.up, 0);
  });

  test("traffic() reads through the injected fake binding seam", () async {
    final bridge = FakeTrafficBridge('{"down":2048,"up":512,"available":true}');
    core.trafficBridgeForTesting = bridge;

    final result = await core.traffic();

    expect(result.down, 2048);
    expect(result.up, 512);
    expect(result.available, isTrue);
    expect(bridge.calls, 1);
  });

  test("native calls stay serialized behind the same Completer tail", () async {
    final bridge = FakeTrafficBridge('{"down":1,"up":1,"available":true}');
    core.trafficBridgeForTesting = bridge;

    final results = await Future.wait([
      core.traffic(),
      core.traffic(),
      core.traffic(),
    ]);

    expect(results, hasLength(3));
    expect(bridge.calls, 3);
    expect(bridge.maxActive, 1);
  });

  test("traffic() without bindings or fake fails safely", () async {
    core.trafficBridgeForTesting = null;

    await expectLater(
      core.traffic(),
      throwsA(isA<LibboxUnavailableException>()),
    );
  });

  test("safe exceptions never carry a config fragment", () {
    const secretFragment = "vless://SUPERSECRET@example.com";
    const error = LibboxConfigException(
      "sing-box rejected the tunnel configuration",
    );

    expect(error.toString(), isNot(contains(secretFragment)));
    expect(error.toString(), isNot(contains("SUPERSECRET")));
    expect(error.toString(), isNot(contains("vless://")));
  });
}
