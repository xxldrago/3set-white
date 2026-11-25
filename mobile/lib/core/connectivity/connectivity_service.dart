import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Network connectivity status.
enum ConnectivityStatus {
  /// Connected to internet (WiFi, mobile, ethernet).
  connected,
  /// No internet connection.
  disconnected,
  /// Connectivity state is being determined.
  checking,
}

/// Riverpod provider for ConnectivityService.
/// Wraps Connectivity().onConnectivityChanged and exposes a distinct stream
/// of connectivity changes for use by ping cache invalidation (Phase 19).
final connectivityServiceProvider = Provider<ConnectivityService>((ref) {
  final service = ConnectivityService();
  ref.onDispose(() => service.dispose());
  return service;
});

/// Service that monitors network connectivity changes.
/// Exposes a distinct stream of [ConnectivityResult] events.
class ConnectivityService {
  ConnectivityService() : _connectivity = Connectivity() {
    _streamSubscription = _connectivity.onConnectivityChanged
        .distinct()
        .listen(_onConnectivityChanged);
    _updateStatus();
  }

  /// Internal constructor for testing with mocked Connectivity.
  ConnectivityService.internal(Connectivity connectivity) : _connectivity = connectivity {
    _streamSubscription = _connectivity.onConnectivityChanged
        .distinct()
        .listen(_onConnectivityChanged);
    _updateStatus();
  }

  final Connectivity _connectivity;
  late final StreamSubscription<List<ConnectivityResult>> _streamSubscription;

  /// Controller for broadcasting distinct connectivity changes.
  final _controller = StreamController<List<ConnectivityResult>>.broadcast();

  /// Current connectivity status.
  ConnectivityStatus _currentStatus = ConnectivityStatus.checking;
  ConnectivityStatus get currentStatus => _currentStatus;

  /// Stream of distinct connectivity changes.
  /// Emits only when connectivity actually changes (no duplicates).
  Stream<List<ConnectivityResult>> get connectivityStream => _controller.stream;

  void _onConnectivityChanged(List<ConnectivityResult> results) {
    final hasConnection = results.any((r) => r != ConnectivityResult.none);
    _currentStatus = hasConnection
        ? ConnectivityStatus.connected
        : ConnectivityStatus.disconnected;
    _controller.add(results);
  }

  /// Updates the current connectivity status by checking actively.
  Future<void> _updateStatus() async {
    try {
      final results = await _connectivity.checkConnectivity();
      final hasConnection = results.any((r) => r != ConnectivityResult.none);
      _currentStatus = hasConnection
          ? ConnectivityStatus.connected
          : ConnectivityStatus.disconnected;
      _controller.add(results);
    } catch (e) {
      _currentStatus = ConnectivityStatus.disconnected;
    }
  }

  /// Checks if currently connected to the internet.
  Future<bool> isConnected() async {
    await _updateStatus();
    return _currentStatus == ConnectivityStatus.connected;
  }

  /// Waits for internet connection with timeout.
  ///
  /// Returns true if connected within timeout, false otherwise.
  Future<bool> waitForConnection({
    Duration timeout = const Duration(seconds: 30),
    Duration checkInterval = const Duration(seconds: 2),
  }) async {
    if (_currentStatus == ConnectivityStatus.connected) {
      return true;
    }

    final completer = Completer<bool>();
    late StreamSubscription<List<ConnectivityResult>> sub;

    sub = connectivityStream.listen((results) {
      final hasConnection = results.any((r) => r != ConnectivityResult.none);
      if (hasConnection && !completer.isCompleted) {
        completer.complete(true);
        sub.cancel();
      }
    });

    // Timeout handler
    Timer(timeout, () {
      if (!completer.isCompleted) {
        completer.complete(false);
        sub.cancel();
      }
    });

    return completer.future;
  }

  /// Disposes the stream subscription and closes the controller.
  void dispose() {
    _streamSubscription.cancel();
    _controller.close();
  }
}