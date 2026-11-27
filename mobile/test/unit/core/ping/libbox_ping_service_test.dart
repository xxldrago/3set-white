import "dart:async";
import "dart:convert";

import "package:flutter_test/flutter_test.dart";
import "package:mobile/core/ping/libbox_core.dart";
import "package:mobile/core/ping/libbox_ping_service.dart";
import "package:mocktail/mocktail.dart";

class MockLibboxPingClient extends Mock implements LibboxPingClient {}

void main() {
  registerFallbackValue("");
  registerFallbackValue(const Duration(seconds: 1));
  registerFallbackValue(const LibboxUrltestResult(online: false, rttMs: 0));

  const outbound = <String, dynamic>{"type": "vless", "uuid": "not-a-raw-link"};

  LibboxPingService serviceWith(
    MockLibboxPingClient client,
    Future<LibboxUrltestResult> Function(String tag, Duration timeout) answer,
  ) {
    when(client.init).thenAnswer((_) async {});
    when(() => client.start(any())).thenAnswer((_) async {});
    when(
      () => client.urltest(any(), timeout: any(named: "timeout")),
    ).thenAnswer((invocation) async {
      final tag = invocation.positionalArguments.first as String;
      final timeout = invocation.namedArguments[#timeout] as Duration;
      return answer(tag, timeout);
    });
    return LibboxPingService(client: client, nowMs: () => 3000);
  }

  test("URLTestDelay maps to approx=false with the injected clock", () async {
    final client = MockLibboxPingClient();
    final service = serviceWith(
      client,
      (tag, timeout) async => const LibboxUrltestResult(
        online: true,
        rttMs: 88,
      ),
    );

    final result = await service.ping("s1", outbound);

    expect(result, isNotNull);
    expect(result!.online, isTrue);
    expect(result.rttMs, 88);
    expect(result.approx, isFalse);
    expect(result.tsMs, 3000);
  });

  test("0,0 (no history or failed-then-cleared) returns null", () async {
    final client = MockLibboxPingClient();
    var call = 0;
    final service = serviceWith(client, (tag, timeout) async {
      call++;
      return call == 1
          ? const LibboxUrltestResult(online: true, rttMs: 12)
          : const LibboxUrltestResult(online: false, rttMs: 0);
    });

    expect(await service.ping("s1", outbound), isNotNull);
    expect(await service.ping("s1", outbound), isNull);
  });

  test("an online 0 ms sample is kept (RTT-0 edge)", () async {
    final client = MockLibboxPingClient();
    final service = serviceWith(
      client,
      (tag, timeout) async => const LibboxUrltestResult(
        online: true,
        rttMs: 0,
      ),
    );

    final result = await service.ping("s1", outbound);

    expect(result!.online, isTrue);
    expect(result.rttMs, 0);
  });

  test("uses tag srv-<id> and a minimal no-TUN config", () async {
    final client = MockLibboxPingClient();
    final configs = <String>[];
    when(client.init).thenAnswer((_) async {});
    when(() => client.start(any())).thenAnswer((invocation) async {
      configs.add(invocation.positionalArguments.first as String);
    });
    when(
      () => client.urltest(any(), timeout: any(named: "timeout")),
    ).thenAnswer(
      (_) async => const LibboxUrltestResult(online: true, rttMs: 5),
    );
    final service = LibboxPingService(client: client, nowMs: () => 1);

    await service.ping("abc", outbound);

    final config = jsonDecode(configs.single) as Map<String, dynamic>;
    expect(config["inbounds"], isEmpty);
    expect(config["route"]["final"], "direct");
    expect(config["dns"]["final"], "local");
    expect(config["dns"]["servers"].first["type"], "local");
    final nodes = config["outbounds"] as List<dynamic>;
    expect(nodes.first["tag"], "direct");
    expect(nodes[1]["tag"], "srv-abc");
    expect(nodes.last["type"], "urltest");
    expect(nodes.last["outbounds"], <Object>["srv-abc"]);
    expect(nodes.last["url"], generate204Url);
    expect(config["endpoints"], isEmpty);
    expect(configs.single, isNot(contains("vless://")));
    expect(generate204Url, "https://www.gstatic.com/generate_204");
    verify(
      () => client.urltest("srv-abc", timeout: any(named: "timeout")),
    ).called(1);
  });

  test("WireGuard outbound becomes a 1.14 endpoint, not an outbound", () async {
    final client = MockLibboxPingClient();
    final configs = <String>[];
    when(client.init).thenAnswer((_) async {});
    when(() => client.start(any())).thenAnswer((invocation) async {
      configs.add(invocation.positionalArguments.first as String);
    });
    when(
      () => client.urltest(any(), timeout: any(named: "timeout")),
    ).thenAnswer(
      (_) async => const LibboxUrltestResult(online: true, rttMs: 5),
    );
    final service = LibboxPingService(client: client, nowMs: () => 1);

    await service.ping("wg1", const <String, dynamic>{"type": "wg"});

    final config = jsonDecode(configs.single) as Map<String, dynamic>;
    expect((config["endpoints"] as List<dynamic>).single["tag"], "srv-wg1");
    expect(config["outbounds"], hasLength(1));
  });

  test("waits for the async urltest future instead of a sync RTT", () async {
    final client = MockLibboxPingClient();
    final gate = Completer<LibboxUrltestResult>();
    when(client.init).thenAnswer((_) async {});
    when(() => client.start(any())).thenAnswer((_) async {});
    when(
      () => client.urltest(any(), timeout: any(named: "timeout")),
    ).thenAnswer((_) => gate.future);
    final service = LibboxPingService(client: client, nowMs: () => 4);

    var done = false;
    final pending = service.ping("s1", outbound).then((value) {
      done = true;
      return value;
    });
    await Future<void>.delayed(Duration.zero);
    expect(done, isFalse);

    gate.complete(
      const LibboxUrltestResult(online: true, rttMs: 33),
    );
    final result = await pending;
    expect(done, isTrue);
    expect(result!.rttMs, 33);
  });
}
