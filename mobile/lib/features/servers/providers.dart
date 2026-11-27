import "dart:async";
import "dart:convert";

import "package:dio/dio.dart";
import "package:flutter_riverpod/flutter_riverpod.dart";

import "package:mobile/app/constants.dart" show ConnectivityConfig;
import "package:mobile/core/api/endpoints.dart";
import "package:mobile/core/auth/auth_notifier.dart";
import "package:mobile/core/connectivity/connectivity_service.dart";
import "package:mobile/core/db/app_database.dart";
import "package:mobile/core/db/ping_cache_dao.dart";
import "package:mobile/core/ping/libbox_ping_service.dart";
import "package:mobile/core/ping/ping_repository.dart";
import "package:mobile/core/ping/ping_result.dart";
import "package:mobile/core/ping/socket_ping_service.dart";
import "package:mobile/features/home/providers.dart";

import "server.dart";

/// DAO over the shared Drift database; injectable via `appDatabaseProvider`.
final pingDaoProvider = Provider<PingCacheDao>((ref) {
  return PingCacheDao(ref.read(appDatabaseProvider));
});

/// Real ping pipeline: libbox urltest with a silent TCP fallback, backed by
/// the Drift TTL cache. No simulated samples and no secret logging.
final pingRepositoryProvider = Provider<PingRepository>((ref) {
  final dao = ref.read(pingDaoProvider);
  return PingRepository(
    libbox: LibboxPingService(),
    socket: SocketPingService(),
    cacheWriter: dao,
    cacheLookup: dao,
  );
});

/// Cached cards are metadata-only: outbound maps carry protocol secrets and
/// raw share links must never reach local SQLite (D-05, D-10). Offline cards
/// are display-only and are never pinged with these credentials.
List<Map<String, dynamic>> _metadataOnly(List<Server> servers) => servers
    .map(
      (server) => Map<String, dynamic>.from(server.toJson())
        ..remove("outbound"),
    )
    .toList(growable: false);

Future<void> _cachePools(PingCacheDao dao, ServerPools pools) async {
  try {
    await dao.cacheServerList("simple", jsonEncode(_metadataOnly(pools.simple)));
    await dao.cacheServerList(
      "whitelist",
      jsonEncode(_metadataOnly(pools.whitelist)),
    );
  } on Object catch (_) {
    return;
  }
}

Future<ServerPools> _offlinePools(PingCacheDao dao) async {
  try {
    final simpleRaw = await dao.getServerList("simple");
    final whitelistRaw = await dao.getServerList("whitelist");
    if (simpleRaw == null && whitelistRaw == null) {
      return const ServerPools(
        error: "network",
        notice: "Нет соединения. Повторите",
      );
    }
    List<Server> decode(String? raw) {
      if (raw == null) {
        return <Server>[];
      }
      final decoded = jsonDecode(raw) as List<dynamic>;
      return decoded
          .map(
            (item) => Server.fromJson(
              Map<String, dynamic>.from(item as Map)
                ..putIfAbsent("outbound", () => <String, dynamic>{}),
            ),
          )
          .toList(growable: false);
    }

    return ServerPools(
      simple: decode(simpleRaw),
      whitelist: decode(whitelistRaw),
      stale: true,
      notice: "Офлайн: показан кеш серверов",
    );
  } on Object catch (_) {
    return const ServerPools(
      error: "network",
      notice: "Нет соединения. Повторите",
    );
  }
}

/// Server pools from our BFF only (`dio.get(Endpoints.servers)`).
///
/// The backend owns the ARTEMIDA call; the client never talks to ARTEMIDA.
/// Provider errors degrade to the metadata-only Drift cache plus an offline
/// notice instead of throwing. `no_active_key` is machine-readable and blocks
/// ping/selection (D-21).
final serverPoolProvider = FutureProvider.autoDispose<ServerPools>((ref) async {
  final dio = ref.read(dioClientProvider).dio;
  final dao = ref.read(pingDaoProvider);
  try {
    final response = await dio.get<dynamic>(Endpoints.servers);
    final raw = response.data;
    if (raw is! Map) {
      return const ServerPools(
        error: "invalid_response",
        notice: "Нет активного ключа",
      );
    }
    final pools = ServerPools.fromJson(Map<String, dynamic>.from(raw));
    if ((response.statusCode == 403 || response.statusCode == 402) &&
        pools.error == null) {
      return const ServerPools(error: "no_active_key", notice: "Нет ключа");
    }
    if (pools.hasActiveKey) {
      await _cachePools(dao, pools);
    }
    return pools;
  } on DioException catch (error) {
    final status = error.response?.statusCode;
    if (status == 403 || status == 402) {
      return const ServerPools(error: "no_active_key", notice: "Нет ключа");
    }
    return _offlinePools(dao);
  } on Object catch (_) {
    return _offlinePools(dao);
  }
});

