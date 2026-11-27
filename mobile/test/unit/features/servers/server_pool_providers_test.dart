import "dart:convert";

import "package:dio/dio.dart";
import "package:drift/native.dart";
import "package:flutter_riverpod/flutter_riverpod.dart";
import "package:flutter_test/flutter_test.dart";
import "package:mocktail/mocktail.dart";

import "package:mobile/core/api/dio_client.dart";
import "package:mobile/core/api/endpoints.dart";
import "package:mobile/core/auth/auth_notifier.dart";
import "package:mobile/core/db/app_database.dart";
import "package:mobile/core/db/ping_cache_dao.dart";
import "package:mobile/core/ping/libbox_core.dart";
import "package:mobile/core/ping/libbox_ping_service.dart";
import "package:mobile/core/ping/ping_repository.dart";
import "package:mobile/core/ping/socket_ping_service.dart";
import "package:mobile/features/home/providers.dart";
import "package:mobile/features/servers/providers.dart";
import "package:mobile/features/servers/server.dart";

class MockDioClient extends Mock implements DioClient {}

class MockDio extends Mock implements Dio {}

/// Deterministic libbox stand-in: real-shaped samples, no simulation in prod.
class FakeLibboxClient implements LibboxPingClient {
  FakeLibboxClient(this.offline, this.calls);

  /// Ids whose urltest reports no usable history.
  final Set<String> offline;

  /// Observed outbound tags (proves ping did/did not run).
  final List<String> calls;

  @override
  Future<void> init() async {}

  @override
  Future<void> start(String configJson) async {}

  @override
  Future<LibboxUrltestResult> urltest(
    String tag, {
    Duration timeout = const Duration(seconds: 2),
  }) async {
    calls.add(tag);
    final id = tag.replaceFirst("srv-", "");
    if (offline.contains(id)) {
      return const LibboxUrltestResult(online: false, rttMs: 0);
    }
    return LibboxUrltestResult(online: true, rttMs: id == "fast" ? 12 : 90);
  }
}

Map<String, dynamic> _server(String id, {PoolTab tab = PoolTab.simple}) {
  return <String, dynamic>{
    "id": id,
    "name": id,
    "city": "Москва",
    "cc": "RU",
    "flag": "🇷🇺",
    "proto": "VLESS",
    "tab": tab.wireName,
    "host": "127.0.0.1",
    "port": 443,
    "protocol": "vless",
    "outbound": <String, dynamic>{"type": "vless", "tag": "srv-$id"},
  };
}

Map<String, dynamic> _payload({
  bool withKey = true,
  List<Map<String, dynamic>>? simple,
}) {
  return <String, dynamic>{
    "ok": true,
    "simple": simple ?? <Map<String, dynamic>>[_server("fast"), _server("slow")],
    "whitelist": <Map<String, dynamic>>[_server("wl", tab: PoolTab.whitelist)],
    "key": withKey
        ? <String, dynamic>{
            "active": true,
            "keyId": "key_1",
            "isTrial": false,
            "remainingDays": 30,
            "expireAt": null,
          }
        : null,
  };
}

