// Wave-0 widget tests for the real Shop Screen (21-05). Assertions are on
// rendered behavior and provider calls only — no source-text matching, no fake
// timers for payment success and no simulation of the money pipeline.
import "package:flutter/material.dart";
import "package:flutter_riverpod/flutter_riverpod.dart";
import "package:flutter_test/flutter_test.dart";
import "package:mobile/app/theme.dart";
import "package:mobile/core/payment/payment_flow.dart";
import "package:mobile/features/shop/painting/confetti_overlay.dart";
import "package:mobile/features/shop/painting/ring_painter.dart";
import "package:mobile/features/shop/shop_screen.dart";
import "package:mobile/features/shop/widgets/shop_widgets.dart";
import "package:mobile/features/subscription/models/pricing.dart";
import "package:mobile/features/subscription/models/promo.dart";
import "package:mobile/features/subscription/models/subscription.dart";
import "package:mobile/features/subscription/providers.dart";

const String _expiresAt = "2026-12-01T10:00:00.000Z";
const String _link = "https://sub.invalid/abc123";

List<PricingTerm> _terms([List<int>? amounts]) {
  final values = amounts ?? <int>[115, 400, 1000, 1900, 3800];
  const days = <int>[7, 30, 90, 180, 365];
  return <PricingTerm>[
    for (var i = 0; i < days.length; i++)
      PricingTerm(days: days[i], amount: values[i]),
  ];
}

SubscriptionStatus _subscription({
  bool isTrial = false,
  String? statusKind = "active",
  String? graceUntil,
  String? link = _link,
  String? expiresAt = _expiresAt,
  int? remainingDays = 26,
}) {
  return SubscriptionStatus(
    ok: true,
    statusKind: statusKind,
    graceUntil: graceUntil,
    isTrial: isTrial,
    link: link,
    expiresAt: expiresAt,
    remainingDays: remainingDays,
    deviceLimit: 2,
    devices: 1,
  );
}

/// Deterministic ProviderScope + dark MaterialApp wrapper (connect_panel_test
/// pattern). Every external value is injected; no real network is reachable.
Widget _shopApp({
  List<PricingTerm>? terms,
  SubscriptionStatus? subscription,
  PromoPreview? promo,
  Object? promoError,
  int devices = 2,
  String chip = "МИР",
  String? purchaseStatus,
  List<String>? copiedLinks,
  Future<PaymentFlowResult> Function(BuildContext, PaymentRequest)? starter,
}) {
  return ProviderScope(
    overrides: [
      pricingPlansProvider.overrideWith((ref) async => terms ?? _terms()),
      userSubscriptionProvider.overrideWith(
        (ref) async => subscription ?? _subscription(),
      ),
      promoPreviewStateProvider.overrideWith((ref) async {
        if (promoError != null) throw promoError;
        return promo;
      }),
      deviceCountProvider.overrideWith((ref) => devices),
      paymentMethodProvider.overrideWith((ref) => chip),
      purchaseStatusProvider.overrideWith((ref) => purchaseStatus),
      linkCopierProvider.overrideWithValue((link) async {
        copiedLinks?.add(link);
      }),
      paymentFlowStarterProvider.overrideWithValue((context, request) async {
        if (starter != null) return starter(context, request);
        return PaymentFlowResult(PaymentOutcome.provisioned, "ord-1");
      }),
    ],
    child: MaterialApp(
      theme: AppTheme.dark,
      home: const ShopScreen(),
    ),
  );
}

