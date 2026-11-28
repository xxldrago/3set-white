---
phase: 21-subscription-purchase-7-days
plan: 01
subsystem: payments
tags: [jwt, platega, flutter, webview, inappwebview, prisma, zod, vitest, dio, riverpod]
requires:
  - phase: 18-mobile-auth-7-days
    provides: JWT access tokens and verifyAccessToken used by both new routes
  - phase: 20-vpn-core-connect-fsm-10-days
    provides: mobile BFF envelope and no-5xx provider-degradation pattern
provides:
  - JWT-gated thin POST /api/mobile/payments/create over the single createOrder pipeline
  - DB-only ownership-scoped GET /api/mobile/payments/status/[id] poll
  - One Flutter purchase path: https-validated in-app WebView plus 3s/100-attempt poll
  - Pinned flutter_inappwebview 6.1.5 behind a passed blocking-human package gate
  - Wave 0 contract tests for both backend routes and the Dart flow
affects:
  - 21-02 (shared grace predicate), 21-03 (pricing/promo), 21-04 (live providers), 21-05 (Shop Screen)
actuals:
  tokens: 24168
  tasks: 3
  commits: 5
tech-stack:
  added:
    - flutter_inappwebview 6.1.5 (exact stable pin; approved at blocking-human gate)
  patterns:
    - Thin mobile BFF wrapper over shared orders-service with {ok,error} envelope, verifyAccessToken, force-dynamic, x-request-id
    - Strict zod boundary rejects any client amount/discount; amount quoted only by createOrder
    - Ownership-scoped DB-only poll with byte-identical 404 for missing/non-owned orders
    - Injectable Dart seams (PendingOrderStore / PaymentWebViewLauncher) so the real path is testable with mocked Dio
    - Success derived only from the stored provisioned DB status; no timer-driven or simulated success
key-files:
  created:
    - app/api/mobile/payments/create/route.ts
    - app/api/mobile/payments/status/[id]/route.ts
    - tests/unit/mobile-payments-route.test.ts
    - mobile/lib/core/payment/payment_flow.dart
    - mobile/test/unit/core/payment/payment_flow_test.dart
    - mobile/ios/Podfile
  modified:
    - mobile/pubspec.yaml
    - mobile/pubspec.lock
    - mobile/lib/core/api/endpoints.dart
    - mobile/ios/Flutter/Debug.xcconfig
    - mobile/ios/Flutter/Release.xcconfig
    - .planning/STATE.md
key-decisions:
  - User approved proceed-locked at the blocking decision gate: D-01, D-04, D-05, D-16 and the D-10 change to phase-19/20 gates via one shared server-side grace predicate.
  - User verified flutter_inappwebview identity/publisher, exact stable 6.1.5 (not beta) and SDK compatibility at the blocking-human package gate; only that pin was installed.
  - REQ-BE-05 is satisfied by supersession: no client-callable /keys/issue or /keys/renew route exists; webhook → outbox → worker remains the sole issuer.
  - Mobile device bounds are enforced 2..10 in the wrapper (D-02) even though the shared backend grid permits up to 9999.
patterns-established:
  - Provider-error degradation to a stable 200 code on mobile routes (never a 5xx, never provider text).
  - Only the non-secret order id is persisted; payment URL, token, transaction id and provider text never enter logs or bodies.
requirements-completed: [REQ-SHOP-06, REQ-BE-04, REQ-BE-05, REQ-BE-07]
coverage:
  - id: D1
    description: JWT-gated create route returns our order id and the server-returned payment URL with a server-quoted amount
    requirement: REQ-BE-04
    verification:
      - kind: unit
        ref: tests/unit/mobile-payments-route.test.ts#POST /api/mobile/payments/create
        status: pass
    human_judgment: false
  - id: D2
    description: Ownership-scoped DB-only status poll with identical 404 for missing/non-owned orders and no provider fields
    requirement: REQ-BE-04
    verification:
      - kind: unit
        ref: tests/unit/mobile-payments-route.test.ts#GET /api/mobile/payments/status/[id]
        status: pass
    human_judgment: false
  - id: D3
    description: One Flutter purchase path with https-validated WebView, 3s/100 poll, pending-id persistence and DB-derived success
    requirement: REQ-SHOP-06
    verification:
      - kind: unit
        ref: mobile/test/unit/core/payment/payment_flow_test.dart#one real create → WebView → poll path
        status: pass
    human_judgment: false
  - id: D4
    description: Live Platega test-mode purchase and on-device WebView lifecycle / Android debug build / iOS compile
    requirement: REQ-SHOP-06
    verification: []
    human_judgment: true
    rationale: Platega test credentials are an external blocker and WebView lifecycle needs a real device; source-level and mocked verification only in this plan.
