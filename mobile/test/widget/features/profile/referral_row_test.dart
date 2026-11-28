// Wave 0 widget contract for referral + subscription-link copy (22-03,
// REQ-SET-03 / T-22-16). Every value is injected; the stored code already
// carries `3SET-` and must be appended exactly once. No fake link or log.
import "package:flutter/material.dart";
import "package:flutter_riverpod/flutter_riverpod.dart";
import "package:flutter_test/flutter_test.dart";
import "package:mobile/app/theme.dart";
import "package:mobile/features/profile/settings/referral_row.dart";
import "package:mobile/features/shop/shop_screen.dart" show linkCopierProvider;

const String _link = "https://sub.invalid/REAL_SUB_LINK";

Widget _app({
  required String? referralCode,
  String? subscriptionLink,
  required List<String> copied,
}) {
  return ProviderScope(
    overrides: [
      linkCopierProvider.overrideWithValue((link) async {
        copied.add(link);
      }),
    ],
    child: MaterialApp(
      theme: AppTheme.dark,
      home: Scaffold(
        body: SingleChildScrollView(
          child: ReferralRow(
            referralCode: referralCode,
            subscriptionLink: subscriptionLink,
          ),
        ),
      ),
    ),
  );
}

void main() {
  testWidgets("copy rows are announced as buttons, not static text", (
    tester,
  ) async {
    await tester.pumpWidget(
      _app(
        referralCode: "3SET-ABC123",
        subscriptionLink: _link,
        copied: <String>[],
      ),
    );
    await tester.pumpAndSettle();

    final buttons = tester.widgetList<Semantics>(
      find.byWidgetPredicate(
        (w) => w is Semantics && w.properties.button == true,
      ),
    );
    expect(
      buttons.map((s) => s.properties.label),
      containsAll(<String>[
        "Ссылка для друзей",
        "Копировать ссылку на подписку",
      ]),
    );
  });

  testWidgets("referral URL uses the stored code once with exactly one prefix", (
    tester,
  ) async {
    final copied = <String>[];
    await tester.pumpWidget(
      _app(referralCode: "3SET-ABC123", subscriptionLink: _link, copied: copied),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text("Ссылка для друзей"));
    await tester.pumpAndSettle();

    expect(copied, hasLength(1));
    expect(copied.single, endsWith("/?ref=3SET-ABC123"));
    expect(RegExp(r"3SET-").allMatches(copied.single), hasLength(1));
    expect(copied.single, isNot(contains("3SET-3SET-")));
    expect(find.text("Ссылка скопирована"), findsOneWidget);
  });

  testWidgets("subscription-link row copies the real server link", (
    tester,
  ) async {
    final copied = <String>[];
    await tester.pumpWidget(
      _app(referralCode: "3SET-ABC123", subscriptionLink: _link, copied: copied),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text("Копировать ссылку на подписку"));
    await tester.pumpAndSettle();

    expect(copied, <String>[_link]);
    expect(find.text("Ссылка скопирована"), findsOneWidget);
  });

  testWidgets("a NULL code produces no row and no fabricated link", (
    tester,
  ) async {
    final copied = <String>[];
    await tester.pumpWidget(
      _app(referralCode: null, subscriptionLink: null, copied: copied),
    );
    await tester.pumpAndSettle();

    expect(find.text("Ссылка для друзей"), findsNothing);
    expect(find.text("Копировать ссылку на подписку"), findsNothing);
    expect(find.textContaining("?ref="), findsNothing);
    expect(copied, isEmpty);
  });
}