void main() {
  group("Shop rendering", () {
    testWidgets("renders five server terms in order and hits only 1 month", (
      tester,
    ) async {
      await tester.pumpWidget(_shopApp());
      await tester.pumpAndSettle();

      for (final amount in <int>[115, 400, 1000, 1900, 3800]) {
        expect(find.text("$amount ₽"), findsWidgets);
      }
      expect(find.byType(ShopTermCard), findsNWidgets(5));
      expect(find.text("Хит"), findsOneWidget);
      final hitCard = find.ancestor(
        of: find.text("Хит"),
        matching: find.byType(ShopTermCard),
      );
      expect(
        find.descendant(of: hitCard, matching: find.text("1 месяц")),
        findsOneWidget,
      );
      expect(find.byType(NavigationBar), findsNothing);
      expect(find.byType(LinearProgressIndicator), findsNothing);
    });

    testWidgets("server amounts are used verbatim, never a Dart price table", (
      tester,
    ) async {
      await tester.pumpWidget(
        _shopApp(terms: _terms(<int>[101, 202, 303, 404, 505])),
      );
      await tester.pumpAndSettle();

      for (final amount in <int>[101, 202, 303, 404, 505]) {
        expect(find.text("$amount ₽"), findsWidgets);
      }
      expect(find.text("115 ₽"), findsNothing);
      expect(find.text("3800 ₽"), findsNothing);
    });

    testWidgets("stepper stops at 2 and 10 with ten dots", (tester) async {
      await tester.pumpWidget(_shopApp(devices: 2));
      await tester.pumpAndSettle();

      expect(_stepButton(tester, Icons.remove_circle_outline).onPressed, isNull);
      final plus = find.byIcon(Icons.add_circle_outline);
      await tester.ensureVisible(plus);
      await tester.pumpAndSettle();
      await tester.tap(plus);
      await tester.pumpAndSettle();
      expect(find.text("3"), findsWidgets);
      expect(
        _stepButton(tester, Icons.remove_circle_outline).onPressed,
        isNotNull,
      );

      for (var i = 0; i < 7; i++) {
        final next = find.byIcon(Icons.add_circle_outline);
        await tester.ensureVisible(next);
        await tester.pumpAndSettle();
        await tester.tap(next);
        await tester.pumpAndSettle();
      }
      expect(_stepButton(tester, Icons.add_circle_outline).onPressed, isNull);
      expect(find.bySemanticsLabel("10 из 10 устройств"), findsOneWidget);
    });

    testWidgets("live summary multiplies the server unit and applies the percent", (
      tester,
    ) async {
      await tester.pumpWidget(
        _shopApp(
          terms: _terms(<int>[101, 202, 303, 404, 505]),
          promo: const PromoPreview(
            ok: true,
            code: "LIME15",
            discountPercent: 15,
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text("Промокод применён: −15%"), findsOneWidget);
      expect(find.text("Скидка (15%)"), findsOneWidget);
      // base 101, discount 15% -> ceil(101*85/100) = 86.
      expect(find.text("86 ₽"), findsWidgets);
      expect(find.text("−15 ₽"), findsOneWidget);
    });

    testWidgets("invalid promo shows stable Russian error and no discount", (
      tester,
    ) async {
      await tester.pumpWidget(
        _shopApp(
          promoError: const SubscriptionFailure(
            "promo_invalid",
            "Промокод недействителен",
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text("Промокод недействителен"), findsOneWidget);
      expect(find.textContaining("Скидка ("), findsNothing);
    });

    testWidgets("payment chip selection persists across rebuilds", (
      tester,
    ) async {
      await tester.pumpWidget(_shopApp());
      await tester.pumpAndSettle();

      final visa = find.widgetWithText(FilterChip, "VISA");
      await tester.ensureVisible(visa);
      await tester.pumpAndSettle();
      await tester.tap(visa);
      await tester.pump();
      expect(
        tester
            .widget<FilterChip>(find.widgetWithText(FilterChip, "VISA"))
            .selected,
        isTrue,
      );

      // Force a rebuild through a different provider; the chip must persist.
      final term = find.widgetWithText(ShopTermCard, "3 месяца");
      await tester.ensureVisible(term);
      await tester.pumpAndSettle();
      await tester.tap(term);
      await tester.pump();
      expect(
        tester
            .widget<FilterChip>(find.widgetWithText(FilterChip, "VISA"))
            .selected,
        isTrue,
      );
      expect(
        tester
            .widget<FilterChip>(find.widgetWithText(FilterChip, "МИР"))
            .selected,
        isFalse,
      );
    });

    testWidgets("pay hands intent to the real flow without amount or chip", (
      tester,
    ) async {
      PaymentRequest? captured;
      await tester.pumpWidget(
        _shopApp(
          starter: (context, request) async {
            captured = request;
            return PaymentFlowResult(PaymentOutcome.provisioned, "ord-1");
          },
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.widgetWithText(FilledButton, "Купить и продлить"));
      await tester.pumpAndSettle();

      expect(captured, isNotNull);
      final json = captured!.toJson();
      expect(json["kind"], "new");
      expect(json["days"], 7);
      expect(json["devices"], 2);
      expect(json.containsKey("amount"), isFalse);
      expect(json.containsKey("paymentMethod"), isFalse);
      expect(json.containsKey("discount"), isFalse);
      // Success is driven by the DB poll result mirrored by the screen.
      expect(find.text("Подписка продлена до 01.12.2026"), findsOneWidget);
    });
  });

  group("key gating and copy", () {
    testWidgets("copy uses the clipboard seam and shows the frozen toast", (
      tester,
    ) async {
      final copied = <String>[];
      await tester.pumpWidget(_shopApp(copiedLinks: copied));
      await tester.pumpAndSettle();

      await tester.tap(find.byTooltip("Скопировать ссылку"));
      await tester.pump();

      expect(copied, <String>[_link]);
      expect(find.text("Ссылка скопирована"), findsOneWidget);
    });

    testWidgets("trial hides renew/upgrade and shows the locked copy", (
      tester,
    ) async {
      await tester.pumpWidget(
        _shopApp(subscription: _subscription(isTrial: true)),
      );
      await tester.pumpAndSettle();

      expect(find.text("Триал не продлевается"), findsOneWidget);
      expect(find.text("Купить и продлить"), findsNothing);
      expect(find.text("Купить новый ключ"), findsOneWidget);
    });

    testWidgets("no key shows the stable gate banner and no bottom nav", (
      tester,
    ) async {
      await tester.pumpWidget(
        _shopApp(
          subscription: _subscription(statusKind: null, link: null),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text("Нужен активный ключ"), findsOneWidget);
      expect(find.text("Выбрать тариф"), findsOneWidget);
      expect(find.byType(NavigationBar), findsNothing);
    });
  });

  group("REQ-SUB-06 expires soon banner (server-driven)", () {
    testWidgets("expiring statusKind shows the banner with the grace deadline", (
      tester,
    ) async {
      await tester.pumpWidget(
        _shopApp(
          subscription: _subscription(
            statusKind: "expiring",
            graceUntil: "2026-11-29T10:00:00.000Z",
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.byType(ExpiresSoonBanner), findsOneWidget);
      expect(find.text("Истекает вскоре"), findsOneWidget);
      expect(find.text("Доступ сохранён до 29.11.2026"), findsOneWidget);
    });

    testWidgets("expired key inside grace shows the same server banner", (
      tester,
    ) async {
      await tester.pumpWidget(
        _shopApp(
          subscription: _subscription(
            statusKind: "expired",
            graceUntil: "2026-11-28T23:00:00.000Z",
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.byType(ExpiresSoonBanner), findsOneWidget);
      expect(find.text("Истекает вскоре"), findsOneWidget);
    });

    testWidgets("active key has no expires-soon banner", (tester) async {
      await tester.pumpWidget(_shopApp(subscription: _subscription()));
      await tester.pumpAndSettle();

      expect(find.byType(ExpiresSoonBanner), findsNothing);
      expect(find.text("Истекает вскоре"), findsNothing);
    });
  });

  group("painting and success transition", () {
    testWidgets("ring is clamped and colored only by day thresholds", (
      tester,
    ) async {
      expect(DaysRingPainter.progressFor(-5), 0.0);
      expect(DaysRingPainter.progressFor(15), 0.5);
      expect(DaysRingPainter.progressFor(60), 1.0);
      expect(DaysRingPainter.colorForDays(20), AppTheme.lime);
      expect(DaysRingPainter.colorForDays(5), AppTheme.amber);
      expect(DaysRingPainter.colorForDays(1), AppTheme.red);

      await tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.dark,
          home: const Scaffold(body: DaysRing(days: 26)),
        ),
      );
      expect(
        find.byWidgetPredicate(
          (widget) => widget is CustomPaint && widget.painter is DaysRingPainter,
        ),
        findsOneWidget,
      );
    });

    testWidgets("confetti needs a real status transition, not a timer pump", (
      tester,
    ) async {
      Widget overlay(String? status) => MaterialApp(
            theme: AppTheme.dark,
            home: Scaffold(
              body: ConfettiOnStatus(
                status: status,
                expiresAt: _expiresAt,
                link: _link,
                child: const Text("shop"),
              ),
            ),
          );

      await tester.pumpWidget(overlay("pending"));
      await tester.pump(const Duration(seconds: 10));
      expect(_hasConfetti(tester), isFalse);
      expect(find.text("shop"), findsOneWidget);

      await tester.pumpWidget(overlay("provisioned"));
      await tester.pump();
      expect(_hasConfetti(tester), isTrue);

      await tester.pumpAndSettle();
      expect(find.text("Ключ активен"), findsOneWidget);
      expect(find.text("Подписка продлена до 01.12.2026"), findsOneWidget);
    });

    testWidgets("a screen opened already provisioned never replays confetti", (
      tester,
    ) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.dark,
          home: Scaffold(
            body: ConfettiOnStatus(
              status: "CONFIRMED",
              expiresAt: _expiresAt,
              child: const Text("shop"),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(_hasConfetti(tester), isFalse);
    });
  });
}

IconButton _stepButton(WidgetTester tester, IconData icon) =>
    tester.widget<IconButton>(
      find.ancestor(
        of: find.byIcon(icon),
        matching: find.byType(IconButton),
      ),
    );

bool _hasConfetti(WidgetTester tester) => tester
    .widgetList<CustomPaint>(find.byType(CustomPaint))
    .any((paint) => paint.painter is ConfettiPainter);
