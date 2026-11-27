import "dart:async";
import "dart:convert";
import "dart:io";

import "package:flutter_riverpod/flutter_riverpod.dart";

import "../ping/libbox_core.dart" show LibboxPingCore, TrafficSnapshot;
import "connection_notifier.dart" show connectionNotifierProvider;
import "connection_state.dart" show ConnPhase;

/// Real IP endpoint reached *through* the tunnel (D-16).
///
/// Discretion value from 20-CONTEXT; replaceable. No fake IP is ever stored.
const String tunnelIpEndpoint = "https://api.ipify.org";

/// Locked 1–2 s budget for the IP request; the tunnel may not be up yet.
const Duration tunnelIpTimeout = Duration(seconds: 2);

/// Interval of the single live-stats timer (D-17).
const Duration connectedStatsInterval = Duration(seconds: 1);

/// Minimal HTTP response crossing the [TunnelHttpGet] seam.
class TunnelHttpResponse {
  /// Creates a response with a status code and a decoded body.
  const TunnelHttpResponse({required this.statusCode, required this.body});

  /// HTTP status code; only 200 is accepted.
  final int statusCode;

  /// Raw response body. Never logged or shown to the user.
  final String body;
}

/// Injectable GET seam for the real IP endpoint.
///
/// Production uses [dartIoGet]; tests inject a deterministic stand-in so no
/// real network call and no `sleep` is needed.
typedef TunnelHttpGet = Future<TunnelHttpResponse> Function(
  Uri uri, {
  Duration timeout,
});

/// Production GET over `dart:io` `HttpClient`.
///
/// The body is read only to validate it is a real IP literal; no response body
/// or raw error text is ever logged, returned on failure or fabricated.
Future<TunnelHttpResponse> dartIoGet(
  Uri uri, {
  Duration timeout = tunnelIpTimeout,
}) async {
  final client = HttpClient();
  try {
    final request = await client.getUrl(uri).timeout(timeout);
    final response = await request.close().timeout(timeout);
    final body = await response.transform(utf8.decoder).join().timeout(timeout);
    return TunnelHttpResponse(statusCode: response.statusCode, body: body);
  } finally {
    client.close(force: true);
  }
}

/// Fetches the public IP through the active tunnel.
///
/// Returns a validated IP literal on success and an **empty string** on any
/// error, timeout, non-200 response or malformed body (rendered as «—» by the
/// panel). This function never logs the body and never invents an address.
Future<String> fetchTunnelIp({
  TunnelHttpGet get = dartIoGet,
  Duration timeout = tunnelIpTimeout,
}) async {
  try {
    final response = await get(Uri.parse(tunnelIpEndpoint), timeout: timeout);
    if (response.statusCode != 200) return "";
    final candidate = response.body.trim();
    // A real endpoint answers with an IP literal. Anything else (HTML error
    // page, proxy text, empty body) is rejected rather than shown as an IP.
    final parsed = InternetAddress.tryParse(candidate);
    if (parsed == null) return "";
    return parsed.address;
  } on Object {
    // Fail closed and silent: no raw HTTP text in logs, state or UI.
    return "";
  }
}

/// Formats integer bytes as MB with a fixed, truncation-free two-decimal rule.
///
/// Negative and missing counters are honest zeros; no fabricated bytes and no
/// integer overflow (the division converts before rounding).
String formatMb(int bytes) {
  if (bytes <= 0) return "0.00";
  return (bytes / (1024 * 1024)).toStringAsFixed(2);
}

String _two(int value) => value.toString().padLeft(2, "0");

/// Formats whole seconds as `HH:MM:SS`; `null` renders honest dashes.
String formatElapsed(int? seconds) {
  if (seconds == null || seconds < 0) return "—:—:—";
  final hours = seconds ~/ 3600;
  final minutes = (seconds % 3600) ~/ 60;
  return "${_two(hours)}:${_two(minutes)}:${_two(seconds % 60)}";
}

/// Immutable, UI-safe snapshot driving the Connected Panel cells (D-17).
///
/// Carries only the session IP, libbox byte counters and elapsed seconds. It
/// never holds config, outbound, token, fd or raw provider error text.
class ConnectedStats {
  /// Creates a stats snapshot.
  const ConnectedStats({
    this.ip = "",
    this.down = 0,
    this.up = 0,
    this.available = false,
    this.elapsedSeconds,
  });

  /// Honest empty snapshot for an idle/error/disconnected session.
  static const ConnectedStats empty = ConnectedStats();

  /// Validated tunnel IP, or an empty string when unavailable.
  final String ip;

  /// Downloaded bytes from libbox counters (zero when unavailable).
  final int down;

  /// Uploaded bytes from libbox counters (zero when unavailable).
  final int up;

  /// Whether libbox reported live counters for this session.
  final bool available;

  /// Whole seconds since `connectedAt`; `null` outside a live session.
  final int? elapsedSeconds;

