import "dart:async";
import "dart:io";

import "ping_result.dart";

/// TCP connector injectable in tests; production uses [Socket.connect].
typedef SocketConnector = Future<Socket> Function(
  InternetAddress host,
  int port, {
  Duration timeout,
});

/// Real TCP connect-RTT probe used only as a silent fallback (D-07).
///
/// A successful connect proves TCP reachability, not that VPN credentials or
/// the proxy handshake are valid. The result is marked `approx` internally
/// and is never surfaced to the UI.
class SocketPingService {
  /// Creates a prober with optional test seams.
  SocketPingService({
    SocketConnector? connector,
    PingClock? nowMs,
  })  : _connector = connector ?? _defaultConnector,
        _nowMs = nowMs ?? defaultPingClock;

  final SocketConnector _connector;
  final PingClock _nowMs;

  static Future<Socket> _defaultConnector(
    InternetAddress host,
    int port, {
    Duration timeout = const Duration(milliseconds: 800),
  }) => Socket.connect(host, port, timeout: timeout);

  /// Probes [host]/[port]; every result carries [PingResult.approx] `true`.
  Future<PingResult> ping(
    String host,
    String port, {
    Duration timeout = const Duration(milliseconds: 800),
  }) async {
    final tsMs = _nowMs();
    final address = _parseHost(host);
    final portNumber = int.tryParse(port.trim());
    if (address == null ||
        portNumber == null ||
        portNumber < 1 ||
        portNumber > 65535) {
      return PingResult(online: false, approx: true, tsMs: tsMs);
    }

    final watch = Stopwatch()..start();
    try {
      final socket = await _connector(
        address,
        portNumber,
        timeout: timeout,
      );
      watch.stop();
      socket.destroy();
      return PingResult(
        online: true,
        rttMs: watch.elapsedMilliseconds,
        approx: true,
        tsMs: tsMs,
      );
    } on SocketException catch (_) {
      return PingResult(online: false, approx: true, tsMs: tsMs);
    } on TimeoutException catch (_) {
      return PingResult(online: false, approx: true, tsMs: tsMs);
    }
  }

  /// Strips IPv6 brackets and parses a literal address.
  static InternetAddress? _parseHost(String raw) {
    var host = raw.trim();
    if (host.startsWith("[") && host.endsWith("]")) {
      host = host.substring(1, host.length - 1);
    }
    return InternetAddress.tryParse(host);
  }
}
