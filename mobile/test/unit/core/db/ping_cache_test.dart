import "dart:io";

import "package:drift/native.dart";
import "package:flutter_test/flutter_test.dart";
import "package:mobile/core/db/app_database.dart";
import "package:mobile/core/db/ping_cache_dao.dart";
import "package:mobile/core/ping/libbox_core.dart";
import "package:mobile/core/ping/libbox_ping_service.dart";
import "package:mobile/core/ping/ping_repository.dart";
import "package:mobile/core/ping/socket_ping_service.dart";
import "package:mocktail/mocktail.dart";

class MockLibboxPingClient extends Mock implements LibboxPingClient {}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  registerFallbackValue(const Duration(seconds: 1));

  PingCacheDao openDao() {
    final database = AppDatabase(NativeDatabase.memory());
    addTearDown(database.close);
    return PingCacheDao(database);
  }

  PingCacheEntry sample(String id, String tab, {required int tsMs}) =>
      PingCacheEntry(
        serverId: id,
        tab: tab,
        rttMs: 42,
        online: true,
        approx: false,
        tsMs: tsMs,
      );

  group("Drift ping_cache", () {
    test("write -> fresh read -> TTL -> clear is a single working path",
        () async {
      final dao = openDao();
      await dao.write(sample("s1", "simple", tsMs: 1000));

      expect((await dao.fresh("s1", "simple", nowMs: 1000))?.rttMs, 42);
      // ts >= now - 60000: exactly 60 s old is still fresh.
      expect(await dao.isFresh("s1", "simple", nowMs: 61000), isTrue);
      expect(await dao.fresh("s1", "simple", nowMs: 61001), isNull);

      await dao.clearPingCache();
      expect(await dao.fresh("s1", "simple", nowMs: 1000), isNull);
      expect(await dao.isFresh("s1", "simple", nowMs: 1000), isFalse);
    });

    test("upsert overwrites the same key without creating duplicates",
        () async {
      final dao = openDao();
      await dao.write(sample("s1", "simple", tsMs: 1000));
      await dao.upsert(
        PingCacheEntry(
          serverId: "s1",
          tab: "simple",
          rttMs: 7,
          online: true,
          approx: true,
          tsMs: 2000,
        ),
      );

      final row = await dao.fresh("s1", "simple", nowMs: 2000);
      expect(row?.rttMs, 7);
      expect(row?.approx, isTrue);
      expect(row?.tsMs, 2000);
    });

    test("clearPingCacheAndLastGood keeps selection and current tab",
        () async {
      final dao = openDao();
      await dao.write(sample("s1", "simple", tsMs: 1000));
      await dao.pushLastGood("simple", "s1", tsMs: 1000);
      await dao.setSelection("simple", "s1");
      await dao.setCurrentTab("whitelist");

      await dao.clearPingCacheAndLastGood();

      expect(await dao.fresh("s1", "simple", nowMs: 1000), isNull);
      expect(await dao.lastGoodFor("simple"), isEmpty);
      expect(await dao.getSelection("simple"), "s1");
      expect(await dao.getCurrentTab(), "whitelist");
    });

    test("PingRepository reads and writes through the real DAO", () async {
      final dao = openDao();
      final client = MockLibboxPingClient();
      when(client.init).thenAnswer((_) async {});
      when(() => client.start(any())).thenAnswer((_) async {});
      when(
        () => client.urltest("srv-s1", timeout: any(named: "timeout")),
      ).thenAnswer(
        (_) async => const LibboxUrltestResult(online: true, rttMs: 9),
      );
      final repository = PingRepository(
        libbox: LibboxPingService(client: client, nowMs: () => 1000),
        socket: SocketPingService(
          connector: (
            host,
            port, {
            timeout = const Duration(seconds: 1),
          }) async =>
              throw const SocketException("unused"),
          nowMs: () => 1000,
        ),
        cacheWriter: dao,
        cacheLookup: dao,
        nowMs: () => 1000,
      );
      final target = PingTarget(
        id: "s1",
        host: "127.0.0.1",
        port: "443",
        protocol: "vless",
        outbound: const <String, dynamic>{"type": "vless"},
        tab: "simple",
      );

      final first = await repository.pingServer(target);
      expect(first.online, isTrue);
      expect(first.rttMs, 9);
      expect((await dao.fresh("s1", "simple", nowMs: 1000))?.rttMs, 9);

      // A second ping at the same timestamp reads the fresh cache and does not
      // trigger another urltest.
      final second = await repository.pingServer(target);
      expect(second.rttMs, 9);
      verify(() => client.urltest("srv-s1", timeout: any(named: "timeout")))
          .called(1);
    });
  });

  group("last-good, selection and current tab", () {
    test("pushLastGood dedupes, caps at five and stays per-tab", () async {
      final dao = openDao();
      for (var i = 1; i <= 7; i++) {
        await dao.pushLastGood("simple", "s$i", tsMs: i * 100);
      }
      // Re-pushing an existing id moves it to the front without a duplicate.
      await dao.pushLastGood("simple", "s3", tsMs: 1000);

      final rows = await dao.lastGoodFor("simple");
      expect(rows, hasLength(5));
      expect(
        rows.map((row) => row.serverId).toList(),
        ["s3", "s7", "s6", "s5", "s4"],
      );
      expect(rows.where((row) => row.serverId == "s3"), hasLength(1));

      await dao.pushLastGood("whitelist", "w1", tsMs: 50);
      expect(
        (await dao.lastGoodFor("whitelist")).map((row) => row.serverId),
        ["w1"],
      );
      expect(await dao.lastGoodFor("simple"), hasLength(5));
    });

    test("clearLastGood removes only last-good rows", () async {
      final dao = openDao();
      await dao.write(sample("s1", "simple", tsMs: 1000));
      await dao.pushLastGood("simple", "s1", tsMs: 1000);
      await dao.setSelection("simple", "s1");

      await dao.clearLastGood();

      expect(await dao.lastGoodFor("simple"), isEmpty);
      expect(await dao.fresh("s1", "simple", nowMs: 1000), isNotNull);
      expect(await dao.getSelection("simple"), "s1");
    });

    test("selection persists per tab and survives network change", () async {
      final dao = openDao();
      expect(await dao.getSelection("simple"), isNull);
      await dao.setSelection("simple", "s1");
      await dao.setSelection("whitelist", "w2");
      await dao.setSelection("simple", "s9");

      expect(await dao.getSelection("simple"), "s9");
      expect(await dao.getSelection("whitelist"), "w2");

      await dao.clearPingCacheAndLastGood();

      expect(await dao.getSelection("simple"), "s9");
      expect(await dao.getSelection("whitelist"), "w2");
    });

    test("current tab defaults to simple and is kept on network change",
        () async {
      final dao = openDao();
      expect(await dao.getCurrentTab(), "simple");
      await dao.setCurrentTab("whitelist");
      expect(await dao.getCurrentTab(), "whitelist");

      await dao.clearPingCacheAndLastGood();

      expect(await dao.getCurrentTab(), "whitelist");
    });

    test("server list cache stores metadata JSON per tab for offline use",
        () async {
      final dao = openDao();
      expect(await dao.getServerList("simple"), isNull);
      await dao.cacheServerList("simple", '[{"id":"s1"}]');
      await dao.cacheServerList("whitelist", '[{"id":"w1"}]');
      await dao.cacheServerList("simple", '[{"id":"s9"}]');

      expect(await dao.getServerList("simple"), '[{"id":"s9"}]');
      expect(await dao.getServerList("whitelist"), '[{"id":"w1"}]');
    });
  });
}
