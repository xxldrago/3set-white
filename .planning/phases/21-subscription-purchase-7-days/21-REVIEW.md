---
phase: 21-subscription-purchase-7-days
reviewed: 2026-11-28T05:07:17Z
depth: standard
files_reviewed: 44
files_reviewed_list:
  - app/api/mobile/payments/create/route.ts
  - app/api/mobile/payments/status/[id]/route.ts
  - app/api/mobile/pricing/route.ts
  - app/api/mobile/promo/apply/route.ts
  - app/api/mobile/servers/route.ts
  - app/api/mobile/subscription/route.ts
  - lib/subscription-view.ts
  - mobile/lib/app/router.dart
  - mobile/lib/app/router.g.dart
  - mobile/lib/core/api/endpoints.dart
  - mobile/lib/core/payment/payment_flow.dart
  - mobile/lib/features/servers/server_pool_screen.dart
  - mobile/lib/features/servers/widgets/connect_panel.dart
  - mobile/lib/features/shop/painting/confetti_overlay.dart
  - mobile/lib/features/shop/painting/ring_painter.dart
  - mobile/lib/features/shop/shop_screen.dart
  - mobile/lib/features/shop/widgets/shop_widgets.dart
  - mobile/lib/features/subscription/providers.dart
  - mobile/lib/features/subscription/models/pricing.dart
  - mobile/lib/features/subscription/models/pricing.freezed.dart
  - mobile/lib/features/subscription/models/pricing.g.dart
  - mobile/lib/features/subscription/models/subscription.dart
  - mobile/lib/features/subscription/models/subscription.freezed.dart
  - mobile/lib/features/subscription/models/subscription.g.dart
  - mobile/lib/features/subscription/models/promo.dart
  - mobile/lib/features/subscription/models/promo.freezed.dart
  - mobile/lib/features/subscription/models/promo.g.dart
  - mobile/lib/features/subscription/models/payment.dart
  - mobile/lib/features/subscription/models/payment.freezed.dart
  - mobile/lib/features/subscription/models/payment.g.dart
  - mobile/pubspec.yaml
  - mobile/test/unit/core/payment/payment_flow_test.dart
  - mobile/test/unit/features/subscription/providers_test.dart
  - mobile/test/widget/app/router_test.dart
  - mobile/test/widget/features/servers/connect_panel_test.dart
  - mobile/test/widget/features/shop/shop_screen_test.dart
  - tests/unit/mobile-config-route.test.ts
  - tests/unit/mobile-payments-route.test.ts
  - tests/unit/mobile-pricing-route.test.ts
  - tests/unit/mobile-promo-route.test.ts
  - tests/unit/mobile-servers-route.test.ts
  - tests/unit/mobile-single-issuer.test.ts
  - tests/unit/mobile-subscription-route.test.ts
  - tests/unit/subscription-grace.test.ts
findings:
  critical: 1
  warning: 2
  info: 2
  total: 5
status: issues_found
---

# Phase 21: Code Review Report

**Reviewed:** 2026-11-28T05:07:17Z
**Depth:** standard
**Files Reviewed:** 44
**Status:** issues_found

## Summary

Reviewed the full Subscription & Purchase slice: six JWT-gated mobile BFF routes, the shared server-side grace predicate (`lib/subscription-view.ts`), the Flutter provider/model layer, the real Shop Screen and its painters/widgets, the WebView payment flow, the connect gate, and the associated unit/widget tests.

The backend wrapper layer is disciplined: strict zod boundaries, ownership-scoped reads, server-quoted amounts, no provider text/secret leakage, and a single webhook → outbox → worker issuer. The 24h grace predicate is sound at the ±1ms boundary and correctly excludes trial/raw-disqualified keys.

