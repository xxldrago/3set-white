import "dart:async";
import "dart:io";

import "package:flutter_test/flutter_test.dart";
import "package:mobile/core/ping/libbox_core.dart";
import "package:mobile/core/ping/libbox_ping_service.dart";
import "package:mobile/core/ping/ping_repository.dart";
import "package:mobile/core/ping/ping_result.dart";
import "package:mobile/core/ping/socket_ping_service.dart";
import "package:mocktail/mocktail.dart";

class MockLibboxPingClient extends Mock implements LibboxPingClient {}

class MockSocket extends Mock implements Socket {}

class FakeCache implements PingCacheWriter, PingCacheLookup {
  final Map<String, PingCacheEntry> _rows = <String, PingCacheEntry>{};

  int writes = 0;

  @override
  Future<void> write(PingCacheEntry entry) async {
    writes++;
    _rows["${entry.serverId}:${entry.tab}"] = entry;
  }

  @override
  PingCacheEntry? fresh(
    String serverId,
    String tab, {
    required int nowMs,
    Duration ttl = pingCacheTtl,
  }) {
    final row = _rows["$serverId:$tab"];
    if (row == null) {
      return null;
    }
    return nowMs - row.tsMs <= ttl.inMilliseconds ? row : null;
  }
}

Future<Socket> okConnector(
  InternetAddress host,
  int port, {
  Duration timeout = const Duration(milliseconds: 800),
}) async => MockSocket();

