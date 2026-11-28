import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:mobile/core/api/endpoints.dart';
import 'package:mobile/core/payment/payment_flow.dart';

class MockDio extends Mock implements Dio {}

class MockPendingOrderStore extends Mock implements PendingOrderStore {}

class MockWebViewLauncher extends Mock implements PaymentWebViewLauncher {}

Response<dynamic> reply(String path, int statusCode, Object? body) =>
    Response<dynamic>(
      statusCode: statusCode,
      data: body,
      requestOptions: RequestOptions(path: path),
    );

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  registerFallbackValue("");

  const url = "https://pay.platega.io/?id=abc";

  late MockDio dio;
  late MockPendingOrderStore store;
  late MockWebViewLauncher launcher;
  late PaymentFlow flow;
  late Map<String, dynamic> sent;

  void stubCreate({
    String paymentUrl = url,
    int statusCode = 200,
    Object? body,
  }) {
    when(() => dio.post(Endpoints.paymentCreate, data: any(named: "data")))
        .thenAnswer((invocation) async {
          final payload = invocation.namedArguments[#data];
          sent.addAll((payload as Map).cast<String, dynamic>());
          return reply(
            Endpoints.paymentCreate,
            statusCode,
            body ??
                <String, dynamic>{
                  "ok": true,
                  "orderId": "order-1",
                  "paymentUrl": paymentUrl,
                },
          );
        });
  }

  void stubPoll(List<Object?> statuses) {
    var calls = 0;
    when(() => dio.get(Endpoints.paymentStatus("order-1"))).thenAnswer((
      _,
    ) async {
      final status = statuses[calls.clamp(0, statuses.length - 1)];
      calls++;
      return reply(Endpoints.paymentStatus("order-1"), 200, <String, dynamic>{
        "ok": true,
        "status": status,
        "paidAt": null,
        "provisionedKeyId": status == "provisioned" ? "key-1" : null,
      });
    });
  }

  setUp(() {
    dio = MockDio();
    store = MockPendingOrderStore();
    launcher = MockWebViewLauncher();
    sent = <String, dynamic>{};

    when(() => store.save(any())).thenAnswer((_) async {});
    when(() => store.read()).thenAnswer((_) async => null);
    when(() => store.clear()).thenAnswer((_) async {});
    when(() => launcher.openPaymentPage(any())).thenAnswer((_) async {});

    flow = PaymentFlow(
      dio: dio,
      store: store,
      launcher: launcher,
      pollInterval: const Duration(milliseconds: 1),
      maxAttempts: 5,
    );
  });

  group("purchase cadence and URL safety", () {
    test("polls every 3s with a 100-attempt (5 minute) cap", () {
      expect(PaymentFlow.defaultPollInterval, const Duration(seconds: 3));
      expect(PaymentFlow.defaultMaxAttempts, 100);
      expect(
        PaymentFlow.defaultPollInterval.inSeconds *
            PaymentFlow.defaultMaxAttempts,
        300,
      );
    });

    test("accepts only absolute https URLs on an allowlisted provider host", () {
      expect(PaymentFlow.isHttpsPaymentUrl(url), isTrue);
      expect(
        PaymentFlow.isHttpsPaymentUrl("https://checkout.pay.platega.io/x"),
        isTrue,
      );
      expect(
        PaymentFlow.isHttpsPaymentUrl("http://pay.platega.io/x"),
        isFalse,
      );
      expect(PaymentFlow.isHttpsPaymentUrl("pay.platega.io/x"), isFalse);
      expect(PaymentFlow.isHttpsPaymentUrl("https://"), isFalse);
      // T-21-06: an arbitrary https host is NOT a payment destination.
      expect(
        PaymentFlow.isHttpsPaymentUrl("https://evil.example/checkout"),
        isFalse,
      );
      expect(
        PaymentFlow.isHttpsPaymentUrl("https://pay.platega.io.evil.example/x"),
        isFalse,
      );
      expect(
        PaymentFlow.isHttpsPaymentUrl("https://notpay.platega.io/x"),
        isFalse,
      );
    });
  });

  group("one real create → WebView → poll path", () {
    test(
      "sends intent only, opens the https URL, saves only the order id",
      () async {
        stubCreate();
        stubPoll(const ["pending", "provisioned"]);

        final result = await flow.start(
          const PaymentRequest(kind: "new", days: 7, devices: 2),
        );

        expect(result.isSuccess, isTrue);
        expect(result.outcome, PaymentOutcome.provisioned);
        expect(result.orderId, "order-1");
        expect(sent, <String, dynamic>{"kind": "new", "days": 7, "devices": 2});
        expect(sent.containsKey("amount"), isFalse);
        expect(sent.containsKey("discount"), isFalse);
        verify(() => store.save("order-1")).called(1);
        verify(() => launcher.openPaymentPage(url)).called(1);
        verify(() => store.clear()).called(1);
      },
    );

    test("poll runs even when the WebView is never dismissed (WR-02)", () async {
      stubCreate();
      stubPoll(const ["provisioned"]);
      final stuckLauncher = MockWebViewLauncher();
      // A real Navigator.push Future completes only on pop; this one never
      // completes, mirroring a user who leaves the payment page open.
      when(() => stuckLauncher.openPaymentPage(any()))
          .thenAnswer((_) => Completer<void>().future);
      final stuckFlow = PaymentFlow(
        dio: dio,
        store: store,
        launcher: stuckLauncher,
        pollInterval: const Duration(milliseconds: 1),
        maxAttempts: 5,
      );

      final result = await stuckFlow
          .start(const PaymentRequest(kind: "new", days: 7, devices: 2))
          .timeout(const Duration(seconds: 2));

      expect(result.outcome, PaymentOutcome.provisioned);
      verify(() => stuckLauncher.openPaymentPage(url)).called(1);
      verify(() => dio.get(Endpoints.paymentStatus("order-1"))).called(1);
    });

    test("refuses a non-https URL before navigating or persisting", () async {
      stubCreate(paymentUrl: "http://pay.platega.io/x");

      await expectLater(
        flow.start(const PaymentRequest(kind: "new", days: 7, devices: 2)),
        throwsA(
          isA<PaymentFlowException>().having(
            (e) => e.code,
            "code",
            "invalid_payment_url",
          ),
        ),
      );
      verifyNever(() => launcher.openPaymentPage(any()));
      verifyNever(() => store.save(any()));
    });

    test("refuses an https URL on an untrusted host (T-21-06)", () async {
      stubCreate(paymentUrl: "https://evil.example/checkout");

      await expectLater(
        flow.start(const PaymentRequest(kind: "new", days: 7, devices: 2)),
        throwsA(
          isA<PaymentFlowException>().having(
            (e) => e.code,
            "code",
            "invalid_payment_url",
          ),
        ),
      );
      verifyNever(() => launcher.openPaymentPage(any()));
      verifyNever(() => store.save(any()));
    });

    test("never reports success from a timer: paid is not terminal", () async {
      stubCreate();
      stubPoll(const ["paid"]);

      final result = await flow.start(
        const PaymentRequest(kind: "new", days: 7, devices: 2),
      );

      expect(result.isSuccess, isFalse);
      expect(result.outcome, PaymentOutcome.timeout);
      expect(result.orderId, "order-1");
      verifyNever(() => store.clear());
    });

    test("success requires the terminal provisioned DB status", () async {
      stubCreate();
      stubPoll(const ["pending", "pending", "provisioned"]);

      final result = await flow.start(
        const PaymentRequest(kind: "new", days: 7, devices: 2),
      );

      expect(result.isSuccess, isTrue);
      verify(() => store.clear()).called(1);
    });

    test("a 404 clears the pending id and fails", () async {
      stubCreate();
      final path = Endpoints.paymentStatus("order-1");
      when(() => dio.get(path)).thenThrow(
        DioException(
          requestOptions: RequestOptions(path: path),
          response: reply(path, 404, <String, dynamic>{
            "ok": false,
            "error": "not_found",
          }),
        ),
      );

      final result = await flow.start(
        const PaymentRequest(kind: "new", days: 7, devices: 2),
      );

      expect(result.outcome, PaymentOutcome.failed);
      verify(() => store.clear()).called(1);
    });
  });

  group("pending order continuation", () {
    test("resumes polling the persisted non-secret order id", () async {
      when(() => store.read()).thenAnswer((_) async => "order-9");
      when(() => dio.get(Endpoints.paymentStatus("order-9"))).thenAnswer(
        (_) async =>
            reply(Endpoints.paymentStatus("order-9"), 200, <String, dynamic>{
              "ok": true,
              "status": "provisioned",
              "paidAt": null,
              "provisionedKeyId": "key-9",
            }),
      );

      final result = await flow.resumePending();

      expect(result?.isSuccess, isTrue);
      expect(result?.orderId, "order-9");
      verify(() => dio.get(Endpoints.paymentStatus("order-9"))).called(1);
      verify(() => store.clear()).called(1);
    });

    test("does nothing when no pending order id was stored", () async {
      expect(await flow.resumePending(), isNull);
      verifyNever(() => dio.get(any()));
    });
  });

  group("resume, terminal cleanup and honest timeout (D-06/D-11)", () {
    PaymentFlow flowWith(void Function() onProvisioned) => PaymentFlow(
          dio: dio,
          store: store,
          launcher: launcher,
          pollInterval: const Duration(milliseconds: 1),
          maxAttempts: 5,
          onProvisioned: () async => onProvisioned(),
        );

    void stubStatus(String orderId, List<Object?> statuses) {
      var calls = 0;
      when(() => dio.get(Endpoints.paymentStatus(orderId))).thenAnswer((_) async {
        final status = statuses[calls.clamp(0, statuses.length - 1)];
        calls++;
        return reply(Endpoints.paymentStatus(orderId), 200, <String, dynamic>{
          "ok": true,
          "status": status,
          "paidAt": null,
          "provisionedKeyId": null,
        });
      });
    }

    test("resumes a stored PENDING order by polling, never by a second create", () async {
      when(() => store.read()).thenAnswer((_) async => "order-9");
      stubStatus("order-9", const <String>["pending", "provisioned"]);
      var invalidations = 0;

      final result = await flowWith(() => invalidations++).resumePending();

      expect(result?.isSuccess, isTrue);
      expect(result?.orderId, "order-9");
      verify(() => dio.get(Endpoints.paymentStatus("order-9"))).called(2);
      verifyNever(() => dio.post(any(), data: any(named: "data")));
      verify(() => store.clear()).called(1);
      // CONFIRMED invalidates the subscription exactly once.
      expect(invalidations, 1);
    });

    for (final status in <String>[
      "canceled",
      "chargebacked",
      "disputed",
      "refunded",
    ]) {
      test("clears the stored id on $status without ever showing success", () async {
        when(() => store.read()).thenAnswer((_) async => "order-7");
        stubStatus("order-7", <String>[status]);
        var invalidations = 0;

        final result = await flowWith(() => invalidations++).resumePending();

        expect(result, isNotNull);
        expect(result!.isSuccess, isFalse);
        expect(result.outcome, isNot(PaymentOutcome.provisioned));
        verify(() => store.clear()).called(1);
        expect(invalidations, 0);
      });
    }

    test("normalizes provider status spelling before deriving the terminal outcome", () async {
      when(() => store.read()).thenAnswer((_) async => "order-8");
      stubStatus("order-8", const <String>["PROVISIONED"]);
      var invalidations = 0;

      final result = await flowWith(() => invalidations++).resumePending();

      expect(result?.outcome, PaymentOutcome.provisioned);
      verify(() => store.clear()).called(1);
      expect(invalidations, 1);
    });

    test("persists only the non-secret order id", () async {
      final spyStore = MockPendingOrderStore();
      final saved = <String>[];
      when(() => spyStore.save(any())).thenAnswer((invocation) async {
        saved.add(invocation.positionalArguments.first as String);
      });
      when(() => spyStore.read()).thenAnswer((_) async => null);
      when(() => spyStore.clear()).thenAnswer((_) async {});
      final spyFlow = PaymentFlow(
        dio: dio,
        store: spyStore,
        launcher: launcher,
        pollInterval: const Duration(milliseconds: 1),
        maxAttempts: 5,
      );
      stubCreate();
      stubStatus("order-1", const <String>["provisioned"]);

      await spyFlow.start(const PaymentRequest(kind: "new", days: 7, devices: 2));

      expect(saved, <String>["order-1"]);
      for (final value in saved) {
        expect(value.contains("https"), isFalse);
        expect(value.contains("token"), isFalse);
        expect(value.contains("tx_"), isFalse);
      }
    });

    test("stops after the 100-attempt cap with a waiting timeout, not a fake success", () async {
      when(() => store.read()).thenAnswer((_) async => "order-100");
      var calls = 0;
      when(() => dio.get(Endpoints.paymentStatus("order-100"))).thenAnswer((
        _,
      ) async {
        calls++;
        return reply(
          Endpoints.paymentStatus("order-100"),
          200,
          <String, dynamic>{"ok": true, "status": "pending"},
        );
      });
      var invalidations = 0;
      final capped = PaymentFlow(
        dio: dio,
        store: store,
        launcher: launcher,
        pollInterval: const Duration(milliseconds: 1),
        maxAttempts: 100,
        onProvisioned: () async => invalidations++,
      );

      final result = await capped.resumePending();

      expect(result?.outcome, PaymentOutcome.timeout);
      expect(result?.isSuccess, isFalse);
      expect(result?.isTimedOut, isTrue);
      expect(calls, 100);
      expect(invalidations, 0);
      // The id stays stored so the next launch may continue (D-06).
      verifyNever(() => store.clear());
    });
  });
}
