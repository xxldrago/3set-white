import "dart:async";
import "dart:convert";
import "dart:ffi" as ffi;
import "dart:io";

import "package:ffi/ffi.dart";

import "generated/libbox_bindings.dart";

/// Platform socket-protection callback installed by the VPN bridge (WR-02).
/// It is null outside an active tunnel; the fd is opaque and is never logged.
bool Function(int)? _platformProtect;

int _protectFromNative(int fd) {
  final protect = _platformProtect;
  if (protect == null) return 0;
  try {
    return protect(fd) ? 1 : 0;
  } on Object {
    return 0;
  }
}

/// The C ABI pointer handed to the shim. Failing protection is reported as 0
/// so sing-box fails the dial instead of routing it through our own tunnel.
final ffi.Pointer<ffi.NativeFunction<ffi.Int32 Function(ffi.Int32)>>
    _protectCallbackPointer =
    ffi.Pointer.fromFunction<ffi.Int32 Function(ffi.Int32)>(
      _protectFromNative,
      0,
    );

/// Test-only view of the installed callback; no FFI and no platform call.
int invokeProtectCallbackForTesting(int fd) => _protectFromNative(fd);

/// Thrown when the native libbox shim cannot be loaded or used.
class LibboxUnavailableException implements Exception {
  /// Creates an exception describing why libbox is unavailable.
  const LibboxUnavailableException(this.message);

  /// Human-readable description of the failure.
  final String message;

  @override
  String toString() => "LibboxUnavailableException: $message";
}

/// Thrown when sing-box rejects the generated configuration.
///
/// The raw libbox error is deliberately discarded: it can echo configuration
/// fragments, and configuration contains outbound secrets.
class LibboxConfigException implements Exception {
  /// Creates an exception with a safe, generic [message].
  const LibboxConfigException(this.message);

  /// Human-readable description of the failure.
  final String message;

  @override
  String toString() => "LibboxConfigException: $message";
}

/// Result of one libbox URLTest against a real outbound.
class LibboxUrltestResult {
  /// Creates a URLTest result.
  const LibboxUrltestResult({required this.online, required this.rttMs});

  /// Whether the outbound answered the `generate_204` probe.
  final bool online;

  /// Round-trip time in milliseconds; zero when offline or without history.
  final int rttMs;
}

/// Live traffic totals reported by libbox for the current tunnel session.
///
/// Values come from libbox `StatusMessage` (`DownlinkTotal` / `UplinkTotal` /
/// `TrafficAvailable`) through `libbox_traffic()`. No value is simulated.
class TrafficSnapshot {
  /// Creates a snapshot from live libbox counters.
  const TrafficSnapshot({
    required this.down,
    required this.up,
    required this.available,
  });

  /// Zero snapshot used when libbox has no live counters.
  const TrafficSnapshot.zero() : down = 0, up = 0, available = false;

  /// Total downloaded bytes for the session.
  final int down;

  /// Total uploaded bytes for the session.
  final int up;

  /// Whether libbox reported live counters for this session.
  final bool available;

  @override
  String toString() =>
      "TrafficSnapshot(down: $down, up: $up, available: $available)";
}

/// Decodes the raw `libbox_traffic()` JSON into a safe [TrafficSnapshot].
///
/// `available:false`, malformed payloads and non-int counters yield zeros so
/// no fabricated bytes ever reach the Connected Panel (plan 07).
TrafficSnapshot decodeTrafficSnapshot(String raw) {
  if (raw.isEmpty) {
    return const TrafficSnapshot.zero();
  }
  final Object? decoded;
  try {
    decoded = jsonDecode(raw);
  } on Object {
    return const TrafficSnapshot.zero();
  }
  if (decoded is! Map<String, dynamic> || decoded["available"] != true) {
    return const TrafficSnapshot.zero();
  }
  final down = decoded["down"];
  final up = decoded["up"];
  return TrafficSnapshot(
    down: down is int ? down : 0,
    up: up is int ? up : 0,
    available: true,
  );
}

/// Minimal native seam for [LibboxPingCore.traffic], injectable in unit tests.
/// Production never sets it; the real binding reads `libbox_traffic()`.
abstract class LibboxTrafficBridge {
  /// Creates a native-seam bridge.
  const LibboxTrafficBridge();

  /// Returns the raw JSON string the native shim would return.
  Future<String> readTrafficJson();
}

