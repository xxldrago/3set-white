import "package:flutter_test/flutter_test.dart";
import "package:mobile/core/ping/ping_result.dart";

void main() {
  group("pingClass", () {
    test("offline, missing and negative samples map to offline", () {
      expect(pingClass(null, false), PingClass.offline);
      expect(pingClass(10, false), PingClass.offline);
      expect(pingClass(-1, true), PingClass.offline);
      expect(pingClass(null, true), PingClass.offline);
    });

    test("thresholds are inclusive at 60/110/180", () {
      expect(pingClass(0, true), PingClass.good);
      expect(pingClass(60, true), PingClass.good);
      expect(pingClass(61, true), PingClass.mid);
      expect(pingClass(110, true), PingClass.mid);
      expect(pingClass(111, true), PingClass.warn);
      expect(pingClass(180, true), PingClass.warn);
      expect(pingClass(181, true), PingClass.bad);
    });
  });

  group("PingResult", () {
    test("round-trips through JSON at the cache boundary", () {
      const result = PingResult(
        online: true,
        rttMs: 42,
        approx: false,
        tsMs: 1000,
      );
      final json = result.toJson();
      expect(json["online"], isTrue);
      expect(json["rttMs"], 42);
      expect(PingResult.fromJson(json), result);
    });

    test("approx is internal metadata and does not change the bucket", () {
      const result = PingResult(
        online: true,
        rttMs: 5,
        approx: true,
        tsMs: 1,
      );
      expect(result.approx, isTrue);
      expect(pingClass(result.rttMs, result.online), PingClass.good);
    });
  });
}
