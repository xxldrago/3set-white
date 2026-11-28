// Contract tests for the phase-21 live subscription state layer (21-04).
// Fixtures are arbitrary server values on purpose: the Dart layer must decode
// whatever the backend sends, never generate prices or entitlement itself.
import "package:flutter_test/flutter_test.dart";
import "package:mobile/features/subscription/models/payment.dart";
import "package:mobile/features/subscription/models/pricing.dart";
import "package:mobile/features/subscription/models/promo.dart";
import "package:mobile/features/subscription/models/subscription.dart";

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
}