/// Singleton wrapper around the C ABI of our own sing-box libbox shim.
///
/// [urltest] triggers a real `CommandClient.URLTest(outboundTag)`; the shim
/// captures the asynchronous `WriteGroups` result. No ICMP, no simulation,
/// no RTT-from-return-value. Configuration and secrets are never logged.
class LibboxPingCore {
  LibboxPingCore._();

  /// Process-wide singleton.
  static final LibboxPingCore instance = LibboxPingCore._();

  LibboxBindings? _bindings;
  Future<void>? _initFuture;
  bool _started = false;
  Future<void> _tail = Future<void>.value();

  /// Test-only traffic bridge: injects raw JSON without loading the shared
  /// library. Always `null` in production paths.
  LibboxTrafficBridge? trafficBridgeForTesting;

  /// Whether [init] completed successfully.
  bool get isAvailable => _bindings != null;

  /// Whether a no-TUN sing-box service is currently running.
  bool get isStarted => _started;

  /// Installs the native → platform socket-protection callback (WR-02).
  ///
  /// The shim calls it from sing-box's dialer control hook so outbound sockets
  /// reach VpnService.protect() before our full TUN routes can capture them.
  void installProtectHandler(bool Function(int) protect) {
    _platformProtect = protect;
    _registerProtectHandler();
  }

  void _registerProtectHandler() {
    final bindings = _bindings;
    if (bindings == null || _platformProtect == null) return;
    bindings.libbox_register_protect_handler(
      _protectCallbackPointer.cast<ffi.Void>(),
    );
  }

  /// Loads the native library and runs `libbox_setup` once.
  ///
  /// Repeated calls share the same future; a failed init can be retried.
  Future<void> init() async {
    final pending = _initFuture;
    if (pending != null) {
      return pending;
    }
    final completer = Completer<void>();
    _initFuture = completer.future;
    try {
      await _performInit();
      completer.complete();
    } on Object catch (error, stack) {
      // Never report availability after a failed setup (WR-07).
      _bindings = null;
      _initFuture = null;
      completer.completeError(error, stack);
    }
    return completer.future;
  }

  Future<void> _performInit() async {
    final bindings = LibboxBindings(_openLibrary());

    final base = Directory.systemTemp.path;
    final basePath = "$base/libbox".toNativeUtf8();
    final workingPath = "$base/libbox/work".toNativeUtf8();
    final tempPath = "$base/libbox/temp".toNativeUtf8();
    try {
      final error = _takeString(
        bindings.libbox_setup(
          basePath.cast<ffi.Char>(),
          workingPath.cast<ffi.Char>(),
          tempPath.cast<ffi.Char>(),
        ),
        bindings,
      );
      if (error.isNotEmpty) {
        throw const LibboxUnavailableException("libbox setup failed");
      }
      // Publish bindings only after setup succeeded (WR-07).
      _bindings = bindings;
    } finally {
      calloc
        ..free(basePath)
        ..free(workingPath)
        ..free(tempPath);
    }
  }

  ffi.DynamicLibrary _openLibrary() {
    try {
      if (Platform.isAndroid) {
        return ffi.DynamicLibrary.open("libboxshim.so");
      }
      if (Platform.isIOS || Platform.isMacOS) {
        return ffi.DynamicLibrary.process();
      }
    } on Object catch (_) {
      throw const LibboxUnavailableException("native libbox shim unavailable");
    }
    throw const LibboxUnavailableException("unsupported platform");
  }

  /// Validates and starts the no-TUN sing-box service with [configJson].
  ///
  /// The configuration is never logged, returned or exposed on error.
  Future<void> start(String configJson) => _serialized<void>(() async {
    // Start shares the shim's single command client with urltest/stop.
    final bindings = _bindings;
    if (bindings == null) {
      throw const LibboxUnavailableException("call init() first");
    }
    final configPtr = configJson.toNativeUtf8();
    try {
      final checkError = _takeString(
        bindings.libbox_check_config(configPtr.cast<ffi.Char>()),
        bindings,
      );
      if (checkError.isNotEmpty) {
        throw const LibboxConfigException(
          "sing-box rejected the ping configuration",
        );
      }
      final startError = _takeString(
        bindings.libbox_start(configPtr.cast<ffi.Char>()),
        bindings,
      );
      if (startError.isNotEmpty) {
        throw const LibboxConfigException("sing-box service failed to start");
      }
      _started = true;
    } finally {
      calloc.free(configPtr);
    }
  });

