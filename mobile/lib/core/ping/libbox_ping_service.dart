import "dart:convert";

import "libbox_core.dart";
import "ping_result.dart";

/// Probe URL sing-box uses when `URLTest` is given an empty link (D-06).
///
/// The Dart side never passes a URL: the shim calls `URLTest(outboundTag)`,
/// which resolves to this fixed `generate_204` target internally.
const String generate204Url = "https://www.gstatic.com/generate_204";

/// Minimal libbox surface used by the ping service; injectable in tests.
abstract class LibboxPingClient {
  /// Loads the native shim once.
  Future<void> init();

  /// Validates and starts the no-TUN sing-box service with [configJson].
  Future<void> start(String configJson);

  /// Triggers one real `URLTest` for [tag] and reads its async RTT.
  Future<LibboxUrltestResult> urltest(
    String tag, {
    Duration timeout,
  });
}

/// Adapts the 19-02 singleton to [LibboxPingClient].
class LibboxCoreClient implements LibboxPingClient {
  /// Creates an adapter over the process-wide [LibboxPingCore] singleton.
  LibboxCoreClient([LibboxPingCore? core])
      : _core = core ?? LibboxPingCore.instance;

  final LibboxPingCore _core;

  @override
  Future<void> init() => _core.init();

  @override
  Future<void> start(String configJson) => _core.start(configJson);

  @override
  Future<LibboxUrltestResult> urltest(
    String tag, {
    Duration timeout = const Duration(seconds: 2),
  }) => _core.urltest(tag, timeout: timeout);
}

/// Maps a real libbox `URLTest(tag)` + async `WriteGroups` sample to a result.
///
/// Returns `null` when libbox is unavailable or the urltest has no/failed
/// history (`0,0`), so the repository can apply the silent TCP fallback.
/// No ICMP, no `libbox_urltest`, no synchronous RTT and no secret logging.
class LibboxPingService {
  /// Creates a libbox prober with an optional injectable client/clock.
  LibboxPingService({
    LibboxPingClient? client,
    PingClock? nowMs,
  })  : _client = client ?? LibboxCoreClient(),
        _nowMs = nowMs ?? defaultPingClock;

  final LibboxPingClient _client;
  final PingClock _nowMs;

  /// Probes outbound `srv-<id>`; `null` means silent fallback is required.
  Future<PingResult?> ping(
    String id,
    Map<String, dynamic> outbound, {
    Duration timeout = const Duration(milliseconds: 800),
  }) async {
    final tag = "srv-$id";
    final configJson = jsonEncode(_buildConfig(tag, outbound));
    try {
      await _client.init();
      await _client.start(configJson);
      final sample = await _client.urltest(tag, timeout: timeout);
      if (!sample.online || sample.rttMs <= 0) {
        // No history or failed-then-cleared history both read back as 0,0.
        return null;
      }
      return PingResult(
        online: true,
        rttMs: sample.rttMs,
        approx: false,
        tsMs: _nowMs(),
      );
    } on LibboxUnavailableException catch (_) {
      return null;
    } on LibboxConfigException catch (_) {
      return null;
    }
  }

  /// Builds a minimal no-TUN sing-box 1.14 config for one outbound.
  ///
  /// WireGuard is a 1.14 `endpoint`, not an outbound. The node is copied so
  /// the caller's map is never mutated.
  Map<String, dynamic> _buildConfig(
    String tag,
    Map<String, dynamic> outbound,
  ) {
    final node = Map<String, dynamic>.from(outbound)..["tag"] = tag;
    final isEndpoint =
        node["type"] == "wg" || node["type"] == "wireguard";
    return <String, dynamic>{
      "log": <String, dynamic>{"level": "error"},
      "dns": <String, dynamic>{
        "servers": <Map<String, dynamic>>[
          <String, dynamic>{"type": "local", "tag": "local"},
        ],
        "final": "local",
      },
      "inbounds": <Map<String, dynamic>>[],
      "endpoints": <Map<String, dynamic>>[
        if (isEndpoint) node,
      ],
      "outbounds": <Map<String, dynamic>>[
        <String, dynamic>{"type": "direct", "tag": "direct"},
        if (!isEndpoint) node,
      ],
      "route": <String, dynamic>{"final": "direct"},
    };
  }
}