duration: 5h 56m
completed: 2026-11-28
status: complete
---

# Phase 21 Plan 01: End-to-end purchase tracer Summary

**Thin JWT-gated mobile payment routes plus one real Flutter WebView purchase path that reuses the single webhook → outbox → worker key issuer**

## Performance

- **Duration:** 5h 56m wall clock (includes the two blocking human gates and a transport interruption; active implementation was under 1h)
- **Started:** 2026-11-27T21:11:03Z
- **Completed:** 2026-11-28T03:07:01Z
- **Tasks:** 3 of 3 (decision gate, human package gate, tracer)
- **Files modified:** 12 (7 implementation, 2 iOS scaffolding, pubspec.lock, STATE.md plus STATE decision records)

## Accomplishments

- Added `POST /api/mobile/payments/create`: strict zod body (kind/days ∈ TARIFF_DAYS/devices 2..10), `verifyAccessToken`, server-side amount via the existing `createOrder`, trial → 409 `trial`, non-owned → 404 `not_found`, and `{ok:true, orderId, paymentUrl}`.
- Added `GET /api/mobile/payments/status/[id]`: `verifyAccessToken` + zod id, `loadOrderForUserId`, only `{ok, status, paidAt, provisionedKeyId}`, no provider call and no transaction/URL/amount leak.
- Built the single Flutter path: intent-only create POST, https validation before an in-app WebView, 3s poll with a 100-attempt (5 min) cap, only the non-secret order id in `flutter_secure_storage`, cleared on terminal status.
- Installed the human-approved exact pin `flutter_inappwebview:6.1.5` and added standard Flutter iOS plugin scaffolding (`Podfile`, xcconfig includes).
- 19 backend contract tests and 9 Dart unit tests pass; `npx tsc --noEmit` and `dart run build_runner build` succeed.

## Task Commits

Each task was committed atomically:

1. **Task 1: Locked-decision gate confirmed "proceed-locked"** - `0417a13` (docs)
2. **Task 2: Human WebView package gate approved** - `88dc24f` (docs)
3. **Task 3: Tracer — backend routes + Wave 0 tests** - `bb556bd` (feat)
4. **Task 3: Tracer — Flutter WebView flow + Wave 0 tests + pinned dependency** - `3d2b707` (feat)

**Plan metadata:** `37d3bc6` (docs: summary), `aebc4c3` (docs: STATE + ROADMAP + WINDOWS)

## Files Created/Modified

- `app/api/mobile/payments/create/route.ts` - thin server-quoted create wrapper; no client amount, no second issuer
- `app/api/mobile/payments/status/[id]/route.ts` - DB-only ownership-scoped status poll
- `tests/unit/mobile-payments-route.test.ts` - auth, bounds, trial 409, ownership 404, no client amount, secret discipline
- `mobile/lib/core/payment/payment_flow.dart` - one real purchase path with injectable WebView/storage seams
- `mobile/test/unit/core/payment/payment_flow_test.dart` - mocked-Dio full-flow tests, no simulation
- `mobile/lib/core/api/endpoints.dart` - `paymentCreate` / `paymentStatus` constants
- `mobile/pubspec.yaml`, `mobile/pubspec.lock` - exact stable `flutter_inappwebview:6.1.5` pin
- `mobile/ios/Podfile`, `mobile/ios/Flutter/{Debug,Release}.xcconfig` - generated iOS plugin scaffolding required by the WebView plugin
- `.planning/STATE.md` - decision log entries for both gates

## Decisions Made