  /// Validates and starts the TUN sing-box service with the native-owned [fd].
  ///
  /// The fd is never stored in Dart state or logged; libbox dups it internally.
  /// Only a real OS TUN fd from the platform tunnel flow may be passed here —
  /// a non-TUN fd aborts the process natively and cannot be caught in Dart.
  Future<void> startWithTun(int fd, String configJson) => _serialized<void>(
    () async {
      final bindings = _bindings;
      if (bindings == null) {
        throw const LibboxUnavailableException("call init() first");
      }
      // Registration may have happened before init(); re-arm it now that the
      // native library is available so every dial in this session is protected.
      _registerProtectHandler();
      final configPtr = configJson.toNativeUtf8();
      try {
        final checkError = _takeString(
          bindings.libbox_check_config(configPtr.cast<ffi.Char>()),
          bindings,
        );
        if (checkError.isNotEmpty) {
          throw const LibboxConfigException(
            "sing-box rejected the tunnel configuration",
          );
        }
        final startError = _takeString(
          bindings.libbox_start_with_tun(fd, configPtr.cast<ffi.Char>()),
          bindings,
        );
        if (startError.isNotEmpty) {
          throw const LibboxConfigException("sing-box tunnel failed to start");
        }
        _started = true;
      } finally {
        calloc.free(configPtr);
      }
    },
  );

  /// Stops the sing-box service and closes the command client.
  Future<void> stop() async {
    final bindings = _bindings;
    if (bindings == null) {
      return;
    }
    await _serialized<void>(() async {
      bindings.libbox_stop();
      _started = false;
    });
  }

  /// Triggers one real URLTest for outbound [tag] and reads its async RTT.
  ///
  /// Calls are serialized because the shim owns a single command client.
  Future<LibboxUrltestResult> urltest(
    String tag, {
    Duration timeout = const Duration(seconds: 2),
  }) {
    final bindings = _bindings;
    if (bindings == null || !_started) {
      return Future<LibboxUrltestResult>.error(
        const LibboxUnavailableException("libbox is not started"),
      );
    }
    return _serialized<LibboxUrltestResult>(() async {
      final tagPtr = tag.toNativeUtf8();
      try {
        final code = bindings.urltest(
          tagPtr.cast<ffi.Char>(),
          timeout.inMilliseconds,
        );
        if (code < 0) {
          throw const LibboxUnavailableException("urltest trigger failed");
        }
        final raw = _takeString(
          bindings.urltest_take(tagPtr.cast<ffi.Char>()),
          bindings,
        );
        if (raw.isEmpty) {
          return const LibboxUrltestResult(online: false, rttMs: 0);
        }
        final decoded = jsonDecode(raw);
        if (decoded is! Map<String, dynamic>) {
          return const LibboxUrltestResult(online: false, rttMs: 0);
        }
        final online = decoded["online"] == true;
        final value = decoded["rttMs"];
        return LibboxUrltestResult(
          online: online,
          rttMs: online && value is int ? value : 0,
        );
      } finally {
        calloc.free(tagPtr);
      }
    });
  }

  /// Reads live traffic counters from libbox, serialized with native calls.
  ///
  /// A missing/unavailable counter yields zeros rather than fabricated bytes.
  Future<TrafficSnapshot> traffic() {
    final bindings = _bindings;
    final bridge = trafficBridgeForTesting;
    if (bindings == null && bridge == null) {
      return Future<TrafficSnapshot>.error(
        const LibboxUnavailableException("call init() first"),
      );
    }
    return _serialized<TrafficSnapshot>(() async {
      final raw = bridge != null
          ? await bridge.readTrafficJson()
          : _takeString(bindings!.libbox_traffic(), bindings);
      return decodeTrafficSnapshot(raw);
    });
  }

  /// Stops the service and releases native references.
  Future<void> dispose() async {
    await stop();
    _bindings = null;
    _initFuture = null;
    trafficBridgeForTesting = null;
  }

  Future<T> _serialized<T>(Future<T> Function() body) {
    final previous = _tail;
    final completer = Completer<void>();
    _tail = completer.future;
    return previous.then<T>((void value) async {
      try {
        return await body();
      } finally {
        completer.complete();
      }
    });
  }

  String _takeString(
    ffi.Pointer<ffi.Char> pointer, [
    LibboxBindings? bindings,
  ]) {
    if (pointer == ffi.nullptr) {
      return "";
    }
    final value = pointer.cast<Utf8>().toDartString();
    // Use the bindings that produced the string: during init `_bindings` is
    // intentionally still null until setup succeeds (WR-07).
    (bindings ?? _bindings)!.libbox_free_string(pointer);
    return value;
  }
}
