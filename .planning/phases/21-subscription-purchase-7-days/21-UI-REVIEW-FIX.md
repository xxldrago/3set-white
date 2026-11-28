---
phase: 21
fixed_at: 2026-11-28T05:33:36Z
review_path: .planning/phases/21-subscription-purchase-7-days/21-UI-REVIEW.md
iteration: 1
findings_in_scope: 2
fixed: 2
skipped: 0
status: all_fixed
---

# Phase 21: UI Review Fix Report

**Fixed at:** 2026-11-28T05:33:36Z
**Source review:** `.planning/phases/21-subscription-purchase-7-days/21-UI-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope: 2 (priority fixes 1 and 2 from `21-UI-REVIEW.md`)
- Fixed: 2
- Skipped: 0

Only the two explicit priority findings were in scope. Priority 3 (days-ring
focal geometry / copy caption) and the remaining Pillar 1–5 parity notes were
not requested and were left untouched.

## Fixed Issues

### P1: killed-app payment resume is dead code (D-06 / REQ-SHOP-06)

**Files modified:**
- `mobile/lib/core/payment/payment_resume_listener.dart` (new)
- `mobile/lib/main.dart`
- `mobile/test/unit/core/payment/payment_resume_listener_test.dart` (new)

**Commit:** `5b17d1c`

**Applied fix:** Added an app-level `paymentResumeListenerProvider` in
`mobile/lib/core/payment/` that builds a real `PaymentFlow` with a no-op
WebView launcher (a resume never navigates), a dedicated
`pendingOrderStoreProvider`, and an `onProvisioned` callback that invalidates
`userSubscriptionProvider` and publishes `purchaseStatusProvider =
"provisioned"`. `App.build` now watches the provider once per process, so
`resumePending()` runs exactly once at startup. A terminal result clears the
stored id; a timeout keeps it for the next launch. The provider body swallows
startup-only failures so a secure-storage error cannot break app launch.

`mobile/lib/app/router.dart` was **not** changed: the WebView route remains
side-effect free and `router_test.dart:251-252` (no `purchaseStatusProvider`
or `onProvisioned` in router source) still passes. No payment-URL allowlist,
grace predicate or single-issuer guard was touched; no simulation was added.

**Tests:** two unit tests prove the startup watch calls `resumePending()`
exactly once and that a stored `provisioned` order refreshes the subscription
provider (build count 1 → 2), clears the pending id and publishes the success
status through the real callback.

### P2: success overlay drops the prototype's copy action (D-15)

**Files modified:**
- `mobile/lib/features/shop/painting/confetti_overlay.dart`
- `mobile/lib/features/shop/shop_screen.dart`
- `mobile/test/widget/features/shop/shop_screen_test.dart`

**Commit:** `650ea16`

**Applied fix:** `ConfettiOnStatus` gained an optional `onCopyLink` seam. Its
details card now renders the link in an `Expanded` text beside a tooltip'd
`IconButton(Icons.copy)` (same pattern/tooltip as `ShopKeyCard`), shown only
when the server actually returned a non-empty link. `ShopScreen` supplies a
shared `copySubscriptionLink` helper that reuses `linkCopierProvider`
(`Clipboard.setData` in production) and the frozen «Ссылка скопирована»
toast; the key-card copy action now uses the same helper. No link, date or
key detail is fabricated.

**Tests:** three widget tests cover overlay copy via the real clipboard seam
and toast, the no-server-link case (no copy affordance), and the direct
`ConfettiOnStatus` callback path.

## Verification

Gates ran in the **main checkout** (no isolated worktree was created): the
spawning session required staging only the files changed here among 76
unrelated uncommitted user edits and running the Flutter gates in place where
`mobile/.dart_tool` already exists. No `git add -A` was used; each commit
stages only its own files.

- `cd mobile && dart run build_runner build --delete-conflicting-outputs`
  — built successfully (24 outputs; no tracked file diffs).
- `flutter analyze --no-fatal-infos --no-fatal-warnings`
  — **0 errors, 0 warnings**; 1746 infos, all pre-existing baseline lints
  (including pervasive `directives_ordering` / `prefer_relative_imports`).
- `flutter test` — **322 tests passed, 0 failed**, including
  `router_test.dart`, `payment_flow_test.dart`, the new resume-listener test
  and the updated shop-screen widget tests.
- Per-fix 3-tier verification was performed by re-reading each edited section
  and running the targeted test files before each atomic commit.

---

_Fixed: 2026-11-28T05:33:36Z_
_Fixer: the agent (gsd-code-fixer)_
_Iteration: 1_
