import "dart:async";

import "package:connectivity_plus/connectivity_plus.dart";
import "package:dio/dio.dart";
import "package:drift/native.dart";
import "package:flutter_riverpod/flutter_riverpod.dart";
import "package:flutter_test/flutter_test.dart";
import "package:mocktail/mocktail.dart";

import "package:mobile/core/api/dio_client.dart";
import "package:mobile/core/api/endpoints.dart";
import "package:mobile/core/auth/auth_notifier.dart";
import "package:mobile/core/connectivity/connectivity_service.dart";
import "package:mobile/core/db/app_database.dart";
import "package:mobile/core/db/ping_cache_dao.dart";
import "package:mobile/core/ping/libbox_core.dart";
import "package:mobile/core/ping/libbox_ping_service.dart";
import "package:mobile/core/ping/ping_repository.dart";
import "package:mobile/core/ping/socket_ping_service.dart";
import "package:mobile/features/servers/providers.dart";

class MockDioClient extends Mock implements DioClient {}

class MockDio extends Mock implements Dio {}

class MockConnectivity extends Mock implements Connectivity {}

class FakeLibboxClient implements LibboxPingClient {
  FakeLibboxClient(this.calls);

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
    return const LibboxUrltestResult(online: true, rttMs: 30);
  }
}

Map<String, dynamic> _payload({required bool withKey}) {
  return <String, dynamic>{
    "ok": withKey,
    "simple": <Map<String, dynamic>>[
      <String, dynamic>{
        "id": "srv-1",
        "name": "Москва",
        "city": "Москва",
        "cc": "RU",
        "flag": "🇷🇺",
        "proto": "VLESS",
        "tab": "simple",
        "host": "127.0.0.1",
        "port": 443,
        "protocol": "vless",
        "outbound": <String, dynamic>{"type": "vless", "tag": "srv-srv-1"},
      },
    ],
    "whitelist": <Map<String, dynamic>>[],
    "key": withKey
        ? <String, dynamic>{
            "active": true,
            "keyId": "key_1",
            "isTrial": false,
            "remainingDays": 5,
            "expireAt": null,
          }
        : null,
  };
}

