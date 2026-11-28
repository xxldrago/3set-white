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

  const url = "https://pay.example.test/checkout/abc";

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

    test("accepts only absolute https URLs", () {
      expect(PaymentFlow.isHttpsPaymentUrl(url), isTrue);
      expect(
        PaymentFlow.isHttpsPaymentUrl("http://pay.example.test/x"),
        isFalse,
      );
      expect(PaymentFlow.isHttpsPaymentUrl("pay.example.test/x"), isFalse);
      expect(PaymentFlow.isHttpsPaymentUrl("https://"), isFalse);
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

    test("refuses a non-https URL before navigating or persisting", () async {
      stubCreate(paymentUrl: "http://pay.example.test/x");

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
}
