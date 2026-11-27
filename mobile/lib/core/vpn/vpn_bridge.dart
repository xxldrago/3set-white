import "dart:async";

import "package:flutter/services.dart";
import "package:flutter_riverpod/flutter_riverpod.dart";

import "../../utils/logger.dart";
import "../ping/libbox_core.dart";

/// Name of the single Flutter ↔ Kotlin VPN method channel.
const String vpnMethodChannel = "com.u3set.mobile/vpn";

/// Stable, safe error code raised by the VPN bridge.
///
/// The raw platform message is deliberately discarded: it may contain a TUN
/// fd, configuration fragments or other provider text. Only a small set of
/// codes is ever surfaced to the connection FSM (D-19).
class VpnBridgeException implements Exception {
  /// Creates an exception carrying one stable [code].
  const VpnBridgeException(this.code);

  /// Stable machine-readable code, e.g. `permission_denied` or `revoked`.
  final String code;

  @override
  String toString() => "VpnBridgeException: $code";
}

/// An asynchronous notification from the native side.
class VpnBridgeEvent {
  /// Creates an event with a stable [code].
  const VpnBridgeEvent(this.code);

  /// `revoked` (OS consent removed), `disconnect` (notification action) or
  /// `core_stopped` (native tunnel died without a user-initiated stop).
  final String code;
}

/// Structured log sink for the bridge; testable without printing secrets.
typedef VpnBridgeLog = void Function(
  String event,
  Map<String, Object?> fields,
);

/// Minimal libbox surface used by the VPN bridge, injectable in unit tests.
abstract interface class VpnCore {
  /// Hands a real OS TUN [fd] and the ready config to the shim.
  Future<void> startWithTun(int fd, String configJson);

  /// Stops the shim; callers await this before entering FSM `idle`.
  Future<void> stop();

  /// Reads live traffic counters; zero when unavailable.
  Future<TrafficSnapshot> traffic();
}

/// Adapts the serialized 20-02 singleton to [VpnCore].
class LibboxVpnCore implements VpnCore {
  /// Creates an adapter over [core], defaulting to the process singleton.
  LibboxVpnCore([LibboxPingCore? core])
      : _core = core ?? LibboxPingCore.instance;

  final LibboxPingCore _core;

  @override
  Future<void> startWithTun(int fd, String configJson) =>
      _core.startWithTun(fd, configJson);

  @override
  Future<void> stop() => _core.stop();

  @override
  Future<TrafficSnapshot> traffic() => _core.traffic();
}

/// Minimal method-channel surface, injectable so tests need no Flutter engine.
abstract interface class VpnChannel {
  /// Invokes a native method and returns its opaque result.
  Future<Object?> invoke(String method, [Object? arguments]);

  /// Installs (or clears, with `null`) the native → Dart event handler.
  void setCallHandler(
    Future<Object?> Function(String method, Object? arguments)? handler,
  );
}

/// Production [VpnChannel] backed by Flutter's [MethodChannel].
class MethodVpnChannel implements VpnChannel {
  /// Creates a channel adapter; the name is fixed by [vpnMethodChannel].
  MethodVpnChannel([MethodChannel? channel])
      : _channel = channel ?? const MethodChannel(vpnMethodChannel);

  final MethodChannel _channel;

  @override
  Future<Object?> invoke(String method, [Object? arguments]) =>
      _channel.invokeMethod<Object?>(method, arguments);

  @override
  void setCallHandler(
    Future<Object?> Function(String method, Object? arguments)? handler,
  ) {
    _channel.setMethodCallHandler(
      handler == null
          ? null
          : (MethodCall call) => handler(call.method, call.arguments),
    );
  }
}

/// Platform facade used by the connection FSM (D-06/D-10/D-11/D-14).
///
/// The TUN fd is an opaque integer: it is handed straight from the platform
/// reply to [VpnCore.startWithTun] and is never stored, serialized or logged.
abstract interface class VpnBridge {
  /// Completes when the OS has granted VPN consent; throws `permission_denied`.
  Future<void> prepare();

  /// Starts the tunnel with the backend-built [configJson].
  Future<void> start(String configJson);

  /// Stops the shim *then* the platform; awaited before the FSM reaches idle.
  Future<void> stop();

