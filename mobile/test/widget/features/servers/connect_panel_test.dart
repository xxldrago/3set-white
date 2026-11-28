import "package:flutter/material.dart";
import "package:flutter_test/flutter_test.dart";

import "package:mobile/app/theme.dart";
import "package:mobile/core/db/app_database.dart";
import "package:mobile/core/vpn/connected_stats.dart";
import "package:mobile/core/vpn/connection_state.dart";
import "package:mobile/features/servers/server.dart";
import "package:mobile/features/servers/widgets/connect_panel.dart";

Server _server() => Server.fromJson(<String, dynamic>{
      "id": "srv-1",
      "name": "Москва-1",
      "city": "Москва",
      "cc": "RU",
      "flag": "🇷🇺",
      "proto": "VLESS",
      "tab": "simple",
      "host": "127.0.0.1",
      "port": 443,
      "protocol": "vless",
      "outbound": <String, dynamic>{"type": "vless", "tag": "srv-srv-1"},
    });

PingCacheData _sample() => PingCacheData(
      serverId: "srv-1",
      tab: "simple",
      rtt: 42,
      online: true,
      ts: DateTime.now().millisecondsSinceEpoch,
      approx: false,
    );

Widget _panel({
  required ConnPhase phase,
  required ConnectedStats stats,
  required VoidCallback onConnect,
  VoidCallback? onBuy,
  String? notice,
  Server? selected,
  PingCacheData? sample,
  bool hasKey = true,
}) =>
    MaterialApp(
      theme: AppTheme.dark,
      home: Scaffold(
        body: ConnectPanel(
          selected: selected,
          sample: sample,
          hasKey: hasKey,
          phase: phase,
          stats: stats,
          outcomeNotice: notice,
          onConnect: onConnect,
          onBuy: onBuy ?? () {},
        ),
      ),
    );

void main() {
  testWidgets("idle panel shows honest dashes and «Подключить»", (
    tester,
  ) async {
    await tester.pumpWidget(
      _panel(
        phase: ConnPhase.idle,
        stats: ConnectedStats.empty,
        onConnect: () {},
        selected: _server(),
        sample: _sample(),
      ),
    );

    expect(find.text("Подключить"), findsOneWidget);
    // A single «—»: the IP cell. Protocol/ping carry real injected values.
    expect(find.text("—"), findsOneWidget);
    expect(find.text("—:—:—"), findsOneWidget);
    expect(find.text("↓ 0.00   ↑ 0.00"), findsOneWidget);
    expect(find.text("VLESS"), findsOneWidget);
    expect(find.text("42 мс"), findsOneWidget);
    expect(find.text("🇷🇺"), findsOneWidget);
    expect(find.text("Москва"), findsOneWidget);
  });

  testWidgets("connecting button reads «Подключение…» and tap cancels once", (
    tester,
  ) async {
    var cancels = 0;
    await tester.pumpWidget(
      _panel(
        phase: ConnPhase.connecting,
        stats: ConnectedStats.empty,
        onConnect: () => cancels++,
      ),
    );

    expect(find.text("Подключение…"), findsOneWidget);
    expect(find.text("Подключить"), findsNothing);
    await tester.tap(find.text("Подключение…"));
    await tester.pump();
    expect(cancels, 1);
  });

  testWidgets("connected panel renders live IP, timer and traffic cells", (
    tester,
  ) async {
    final stats = ConnectedStats(
      ip: "203.0.113.7",
      down: 1572864, // 1.50 MB
      up: 262144, // 0.25 MB
      available: true,
      elapsedSeconds: 65, // 00:01:05
    );
    await tester.pumpWidget(
      _panel(
        phase: ConnPhase.connected,
        stats: stats,
        onConnect: () {},
        selected: _server(),
        sample: _sample(),
      ),
    );

    expect(find.text("Отключить"), findsOneWidget);
    expect(find.text("203.0.113.7"), findsOneWidget);
    expect(find.text("—"), findsNothing);
    expect(find.text("00:01:05"), findsOneWidget);
    expect(find.text("↓ 1.50   ↑ 0.25"), findsOneWidget);
  });

  testWidgets("unavailable traffic renders honest zeros, not dashes", (
    tester,
  ) async {
    await tester.pumpWidget(
      _panel(
        phase: ConnPhase.connected,
        stats: const ConnectedStats(elapsedSeconds: 0),
        onConnect: () {},
      ),
    );

    expect(find.text("↓ 0.00   ↑ 0.00"), findsOneWidget);
    expect(find.text("00:00:00"), findsOneWidget);
  });

  testWidgets("error phase shows the stable RU notice and «Повторить»", (
    tester,
  ) async {
    await tester.pumpWidget(
      _panel(
        phase: ConnPhase.error,
        stats: ConnectedStats.empty,
        notice: "Сервер недоступен",
        onConnect: () {},
      ),
    );

    expect(find.text("Повторить"), findsOneWidget);
    expect(find.text("Сервер недоступен"), findsOneWidget);
    expect(find.text("—:—:—"), findsOneWidget);
  });

  testWidgets("no phase-20 stub, bottom nav, load bar or shop purchase", (
    tester,
  ) async {
    await tester.pumpWidget(
      _panel(
        phase: ConnPhase.idle,
        stats: ConnectedStats.empty,
        onConnect: () {},
      ),
    );

    expect(find.textContaining("фаза 20"), findsNothing);
    expect(find.textContaining("VPN-ядро"), findsNothing);
    expect(find.byType(NavigationBar), findsNothing);
    expect(find.byType(LinearProgressIndicator), findsNothing);
  });

  testWidgets("no-key connection is blocked with the exact toast and shop route", (
    tester,
  ) async {
    var connects = 0;
    var shops = 0;
    await tester.pumpWidget(
      _panel(
        phase: ConnPhase.idle,
        stats: ConnectedStats.empty,
        hasKey: false,
        onConnect: () => connects++,
        onBuy: () => shops++,
      ),
    );

    // hasKey is server-derived (grace included): this is the no-key/no-grace
    // state. There is no connect affordance and the buy action is the gate.
    expect(find.text("Нет активного ключа"), findsOneWidget);
    expect(find.text("Подключить"), findsNothing);
    await tester.tap(find.text("Купить"));
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.text("Нужен активный ключ"), findsOneWidget);
    expect(shops, 1);
    expect(connects, 0);
    expect(find.textContaining("фаза 21"), findsNothing);
  });

  testWidgets("a connectable key still drives the FSM, not the shop gate", (
    tester,
  ) async {
    var connects = 0;
    var shops = 0;
    await tester.pumpWidget(
      _panel(
        phase: ConnPhase.idle,
        stats: ConnectedStats.empty,
        hasKey: true,
        onConnect: () => connects++,
        onBuy: () => shops++,
      ),
    );

    await tester.tap(find.text("Подключить"));
    await tester.pump();

    expect(connects, 1);
    expect(shops, 0);
    expect(find.text("Нужен активный ключ"), findsNothing);
  });
}
