// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'app_database.dart';

// ignore_for_file: type=lint
class $PingCacheTable extends PingCache
    with TableInfo<$PingCacheTable, PingCacheData> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $PingCacheTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _serverIdMeta = const VerificationMeta(
    'serverId',
  );
  @override
  late final GeneratedColumn<String> serverId = GeneratedColumn<String>(
    'server_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _tabMeta = const VerificationMeta('tab');
  @override
  late final GeneratedColumn<String> tab = GeneratedColumn<String>(
    'tab',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _rttMeta = const VerificationMeta('rtt');
  @override
  late final GeneratedColumn<int> rtt = GeneratedColumn<int>(
    'rtt',
    aliasedName,
    true,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _onlineMeta = const VerificationMeta('online');
  @override
  late final GeneratedColumn<bool> online = GeneratedColumn<bool>(
    'online',
    aliasedName,
    false,
    type: DriftSqlType.bool,
    requiredDuringInsert: true,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'CHECK ("online" IN (0, 1))',
    ),
  );
  static const VerificationMeta _tsMeta = const VerificationMeta('ts');
  @override
  late final GeneratedColumn<int> ts = GeneratedColumn<int>(
    'ts',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _approxMeta = const VerificationMeta('approx');
  @override
  late final GeneratedColumn<bool> approx = GeneratedColumn<bool>(
    'approx',
    aliasedName,
    false,
    type: DriftSqlType.bool,
    requiredDuringInsert: false,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'CHECK ("approx" IN (0, 1))',
    ),
    defaultValue: const Constant(false),
  );
  @override
  List<GeneratedColumn> get $columns => [
    serverId,
    tab,
    rtt,
    online,
    ts,
    approx,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'ping_cache';
  @override
  VerificationContext validateIntegrity(
    Insertable<PingCacheData> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('server_id')) {
      context.handle(
        _serverIdMeta,
        serverId.isAcceptableOrUnknown(data['server_id']!, _serverIdMeta),
      );
    } else if (isInserting) {
      context.missing(_serverIdMeta);
    }
    if (data.containsKey('tab')) {
      context.handle(
        _tabMeta,
        tab.isAcceptableOrUnknown(data['tab']!, _tabMeta),
      );
    } else if (isInserting) {
      context.missing(_tabMeta);
    }
    if (data.containsKey('rtt')) {
      context.handle(
        _rttMeta,
        rtt.isAcceptableOrUnknown(data['rtt']!, _rttMeta),
      );
    }
    if (data.containsKey('online')) {
      context.handle(
        _onlineMeta,
        online.isAcceptableOrUnknown(data['online']!, _onlineMeta),
      );
    } else if (isInserting) {
      context.missing(_onlineMeta);
    }
    if (data.containsKey('ts')) {
      context.handle(_tsMeta, ts.isAcceptableOrUnknown(data['ts']!, _tsMeta));
    } else if (isInserting) {
      context.missing(_tsMeta);
    }
    if (data.containsKey('approx')) {
      context.handle(
        _approxMeta,
        approx.isAcceptableOrUnknown(data['approx']!, _approxMeta),
      );
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {serverId, tab};
  @override
  PingCacheData map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return PingCacheData(
      serverId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}server_id'],
      )!,
      tab: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}tab'],
      )!,
      rtt: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}rtt'],
      ),
      online: attachedDatabase.typeMapping.read(
        DriftSqlType.bool,
        data['${effectivePrefix}online'],
      )!,
      ts: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}ts'],
      )!,
      approx: attachedDatabase.typeMapping.read(
        DriftSqlType.bool,
        data['${effectivePrefix}approx'],
      )!,
    );
  }

  @override
  $PingCacheTable createAlias(String alias) {
    return $PingCacheTable(attachedDatabase, alias);
  }
}

class PingCacheData extends DataClass implements Insertable<PingCacheData> {
  /// Stable server id from the backend (`server.id`), never the share link.
  final String serverId;

  /// Pool tab (`simple` or `whitelist`).
  final String tab;

  /// Real RTT in milliseconds, or `null` when offline.
  final int? rtt;

  /// Whether the server answered the probe.
  final bool online;

  /// Epoch milliseconds of the sample; freshness is `ts >= now - 60000`.
  final int ts;