void main() {
  late AppDatabase db;
  late PingCacheDao dao;
  late StreamController<List<ConnectivityResult>> changes;
  late MockDio dio;
  late List<String> urltestCalls;
  late PingRepository repository;
  late ProviderContainer container;

  ProviderContainer buildContainer({required bool withKey}) {
    changes = StreamController<List<ConnectivityResult>>.broadcast();
    final connectivity = MockConnectivity();
    when(() => connectivity.onConnectivityChanged).thenAnswer((_) => changes.stream);
    when(() => connectivity.checkConnectivity())
        .thenAnswer((_) async => <ConnectivityResult>[ConnectivityResult.wifi]);
    final service = ConnectivityService.internal(connectivity);

    dio = MockDio();
    final dioClient = MockDioClient();
    when(() => dioClient.dio).thenReturn(dio);
    when(() => dio.get(Endpoints.servers)).thenAnswer(
      (_) async => Response<dynamic>(
        statusCode: withKey ? 200 : 403,
        data: _payload(withKey: withKey),
        requestOptions: RequestOptions(path: Endpoints.servers),
      ),
    );

    urltestCalls = <String>[];
    repository = PingRepository(
      libbox: LibboxPingService(client: FakeLibboxClient(urltestCalls)),
      socket: SocketPingService(),
      cacheWriter: dao,
      cacheLookup: dao,
    );

    return ProviderContainer(
      overrides: [
        appDatabaseProvider.overrideWithValue(db),
        dioClientProvider.overrideWithValue(dioClient),
        connectivityServiceProvider.overrideWithValue(service),
        pingRepositoryProvider.overrideWithValue(repository),
      ],
    );
  }

  setUp(() {
    db = AppDatabase(NativeDatabase.memory());
    dao = PingCacheDao(db);
  });

  tearDown(() {
    container.dispose();
    db.close();
  });

  Future<void> seedState() async {
    await dao.upsert(
      PingCacheEntry(
        serverId: "srv-1",
        tab: "simple",
        rttMs: 12,
        online: true,
        approx: false,
        tsMs: DateTime.now().millisecondsSinceEpoch,
      ),
    );
    await dao.pushLastGood("simple", "srv-1",
        tsMs: DateTime.now().millisecondsSinceEpoch);
    await dao.setSelection("simple", "srv-1");
    await dao.setCurrentTab("simple");
  }

  test(
    "startup check never emits and a real network change clears ping_cache + "
    "last_good while keeping selection and current_tab",
    () async {
      container = buildContainer(withKey: false);
      container.listen(serverPoolProvider, (_, __) {});
      container.read(networkPingInvalidationProvider);
      await seedState();

      // The startup check only updates status; it must not invalidate.
      await Future<void>.delayed(const Duration(milliseconds: 50));
      expect(
        (await dao.lastGoodFor("simple")).isEmpty,
        isFalse,
        reason: "startup emission must not invalidate",
      );

      changes.add(<ConnectivityResult>[ConnectivityResult.mobile]);
      await Future<void>.delayed(const Duration(milliseconds: 700));

      expect((await dao.lastGoodFor("simple")).isEmpty, isTrue);
      final fresh = await dao.fresh(
        "srv-1",
        "simple",
        nowMs: DateTime.now().millisecondsSinceEpoch,
      );
      expect(fresh, isNull);
      expect(await dao.getSelection("simple"), "srv-1");
      expect(await dao.getCurrentTab(), "simple");
    },
  );

  test(
    "a real change re-pings the current tab with the real pipeline",
    () async {
      container = buildContainer(withKey: true);
      container.listen(serverPoolProvider, (_, __) {});
      container.read(networkPingInvalidationProvider);
      await container.read(serverPoolProvider.future);
      await Future<void>.delayed(const Duration(milliseconds: 50));

      changes.add(<ConnectivityResult>[ConnectivityResult.mobile]);
      await Future<void>.delayed(const Duration(milliseconds: 700));

      expect(urltestCalls, isNotEmpty);
      expect(urltestCalls.first, "srv-srv-1");
    },
  );

  test(
    "changes are debounced for 500 ms and identical events are coalesced",
    () async {
      container = buildContainer(withKey: false);
      container.listen(serverPoolProvider, (_, __) {});
      container.read(networkPingInvalidationProvider);
      await seedState();
      await Future<void>.delayed(const Duration(milliseconds: 50));

      changes.add(<ConnectivityResult>[ConnectivityResult.mobile]);
      await Future<void>.delayed(const Duration(milliseconds: 200));
      expect(
        (await dao.lastGoodFor("simple")).isEmpty,
        isFalse,
        reason: "debounce timer must not have fired yet",
      );

      // Duplicate events (wifi -> mobile is the only real change here) must
      // not schedule a second invalidation.
      changes.add(<ConnectivityResult>[ConnectivityResult.mobile]);
      await Future<void>.delayed(const Duration(milliseconds: 600));

      expect((await dao.lastGoodFor("simple")).isEmpty, isTrue);
      expect(await dao.getSelection("simple"), "srv-1");
    },
  );

  test(
    "a none/net transition cancels in-flight work via the generation token",
    () async {
      container = buildContainer(withKey: false);
      container.listen(serverPoolProvider, (_, __) {});
      container.read(networkPingInvalidationProvider);
      await seedState();
      await Future<void>.delayed(const Duration(milliseconds: 50));

      final before = repository.generation;
      changes.add(<ConnectivityResult>[ConnectivityResult.none]);
      await Future<void>.delayed(const Duration(milliseconds: 700));

      expect(repository.generation, greaterThan(before));
      expect((await dao.lastGoodFor("simple")).isEmpty, isTrue);
      expect(await dao.getCurrentTab(), "simple");
    },
  );

  test(
    "wifi -> mobile -> wifi transitions all invalidate without simulation",
    () async {
      container = buildContainer(withKey: false);
      container.listen(serverPoolProvider, (_, __) {});
      container.read(networkPingInvalidationProvider);
      await seedState();
      await Future<void>.delayed(const Duration(milliseconds: 50));
      final generation = repository.generation;

      changes.add(<ConnectivityResult>[ConnectivityResult.mobile]);
      await Future<void>.delayed(const Duration(milliseconds: 600));
      expect(repository.generation, greaterThan(generation));

      await seedState();
      changes.add(<ConnectivityResult>[ConnectivityResult.wifi]);
      await Future<void>.delayed(const Duration(milliseconds: 600));
      expect(repository.generation, greaterThan(generation + 1));
      expect((await dao.lastGoodFor("simple")).isEmpty, isTrue);
    },
  );
}
