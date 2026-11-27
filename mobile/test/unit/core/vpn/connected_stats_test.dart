import "dart:async";

import "package:flutter_riverpod/flutter_riverpod.dart";
import "package:flutter_test/flutter_test.dart";

import "package:mobile/core/ping/libbox_core.dart"
    show TrafficSnapshot, decodeTrafficSnapshot;
import "package:mobile/core/vpn/connected_stats.dart";
import "package:mobile/core/vpn/connection_notifier.dart"
    show ConnectionNotifier, connectionNotifierProvider;
import "package:mobile/core/vpn/connection_state.dart" as vpn_state;

/// Controlled 1 Hz timer: fires only when the test says so.
class ControlledTimer implements Timer {
  ControlledTimer(this.interval, this.callback);

  final Duration interval;
  final void Function() callback;
  bool cancelled = false;
  int _ticks = 0;

  @override
  bool get isActive => !cancelled;

  @override
  int get tick => _ticks;

  void fire() {
    if (cancelled) return;
    _ticks++;
    callback();
  }

  @override
  void cancel() {
    cancelled = true;
  }
}

/// FSM stand-in whose phase can be flipped without any tunnel or BFF.
class FakeConnectionNotifier extends ConnectionNotifier {
  FakeConnectionNotifier(vpn_state.ConnectionState initial)
      : _state = initial;

  vpn_state.ConnectionState _state;

  @override
  vpn_state.ConnectionState build() => _state;

  void setPhase(vpn_state.ConnPhase phase, {DateTime? connectedAt}) {
    _state = vpn_state.ConnectionState(phase: phase, connectedAt: connectedAt);
    state = _state;
  }
}

vpn_state.ConnectionState _connected(DateTime at) => vpn_state.ConnectionState(
      phase: vpn_state.ConnPhase.connected,
      connectedAt: at,
    );

Future<void> flush() async {
  for (var i = 0; i < 12; i++) {
    await Future<void>.delayed(Duration.zero);
  }
}

