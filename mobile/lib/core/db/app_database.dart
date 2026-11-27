import "package:drift/drift.dart";
import "package:drift_flutter/drift_flutter.dart";
import "package:flutter_riverpod/flutter_riverpod.dart";

import "ping_cache_dao.dart";
import "tables.dart";

part "app_database.g.dart";

/// Local SQLite store for ping samples, last-good, per-tab selection, the
/// current tab and the offline server list (D-10/D-11/D-12/D-13/D-14).
///
/// This is separate from the backend `KeyCache`; no secrets or raw share links
/// are ever persisted here.
@DriftDatabase(
  tables: [PingCache, LastGood, Selection, CurrentTab, ServerListCache],
  daos: [PingCacheDao],
)
class AppDatabase extends _$AppDatabase {
  /// Opens the app database, or uses [executor] (e.g. `NativeDatabase.memory()`
  /// in unit tests).
  AppDatabase([QueryExecutor? executor])
      : super(executor ?? driftDatabase(name: "app_db"));

  @override
  int get schemaVersion => 1;
}

/// Riverpod provider for the app-wide [AppDatabase] singleton.
final appDatabaseProvider = Provider<AppDatabase>((ref) {
  final database = AppDatabase();
  ref.onDispose(database.close);
  return database;
});
