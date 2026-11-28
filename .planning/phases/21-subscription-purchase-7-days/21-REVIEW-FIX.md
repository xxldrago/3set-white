---
phase: 21-subscription-purchase-7-days
fixed_at: 2026-11-28T05:18:31Z
review_path: .planning/phases/21-subscription-purchase-7-days/21-REVIEW.md
iteration: 1
findings_in_scope: 3
fixed: 3
skipped: 0
status: all_fixed
---

# Phase 21: Code Review Fix Report

**Fixed at:** 2026-11-28T05:18:31Z
**Source review:** `.planning/phases/21-subscription-purchase-7-days/21-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope: 3 (CR-01, WR-01, WR-02; Critical + Warning)
- Fixed: 3
- Skipped: 0

Info findings IN-01 / IN-02 were out of scope and were intentionally not changed.

## Fixed Issues

### CR-01: WebView payment URL validation has no provider-host allowlist (T-21-06)

**Files modified:** `mobile/lib/core/payment/payment_flow.dart`, `mobile/lib/app/router.dart`, `mobile/lib/app/router.g.dart` (generated), `mobile/test/unit/core/payment/payment_flow_test.dart`
**Commit:** `dde4984` (source + tests), `34458ec` (regenerated `router.g.dart` after the doc-comment change)
**Applied fix:** Added a build-time-configurable provider-host allowlist (`PLATEGA_PAYMENT_HOST`, default `pay.platega.io` — the documented Platega hosted page host) and made `PaymentFlow.isHttpsPaymentUrl` enforce https + absolute URL + exact/subdomain allowlist match. The `/payment/webview` GoRoute reuses that validator. `PaymentWebViewPage` now sets `InAppWebViewSettings(javaScriptEnabled: false, useShouldOverrideUrlLoading: true)` and a `shouldOverrideUrlLoading` callback that returns `NavigationActionPolicy.CANCEL` for any navigation whose host leaves the allowlist, so server redirects and in-page links cannot escape it. Added negative vectors for arbitrary https hosts, suffix tricks (`pay.platega.io.evil.example`) and label tricks (`notpay.platega.io`). The `flutter_inappwebview: 6.1.5` pin is unchanged and no dependency was added.

**Status:** fixed (logic-sensitive security control — worth a human eye on the allowlist default for any custom deployment).

### WR-01: REQ-SUB-06 client "expires soon" banner is not implemented

**Files modified:** `mobile/lib/features/shop/widgets/shop_widgets.dart`, `mobile/lib/features/shop/shop_screen.dart`, `mobile/test/widget/features/shop/shop_screen_test.dart`
**Commit:** `d9b7a6f`
**Applied fix:** Added a stateless `ExpiresSoonBanner` driven solely by server fields (`statusKind == "expiring"` or non-null `graceUntil`). It renders «Истекает вскоре» plus the server-provided grace deadline (or a stable fallback copy when no deadline string is present); the client does no 24h math and defines no new contract. The Shop Screen shows it below the key card. Added three widget tests: expiring status with a grace deadline, expired key inside grace, and active key with no banner.

**Status:** fixed.

### WR-02: Status polling starts only after the WebView is dismissed; no in-flight "Ожидаем оплату…" feedback

**Files modified:** `mobile/lib/core/payment/payment_flow.dart`, `mobile/lib/features/shop/widgets/shop_widgets.dart`, `mobile/lib/features/shop/shop_screen.dart`, `mobile/test/unit/core/payment/payment_flow_test.dart`, `mobile/test/widget/features/shop/shop_screen_test.dart`
**Commit:** `4bcfac9`
**Applied fix:** `PaymentFlow.start` now uses `unawaited(launcher.openPaymentPage(paymentUrl))` and immediately returns `_poll(orderId)`, so the 3s/100 DB-status poll (and terminal status/confetti) runs while the WebView is open. Added `PaymentPendingNotice` (spinner + «Ожидаем оплату…»), rendered while `paymentProcessingProvider` is true, plus the required «Ожидаем оплату…» toast at purchase start; the toast is explicitly closed in `finally` so it never queues ahead of terminal feedback. Added a unit test with a launcher whose Future never completes (proves polling still starts and reaches `provisioned`) and widget tests for the notice and the toast.

**Status:** fixed: requires human verification (concurrent navigation/poll behavior is timing-sensitive; covered by the never-completing-launcher test but worth a real-device check).

## Verification

Gates were run in the **main checkout** (no isolated worktree was created — the orchestrator coordinates on its ~42 uncommitted user edits, and Flutter's prepared `.dart_tool` lives in the main checkout). No unrelated file was staged; every commit lists only the files it changed.

- `cd mobile && dart run build_runner build --delete-conflicting-outputs` — passed (24 outputs; only `router.g.dart` changed because it embeds the router doc comment, committed separately).
- `cd mobile && flutter analyze --no-fatal-infos --no-fatal-warnings` — exit 0, **0 errors / 0 warnings** (1736 pre-existing infos only, none newly introduced in changed files).
- `cd mobile && flutter test` — **317/317 passed**, exit 0.
- `npx vitest run` on the 8 phase-21 suites (`mobile-config-route`, `mobile-payments-route`, `mobile-pricing-route`, `mobile-promo-route`, `mobile-servers-route`, `mobile-single-issuer`, `mobile-subscription-route`, `subscription-grace`) — **8 files / 92 tests passed**, exit 0.
- Per-fix verification: targeted `dart analyze` on changed files produced no errors/warnings; targeted test runs passed at each commit.

## Skipped Issues

None.

---

_Fixed: 2026-11-28T05:18:31Z_
_Fixer: the agent (gsd-code-fixer)_
_Iteration: 1_