  /// Reads live traffic counters from libbox.
  Future<TrafficSnapshot> traffic();

  /// Protects one native outbound socket from the tunnel's own routes.
  Future<bool> protect(int fd);

  /// Native → FSM events: `revoked`, `disconnect` and `core_stopped`.
  Stream<VpnBridgeEvent> get events;

  /// Releases the channel handler and the event stream.
  void dispose();
}

/// [VpnBridge] implementation over `com.u3set.mobile/vpn`.
class MethodChannelVpnBridge implements VpnBridge {
  /// Creates a bridge with injectable platform/core/log seams for tests.
  MethodChannelVpnBridge({
    VpnChannel? channel,
    VpnCore? core,
    VpnBridgeLog? log,
  })  : _channel = channel ?? MethodVpnChannel(),
        _core = core ?? LibboxVpnCore(),
        _log = log ?? _structuredLog {
    _channel.setCallHandler(_onNativeEvent);
  }

  final VpnChannel _channel;
  final VpnCore _core;
  final VpnBridgeLog _log;
  final StreamController<VpnBridgeEvent> _events =
      StreamController<VpnBridgeEvent>.broadcast();

  @override
  Stream<VpnBridgeEvent> get events => _events.stream;

  Future<Object?> _onNativeEvent(String method, Object? arguments) async {
    switch (method) {
      case "onRevoked":
        _events.add(const VpnBridgeEvent("revoked"));
      case "onDisconnect":
        _events.add(const VpnBridgeEvent("disconnect"));
      case "onCoreStopped":
        // Real native service-death/status-loss signal (D-18). It is the ONLY
        // producer of the `core_stopped` FSM input; never simulated in Dart.
        _events.add(const VpnBridgeEvent("core_stopped"));
    }
    return null;
  }

  @override
  Future<void> prepare() async {
    final granted = await _invoke("prepare");
    if (granted != true) {
      throw const VpnBridgeException("permission_denied");
    }
    _log("prepare", <String, Object?>{"granted": true});
  }

  @override
  Future<void> start(String configJson) async {
    try {
      final response = await _channel.invoke("start");
      if (response is! Map<Object?, Object?> || response["fd"] is! int) {
        throw const VpnBridgeException("config_invalid");
      }
      // The fd is consumed immediately and never persisted or logged.
      final fd = response["fd"]! as int;
      await _core.startWithTun(fd, configJson);
      _log("start", <String, Object?>{"result": "tunnel_up"});
    } on PlatformException catch (error) {
      throw VpnBridgeException(_safeCode(error.code));
    }
  }

  @override
  Future<void> stop() async {
    try {
      // Stop the core first: closing the fd while libbox still runs would
      // leave an orphan tunnel (D-14). Only then retire the platform service.
      await _core.stop();
      await _channel.invoke("stop");
      _log("stop", <String, Object?>{"result": "tunnel_down"});
    } on PlatformException catch (error) {
      throw VpnBridgeException(_safeCode(error.code));
    }
  }

  @override
  Future<TrafficSnapshot> traffic() => _core.traffic();

  @override
  Future<bool> protect(int fd) async {
    final result = await _invoke("protect", <String, Object?>{"fd": fd});
    return result == true;
  }

  @override
  void dispose() {
    _channel.setCallHandler(null);
    _events.close();
  }

  Future<Object?> _invoke(String method, [Object? arguments]) async {
    try {
      return await _channel.invoke(method, arguments);
    } on PlatformException catch (error) {
      throw VpnBridgeException(_safeCode(error.code));
    }
  }

  /// Only a fixed vocabulary crosses into the FSM; no raw platform text.
  String _safeCode(String code) {
    const allowed = <String>{
      "permission_denied",
      "revoked",
      "core_stopped",
      "config_invalid",
      "unreachable",
    };
    return allowed.contains(code) ? code : "config_invalid";
  }

  static void _structuredLog(String event, Map<String, Object?> fields) {
    createLogger("VpnBridge").logStructured(
      LogLevel.info,
      event,
      fields,
    );
  }
}

/// Injectable bridge provider used by the connection FSM (plan 05).
final Provider<VpnBridge> vpnBridgeProvider = Provider<VpnBridge>((ref) {
  final bridge = MethodChannelVpnBridge();
  ref.onDispose(bridge.dispose);
  return bridge;
});
