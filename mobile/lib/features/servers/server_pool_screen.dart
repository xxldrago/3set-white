import "dart:async";

import "package:connectivity_plus/connectivity_plus.dart";
import "package:flutter/material.dart";
import "package:flutter_riverpod/flutter_riverpod.dart";
import "package:flutter_riverpod/legacy.dart" show StateProvider;

import "../../app/theme.dart";
import "../../core/connectivity/connectivity_service.dart";
import "../../core/db/app_database.dart";
import "../auth/providers.dart" show currentUserProvider;
import "../auth/widgets/error_toast.dart";
import "../home/providers.dart" show currentTabProvider;
import "providers.dart";
import "server.dart";

import "widgets/auto_select_card.dart";
import "widgets/connect_panel.dart";
import "widgets/main_header.dart";
import "widgets/no_key_banner.dart";
import "widgets/pool_tab_bar.dart";
import "widgets/pool_toolbar.dart";
import "widgets/server_card.dart";

/// Guards the refresh/connect buttons while a probe is in flight.
final poolBusyProvider = StateProvider<bool>((ref) => false);

/// Read-only network chip label from the real `connectivity_plus` stream.
///
/// There is no manual network toggle and no simulated status (D-11/D-19).
final networkLabelProvider = StreamProvider<String>((ref) {
  final service = ref.watch(connectivityServiceProvider);
  return service.connectivityStream.map(_networkLabel);
});

String _networkLabel(List<ConnectivityResult> results) {
  if (results.isEmpty || results.contains(ConnectivityResult.none)) {
    return "Нет сети";
  }
  if (results.contains(ConnectivityResult.wifi)) {
    return "Wi-Fi";
  }
  if (results.contains(ConnectivityResult.mobile)) {
    return "LTE";
  }
  if (results.contains(ConnectivityResult.ethernet)) {
    return "Ethernet";
  }
  return "Онлайн";
}

/// Most recent successful server of each tab, driving the «последний» chip.
final lastGoodProvider = FutureProvider.family<List<LastGoodData>, PoolTab>(
  (ref, tab) async => ref.read(pingDaoProvider).lastGoodFor(tab.wireName),
);

/// Full prototype main screen (D-15/D-17/D-18/D-19/D-20/D-21).
///
/// No bottom `NavigationBar` (the router swap is 19-08), no `load` bar, no
/// simulated ping/connection/IP/traffic and no secrets. The «Подключить»
/// button only selects a server; the VPN core is phase 20.
class ServerPoolScreen extends ConsumerWidget {
  /// Creates the pool screen.
  const ServerPoolScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tab = ref.watch(currentTabProvider);
    final poolsAsync = ref.watch(serverPoolProvider);
    final busy = ref.watch(poolBusyProvider);
    final network = ref.watch(networkLabelProvider).value ?? "Онлайн";
    final lastGood = ref.watch(lastGoodProvider(tab)).value ?? <LastGoodData>[];
    final selectedId = ref.watch(selectionProvider(tab));
    final outcome = ref.watch(connectControllerProvider);
    final pools = poolsAsync.value;
    final hasKey = pools?.hasActiveKey ?? false;
    final best = ref.watch(bestServerProvider(tab));

    ref.listen<ConnectOutcome?>(connectControllerProvider, (previous, next) {
      if (next == null || identical(previous, next)) {
        return;
      }
      _announceOutcome(context, next);
    });

    final effectiveId = outcome?.ok == true ? outcome?.serverId : selectedId;
    final servers = pools?.serversFor(tab) ?? <Server>[];
    Server? selected;
    for (final server in servers) {
      if (server.id == effectiveId) {
        selected = server;
        break;
      }
    }

    final user = ref.watch(currentUserProvider);
    final localPart = user?.email?.split("@").first;
    final greetingName = (localPart == null || localPart.isEmpty)
        ? "друг"
        : localPart[0].toUpperCase() + localPart.substring(1);

