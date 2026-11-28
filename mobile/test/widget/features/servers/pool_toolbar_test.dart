// Wave 0 read-only network chip contract (22-03, D-07 / T-22-18).
// The label comes from a real injected `connectivity_plus` stream; the chip is
// never interactive, never fakes a WiFi/LTE switch and never clears the ping
// cache on tap. Real-change invalidation stays with the existing listener.
import "dart:async";

import "package:connectivity_plus/connectivity_plus.dart";
import "package:dio/dio.dart";
import "package:drift/native.dart";
import "package:flutter/material.dart";
import "package:flutter_riverpod/flutter_riverpod.dart";
import "package:flutter_test/flutter_test.dart";
import "package:mobile/app/theme.dart";
import "package:mobile/core/api/dio_client.dart";
import "package:mobile/core/api/endpoints.dart";
import "package:mobile/core/auth/auth_notifier.dart" show dioClientProvider;
import "package:mobile/core/connectivity/connectivity_service.dart";
import "package:mobile/core/db/app_database.dart";
import "package:mobile/core/db/ping_cache_dao.dart";
import "package:mobile/core/ping/ping_repository.dart" show PingCacheEntry;
import "package:mobile/features/profile/profile_sheet.dart" show NetworkStatusRow;
import "package:mobile/features/servers/providers.dart"
    show networkPingInvalidationProvider;
import "package:mobile/features/servers/server.dart" show PoolTab;
import "package:mobile/features/servers/server_pool_screen.dart"
    show networkLabelProvider;
import "package:mobile/features/servers/widgets/pool_toolbar.dart";
import "package:mocktail/mocktail.dart";

class MockConnectivity extends Mock implements Connectivity {}

class MockDioClient extends Mock implements DioClient {}

class MockDio extends Mock implements Dio {}

void main() {
  late StreamController<List<ConnectivityResult>> changes;
  late ConnectivityService service;

  setUp(() {
    changes = StreamController<List<ConnectivityResult>>.broadcast();
    final connectivity = MockConnectivity();
    when(() => connectivity.onConnectivityChanged).thenAnswer((_) => changes.stream);
    when(() => connectivity.checkConnectivity())
        .thenAnswer((_) async => <ConnectivityResult>[ConnectivityResult.wifi]);
    service = ConnectivityService.internal(connectivity);
  });

  tearDown(() {
    service.dispose();
    changes.close();
  });

  Widget chipApp(Stream<String> labels) => ProviderScope(
        overrides: [
          networkLabelProvider.overrideWith((ref) => labels),
        ],
        child: MaterialApp(
          theme: AppTheme.dark,
          home: const Scaffold(body: NetworkStatusRow()),
        ),
      );

  testWidgets("the chip renders real labels including the no-connection case", (
    tester,
  ) async {
    final labels = StreamController<String>.broadcast();
    addTearDown(labels.close);
    await tester.pumpWidget(chipApp(labels.stream));
    await tester.pumpAndSettle();

    labels.add("Wi-Fi");
    await tester.pumpAndSettle();
    expect(find.text("Wi-Fi"), findsOneWidget);

    labels.add("LTE");
    await tester.pumpAndSettle();
    expect(find.text("LTE"), findsOneWidget);
    expect(find.text("Wi-Fi"), findsNothing);

    labels.add("Нет сети");
    await tester.pumpAndSettle();
    expect(find.text("Нет сети"), findsOneWidget);
    expect(find.byIcon(Icons.wifi_off), findsOneWidget);
  });

  testWidgets("the chip icon matches the real connection type", (tester) async {
    final labels = StreamController<String>.broadcast();
    addTearDown(labels.close);
    await tester.pumpWidget(chipApp(labels.stream));
    await tester.pumpAndSettle();

    labels.add("LTE");
    await tester.pumpAndSettle();
    expect(find.byIcon(Icons.signal_cellular_alt), findsOneWidget);
    expect(find.byIcon(Icons.wifi), findsNothing);

    labels.add("Ethernet");
    await tester.pumpAndSettle();
    expect(find.byIcon(Icons.settings_ethernet), findsOneWidget);
    expect(find.byIcon(Icons.signal_cellular_alt), findsNothing);

    labels.add("Wi-Fi");
    await tester.pumpAndSettle();
    expect(find.byIcon(Icons.wifi), findsOneWidget);
    expect(find.byIcon(Icons.settings_ethernet), findsNothing);
  });

  testWidgets("the chip has no interactive control and a tap changes nothing", (
    tester,
  ) async {
    await tester.pumpWidget(chipApp(Stream<String>.value("Wi-Fi")));
    await tester.pumpAndSettle();

    final chip = find.text("Wi-Fi");
    expect(
      find.ancestor(of: chip, matching: find.byType(GestureDetector)),
      findsNothing,
    );
    expect(find.byType(Switch), findsNothing);
    expect(find.byType(SwitchListTile), findsNothing);
    expect(find.text("Сеть изменена"), findsNothing);

    await tester.tap(chip);
    await tester.pumpAndSettle();
    expect(find.text("Wi-Fi"), findsOneWidget);
    expect(find.text("Сеть изменена"), findsNothing);
  });

  testWidgets("the existing PoolToolbar chip stays read-only too", (
    tester,
  ) async {
    await tester.pumpWidget(
      ProviderScope(
        child: MaterialApp(
          theme: AppTheme.dark,
          home: Scaffold(
            body: PoolToolbar(
              tab: PoolTab.simple,
              networkLabel: "LTE",
              refreshing: false,
              onRefresh: () {},
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    final chip = find.text("LTE");
    expect(
      find.ancestor(of: chip, matching: find.byType(GestureDetector)),
      findsNothing,
    );
    await tester.tap(chip);
    await tester.pumpAndSettle();
    expect(find.text("LTE"), findsOneWidget);
  });

  test(
    "a real stream change still clears the Drift ping cache through the "
    "existing networkPingInvalidationProvider listener",
    () async {
      final db = AppDatabase(NativeDatabase.memory());
      final dao = PingCacheDao(db);
      final dio = MockDio();
      final dioClient = MockDioClient();
      when(() => dioClient.dio).thenReturn(dio);
      when(() => dio.get(Endpoints.servers)).thenThrow(
        DioException(
          requestOptions: RequestOptions(path: Endpoints.servers),
        ),
      );
      final container = ProviderContainer(
        overrides: [
          appDatabaseProvider.overrideWithValue(db),
          connectivityServiceProvider.overrideWithValue(service),
          dioClientProvider.overrideWithValue(dioClient),
        ],
      );
      addTearDown(() {
        container.dispose();
        db.close();
      });

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
      container.read(networkPingInvalidationProvider);
      await Future<void>.delayed(const Duration(milliseconds: 50));

      changes.add(<ConnectivityResult>[ConnectivityResult.mobile]);
      await Future<void>.delayed(const Duration(milliseconds: 700));

      expect(
        await dao.fresh(
          "srv-1",
          "simple",
          nowMs: DateTime.now().millisecondsSinceEpoch,
        ),
        isNull,
      );
    },
  );
}
