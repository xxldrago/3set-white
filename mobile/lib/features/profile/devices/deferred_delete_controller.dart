import "dart:async";

/// Frozen notice for a repeated delete while one removal is already pending
/// or in flight. No provider text or transport wording ever reaches the UI.
const String deviceAlreadyPendingNotice = "Устройство уже отключается";

/// Frozen notice when a fired DELETE fails at the BFF. No transport wording
/// ever reaches the UI.
const String deviceDeleteFailedNotice = "Не удалось отключить устройство";

/// Five-second deferred DELETE with a cancellable timer (D-06, T-22-04).
///
/// Invariants:
/// - the provider is called ONLY by a fired timer, never by a tap;
/// - «Вернуть» cancels the timer and bumps the generation BEFORE any call;
/// - a repeated tap, a double tick or a concurrent second removal cannot issue
///   a second provider call;
/// - nothing ever reinserts a row after a real delete (the provider has no
///   restore operation — a refresh simply re-reads the BFF).
class DeferredDeleteController {
  DeferredDeleteController({
    required Future<void> Function(String token) onDelete,
    this.window = const Duration(seconds: 5),
  }) : _onDelete = onDelete;

  final Future<void> Function(String token) _onDelete;

  /// The locked undo window.
  final Duration window;

  Timer? _timer;
  String? _pendingToken;
  bool _inFlight = false;
  int _generation = 0;
  final Set<String> _pendingTokens = <String>{};

  /// Tokens whose DELETE is still cancellable. Defensive copy: consumers can
  /// read it on a rebuild without being able to mutate controller state.
  Set<String> get pendingTokens => Set<String>.unmodifiable(_pendingTokens);

  /// Whether this token is still inside its undo window.
  bool isPending(String token) => _pendingTokens.contains(token);

  /// Starts one undo window. Returns false when a removal is already pending
  /// or in flight — the caller shows the same stable Russian notice.
  bool remove(String token) {
    if (_timer != null || _inFlight) return false;

    _pendingTokens
      ..clear()
      ..add(token);
    _pendingToken = token;
    final generation = ++_generation;
    _timer = Timer(window, () {
      // A stale tick after undo is ignored even if cancel() was too late.
      if (generation != _generation || _inFlight) return;
      _timer = null;
      _inFlight = true;
      final toDelete = _pendingToken;
      _pendingToken = null;
      _pendingTokens.clear();
      if (toDelete != null) {
        // Consume the error here as well as in the UI callback: a failed BFF
        // delete must never surface as an unhandled async exception
        // (`whenComplete` alone rethrows the original error).
        unawaited(
          _onDelete(toDelete).then<void>(
            (_) {},
            onError: (Object _, StackTrace __) {},
          ).whenComplete(() {
            // Allow a later, genuinely new removal after this one settles.
            _inFlight = false;
          }),
        );
      }
    });
    return true;
  }

  /// «Вернуть»: cancels the pending DELETE before it reaches the BFF. Safe to
  /// tap repeatedly; it never restores a row after a completed provider call.
  void undo() => _cancel();

  void _cancel() {
    _generation++;
    _timer?.cancel();
    _timer = null;
    _pendingToken = null;
    _pendingTokens.clear();
  }

  /// Cancels any outstanding timer when the sheet is disposed (app-kill is
  /// safe by construction: nothing was sent yet).
  void dispose() => _cancel();
}