    return Scaffold(
      body: SafeArea(
        child: Column(
          children: <Widget>[
            MainHeader(
              keyMeta: pools?.key,
              refreshing: busy,
              onRefresh: () => unawaited(_refresh(context, ref, tab)),
              onShop: () => _shopStub(context),
              onLogic: () => _logicSheet(context),
              onProfile: () => _profileSheet(context),
              greetingName: greetingName,
            ),
            if (pools != null && !hasKey)
              NoKeyBanner(
                message: pools.key == null
                    ? "Нет ключа"
                    : "Ключ неактивен — серверы недоступны",
                actionLabel: "Купить",
                onAction: () => _shopStub(context),
              )
            else if (pools != null &&
                pools.error != null &&
                pools.error != "no_active_key")
              NoKeyBanner(
                message: pools.notice ?? "Нет соединения. Повторите",
                actionLabel: "Повторить",
                onAction: () => ref.invalidate(serverPoolProvider),
                isError: true,
              ),
            PoolTabBar(
              selected: tab,
              onChanged: (next) => unawaited(_switchTab(ref, next)),
            ),
            PoolToolbar(
              tab: tab,
              networkLabel: network,
              refreshing: busy,
              onRefresh: () => unawaited(_refresh(context, ref, tab)),
            ),
            Expanded(
              child: poolsAsync.when(
                data: (data) =>
                    _list(context, ref, tab, data, lastGood, effectiveId, best),
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (_, _) => _retry(context, ref),
              ),
            ),
            ConnectPanel(
              selected: selected,
              sample: selected == null
                  ? null
                  : _sampleFor(ref, tab, selected.id),
              hasKey: hasKey,
              busy: busy,
              outcomeNotice: outcome?.ok == true
                  ? "Сервер выбран · VPN-ядро — фаза 20"
                  : null,
              onConnect: () => unawaited(_connect(context, ref, tab)),
              onBuy: () => _shopStub(context),
            ),
          ],
        ),
      ),
    );
  }

  PingCacheData? _sampleFor(WidgetRef ref, PoolTab tab, String id) {
    final rows = ref.watch(pingCacheProvider(tab)).value ?? <PingCacheData>[];
    for (final row in rows) {
      if (row.serverId == id) {
        return row;
      }
    }
    return null;
  }

  Widget _list(
    BuildContext context,
    WidgetRef ref,
    PoolTab tab,
    ServerPools pools,
    List<LastGoodData> lastGood,
    String? selectedId,
    Server? best,
  ) {
    final servers = pools.hasActiveKey ? pools.serversFor(tab) : <Server>[];
    final rows = ref.watch(pingCacheProvider(tab)).value ?? <PingCacheData>[];
    final byId = <String, PingCacheData>{
      for (final row in rows) row.serverId: row,
    };
    final lastGoodId = lastGood.isEmpty ? null : lastGood.first.serverId;
    final allOffline =
        servers.isNotEmpty &&
        rows.isNotEmpty &&
        rows.where((row) => row.online).isEmpty;

    if (servers.isEmpty || allOffline) {
      return _emptyState(context, ref, tab);
    }

    return ListView(
      padding: const EdgeInsets.symmetric(horizontal: 18),
      children: <Widget>[
        AutoSelectCard(
          best: best,
          sample: best == null ? null : byId[best.id],
          selected: selectedId == null || selectedId == "auto",
          onTap: () => unawaited(_select(ref, tab, "auto")),
        ),
        for (final server in servers)
          ServerCard(
            server: server,
            sample: byId[server.id],
            selected: selectedId == server.id,
            lastGood: lastGoodId == server.id,
            onTap: () => unawaited(_select(ref, tab, server.id)),
          ),
      ],
    );
  }

  Widget _emptyState(BuildContext context, WidgetRef ref, PoolTab tab) {
    final theme = Theme.of(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            Icon(Icons.cloud_off_outlined, size: 48, color: AppTheme.dim),
            const SizedBox(height: 12),
            Text(
              "Нет доступных серверов. Попробуй другой таб",
              textAlign: TextAlign.center,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: AppTheme.muted,
              ),
            ),
            const SizedBox(height: 12),
            OutlinedButton(
              onPressed: () => ref.invalidate(serverPoolProvider),
              child: const Text("Повторить"),
            ),
            TextButton(
              onPressed: () => unawaited(
                _switchTab(
                  ref,
                  tab == PoolTab.simple ? PoolTab.whitelist : PoolTab.simple,
                ),
              ),
              child: const Text("Попробуй другой таб"),
            ),
          ],
        ),
      ),
    );
  }

  Widget _retry(BuildContext context, WidgetRef ref) => Center(
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: <Widget>[
        const Icon(Icons.error_outline, size: 48, color: AppTheme.red),
        const SizedBox(height: 12),
        const Text("Нет соединения. Повторите"),
        const SizedBox(height: 12),
        OutlinedButton(
          onPressed: () => ref.invalidate(serverPoolProvider),
          child: const Text("Повторить"),
        ),
      ],
    ),
  );

  Future<void> _select(WidgetRef ref, PoolTab tab, String id) async {
    await ref.read(selectionProvider(tab).notifier).select(id);
  }

  Future<void> _switchTab(WidgetRef ref, PoolTab tab) async {
    await ref.read(currentTabProvider.notifier).setTab(tab);
  }

  Future<void> _refresh(
    BuildContext context,
    WidgetRef ref,
    PoolTab tab,
  ) async {
    ref.read(poolBusyProvider.notifier).state = true;
    try {
      final result = await ref
          .read(connectControllerProvider.notifier)
          .refresh(tab);
      if (!context.mounted) {
        return;
      }
      if (result.ok) {
        showSuccessToast(context, result.notice ?? "Пинг обновлён");
      } else {
        showErrorToast(context, result.notice ?? "Повторить");
      }
    } finally {
      ref.read(poolBusyProvider.notifier).state = false;
    }
  }

  Future<void> _connect(
    BuildContext context,
    WidgetRef ref,
    PoolTab tab,
  ) async {
    ref.read(poolBusyProvider.notifier).state = true;
    try {
      final savedId = ref.read(selectionProvider(tab));
      final auto = savedId == null || savedId == "auto";
      await ref
          .read(connectControllerProvider.notifier)
          .connect(tab, auto: auto, manualServerId: auto ? null : savedId);
    } finally {
      ref.read(poolBusyProvider.notifier).state = false;
    }
  }

  void _announceOutcome(BuildContext context, ConnectOutcome outcome) {
    if (!context.mounted) {
      return;
    }
    if (outcome.ok) {
      showInfoToast(context, "Сервер выбран · VPN-ядро — фаза 20");
      return;
    }
    showErrorToast(context, outcome.notice ?? "Нет доступных серверов");
  }

  void _shopStub(BuildContext context) {
    showInfoToast(context, "Магазин · Купить — фаза 21");
  }

  void _logicSheet(BuildContext context) {
    showModalBottomSheet<void>(
      context: context,
      builder: (_) => const _LogicSheet(),
    );
  }

  void _profileSheet(BuildContext context) {
    showModalBottomSheet<void>(
      context: context,
      builder: (_) => const _ProfileSheet(),
    );
  }
}