Three concrete defects remain. One is a security gap that was explicitly required by the phase threat model but only partially implemented: the in-app WebView validates `https` but never restricts the host to the configured payment provider (T-21-06). Two are client-side requirement/behavior gaps: the REQ-SUB-06 "expires soon" banner was never built (the phase's own validation doc already escalates this), and the 3s poll does not actually start until the user dismisses the WebView because the launcher's navigation Future is awaited. Two minor dead-code items are recorded as Info.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: WebView payment URL validation has no provider-host allowlist (T-21-06)

**File:** `mobile/lib/core/payment/payment_flow.dart:155-162` (validator), `mobile/lib/core/payment/payment_flow.dart:190-196` (call site), `mobile/lib/app/router.dart:104-113` (route validator)

**Issue:** `PaymentFlow.isHttpsPaymentUrl()` accepts any value where `Uri.tryParse` yields `isAbsolute`, scheme `https`, and a non-empty host. There is no check against a configured/provider host. The phase threat model explicitly requires more: `21-01-PLAN.md:228` lists T-21-06 as "validate https **and configured provider host** before navigation" (impact `high`, strategy `mitigate`), and `21-RESEARCH.md:764` repeats "validate it is an https URL **from the configured provider**". A grep of all of `mobile/lib` finds no payment-host allowlist anywhere, so `https://evil.example/...` returned by (or redirected to from) the payment step is a valid navigation target. The mitigation is therefore only half-implemented.

Two aggravating factors:
- The real launcher (`payment_flow.dart:107-111`) pushes a plain `InAppWebView` with no `shouldOverrideUrlLoading` callback, so **subsequent** navigations from the provider page (redirects/links) are unrestricted even if the initial URL were allowlisted. The router's `/payment/webview` check at `router.dart:109` is dead code in production — the launcher uses `Navigator.push` directly, not that GoRoute — so it does not compensate.
- JS is enabled by default in `InAppWebView`, so arbitrary https content can execute inside a payment-labelled app frame (phishing/content-injection surface).

**Fix:** Introduce an allowlist of the expected Platega payment host(s) (configurable, e.g. via a constant/build-time define) and enforce it in `isHttpsPaymentUrl`:

```dart
static const Set<String> allowedPaymentHosts = {'pay.platega.io'}; // + configured host

static bool isHttpsPaymentUrl(String value) {
  final uri = Uri.tryParse(value);
  if (uri == null || !uri.isAbsolute || uri.scheme.toLowerCase() != 'https') return false;
  final host = uri.host.toLowerCase();
  return host.isNotEmpty &&
      allowedPaymentHosts.any((h) => host == h || host.endsWith('.$h'));
}
```

Additionally set `InAppWebViewSettings(javaScriptEnabled: false /* where possible */)` and a `shouldOverrideUrlLoading` callback that blocks (returns `NavigationActionPolicy.cancel`) any navigation whose host is outside the allowlist. Add unit vectors for an https URL on an untrusted host (must be `false`) in `payment_flow_test.dart:101-109`.

## Warnings

### WR-01: REQ-SUB-06 client "expires soon" banner is not implemented

**File:** `mobile/lib/features/shop/shop_screen.dart:269-288`, with widgets in `mobile/lib/features/shop/widgets/shop_widgets.dart:498-654`

**Issue:** The Shop Screen renders only three status surfaces — `ShopKeyCard`, `ShopNoKeyBanner` (when `!hasKey`), and `TrialNotice` (when `isTrial`). There is no banner for an expiring or grace-period key. `graceUntil` and `statusKind` are decoded (`subscription.dart:40-41`) but consumed only by `_hasConnectableKey` (shop_screen.dart:387-393) for connect gating; no UI notices the user that the key is near expiry / in its 24h grace window. D-10 (`21-CONTEXT.md:47`) explicitly requires "UI показывает «expires soon»-баннер", and the phase's own audit file `21-VALIDATION.md:63,128,165` marks REQ-SUB-06 client banner **NOT IMPLEMENTED / escalated as a blocker for that criterion**. This finding confirms the Nyquist auditor's report.

**Fix:** Add a stateless banner widget driven solely by server fields, and render it in `_shop`:

```dart
if (subscription.statusKind == "expiring" || subscription.graceUntil != null)
  ExpiresSoonBanner(graceUntil: subscription.graceUntil),
```

Then add a widget test asserting the notice renders for a `statusKind: "expiring"`/graced subscription and not for an active one. Fixing this would also close the one PARTIAL item in `21-VALIDATION.md`.

### WR-02: Status polling starts only after the WebView is dismissed; no in-flight "Ожидаем оплату…" feedback

**File:** `mobile/lib/core/payment/payment_flow.dart:196` (`await launcher.openPaymentPage(paymentUrl)`), launcher at `payment_flow.dart:107-111`

**Issue:** `InAppWebViewLauncher.openPaymentPage` returns `Navigator.of(context).push<void>(...)`, whose Future completes only when the pushed WebView route is **popped**. `PaymentFlow.start` awaits that Future before calling `_poll(orderId)` (line 197). With the real launcher, the 3s/100-attempt poll therefore does not run while the user is on the payment page; it begins only after the user manually navigates back. Consequences: (a) a completed payment is not detected (no confetti/subscription refresh) until the user dismisses the WebView, and if they leave it open the app never learns of success; (b) the required "Ожидаем оплату…" message from `21-CONTEXT.md:17` does not exist anywhere in the client (grep confirms zero occurrences). The unit tests use a mock launcher that completes immediately (`payment_flow_test.dart:79`), so this real-world behavior is not covered and passing tests do not disprove it.

**Fix:** Do not await navigation completion before polling — start the poll concurrently:

```dart
await store.save(orderId);
unawaited(launcher.openPaymentPage(paymentUrl)); // fire-and-forget navigation
return _poll(orderId);                            // runs while WebView is open
```

and surface a "Ожидаем оплату…" message on the Shop Screen while `paymentProcessingProvider` is true. Add a test with a launcher whose Future never completes to prove polling still starts.

## Info

### IN-01: Two unused UI-state providers

**File:** `mobile/lib/features/subscription/providers.dart:122` and `:134`

**Issue:** `promoCodeProvider` and `paymentUrlProvider` are declared but never read anywhere in `mobile/lib` (grep finds only their declarations). The active promo state is `appliedPromoCodeProvider` and the active payment URL is passed straight from the create response into `PaymentFlow`/WebView. These are leftover stubs from the pre-Phase-21 provider file.

**Fix:** Delete both declarations (and any generated references) to avoid two competing "promo code" / "payment URL" state surfaces.

### IN-02: `onProvisioned` seams are never wired in production; `/payment/webview` GoRoute is unused

**File:** `mobile/lib/core/payment/payment_flow.dart:136,153,241`; `mobile/lib/features/shop/painting/confetti_overlay.dart:80,97,146`; `mobile/lib/features/shop/shop_screen.dart:43-53,148-153`; `mobile/lib/app/router.dart:104-114`

**Issue:** The summaries emphasize an "exactly-once `onProvisioned` callback" pattern, but in production `paymentFlowStarterProvider` constructs `PaymentFlow` without `onProvisioned` and `ShopScreen` constructs `ConfettiOnStatus` without its `onProvisioned`. The subscription refresh is instead done manually in `buy()` (`shop_screen.dart:230`) and confetti is driven by `purchaseStatusProvider`. Functionally this still invalidates once, but the documented seam is dead code. Similarly, the `/payment/webview` GoRoute and its https check (`router.dart:104-113`) are referenced only by a source-assertion test (`router_test.dart:248-250`); production navigates there via `Navigator.push` instead, so the route's validation does not execute at runtime.

**Fix:** Either wire `onProvisioned: () => ref.invalidate(userSubscriptionProvider)` to `PaymentFlow` and drop the duplicate invalidation in `buy()`, or remove the unused callbacks. Route the launcher through the validated GoRoute (`context.push('/payment/webview', extra: url)`) so the router check is the single runtime gate, or delete the unreachable route.

---

_Reviewed: 2026-11-28T05:07:17Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
