import "dart:async";

import "package:dio/dio.dart";
import "package:drift/native.dart";
import "package:flutter/material.dart";
import "package:flutter_riverpod/flutter_riverpod.dart";
import "package:flutter_test/flutter_test.dart";

import "package:mobile/app/theme.dart";
import "package:mobile/core/api/dio_client.dart";
import "package:mobile/core/api/endpoints.dart";
import "package:mobile/core/auth/auth_notifier.dart";
import "package:mobile/core/db/app_database.dart";
import "package:mobile/core/db/ping_cache_dao.dart";
import "package:mobile/core/ping/libbox_core.dart";
import "package:mobile/core/ping/libbox_ping_service.dart";
import "package:mobile/core/ping/ping_repository.dart";
import "package:mobile/core/ping/socket_ping_service.dart";
import "package:mobile/core/vpn/connection_notifier.dart";
import "package:mobile/core/vpn/connection_state.dart" as vpn_state;
import "package:mobile/features/auth/providers.dart" show currentUserProvider;
import "package:mobile/features/auth/widgets/error_toast.dart";
import "package:mobile/features/servers/providers.dart";
import "package:mobile/features/servers/server.dart";
import "package:mobile/features/servers/server_pool_screen.dart";
import "package:mobile/features/servers/widgets/server_card.dart";
import "package:mocktail/mocktail.dart";

class MockDioClient extends Mock implements DioClient {}

class MockDio extends Mock implements Dio {}

/// Deterministic libbox stand-in; the production path stays real (D-06).
class FakeLibboxClient implements LibboxPingClient {
  /// Creates a prober with one RTT per outbound id.
  FakeLibboxClient(this.rttById);

  /// Real-shaped RTT samples keyed by server id.
  final Map<String, int> rttById;

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
    return LibboxUrltestResult(online: true, rttMs: rttById[id] ?? 42);
  }
}

/// Failsafe FSM stand-in: records button intents without a real tunnel or BFF.
class FakeConnectionNotifier extends ConnectionNotifier {
  /// Intents invoked by the panel.
  final List<String> calls = <String>[];

  @override
  vpn_state.ConnectionState build() => const vpn_state.ConnectionState();

  @override
  Future<void> connect(
    PoolTab tab, {
    required bool auto,
    String? manualServerId,
  }) async {
    calls.add("connect");
  }

  @override
  Future<void> cancel() async {
    calls.add("cancel");
  }

  @override
  Future<void> disconnect() async {
    calls.add("disconnect");
  }
}

Map<String, dynamic> _server(
  String id, {
  PoolTab tab = PoolTab.simple,
  String? sni,
}) => <String, dynamic>{
  "id": id,
  "name": id,
  "city": id == "fast"
      ? "Москва"
      : id == "slow"
      ? "Казань"
      : "Санкт-Петербург",
  "cc": "RU",
  "flag": "🇷🇺",
  "proto": "VLESS",
  "tab": tab.wireName,
  "host": "127.0.0.1",
  "port": 443,
  "protocol": "vless",
  "sni": sni,
  "outbound": <String, dynamic>{"type": "vless", "tag": "srv-$id"},
};

