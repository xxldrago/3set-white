// Contract tests for the phase-21 live subscription state layer (21-04).
import "dart:async";

// Fixtures are arbitrary server values on purpose: the Dart layer must decode
// whatever the backend sends, never generate prices or entitlement itself.
import "package:dio/dio.dart";
import "package:flutter_riverpod/flutter_riverpod.dart";
import "package:flutter_test/flutter_test.dart";
import "package:mocktail/mocktail.dart";
import "package:mobile/core/api/dio_client.dart";
import "package:mobile/core/api/endpoints.dart";
import "package:mobile/core/auth/auth_notifier.dart";
import "package:mobile/features/subscription/models/payment.dart";
import "package:mobile/features/subscription/models/pricing.dart";
import "package:mobile/features/subscription/models/promo.dart";
import "package:mobile/features/subscription/models/subscription.dart";
import "package:mobile/features/subscription/providers.dart";

class MockDioClient extends Mock implements DioClient {}

class MockDio extends Mock implements Dio {}

void main() {
  group("model decoding", () {
    test("pricing decodes five server terms in order with integer amounts", () {
      final pricing = PricingResponse.fromJson(<String, dynamic>{
        "ok": true,
        "currency": "RUB",
        "terms": <Map<String, dynamic>>[
          <String, dynamic>{"days": 7, "amount": 11},
          <String, dynamic>{"days": 30, "amount": 22},
          <String, dynamic>{"days": 90, "amount": 33},
          <String, dynamic>{"days": 180, "amount": 44},
          <String, dynamic>{"days": 365, "amount": 55},
        ],
      });

      expect(pricing.ok, isTrue);
      expect(pricing.currency, "RUB");
      expect(pricing.terms.map((term) => term.days), <int>[7, 30, 90, 180, 365]);
      expect(pricing.terms.map((term) => term.amount), <int>[11, 22, 33, 44, 55]);
      expect(pricing.error, isNull);
    });

    test("subscription decodes statusKind, graceUntil, devices and isTrial", () {
      final subscription = SubscriptionStatus.fromJson(<String, dynamic>{
        "ok": true,
        "user": <String, dynamic>{
          "id": 7,
          "telegramId": 123456,
          "email": null,
        },
        "expiresAt": "2026-12-01T10:00:00.000Z",
        "remainingDays": 3,
        "deviceLimit": 5,
        "link": "https://example.invalid/sub/abc",
        "devices": 4,
        "isTrial": true,
        "statusKind": "expired",
        "graceUntil": "2026-12-02T10:00:00.000Z",
      });

      expect(subscription.ok, isTrue);
      expect(subscription.user?.id, 7);
      expect(subscription.expiresAt, "2026-12-01T10:00:00.000Z");
      expect(subscription.remainingDays, 3);
      expect(subscription.deviceLimit, 5);
      expect(subscription.link, "https://example.invalid/sub/abc");
      expect(subscription.devices, 4);
      expect(subscription.isTrial, isTrue);
      expect(subscription.statusKind, "expired");
      expect(subscription.graceUntil, "2026-12-02T10:00:00.000Z");
    });

    test("promo preview carries a percentage and no amount", () {
      final promo = PromoPreview.fromJson(<String, dynamic>{
        "ok": true,
        "code": "LIME15",
        "discountPercent": 15,
      });

      expect(promo.ok, isTrue);
      expect(promo.code, "LIME15");
      expect(promo.discountPercent, 15);
      expect(promo.toJson().containsKey("amount"), isFalse);
    });

    test("payment create and status decode the server fields", () {
      final created = PaymentCreateResponse.fromJson(<String, dynamic>{
        "ok": true,
        "orderId": "ord-1",
        "paymentUrl": "https://pay.invalid/ord-1",
      });
      expect(created.ok, isTrue);
      expect(created.orderId, "ord-1");
      expect(created.paymentUrl, "https://pay.invalid/ord-1");
      expect(created.toJson().containsKey("amount"), isFalse);

      final status = PaymentStatusResponse.fromJson(<String, dynamic>{
        "ok": true,
        "status": "provisioned",
        "paidAt": "2026-11-28T04:00:00.000Z",
        "provisionedKeyId": "key-9",
      });
      expect(status.ok, isTrue);
      expect(status.status, "provisioned");
      expect(status.paidAt, "2026-11-28T04:00:00.000Z");
      expect(status.provisionedKeyId, "key-9");
    });
  });

  group("live providers", () {
    late MockDio dio;
    late ProviderContainer container;

    setUp(() {
      dio = MockDio();
      final dioClient = MockDioClient();
      when(() => dioClient.dio).thenReturn(dio);
      container = ProviderContainer(
        overrides: [dioClientProvider.overrideWithValue(dioClient)],
      );
    });

    tearDown(() => container.dispose());

    Response<dynamic> reply(String path, Map<String, dynamic> body,
            {int status = 200}) =>
        Response<dynamic>(
          statusCode: status,
          data: body,
          requestOptions: RequestOptions(path: path),
        );

    test("pricingPlansProvider emits server terms for the selected device count",
        () async {
      when(
        () => dio.get<dynamic>(
          Endpoints.pricing,
          queryParameters: <String, dynamic>{"devices": 2},
        ),
      ).thenAnswer(
        (_) async => reply(Endpoints.pricing, <String, dynamic>{
          "ok": true,
          "currency": "RUB",
          "terms": <Map<String, dynamic>>[
            <String, dynamic>{"days": 7, "amount": 777},
            <String, dynamic>{"days": 30, "amount": 888},
          ],
        }),
      );

      final terms = await container.read(pricingPlansProvider.future);
      expect(terms.map((term) => term.amount), <int>[777, 888]);
      expect(terms.map((term) => term.days), <int>[7, 30]);
      // The price is whatever the server quoted, never a Dart literal.
      expect(terms.map((term) => term.amount), isNot(contains(115)));
    });

    test("userSubscriptionProvider emits server statusKind and graceUntil",
        () async {
      when(() => dio.get<dynamic>(Endpoints.subscription)).thenAnswer(
        (_) async => reply(Endpoints.subscription, <String, dynamic>{
          "ok": true,
          "statusKind": "expired",
          "graceUntil": "2026-11-29T03:00:00.000Z",
          "link": "https://example.invalid/server-link",
          "devices": 3,
          "isTrial": false,
        }),
      );

      final status = await container.read(userSubscriptionProvider.future);
      expect(status.statusKind, "expired");
      expect(status.graceUntil, "2026-11-29T03:00:00.000Z");
      expect(status.link, "https://example.invalid/server-link");
      expect(status.devices, 3);
      expect(status.isTrial, isFalse);
    });

    test("403 no_active_key is a stable failure, not a transport exception",
        () async {
      when(() => dio.get<dynamic>(Endpoints.subscription)).thenThrow(
        DioException(
          requestOptions: RequestOptions(path: Endpoints.subscription),
          response: reply(Endpoints.subscription, <String, dynamic>{
            "ok": false,
            "error": "no_active_key",
          }, status: 403),
        ),
      );

      // Observe the AsyncValue the UI sees via AsyncValue.when(error: ...).
      final errors = Completer<Object?>();
      final listener = container.listen(userSubscriptionProvider, (_, next) {
        if (next.hasError && !errors.isCompleted) errors.complete(next.error);
      });
      final error = await errors.future.timeout(const Duration(seconds: 2));
      expect(
        error,
        isA<SubscriptionFailure>()
            .having((failure) => failure.code, "code", "no_active_key")
            .having(
              (failure) => subscriptionNotice(failure),
              "notice",
              "Нужен активный ключ",
            ),
      );
      expect(error, isNot(isA<DioException>()));
      listener.close();
    });

    test("createPaymentProvider posts intent without an amount and returns "
        "the server URL", () async {
      final posted = <Object?>[];
      when(
        () => dio.post<dynamic>(
          Endpoints.paymentCreate,
          data: any(named: "data"),
        ),
      ).thenAnswer((invocation) async {
        posted.add(invocation.namedArguments[#data]);
        return reply(Endpoints.paymentCreate, <String, dynamic>{
          "ok": true,
          "orderId": "ord-42",
          "paymentUrl": "https://pay.invalid/ord-42",
        });
      });

      final created = await container.read(
        createPaymentProvider(
          (
            kind: "new",
            days: 30,
            devices: 4,
            keyId: null,
            addDevices: null,
          ),
        ).future,
      );

      final body = Map<String, dynamic>.from(posted.single as Map);
      expect(body["kind"], "new");
      expect(body["days"], 30);
      expect(body["devices"], 4);
      expect(body.containsKey("amount"), isFalse);
      expect(body.containsKey("discount"), isFalse);
      expect(body.containsKey("keyId"), isFalse);
      expect(created.orderId, "ord-42");
      expect(created.paymentUrl, "https://pay.invalid/ord-42");
      expect(created.paymentUrl, isNot(contains("payment/mock")));
    });

    test("promo preview applies the server percentage to preview only", () async {
      when(
        () => dio.post<dynamic>(
          Endpoints.promoApply,
          data: <String, dynamic>{"code": "LIME15"},
        ),
      ).thenAnswer(
        (_) async => reply(Endpoints.promoApply, <String, dynamic>{
          "ok": true,
          "code": "LIME15",
          "discountPercent": 15,
        }),
      );

      final preview = await container.read(promoPreviewProvider("LIME15").future);
      expect(preview.code, "LIME15");
      expect(preview.discountPercent, 15);
      expect(preview.toJson().containsKey("amount"), isFalse);

      // D-03 preview: server unit × devices/2 × (1 − server %), rounded up.
      expect(previewTotalRub(unitAmount: 115, devices: 2, discountPercent: 15), 98);
      expect(previewTotalRub(unitAmount: 115, devices: 3, discountPercent: 0), 173);
      expect(previewTotalRub(unitAmount: 115, devices: 2, discountPercent: 100), 0);
    });

    test("payment status decodes the DB-written terminal status", () async {
      when(() => dio.get<dynamic>(Endpoints.paymentStatus("ord-42")))
          .thenAnswer(
        (_) async => reply(Endpoints.paymentStatus("ord-42"), <String, dynamic>{
          "ok": true,
          "status": "provisioned",
          "paidAt": "2026-11-28T04:00:00.000Z",
          "provisionedKeyId": "key-9",
        }),
      );

      final status = await container.read(paymentStatusProvider("ord-42").future);
      expect(status.status, "provisioned");
      expect(status.paidAt, "2026-11-28T04:00:00.000Z");
      expect(status.provisionedKeyId, "key-9");
    });

    test("unknown wire codes and transport errors never reach the UI as text",
        () async {
      when(() => dio.get<dynamic>(Endpoints.subscription)).thenAnswer(
        (_) async => reply(Endpoints.subscription, <String, dynamic>{
          "ok": false,
          "error": "upstream_secret_error_with_key=abc",
        }),
      );

      final errors = Completer<Object?>();
      final listener = container.listen(userSubscriptionProvider, (_, next) {
        if (next.hasError && !errors.isCompleted) errors.complete(next.error);
      });
      final error = await errors.future.timeout(const Duration(seconds: 2));
      expect(error, isA<SubscriptionFailure>());
      final failure = error as SubscriptionFailure;
      expect(failure.code, "internal");
      expect(failure.notice, subscriptionNotices["internal"]);
      expect(failure.notice, isNot(contains("upstream_secret_error")));
      expect(failure.notice, isNot(contains("503")));
      expect(
        subscriptionNotice(
          DioException(
            requestOptions: RequestOptions(path: Endpoints.subscription),
            error: "HTTP 503 upstream boom",
          ),
        ),
        "Нет соединения. Повторите",
      );
      listener.close();
    });

    test("create maps a 409 trial envelope to the locked trial notice", () async {
      when(
        () => dio.post<dynamic>(Endpoints.paymentCreate, data: any(named: "data")),
      ).thenThrow(
        DioException(
          requestOptions: RequestOptions(path: Endpoints.paymentCreate),
          response: reply(Endpoints.paymentCreate, <String, dynamic>{
            "ok": false,
            "error": "trial",
          }, status: 409),
        ),
      );

      final errors = Completer<Object?>();
      final provider = createPaymentProvider(
        (
          kind: "renew",
          days: 7,
          devices: null,
          keyId: "trial-key",
          addDevices: null,
        ),
      );
      final listener = container.listen(provider, (_, next) {
        if (next.hasError && !errors.isCompleted) errors.complete(next.error);
      });
      final error = await errors.future.timeout(const Duration(seconds: 2));
      expect(error, isA<SubscriptionFailure>());
      expect((error as SubscriptionFailure).code, "trial");
      expect(subscriptionNotice(error), "Триал не продлевается");
      listener.close();
    });
  });
}
