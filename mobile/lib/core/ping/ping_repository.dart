import "dart:async";

import "libbox_ping_service.dart";
import "ping_result.dart";
import "socket_ping_service.dart";

/// TTL of a fresh ping cache row (D-10 / REQ-PING-04).
const Duration pingCacheTtl = Duration(seconds: 60);

/// Quick-path budget for last-good probes (D-09).
const Duration pingQuickTimeout = Duration(milliseconds: 800);

/// Full-ping budget for every server in a tab (D-09).
const Duration pingFullTimeout = Duration(milliseconds: 2000);

/// Default bounded parallelism; D-09 allows 10-16.
const int pingDefaultConcurrency = 12;

/// Minimal ping target; the phase 19-06 `Server` maps onto this surface.
class PingTarget {
  /// Creates a target.
  const PingTarget({
    required this.id,
    required this.host,
    required this.port,
    required this.protocol,
    required this.outbound,
    required this.tab,
  });

  /// Stable non-secret id; the libbox outbound tag is `srv-<id>`.
  final String id;

  /// Host literal (may be a bracketed IPv6 address).
  final String host;

  /// Port as text, parsed with `int.tryParse` for the TCP fallback.
  final String port;

  /// Canonical scheme (vless, ss, hysteria2, trojan, wg, vmess).
  final String protocol;

  /// Minimal sing-box outbound/endpoint; machine-only, never logged.
  final Map<String, dynamic> outbound;

  /// Pool tab (`simple` or `whitelist`).
  final String tab;
}

/// Cache row written to Drift `ping_cache` by `PingCacheDao` (19-04).
class PingCacheEntry {
  /// Creates a cache row.
  const PingCacheEntry({
    required this.serverId,
    required this.tab,
    required this.rttMs,
    required this.online,
    required this.approx,
    required this.tsMs,
  });

  /// Server id.
  final String serverId;

  /// Pool tab.
  final String tab;

  /// Measured RTT, or `null` when offline.
  final int? rttMs;

  /// Whether the server answered.
  final bool online;

  /// Whether the sample came from the silent TCP fallback.
  final bool approx;

  /// Epoch milliseconds of the sample.
  final int tsMs;
}

/// Write boundary for ping results; `PingCacheDao` implements it in 19-04.
abstract class PingCacheWriter {
  /// Persists one result.
  Future<void> write(PingCacheEntry entry);
}

/// Fresh-row lookup boundary; `PingCacheDao` implements it in 19-04.
///
/// Async because a real Drift DAO reads SQLite through a [Future]; a
/// synchronous seam cannot be implemented by a database-backed cache.
abstract class PingCacheLookup {
  /// Returns the newest row for [serverId]/[tab] when it is still fresh.
  Future<PingCacheEntry?> fresh(
    String serverId,
    String tab, {
    required int nowMs,
    Duration ttl = pingCacheTtl,
  });
}

/// A target paired with its real ping observation.
class PingOutcome {
  /// Creates an outcome.
  const PingOutcome({
    required this.target,
    required this.result,
  });

  /// The probed target.
  final PingTarget target;

  /// Its observation.
  final PingResult result;
}

class _IndexedOutcome {
  const _IndexedOutcome(this.index, this.outcome);

  final int index;
  final PingOutcome outcome;
  int get rtt => outcome.result.rttMs ?? 0;
}

/// Online outcomes ranked by RTT ascending, stable on input order.
///
/// `load` is deferred (D-04 / REQ-PING-06); the tie-break is RTT-only here.
/// The phase 19-06 `bestServerProvider` applies this to card ordering.
List<PingOutcome> rankBest(Iterable<PingOutcome> outcomes) {
  final indexed = <_IndexedOutcome>[];
  var index = 0;
  for (final outcome in outcomes) {
    if (outcome.result.online) {
      indexed.add(_IndexedOutcome(index, outcome));
    }
    index++;
  }
  indexed.sort((a, b) {
    final byRtt = a.rtt.compareTo(b.rtt);
    return byRtt != 0 ? byRtt : a.index.compareTo(b.index);
  });
  return indexed.map((entry) => entry.outcome).toList();
}

/// Owns real ping, silent fallback, quick/full paths and cancellation.
class PingRepository {
  /// Creates a repository with injectable services and cache boundaries.
  PingRepository({
    required this.libbox,
    required this.socket,
    this.cacheWriter,
    this.cacheLookup,
    PingClock? nowMs,
  }) : _nowMs = nowMs ?? defaultPingClock;

  /// Real libbox urltest adapter.
  final LibboxPingService libbox;

  /// Silent TCP fallback adapter.
  final SocketPingService socket;

  /// Optional Drift write boundary (implemented in 19-04).
  final PingCacheWriter? cacheWriter;

  /// Optional fresh-row lookup boundary (implemented in 19-04).
  final PingCacheLookup? cacheLookup;

