// Wave 0 accessibility contract for phase 22 (22.12, T-22-27/T-22-28).
//
// Dynamic type and contrast are verified on rendered tokens, not reported on
// paper: a forced 200% platform scale must reach the text block, and the small
// text tokens must clear WCAG AA 4.5:1 on the dark card surfaces.
import "package:flutter/material.dart";
import "package:flutter_riverpod/flutter_riverpod.dart";
import "package:flutter_test/flutter_test.dart";
import "package:mobile/app/theme.dart";
import "package:mobile/core/payment/payment_flow.dart"
    show PaymentFlowResult, PaymentOutcome;
import "package:mobile/features/profile/devices/device.dart";
import "package:mobile/features/profile/devices/devices_providers.dart";
import "package:mobile/features/profile/profile_sheet.dart";
import "package:mobile/features/profile/settings/kill_switch_row.dart";
import "package:mobile/features/servers/widgets/main_header.dart";
import "package:mobile/features/shop/painting/confetti_overlay.dart";
import "package:mobile/features/shop/painting/ring_painter.dart";
import "package:mobile/features/shop/shop_screen.dart"
    show linkCopierProvider, paymentFlowStarterProvider;
import "package:mobile/features/subscription/models/subscription.dart";
import "package:mobile/features/subscription/providers.dart";
import "package:mobile/main.dart" show AppTextScalePolicy;

/// WCAG 2.x relative luminance is provided by Flutter's [Color].
double _contrast(Color foreground, Color background) {
  final double a = foreground.computeLuminance();
  final double b = background.computeLuminance();
  final double light = a > b ? a : b;
  final double dark = a > b ? b : a;
  return (light + 0.05) / (dark + 0.05);
}

