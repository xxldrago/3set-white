# Phase 21 — UI Review

**Audited:** 2026-11-28
**Baseline:** Abstract 6-pillar standards + `21-CONTEXT.md` locked decisions D-13 (CustomPainter ring), D-14 (status-driven confetti), D-15 (clipboard copy), D-16 (dark Shop, RU copy, no bottom nav) + visual reference `.planning/seeds/prototype-mobile-client.html`. **No `21-UI-SPEC.md` exists** (planning used `--skip-ui`; see `21-CONTEXT.md:102-103`), so there is no approved token/spacing/copy contract to diff against — findings are measured against locked decisions, the prototype, and internal consistency.
**Screenshots:** not captured. No dev server on ports 3000/5173/8080 and no browser/Playwright MCP in this session — this is a **static code audit**. Visual-runtime verification (prototype parity, ring colors, confetti animation, real-device WebView lifecycle) remains **manual-only** and is already recorded as human UAT in `21-VALIDATION.md`. Screenshot storage is git-safe (`.planning/ui-reviews/.gitignore` created before any capture attempt).

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 3/4 | Frozen RU strings are faithful, but the empty-tariffs notice promises a retry that does not exist and the ring's `Semantics` label has broken Russian pluralization. |
| 2. Visuals | 3/4 | Strong dark-theme hierarchy and clear focal points, but the days ring diverges from the prototype focal geometry and the success overlay drops the prototype's copy action. |
| 3. Color | 3/4 | Zero hardcoded colors and verbatim prototype palette; minor semantic-color drift (promo/link) and low-contrast 10–12px `dim` helper text. |
| 4. Typography | 3/4 | Coherent three-typeface prototype scale, but 10 distinct sizes in use and 10px `labelSmall` on helper copy; section headers are smaller than their content. |
| 5. Spacing | 3/4 | Consistent 8/16 rhythm and tokenized radii, but 13 discrete gap values with no documented scale and a stacked pay bar that diverges from the prototype. |
| 6. Experience Design | 2/4 | Good loading/error/disabled/gating coverage, but `resumePending()` has no production caller, the `onProvisioned` seam is dead, and success feedback omits the key-copy action. |

**Overall: 17/24**

---

## Top 3 Priority Fixes

1. **Wire killed-app payment resume into production** — `PaymentFlow.resumePending()` is called only from tests (`payment_flow_test.dart:274,283,317,339,354,412`); no app-start caller exists, so the D-06 "continue last pending order" promise never runs and a payment completed after an app kill produces no confetti, toast or subscription refresh — add a startup bootstrap consumer that calls `resumePending()` with an `onProvisioned` callback which invalidates `userSubscriptionProvider` and sets `purchaseStatusProvider = "provisioned"`, then add a widget/unit test for the boot path.
2. **Restore the copy-link action on the success overlay** — the prototype's success modal includes `#payCopy` (`prototype-mobile-client.html:859`), but `ConfettiOnStatus._details` (`confetti_overlay.dart:232-243`) renders the link as inert text with only a «Готово» button, so the core value ("immediately get a working subscription link") requires dismissing and scrolling back to the key card — inject an `onCopyLink` callback (reusing `linkCopierProvider`) and render a tooltip'd `IconButton(icon: Icons.copy)` beside the link with the frozen «Ссылка скопирована» toast.
3. **Align the days ring with the prototype focal point** — `DaysRing` is 64px with `strokeWidth: 7` (`ring_painter.dart:72`) vs the prototype's 86px/stroke 9 (`.planning/seeds/prototype-mobile-client.html:175-181`), the prototype's centered «дней» caption is absent (`ring_painter.dart:91-98`), and `circumference = 351.86` (`ring_painter.dart:22`) is dead code while the real radius is derived from `size` (`:37`) — raise the default size to 86, add the uppercase caption under the number, and either use the documented geometry or delete the unused constant.

---

## Detailed Findings

### Pillar 1: Copywriting (3/4)

All user-facing strings are Russian and match the locked phrases: «Нужен активный ключ» (`shop_widgets.dart:588`, `connect_panel.dart:95`), «Триал не продлевается» (`shop_widgets.dart:645`), «Ссылка скопирована» (`shop_screen.dart:213`), «Ожидаем оплату…» (`shop_screen.dart:226`, `shop_widgets.dart:736`), «Подписка продлена до dd.MM.yyyy» (`confetti_overlay.dart:171-174`), «Хит» (`shop_widgets.dart:101`), «К оплате» (`shop_widgets.dart:455,791`). No English generic labels (`Submit`/`Click Here`/`OK`/`Cancel`/`Save`) appear in any audited file. Frozen error copy is centralized in `providers.dart:42-67`, so no provider/transport text reaches the UI.

