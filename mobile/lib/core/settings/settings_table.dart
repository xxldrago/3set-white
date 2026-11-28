import "package:drift/drift.dart";

/// Client-local settings that survive a cold restart (schema v2).
///
/// A single row (`id = 1`) holds the auto-connect preference and a record of
/// whether the previous session had a live tunnel. Nothing here comes from the
/// backend and no secret, token or raw subscription link is stored.
class Settings extends Table {
  /// Singleton row id; always 1.
  IntColumn get id => integer()();

  /// Whether a launch should reconnect automatically after auth restore.
  BoolColumn get autoConnect =>
      boolean().withDefault(const Constant(false))();

  /// Whether the previous session was connected (display-only history).
  BoolColumn get wasConnected =>
      boolean().withDefault(const Constant(false))();

  @override
  Set<Column> get primaryKey => {id};
}