/// Fresh ping rows for one tab from Drift `watchFresh` (TTL 60 s, D-10).
final pingCacheProvider =
    StreamProvider.family<List<PingCacheData>, PoolTab>((ref, tab) {
  return ref.read(pingDaoProvider).watchFresh(tab.wireName);
});

/// Filters rows by the 60 s TTL again at read time (D-10).
///
/// `watchFresh` only filters when Drift re-emits after a write; without a
/// re-check an unchanged stream could present an expired sample as fresh
/// indefinitely. Every consumer (best-server, card sample, list) uses this.
List<PingCacheData> freshPingRows(
  List<PingCacheData> rows, {
  PingClock? clock,
}) {
  final cutoff = (clock ?? defaultPingClock)() - pingCacheTtl.inMilliseconds;
  return rows.where((row) => row.ts >= cutoff).toList(growable: false);
}

/// Best online server for a tab: online-first, RTT ascending, stable on ties.
///
/// `load` is deliberately absent (D-04/REQ-POOL-04 deferred). A missing key or
/// a blocked pool yields `null`, so callers cannot select a server.
final bestServerProvider = Provider.family<Server?, PoolTab>((ref, tab) {
  final pools = ref.watch(serverPoolProvider).value;
  if (pools == null || !pools.hasActiveKey) {
    return null;
  }
  final byId = <String, Server>{
    for (final server in pools.serversFor(tab)) server.id: server,
  };
  final rows = freshPingRows(
    ref.watch(pingCacheProvider(tab)).value ?? <PingCacheData>[],
  );
  final order = <String, int>{
    for (var index = 0; index < rows.length; index++) rows[index].serverId: index,
  };
  final online = rows.where((row) => row.online && row.rtt != null).toList()
    ..sort((left, right) {
      final byRtt = left.rtt!.compareTo(right.rtt!);
      return byRtt != 0
          ? byRtt
          : order[left.serverId]!.compareTo(order[right.serverId]!);
    });
  for (final row in online) {
    final server = byId[row.serverId];
    if (server != null) {
      return server;
    }
  }
  return null;
});

/// Manual/automatic selection, persisted per tab (D-13/D-14).
final selectionProvider =
    NotifierProvider.family<SelectionNotifier, String?, PoolTab>(
  (tab) => SelectionNotifier(tab),
);

/// Stores one selected server id per pool tab in Drift.
class SelectionNotifier extends Notifier<String?> {
  /// Creates the notifier for one pool tab.
  SelectionNotifier(this.tab);

  /// The pool tab this notifier owns.
  final PoolTab tab;

  bool _touched = false;

  @override
  String? build() {
    unawaited(_load());
    return null;
  }

  Future<void> _load() async {
    try {
      final saved = await ref.read(pingDaoProvider).getSelection(tab.wireName);
      if (!_touched) {
        state = saved;
      }
    } on Object catch (_) {
      return;
    }
  }

  /// Persists a manual choice; auto-selection never overwrites this row.
  Future<void> select(String serverId) async {
    _touched = true;
    state = serverId;
    await ref.read(pingDaoProvider).setSelection(tab.wireName, serverId);
  }
}

/// Result of one phase-19 connect (server selection only, D-18).
class ConnectOutcome {
  /// Creates a connect result.
  const ConnectOutcome({
    required this.ok,
    this.serverId,
    this.error,
    this.notice,
    this.suggestOtherTab = false,
  });

  /// Whether a server was actually selected.
  final bool ok;

  /// Id of the selected server, when [ok].
  final String? serverId;

  /// Machine-readable failure code, when not [ok].
  final String? error;

  /// Russian UI copy for the banner/toast.
  final String? notice;