  /// «—» for a missing IP, never a fabricated address (D-16).
  String get ipLabel => ip.isEmpty ? "—" : ip;

  /// `HH:MM:SS`, or «—:—:—» when there is no live session.
  String get timerLabel => formatElapsed(elapsedSeconds);

  /// Downlink MB cell.
  String get downLabel => formatMb(down);

  /// Uplink MB cell.
  String get upLabel => formatMb(up);

  /// Combined traffic cell; unavailable counters render honest zeros.
  String get trafficLabel => "↓ $downLabel   ↑ $upLabel";
}

/// Injectable IP fetcher; production calls [fetchTunnelIp].
typedef TunnelIpFetcher = Future<String> Function();

/// Reads real libbox counters through the existing singleton.
typedef TrafficReader = Future<TrafficSnapshot> Function();

/// Cancellable 1 Hz ticker factory, injectable for deterministic tests.
typedef StatsTicker = Timer Function(Duration interval, void Function() onTick);

/// Seam for the real IP request (overridden in tests; no network by default).
final Provider<TunnelIpFetcher> tunnelIpFetcherProvider =
    Provider<TunnelIpFetcher>((ref) => fetchTunnelIp);

/// Seam for libbox traffic counters (overridden in tests).
final Provider<TrafficReader> trafficReaderProvider = Provider<TrafficReader>(
  (ref) => LibboxPingCore.instance.traffic,
);

/// Seam for the 1 Hz timer (overridden in tests with a controlled timer).
final Provider<StatsTicker> statsTickerProvider = Provider<StatsTicker>(
  (ref) => (interval, onTick) => Timer.periodic(interval, (_) => onTick()),
);

/// Live stats for the connected session only.
///
/// A `connected` FSM phase starts exactly one cancellable 1 Hz timer and one
/// IP request. Leaving `connected` (disconnect/error/reconnect) cancels the
/// timer and invalidates the cached IP, so no stale live value survives.
final NotifierProvider<ConnectedStatsNotifier, ConnectedStats>
    connectedStatsProvider =
    NotifierProvider<ConnectedStatsNotifier, ConnectedStats>(
  ConnectedStatsNotifier.new,
);

/// Owns the single live-stats timer and the per-session IP cache.
class ConnectedStatsNotifier extends Notifier<ConnectedStats> {
  Timer? _timer;
  DateTime? _session;
  String _ip = "";
  int _down = 0;
  int _up = 0;
  bool _available = false;

  @override
  ConnectedStats build() {
    final connection = ref.watch(connectionNotifierProvider);
    ref.onDispose(_stopTimer);

    final connectedAt = connection.phase == ConnPhase.connected
        ? connection.connectedAt
        : null;
    if (connectedAt == null) {
      // Disconnect/error/reconnect start: no timer, no cached IP, no stale data.
      _stopTimer();
      _session = null;
      _ip = "";
      _down = 0;
      _up = 0;
      _available = false;
      return ConnectedStats.empty;
    }

    if (_session != connectedAt) {
      // A new session (or reconnect) invalidates the previous IP and timer.
      _stopTimer();
      _session = connectedAt;
      _ip = "";
    }

    _timer ??= ref.read(statsTickerProvider)(
      connectedStatsInterval,
      _tick,
    );

    // Defer state writes until after build() returns.
    scheduleMicrotask(() {
      unawaited(_refreshIp(connectedAt));
      unawaited(_refreshTraffic(connectedAt));
    });

    return _snapshot(connectedAt);
  }

  void _stopTimer() {
    _timer?.cancel();
    _timer = null;
  }

  int? _elapsed(DateTime session) =>
      DateTime.now().difference(session).inSeconds;

  ConnectedStats _snapshot(DateTime session) => ConnectedStats(
        ip: _ip,
        down: _down,
        up: _up,
        available: _available,
        elapsedSeconds: _elapsed(session),
      );

  /// One tick: advance the timer immediately, then read counters async.
  void _tick() {
    final session = _session;
    if (session == null) return;
    state = _snapshot(session);
    unawaited(_refreshTraffic(session));
  }

  Future<void> _refreshIp(DateTime session) async {
    final ip = await ref.read(tunnelIpFetcherProvider)();
    if (_session != session) return; // stale session: never show a stale IP
    _ip = ip;
    state = _snapshot(session);
  }

  Future<void> _refreshTraffic(DateTime session) async {
    try {
      final snapshot = await ref.read(trafficReaderProvider)();
      if (_session != session) return;
      _down = snapshot.available ? snapshot.down : 0;
      _up = snapshot.available ? snapshot.up : 0;
      _available = snapshot.available;
    } on Object {
      // No raw libbox error text reaches logs or UI values.
      if (_session != session) return;
      _down = 0;
      _up = 0;
      _available = false;
    }
    state = _snapshot(session);
  }
}
