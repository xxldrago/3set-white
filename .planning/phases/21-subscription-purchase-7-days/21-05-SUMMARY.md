---
phase: 21-subscription-purchase-7-days
plan: 05
subsystem: mobile
tags: [flutter, custompainter, animationcontroller, riverpod, clipboard, shop, no-simulation, ru-copy, widget-test]
requires:
  - phase: 21-subscription-purchase-7-days
    provides: Plans 01 payment flow, 02 subscription/grace envelope, 03 pricing/promo routes and 04 freezed models plus live providers bound by this screen
  - phase: 19-server-pools-auto-ping-7-days
    provides: AppTheme.dark tokens, key-pill and no-key-banner copy patterns reused by the shop
  - phase: 18-mobile-auth-7-days
    provides: dioClientProvider and AuthInterceptor Bearer handling used by the payment handoff
provides:
  - Real dark Shop Screen replacing the stub: five server-quoted terms, Hit badge, 2..10 stepper with dots, promo preview feedback, persisted UI-only chips, live preview summary
  - CustomPainter days/30 ring with threshold colors and no flutter_svg/load bar
  - Status-driven CustomPainter confetti overlay with key details and real-expiresAt Russian toast
  - Clipboard.setData copy-link with «Ссылка скопирована» toast, trial block and no-key gate, no bottom navigation
  - 13 widget tests plus an updated router route test; full mobile suite 299/299 green
affects:
  - 21-06 (router/webview and no-key connect handoff consume this screen and its status seam)
  - Phase 22 (device management reads subscription.devices/deviceLimit; no device UI added here)
actuals:
  tokens: 16556
  tasks: 3
  commits: 3
tech-stack:
  added: []
  patterns:
    - Leaf widgets are stateless and constructor-injected; only the screen watches providers
    - Presentation-only preview math uses the server unit price and server percentage; no client price authority
    - UI-only payment chip state never enters the payment intent (no paymentMethod field)
    - CustomPainter ring and confetti; confetti rises only on a real DB poll success status
    - Clipboard seam defaults to Clipboard.setData and is injectable for tests
key-files:
  created:
    - mobile/lib/features/shop/widgets/shop_widgets.dart
    - mobile/lib/features/shop/painting/ring_painter.dart
    - mobile/lib/features/shop/painting/confetti_overlay.dart
    - mobile/test/widget/features/shop/shop_screen_test.dart
  modified:
    - mobile/lib/features/shop/shop_screen.dart
    - mobile/test/widget/app/router_test.dart
key-decisions:
  - D-16: the stub is replaced by a dark ConsumerWidget with frozen Russian copy; /shop stays a GoRoute with no bottom navigation, load bar or device-management UI.
  - D-01/D-03: five terms and every preview number come from server providers; the Dart layer only multiplies the server unit price and applies a server-returned percentage for display.
  - REQ-SHOP-04: МИР/VISA/MC/SBP/CRYPTO chips are persisted UI state only; no chip is bound to a Platega paymentMethod code and the create intent carries no amount or discount.
  - D-13/D-14: the ring and confetti are CustomPainters with no new dependency; confetti starts only on a rising CONFIRMED/provisioned edge and its date comes from the real expiresAt.
  - D-15: copy link uses Clipboard.setData through an injectable seam and shows «Ссылка скопирована»; the link is never logged or stored as a secret.
  - The pay action submits kind `new` (intent only): the `/api/mobile/subscription` contract has no keyId, so this plan does not fabricate a renew/upgrade request; the server still quotes and issues through the single webhook → outbox → worker path.
patterns-established:
  - Domain-success status is mirrored once by purchaseStatusProvider, so confetti cannot be driven by a timer or demo flag.
  - Provider-scoped seams (linkCopierProvider, paymentFlowStarterProvider) let widget tests assert real effects without platform channels.
