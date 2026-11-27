// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'ping_cache_dao.dart';

// ignore_for_file: type=lint
mixin _$PingCacheDaoMixin on DatabaseAccessor<AppDatabase> {
  $PingCacheTable get pingCache => attachedDatabase.pingCache;
  $LastGoodTable get lastGood => attachedDatabase.lastGood;
  $SelectionTable get selection => attachedDatabase.selection;
  $CurrentTabTable get currentTab => attachedDatabase.currentTab;
  $ServerListCacheTable get serverListCache => attachedDatabase.serverListCache;
  PingCacheDaoManager get managers => PingCacheDaoManager(this);
}

class PingCacheDaoManager {
  final _$PingCacheDaoMixin _db;
  PingCacheDaoManager(this._db);
  $$PingCacheTableTableManager get pingCache =>
      $$PingCacheTableTableManager(_db.attachedDatabase, _db.pingCache);
  $$LastGoodTableTableManager get lastGood =>
      $$LastGoodTableTableManager(_db.attachedDatabase, _db.lastGood);
  $$SelectionTableTableManager get selection =>
      $$SelectionTableTableManager(_db.attachedDatabase, _db.selection);
  $$CurrentTabTableTableManager get currentTab =>
      $$CurrentTabTableTableManager(_db.attachedDatabase, _db.currentTab);
  $$ServerListCacheTableTableManager get serverListCache =>
      $$ServerListCacheTableTableManager(
        _db.attachedDatabase,
        _db.serverListCache,
      );
}