Future<Socket> refusedConnector(
  InternetAddress host,
  int port, {
  Duration timeout = const Duration(milliseconds: 800),
}) async => throw const SocketException("refused");

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  registerFallbackValue(const LibboxUrltestResult(online: false, rttMs: 0));
  registerFallbackValue("");
  registerFallbackValue(const Duration(seconds: 1));

  PingTarget target(String id, {String tab = "simple"}) => PingTarget(
        id: id,
        host: "127.0.0.1",
        port: "443",
        protocol: "vless",
        outbound: const <String, dynamic>{"type": "vless"},
        tab: tab,
      );

  LibboxPingService unavailableLibbox() {
    final client = MockLibboxPingClient();
    when(client.init).thenAnswer(
      (_) async => throw const LibboxUnavailableException("shim absent"),
    );
    return LibboxPingService(client: client, nowMs: () => 1000);
  }

  PingRepository repositoryWith(
    LibboxPingService libbox, {
    SocketConnector? connector,
    PingCacheWriter? cacheWriter,
    PingCacheLookup? cacheLookup,
    int Function()? nowMs,
  }) => PingRepository(
        libbox: libbox,
        socket: SocketPingService(
          connector: connector ?? okConnector,
          nowMs: nowMs ?? () => 1000,
        ),
        cacheWriter: cacheWriter,
        cacheLookup: cacheLookup,
        nowMs: nowMs ?? () => 1000,
      );

  Future<void> drainMicrotasks() async {
    for (var i = 0; i < 40; i++) {
      await Future<void>.delayed(Duration.zero);
    }
  }

  group("pingServer", () {
    test("maps a real libbox urltest result", () async {
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
      final repository = repositoryWith(
        LibboxPingService(client: client, nowMs: () => 1000),
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

    test("falls back silently to the approx TCP probe", () async {
      final repository = repositoryWith(unavailableLibbox());

      final result = await repository.pingServer(target("s2"));

      expect(result.online, isTrue);
      expect(result.approx, isTrue);
      expect(result.tsMs, 1000);
    });

    test("uses fresh cache first and does not re-ping", () async {
      final client = MockLibboxPingClient();
      final service = LibboxPingService(client: client, nowMs: () => 1000);
      var connectorCalls = 0;
      Future<Socket> counted(
        InternetAddress host,
        int port, {
        Duration timeout = const Duration(milliseconds: 800),
      }) async {
        connectorCalls++;
        return MockSocket();
      }
      final cache = FakeCache();
      await cache.write(
        const PingCacheEntry(
          serverId: "s3",
          tab: "simple",
          rttMs: 15,
          online: true,
          approx: false,
          tsMs: 1000,
        ),
      );
      final repository = repositoryWith(
        service,
        connector: counted,
        cacheWriter: cache,
        cacheLookup: cache,
      );

      final result = await repository.pingServer(target("s3"));

      expect(result.rttMs, 15);
      expect(result.approx, isFalse);
      expect(connectorCalls, 0);
      verifyNever(
        () => client.urltest(any(), timeout: any(named: "timeout")),
      );
    });

    test("writes approx=false for libbox and approx=true for fallback",
        () async {
      final cache = FakeCache();
      final client = MockLibboxPingClient();
      when(client.init).thenAnswer((_) async {});
      when(() => client.start(any())).thenAnswer((_) async {});
      when(
        () => client.urltest(any(), timeout: any(named: "timeout")),
      ).thenAnswer(
        (_) async => const LibboxUrltestResult(online: true, rttMs: 9),
      );
      final libbox = LibboxPingService(client: client, nowMs: () => 10);
      final first = repositoryWith(libbox, cacheWriter: cache);
      await first.pingServer(target("lib"));

      final second = repositoryWith(
        unavailableLibbox(),
        cacheWriter: cache,
        connector: okConnector,
      );
      await second.pingServer(target("tcp"));

      expect(cache.writes, 2);
      expect(cache.fresh("lib", "simple", nowMs: 10)!.approx, isFalse);
      expect(cache.fresh("tcp", "simple", nowMs: 10)!.approx, isTrue);
    });
  });

  group("quickPath", () {
    test("picks the fastest of <=3 last-good at 800 ms", () async {
      final client = MockLibboxPingClient();
      final samples = <String, LibboxUrltestResult>{
        "srv-a": const LibboxUrltestResult(online: true, rttMs: 150),
        "srv-b": const LibboxUrltestResult(online: true, rttMs: 50),
        "srv-c": const LibboxUrltestResult(online: false, rttMs: 0),
      };
      final timeouts = <Duration>[];
      when(client.init).thenAnswer((_) async {});
      when(() => client.start(any())).thenAnswer((_) async {});
      when(
        () => client.urltest(any(), timeout: any(named: "timeout")),
      ).thenAnswer((invocation) async {
        final tag = invocation.positionalArguments.first as String;
        timeouts.add(invocation.namedArguments[#timeout] as Duration);
        return samples[tag] ??
            const LibboxUrltestResult(online: false, rttMs: 0);
      });
      final repository = repositoryWith(
        LibboxPingService(client: client, nowMs: () => 1),
        connector: refusedConnector,
      );

      final best = await repository.quickPath([
        target("c"),
        target("a"),
        target("b"),
      ]);

      expect(best, isNotNull);
      expect(best!.target.id, "b");
      expect(best.result.rttMs, 50);
      expect(timeouts, hasLength(3));
      expect(timeouts, everyElement(const Duration(milliseconds: 800)));
    });

    test("no last-good means full ping is needed", () async {
      final repository = repositoryWith(unavailableLibbox());

      expect(await repository.quickPath(const <PingTarget>[]), isNull);
    });

    test("dedupes and caps at three most-recent targets", () async {
      final client = MockLibboxPingClient();
      var calls = 0;
      when(client.init).thenAnswer((_) async {});
      when(() => client.start(any())).thenAnswer((_) async {});
      when(
        () => client.urltest(any(), timeout: any(named: "timeout")),
      ).thenAnswer((_) async {
        calls++;
        return const LibboxUrltestResult(online: true, rttMs: 20);
      });
      final repository = repositoryWith(
        LibboxPingService(client: client, nowMs: () => 1),
      );

      await repository.quickPath([
        target("a"),
        target("a"),
        target("b"),
        target("c"),
        target("d"),
      ]);

      expect(calls, 3);
    });

    test("all offline returns null so a full ping runs", () async {
      final repository = repositoryWith(
        unavailableLibbox(),
        connector: refusedConnector,
      );

      final best = await repository.quickPath([
        target("a"),
        target("b"),
      ]);

      expect(best, isNull);
    });
  });

  group("fullPing", () {
    test("bounds concurrency and reports per-result plus final", () async {
      final release = Completer<void>();
      var active = 0;
      var maxActive = 0;
      Future<Socket> gated(
        InternetAddress host,
        int port, {
        Duration timeout = const Duration(milliseconds: 800),
      }) async {
        active++;
        if (active > maxActive) {
          maxActive = active;
        }
        await release.future;
        active--;
        return MockSocket();
      }
      final targets = List<PingTarget>.generate(
        20,
        (index) => target("t$index"),
      );
      var reported = 0;
      final repository = repositoryWith(
        unavailableLibbox(),
        connector: gated,
      );

      final pending = repository.fullPing(
        targets,
        onResult: (outcome) {
          expect(outcome.result.approx, isTrue);
          reported++;
        },
      );
      await drainMicrotasks();
      expect(maxActive, greaterThan(1));
      expect(maxActive, lessThanOrEqualTo(16));

      release.complete();
      final outcomes = await pending;
      expect(outcomes, hasLength(20));
      expect(reported, 20);
      expect(
        outcomes.map((outcome) => outcome.target.id).toList(),
        targets.map((item) => item.id).toList(),
      );
    });

    test("empty tab yields no results", () async {
      final repository = repositoryWith(unavailableLibbox());

      expect(await repository.fullPing(const <PingTarget>[]), isEmpty);
    });

    test("applies the 2000 ms full-ping timeout", () async {
      final client = MockLibboxPingClient();
      final timeouts = <Duration>[];
      when(client.init).thenAnswer((_) async {});
      when(() => client.start(any())).thenAnswer((_) async {});
      when(
        () => client.urltest(any(), timeout: any(named: "timeout")),
      ).thenAnswer((invocation) async {
        timeouts.add(invocation.namedArguments[#timeout] as Duration);
        return const LibboxUrltestResult(online: true, rttMs: 12);
      });
      final repository = repositoryWith(
        LibboxPingService(client: client, nowMs: () => 1),
      );

      await repository.fullPing([target("a"), target("b")]);

      expect(timeouts, hasLength(2));
      expect(timeouts, everyElement(const Duration(milliseconds: 2000)));
    });

    test("serializes native urltests", () async {
      final client = MockLibboxPingClient();
      final release = Completer<void>();
      var active = 0;
      var maxOverlap = 0;
      when(client.init).thenAnswer((_) async {});
      when(() => client.start(any())).thenAnswer((_) async {});
      when(
        () => client.urltest(any(), timeout: any(named: "timeout")),
      ).thenAnswer((_) async {
        active++;
        if (active > maxOverlap) {
          maxOverlap = active;
        }
        await release.future;
        active--;
        return const LibboxUrltestResult(online: true, rttMs: 7);
      });
      final repository = repositoryWith(
        LibboxPingService(client: client, nowMs: () => 1),
      );

      final pending = repository.fullPing(
        List<PingTarget>.generate(6, (index) => target("u$index")),
        concurrency: 8,
      );
      await drainMicrotasks();
      expect(maxOverlap, 1);

      release.complete();
      expect(await pending, hasLength(6));
    });

    test("cancellation leaves no orphan results or callbacks", () async {
      final release = Completer<void>();
      Future<Socket> gated(
        InternetAddress host,
        int port, {
        Duration timeout = const Duration(milliseconds: 800),
      }) async {
        await release.future;
        return MockSocket();
      }
      var reported = 0;
      final repository = repositoryWith(
        unavailableLibbox(),
        connector: gated,
      );

      final pending = repository.fullPing(
        [target("a"), target("b")],
        onResult: (outcome) {
          reported++;
        },
      );
      await drainMicrotasks();
      repository.cancelInflight();
      release.complete();

      expect(await pending, isEmpty);
      expect(reported, 0);
      expect(repository.generation, 1);
    });
  });

  group("rankBest", () {
    test("sorts online by RTT ascending, stable, and excludes offline", () {
      final outcomes = [
        PingOutcome(
          target: target("slow"),
          result: const PingResult(
            online: true,
            rttMs: 180,
            approx: false,
            tsMs: 1,
          ),
        ),
        PingOutcome(
          target: target("fast"),
          result: const PingResult(
            online: true,
            rttMs: 40,
            approx: true,
            tsMs: 2,
          ),
        ),
        PingOutcome(
          target: target("down"),
          result: const PingResult(
            online: false,
            approx: false,
            tsMs: 3,
          ),
        ),
      ];

      final ranked = rankBest(outcomes);

      expect(
        ranked.map((outcome) => outcome.target.id).toList(),
        ["fast", "slow"],
      );
    });
  });
}