requirements-completed: [REQ-SUB-02, REQ-SUB-03, REQ-SUB-05, REQ-SHOP-01, REQ-SHOP-02, REQ-SHOP-03, REQ-SHOP-04, REQ-SHOP-05, REQ-SHOP-07, REQ-SHOP-08]
coverage:
  - id: D1
    description: Dark Shop Screen with five server-term cards, Hit on 1 month, arbitrary server amounts, 2..10 stepper with dots, promo preview feedback, persisted chips and live summary
    requirement: REQ-SHOP-01
    verification:
      - kind: unit
        ref: mobile/test/widget/features/shop/shop_screen_test.dart#renders five server terms in order and hits only 1 month
        status: pass
      - kind: unit
        ref: mobile/test/widget/features/shop/shop_screen_test.dart#server amounts are used verbatim, never a Dart price table
        status: pass
      - kind: unit
        ref: mobile/test/widget/features/shop/shop_screen_test.dart#stepper stops at 2 and 10 with ten dots
        status: pass
      - kind: unit
        ref: mobile/test/widget/features/shop/shop_screen_test.dart#live summary multiplies the server unit and applies the percent
        status: pass
      - kind: unit
        ref: mobile/test/widget/features/shop/shop_screen_test.dart#payment chip selection persists across rebuilds
        status: pass
    human_judgment: false
  - id: D2
    description: Invalid promo shows a stable Russian error with no discount and no client-side price authority
    requirement: REQ-SHOP-03
    verification:
      - kind: unit
        ref: mobile/test/widget/features/shop/shop_screen_test.dart#invalid promo shows stable Russian error and no discount
        status: pass
    human_judgment: false
  - id: D3
    description: Days/30 ring is a CustomPainter with clamped progress and threshold colors, no flutter_svg or load bar
    requirement: REQ-SUB-03
    verification:
      - kind: unit
        ref: mobile/test/widget/features/shop/shop_screen_test.dart#ring is clamped and colored only by day thresholds
        status: pass
      - kind: other
        ref: "cd mobile && flutter analyze --no-fatal-infos --no-fatal-warnings (exit 0, 0 errors/warnings)"
        status: pass
    human_judgment: false
  - id: D4
    description: Confetti appears only on a real CONFIRMED/provisioned status transition, then shows key details and a toast dated from the real expiresAt
    requirement: REQ-SHOP-07
    verification:
      - kind: unit
        ref: mobile/test/widget/features/shop/shop_screen_test.dart#confetti needs a real status transition, not a timer pump
        status: pass
      - kind: unit
        ref: mobile/test/widget/features/shop/shop_screen_test.dart#a screen opened already provisioned never replays confetti
        status: pass
      - kind: unit
        ref: mobile/test/widget/features/shop/shop_screen_test.dart#pay hands intent to the real flow without amount or chip
        status: pass
    human_judgment: false
  - id: D5
    description: Trial keys hide renew/upgrade actions and show «Триал не продлевается»; no active key shows «Нужен активный ключ» with no bottom nav
    requirement: REQ-SHOP-08
    verification:
      - kind: unit
        ref: mobile/test/widget/features/shop/shop_screen_test.dart#trial hides renew/upgrade and shows the locked copy
        status: pass
      - kind: unit
        ref: mobile/test/widget/features/shop/shop_screen_test.dart#no key shows the stable gate banner and no bottom nav
        status: pass
      - kind: unit
        ref: mobile/test/widget/app/router_test.dart#shop route renders the real Shop Screen without bottom nav
        status: pass
    human_judgment: false
  - id: D6
    description: Copy link uses the Clipboard.setData seam and shows «Ссылка скопирована» without logging the link
    requirement: REQ-SUB-05
    verification:
      - kind: unit
        ref: mobile/test/widget/features/shop/shop_screen_test.dart#copy uses the clipboard seam and shows the frozen toast
        status: pass
    human_judgment: false
  - id: D7
    description: Purchase hands intent only (kind/days/devices) to the plan-01 PaymentFlow; no amount, discount or paymentMethod is sent
    requirement: REQ-SHOP-05
    verification:
      - kind: unit
        ref: mobile/test/widget/features/shop/shop_screen_test.dart#pay hands intent to the real flow without amount or chip
        status: pass
      - kind: other
        ref: "cd mobile && flutter test (299/299 passed)"
        status: pass
    human_judgment: false
  - id: D8
    description: Visual parity with the prototype and on-device confetti/ring/grace judgment
    requirement: REQ-SUB-02
    verification: []
    human_judgment: true
    rationale: Manual-only in 21-VALIDATION.md — needs a real device/key and visual comparison; no Platega test credentials and no simulated success allowed.
duration: 9 min
completed: 2026-11-28
status: complete
---

# Phase 21 Plan 05: Real Shop Screen Summary

**Server-quoted dark Shop Screen with a CustomPainter days ring, status-driven confetti and an intent-only handoff to the single WebView payment flow**

## Performance

- **Duration:** 9 min (2026-11-28T04:32:25Z → 04:41:53Z)
- **Started:** 2026-11-28T04:32:25Z
- **Completed:** 2026-11-28T04:41:53Z
- **Tasks:** 3 of 3 (all `type="auto"`)
- **Commits:** 3 task commits
- **Files modified:** 6 (4 created, 2 modified)

## Accomplishments

- Replaced the phase-19 Shop stub with a dark `ConsumerWidget`: five server-quoted terms in server order, «Хит» only on the 30-day term, a 2..10 stepper with ten dots, promo preview feedback, persisted МИР/VISA/MC/SBP/CRYPTO chips and a live base/devices/discount/total/per-day summary derived from server values only.
- Added a `CustomPainter` days/30 ring with clamped progress and lime/amber/red thresholds — no `flutter_svg`, no load bar and no fabricated metric.
- Added an `AnimationController`/`CustomPainter` confetti overlay that starts only on a real `CONFIRMED`/`provisioned` rising edge, then shows real key details and the «Подписка продлена до dd.MM.yyyy» toast from the server's `expiresAt`. No timer, sleep or demo flag drives success.
- Copy-link uses `Clipboard.setData` through an injectable seam and shows «Ссылка скопирована»; trial keys hide renew/upgrade and show «Триал не продлевается»; a key-less state shows «Нужен активный ключ». No bottom navigation was added.
- Added 13 deterministic widget tests covering all rendered behaviors and prohibitions; full mobile suite passes 299/299 with `flutter analyze --no-fatal-infos --no-fatal-warnings` exiting 0.

