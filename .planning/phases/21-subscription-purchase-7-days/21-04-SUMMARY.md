---
phase: 21-subscription-purchase-7-days
plan: 04
subsystem: mobile
tags: [flutter, freezed, dio, riverpod, mobile-bff, pricing, promo, payment, no-simulation, ru-copy]
requires:
  - phase: 21-subscription-purchase-7-days
    provides: Plan 01 payment routes, Plan 02 subscription/grace envelope and Plan 03 pricing/promo routes define the exact JSON contracts bound here
  - phase: 19-server-pools-auto-ping-7-days
    provides: dio FutureProvider.autoDispose + degraded-error pattern and mocktail mocked-Dio test harness reused verbatim
  - phase: 18-mobile-auth-7-days
    provides: AuthInterceptor Bearer attachment/refresh and dioClientProvider used by every new provider
provides:
  - Four hand-written freezed model families (pricing, subscription, promo, payment) with generated parts from build_runner
  - Live Dio-backed pricing/subscription/promo/payment providers with one stable {ok:false,error} → Russian notice mapper
  - Presentation-only preview math that uses the server unit price and server percentage, never a client amount authority
  - 12 deterministic mocked-Dio unit tests covering decode, live routes, preview, degradation and no-simulation invariants
affects:
  - 21-05 (Shop Screen consumes these providers and models), Phase 22 (device management reads subscription.devices/deviceLimit)
actuals:
  tokens: 30374
  tasks: 3
  commits: 6
tech-stack:
  added: []
  patterns:
    - Hand-written freezed models with @JsonKey camelCase mapping; *.freezed.dart / *.g.dart generated only by build_runner
    - All four BFF routes reached through Endpoints constants via the shared DioClient; AuthInterceptor owns Bearer and 401 refresh
    - One allowlisted domain-failure table mapped to frozen Russian notices; raw provider/transport text never reaches UI
    - Preview = ceil(server unit × devices/2 × (1 − server %)); create posts intent only, no amount or discount
key-files:
  created:
    - mobile/lib/features/subscription/models/pricing.dart
    - mobile/lib/features/subscription/models/subscription.dart
    - mobile/lib/features/subscription/models/promo.dart
    - mobile/lib/features/subscription/models/payment.dart
    - mobile/test/unit/features/subscription/providers_test.dart
  modified:
    - mobile/lib/core/api/endpoints.dart
    - mobile/lib/features/subscription/providers.dart
key-decisions:
  - D-01: pricingPlansProvider reads GET /api/mobile/pricing?devices=N; no 115/400/1000/1900/3800 literal exists in Dart and no client calls ARTEMIDA.
  - D-03: previewTotalRub is presentation-only integer-RUB ceil math over the server unit price; no computed value is posted to /payments/create.
  - D-08: PromoPreview carries a percentage only and has no amount field; consumption remains in the backend createOrder.
  - D-10/D-12: statusKind, graceUntil, link and devices are decoded from the single /subscription response; the client never derives grace or entitlement.
  - D-04/D-05/D-06: payment create/status providers use the plan-01 routes and typed models; the mock dash.3set.online/payment/mock URL is gone.
  - REQ-BE-08 stays advisory/deferred: no OpenAPI→Dart generator and no new package was added to the mobile toolchain.
  - SubscriptionFailure is the single typed domain failure; unknown wire codes collapse to `internal` with frozen Russian copy so no provider string or 5xx wording reaches the UI.
patterns-established:
  - _send wraps every Dio call, reads a {ok:false,error} envelope even on 401/403/404/409 and maps transport failures to stable codes — no DioException escapes as a UI failure.
  - AsyncValue error assertions use a listener + Completer (Riverpod 3 autoDispose disposes `.future` on the error path without a listener).
  - Theme/UI state providers (term days, device count, discount, chip, processing) hold no price authority; only server data can set them.
