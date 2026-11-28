import "package:drift/drift.dart";
import "package:drift_flutter/drift_flutter.dart";
import "package:flutter_riverpod/flutter_riverpod.dart";

import "package:mobile/core/settings/settings_table.dart";

import "ping_cache_dao.dart";
import "tables.dart";

part "app_database.g.dart";

/// Local SQLite store for ping samples, last-good, per-tab selection, the
/// current tab, the offline server list and client-local settings
/// (D-10/D-11/D-12/D-13/D-14, REQ-SET-02).
///
/// This is separate from the backend `KeyCache`; no secrets or raw share links
/// are ever persisted here.
@DriftDatabase(
  tables: [
    PingCache,
    LastGood,
    Selection,
    CurrentTab,
    ServerListCache,
    Settings,
  ],
  daos: [PingCacheDao],
)
class AppDatabase extends _$AppDatabase {
  /// Opens the app database, or uses [executor] (e.g. `NativeDatabase.memory()`
  /// in unit tests).
  AppDatabase([QueryExecutor? executor])
      : super(executor ?? driftDatabase(name: "app_db"));

  @override
  int get schemaVersion => 2;

  /// v1 → v2 adds the client-local settings table. Existing rows in the five
  /// phase-19 tables are preserved: a new table is created, nothing is dropped
  /// or rewritten (T-22-13).
  @override
  MigrationStrategy get migration => MigrationStrategy(
        onCreate: (m) => m.createAll(),
        onUpgrade: (m, from, to) async {
          if (from < 2) {
            await m.createTable(settings);
          }
        },
      );
}

/// Riverpod provider for the app-wide [AppDatabase] singleton.
final appDatabaseProvider = Provider<AppDatabase>((ref) {
  final database = AppDatabase();
  ref.onDispose(database.close);
  return database;
});