## Task Commits

1. **Task 1: Real dark Shop Screen and stateless widgets** - `14c4c29` (feat)
2. **Task 2: Ring and status-driven confetti painters** - `a87630c` (feat)
3. **Task 3: Shop widget tests for behavior and prohibitions** - `c5f6b30` (test, includes the directly-caused router test fix)

## Files Created/Modified

- `mobile/lib/features/shop/shop_screen.dart` - replaced stub; real ConsumerWidget with provider seams, pay handoff, trial/no-key gating and confetti wrapper
- `mobile/lib/features/shop/widgets/shop_widgets.dart` - stateless constructor-injected term cards, stepper, promo field, chips, summary, key card, gate banners and pay bar
- `mobile/lib/features/shop/painting/ring_painter.dart` - clamped days/30 `CustomPainter` and threshold colors
- `mobile/lib/features/shop/painting/confetti_overlay.dart` - `ConfettiPainter` plus status-driven `AnimationController` overlay with key details and real-date toast
- `mobile/test/widget/features/shop/shop_screen_test.dart` - 13 behavior and prohibition widget tests
- `mobile/test/widget/app/router_test.dart` - asserts the real Shop Screen instead of the removed stub

## Decisions Made

- The Shop stays a standalone GoRoute; no bottom nav, no device-management UI and no load bar (D-15/D-16, REQ-POOL-04 deferred).
- Preview amounts are presentation-only and use the server unit price with a server-returned percentage; the backend remains the sole price and amount authority (D-01/D-03).
- Payment chips are UI state only — no `paymentMethod` binding was added to the create intent (REQ-SHOP-04).
- The pay action submits `kind: "new"` with days/devices only; `/api/mobile/subscription` exposes no `keyId`, so no renew/upgrade intent was fabricated. Key issuance remains exclusively in the webhook → outbox → worker path.
- Confetti is gated on a rising real-status edge; a screen opened already provisioned does not replay it.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Router test still asserted the removed phase-21 stub**
- **Found during:** Full `flutter test` after Task 3
- **Issue:** `router_test.dart` expected «Магазин» and the shopping-bag stub icon; replacing the stub made that test fail even though the route itself is correct.
- **Fix:** Updated the test to assert `ShopScreen`, the «Покупка ключа» AppBar, absence of the stub text and absence of `NavigationBar`.
- **Files modified:** `mobile/test/widget/app/router_test.dart`
- **Verification:** Full `flutter test` then passed 299/299.
- **Committed in:** `c5f6b30`

---

**Total deviations:** 1 auto-fixed (test regression caused by the planned stub removal). **Impact:** No production behavior change, no scope creep, no new dependency.

## Issues Encountered

- Bare `flutter analyze` still reports ~1701 pre-existing info lints across the repository; `--no-fatal-infos --no-fatal-warnings` exits 0 and no 21-05 file has an error or warning. Pre-existing lints were not changed.
- `dart run build_runner build --delete-conflicting-outputs` keeps its pre-existing warning that the flag is removed and ignored; the build exits 0 with no conflicts.
- During Task 3 the first compile/test iterations found test-harness mistakes (`AppTheme.dark` is not a const expression, `byTooltip`/`byIcon` return wrapper widgets, off-screen taps and `ProviderScope` override reuse across `pumpWidget` calls). All were fixed in the test file before commit; no production code changed.
- The previously recorded flaky timer-based deep-link tests passed in the final full run; those files were not touched.
- `requirements.ready-ids` marked 9 of 10 IDs ready (REQ-SUB-02 stays blocked until sibling plan 21-06 finishes); `requirements.mark-complete` reported `not_found` for all 9 because `REQUIREMENTS.md` has no checkbox/status surface. No status surface was invented — pre-existing artifact structure, same as plans 21-02..21-04.
- Manual-only items remain in `21-VALIDATION.md`: visual parity with the prototype, on-device confetti/ring judgment and grace-on-device connection. No simulated success was used to stand in for them.

## User Setup Required

None. No new service, credential, environment variable or dependency was introduced; ARTEMIDA/Platega secrets stay server-side and the clipboard link is never logged.

## Next Phase Readiness

- Plan 06 can wire the real `/shop` route's payment continuation and no-key connect redirect against this screen; `paymentFlowStarterProvider` and `purchaseStatusProvider` are the seams it can observe or replace in tests.
- Device add/remove/limit enforcement remains Phase 22; this screen only displays the server's device count.
- Live Platega payment, WebView lifecycle and on-device visual UAT are still human-only because test credentials and a device are external blockers.
- REQ-BE-08 stays advisory/deferred: no OpenAPI→Dart generator and no new package were added.

---
*Phase: 21-subscription-purchase-7-days*
*Completed: 2026-11-28*

## Self-Check: PASSED