requirements-completed: [REQ-SUB-01, REQ-SUB-03, REQ-SUB-06, REQ-SHOP-01, REQ-SHOP-02, REQ-SHOP-03, REQ-SHOP-05]
coverage:
  - id: D1
    description: Hand-written freezed models decode all four backend responses with @JsonKey camelCase mappings and generated parts
    requirement: REQ-SUB-01
    verification:
      - kind: unit
        ref: mobile/test/unit/features/subscription/providers_test.dart#model decoding
        status: pass
      - kind: other
        ref: "cd mobile && dart run build_runner build --delete-conflicting-outputs (exit 0, no conflicts)"
        status: pass
    human_judgment: false
  - id: D2
    description: Endpoints constants cover pricing, promoApply, paymentCreate and paymentStatus while keeping subscription/servers/config/keys/payments/devices
    requirement: REQ-SHOP-01
    verification:
      - kind: unit
        ref: mobile/test/unit/features/subscription/providers_test.dart#live providers (all routes are invoked via Endpoints constants)
        status: pass
    human_judgment: false
  - id: D3
    description: pricingPlansProvider emits server terms from GET /api/mobile/pricing with no hardcoded prices and reacts to device count
    requirement: REQ-SHOP-01
    verification:
      - kind: unit
        ref: mobile/test/unit/features/subscription/providers_test.dart#pricingPlansProvider emits server terms for the selected device count
        status: pass
    human_judgment: false
  - id: D4
    description: userSubscriptionProvider exposes server-derived statusKind/graceUntil/link/devices/isTrial from the single subscription endpoint
    requirement: REQ-SUB-06
    verification:
      - kind: unit
        ref: mobile/test/unit/features/subscription/providers_test.dart#userSubscriptionProvider emits server statusKind and graceUntil
        status: pass
    human_judgment: false
  - id: D5
    description: Promo preview carries only a server percentage and preview math rounds up using the server unit price
    requirement: REQ-SHOP-03
    verification:
      - kind: unit
        ref: mobile/test/unit/features/subscription/providers_test.dart#promo preview applies the server percentage to preview only
        status: pass
    human_judgment: false
  - id: D6
    description: Payment create/status providers return server order id/URL and DB status with no client amount field and no mock URL
    requirement: REQ-SHOP-05
    verification:
      - kind: unit
        ref: mobile/test/unit/features/subscription/providers_test.dart#createPaymentProvider posts intent without an amount and returns the server URL
        status: pass
      - kind: unit
        ref: mobile/test/unit/features/subscription/providers_test.dart#payment status decodes the DB-written terminal status
        status: pass
    human_judgment: false
  - id: D7
    description: All providers map {ok:false,error} and transport failures to stable Russian notices with no provider text or 5xx jargon
    requirement: REQ-SUB-03
    verification:
      - kind: unit
        ref: mobile/test/unit/features/subscription/providers_test.dart#403 no_active_key is a stable failure, not a transport exception
        status: pass
      - kind: unit
        ref: mobile/test/unit/features/subscription/providers_test.dart#unknown wire codes and transport errors never reach the UI as text
        status: pass
    human_judgment: false
  - id: D8
    description: No OpenAPI generator or new dependency introduced (REQ-BE-08 advisory deferred)
    requirement: REQ-SHOP-02
    verification:
      - kind: other
        ref: "git diff c2e16c0..HEAD -- mobile/pubspec.yaml mobile/pubspec.lock (no changes)"
        status: pass
    human_judgment: false
duration: 60 min
completed: 2026-11-28
status: complete
---

# Phase 21 Plan 04: Live subscription state and models Summary

**Four freezed model families and five Dio-backed providers replace every mock price, subscription stub and fake payment URL with the real plans 01–03 BFF contracts**

## Performance

- **Duration:** 60 min (2026-11-28T03:27:37Z → 04:27:54Z, including a 10-minute full-suite run)
- **Tasks:** 3 of 3 (tasks 1 and 2 followed TDD RED → GREEN; task 3 added remaining deterministic coverage)
- **Commits:** 5 task commits + plan metadata
- **Files modified:** 15 (4 model sources + 8 generated parts, endpoints, providers, test)

## Accomplishments

- Added hand-written freezed models for `pricing`, `subscription`, `promo` and `payment`, with `@JsonKey(name: ...)` for every camelCase backend field and generated `*.freezed.dart` / `*.g.dart` parts from `build_runner`. No amount or grace field exists on the client side.
- Added `Endpoints.pricing` and `Endpoints.promoApply`; the plan-01 `paymentCreate` / `paymentStatus` constants are reused unchanged.
- Replaced `providers.dart` entirely: `pricingPlansProvider` (GET /pricing), `userSubscriptionProvider` (GET /subscription), `promoPreviewProvider` (POST /promo/apply), `createPaymentProvider` and `paymentStatusProvider` (plan-01 routes). All decode into typed models and use `dioClientProvider`; Bearer/refresh stays in `AuthInterceptor`.
- One `SubscriptionFailure` + `subscriptionNotice()` mapper handles the `{ok:false,error}` envelope on both 200 and 401/403/404/409 responses and all transport failures. Unknown wire codes collapse to `internal` with Russian copy — no provider text, no 5xx wording.
- Kept UI-only state (term days, device count, discount percentage, payment chip, processing, server URL). `previewTotalRub` is a presentation-only `ceil(unit × devices/2 × (1 − server %))`; payment create posts only kind/days/devices/keyId/addDevices.
- 12 focused unit tests pass with mocked Dio; build_runner reports no conflicts; `flutter analyze --no-fatal-infos --no-fatal-warnings` exits 0 with no errors/warnings in 21-04 files.

## Task Commits

1. **Task 1 (RED): failing model decode tests** - `d268125` (test)
2. **Task 1 (GREEN): freezed models + endpoint constants** - `6480dc6` (feat)
3. **Task 2 (RED): failing live-provider contract tests** - `d308adb` (test)
4. **Task 2 (GREEN): live Dio-backed providers + stable mapper** - `74e652f` (feat)
5. **Task 3: promo/status/error-mapping coverage** - `2ddf947` (test)

**Plan metadata:** pending final docs commit

## Files Created/Modified

