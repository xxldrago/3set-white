// Wave 0 clock contract for the five-second deferred DELETE (22-01, D-06,
// T-22-04). Every timer is deterministic; no real HTTP and no fake restore.
import "dart:async";

import "package:fake_async/fake_async.dart";
import "package:flutter_test/flutter_test.dart";
import "package:mobile/features/profile/devices/deferred_delete_controller.dart";

void main() {
  group("deferred delete undo clock", () {
    test("undo inside the window cancels before any provider call", () {
      final calls = <String>[];
      fakeAsync((async) {
        final controller = DeferredDeleteController(
          onDelete: (token) async => calls.add(token),
        );
        expect(controller.remove("tok-1"), isTrue);
        expect(controller.isPending("tok-1"), isTrue);

        async.elapse(const Duration(seconds: 4));
        controller.undo();
        async.elapse(const Duration(seconds: 10));

        expect(calls, isEmpty);
        expect(controller.isPending("tok-1"), isFalse);
        expect(controller.pendingTokens, isEmpty);
        controller.dispose();
      });
    });

    test("a fired timer sends exactly one DELETE; a double tick cannot send two", () {
      final calls = <String>[];
      fakeAsync((async) {
        final controller = DeferredDeleteController(
          onDelete: (token) async => calls.add(token),
        );
        controller.remove("tok-2");
        async.elapse(const Duration(seconds: 5));
        async.elapse(const Duration(seconds: 5));

        expect(calls, <String>["tok-2"]);
        expect(controller.isPending("tok-2"), isFalse);
        controller.dispose();
      });
    });

    test("a second delete while one is pending is ignored (one stable outcome)", () {
      final calls = <String>[];
      fakeAsync((async) {
        final controller = DeferredDeleteController(
          onDelete: (token) async => calls.add(token),
        );
        expect(controller.remove("tok-a"), isTrue);
        expect(controller.remove("tok-b"), isFalse);
        async.elapse(const Duration(seconds: 5));

        expect(calls, <String>["tok-a"]);
        expect(calls, isNot(contains("tok-b")));
        controller.dispose();
      });
    });

    test("repeated undo taps and dispose stay safe", () {
      final calls = <String>[];
      fakeAsync((async) {
        final controller = DeferredDeleteController(
          onDelete: (token) async => calls.add(token),
        );
        controller.remove("tok-c");
        controller.undo();
        controller.undo();
        controller.dispose();
        async.elapse(const Duration(seconds: 10));
        expect(calls, isEmpty);
      });
    });

    test("a refresh during the window keeps the row pending, never reinserted", () {
      final calls = <String>[];
      fakeAsync((async) {
        final controller = DeferredDeleteController(
          onDelete: (token) async => calls.add(token),
        );
        controller.remove("tok-d");
        // Simulate a BFF re-read mid-window: controller state is independent of
        // the device list and must still report the row as pending.
        async.elapse(const Duration(seconds: 3));
        final rereadPending = controller.pendingTokens.contains("tok-d");
        expect(rereadPending, isTrue);
        expect(calls, isEmpty);
        async.elapse(const Duration(seconds: 2));
        expect(calls, <String>["tok-d"]);
        expect(controller.pendingTokens, isEmpty);
        controller.dispose();
      });
    });
  });
}