- Confirmed `proceed-locked`: D-01 server pricing, D-04 single money pipeline, D-05 in-app WebView, D-16 real Shop Screen, and D-10 shared grace predicate including the phase-19/20 gate change (user, blocking gate, Task 1).
- Verified `flutter_inappwebview` package identity, publisher, exact stable 6.1.5 and SDK compatibility at the `blocking-human` gate (user, Task 2); no substitute or beta was considered.
- `REQ-BE-05` treated as superseded by design: no client-callable key issuer was added; the existing callback/outbox/worker is the only issuer.
- Mobile-only device ceiling of 2..10 enforced in the wrapper, including upgrade totals (`currentLimit + addDevices <= 10`), while the shared backend grid stays unchanged.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Upgrade device ceiling in the mobile wrapper**
- **Found during:** Task 3 (create route implementation)
- **Issue:** The plan specified `devices` bounded 2..10 but did not bound `addDevices`; an upgrade could exceed the locked 10-device mobile ceiling (D-02).
- **Fix:** Bounded `addDevices` to 1..10 and rejected `currentLimit + addDevices > 10` with the same `bad_request` envelope.
- **Files modified:** `app/api/mobile/payments/create/route.ts`
- **Verification:** New vector "keeps upgrade inside the mobile 10-device ceiling" passes.
- **Committed in:** `bb556bd`

**2. [Rule 3 - Blocking] Standard iOS plugin scaffolding added**
- **Found during:** Task 3 (approved package install)
- **Issue:** `flutter pub add flutter_inappwebview:6.1.5` generated `mobile/ios/Podfile` and added CocoaPods includes to both xcconfigs; without them the iOS compile would fail.
- **Fix:** Staged and committed those generated files with the Flutter slice.
- **Files modified:** `mobile/ios/Podfile`, `mobile/ios/Flutter/Debug.xcconfig`, `mobile/ios/Flutter/Release.xcconfig`
- **Verification:** `flutter analyze` and `flutter test` succeed; iOS compile remains a manual device check per `21-VALIDATION.md`.
- **Committed in:** `3d2b707`

---

**Total deviations:** 2 auto-fixed (1 correctness, 1 install side effect)
**Impact on plan:** Both necessary for the locked device ceiling and a buildable iOS target; no scope creep and no new issuer.

## Issues Encountered

- **`flutter analyze` is non-zero on this repository's baseline.** Bare analysis reports 1690 pre-existing info/warning issues (including a legacy analyzer-plugin warning in `analysis_options.yaml` and single-quote/line-length infos even on import directives); our 21-01 Dart files introduce **zero errors and zero warnings**. Following the phase-20 precedent, `flutter analyze --no-fatal-infos --no-fatal-warnings` exits **0**. Per the scope boundary, pre-existing lint issues were not fixed.
- **`dart run build_runner build --delete-conflicting-outputs` warns that the flag was removed and ignored** in this build_runner version; re-ran `dart run build_runner build` successfully (exit 0, no conflicts).
- **Live payment verification is blocked** on Platega test credentials (external blocker recorded in STATE.md); no real payment was attempted, and simulation is explicitly forbidden.
- A transport timeout interrupted the executor after the Dart tests passed; no work was lost and no gate was re-run.

## User Setup Required

None for this plan. Platega test credentials and on-device WebView verification are external blockers already tracked in STATE.md and `21-VALIDATION.md`, not new setup introduced here.

## Next Phase Readiness

- Wave 1 tracer is proven: the backend and Dart contracts are in place, so Waves 2–5 (`/subscription` + shared grace predicate, `/pricing`/`promo/apply`, live providers, real Shop Screen) can build on this slice.
- The shared grace predicate in D-10 (which changes already-executed phase-19/20 `/servers` and `/config` gates) is **not implemented by this plan** — it belongs to 21-02. No gate fixture was changed here.
- Live Platega settlement, WebView lifecycle on device, Android debug build and iOS compile remain manual UAT recorded in `21-VALIDATION.md`.
- No second key issuer exists; `REQ-BE-05` is closed by supersession.

---
*Phase: 21-subscription-purchase-7-days*
*Completed: 2026-11-28*

## Self-Check: PASSED

All 7 implementation files exist, all 6 commits are present in git history, no second key-issuer route exists under `app/api/mobile/keys`, and no 21-01 file is left uncommitted.