- `mobile/lib/features/subscription/models/pricing.dart` (+ `.freezed.dart`, `.g.dart`) — server-term response; amount is integer RUB from the backend
- `mobile/lib/features/subscription/models/subscription.dart` (+ generated parts) — statusKind/graceUntil/link/devices/isTrial decoded, never computed
- `mobile/lib/features/subscription/models/promo.dart` (+ generated parts) — percentage only, no amount field
- `mobile/lib/features/subscription/models/payment.dart` (+ generated parts) — create/status responses; no provider transaction or amount field
- `mobile/lib/core/api/endpoints.dart` — added `/pricing` and `/promo/apply` constants
- `mobile/lib/features/subscription/providers.dart` — five live providers, state providers, stable failure mapper and preview math
- `mobile/test/unit/features/subscription/providers_test.dart` — 12 deterministic mocked-Dio contract tests

No change to `mobile/pubspec.yaml`, `pubspec.lock`, any backend route, or the Prisma schema.

## Decisions Made

- Freezed models are hand-written and generated strictly by `build_runner`; no OpenAPI/Zod→Dart generator was introduced (REQ-BE-08 advisory recorded as deferred).
- `SubscriptionFailure` carries allowlisted machine codes only; the frozen Russian notice table is the sole UI copy source, so a new upstream code cannot leak provider text.
- Pricing uses a `FutureProvider.autoDispose` watching `deviceCountProvider` instead of a static list, so the stepper can refetch without any client-side price table.
- Payment create remains intent-only: `paymentMethod` is UI state and is deliberately not bound to the backend body (Platega has no brand-level code).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Riverpod 3 autoDispose error-path future threw `ProviderDisposedException`**
- **Found during:** Task 2 GREEN (403 `no_active_key` test)
- **Issue:** Reading `.future` of an autoDispose provider with no listener disposed it while the error was in flight, masking the typed `SubscriptionFailure`.
- **Fix:** Observe the provider through `container.listen` and assert on the emitted `AsyncValue.error`; this also matches how the Shop UI consumes errors via `AsyncValue.when`.
- **Files modified:** `mobile/test/unit/features/subscription/providers_test.dart`
- **Verification:** The 403 test now asserts `SubscriptionFailure.code == no_active_key`, the Russian notice and `isNot(isA<DioException>())`.
- **Committed in:** `74e652f`

**2. [Rule 1 - Bug] `Override` type is not exported by flutter_riverpod 3**
- **Found during:** Task 2 GREEN (first test compile)
- **Issue:** `overrides: <Override>[...]` failed to compile with `'Override' isn't a type`.
- **Fix:** Dropped the explicit generic and let `ProviderContainer` infer the override list.
- **Files modified:** `mobile/test/unit/features/subscription/providers_test.dart`
- **Verification:** Focused suite compiles and all 12 tests pass.
- **Committed in:** `74e652f`

---

**Total deviations:** 2 auto-fixed (both test-harness bugs). **Impact:** No production behavior change; no scope creep, no new dependency and no backend change.

## Issues Encountered

- `dart run build_runner build --delete-conflicting-outputs` warns that the flag is removed and ignored in this build_runner version; the build still exits 0 with no conflicts (same pre-existing behavior as plan 21-01).
- Bare `flutter analyze` reports ~1697 pre-existing info lints; `--no-fatal-infos --no-fatal-warnings` exits 0 and there are no errors or warnings in any 21-04 file (only style infos consistent with the repo baseline).
- Full `flutter test` finished 284 passed / 2 failed in two unrelated timer-based deep-link tests (`deep_link_handler_test.dart`, `deep_link_tracer_test.dart`); both pass when run in isolation and neither file was touched by this plan. Logged as pre-existing flakiness, not auto-fixed (scope boundary).
- `npx tsc --noEmit` was not run: no backend or TypeScript file was modified by this plan.

## User Setup Required

None. No new service, credential or environment variable was introduced; ARTEMIDA and Platega secrets remain server-side env-only.

## Next Phase Readiness

- Plan 05 can render the Shop Screen directly from `pricingPlansProvider`, `userSubscriptionProvider`, `promoPreviewProvider`, the UI state providers and `previewTotalRub`; no price, promo code or entitlement needs to be recomputed in the UI.
- Payment create/status providers return typed models for the WebView flow; key issuance remains exclusively in the shared webhook → outbox → worker path.
- Live payment, on-device WebView lifecycle and visual Shop UAT remain manual-only in `21-VALIDATION.md` (Platega test credentials are an external blocker).
- REQ-BE-08 (OpenAPI→Dart generation) remains advisory/deferred; no generator was added to the toolchain.

---
*Phase: 21-subscription-purchase-7-days*
*Completed: 2026-11-28*

## Self-Check: PASSED

All 15 plan files exist, all 5 task commits are present in git history, no hardcoded price or mock URL remains in providers.dart/models, generated parts are present, pubspec is unchanged, and the focused test suite plus analyzer gates are green. The two full-suite deep-link failures are pre-existing flakiness in untouched files and pass in isolation.
