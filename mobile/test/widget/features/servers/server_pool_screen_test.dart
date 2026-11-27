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
import "package:mobile/features/auth/widgets/error_toast.dart";
import "package:mobile/features/servers/server.dart";
import "package:mobile/features/servers/server_pool_screen.dart";
import "package:mocktail/mocktail.dart";

class MockDioClient extends Mock implements DioClient {}

class MockDio extends Mock implements Dio {}

Map<String, dynamic> _server(String id, {PoolTab tab = PoolTab.simple}) =>
    <String, dynamic>{
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

Map<String, dynamic> _payload({bool withKey = true}) => <String, dynamic>{
  "ok": true,
  "simple": <Map<String, dynamic>>[_server("fast"), _server("slow")],
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

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late AppDatabase db;
  late MockDio dio;
  late ProviderContainer container;

  setUp(() {
    db = AppDatabase(NativeDatabase.memory());
    dio = MockDio();
    final client = MockDioClient();
    when(() => client.dio).thenReturn(dio);
    when(() => dio.get(Endpoints.servers)).thenAnswer(
      (_) async => Response<dynamic>(
        statusCode: 200,
        data: _payload(),
        requestOptions: RequestOptions(path: Endpoints.servers),
      ),
    );
    container = ProviderContainer(
      overrides: [
        appDatabaseProvider.overrideWithValue(db),
        dioClientProvider.overrideWithValue(client),
        networkLabelProvider.overrideWith((_) => Stream<String>.value("Wi-Fi")),
      ],
    );
  });

  tearDown(() {
    container.dispose();
    db.close();
  });

  Widget buildScreen() => UncontrolledProviderScope(
    container: container,
    child: MaterialApp(
      theme: AppTheme.dark,
      darkTheme: AppTheme.dark,
      themeMode: ThemeMode.dark,
      scaffoldMessengerKey: ErrorToastService.scaffoldMessengerKey,
      home: const ServerPoolScreen(),
    ),
  );

  testWidgets("renders the full prototype main screen", (tester) async {
    await tester.pumpWidget(buildScreen());
    await tester.pumpAndSettle();

    expect(find.byType(ServerPoolScreen), findsOneWidget);
    expect(find.byType(NavigationBar), findsNothing);
    expect(find.text("Простой VPN"), findsOneWidget);
    expect(find.text("Обход белых списков"), findsOneWidget);
    expect(find.text("Автовыбор"), findsNWidgets(2));
    expect(find.text("Подключить"), findsOneWidget);
    expect(find.text("VPN выключен"), findsOneWidget);
    expect(find.text("ключ · 30 дн."), findsOneWidget);
  });
}