  /// Whether the UI should suggest switching to the other pool tab.
  final bool suggestOtherTab;

  /// Whether the no-key gate blocked the attempt.
  bool get blocked => error == "no_active_key";
}

Future<List<PingOutcome>> _freshOutcomes(
  PingCacheDao dao,
  List<Server> servers,
  int nowMs,
) async {
  final outcomes = <PingOutcome>[];
  for (final server in servers) {
    final row = await dao.fresh(
      server.id,
      server.tab.wireName,
      nowMs: nowMs,
    );
    if (row != null) {
      outcomes.add(
        PingOutcome(
          target: server.pingTarget,
          result: PingResult(
            online: row.online,
            rttMs: row.rttMs,
            approx: row.approx,
            tsMs: row.tsMs,
          ),
        ),
      );
    }
  }
  return outcomes;
}

/// Server-selection controller for the phase-19 «Подключить» button.
///
/// Deliberately stops at selection: no tunnel, no `core.start`, no FSM and no
/// simulated connection (D-18). The VPN core lands in phase 20.
final connectControllerProvider =
    NotifierProvider<ConnectController, ConnectOutcome?>(ConnectController.new);

/// Implements the quick-path → full-ping selection algorithm (D-09/D-12/D-13).
class ConnectController extends Notifier<ConnectOutcome?> {
  @override
  ConnectOutcome? build() => null;

  /// Cancels every in-flight probe (generation token).
  void cancelInflight() => ref.read(pingRepositoryProvider).cancelInflight();

  /// Selects a server for [tab] without starting any tunnel.
  ///
  /// With [auto] false and a persisted/manual [manualServerId], that server is
  /// probed for 1500 ms first; an offline result falls through to auto with a
  /// notice. Auto uses fresh cache, then the ≤3 last-good quick path (800 ms),
  /// then a bounded full ping (2000 ms).
  Future<ConnectOutcome> connect(
    PoolTab tab, {
    required bool auto,
    String? manualServerId,
  }) async {
    final pools = await ref.read(serverPoolProvider.future);
    if (!pools.hasActiveKey) {
      final outcome = ConnectOutcome(
        ok: false,
        error: "no_active_key",
        notice: pools.key == null
            ? "Нет ключа"
            : "Ключ неактивен — серверы недоступны",
      );
      state = outcome;
      return outcome;
    }

    final servers = pools.serversFor(tab);
    if (servers.isEmpty) {
      final outcome = ConnectOutcome(
        ok: false,
        error: "no_servers",
        notice: "Нет доступных серверов. Попробуй другой таб",
        suggestOtherTab: true,
      );
      state = outcome;
      return outcome;
    }

    final dao = ref.read(pingDaoProvider);
    final repository = ref.read(pingRepositoryProvider);
    final selectedId = manualServerId ?? await dao.getSelection(tab.wireName);
    final manual = !auto && selectedId != null && selectedId != "auto";

    if (manual) {
      for (final server in servers) {
        if (server.id != selectedId) {
          continue;
        }
        final outcomes = await repository.fullPing(
          <Server>[server].map((item) => item.pingTarget).toList(),
          timeout: const Duration(milliseconds: 1500),
        );
        if (rankBest(outcomes).isNotEmpty) {
          await _rememberGood(dao, tab, server.id);
          final outcome = ConnectOutcome(ok: true, serverId: server.id);
          state = outcome;
          return outcome;
        }
        break;
      }
    }

    final best = await _autoSelect(repository, dao, servers, tab);
    if (best == null) {
      final outcome = ConnectOutcome(
        ok: false,
        error: "all_offline",
        notice: "Нет доступных серверов. Попробуй другой таб",
        suggestOtherTab: true,
      );
      state = outcome;
      return outcome;
    }

    await _rememberGood(dao, tab, best.id);
    final outcome = ConnectOutcome(
      ok: true,
      serverId: best.id,
      notice: manual ? "Сервер недоступен — включаю автовыбор" : null,
    );
    state = outcome;
    return outcome;
  }