- **WARNING — dead-end copy:** `shop_screen.dart:169-173` renders «Тарифы временно недоступны. Повторите позже» through `_ErrorState` **without** `onRetry`, while the pricing/subscription error branches at `:125-134` do pass a retry callback. The copy instructs an action the UI never offers. No widget test covers this empty-terms branch (`shop_screen_test.dart` has no `terms.isEmpty` / «Тарифы временно» case). Fix: pass `onRetry: () => ref.invalidate(pricingPlansProvider)` and add a widget assertion.
- **WARNING — accessibility copy:** `ring_painter.dart:84` labels the ring `"$days дней осталось"`, which is grammatically wrong for 1 день, 2–4 дня, 21+ дней. Screen-reader users hear incorrect Russian on the phase's primary status indicator. Fix: a small Russian pluralization helper (or a neutral label such as «Осталось дней: N»).
- **INFO — minor copy drift from prototype:** invalid promo reads «Промокод недействителен» (`providers.dart:50`) vs the prototype's «Промокод не найден» (`prototype-mobile-client.html:843`); success reads «Промокод применён: −N%» (`shop_screen.dart:109`) vs the prototype's «Скидка N% активна». Both are stable Russian and D-08 freezes copy here, so this is not a contract break — note only for parity review.

### Pillar 2: Visuals (3/4)

Visual hierarchy is deliberate: pinned `ShopPayBar` with a 24px display-font total and full-width lime CTA (`shop_widgets.dart:777-813`), a days ring in the key card (`shop_widgets.dart:534`), selected term cards differentiated by a 2px lime border + filled radio icon (`shop_widgets.dart:58-73`), and status banners with amber icons (`shop_widgets.dart:614,642,683,729`). Icon-only buttons carry tooltips plus `Semantics` labels (`shop_widgets.dart:167-194,566-570`; `shop_screen.dart:141-145`), and interactive term cards are wrapped in `Semantics(button: true, selected: ...)` (`shop_widgets.dart:48-51`). No `NavigationBar` exists on `/shop` (`router.dart:97-101`, `shop_screen.dart:137-155`) — D-16 satisfied.

- **WARNING — focal ring divergence:** see Top Fix 3. `ring_painter.dart:72,37` produces a 64px ring with a 28.5px radius while the prototype uses an 86px ring with `r=56`/`stroke-width: 9` and a centered «ДНЕЙ» caption (prototype lines 175-181). The unused `circumference` constant (`:22`) is a leftover from the prototype's SVG dash math and misrepresents the implemented geometry.
- **WARNING — missing copy affordance on celebration:** `confetti_overlay.dart:232-243` shows the newly issued link as inert 2-line text; the prototype's success modal exposes `#payCopy` and includes term/devices/expiry in the description (prototype lines 858-859). The current «Ключ активен» card (`:218-231`) shows only «Действует до …».
- **WARNING — section-label hierarchy:** section headers («Срок подписки» `shop_screen.dart:315-318`, «Устройства» `shop_widgets.dart:160-163`, «Промокод» `:298`, «Способ оплаты» `:380-383`) use `titleSmall` (12px, `muted`) — smaller and lighter than the 14px `bodyMedium` content they introduce. The prototype uses `.label` at 11.5px **uppercase with 0.1em tracking** (prototype line 79), which reads as a deliberate label; the Flutter version drops the uppercase/tracking treatment.
- **WARNING — «Хит» badge placement:** `shop_widgets.dart:89-106` renders the badge inline in the title row (7px `labelSmall`, lime fill); the prototype places it absolutely at the card's top-right corner, uppercase 9px with a gradient fill (prototype lines 193, 815).
- **INFO — pay-bar layout:** the prototype's bottom bar is horizontal (price block left, flex button right; prototype lines 213-217) while `ShopPayBar` stacks total → per-day → button vertically (`shop_widgets.dart:783-811`), consuming more vertical space on a 375×812 device and reducing scroll area. Functionally sound; parity note only.

### Pillar 3: Color (3/4)

All colors come from `AppTheme` tokens; **zero hardcoded hex/rgb literals** across the six audited files (grep confirmed). `theme.dart:10-64` reproduces the prototype palette verbatim, and the dark theme is forced app-wide (`theme.dart:124-155`, D-16). Accent distribution is restrained and semantic: lime-family tokens appear 14 times (selected term border/icon, dots, «Хит», prices, CTA via `onPrimary`), amber/red 13 times (warnings/errors only), teal 4 times (link/timer). This is a reasonable 60/30/10-style split — dark surfaces dominate, lime marks the primary actions.