void main() {
  group("fetchTunnelIp — honest fallback", () {
    test("non-200, malformed body and timeout yield an empty IP", () async {
      var seenUri = "";
      Duration? seenTimeout;
      final non200 = await fetchTunnelIp(
        get: (uri, {required timeout}) async {
          seenUri = uri.toString();
          seenTimeout = timeout;
          return TunnelHttpResponse(
            statusCode: 502,
            body: "upstream raw error text",
          );
        },
      );
      expect(seenUri, tunnelIpEndpoint);
      expect(seenTimeout, tunnelIpTimeout);
      expect(non200, "");

      final html = await fetchTunnelIp(
        get: (uri, {required timeout}) async => const TunnelHttpResponse(
          statusCode: 200,
          body: "<html>not an address</html>",
        ),
      );
      expect(html, "");

      final timedOut = await fetchTunnelIp(
        get: (uri, {required timeout}) => throw TimeoutException(
          "raw socket error 203.0.113.99",
          const Duration(seconds: 2),
        ),
      );
      expect(timedOut, "");
      // No raw HTTP text reaches a UI value.
      expect(ConnectedStats(ip: timedOut).ipLabel, "—");
      expect(ConnectedStats(ip: timedOut).ipLabel, isNot(contains("raw")));
    });

    test("a real 200 IP literal is parsed and cached as a UI value", () async {
      final ip = await fetchTunnelIp(
        get: (uri, {required timeout}) async => const TunnelHttpResponse(
          statusCode: 200,
          body: " 203.0.113.7\n",
        ),
      );
      expect(ip, "203.0.113.7");
      expect(ConnectedStats(ip: ip).ipLabel, "203.0.113.7");
      expect(ConnectedStats.empty.ipLabel, "—");
    });
  });

  group("lossless counters and fixed formatting", () {
    test("byte→MB uses two decimals and rounds instead of truncating", () {
      expect(formatMb(0), "0.00");
      expect(formatMb(-1), "0.00");
      expect(formatMb(1024 * 1024), "1.00");
      expect(formatMb(1572864), "1.50");
      expect(formatMb(1024 * 1024 + 1234), "1.00");
      expect(formatMb(1024 * 1024 + 5243), "1.01");
    });

    test("elapsed seconds format as HH:MM:SS with honest dashes", () {
      expect(formatElapsed(null), "—:—:—");
      expect(formatElapsed(-1), "—:—:—");
      expect(formatElapsed(0), "00:00:00");
      expect(formatElapsed(65), "00:01:05");
      expect(formatElapsed(3661), "01:01:01");
      expect(formatElapsed(360000), "100:00:00");
    });

    test("traffic with available:false decodes to honest zeros", () {
      final snapshot = decodeTrafficSnapshot(
        '{"down":123456,"up":654321,"available":false}',
      );
      expect(snapshot.available, isFalse);
      expect(snapshot.down, 0);
      expect(snapshot.up, 0);
      expect(decodeTrafficSnapshot("").available, isFalse);
      expect(decodeTrafficSnapshot("not json").down, 0);
      expect(
        ConnectedStats(down: snapshot.down, up: snapshot.up).trafficLabel,
        "↓ 0.00   ↑ 0.00",
      );
    });
  });

  group("connectedStatsProvider — 1 Hz lifecycle", () {
    ProviderContainer makeContainer({
      required FakeConnectionNotifier fsm,
      required List<ControlledTimer> timers,
      required List<String> fetchedIps,
      required int Function() trafficReads,
      required Future<TrafficSnapshot> Function() traffic,
    }) =>
        ProviderContainer(
          overrides: [
            connectionNotifierProvider.overrideWith(() => fsm),
            tunnelIpFetcherProvider.overrideWithValue(() async {
              final ip = fetchedIps.removeAt(0);
              return ip;
            }),
            trafficReaderProvider.overrideWithValue(() {
              trafficReads();
              return traffic();
            }),
            statsTickerProvider.overrideWithValue((interval, onTick) {
              expect(interval, const Duration(seconds: 1));
              final timer = ControlledTimer(interval, onTick);
              timers.add(timer);
              return timer;
            }),
          ],
        );

    test("connected caches IP and reads traffic at 1 Hz", () async {
      final session = DateTime.now();
      final fsm = FakeConnectionNotifier(_connected(session));
      final timers = <ControlledTimer>[];
      final fetchedIps = <String>["198.51.100.4"];
      var reads = 0;
      final container = makeContainer(
        fsm: fsm,
        timers: timers,
        fetchedIps: fetchedIps,
        trafficReads: () => reads++,
        traffic: () async => const TrafficSnapshot(
          down: 1048576,
          up: 524288,
          available: true,
        ),
      );
      addTearDown(container.dispose);

      container.read(connectedStatsProvider);
      await flush();

      expect(timers.length, 1);
      expect(timers.single.interval, connectedStatsInterval);
      expect(fetchedIps, isEmpty);
      expect(reads, 1);
      var stats = container.read(connectedStatsProvider);
      expect(stats.ip, "198.51.100.4");
      expect(stats.downLabel, "1.00");
      expect(stats.upLabel, "0.50");
      expect(stats.available, isTrue);
      expect(stats.timerLabel, isNot("—:—:—"));

      timers.single.fire();
      await flush();
      stats = container.read(connectedStatsProvider);
      expect(timers.single.tick, 1);
      expect(timers.length, 1); // exactly one 1 Hz timer
      expect(reads, 2);
      expect(stats.ip, "198.51.100.4"); // cached for the session
    });

    test("leaving connected cancels timer and invalidates IP", () async {
      final fsm = FakeConnectionNotifier(_connected(DateTime.now()));
      final timers = <ControlledTimer>[];
      final fetchedIps = <String>["198.51.100.4"];
      var reads = 0;
      final container = makeContainer(
        fsm: fsm,
        timers: timers,
        fetchedIps: fetchedIps,
        trafficReads: () => reads++,
        traffic: () async => const TrafficSnapshot.zero(),
      );
      addTearDown(container.dispose);

      container.read(connectedStatsProvider);
      await flush();
      final first = timers.single;
      expect(first.cancelled, isFalse);
      expect(container.read(connectedStatsProvider).ip, "198.51.100.4");

      fsm.setPhase(vpn_state.ConnPhase.idle);
      await flush();

      expect(first.cancelled, isTrue);
      final stats = container.read(connectedStatsProvider);
      expect(stats, ConnectedStats.empty);
      expect(stats.ipLabel, "—");
      expect(stats.timerLabel, "—:—:—");
      expect(stats.trafficLabel, "↓ 0.00   ↑ 0.00");
      expect(fetchedIps, isEmpty); // stale IP is never refetched while idle
      first.fire();
      expect(reads, 1); // cancelled timer cannot trigger another read
    });

    test("reconnect resets the session, refetches IP and clears old values",
        () async {
      final firstSession = DateTime.now().subtract(const Duration(minutes: 5));
      final fsm = FakeConnectionNotifier(_connected(firstSession));
      final timers = <ControlledTimer>[];
      final fetchedIps = <String>["198.51.100.4", "198.51.100.9"];
      var reads = 0;
      final container = makeContainer(
        fsm: fsm,
        timers: timers,
        fetchedIps: fetchedIps,
        trafficReads: () => reads++,
        traffic: () async => const TrafficSnapshot(
          down: 1572864,
          up: 262144,
          available: true,
        ),
      );
      addTearDown(container.dispose);

      container.read(connectedStatsProvider);
      await flush();
      expect(timers.single.cancelled, isFalse);
      expect(container.read(connectedStatsProvider).ip, "198.51.100.4");

      fsm.setPhase(
        vpn_state.ConnPhase.connected,
        connectedAt: DateTime.now(),
      );
      await flush();
      // Riverpod rebuilds lazily: read to trigger, then let the IP resolve.
      container.read(connectedStatsProvider);
      await flush();
      final stats = container.read(connectedStatsProvider);

      expect(timers.length, 2);
      expect(timers.first.cancelled, isTrue);
      expect(timers.last.cancelled, isFalse);
      expect(fetchedIps, isEmpty);
      expect(stats.ip, "198.51.100.9");
      expect(stats.trafficLabel, "↓ 1.50   ↑ 0.25");
    });

    test("raw libbox errors never reach UI values", () async {
      final fsm = FakeConnectionNotifier(_connected(DateTime.now()));
      final timers = <ControlledTimer>[];
      final container = ProviderContainer(
        overrides: [
          connectionNotifierProvider.overrideWith(() => fsm),
          tunnelIpFetcherProvider.overrideWithValue(
            () async => throw StateError("raw HTTP secret body"),
          ),
          trafficReaderProvider.overrideWithValue(
            () => throw StateError("raw libbox config dump"),
          ),
          statsTickerProvider.overrideWithValue((interval, onTick) {
            final timer = ControlledTimer(interval, onTick);
            timers.add(timer);
            return timer;
          }),
        ],
      );
      addTearDown(container.dispose);

      container.read(connectedStatsProvider);
      await flush();
      final stats = container.read(connectedStatsProvider);
      expect(stats.ipLabel, "—");
      expect(stats.down, 0);
      expect(stats.up, 0);
      expect(stats.available, isFalse);
      expect(stats.trafficLabel, "↓ 0.00   ↑ 0.00");
      expect(stats.trafficLabel, isNot(contains("raw")));
      expect(stats.ipLabel, isNot(contains("secret")));
    });
  });
}