  final PingClock _nowMs;

  int _generation = 0;
  Future<void> _tail = Future<void>.value();

  /// Current generation token.
  int get generation => _generation;

  /// Invalidates all in-flight pings (network change / manual refresh).
  void cancelInflight() {
    _generation++;
  }

  /// Serializes native urltest calls: the shim owns one command client.
  Future<T> _serialize<T>(Future<T> Function() body) {
    final previous = _tail;
    final completer = Completer<void>();
    _tail = completer.future;
    return previous.then<T>((void value) async {
      try {
        return await body();
      } finally {
        completer.complete();
      }
    });
  }

  PingResult _offline() => PingResult(
        online: false,
        approx: false,
        tsMs: _nowMs(),
      );

  Future<void> _write(PingTarget target, PingResult result) async {
    final writer = cacheWriter;
    if (writer == null) {
      return;
    }
    await writer.write(
      PingCacheEntry(
        serverId: target.id,
        tab: target.tab,
        rttMs: result.rttMs,
        online: result.online,
        approx: result.approx,
        tsMs: result.tsMs,
      ),
    );
  }

  /// Pings one server: fresh cache, then libbox, then silent TCP fallback.
  Future<PingResult> pingServer(
    PingTarget target, {
    Duration timeout = pingQuickTimeout,
  }) async {
    final generation = _generation;
    final cached = await cacheLookup?.fresh(
      target.id,
      target.tab,
      nowMs: _nowMs(),
    );
    if (cached != null) {
      return PingResult(
        online: cached.online,
        rttMs: cached.rttMs,
        approx: cached.approx,
        tsMs: cached.tsMs,
      );
    }

    var result = await _serialize<PingResult?>(
      () => libbox.ping(target.id, target.outbound, timeout: timeout),
    );
    if (generation != _generation) {
      return _offline();
    }
    if (result == null) {
      // Silent boundary: no indication in the UI, no logging of config.
      result = await socket.ping(
        target.host,
        target.port,
        timeout: timeout,
      );
      if (generation != _generation) {
        return _offline();
      }
    }
    await _write(target, result);
    return result;
  }

  /// Pings up to [limit] most-recent last-good targets in parallel.
  ///
  /// Returns the fastest online outcome, or `null` when a full ping is needed.
  Future<PingOutcome?> quickPath(
    List<PingTarget> lastGood, {
    Duration timeout = pingQuickTimeout,
    int limit = 3,
  }) async {
    final generation = _generation;
    final candidates = <PingTarget>[];
    final seen = <String>{};
    for (final target in lastGood) {
      if (candidates.length >= limit) {
        break;
      }
      if (seen.add(target.id)) {
        candidates.add(target);
      }
    }
    if (candidates.isEmpty) {
      return null;
    }
    final outcomes = await _pingAll(
      candidates,
      timeout: timeout,
      concurrency: candidates.length,
      generation: generation,
    );
    if (generation != _generation) {
      return null;
    }
    final ranked = rankBest(outcomes);
    return ranked.isEmpty ? null : ranked.first;
  }

  /// Pings every target in the tab with bounded parallelism.
  ///
  /// [onResult] fires per completed sample; the returned list is the final
  /// update, in input order. Every callback is generation-checked.
  Future<List<PingOutcome>> fullPing(
    List<PingTarget> targets, {
    Duration timeout = pingFullTimeout,
    int concurrency = pingDefaultConcurrency,
    void Function(PingOutcome outcome)? onResult,
  }) async {
    final generation = _generation;
    if (targets.isEmpty) {
      return <PingOutcome>[];
    }
    final bounded = concurrency.clamp(10, 16).toInt();
    final outcomes = await _pingAll(
      targets,
      timeout: timeout,
      concurrency: bounded,
      generation: generation,
      onResult: onResult,
    );
    if (generation != _generation) {
      return <PingOutcome>[];
    }
    return outcomes;
  }

  Future<List<PingOutcome>> _pingAll(
    List<PingTarget> targets, {
    required Duration timeout,
    required int concurrency,
    required int generation,
    void Function(PingOutcome outcome)? onResult,
  }) async {
    final results = List<PingOutcome?>.filled(targets.length, null);
    var next = 0;

    Future<void> worker() async {
      while (generation == _generation) {
        final index = next++;
        if (index >= targets.length) {
          return;
        }
        final target = targets[index];
        final result = await pingServer(target, timeout: timeout);
        if (generation != _generation) {
          return;
        }
        final outcome = PingOutcome(target: target, result: result);
        results[index] = outcome;
        onResult?.call(outcome);
      }
    }

    final workerCount =
        concurrency < targets.length ? concurrency : targets.length;
    final workers = <Future<void>>[];
    for (var i = 0; i < workerCount; i++) {
      workers.add(worker());
    }
    await Future.wait(workers);
    return results.whereType<PingOutcome>().toList();
  }
}