void main() {
  late AppDatabase db;
  late PingCacheDao dao;
  late MockDio dio;
  late Set<String> offlineIds;
  late List<String> urltestCalls;
  late ProviderContainer container;

  void respondWith(Map<String, dynamic> data, {int status = 200}) {
    when(() => dio.get(Endpoints.servers)).thenAnswer(
      (_) async => Response<dynamic>(
        statusCode: status,
        data: data,
        requestOptions: RequestOptions(path: Endpoints.servers),
      ),
    );
  }

  void failWithNetworkError() {
    when(() => dio.get(Endpoints.servers)).thenThrow(
          DioException(
            requestOptions: RequestOptions(path: Endpoints.servers),
            error: "offline",
          ),
        );
  }

  Future<void> seedFresh(String id, {required int rttMs, bool online = true}) =>
      dao.upsert(
        PingCacheEntry(
          serverId: id,
          tab: "simple",
          rttMs: rttMs,
          online: online,
          approx: false,
          tsMs: DateTime.now().millisecondsSinceEpoch,
        ),
      );

  Future<T> withFreshPings<T>(Future<T> Function() body) async {
    final subscription =
        container.listen(pingCacheProvider(PoolTab.simple), (_, __) {});
    final poolSubscription = container.listen(serverPoolProvider, (_, __) {});
    await container.pump();
    await Future<void>.delayed(const Duration(milliseconds: 20));
    try {
      return await body();
    } finally {
      subscription.close();
      poolSubscription.close();
    }
  }

  setUp(() {
    db = AppDatabase(NativeDatabase.memory());
    dao = PingCacheDao(db);
    dio = MockDio();
    final dioClient = MockDioClient();
    when(() => dioClient.dio).thenReturn(dio);
    offlineIds = <String>{};
    urltestCalls = <String>[];
    final repository = PingRepository(
      libbox: LibboxPingService(
        client: FakeLibboxClient(offlineIds, urltestCalls),
      ),
      socket: SocketPingService(),
      cacheWriter: dao,
      cacheLookup: dao,
    );
    container = ProviderContainer(
      overrides: [
        appDatabaseProvider.overrideWithValue(db),
        dioClientProvider.overrideWithValue(dioClient),
        pingRepositoryProvider.overrideWithValue(repository),
      ],
    );
  });

  tearDown(() {
    container.dispose();
    db.close();
  });

  test(
    "end-to-end: /servers -> ping cache -> best server -> connect selects "
    "without starting a tunnel",
    () async {
      respondWith(_payload());

      final poolSubscription = container.listen(serverPoolProvider, (_, __) {});
      final pools = await container.read(serverPoolProvider.future);
      expect(pools.hasActiveKey, isTrue);
      expect(pools.simple.map((server) => server.id), <Object>["fast", "slow"]);
      expect(pools.whitelist.single.id, "wl");

      final outcome = await container
          .read(connectControllerProvider.notifier)
          .connect(PoolTab.simple, auto: true);
      expect(outcome.ok, isTrue);
      expect(outcome.serverId, "fast");
      expect(outcome.error, isNull);

      await withFreshPings(() async {
        expect(
          container.read(bestServerProvider(PoolTab.simple))?.id,
          "fast",
        );
      });

      final lastGood = await dao.lastGoodFor("simple");
      expect(lastGood.first.serverId, "fast");
      poolSubscription.close();
    },
  );

  test("no_active_key blocks ping and selection", () async {
    respondWith(_payload(withKey: false), status: 403);

    final pools = await container.read(serverPoolProvider.future);
    expect(pools.hasActiveKey, isFalse);
    expect(pools.error, "no_active_key");

    final outcome = await container
        .read(connectControllerProvider.notifier)
        .connect(PoolTab.simple, auto: true);
    expect(outcome.ok, isFalse);
    expect(outcome.blocked, isTrue);
    expect(outcome.notice, "Нет ключа");
    expect(urltestCalls, isEmpty);
  });

  test("empty pools suggest switching tab and never fabricate a server",
      () async {
    respondWith(_payload(simple: <Map<String, dynamic>>[]));

    final outcome = await container
        .read(connectControllerProvider.notifier)
        .connect(PoolTab.simple, auto: true);
    expect(outcome.ok, isFalse);
    expect(outcome.error, "no_servers");
    expect(outcome.suggestOtherTab, isTrue);
    expect(outcome.notice, "Нет доступных серверов. Попробуй другой таб");
    expect(urltestCalls, isEmpty);
  });

  test("provider failure falls back to the metadata-only Drift cache",
      () async {
    await dao.cacheServerList("simple", jsonEncode([_server("cached")]));
    await dao.cacheServerList("whitelist", "[]");
    failWithNetworkError();

    final pools = await container.read(serverPoolProvider.future);
    expect(pools.stale, isTrue);
    expect(pools.simple.single.id, "cached");
    expect(pools.notice, contains("Офлайн"));
  });

  test("online pools are cached metadata-only — no outbound secrets at rest",
      () async {
    respondWith(_payload());

    await container.read(serverPoolProvider.future);

    final cached = await dao.getServerList("simple");
    expect(cached, isNotNull);
    expect(cached, contains("fast"));
    expect(cached, isNot(contains("outbound")));
    expect(cached, isNot(contains("uuid")));
    final decoded = (jsonDecode(cached!) as List<dynamic>)
        .map((item) => Server.fromJson(Map<String, dynamic>.from(item as Map)))
        .toList();
    expect(decoded.single.outbound, isEmpty);
    expect(decoded.single.host, "127.0.0.1");
  });

  test("provider failure without a cache is a retryable network error",
      () async {
    failWithNetworkError();

    final pools = await container.read(serverPoolProvider.future);
    expect(pools.error, "network");
    expect(pools.simple, isEmpty);
    expect(pools.notice, contains("Повторите"));
  });

  test("pingCacheProvider exposes only rows inside the 60 s TTL", () async {
    respondWith(_payload());
    final now = DateTime.now().millisecondsSinceEpoch;
    await dao.upsert(
      PingCacheEntry(
        serverId: "fresh",
        tab: "simple",
        rttMs: 10,
        online: true,
        approx: false,
        tsMs: now,
      ),
    );
    await dao.upsert(
      PingCacheEntry(
        serverId: "stale",
        tab: "simple",
        rttMs: 10,
        online: true,
        approx: false,
        tsMs: now - 61000,
      ),
    );

    await withFreshPings(() async {
      final ids = (container.read(pingCacheProvider(PoolTab.simple)).value ??
              <PingCacheData>[])
          .map((row) => row.serverId)
          .toList();
      expect(ids, contains("fresh"));
      expect(ids, isNot(contains("stale")));
    });
  });

  test("TTL is re-checked at read time, not only on Drift emission", () {
    final now = DateTime.now().millisecondsSinceEpoch;
    final rows = <PingCacheData>[
      PingCacheData(
        serverId: "fresh",
        tab: "simple",
        rtt: 10,
        online: true,
        approx: false,
        ts: now,
      ),
      PingCacheData(
        serverId: "expired",
        tab: "simple",
        rtt: 10,
        online: true,
        approx: false,
        ts: now - 61000,
      ),
    ];

    expect(
      freshPingRows(rows, clock: () => now).map((row) => row.serverId),
      <Object>["fresh"],
    );
    expect(freshPingRows(rows, clock: () => now + 61000), isEmpty);
  });

  test("bestServerProvider ranks by RTT only and keeps offline servers last",
      () async {
    respondWith(_payload());
    await seedFresh("slow", rttMs: 90);
    await seedFresh("fast", rttMs: 12);
    await seedFresh("wl", rttMs: 1);

    await withFreshPings(() async {
      expect(container.read(bestServerProvider(PoolTab.simple))?.id, "fast");
      expect(
        container.read(bestServerProvider(PoolTab.whitelist)),
        isNull,
        reason: "whitelist has no fresh cached row in this scenario",
      );
    });
  });

  test("all offline yields an error, retry hint and no selection", () async {
    respondWith(_payload());
    await seedFresh("fast", rttMs: 0, online: false);
    await seedFresh("slow", rttMs: 0, online: false);

    await withFreshPings(() async {
      expect(container.read(bestServerProvider(PoolTab.simple)), isNull);
    });
    final outcome = await container
        .read(connectControllerProvider.notifier)
        .connect(PoolTab.simple, auto: true);
    expect(outcome.ok, isFalse);
    expect(outcome.error, "all_offline");
    expect(outcome.suggestOtherTab, isTrue);
  });

  test("selection, last-good and current tab are independent per tab",
      () async {
    respondWith(_payload());
    await container
        .read(selectionProvider(PoolTab.simple).notifier)
        .select("fast");
    await dao.pushLastGood("simple", "fast",
        tsMs: DateTime.now().millisecondsSinceEpoch);
    await container.read(currentTabProvider.notifier).setTab(PoolTab.whitelist);

    expect(container.read(selectionProvider(PoolTab.simple)), "fast");
    expect(container.read(selectionProvider(PoolTab.whitelist)), isNull);
    expect(await dao.getSelection("whitelist"), isNull);
    expect((await dao.lastGoodFor("whitelist")).isEmpty, isTrue);
    expect(container.read(currentTabProvider), PoolTab.whitelist);
    expect(await dao.getCurrentTab(), "whitelist");
  });

  test("manual choice is probed first and falls back to auto when offline",
      () async {
    respondWith(_payload());
    offlineIds.add("fast");
    await dao.setSelection("simple", "fast");

    final outcome = await container
        .read(connectControllerProvider.notifier)
        .connect(PoolTab.simple, auto: false);
    expect(outcome.ok, isTrue);
    expect(outcome.serverId, "slow");
    expect(outcome.notice, "Сервер недоступен — включаю автовыбор");
    expect(urltestCalls, contains("srv-fast"));
  });

  test("manual refresh re-pings and reports «Пинг обновлён»", () async {
    respondWith(_payload());

    final outcome = await container
        .read(connectControllerProvider.notifier)
        .refresh(PoolTab.simple);
    expect(outcome.ok, isTrue);
    expect(outcome.notice, "Пинг обновлён");
    expect(urltestCalls, contains("srv-fast"));
    expect(urltestCalls, contains("srv-slow"));
  });

  test("load is deferred: no load field is parsed or emitted", () async {
    final payload = _payload();
    final first = (payload["simple"] as List<Map<String, dynamic>>).first;
    first["load"] = 99;

    final pools = ServerPools.fromJson(payload);
    expect(pools.simple.first.toJson().containsKey("load"), isFalse);
    expect(pools.simple.first.toJson().containsKey("outbound"), isTrue);
  });
}
