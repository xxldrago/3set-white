import "package:freezed_annotation/freezed_annotation.dart";

import "package:mobile/core/ping/ping_repository.dart";

part "server.freezed.dart";
part "server.g.dart";

/// Server pool identifier (D-01/D-14).
///
/// This is the repurposed replacement for the old bottom-navigation index; it
/// is persisted in Drift `current_tab` by `features/home/providers.dart`.
enum PoolTab {
  /// Ordinary VPN servers.
  simple,

  /// Servers from the whitelist-bypass pool.
  whitelist;

  /// Parses a Drift/backend `tab` value, defaulting to [simple].
  static PoolTab fromWire(String value) =>
      value == "whitelist" ? PoolTab.whitelist : PoolTab.simple;

  /// Stable wire value stored in Drift and parsed from backend JSON.
  String get wireName => name;
}

/// Metadata-only server card from `GET /api/mobile/servers`.
///
/// The `outbound` map is machine-only input for libbox urltest; it is never
/// rendered and never logged. There is deliberately no `load` field (D-04)
/// and no raw subscription/share link (D-05).
@freezed
abstract class Server with _$Server {
  /// Creates a server card.
  const factory Server({
    required String id,
    required String name,
    required String city,
    required String cc,
    required String flag,
    required String proto,
    String? sni,
    required PoolTab tab,
    required String host,
    required int port,
    required String protocol,
    required Map<String, dynamic> outbound,
  }) = _Server;

  /// Parses one backend server card.
  factory Server.fromJson(Map<String, dynamic> json) => _$ServerFromJson(json);
}

/// Metadata for the active key that gates server access (D-20/D-21).
@freezed
abstract class ServerKey with _$ServerKey {
  /// Creates key metadata.
  const factory ServerKey({
    required bool active,
    required String keyId,
    required bool isTrial,
    @JsonKey(name: "remainingDays") int? remainingDays,
    @JsonKey(name: "expireAt") String? expireAt,
  }) = _ServerKey;

  /// Parses backend key metadata.
  factory ServerKey.fromJson(Map<String, dynamic> json) =>
      _$ServerKeyFromJson(json);
}

/// Response body of `GET /api/mobile/servers`.
///
/// `error`/`notice`/`stale` carry machine-readable degradation information to
/// the phase-19 UI layer; no `load` and no secrets are present.
@freezed
abstract class ServerPools with _$ServerPools {
  /// Creates a pair of pools.
  const factory ServerPools({
    @Default(<Server>[]) List<Server> simple,
    @Default(<Server>[]) List<Server> whitelist,
    ServerKey? key,
    String? error,
    String? notice,
    @Default(false) bool stale,
  }) = _ServerPools;

  /// Parses the backend response (also used for the offline Drift cache).
  factory ServerPools.fromJson(Map<String, dynamic> json) =>
      _$ServerPoolsFromJson(json);
}

/// Convenience accessors on the pool response.
extension ServerPoolsX on ServerPools {
  /// Whether ping and selection are allowed for this response.
  ///
  /// A missing/inactive key or a backend `no_active_key` error blocks the
  /// entire flow (D-21); no ping is attempted in that state.
  bool get hasActiveKey => error != "no_active_key" && key?.active == true;

  /// Servers belonging to [tab].
  List<Server> serversFor(PoolTab tab) =>
      tab == PoolTab.whitelist ? whitelist : simple;
}

/// Maps a metadata card onto the real ping surface owned by 19-03.
extension ServerPingTargetX on Server {
  /// The stable, non-secret target used by `PingRepository`.
  PingTarget get pingTarget => PingTarget(
        id: id,
        host: host,
        port: port.toString(),
        protocol: protocol,
        outbound: outbound,
        tab: tab.wireName,
      );
}
