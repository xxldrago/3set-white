import "dart:async";
import "dart:io";

import "package:flutter_test/flutter_test.dart";
import "package:mobile/core/ping/socket_ping_service.dart";
import "package:mocktail/mocktail.dart";

class MockSocket extends Mock implements Socket {}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  final captured = <String>[];
  final capturedTimeouts = <Duration>[];

  Future<Socket> okConnector(
    String host,
    int port, {
    Duration timeout = const Duration(milliseconds: 800),
  }) async {
    captured.add(host);
    capturedTimeouts.add(timeout);
    return MockSocket();
  }

  setUp(() {
    captured.clear();
    capturedTimeouts.clear();
  });

  test("strips IPv6 brackets, parses the address and marks approx", () async {
    final service = SocketPingService(connector: okConnector, nowMs: () => 7);

    final result = await service.ping("[::1]", "443");

    expect(result.online, isTrue);
    expect(result.approx, isTrue);
    expect(result.tsMs, 7);
    expect(captured.single, "::1");
  });

  test("measures a real connect and destroys the socket", () async {
    final socket = MockSocket();
    Future<Socket> delayedConnector(
      String host,
      int port, {
      Duration timeout = const Duration(milliseconds: 800),
    }) async {
      await Future<void>.delayed(const Duration(milliseconds: 10));
      return socket;
    }
    final service =
        SocketPingService(connector: delayedConnector, nowMs: () => 9);

    final result = await service.ping("127.0.0.1", "443");

    expect(result.online, isTrue);
    expect(result.rttMs, greaterThanOrEqualTo(3));
    expect(result.approx, isTrue);
    verify(socket.destroy).called(1);
  });

  test("passes the caller timeout to Socket.connect", () async {
    final service = SocketPingService(
      connector: okConnector,
      nowMs: () => 0,
    );
    const budget = Duration(milliseconds: 2000);

    await service.ping("127.0.0.1", "443", timeout: budget);

    expect(capturedTimeouts.single, budget);
  });

  test("hostname-based servers are passed to the resolver, not rejected",
      () async {
    final service = SocketPingService(connector: okConnector, nowMs: () => 0);

    final result = await service.ping("simple.example.com", "443");

    expect(result.online, isTrue);
    expect(result.approx, isTrue);
    expect(captured.single, "simple.example.com");
  });

  test("empty host and bad ports are offline without a socket", () async {
    final service = SocketPingService(connector: okConnector, nowMs: () => 0);

    for (final sample in [
      ("", "443"),
      ("127.0.0.1", "not-a-port"),
      ("127.0.0.1", "0"),
      ("127.0.0.1", "70000"),
    ]) {
      final result = await service.ping(sample.$1, sample.$2);
      expect(result.online, isFalse);
      expect(result.approx, isTrue);
    }
    expect(captured, isEmpty);
  });

  test("SocketException and TimeoutException map to offline", () async {
    Future<Socket> refused(
      String host,
      int port, {
      Duration timeout = const Duration(milliseconds: 800),
    }) async => throw const SocketException("refused");
    Future<Socket> timedOut(
      String host,
      int port, {
      Duration timeout = const Duration(milliseconds: 800),
    }) async => throw TimeoutException("no answer", timeout);

    final refusedResult = await SocketPingService(
      connector: refused,
      nowMs: () => 1,
    ).ping("127.0.0.1", "443");
    final timeoutResult = await SocketPingService(
      connector: timedOut,
      nowMs: () => 2,
    ).ping("127.0.0.1", "443");

    expect(refusedResult.online, isFalse);
    expect(refusedResult.approx, isTrue);
    expect(refusedResult.tsMs, 1);
    expect(timeoutResult.online, isFalse);
    expect(timeoutResult.approx, isTrue);
    expect(timeoutResult.tsMs, 2);
  });
}
