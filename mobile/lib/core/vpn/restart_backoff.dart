import "dart:async";

import "package:flutter_riverpod/flutter_riverpod.dart";

/// Controlled timer factory: tests inject a fake so no real delay, `sleep` or
/// wall-clock arithmetic is needed (D-18; no simulation of crashes).
typedef BackoffTimerFactory = Timer Function(
  Duration duration,
  void Function() callback,
);

/// Bounded restart backoff for a native core stop (D-18/REQ-CONN-09).
///
/// Delays are EXACTLY 1 s, 2 s, 4 s with at most three scheduled retries.
/// [reset] runs on every successful `connected`; [cancel] kills a pending
/// retry on user disconnect/logout/provider disposal.
class RestartBackoff {
  /// Creates a backoff with an injectable timer factory.
  RestartBackoff({BackoffTimerFactory? timerFactory})
      : _timerFactory = timerFactory ?? _realTimer;

  static Timer _realTimer(Duration duration, void Function() callback) =>
      Timer(duration, callback);

  /// The locked retry delays, in order.
  static const List<Duration> retryDelays = <Duration>[
    Duration(seconds: 1),
    Duration(seconds: 2),
    Duration(seconds: 4),
  ];

  final BackoffTimerFactory _timerFactory;
  Timer? _timer;
  int _attempts = 0;

  /// Number of retry timers scheduled since the last [reset].
  int get attempts => _attempts;

  /// Whether a retry timer is currently pending.
  bool get isScheduled => _timer != null;

  /// Schedules the next retry, or reports exhaustion after the third failure.
  ///
  /// Returns `true` when a retry was scheduled, `false` on exhaustion.
  bool schedule({
    required void Function() onRetry,
    required void Function() onExhausted,
  }) {
    cancel();
    if (_attempts >= retryDelays.length) {
      onExhausted();
      return false;
    }
    final delay = retryDelays[_attempts];
    _attempts++;
    _timer = _timerFactory(delay, () {
      _timer = null;
      onRetry();
    });
    return true;
  }

  /// Clears the counter after a successful `connected` and cancels any timer.
  void reset() {
    cancel();
    _attempts = 0;
  }

  /// Cancels a pending retry without touching the counter.
  void cancel() {
    _timer?.cancel();
    _timer = null;
  }

  /// Disposal hook: no timer may outlive the provider.
  void dispose() => cancel();
}

/// Injectable backoff, disposed with its provider (D-18).
final Provider<RestartBackoff> restartBackoffProvider =
    Provider<RestartBackoff>((ref) {
  final backoff = RestartBackoff();
  ref.onDispose(backoff.dispose);
  return backoff;
});
