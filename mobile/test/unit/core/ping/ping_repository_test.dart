import "dart:io";

import "package:flutter_test/flutter_test.dart";
import "package:mobile/core/ping/libbox_core.dart";
import "package:mobile/core/ping/libbox_ping_service.dart";
import "package:mobile/core/ping/ping_repository.dart";
import "package:mobile/core/ping/socket_ping_service.dart";
import "package:mocktail/mocktail.dart";

class MockLibboxPingClient extends Mock implements LibboxPingClient {}

class MockSocket extends Mock implements Socket {}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  registerFallbackValue(const LibboxUrltestResult(online: false, rttMs: 0));
  registerFallbackValue("");
  registerFallbackValue(const Duration(seconds: 1));

  PingTarget target(String id) => PingTarget(
        id: id,
        host: "127.0.0.1",
        port: "443",
        protocol: "vless",
        outbound: const <String, dynamic>{"type": "vless"},
        tab: "simple",
      );

  test("pingServer maps a real libbox urltest result", () async {
    final client = MockLibboxPingClient();
    when(client.init).thenAnswer((_) async {});
    when(() => client.start(any())).thenAnswer((invocation) async {
      final config = invocation.positionalArguments.first as String;
      expect(config, contains("srv-s1"));
      expect(config, isNot(contains("generate_204")));
    });
    when(
      () => client.urltest("srv-s1", timeout: any(named: "timeout")),
    ).thenAnswer(
      (_) async => const LibboxUrltestResult(online: true, rttMs: 42),
    );

    final repository = PingRepository(
      libbox: LibboxPingService(client: client, nowMs: () => 1000),
      socket: SocketPingService(nowMs: () => 1000),
      nowMs: () => 1000,
    );

    final result = await repository.pingServer(target("s1"));

    expect(result.online, isTrue);
    expect(result.rttMs, 42);
    expect(result.approx, isFalse);
    expect(result.tsMs, 1000);
    verify(
      () => client.urltest("srv-s1", timeout: any(named: "timeout")),
    ).called(1);
  });

  test("pingServer falls back silently to the approx TCP probe", () async {
    final client = MockLibboxPingClient();
    when(client.init).thenAnswer(
      (_) async => throw const LibboxUnavailableException("shim absent"),
    );
    Future<Socket> connector(
      InternetAddress host,
      int port, {
      Duration timeout = const Duration(milliseconds: 800),
    }) async => MockSocket();

    final repository = PingRepository(
      libbox: LibboxPingService(client: client, nowMs: () => 2000),
      socket: SocketPingService(
        connector: connector,
        nowMs: () => 2000,
      ),
      nowMs: () => 2000,
    );

    final result = await repository.pingServer(target("s2"));

    expect(result.online, isTrue);
    expect(result.approx, isTrue);
    expect(result.tsMs, 2000);
  });
}
