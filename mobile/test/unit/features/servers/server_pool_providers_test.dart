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
import "package:mobile/features/servers/providers.dart";
import "package:mobile/features/servers/server.dart";

class MockDioClient extends Mock implements DioClient {}

class MockDio extends Mock implements Dio {}

/// Deterministic libbox stand-in: real-shaped samples, no simulation in prod.
class FakeLibboxClient implements LibboxPingClient {
  @override
  Future<void> init() async {}

  @override
  Future<void> start(String configJson) async {}

  @override
  Future<LibboxUrltestResult> urltest(
    String tag, {
    Duration timeout = const Duration(seconds: 2),
  }) async {
    final id = tag.replaceFirst("srv-", "");
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

Map<String, dynamic> _payload({bool withKey = true}) {
  return <String, dynamic>{
    "ok": true,
    "simple": <Map<String, dynamic>>[
      _server("fast"),
      _server("slow"),
    ],
    "whitelist": <Map<String, dynamic>>[
      _server("wl", tab: PoolTab.whitelist),
    ],
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
  late MockDio dio;
  late ProviderContainer container;

  setUp(() {
    db = AppDatabase(NativeDatabase.memory());
    dio = MockDio();
    final dioClient = MockDioClient();
    when(() => dioClient.dio).thenReturn(dio);
    final dao = PingCacheDao(db);
    final repository = PingRepository(
      libbox: LibboxPingService(client: FakeLibboxClient()),
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
      when(() => dio.get(Endpoints.servers)).thenAnswer(
        (_) async => Response<dynamic>(
          statusCode: 200,
          data: _payload(),
          requestOptions: RequestOptions(path: Endpoints.servers),
        ),
      );

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

      final cacheSubscription =
          container.listen(pingCacheProvider(PoolTab.simple), (_, __) {});
      await container.pump();
      await Future<void>.delayed(const Duration(milliseconds: 20));
      expect(
        container.read(bestServerProvider(PoolTab.simple))?.id,
        "fast",
      );
      cacheSubscription.close();

      final lastGood =
          await container.read(pingDaoProvider).lastGoodFor("simple");
      expect(lastGood.first.serverId, "fast");
      poolSubscription.close();
    },
  );
}