  /// Whether the sample came from the silent TCP fallback (D-07).
  final bool approx;
  const PingCacheData({
    required this.serverId,
    required this.tab,
    this.rtt,
    required this.online,
    required this.ts,
    required this.approx,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['server_id'] = Variable<String>(serverId);
    map['tab'] = Variable<String>(tab);
    if (!nullToAbsent || rtt != null) {
      map['rtt'] = Variable<int>(rtt);
    }
    map['online'] = Variable<bool>(online);
    map['ts'] = Variable<int>(ts);
    map['approx'] = Variable<bool>(approx);
    return map;
  }

  PingCacheCompanion toCompanion(bool nullToAbsent) {
    return PingCacheCompanion(
      serverId: Value(serverId),
      tab: Value(tab),
      rtt: rtt == null && nullToAbsent ? const Value.absent() : Value(rtt),
      online: Value(online),
      ts: Value(ts),
      approx: Value(approx),
    );
  }

  factory PingCacheData.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return PingCacheData(
      serverId: serializer.fromJson<String>(json['serverId']),
      tab: serializer.fromJson<String>(json['tab']),
      rtt: serializer.fromJson<int?>(json['rtt']),
      online: serializer.fromJson<bool>(json['online']),
      ts: serializer.fromJson<int>(json['ts']),
      approx: serializer.fromJson<bool>(json['approx']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'serverId': serializer.toJson<String>(serverId),
      'tab': serializer.toJson<String>(tab),
      'rtt': serializer.toJson<int?>(rtt),
      'online': serializer.toJson<bool>(online),
      'ts': serializer.toJson<int>(ts),
      'approx': serializer.toJson<bool>(approx),
    };
  }

  PingCacheData copyWith({
    String? serverId,
    String? tab,
    Value<int?> rtt = const Value.absent(),
    bool? online,
    int? ts,
    bool? approx,
  }) => PingCacheData(
    serverId: serverId ?? this.serverId,
    tab: tab ?? this.tab,
    rtt: rtt.present ? rtt.value : this.rtt,
    online: online ?? this.online,
    ts: ts ?? this.ts,
    approx: approx ?? this.approx,
  );
  PingCacheData copyWithCompanion(PingCacheCompanion data) {
    return PingCacheData(
      serverId: data.serverId.present ? data.serverId.value : this.serverId,
      tab: data.tab.present ? data.tab.value : this.tab,
      rtt: data.rtt.present ? data.rtt.value : this.rtt,
      online: data.online.present ? data.online.value : this.online,
      ts: data.ts.present ? data.ts.value : this.ts,
      approx: data.approx.present ? data.approx.value : this.approx,
    );
  }

  @override
  String toString() {
    return (StringBuffer('PingCacheData(')
          ..write('serverId: $serverId, ')
          ..write('tab: $tab, ')
          ..write('rtt: $rtt, ')
          ..write('online: $online, ')
          ..write('ts: $ts, ')
          ..write('approx: $approx')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(serverId, tab, rtt, online, ts, approx);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is PingCacheData &&
          other.serverId == this.serverId &&
          other.tab == this.tab &&
          other.rtt == this.rtt &&
          other.online == this.online &&
          other.ts == this.ts &&
          other.approx == this.approx);
}

class PingCacheCompanion extends UpdateCompanion<PingCacheData> {
  final Value<String> serverId;
  final Value<String> tab;
  final Value<int?> rtt;
  final Value<bool> online;
  final Value<int> ts;
  final Value<bool> approx;
  final Value<int> rowid;
  const PingCacheCompanion({
    this.serverId = const Value.absent(),
    this.tab = const Value.absent(),
    this.rtt = const Value.absent(),
    this.online = const Value.absent(),
    this.ts = const Value.absent(),
    this.approx = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  PingCacheCompanion.insert({
    required String serverId,
    required String tab,
    this.rtt = const Value.absent(),
    required bool online,
    required int ts,
    this.approx = const Value.absent(),
    this.rowid = const Value.absent(),
  }) : serverId = Value(serverId),
       tab = Value(tab),
       online = Value(online),
       ts = Value(ts);
  static Insertable<PingCacheData> custom({
    Expression<String>? serverId,
    Expression<String>? tab,
    Expression<int>? rtt,
    Expression<bool>? online,
    Expression<int>? ts,
    Expression<bool>? approx,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (serverId != null) 'server_id': serverId,
      if (tab != null) 'tab': tab,
      if (rtt != null) 'rtt': rtt,
      if (online != null) 'online': online,
      if (ts != null) 'ts': ts,
      if (approx != null) 'approx': approx,
      if (rowid != null) 'rowid': rowid,
    });
  }

  PingCacheCompanion copyWith({
    Value<String>? serverId,
    Value<String>? tab,
    Value<int?>? rtt,
    Value<bool>? online,
    Value<int>? ts,
    Value<bool>? approx,
    Value<int>? rowid,
  }) {
    return PingCacheCompanion(
      serverId: serverId ?? this.serverId,
      tab: tab ?? this.tab,
      rtt: rtt ?? this.rtt,
      online: online ?? this.online,
      ts: ts ?? this.ts,
      approx: approx ?? this.approx,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (serverId.present) {
      map['server_id'] = Variable<String>(serverId.value);
    }
    if (tab.present) {
      map['tab'] = Variable<String>(tab.value);
    }
    if (rtt.present) {
      map['rtt'] = Variable<int>(rtt.value);
    }
    if (online.present) {
      map['online'] = Variable<bool>(online.value);
    }
    if (ts.present) {
      map['ts'] = Variable<int>(ts.value);
    }
    if (approx.present) {
      map['approx'] = Variable<bool>(approx.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('PingCacheCompanion(')
          ..write('serverId: $serverId, ')
          ..write('tab: $tab, ')
          ..write('rtt: $rtt, ')
          ..write('online: $online, ')
          ..write('ts: $ts, ')
          ..write('approx: $approx, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $LastGoodTable extends LastGood
    with TableInfo<$LastGoodTable, LastGoodData> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $LastGoodTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _tabMeta = const VerificationMeta('tab');
  @override
  late final GeneratedColumn<String> tab = GeneratedColumn<String>(
    'tab',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _serverIdMeta = const VerificationMeta(
    'serverId',
  );
  @override
  late final GeneratedColumn<String> serverId = GeneratedColumn<String>(
    'server_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _tsMeta = const VerificationMeta('ts');
  @override
  late final GeneratedColumn<int> ts = GeneratedColumn<int>(
    'ts',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  @override
  List<GeneratedColumn> get $columns => [tab, serverId, ts];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'last_good';
  @override
  VerificationContext validateIntegrity(
    Insertable<LastGoodData> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('tab')) {
      context.handle(
        _tabMeta,
        tab.isAcceptableOrUnknown(data['tab']!, _tabMeta),
      );
    } else if (isInserting) {
      context.missing(_tabMeta);
    }
    if (data.containsKey('server_id')) {
      context.handle(
        _serverIdMeta,
        serverId.isAcceptableOrUnknown(data['server_id']!, _serverIdMeta),
      );
    } else if (isInserting) {
      context.missing(_serverIdMeta);
    }
    if (data.containsKey('ts')) {
      context.handle(_tsMeta, ts.isAcceptableOrUnknown(data['ts']!, _tsMeta));
    } else if (isInserting) {
      context.missing(_tsMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {tab, serverId};
  @override
  LastGoodData map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return LastGoodData(
      tab: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}tab'],
      )!,
      serverId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}server_id'],
      )!,
      ts: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}ts'],
      )!,
    );
  }

  @override
  $LastGoodTable createAlias(String alias) {
    return $LastGoodTable(attachedDatabase, alias);
  }
}

class LastGoodData extends DataClass implements Insertable<LastGoodData> {
  /// Pool tab (`simple` or `whitelist`).
  final String tab;

  /// Stable server id.
  final String serverId;

  /// Epoch milliseconds of the last successful sample.
  final int ts;
  const LastGoodData({
    required this.tab,
    required this.serverId,
    required this.ts,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['tab'] = Variable<String>(tab);
    map['server_id'] = Variable<String>(serverId);
    map['ts'] = Variable<int>(ts);
    return map;
  }

  LastGoodCompanion toCompanion(bool nullToAbsent) {
    return LastGoodCompanion(
      tab: Value(tab),
      serverId: Value(serverId),
      ts: Value(ts),
    );
  }

  factory LastGoodData.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return LastGoodData(
      tab: serializer.fromJson<String>(json['tab']),
      serverId: serializer.fromJson<String>(json['serverId']),
      ts: serializer.fromJson<int>(json['ts']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'tab': serializer.toJson<String>(tab),
      'serverId': serializer.toJson<String>(serverId),
      'ts': serializer.toJson<int>(ts),
    };
  }

  LastGoodData copyWith({String? tab, String? serverId, int? ts}) =>
      LastGoodData(
        tab: tab ?? this.tab,
        serverId: serverId ?? this.serverId,
        ts: ts ?? this.ts,
      );
  LastGoodData copyWithCompanion(LastGoodCompanion data) {
    return LastGoodData(
      tab: data.tab.present ? data.tab.value : this.tab,
      serverId: data.serverId.present ? data.serverId.value : this.serverId,
      ts: data.ts.present ? data.ts.value : this.ts,
    );
  }

  @override
  String toString() {
    return (StringBuffer('LastGoodData(')
          ..write('tab: $tab, ')
          ..write('serverId: $serverId, ')
          ..write('ts: $ts')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(tab, serverId, ts);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is LastGoodData &&
          other.tab == this.tab &&
          other.serverId == this.serverId &&
          other.ts == this.ts);
}

class LastGoodCompanion extends UpdateCompanion<LastGoodData> {
  final Value<String> tab;
  final Value<String> serverId;
  final Value<int> ts;
  final Value<int> rowid;
  const LastGoodCompanion({
    this.tab = const Value.absent(),
    this.serverId = const Value.absent(),
    this.ts = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  LastGoodCompanion.insert({
    required String tab,
    required String serverId,
    required int ts,
    this.rowid = const Value.absent(),
  }) : tab = Value(tab),
       serverId = Value(serverId),
       ts = Value(ts);
  static Insertable<LastGoodData> custom({
    Expression<String>? tab,
    Expression<String>? serverId,
    Expression<int>? ts,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (tab != null) 'tab': tab,
      if (serverId != null) 'server_id': serverId,
      if (ts != null) 'ts': ts,
      if (rowid != null) 'rowid': rowid,
    });
  }

  LastGoodCompanion copyWith({
    Value<String>? tab,
    Value<String>? serverId,
    Value<int>? ts,
    Value<int>? rowid,
  }) {
    return LastGoodCompanion(
      tab: tab ?? this.tab,
      serverId: serverId ?? this.serverId,
      ts: ts ?? this.ts,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (tab.present) {
      map['tab'] = Variable<String>(tab.value);
    }
    if (serverId.present) {
      map['server_id'] = Variable<String>(serverId.value);
    }
    if (ts.present) {
      map['ts'] = Variable<int>(ts.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('LastGoodCompanion(')
          ..write('tab: $tab, ')
          ..write('serverId: $serverId, ')
          ..write('ts: $ts, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $SelectionTable extends Selection
    with TableInfo<$SelectionTable, SelectionData> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $SelectionTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _tabMeta = const VerificationMeta('tab');
  @override
  late final GeneratedColumn<String> tab = GeneratedColumn<String>(
    'tab',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _serverIdMeta = const VerificationMeta(
    'serverId',
  );
  @override
  late final GeneratedColumn<String> serverId = GeneratedColumn<String>(
    'server_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  @override
  List<GeneratedColumn> get $columns => [tab, serverId];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'selection';
  @override
  VerificationContext validateIntegrity(
    Insertable<SelectionData> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('tab')) {
      context.handle(
        _tabMeta,
        tab.isAcceptableOrUnknown(data['tab']!, _tabMeta),
      );
    } else if (isInserting) {
      context.missing(_tabMeta);
    }
    if (data.containsKey('server_id')) {
      context.handle(
        _serverIdMeta,
        serverId.isAcceptableOrUnknown(data['server_id']!, _serverIdMeta),
      );
    } else if (isInserting) {
      context.missing(_serverIdMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {tab};
  @override
  SelectionData map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return SelectionData(
      tab: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}tab'],
      )!,
      serverId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}server_id'],
      )!,
    );
  }

  @override
  $SelectionTable createAlias(String alias) {
    return $SelectionTable(attachedDatabase, alias);
  }
}

class SelectionData extends DataClass implements Insertable<SelectionData> {
  /// Pool tab (`simple` or `whitelist`).
  final String tab;

  /// Selected server id.
  final String serverId;
  const SelectionData({required this.tab, required this.serverId});
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['tab'] = Variable<String>(tab);
    map['server_id'] = Variable<String>(serverId);
    return map;
  }

  SelectionCompanion toCompanion(bool nullToAbsent) {
    return SelectionCompanion(tab: Value(tab), serverId: Value(serverId));
  }

  factory SelectionData.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return SelectionData(
      tab: serializer.fromJson<String>(json['tab']),
      serverId: serializer.fromJson<String>(json['serverId']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'tab': serializer.toJson<String>(tab),
      'serverId': serializer.toJson<String>(serverId),
    };
  }

  SelectionData copyWith({String? tab, String? serverId}) =>
      SelectionData(tab: tab ?? this.tab, serverId: serverId ?? this.serverId);
  SelectionData copyWithCompanion(SelectionCompanion data) {
    return SelectionData(
      tab: data.tab.present ? data.tab.value : this.tab,
      serverId: data.serverId.present ? data.serverId.value : this.serverId,
    );
  }

  @override
  String toString() {
    return (StringBuffer('SelectionData(')
          ..write('tab: $tab, ')
          ..write('serverId: $serverId')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(tab, serverId);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is SelectionData &&
          other.tab == this.tab &&
          other.serverId == this.serverId);
}

class SelectionCompanion extends UpdateCompanion<SelectionData> {
  final Value<String> tab;
  final Value<String> serverId;
  final Value<int> rowid;
  const SelectionCompanion({
    this.tab = const Value.absent(),
    this.serverId = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  SelectionCompanion.insert({
    required String tab,
    required String serverId,
    this.rowid = const Value.absent(),
  }) : tab = Value(tab),
       serverId = Value(serverId);
  static Insertable<SelectionData> custom({
    Expression<String>? tab,
    Expression<String>? serverId,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (tab != null) 'tab': tab,
      if (serverId != null) 'server_id': serverId,
      if (rowid != null) 'rowid': rowid,
    });
  }

  SelectionCompanion copyWith({
    Value<String>? tab,
    Value<String>? serverId,
    Value<int>? rowid,
  }) {
    return SelectionCompanion(
      tab: tab ?? this.tab,
      serverId: serverId ?? this.serverId,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (tab.present) {
      map['tab'] = Variable<String>(tab.value);
    }
    if (serverId.present) {
      map['server_id'] = Variable<String>(serverId.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('SelectionCompanion(')
          ..write('tab: $tab, ')
          ..write('serverId: $serverId, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $CurrentTabTable extends CurrentTab
    with TableInfo<$CurrentTabTable, CurrentTabData> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $CurrentTabTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<int> id = GeneratedColumn<int>(
    'id',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _tabMeta = const VerificationMeta('tab');
  @override
  late final GeneratedColumn<String> tab = GeneratedColumn<String>(
    'tab',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  @override
  List<GeneratedColumn> get $columns => [id, tab];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'current_tab';
  @override
  VerificationContext validateIntegrity(
    Insertable<CurrentTabData> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    }
    if (data.containsKey('tab')) {
      context.handle(
        _tabMeta,
        tab.isAcceptableOrUnknown(data['tab']!, _tabMeta),
      );
    } else if (isInserting) {
      context.missing(_tabMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  CurrentTabData map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return CurrentTabData(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}id'],
      )!,
      tab: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}tab'],
      )!,
    );
  }

  @override
  $CurrentTabTable createAlias(String alias) {
    return $CurrentTabTable(attachedDatabase, alias);
  }
}

class CurrentTabData extends DataClass implements Insertable<CurrentTabData> {
  /// Singleton row id; always 1.
  final int id;

  /// Pool tab (`simple` or `whitelist`); defaults to `simple`.
  final String tab;
  const CurrentTabData({required this.id, required this.tab});
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<int>(id);
    map['tab'] = Variable<String>(tab);
    return map;
  }

  CurrentTabCompanion toCompanion(bool nullToAbsent) {
    return CurrentTabCompanion(id: Value(id), tab: Value(tab));
  }

  factory CurrentTabData.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return CurrentTabData(
      id: serializer.fromJson<int>(json['id']),
      tab: serializer.fromJson<String>(json['tab']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<int>(id),
      'tab': serializer.toJson<String>(tab),
    };
  }

  CurrentTabData copyWith({int? id, String? tab}) =>
      CurrentTabData(id: id ?? this.id, tab: tab ?? this.tab);
  CurrentTabData copyWithCompanion(CurrentTabCompanion data) {
    return CurrentTabData(
      id: data.id.present ? data.id.value : this.id,
      tab: data.tab.present ? data.tab.value : this.tab,
    );
  }

  @override
  String toString() {
    return (StringBuffer('CurrentTabData(')
          ..write('id: $id, ')
          ..write('tab: $tab')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(id, tab);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is CurrentTabData && other.id == this.id && other.tab == this.tab);
}

class CurrentTabCompanion extends UpdateCompanion<CurrentTabData> {
  final Value<int> id;
  final Value<String> tab;
  const CurrentTabCompanion({
    this.id = const Value.absent(),
    this.tab = const Value.absent(),
  });
  CurrentTabCompanion.insert({
    this.id = const Value.absent(),
    required String tab,
  }) : tab = Value(tab);
  static Insertable<CurrentTabData> custom({
    Expression<int>? id,
    Expression<String>? tab,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (tab != null) 'tab': tab,
    });
  }

  CurrentTabCompanion copyWith({Value<int>? id, Value<String>? tab}) {
    return CurrentTabCompanion(id: id ?? this.id, tab: tab ?? this.tab);
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<int>(id.value);
    }
    if (tab.present) {
      map['tab'] = Variable<String>(tab.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('CurrentTabCompanion(')
          ..write('id: $id, ')
          ..write('tab: $tab')
          ..write(')'))
        .toString();
  }
}

class $ServerListCacheTable extends ServerListCache
    with TableInfo<$ServerListCacheTable, ServerListCacheData> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $ServerListCacheTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _tabMeta = const VerificationMeta('tab');
  @override
  late final GeneratedColumn<String> tab = GeneratedColumn<String>(
    'tab',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _jsonMeta = const VerificationMeta('json');
  @override
  late final GeneratedColumn<String> json = GeneratedColumn<String>(
    'json',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  @override
  List<GeneratedColumn> get $columns => [tab, json];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'server_list_cache';
  @override
  VerificationContext validateIntegrity(
    Insertable<ServerListCacheData> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('tab')) {
      context.handle(
        _tabMeta,
        tab.isAcceptableOrUnknown(data['tab']!, _tabMeta),
      );
    } else if (isInserting) {
      context.missing(_tabMeta);
    }
    if (data.containsKey('json')) {
      context.handle(
        _jsonMeta,
        json.isAcceptableOrUnknown(data['json']!, _jsonMeta),
      );
    } else if (isInserting) {
      context.missing(_jsonMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {tab};
  @override
  ServerListCacheData map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return ServerListCacheData(
      tab: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}tab'],
      )!,
      json: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}json'],
      )!,
    );
  }

  @override
  $ServerListCacheTable createAlias(String alias) {
    return $ServerListCacheTable(attachedDatabase, alias);
  }
}

class ServerListCacheData extends DataClass
    implements Insertable<ServerListCacheData> {
  /// Pool tab (`simple` or `whitelist`).
  final String tab;

  /// Serialized metadata-only card list.
  final String json;
  const ServerListCacheData({required this.tab, required this.json});
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['tab'] = Variable<String>(tab);
    map['json'] = Variable<String>(json);
    return map;
  }

  ServerListCacheCompanion toCompanion(bool nullToAbsent) {
    return ServerListCacheCompanion(tab: Value(tab), json: Value(json));
  }

  factory ServerListCacheData.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return ServerListCacheData(
      tab: serializer.fromJson<String>(json['tab']),
      json: serializer.fromJson<String>(json['json']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'tab': serializer.toJson<String>(tab),
      'json': serializer.toJson<String>(json),
    };
  }

  ServerListCacheData copyWith({String? tab, String? json}) =>
      ServerListCacheData(tab: tab ?? this.tab, json: json ?? this.json);
  ServerListCacheData copyWithCompanion(ServerListCacheCompanion data) {
    return ServerListCacheData(
      tab: data.tab.present ? data.tab.value : this.tab,
      json: data.json.present ? data.json.value : this.json,
    );
  }

  @override
  String toString() {
    return (StringBuffer('ServerListCacheData(')
          ..write('tab: $tab, ')
          ..write('json: $json')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(tab, json);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is ServerListCacheData &&
          other.tab == this.tab &&
          other.json == this.json);
}

class ServerListCacheCompanion extends UpdateCompanion<ServerListCacheData> {
  final Value<String> tab;
  final Value<String> json;
  final Value<int> rowid;
  const ServerListCacheCompanion({
    this.tab = const Value.absent(),
    this.json = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  ServerListCacheCompanion.insert({
    required String tab,
    required String json,
    this.rowid = const Value.absent(),
  }) : tab = Value(tab),
       json = Value(json);
  static Insertable<ServerListCacheData> custom({
    Expression<String>? tab,
    Expression<String>? json,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (tab != null) 'tab': tab,
      if (json != null) 'json': json,
      if (rowid != null) 'rowid': rowid,
    });
  }

  ServerListCacheCompanion copyWith({
    Value<String>? tab,
    Value<String>? json,
    Value<int>? rowid,
  }) {
    return ServerListCacheCompanion(
      tab: tab ?? this.tab,
      json: json ?? this.json,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (tab.present) {
      map['tab'] = Variable<String>(tab.value);
    }
    if (json.present) {
      map['json'] = Variable<String>(json.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('ServerListCacheCompanion(')
          ..write('tab: $tab, ')
          ..write('json: $json, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $SettingsTable extends Settings with TableInfo<$SettingsTable, Setting> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $SettingsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<int> id = GeneratedColumn<int>(
    'id',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _autoConnectMeta = const VerificationMeta(
    'autoConnect',
  );
  @override
  late final GeneratedColumn<bool> autoConnect = GeneratedColumn<bool>(
    'auto_connect',
    aliasedName,
    false,
    type: DriftSqlType.bool,
    requiredDuringInsert: false,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'CHECK ("auto_connect" IN (0, 1))',
    ),
    defaultValue: const Constant(false),
  );
  static const VerificationMeta _wasConnectedMeta = const VerificationMeta(
    'wasConnected',
  );
  @override
  late final GeneratedColumn<bool> wasConnected = GeneratedColumn<bool>(
    'was_connected',
    aliasedName,
    false,
    type: DriftSqlType.bool,
    requiredDuringInsert: false,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'CHECK ("was_connected" IN (0, 1))',
    ),
    defaultValue: const Constant(false),
  );
  @override
  List<GeneratedColumn> get $columns => [id, autoConnect, wasConnected];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'settings';
  @override
  VerificationContext validateIntegrity(
    Insertable<Setting> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    }
    if (data.containsKey('auto_connect')) {
      context.handle(
        _autoConnectMeta,
        autoConnect.isAcceptableOrUnknown(
          data['auto_connect']!,
          _autoConnectMeta,
        ),
      );
    }
    if (data.containsKey('was_connected')) {
      context.handle(
        _wasConnectedMeta,
        wasConnected.isAcceptableOrUnknown(
          data['was_connected']!,
          _wasConnectedMeta,
        ),
      );
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  Setting map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return Setting(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}id'],
      )!,
      autoConnect: attachedDatabase.typeMapping.read(
        DriftSqlType.bool,
        data['${effectivePrefix}auto_connect'],
      )!,
      wasConnected: attachedDatabase.typeMapping.read(
        DriftSqlType.bool,
        data['${effectivePrefix}was_connected'],
      )!,
    );
  }

  @override
  $SettingsTable createAlias(String alias) {
    return $SettingsTable(attachedDatabase, alias);
  }
}

class Setting extends DataClass implements Insertable<Setting> {
  /// Singleton row id; always 1.
  final int id;

  /// Whether a launch should reconnect automatically after auth restore.
  final bool autoConnect;

  /// Whether the previous session was connected (display-only history).
  final bool wasConnected;
  const Setting({
    required this.id,
    required this.autoConnect,
    required this.wasConnected,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<int>(id);
    map['auto_connect'] = Variable<bool>(autoConnect);
    map['was_connected'] = Variable<bool>(wasConnected);
    return map;
  }

  SettingsCompanion toCompanion(bool nullToAbsent) {
    return SettingsCompanion(
      id: Value(id),
      autoConnect: Value(autoConnect),
      wasConnected: Value(wasConnected),
    );
  }

  factory Setting.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return Setting(
      id: serializer.fromJson<int>(json['id']),
      autoConnect: serializer.fromJson<bool>(json['autoConnect']),
      wasConnected: serializer.fromJson<bool>(json['wasConnected']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<int>(id),
      'autoConnect': serializer.toJson<bool>(autoConnect),
      'wasConnected': serializer.toJson<bool>(wasConnected),
    };
  }

  Setting copyWith({int? id, bool? autoConnect, bool? wasConnected}) => Setting(
    id: id ?? this.id,
    autoConnect: autoConnect ?? this.autoConnect,
    wasConnected: wasConnected ?? this.wasConnected,
  );
  Setting copyWithCompanion(SettingsCompanion data) {
    return Setting(
      id: data.id.present ? data.id.value : this.id,
      autoConnect: data.autoConnect.present
          ? data.autoConnect.value
          : this.autoConnect,
      wasConnected: data.wasConnected.present
          ? data.wasConnected.value
          : this.wasConnected,
    );
  }

  @override
  String toString() {
    return (StringBuffer('Setting(')
          ..write('id: $id, ')
          ..write('autoConnect: $autoConnect, ')
          ..write('wasConnected: $wasConnected')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(id, autoConnect, wasConnected);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is Setting &&
          other.id == this.id &&
          other.autoConnect == this.autoConnect &&
          other.wasConnected == this.wasConnected);
}

class SettingsCompanion extends UpdateCompanion<Setting> {
  final Value<int> id;
  final Value<bool> autoConnect;
  final Value<bool> wasConnected;
  const SettingsCompanion({
    this.id = const Value.absent(),
    this.autoConnect = const Value.absent(),
    this.wasConnected = const Value.absent(),
  });
  SettingsCompanion.insert({
    this.id = const Value.absent(),
    this.autoConnect = const Value.absent(),
    this.wasConnected = const Value.absent(),
  });
  static Insertable<Setting> custom({
    Expression<int>? id,
    Expression<bool>? autoConnect,
    Expression<bool>? wasConnected,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (autoConnect != null) 'auto_connect': autoConnect,
      if (wasConnected != null) 'was_connected': wasConnected,
    });
  }

  SettingsCompanion copyWith({
    Value<int>? id,
    Value<bool>? autoConnect,
    Value<bool>? wasConnected,
  }) {
    return SettingsCompanion(
      id: id ?? this.id,
      autoConnect: autoConnect ?? this.autoConnect,
      wasConnected: wasConnected ?? this.wasConnected,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<int>(id.value);
    }
    if (autoConnect.present) {
      map['auto_connect'] = Variable<bool>(autoConnect.value);
    }
    if (wasConnected.present) {
      map['was_connected'] = Variable<bool>(wasConnected.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('SettingsCompanion(')
          ..write('id: $id, ')
          ..write('autoConnect: $autoConnect, ')
          ..write('wasConnected: $wasConnected')
          ..write(')'))
        .toString();
  }
}

abstract class _$AppDatabase extends GeneratedDatabase {
  _$AppDatabase(QueryExecutor e) : super(e);
  $AppDatabaseManager get managers => $AppDatabaseManager(this);
  late final $PingCacheTable pingCache = $PingCacheTable(this);
  late final $LastGoodTable lastGood = $LastGoodTable(this);
  late final $SelectionTable selection = $SelectionTable(this);
  late final $CurrentTabTable currentTab = $CurrentTabTable(this);
  late final $ServerListCacheTable serverListCache = $ServerListCacheTable(
    this,
  );
  late final $SettingsTable settings = $SettingsTable(this);
  late final PingCacheDao pingCacheDao = PingCacheDao(this as AppDatabase);
  @override
  Iterable<TableInfo<Table, Object?>> get allTables =>
      allSchemaEntities.whereType<TableInfo<Table, Object?>>();
  @override
  List<DatabaseSchemaEntity> get allSchemaEntities => [
    pingCache,
    lastGood,
    selection,
    currentTab,
    serverListCache,
    settings,
  ];
}

typedef $$PingCacheTableCreateCompanionBuilder = PingCacheCompanion Function({
  required String serverId,
  required String tab,
  Value<int?> rtt,
  required bool online,
  required int ts,
  Value<bool> approx,
  Value<int> rowid,
});
typedef $$PingCacheTableUpdateCompanionBuilder = PingCacheCompanion Function({
  Value<String> serverId,
  Value<String> tab,
  Value<int?> rtt,
  Value<bool> online,
  Value<int> ts,
  Value<bool> approx,
  Value<int> rowid,
});

class $$PingCacheTableFilterComposer
    extends Composer<_$AppDatabase, $PingCacheTable> {
  $$PingCacheTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get serverId => $composableBuilder(
    column: $table.serverId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get tab => $composableBuilder(
    column: $table.tab,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get rtt => $composableBuilder(
    column: $table.rtt,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<bool> get online => $composableBuilder(
    column: $table.online,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get ts => $composableBuilder(
    column: $table.ts,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<bool> get approx => $composableBuilder(
    column: $table.approx,
    builder: (column) => ColumnFilters(column),
  );
}

class $$PingCacheTableOrderingComposer
    extends Composer<_$AppDatabase, $PingCacheTable> {
  $$PingCacheTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get serverId => $composableBuilder(
    column: $table.serverId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get tab => $composableBuilder(
    column: $table.tab,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get rtt => $composableBuilder(
    column: $table.rtt,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<bool> get online => $composableBuilder(
    column: $table.online,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get ts => $composableBuilder(
    column: $table.ts,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<bool> get approx => $composableBuilder(
    column: $table.approx,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$PingCacheTableAnnotationComposer
    extends Composer<_$AppDatabase, $PingCacheTable> {
  $$PingCacheTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get serverId =>
      $composableBuilder(column: $table.serverId, builder: (column) => column);

  GeneratedColumn<String> get tab =>
      $composableBuilder(column: $table.tab, builder: (column) => column);

  GeneratedColumn<int> get rtt =>
      $composableBuilder(column: $table.rtt, builder: (column) => column);

  GeneratedColumn<bool> get online =>
      $composableBuilder(column: $table.online, builder: (column) => column);

  GeneratedColumn<int> get ts =>
      $composableBuilder(column: $table.ts, builder: (column) => column);

  GeneratedColumn<bool> get approx =>
      $composableBuilder(column: $table.approx, builder: (column) => column);
}

class $$PingCacheTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $PingCacheTable,
          PingCacheData,
          $$PingCacheTableFilterComposer,
          $$PingCacheTableOrderingComposer,
          $$PingCacheTableAnnotationComposer,
          $$PingCacheTableCreateCompanionBuilder,
          $$PingCacheTableUpdateCompanionBuilder,
          (
            PingCacheData,
            BaseReferences<_$AppDatabase, $PingCacheTable, PingCacheData>,
          ),
          PingCacheData,
          PrefetchHooks Function()
        > {
  $$PingCacheTableTableManager(_$AppDatabase db, $PingCacheTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$PingCacheTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$PingCacheTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$PingCacheTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> serverId = const Value.absent(),
                Value<String> tab = const Value.absent(),
                Value<int?> rtt = const Value.absent(),
                Value<bool> online = const Value.absent(),
                Value<int> ts = const Value.absent(),
                Value<bool> approx = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => PingCacheCompanion(
                serverId: serverId,
                tab: tab,
                rtt: rtt,
                online: online,
                ts: ts,
                approx: approx,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String serverId,
                required String tab,
                Value<int?> rtt = const Value.absent(),
                required bool online,
                required int ts,
                Value<bool> approx = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => PingCacheCompanion.insert(
                serverId: serverId,
                tab: tab,
                rtt: rtt,
                online: online,
                ts: ts,
                approx: approx,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable<$PingCacheTable, PingCacheData>(table),
                  BaseReferences<_$AppDatabase, $PingCacheTable, PingCacheData>(
                    db,
                    table,
                    e,
                  ),
                ),
              )
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$PingCacheTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $PingCacheTable,
      PingCacheData,
      $$PingCacheTableFilterComposer,
      $$PingCacheTableOrderingComposer,
      $$PingCacheTableAnnotationComposer,
      $$PingCacheTableCreateCompanionBuilder,
      $$PingCacheTableUpdateCompanionBuilder,
      (
        PingCacheData,
        BaseReferences<_$AppDatabase, $PingCacheTable, PingCacheData>,
      ),
      PingCacheData,
      PrefetchHooks Function()
    >;
typedef $$LastGoodTableCreateCompanionBuilder = LastGoodCompanion Function({
  required String tab,
  required String serverId,
  required int ts,
  Value<int> rowid,
});
typedef $$LastGoodTableUpdateCompanionBuilder = LastGoodCompanion Function({
  Value<String> tab,
  Value<String> serverId,
  Value<int> ts,
  Value<int> rowid,
});

class $$LastGoodTableFilterComposer
    extends Composer<_$AppDatabase, $LastGoodTable> {
  $$LastGoodTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get tab => $composableBuilder(
    column: $table.tab,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get serverId => $composableBuilder(
    column: $table.serverId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get ts => $composableBuilder(
    column: $table.ts,
    builder: (column) => ColumnFilters(column),
  );
}

class $$LastGoodTableOrderingComposer
    extends Composer<_$AppDatabase, $LastGoodTable> {
  $$LastGoodTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get tab => $composableBuilder(
    column: $table.tab,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get serverId => $composableBuilder(
    column: $table.serverId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get ts => $composableBuilder(
    column: $table.ts,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$LastGoodTableAnnotationComposer
    extends Composer<_$AppDatabase, $LastGoodTable> {
  $$LastGoodTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get tab =>
      $composableBuilder(column: $table.tab, builder: (column) => column);

  GeneratedColumn<String> get serverId =>
      $composableBuilder(column: $table.serverId, builder: (column) => column);

  GeneratedColumn<int> get ts =>
      $composableBuilder(column: $table.ts, builder: (column) => column);
}

class $$LastGoodTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $LastGoodTable,
          LastGoodData,
          $$LastGoodTableFilterComposer,
          $$LastGoodTableOrderingComposer,
          $$LastGoodTableAnnotationComposer,
          $$LastGoodTableCreateCompanionBuilder,
          $$LastGoodTableUpdateCompanionBuilder,
          (
            LastGoodData,
            BaseReferences<_$AppDatabase, $LastGoodTable, LastGoodData>,
          ),
          LastGoodData,
          PrefetchHooks Function()
        > {
  $$LastGoodTableTableManager(_$AppDatabase db, $LastGoodTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$LastGoodTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$LastGoodTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$LastGoodTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> tab = const Value.absent(),
                Value<String> serverId = const Value.absent(),
                Value<int> ts = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => LastGoodCompanion(
                tab: tab,
                serverId: serverId,
                ts: ts,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String tab,
                required String serverId,
                required int ts,
                Value<int> rowid = const Value.absent(),
              }) => LastGoodCompanion.insert(
                tab: tab,
                serverId: serverId,
                ts: ts,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable<$LastGoodTable, LastGoodData>(table),
                  BaseReferences<_$AppDatabase, $LastGoodTable, LastGoodData>(
                    db,
                    table,
                    e,
                  ),
                ),
              )
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$LastGoodTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $LastGoodTable,
      LastGoodData,
      $$LastGoodTableFilterComposer,
      $$LastGoodTableOrderingComposer,
      $$LastGoodTableAnnotationComposer,
      $$LastGoodTableCreateCompanionBuilder,
      $$LastGoodTableUpdateCompanionBuilder,
      (
        LastGoodData,
        BaseReferences<_$AppDatabase, $LastGoodTable, LastGoodData>,
      ),
      LastGoodData,
      PrefetchHooks Function()
    >;
typedef $$SelectionTableCreateCompanionBuilder = SelectionCompanion Function({
  required String tab,
  required String serverId,
  Value<int> rowid,
});
typedef $$SelectionTableUpdateCompanionBuilder = SelectionCompanion Function({
  Value<String> tab,
  Value<String> serverId,
  Value<int> rowid,
});

class $$SelectionTableFilterComposer
    extends Composer<_$AppDatabase, $SelectionTable> {
  $$SelectionTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get tab => $composableBuilder(
    column: $table.tab,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get serverId => $composableBuilder(
    column: $table.serverId,
    builder: (column) => ColumnFilters(column),
  );
}

class $$SelectionTableOrderingComposer
    extends Composer<_$AppDatabase, $SelectionTable> {
  $$SelectionTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get tab => $composableBuilder(
    column: $table.tab,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get serverId => $composableBuilder(
    column: $table.serverId,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$SelectionTableAnnotationComposer
    extends Composer<_$AppDatabase, $SelectionTable> {
  $$SelectionTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get tab =>
      $composableBuilder(column: $table.tab, builder: (column) => column);

  GeneratedColumn<String> get serverId =>
      $composableBuilder(column: $table.serverId, builder: (column) => column);
}

class $$SelectionTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $SelectionTable,
          SelectionData,
          $$SelectionTableFilterComposer,
          $$SelectionTableOrderingComposer,
          $$SelectionTableAnnotationComposer,
          $$SelectionTableCreateCompanionBuilder,
          $$SelectionTableUpdateCompanionBuilder,
          (
            SelectionData,
            BaseReferences<_$AppDatabase, $SelectionTable, SelectionData>,
          ),
          SelectionData,
          PrefetchHooks Function()
        > {
  $$SelectionTableTableManager(_$AppDatabase db, $SelectionTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$SelectionTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$SelectionTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$SelectionTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback: ({
            Value<String> tab = const Value.absent(),
            Value<String> serverId = const Value.absent(),
            Value<int> rowid = const Value.absent(),
          }) => SelectionCompanion(tab: tab, serverId: serverId, rowid: rowid),
          createCompanionCallback:
              ({
                required String tab,
                required String serverId,
                Value<int> rowid = const Value.absent(),
              }) => SelectionCompanion.insert(
                tab: tab,
                serverId: serverId,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable<$SelectionTable, SelectionData>(table),
                  BaseReferences<_$AppDatabase, $SelectionTable, SelectionData>(
                    db,
                    table,
                    e,
                  ),
                ),
              )
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$SelectionTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $SelectionTable,
      SelectionData,
      $$SelectionTableFilterComposer,
      $$SelectionTableOrderingComposer,
      $$SelectionTableAnnotationComposer,
      $$SelectionTableCreateCompanionBuilder,
      $$SelectionTableUpdateCompanionBuilder,
      (
        SelectionData,
        BaseReferences<_$AppDatabase, $SelectionTable, SelectionData>,
      ),
      SelectionData,
      PrefetchHooks Function()
    >;
typedef $$CurrentTabTableCreateCompanionBuilder = CurrentTabCompanion Function({
  Value<int> id,
  required String tab,
});
typedef $$CurrentTabTableUpdateCompanionBuilder = CurrentTabCompanion Function({
  Value<int> id,
  Value<String> tab,
});

class $$CurrentTabTableFilterComposer
    extends Composer<_$AppDatabase, $CurrentTabTable> {
  $$CurrentTabTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<int> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get tab => $composableBuilder(
    column: $table.tab,
    builder: (column) => ColumnFilters(column),
  );
}

class $$CurrentTabTableOrderingComposer
    extends Composer<_$AppDatabase, $CurrentTabTable> {
  $$CurrentTabTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<int> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get tab => $composableBuilder(
    column: $table.tab,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$CurrentTabTableAnnotationComposer
    extends Composer<_$AppDatabase, $CurrentTabTable> {
  $$CurrentTabTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<int> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get tab =>
      $composableBuilder(column: $table.tab, builder: (column) => column);
}

class $$CurrentTabTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $CurrentTabTable,
          CurrentTabData,
          $$CurrentTabTableFilterComposer,
          $$CurrentTabTableOrderingComposer,
          $$CurrentTabTableAnnotationComposer,
          $$CurrentTabTableCreateCompanionBuilder,
          $$CurrentTabTableUpdateCompanionBuilder,
          (
            CurrentTabData,
            BaseReferences<_$AppDatabase, $CurrentTabTable, CurrentTabData>,
          ),
          CurrentTabData,
          PrefetchHooks Function()
        > {
  $$CurrentTabTableTableManager(_$AppDatabase db, $CurrentTabTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$CurrentTabTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$CurrentTabTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$CurrentTabTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback: ({
            Value<int> id = const Value.absent(),
            Value<String> tab = const Value.absent(),
          }) => CurrentTabCompanion(id: id, tab: tab),
          createCompanionCallback: ({
            Value<int> id = const Value.absent(),
            required String tab,
          }) => CurrentTabCompanion.insert(id: id, tab: tab),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable<$CurrentTabTable, CurrentTabData>(table),
                  BaseReferences<
                    _$AppDatabase,
                    $CurrentTabTable,
                    CurrentTabData
                  >(db, table, e),
                ),
              )
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$CurrentTabTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $CurrentTabTable,
      CurrentTabData,
      $$CurrentTabTableFilterComposer,
      $$CurrentTabTableOrderingComposer,
      $$CurrentTabTableAnnotationComposer,
      $$CurrentTabTableCreateCompanionBuilder,
      $$CurrentTabTableUpdateCompanionBuilder,
      (
        CurrentTabData,
        BaseReferences<_$AppDatabase, $CurrentTabTable, CurrentTabData>,
      ),
      CurrentTabData,
      PrefetchHooks Function()
    >;
typedef $$ServerListCacheTableCreateCompanionBuilder =
    ServerListCacheCompanion Function({
      required String tab,
      required String json,
      Value<int> rowid,
    });
typedef $$ServerListCacheTableUpdateCompanionBuilder =
    ServerListCacheCompanion Function({
      Value<String> tab,
      Value<String> json,
      Value<int> rowid,
    });

class $$ServerListCacheTableFilterComposer
    extends Composer<_$AppDatabase, $ServerListCacheTable> {
  $$ServerListCacheTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get tab => $composableBuilder(
    column: $table.tab,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get json => $composableBuilder(
    column: $table.json,
    builder: (column) => ColumnFilters(column),
  );
}

class $$ServerListCacheTableOrderingComposer
    extends Composer<_$AppDatabase, $ServerListCacheTable> {
  $$ServerListCacheTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get tab => $composableBuilder(
    column: $table.tab,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get json => $composableBuilder(
    column: $table.json,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$ServerListCacheTableAnnotationComposer
    extends Composer<_$AppDatabase, $ServerListCacheTable> {
  $$ServerListCacheTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get tab =>
      $composableBuilder(column: $table.tab, builder: (column) => column);

  GeneratedColumn<String> get json =>
      $composableBuilder(column: $table.json, builder: (column) => column);
}

class $$ServerListCacheTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $ServerListCacheTable,
          ServerListCacheData,
          $$ServerListCacheTableFilterComposer,
          $$ServerListCacheTableOrderingComposer,
          $$ServerListCacheTableAnnotationComposer,
          $$ServerListCacheTableCreateCompanionBuilder,
          $$ServerListCacheTableUpdateCompanionBuilder,
          (
            ServerListCacheData,
            BaseReferences<
              _$AppDatabase,
              $ServerListCacheTable,
              ServerListCacheData
            >,
          ),
          ServerListCacheData,
          PrefetchHooks Function()
        > {
  $$ServerListCacheTableTableManager(
    _$AppDatabase db,
    $ServerListCacheTable table,
  ) : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$ServerListCacheTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$ServerListCacheTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$ServerListCacheTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback: ({
            Value<String> tab = const Value.absent(),
            Value<String> json = const Value.absent(),
            Value<int> rowid = const Value.absent(),
          }) => ServerListCacheCompanion(tab: tab, json: json, rowid: rowid),
          createCompanionCallback:
              ({
                required String tab,
                required String json,
                Value<int> rowid = const Value.absent(),
              }) => ServerListCacheCompanion.insert(
                tab: tab,
                json: json,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable<$ServerListCacheTable, ServerListCacheData>(
                    table,
                  ),
                  BaseReferences<
                    _$AppDatabase,
                    $ServerListCacheTable,
                    ServerListCacheData
                  >(db, table, e),
                ),
              )
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$ServerListCacheTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $ServerListCacheTable,
      ServerListCacheData,
      $$ServerListCacheTableFilterComposer,
      $$ServerListCacheTableOrderingComposer,
      $$ServerListCacheTableAnnotationComposer,
      $$ServerListCacheTableCreateCompanionBuilder,
      $$ServerListCacheTableUpdateCompanionBuilder,
      (
        ServerListCacheData,
        BaseReferences<
          _$AppDatabase,
          $ServerListCacheTable,
          ServerListCacheData
        >,
      ),
      ServerListCacheData,
      PrefetchHooks Function()
    >;
typedef $$SettingsTableCreateCompanionBuilder = SettingsCompanion Function({
  Value<int> id,
  Value<bool> autoConnect,
  Value<bool> wasConnected,
});
typedef $$SettingsTableUpdateCompanionBuilder = SettingsCompanion Function({
  Value<int> id,
  Value<bool> autoConnect,
  Value<bool> wasConnected,
});

class $$SettingsTableFilterComposer
    extends Composer<_$AppDatabase, $SettingsTable> {
  $$SettingsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<int> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<bool> get autoConnect => $composableBuilder(
    column: $table.autoConnect,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<bool> get wasConnected => $composableBuilder(
    column: $table.wasConnected,
    builder: (column) => ColumnFilters(column),
  );
}

class $$SettingsTableOrderingComposer
    extends Composer<_$AppDatabase, $SettingsTable> {
  $$SettingsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<int> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<bool> get autoConnect => $composableBuilder(
    column: $table.autoConnect,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<bool> get wasConnected => $composableBuilder(
    column: $table.wasConnected,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$SettingsTableAnnotationComposer
    extends Composer<_$AppDatabase, $SettingsTable> {
  $$SettingsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<int> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<bool> get autoConnect => $composableBuilder(
    column: $table.autoConnect,
    builder: (column) => column,
  );

  GeneratedColumn<bool> get wasConnected => $composableBuilder(
    column: $table.wasConnected,
    builder: (column) => column,
  );
}

class $$SettingsTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $SettingsTable,
          Setting,
          $$SettingsTableFilterComposer,
          $$SettingsTableOrderingComposer,
          $$SettingsTableAnnotationComposer,
          $$SettingsTableCreateCompanionBuilder,
          $$SettingsTableUpdateCompanionBuilder,
          (Setting, BaseReferences<_$AppDatabase, $SettingsTable, Setting>),
          Setting,
          PrefetchHooks Function()
        > {
  $$SettingsTableTableManager(_$AppDatabase db, $SettingsTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$SettingsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$SettingsTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$SettingsTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<int> id = const Value.absent(),
                Value<bool> autoConnect = const Value.absent(),
                Value<bool> wasConnected = const Value.absent(),
              }) => SettingsCompanion(
                id: id,
                autoConnect: autoConnect,
                wasConnected: wasConnected,
              ),
          createCompanionCallback:
              ({
                Value<int> id = const Value.absent(),
                Value<bool> autoConnect = const Value.absent(),
                Value<bool> wasConnected = const Value.absent(),
              }) => SettingsCompanion.insert(
                id: id,
                autoConnect: autoConnect,
                wasConnected: wasConnected,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable<$SettingsTable, Setting>(table),
                  BaseReferences<_$AppDatabase, $SettingsTable, Setting>(
                    db,
                    table,
                    e,
                  ),
                ),
              )
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$SettingsTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $SettingsTable,
      Setting,
      $$SettingsTableFilterComposer,
      $$SettingsTableOrderingComposer,
      $$SettingsTableAnnotationComposer,
      $$SettingsTableCreateCompanionBuilder,
      $$SettingsTableUpdateCompanionBuilder,
      (Setting, BaseReferences<_$AppDatabase, $SettingsTable, Setting>),
      Setting,
      PrefetchHooks Function()
    >;

class $AppDatabaseManager {
  final _$AppDatabase _db;
  $AppDatabaseManager(this._db);
  $$PingCacheTableTableManager get pingCache =>
      $$PingCacheTableTableManager(_db, _db.pingCache);
  $$LastGoodTableTableManager get lastGood =>
      $$LastGoodTableTableManager(_db, _db.lastGood);
  $$SelectionTableTableManager get selection =>
      $$SelectionTableTableManager(_db, _db.selection);
  $$CurrentTabTableTableManager get currentTab =>
      $$CurrentTabTableTableManager(_db, _db.currentTab);
  $$ServerListCacheTableTableManager get serverListCache =>
      $$ServerListCacheTableTableManager(_db, _db.serverListCache);
  $$SettingsTableTableManager get settings =>
      $$SettingsTableTableManager(_db, _db.settings);
}
