import "package:drift/drift.dart";

import "../ping/ping_repository.dart";
import "../ping/ping_result.dart";
import "app_database.dart";
import "tables.dart";

part "ping_cache_dao.g.dart";

/// Drift accessor for the local ping cache and per-tab persistence.
///
/// A connectivity change clears only `ping_cache` and `last_good`; `selection`
/// and `current_tab` are deliberately preserved (D-11). No secrets or raw
/// share links are stored.
@DriftAccessor(
  tables: [PingCache, LastGood, Selection, CurrentTab, ServerListCache],
)
class PingCacheDao extends DatabaseAccessor<AppDatabase>
    with _$PingCacheDaoMixin
    implements PingCacheWriter, PingCacheLookup {
  /// Attaches this DAO to the app database.
  PingCacheDao(super.attachedDatabase);

  /// Inserts or replaces the sample for `(serverId, tab)` (idempotent upsert).
  Future<void> upsert(PingCacheEntry entry) =>
      into(pingCache).insert(
        PingCacheCompanion.insert(
          serverId: entry.serverId,
          tab: entry.tab,
          rtt: Value(entry.rttMs),
          online: entry.online,
          ts: entry.tsMs,
          approx: Value(entry.approx),
        ),
        mode: InsertMode.insertOrReplace,
      );

  @override
  Future<void> write(PingCacheEntry entry) => upsert(entry);

  /// Returns the row for `(serverId, tab)` only while it is within [ttl].
  ///
  /// Freshness is `ts >= nowMs - ttl`; the boundary is inclusive (D-10).
  @override
  Future<PingCacheEntry?> fresh(
    String serverId,
    String tab, {
    required int nowMs,
    Duration ttl = pingCacheTtl,
  }) async {
    final row =
        await (select(pingCache)
              ..where(
                (table) =>
                    table.serverId.equals(serverId) & table.tab.equals(tab),
              ))
            .getSingleOrNull();
    if (row == null || row.ts < nowMs - ttl.inMilliseconds) {
      return null;
    }
    return PingCacheEntry(
      serverId: row.serverId,
      tab: row.tab,
      rttMs: row.rtt,
      online: row.online,
      approx: row.approx,
      tsMs: row.ts,
    );
  }

  /// Whether a fresh row exists for `(serverId, tab)`.
  Future<bool> isFresh(
    String serverId,
    String tab, {
    required int nowMs,
    Duration ttl = pingCacheTtl,
  }) async =>
      await fresh(serverId, tab, nowMs: nowMs, ttl: ttl) != null;

  /// Watches fresh rows of one tab; re-emits on writes and deletes.
  Stream<List<PingCacheData>> watchFresh(
    String tab, {
    PingClock? nowMs,
  }) {
    final clock = nowMs ?? defaultPingClock;
    return (select(pingCache)..where((table) => table.tab.equals(tab)))
        .watch()
        .map(
          (rows) => rows
              .where(
                (row) => row.ts >= clock() - pingCacheTtl.inMilliseconds,
              )
              .toList(growable: false),
        );
  }

  /// Deletes every ping sample.
  Future<void> clearPingCache() => delete(pingCache).go();

  /// Records a successful sample (used by the connectivity re-ping path).
  Future<void> markOnline(
    String serverId,
    String tab, {
    required int rttMs,
    required bool approx,
    required int tsMs,
  }) =>
      upsert(
        PingCacheEntry(
          serverId: serverId,
          tab: tab,
          rttMs: rttMs,
          online: true,
          approx: approx,
          tsMs: tsMs,
        ),
      );

  /// Pushes a successful server to the front of a tab's last-good list.
  ///
  /// Deduplicates on `(tab, serverId)` via the primary key and caps the list
  /// at [limit] entries, ordered most-recent first (D-12).
  Future<void> pushLastGood(
    String tab,
    String serverId, {
    required int tsMs,
    int limit = 5,
  }) async {
    await into(lastGood).insert(
      LastGoodCompanion.insert(tab: tab, serverId: serverId, ts: tsMs),
      mode: InsertMode.insertOrReplace,
    );
    final rows =
        await (select(lastGood)
              ..where((table) => table.tab.equals(tab))
              ..orderBy([(table) => OrderingTerm.desc(table.ts)]))
            .get();
    if (rows.length > limit) {
      final excess = rows.skip(limit).map((row) => row.serverId).toList();
      await (delete(lastGood)
            ..where(
              (table) =>
                  table.tab.equals(tab) & table.serverId.isIn(excess),
            ))
          .go();
    }
  }

  /// Most-recent-first last-good rows for [tab], capped at [limit].
  ///
  /// Named `lastGoodFor` to avoid colliding with the generated table getter.
  Future<List<LastGoodData>> lastGoodFor(String tab, {int limit = 5}) =>
      (select(lastGood)
            ..where((table) => table.tab.equals(tab))
            ..orderBy([(table) => OrderingTerm.desc(table.ts)])
            ..limit(limit))
          .get();

  /// Deletes all last-good rows.
  Future<void> clearLastGood() => delete(lastGood).go();

  /// Connectivity-change invalidation: clear ping samples and last-good only.
  ///
  /// `selection` and `current_tab` are intentionally kept (D-11).
  Future<void> clearPingCacheAndLastGood() => transaction(() async {
        await delete(pingCache).go();
        await delete(lastGood).go();
      });

  /// Alias for [clearPingCacheAndLastGood].
  Future<void> clear() => clearPingCacheAndLastGood();

  /// Persists a manual/automatic selection for [tab].
  Future<void> setSelection(String tab, String serverId) =>
      into(selection).insert(
        SelectionCompanion.insert(tab: tab, serverId: serverId),
        mode: InsertMode.insertOrReplace,
      );

  /// Reads the persisted selection for [tab], or `null` when none was made.
  Future<String?> getSelection(String tab) async {
    final row =
        await (select(selection)..where((table) => table.tab.equals(tab)))
            .getSingleOrNull();
    return row?.serverId;
  }

  /// Persists the currently displayed pool tab.
  Future<void> setCurrentTab(String tab) =>
      into(currentTab).insert(
        CurrentTabCompanion.insert(id: Value(1), tab: tab),
        mode: InsertMode.insertOrReplace,
      );

  /// Reads the persisted tab, defaulting to `simple` (D-14).
  Future<String> getCurrentTab() async {
    final row =
        await (select(currentTab)..where((table) => table.id.equals(1)))
            .getSingleOrNull();
    return row?.tab ?? "simple";
  }

  /// Caches metadata-only server cards for offline display (D-10).
  Future<void> cacheServerList(String tab, String json) =>
      into(serverListCache).insert(
        ServerListCacheCompanion.insert(tab: tab, json: json),
        mode: InsertMode.insertOrReplace,
      );

  /// Reads the cached metadata-only server cards for [tab].
  Future<String?> getServerList(String tab) async {
    final row =
        await (select(serverListCache)
              ..where((table) => table.tab.equals(tab)))
            .getSingleOrNull();
    return row?.json;
  }
}
