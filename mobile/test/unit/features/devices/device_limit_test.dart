// Wave 0 boundary contract for device capacity (22-01, D-05, T-22-03).
// The client compares INTEGER server values only — no rounding, no percentage,
// no estimated capacity and no locally incremented count.
import "package:flutter_test/flutter_test.dart";
import "package:mobile/features/profile/devices/devices_sheet.dart";

void main() {
  group("device limit handoff boundary", () {
    test("at exactly deviceLimit only the paid upgrade is offered", () {
      final capacity = deviceCapacity(5, 5);
      expect(capacity.atLimit, isTrue);
      expect(capacity.canAdd, isFalse);
    });

    test("below deviceLimit the subscription-link handoff is available", () {
      final capacity = deviceCapacity(5, 4);
      expect(capacity.canAdd, isTrue);
      expect(capacity.atLimit, isFalse);
    });

    test("over the limit stays at-limit; no fabricated spare capacity", () {
      expect(deviceCapacity(2, 3).canAdd, isFalse);
      expect(deviceCapacity(0, 0).canAdd, isFalse);
      expect(deviceCapacity(0, 0).atLimit, isTrue);
    });

    test("repeated reads with the same server integers never grow capacity", () {
      final first = deviceCapacity(2, 2);
      final second = deviceCapacity(2, 2);
      final third = deviceCapacity(2, 2);
      expect(first.canAdd, second.canAdd);
      expect(second.canAdd, third.canAdd);
      expect(first.atLimit, isTrue);
      expect(third.atLimit, isTrue);
    });
  });
}