- **WARNING — low-contrast helper text:** `AppTheme.dim` = `#6f8272` (`theme.dart:58`) is used for 10px `labelSmall` and 12px `bodySmall` helper copy (e.g., `connect_panel.dart:83,197,234`; `shop_widgets.dart:221-222`; `shop_screen.dart` per-day hints). Against `#0e1512`/`#0b110e` backgrounds this sits near the WCAG AA threshold for small text and is especially weak on a real device in daylight.
- **WARNING — semantic color drift:** promo error uses `AppTheme.red` (`#ff6b6b`, `shop_widgets.dart:339`) vs the prototype's lighter `#ffb4b4`, and promo success uses `AppTheme.lime` vs the prototype's `lime2` (`:339`); the copied link uses `teal` (`shop_widgets.dart:562`, `confetti_overlay.dart:240`) vs the prototype's `lime2` (prototype line 183). All are on-palette, so readability is fine; listed for fidelity, not a brand break.
- **INFO — gradient tokens unused:** `AppTheme.gradStart/gradEnd/gradTealStart/gradTealEnd` (`theme.dart:60-70`) are never used by the Shop; the prototype relies on gradients for the ring, «Хит» badge and selected term. Flat token substitutes were an acceptable D-13/D-16 simplification.

### Pillar 4: Typography (3/4)

Three prototype typefaces are wired correctly: Manrope body, Unbounded display, JetBrains Mono for numbers/codes (`theme.dart:75-82`), with the display face on the AppBar title (`:164-169`), big totals (`confetti_overlay.dart:220`, `shop_widgets.dart:796`) and the device counter (`shop_widgets.dart:181`). Numeric content is monospaced where the prototype monospaced it (`connect_panel.dart:175,206,240`; `shop_widgets.dart:561`). No ad-hoc `fontSize:` literals were introduced in the audited files — all sizing flows through `textTheme`.

- **WARNING — scale breadth:** 10 distinct `textTheme` styles appear in the six files (`bodySmall`×8, `bodyMedium`×7, `titleMedium`×6, `titleSmall`×5, `labelSmall`×5, `labelMedium`×3, `displaySmall`×3, `titleLarge`/`headlineSmall`/`bodyLarge`×1 each); the theme defines 10 sizes (10–32px, `theme.dart:268-359`). This exceeds the abstract guideline of ≤4 sizes, though it is a coherent Material 3 scale rather than arbitrary per-widget values — flagged because no UI-SPEC exists to authorize it.
- **WARNING — 10px helper text:** `labelSmall` (10px) carries user-facing copy in `connect_panel.dart:83` («Автопинг перед подключением · быстрый путь…») and cell labels (`:197,234`). Ten pixels is below a comfortable mobile minimum and compounds the `dim` contrast issue above.
- **INFO — weight policy:** only `w700`/`w800` are used directly in these files (6 and 1 occurrences), with `w400` inherited from body styles; two direct weights is within the abstract guideline.

### Pillar 5: Spacing (3/4)

Horizontal page padding is 18px (`shop_screen.dart:275`, `shop_widgets.dart:778`, `connect_panel.dart:63`), matching the prototype's `padding: … 18px` (prototype lines 171-173, 213). Radii use the token `AppTheme.radius = 18` plus a consistent 14 for cards/chips (`:345,529,578,609,678,779` of `shop_widgets.dart`). No arbitrary `[Npx]` values exist in the Dart files; spacing is expressed via `EdgeInsets` and `SizedBox`.

- **WARNING — undocumented gap set:** 13 distinct `SizedBox` increments are in use (2, 3, 4, 6, 8, 10, 12, 14, 16, 20px), with `height: 16`×11 and `height: 8`×10 forming a clear 8/16 rhythm but 3/6/10/14 as one-off exceptions (e.g., `shop_widgets.dart:109,219,244,460,802`). Without a UI-SPEC there is no declared scale to verify; recommend codifying 4/8/12/16/20 and replacing the outliers.
- **WARNING — chip/touch sizing drift:** `PaymentChips` uses default `FilterChip` metrics (`shop_widgets.dart:385-395`) vs the prototype's explicit 36px height and 13px horizontal padding (prototype line 208). Term-card padding is 12px symmetric (`:56`) vs the prototype's 13px (prototype line 185). Small but visible parity drift.
- **INFO — pay-bar height:** stacked layout noted under Visuals also affects spacing budget on short devices; no overlap or clipping was found in code.

### Pillar 6: Experience Design (2/4)