  Future<Server?> _autoSelect(
    PingRepository repository,
    PingCacheDao dao,
    List<Server> servers,
    PoolTab tab,
  ) async {
    final nowMs = DateTime.now().millisecondsSinceEpoch;
    final fresh = await _freshOutcomes(dao, servers, nowMs);
    if (fresh.length == servers.length) {
      final ranked = rankBest(fresh);
      if (ranked.isNotEmpty) {
        return _serverFor(servers, ranked.first.target.id);
      }
    }

    final byId = <String, Server>{for (final server in servers) server.id: server};
    final lastGood = await dao.lastGoodFor(tab.wireName);
    final quickTargets = <PingTarget>[];
    for (final row in lastGood.take(3)) {
      final server = byId[row.serverId];
      if (server != null) {
        quickTargets.add(server.pingTarget);
      }
    }
    if (quickTargets.isNotEmpty) {
      final quick = await repository.quickPath(
        quickTargets,
        timeout: pingQuickTimeout,
      );
      if (quick != null) {
        return _serverFor(servers, quick.target.id);
      }
    }

    final full = await repository.fullPing(
      servers.map((server) => server.pingTarget).toList(),
      timeout: pingFullTimeout,
    );
    final ranked = rankBest(full);
    return ranked.isEmpty ? null : _serverFor(servers, ranked.first.target.id);
  }

  static Server? _serverFor(List<Server> servers, String id) {
    for (final server in servers) {
      if (server.id == id) {
        return server;
      }
    }
    return null;
  }

  Future<void> _rememberGood(
    PingCacheDao dao,
    PoolTab tab,
    String serverId,
  ) async {
    await dao.pushLastGood(
      tab.wireName,
      serverId,
      tsMs: DateTime.now().millisecondsSinceEpoch,
    );
  }

  /// Manual refresh: clear TTL/last-good, run one full ping and report it.
  Future<ConnectOutcome> refresh(PoolTab tab) async {
    final pools = await ref.read(serverPoolProvider.future);
    if (!pools.hasActiveKey) {
      final outcome = ConnectOutcome(
        ok: false,
        error: "no_active_key",
        notice: "Ключ неактивен — серверы недоступны",
      );
      state = outcome;
      return outcome;
    }

    final repository = ref.read(pingRepositoryProvider);
    final dao = ref.read(pingDaoProvider);
    cancelInflight();
    await dao.clearPingCacheAndLastGood();
    final targets = pools
        .serversFor(tab)
        .map((server) => server.pingTarget)
        .toList(growable: false);
    final remembers = <Future<void>>[];
    await repository.fullPing(
      targets,
      timeout: pingFullTimeout,
      onResult: (outcome) {
        if (outcome.result.online) {
          remembers.add(_rememberGood(dao, tab, outcome.target.id));
        }
      },
    );
    await Future.wait(remembers);
    ref.invalidate(pingCacheProvider(tab));
    final outcome = ConnectOutcome(ok: true, notice: "Пинг обновлён");
    state = outcome;
    return outcome;
  }
}

/// Real-connectivity invalidation (D-11/REQ-PING-05).
///
/// Listens only to real `connectivity_plus` changes (the service's startup
/// check never broadcasts), coalesces them with a 500 ms debounce, cancels
/// in-flight probes and clears ping cache + last-good. Selection and current
/// tab are kept. `App.build` watches this provider so it stays alive (D-11).
final networkPingInvalidationProvider = Provider<bool>((ref) {
  final service = ref.read(connectivityServiceProvider);
  final dao = ref.read(pingDaoProvider);
  final repository = ref.read(pingRepositoryProvider);
  Timer? debounce;

  final subscription = service.connectivityStream.distinct().listen((
    _,
  ) {
    debounce?.cancel();
    debounce = Timer(ConnectivityConfig.debounceDuration, () async {
      repository.cancelInflight();
      await dao.clearPingCacheAndLastGood();
      ref.invalidate(pingCacheProvider);
      final pools = ref.read(serverPoolProvider).value;
      if (pools == null || !pools.hasActiveKey) {
        return;
      }
      final tab = ref.read(currentTabProvider);
      final targets = pools
          .serversFor(tab)
          .map((server) => server.pingTarget)
          .toList(growable: false);
      await repository.fullPing(targets, timeout: pingFullTimeout);
      ref.invalidate(pingCacheProvider);
    });
  });

  ref.onDispose(() {
    debounce?.cancel();
    subscription.cancel();
  });
  return true;
});
