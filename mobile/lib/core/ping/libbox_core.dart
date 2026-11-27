import "dart:async";
import "dart:convert";
import "dart:ffi" as ffi;
import "dart:io";

import "package:ffi/ffi.dart";
import "generated/libbox_bindings.dart";

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
  const LibboxUrltestResult({
    required this.online,
    required this.rttMs,
  });

  /// Whether the outbound answered the `generate_204` probe.
  final bool online;

  /// Round-trip time in milliseconds; zero when offline or without history.
  final int rttMs;
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

  /// Whether [init] completed successfully.
  bool get isAvailable => _bindings != null;

  /// Whether a no-TUN sing-box service is currently running.
  bool get isStarted => _started;

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
            throw const LibboxConfigException(
              "sing-box service failed to start",
            );
          }
          _started = true;
        } finally {
          calloc.free(configPtr);
        }
      });

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

  /// Stops the service and releases native references.
  Future<void> dispose() async {
    await stop();
    _bindings = null;
    _initFuture = null;
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

  String _takeString(ffi.Pointer<ffi.Char> pointer, [LibboxBindings? bindings]) {
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
