// Startup wiring for killed-app payment resume (D-06 / REQ-SHOP-06).
// No WebView, clipboard or platform channel: the resume runs against an
// injected store + Dio, and success is asserted through the real providers.
import "dart:async";

import "package:dio/dio.dart";
import "package:flutter_riverpod/flutter_riverpod.dart";
import "package:flutter_test/flutter_test.dart";
import "package:mocktail/mocktail.dart";
import "package:mobile/core/api/dio_client.dart";
import "package:mobile/core/api/endpoints.dart";
import "package:mobile/core/auth/auth_notifier.dart" show dioClientProvider;
import "package:mobile/core/payment/payment_flow.dart";
import "package:mobile/core/payment/payment_resume_listener.dart";
import "package:mobile/features/shop/shop_screen.dart"
    show purchaseStatusProvider;
import "package:mobile/features/subscription/models/subscription.dart";
import "package:mobile/features/subscription/providers.dart"
    show userSubscriptionProvider;

class MockDioClient extends Mock implements DioClient {}

class MockDio extends Mock implements Dio {}

class MockPaymentFlow extends Mock implements PaymentFlow {}

class FakePendingOrderStore implements PendingOrderStore {
  FakePendingOrderStore(this._orderId);

  final String? _orderId;
  bool cleared = false;

  @override
  Future<void> save(String orderId) async {}

  @override
  Future<String?> read() async => _orderId;

  @override
  Future<void> clear() async {
    cleared = true;
  }
}

Response<dynamic> _provisionedReply(String orderId) => Response<dynamic>(
      statusCode: 200,
      data: <String, dynamic>{"ok": true, "status": "provisioned"},
      requestOptions: RequestOptions(path: Endpoints.paymentStatus(orderId)),
    );

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group("always-on payment resume listener", () {
    test("watching at startup calls resumePending exactly once", () async {
      final flow = MockPaymentFlow();
      when(() => flow.resumePending()).thenAnswer((_) async => null);
      final container = ProviderContainer(
        overrides: [resumePaymentFlowProvider.overrideWithValue(flow)],
      );
      addTearDown(container.dispose);

      container.read(paymentResumeListenerProvider);
      await Future<void>.delayed(Duration.zero);

      verify(() => flow.resumePending()).called(1);
    });

    test("a stored provisioned order refreshes subscription and publishes "
        "success", () async {
      const orderId = "order-9";
      final dio = MockDio();
      final dioClient = MockDioClient();
      when(() => dioClient.dio).thenReturn(dio);
      when(() => dio.get(Endpoints.paymentStatus(orderId)))
          .thenAnswer((_) async => _provisionedReply(orderId));
      final store = FakePendingOrderStore(orderId);
      var subscriptionBuilds = 0;

      final container = ProviderContainer(
        overrides: [
          dioClientProvider.overrideWithValue(dioClient),
          pendingOrderStoreProvider.overrideWithValue(store),
          userSubscriptionProvider.overrideWith((ref) async {
            subscriptionBuilds++;
            return const SubscriptionStatus(ok: true);
          }),
          // Keep the real callback and listener; only shorten the poll so the
          // test settles in milliseconds instead of the production 3s cadence.
          resumePaymentFlowProvider.overrideWith((ref) => PaymentFlow(
                dio: ref.read(dioClientProvider).dio,
                store: ref.read(pendingOrderStoreProvider),
                launcher: const NoopPaymentLauncher(),
                pollInterval: const Duration(milliseconds: 1),
                maxAttempts: 5,
                onProvisioned: () async => onPaymentProvisioned(ref),
              )),
        ],
      );
      addTearDown(container.dispose);

      final subscriptionSub =
          container.listen(userSubscriptionProvider, (_, __) {});
      addTearDown(subscriptionSub.close);
      await container.read(userSubscriptionProvider.future);
      expect(subscriptionBuilds, 1);

      final provisioned = Completer<void>();
      final statusSub = container.listen(purchaseStatusProvider, (_, next) {
        if (next == "provisioned" && !provisioned.isCompleted) {
          provisioned.complete();
        }
      });
      addTearDown(statusSub.close);

      container.read(paymentResumeListenerProvider);
      await provisioned.future.timeout(const Duration(seconds: 2));
      await pumpEventQueue();

      expect(container.read(purchaseStatusProvider), "provisioned");
      expect(subscriptionBuilds, 2);
      expect(store.cleared, isTrue);
      verify(() => dio.get(Endpoints.paymentStatus(orderId))).called(1);
    });
  });
}