Positive coverage: both async providers have spinners (`shop_screen.dart:124,130`), both have retryable `_ErrorState` branches (`:125-134`), promo has error/success feedback plus a shake on a rising error edge (`shop_widgets.dart:263-345`), the pay button disables while processing (`shop_widgets.dart:809`), the stepper clamps at 2/10 with disabled icons (`shop_widgets.dart:173,192`), the no-key and trial gates are present (`:584-654`), the expiry banner is server-driven (`shop_screen.dart:287-291`, `shop_widgets.dart:659-710`, fix commit `d9b7a6f`), and the in-flight «Ожидаем оплату…» notice/toast is shown and explicitly closed in `finally` (`shop_screen.dart:221-262`, fix commit `4bcfac9`). Confetti fires only on a rising real-status edge and never replays for an already-provisioned screen (`confetti_overlay.dart:100-149`).

- **WARNING (highest) — killed-app resume is dead code:** `resumePending()` exists only in `payment_flow.dart:248` and is referenced **only** by tests (`payment_flow_test.dart:274-412`). No startup caller wires it, so D-06 / REQ-SHOP-06's continuation after an app kill never executes; a payment that settles while the app is dead yields no poll-driven status, no confetti, no toast and no invalidation through this path. Fix in Top Fix 1.
- **WARNING — documented exactly-once seam is unwired:** `paymentFlowStarterProvider` constructs `PaymentFlow` without `onProvisioned` (`shop_screen.dart:43-53`) and the screen constructs `ConfettiOnStatus` without `onProvisioned` (`:148-153`). The field exists (`payment_flow.dart:152,169,287`; `confetti_overlay.dart:80,97,146`) but is production-dead; invalidation happens manually in `buy()` (`:238`). This is prior review item **IN-01**, intentionally left unfixed in `21-REVIEW-FIX.md:23`. Functionally currently correct, but the seam silently drifts from its documentation.
- **WARNING — fallback payment page is unreachable:** the `/payment/webview` GoRoute and `_UnsafePaymentPage` (`router.dart:106-116,123-149`) are never navigated to in production — `InAppWebViewLauncher` pushes its own page via `Navigator.of(context).push` (`payment_flow.dart:107-108`). The designed «Не удалось открыть оплату» + «В магазин» error state is therefore dead; invalid URLs are instead caught in `buy()` and shown as a SnackBar (`shop_screen.dart:249-255`). Prior review item **IN-02**. The allowlist fix (`dde4984`) is applied to both paths, so this is a reachable-state issue, not a security gap.
- **WARNING — success overlay lacks the key-copy action:** see Top Fix 2.
- **WARNING — empty-tariffs state has no recovery:** see Pillar 1; also untested.
- **WARNING — misleading payment-method affordance (locked decision):** МИР/VISA/MC/SBP/CRYPTO chips persist as UI-only state (`shop_widgets.dart:348-399`) and are deliberately not sent in the create intent (`21-05-SUMMARY.md:192`, REQ-SHOP-04 UI-only resolution). The prototype's payment overlay displayed the chosen method to the user (prototype line 852), so users may believe their selection determines the payment rail. This is contract-compliant, but should be disclosed in copy (e.g., «Способ оплаты выбран на странице провайдера») or removed from a committed decision at the next UI phase.
- **INFO — runtime verification gap:** visual parity, ring threshold colors, confetti animation and WebView lifecycle are all manual-only (`21-REVIEW.md:144-149`, `21-VALIDATION.md`). No screenshots were captured in this audit; nothing here proves on-device appearance.

---

## Files Audited

- `.planning/phases/21-subscription-purchase-7-days/21-01-PLAN.md` … `21-06-PLAN.md` (intent)
- `.planning/phases/21-subscription-purchase-7-days/21-01-SUMMARY.md` … `21-06-SUMMARY.md` (actuals)
- `.planning/phases/21-subscription-purchase-7-days/21-CONTEXT.md` (locked D-13/D-14/D-15/D-16, RU copy)
- `.planning/phases/21-subscription-purchase-7-days/21-REVIEW.md`, `21-REVIEW-FIX.md` (prior findings and fix commits `d9b7a6f`, `4bcfac9`, plus `dde4984`/`34458ec`)
- `mobile/lib/features/shop/shop_screen.dart`
- `mobile/lib/features/shop/widgets/shop_widgets.dart`
- `mobile/lib/features/shop/painting/ring_painter.dart`
- `mobile/lib/features/shop/painting/confetti_overlay.dart`
- `mobile/lib/app/router.dart`
- `mobile/lib/features/servers/widgets/connect_panel.dart`
- `mobile/lib/app/theme.dart`, `mobile/lib/features/subscription/providers.dart`, `mobile/lib/core/payment/payment_flow.dart` (supporting evidence)
- `.planning/seeds/prototype-mobile-client.html` (visual reference; no UI-SPEC exists)
- `mobile/test/widget/features/shop/shop_screen_test.dart`, `mobile/test/unit/core/payment/payment_flow_test.dart` (coverage checks)

Registry audit: skipped — no `components.json` and no `21-UI-SPEC.md` registry table (no shadcn/third-party block surface to inspect).