/// «Как это работает» sheet stub using the prototype's six steps.
class _LogicSheet extends StatelessWidget {
  const _LogicSheet();

  static const String _step1 =
      "Два пула серверов — обычные серверы и "
      "VLESS+Reality с SNI разрешённых доменов.";
  static const String _step2 =
      "Автопинг через ядро — не ICMP, а urltest: "
      "HTTP-запрос через каждый outbound.";
  static const String _step3 =
      "Быстрый путь — до 3 успешных серверов, "
      "таймаут 800 мс.";
  static const String _step4 =
      "Полный пинг и ранкинг — параллельная проверка "
      "всех серверов за 2 с, кеш 60 секунд.";
  static const String _step5 =
      "Смена сети — Wi-Fi ↔ LTE инвалидирует кеш "
      "и запускает ре-пинг.";
  static const String _step6 =
      "Ключ = подписка — конфиги приходят только "
      "при активном ключе.";
  static const List<String> _steps = <String>[
    _step1,
    _step2,
    _step3,
    _step4,
    _step5,
    _step6,
  ];

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.all(20),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text("Как это работает", style: theme.textTheme.headlineSmall),
          const SizedBox(height: 16),
          for (var index = 0; index < _steps.length; index++)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Text(
                    "${index + 1}. ",
                    style: theme.textTheme.titleMedium?.copyWith(
                      color: AppTheme.lime,
                    ),
                  ),
                  Expanded(
                    child: Text(
                      _steps[index],
                      style: theme.textTheme.bodyMedium,
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

/// Profile sheet stub; the full profile lands in phase 21.
class _ProfileSheet extends StatelessWidget {
  const _ProfileSheet();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          Text("Профиль", style: theme.textTheme.headlineSmall),
          const SizedBox(height: 12),
          Text(
            "Устройства и подписка — фаза 21",
            style: theme.textTheme.bodyMedium?.copyWith(color: AppTheme.muted),
          ),
        ],
      ),
    );
  }
}
