import "package:drift/drift.dart";

/// Local ping samples. One row per server per tab; no raw links or secrets.
class PingCache extends Table {
  /// Stable server id from the backend (`server.id`), never the share link.
  TextColumn get serverId => text()();

  /// Pool tab (`simple` or `whitelist`).
  TextColumn get tab => text()();

  /// Real RTT in milliseconds, or `null` when offline.
  IntColumn get rtt => integer().nullable()();

  /// Whether the server answered the probe.
  BoolColumn get online => boolean()();

  /// Epoch milliseconds of the sample; freshness is `ts >= now - 60000`.
  IntColumn get ts => integer()();

  /// Whether the sample came from the silent TCP fallback (D-07).
  BoolColumn get approx =>
      boolean().withDefault(const Constant(false))();

  @override
  Set<Column> get primaryKey => {serverId, tab};
}

/// Up to five most-recent successful servers per tab (D-12).
class LastGood extends Table {
  /// Pool tab (`simple` or `whitelist`).
  TextColumn get tab => text()();

  /// Stable server id.
  TextColumn get serverId => text()();

  /// Epoch milliseconds of the last successful sample.
  IntColumn get ts => integer()();

  @override
  Set<Column> get primaryKey => {tab, serverId};
}

/// Manual/automatic server selection, persisted per tab (D-13/D-14).
class Selection extends Table {
  /// Pool tab (`simple` or `whitelist`).
  TextColumn get tab => text()();

  /// Selected server id.
  TextColumn get serverId => text()();

  @override
  Set<Column> get primaryKey => {tab};
}

/// The currently displayed pool tab, persisted across restarts (D-14).
class CurrentTab extends Table {
  /// Singleton row id; always 1.
  IntColumn get id => integer()();

  /// Pool tab (`simple` or `whitelist`); defaults to `simple`.
  TextColumn get tab => text()();

  @override
  Set<Column> get primaryKey => {id};
}

/// Last backend server list per tab for offline display (D-10).
///
/// Stores metadata JSON only; no raw share links or outbound secrets.
class ServerListCache extends Table {
  /// Pool tab (`simple` or `whitelist`).
  TextColumn get tab => text()();

  /// Serialized metadata-only card list.
  TextColumn get json => text()();

  @override
  Set<Column> get primaryKey => {tab};
}
