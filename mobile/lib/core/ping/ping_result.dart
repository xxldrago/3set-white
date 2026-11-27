import "package:freezed_annotation/freezed_annotation.dart";

part "ping_result.freezed.dart";
part "ping_result.g.dart";

/// Injectable epoch-millisecond clock; tests pass a deterministic fake.
typedef PingClock = int Function();

/// Default clock backed by [DateTime].
int defaultPingClock() => DateTime.now().millisecondsSinceEpoch;

/// Visual bucket for a ping sample (prototype palette; no `load`).
enum PingClass {
  /// RTT at most 60 ms.
  good,

  /// RTT at most 110 ms.
  mid,

  /// RTT at most 180 ms.
  warn,

  /// RTT above 180 ms.
  bad,

  /// The server did not answer.
  offline,
}

/// Classifies one RTT sample.
///
/// An offline, missing or negative sample maps to [PingClass.offline];
/// otherwise good <= 60, mid <= 110, warn <= 180 and bad above that.
PingClass pingClass(int? rttMs, bool online) {
  if (!online || rttMs == null || rttMs < 0) {
    return PingClass.offline;
  }
  if (rttMs <= 60) {
    return PingClass.good;
  }
  if (rttMs <= 110) {
    return PingClass.mid;
  }
  if (rttMs <= 180) {
    return PingClass.warn;
  }
  return PingClass.bad;
}

/// One real ping observation (never simulated).
@freezed
abstract class PingResult with _$PingResult {
  /// Creates a ping result.
  const factory PingResult({
    required bool online,
    /// `true` only for the silent TCP fallback; never shown in the UI.
    required bool approx,
    required int tsMs,
    int? rttMs,
  }) = _PingResult;

  /// JSON constructor used at the cache/DTO boundary.
  factory PingResult.fromJson(Map<String, dynamic> json) =>
      _$PingResultFromJson(json);
}