void main() {
  test("avatar initial comes from real identity, never a hardcoded letter", () {
    expect(avatarInitial("Алик"), "А");
    expect(avatarInitial("alex"), "A");
    expect(avatarInitial("друг"), isNull);
    expect(avatarInitial("  "), isNull);
  });

  testWidgets("header shows a neutral avatar when no identity is known", (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark,
        home: Scaffold(
          body: MainHeader(
            keyMeta: null,
            refreshing: false,
            onRefresh: () {},
            onShop: () {},
            onLogic: () {},
            onProfile: () {},
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text("А"), findsNothing);
    expect(find.byIcon(Icons.person_outline), findsOneWidget);
  });

  /// A representative profile/device/settings text block, scrollable so a
  /// genuine 200% scale cannot be mistaken for a layout regression.
  Widget representativeBlock() => Builder(
        builder: (BuildContext context) {
          final ThemeData theme = Theme.of(context);
          return SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text("Профиль", style: theme.textTheme.headlineSmall),
                const SizedBox(height: 8),
                Text("Kill switch: включён", style: theme.textTheme.bodyMedium),
                const SizedBox(height: 4),
                Text(
                  "Трафик вне VPN заблокирован",
                  style: theme.textTheme.bodySmall,
                ),
                const SizedBox(height: 8),
                Text("Устройство", style: theme.textTheme.bodyMedium),
                Text("Нет устройств", style: theme.textTheme.bodySmall),
                const SizedBox(height: 8),
                Text("Обновить пинг", style: theme.textTheme.labelSmall),
              ],
            ),
          );
        },
      );

  Widget appAtScale(double scale) => MaterialApp(
        theme: AppTheme.dark,
        home: Builder(
          builder: (BuildContext context) => MediaQuery(
            data: MediaQuery.of(context).copyWith(
              textScaler: TextScaler.linear(scale),
            ),
            child: AppTextScalePolicy(
              child: Scaffold(body: representativeBlock()),
            ),
          ),
        ),
      );

  testWidgets("a 200% platform text scale reaches text unclamped", (
    tester,
  ) async {
    await tester.pumpWidget(appAtScale(2.0));

    final BuildContext textContext = tester.element(
      find.text("Kill switch: включён"),
    );
    expect(MediaQuery.of(textContext).textScaler.scale(16.0), 32.0);
    // No RenderFlex overflow and no clamped/phantom layout at real 200%.
    expect(tester.takeException(), isNull);
    expect(find.byType(NavigationBar), findsNothing);
    expect(find.byType(LinearProgressIndicator), findsNothing);
  });

  testWidgets("small text tokens are the AA token, not the prototype gray", (
    tester,
  ) async {
    expect(AppTheme.dark.textTheme.bodySmall?.color, AppTheme.dim);
    expect(AppTheme.dark.textTheme.labelSmall?.color, AppTheme.dim);
    expect(_contrast(AppTheme.dim, AppTheme.surface), greaterThanOrEqualTo(4.5));
    expect(_contrast(AppTheme.dim, AppTheme.surface2), greaterThanOrEqualTo(4.5));

    await tester.pumpWidget(appAtScale(2.0));
    final Text caption = tester.widget<Text>(
      find.text("Трафик вне VPN заблокирован"),
    );
    expect(caption.style?.color, AppTheme.dim);
  });

  const String secretLikeLink = "https://sub.invalid/SECRET_LINK";

  /// Explicit Semantics labels must never carry a link, token or provider text.
  void expectSafeLabels(WidgetTester tester) {
    final Iterable<Element> labelled = find
        .byWidgetPredicate(
          (Widget widget) =>
              widget is Semantics &&
              widget.properties.label != null &&
              widget.properties.label!.isNotEmpty,
        )
        .evaluate();
    for (final Element element in labelled) {
      final String label = (element.widget as Semantics).properties.label!;
      final String lower = label.toLowerCase();
      expect(lower.contains("http"), isFalse, reason: label);
      expect(lower.contains("vless://"), isFalse, reason: label);
      expect(lower.contains("ss://"), isFalse, reason: label);
      expect(lower.contains("3set-"), isFalse, reason: label);
      expect(lower.contains("secret"), isFalse, reason: label);
    }
  }

  Widget headerApp() => MaterialApp(
        theme: AppTheme.dark,
        home: Scaffold(
          body: MainHeader(
            keyMeta: null,
            refreshing: false,
            onRefresh: () {},
            onShop: () {},
            onLogic: () {},
            onProfile: () {},
          ),
        ),
      );

  Widget profileApp() => ProviderScope(
        overrides: [
          devicesProvider.overrideWith(
            (ref) async => const <Device>[
              Device(token: "tok-a", label: "Телефон", name: "Pixel"),
              Device(token: "tok-b", name: "Ноутбук"),
            ],
          ),
          userSubscriptionProvider.overrideWith(
            (ref) async => SubscriptionStatus(
              ok: true,
              user: const SubscriptionUser(
                id: 7,
                telegramId: null,
                email: "alex@example.test",
              ),
              deviceLimit: 5,
              devices: 2,
              link: secretLikeLink,
            ),
          ),
          linkCopierProvider.overrideWithValue((link) async {}),
          paymentFlowStarterProvider.overrideWithValue(
            (context, request) async => const PaymentFlowResult(
              PaymentOutcome.provisioned,
              "ord-1",
            ),
          ),
          deleteDeviceProvider.overrideWithValue((token) async {}),
        ],
        child: MaterialApp(
          theme: AppTheme.dark,
          home: const Scaffold(body: ProfileSheet()),
        ),
      );

  testWidgets("every icon-only pool header action has a Russian label", (
    tester,
  ) async {
    final SemanticsHandle handle = tester.ensureSemantics();
    await tester.pumpWidget(headerApp());

    for (final String label in const <String>[
      "Как это работает",
      "Купить ключ",
      "Обновить пинг",
      "Профиль",
    ]) {
      expect(
        find.byWidgetPredicate(
          (Widget widget) =>
              widget is Semantics &&
              widget.properties.label == label &&
              (widget.child is IconButton || widget.child is GestureDetector),
        ),
        findsOneWidget,
        reason: label,
      );
      // The avatar's own text merges into the wrapper node («Профиль А»).
      expect(
        find.semantics.byLabel(RegExp(label)),
        findsWidgets,
        reason: label,
      );
    }
    expectSafeLabels(tester);
    handle.dispose();
  });

  testWidgets("kill switch and device rows are announced, never interactive", (
    tester,
  ) async {
    final SemanticsHandle handle = tester.ensureSemantics();
    await tester.pumpWidget(profileApp());
    await tester.pumpAndSettle();

    expect(find.semantics.byLabel(KillSwitchRow.label), findsOneWidget);
    expect(find.semantics.byLabel(KillSwitchRow.caption), findsOneWidget);
    // The kill switch is read-only; the only Switch is the separate persisted
    // auto-connect preference introduced for REQ-SET-02.
    expect(
      find.descendant(
        of: find.byType(KillSwitchRow),
        matching: find.byType(Switch),
      ),
      findsNothing,
    );
    expect(find.text("Телефон"), findsOneWidget);
    expect(
      find.byWidgetPredicate(
        (Widget widget) =>
            widget is Semantics &&
            widget.properties.label == "Отключить Телефон" &&
            widget.properties.button == true,
      ),
      findsOneWidget,
    );
    expectSafeLabels(tester);
    handle.dispose();
  });

  testWidgets("confetti on a real CONFIRMED edge adds no semantics node", (
    tester,
  ) async {
    final SemanticsHandle handle = tester.ensureSemantics();
    Widget overlay(String? status) => MaterialApp(
          theme: AppTheme.dark,
          home: Scaffold(
            body: ConfettiOnStatus(
              status: status,
              expiresAt: "2026-12-01T00:00:00Z",
              link: secretLikeLink,
              child: const Text("shop"),
            ),
          ),
        );

    await tester.pumpWidget(overlay(null));
    await tester.pumpWidget(overlay("CONFIRMED"));
    await tester.pump();

    final Finder confetti = find.byWidgetPredicate(
      (Widget widget) =>
          widget is CustomPaint && widget.painter is ConfettiPainter,
    );
    expect(confetti, findsOneWidget);
    expect(
      find.ancestor(of: confetti, matching: find.byType(ExcludeSemantics)),
      findsOneWidget,
    );
    expectSafeLabels(tester);
    handle.dispose();
  });

  testWidgets("the days ring excludes its painter but announces the count", (
    tester,
  ) async {
    final SemanticsHandle handle = tester.ensureSemantics();
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark,
        home: const Scaffold(body: DaysRing(days: 26)),
      ),
    );

    final Finder ring = find.byWidgetPredicate(
      (Widget widget) =>
          widget is CustomPaint && widget.painter is DaysRingPainter,
    );
    expect(ring, findsOneWidget);
    expect(
      find.ancestor(of: ring, matching: find.byType(ExcludeSemantics)),
      findsOneWidget,
    );
    // Exclusion hides the decorative art, never the real remaining-days state.
    // The visible day count merges into the wrapper label in the semantics
    // tree; a RegExp proves the state is still announced after exclusion.
    expect(find.semantics.byLabel(RegExp("26 дней осталось")), findsOneWidget);
    expectSafeLabels(tester);
    handle.dispose();
  });
}