Map<String, dynamic> _payload({bool withKey = true}) => <String, dynamic>{
  "ok": true,
  "simple": <Map<String, dynamic>>[_server("fast"), _server("slow")],
  "whitelist": <Map<String, dynamic>>[
    _server("wl", tab: PoolTab.whitelist, sni: "wl.example.com"),
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

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late AppDatabase db;
  late PingCacheDao dao;
  late MockDio dio;
  late MockDioClient client;
  late PingRepository repository;
  final containers = <ProviderContainer>[];

  setUp(() {
    db = AppDatabase(NativeDatabase.memory());
    dao = PingCacheDao(db);
    dio = MockDio();
    client = MockDioClient();
    when(() => client.dio).thenReturn(dio);
    repository = PingRepository(
      libbox: LibboxPingService(
        client: FakeLibboxClient(<String, int>{
          "fast": 12,
          "slow": 90,
          "wl": 144,
        }),
      ),
      socket: SocketPingService(),
      cacheWriter: dao,
      cacheLookup: dao,
    );
  });

  tearDown(() {
    for (final container in containers) {
      container.dispose();
    }
    containers.clear();
    db.close();
  });

  ProviderContainer makeContainer({
    Map<String, dynamic>? payload,
    int status = 200,
    bool fail = false,
  }) {
    if (fail) {
      when(() => dio.get(Endpoints.servers)).thenThrow(
        DioException(
          requestOptions: RequestOptions(path: Endpoints.servers),
          error: "offline",
        ),
      );
    } else {
      when(() => dio.get(Endpoints.servers)).thenAnswer(
        (_) async => Response<dynamic>(
          statusCode: status,
          data: payload ?? _payload(),
          requestOptions: RequestOptions(path: Endpoints.servers),
        ),
      );
    }
    final container = ProviderContainer(
      overrides: [
        appDatabaseProvider.overrideWithValue(db),
        dioClientProvider.overrideWithValue(client),
        pingRepositoryProvider.overrideWithValue(repository),
        connectionNotifierProvider.overrideWith(FakeConnectionNotifier.new),
        networkLabelProvider.overrideWith((_) => Stream<String>.value("Wi-Fi")),
        currentUserProvider.overrideWith((_) => null),
      ],
    );
    containers.add(container);
    return container;
  }

  Widget buildScreen(ProviderContainer container) => UncontrolledProviderScope(
    container: container,
    child: MaterialApp(
      theme: AppTheme.dark,
      darkTheme: AppTheme.dark,
      themeMode: ThemeMode.dark,
      scaffoldMessengerKey: ErrorToastService.scaffoldMessengerKey,
      home: const ServerPoolScreen(),
    ),
  );

  Future<void> seedPing(
    String id, {
    required int rtt,
    bool online = true,
    PoolTab tab = PoolTab.simple,
  }) => dao.upsert(
    PingCacheEntry(
      serverId: id,
      tab: tab.wireName,
      rttMs: rtt,
      online: online,
      approx: false,
      tsMs: DateTime.now().millisecondsSinceEpoch,
    ),
  );

  Finder selectedTab(String label, bool selected) => find.byWidgetPredicate(
    (widget) =>
        widget is Semantics &&
        widget.properties.label == label &&
        widget.properties.selected == selected,
  );

  testWidgets("renders the full prototype main screen", (tester) async {
    await tester.pumpWidget(buildScreen(makeContainer()));
    await tester.pumpAndSettle();

    expect(find.byType(ServerPoolScreen), findsOneWidget);
    expect(find.text("3set"), findsNothing);
    expect(find.text("Простой VPN"), findsOneWidget);
    expect(find.text("Обход белых списков"), findsOneWidget);
    expect(find.text("Автовыбор"), findsNWidgets(2));
    expect(find.text("Выберу самый быстрый сервер"), findsOneWidget);
    expect(find.text("Подключить"), findsOneWidget);
    expect(find.text("VPN выключен"), findsOneWidget);
    expect(find.text("ключ · 30 дн."), findsOneWidget);
  });

  testWidgets("both tabs expose aria-selected and switch without teardown", (
    tester,
  ) async {
    await tester.pumpWidget(buildScreen(makeContainer()));
    await tester.pumpAndSettle();

    expect(selectedTab("Простой VPN", true), findsOneWidget);
    expect(selectedTab("Обход белых списков", false), findsOneWidget);
    expect(
      find.text(
        "Полный туннель · весь трафик через сервер · "
        "WireGuard / Hysteria2 / SS",
      ),
      findsOneWidget,
    );

    await tester.tap(find.text("Обход белых списков"));
    await tester.pumpAndSettle();

    expect(selectedTab("Простой VPN", false), findsOneWidget);
    expect(selectedTab("Обход белых списков", true), findsOneWidget);
    expect(
      find.text(
        "Reality с SNI разрешённых доменов · "
        "работает при белых списках оператора",
      ),
      findsOneWidget,
    );
    expect(find.text("Санкт-Петербург"), findsOneWidget);
  });

  testWidgets("shows proto, whitelist-only SNI and the last-good chip", (
    tester,
  ) async {
    await dao.pushLastGood(
      "simple",
      "fast",
      tsMs: DateTime.now().millisecondsSinceEpoch,
    );
    await tester.pumpWidget(buildScreen(makeContainer()));
    await tester.pumpAndSettle();

    expect(find.text("VLESS"), findsNWidgets(2));
    expect(find.text("последний"), findsOneWidget);
    expect(find.textContaining("SNI:"), findsNothing);

    await tester.tap(find.text("Обход белых списков"));
    await tester.pumpAndSettle();

    expect(find.text("SNI: wl.example.com"), findsOneWidget);
    expect(find.text("последний"), findsNothing);
  });

  testWidgets("pingClass maps real RTTs to the prototype palette", (
    tester,
  ) async {
    Future<Color> pingColor(int? rtt, {bool online = true}) async {
      final sample = PingCacheData(
        serverId: "fast",
        tab: "simple",
        rtt: rtt,
        online: online,
        ts: DateTime.now().millisecondsSinceEpoch,
        approx: false,
      );
      await tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.dark,
          home: Scaffold(
            body: ServerCard(
              server: Server.fromJson(_server("fast")),
              sample: sample,
              selected: false,
              lastGood: false,
              onTap: () {},
            ),
          ),
        ),
      );
      final label = rtt == null ? AppTheme.offlineLabel : "$rtt";
      return tester.widget<Text>(find.text(label)).style!.color!;
    }

    expect(await pingColor(12), AppTheme.pingGood);
    expect(await pingColor(77), AppTheme.pingMid);
    expect(await pingColor(144), AppTheme.pingWarn);
    expect(await pingColor(201), AppTheme.pingBad);
    expect(await pingColor(null, online: false), AppTheme.pingOffline);
    expect(find.text(AppTheme.noResponseLabel), findsOneWidget);
  });

  testWidgets("has no bottom navigation and no load bar", (tester) async {
    await tester.pumpWidget(buildScreen(makeContainer()));
    await tester.pumpAndSettle();

    expect(find.byType(NavigationBar), findsNothing);
    expect(find.byType(LinearProgressIndicator), findsNothing);
    expect(find.textContaining("Загрузка"), findsNothing);
  });

  Future<void> settleAsync(WidgetTester tester) async {
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 200)),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 1));
  }

  testWidgets("inactive key shows the gate banner and blocks selection", (
    tester,
  ) async {
    final payload = _payload();
    payload["key"] = <String, dynamic>{
      "active": false,
      "keyId": "key_1",
      "isTrial": false,
    };
    await tester.pumpWidget(buildScreen(makeContainer(payload: payload)));
    await tester.pumpAndSettle();

    expect(find.text("Ключ неактивен — серверы недоступны"), findsOneWidget);
    expect(find.text("Нет активного ключа"), findsOneWidget);
    expect(find.text("Ключ истёк"), findsOneWidget);
    expect(find.text("Купить"), findsNWidgets(2));
    expect(find.text("Подключить"), findsNothing);
  });

  testWidgets("missing key shows Нет ключа and the shop stub action", (
    tester,
  ) async {
    await tester.pumpWidget(
      buildScreen(makeContainer(payload: _payload(withKey: false))),
    );
    await tester.pumpAndSettle();

    expect(find.text("Нет ключа"), findsNWidgets(2));
    expect(find.text("Купить"), findsNWidgets(2));
    expect(find.text("Подключить"), findsNothing);
  });

  testWidgets("manual refresh reports Пинг обновлён", (tester) async {
    final c = makeContainer();
    await tester.pumpWidget(buildScreen(c));
    await tester.pumpAndSettle();

    await tester.tap(find.byIcon(Icons.refresh).first);
    await settleAsync(tester);

    expect(find.text("Пинг обновлён"), findsOneWidget);
  });

  testWidgets("connect button drives the FSM with no phase-20 stub copy", (
    tester,
  ) async {
    final container = makeContainer();
    await tester.pumpWidget(buildScreen(container));
    await tester.pumpAndSettle();

    await tester.tap(find.text("Казань"));
    await settleAsync(tester);
    await tester.tap(find.text("Подключить"));
    await settleAsync(tester);

    final fsm = container.read(connectionNotifierProvider.notifier)
        as FakeConnectionNotifier;
    expect(fsm.calls, <String>["connect"]);
    expect(find.textContaining("VPN-ядро — фаза 20"), findsNothing);
    expect(find.textContaining("Туннель, IP и трафик — фаза 20"), findsNothing);
    expect(find.text("Подключение отменено"), findsNothing);
    expect(find.text("Отключить"), findsNothing);
  });

  testWidgets("all offline suggests another tab and retry", (tester) async {
    await seedPing("fast", rtt: 0, online: false);
    await seedPing("slow", rtt: 0, online: false);
    await tester.pumpWidget(buildScreen(makeContainer()));
    await tester.pumpAndSettle();

    expect(
      find.text("Нет доступных серверов. Попробуй другой таб"),
      findsOneWidget,
    );
    expect(find.text("Повторить"), findsOneWidget);
    expect(find.text("Попробуй другой таб"), findsOneWidget);
  });

  testWidgets("provider failure degrades to a retryable offline banner", (
    tester,
  ) async {
    await tester.pumpWidget(buildScreen(makeContainer(fail: true)));
    await tester.pumpAndSettle();

    expect(find.text("Нет соединения. Повторите"), findsOneWidget);
    expect(find.text("Повторить"), findsNWidgets(2));
  });
}
