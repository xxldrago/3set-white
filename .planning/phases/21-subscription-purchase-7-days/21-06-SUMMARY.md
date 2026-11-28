---
phase: 21-subscription-purchase-7-days
plan: 06
subsystem: payments
tags: [flutter, riverpod, go-router, secure-storage, platega, webview, vitest, single-issuer, no-simulation]
requires:
  - phase: 21-subscription-purchase-7-days
    provides: Plans 01 payment flow, 02 server-side grace predicate, 04 live providers and 05 real Shop Screen
  - phase: 18-mobile-auth-7-days
    provides: ownership-scoped JWT routes and verified user identity for status polling
provides:
  - Killed-app payment resume from a non-secret persisted order id with honest terminal cleanup and 100-poll timeout
  - Real /shop destination and https-validated in-app payment WebView route with no deep-link confirmation side effect
  - No-active-key/no-grace connect gate with the exact «Нужен активный ключ» toast and shop redirect
  - Source-level single-issuer regression guard proving REQ-BE-05 superseded and webhook/outbox/worker invariants unchanged
  - 17 payment unit tests, 14 router/gating widget tests and 4 issuer-guard tests; full mobile suite 309/309
affects:
  - Phase 22 (device management and settings consume the same server entitlement gate)
  - 21-VALIDATION.md (live Platega payment, WebView kill/resume and grace connection stay human UAT)
actuals:
  tokens: 4248
  tasks: 3
  commits: 5
tech-stack:
  added: []
  patterns:
    - Terminal DB status is the only success source; a timer tick, a return URL or an uppercase spelling never mints success
    - Injectable onProvisioned seam invalidates the subscription exactly once on a provisioned status
    - Client mirrors the server grace-aware hasKey flag; entitlement is never recomputed locally
    - Source-level vitest guard reads files through node:fs instead of shell grep
key-files:
  created:
    - tests/unit/mobile-single-issuer.test.ts
  modified:
    - mobile/lib/core/payment/payment_flow.dart
    - mobile/test/unit/core/payment/payment_flow_test.dart
    - mobile/lib/app/router.dart
    - mobile/lib/app/router.g.dart
    - mobile/lib/features/servers/widgets/connect_panel.dart
    - mobile/lib/features/servers/server_pool_screen.dart
    - mobile/test/widget/features/servers/connect_panel_test.dart
    - mobile/test/widget/app/router_test.dart
key-decisions:
  - REQ-BE-05 is closed as SUPERSEDED, not implemented: no client-callable /keys/issue or /keys/renew route exists; the shared webhook → outbox → worker remains the sole issuer, now locked by a regression guard.
  - D-07: CONFIRMED alone is not client success; only the DB-written `provisioned` status invalidates the subscription. CANCELED/CHARGEBACKED/DISPUTED/refund clear the stored id with a non-success outcome and issue nothing.
  - D-06: the pending id is kept on timeout (100 × 3s) so the next launch can continue; no URL, token, transaction id or provider text is stored alongside it.
  - D-11: ConnectPanel consumes the server-derived `hasKey` (grace already included by the 21-02 shared predicate); the panel never computes 24h or duplicates the /servers and /config gate.
  - D-05/T-21-34: the /payment/webview route validates an absolute https URL and has no status side effect — a deep-link return can never confirm a payment.
patterns-established:
  - Terminal status normalization at the boundary (trim + lowercase) before deriving a payment outcome
  - Exactly-once domain callback (onProvisioned) rather than duplicated invalidation in the polling layer
  - Filesystem-based source assertions for cross-phase architectural invariants
requirements-completed: [REQ-SHOP-06, REQ-SUB-02, REQ-BE-04, REQ-BE-05, REQ-BE-07]
coverage:
  - id: D1
    description: Killed-app resume polls only the persisted order id, never creating a second order
    requirement: REQ-SHOP-06
    verification:
      - kind: unit
        ref: mobile/test/unit/core/payment/payment_flow_test.dart#resumes a stored PENDING order by polling, never by a second create
        status: pass
    human_judgment: false
  - id: D2
    description: Every terminal status clears the non-secret id and only CONFIRMED invalidates the subscription exactly once
    requirement: REQ-BE-04
    verification:
      - kind: unit
        ref: mobile/test/unit/core/payment/payment_flow_test.dart#clears the stored id on chargebacked without ever showing success
        status: pass
      - kind: unit
        ref: mobile/test/unit/core/payment/payment_flow_test.dart#persists only the non-secret order id
        status: pass
    human_judgment: false
  - id: D3
    description: The 100-attempt cap ends in a waiting timeout with no fake success and no premature cleanup
    requirement: REQ-SHOP-06
    verification:
      - kind: unit
        ref: mobile/test/unit/core/payment/payment_flow_test.dart#stops after the 100-attempt cap with a waiting timeout, not a fake success
        status: pass
    human_judgment: false
  - id: D4
    description: Real Shop Screen at /shop plus an https-validated WebView route, with no bottom nav or deep-link confirmation path
    requirement: REQ-SHOP-06
    verification:
      - kind: unit
        ref: mobile/test/widget/app/router_test.dart#shop route renders the real Shop Screen without bottom nav
        status: pass
      - kind: unit
        ref: mobile/test/widget/app/router_test.dart#router source keeps auth wiring and drops the bottom nav
        status: pass
    human_judgment: false
  - id: D5
    description: No-key/no-grace connect is blocked with the exact «Нужен активный ключ» toast and routes to /shop
    requirement: REQ-SUB-02
    verification:
      - kind: unit
        ref: mobile/test/widget/features/servers/connect_panel_test.dart#no-key connection is blocked with the exact toast and shop route
        status: pass
      - kind: unit
        ref: mobile/test/widget/features/servers/connect_panel_test.dart#a connectable key still drives the FSM, not the shop gate
        status: pass
    human_judgment: false
  - id: D6
    description: Single-issuer guarantee with unchanged webhook header verification, re-query, amount/currency check, one outbox row and worker idempotency key
    requirement: REQ-BE-05
    verification:
      - kind: unit
        ref: tests/unit/mobile-single-issuer.test.ts#single key issuer (REQ-BE-05 superseded / D-04 / D-07)
        status: pass
      - kind: unit
        ref: tests/unit/callback-route.test.ts + tests/unit/outbox-worker.test.ts (28/28 pass)
        status: pass
    human_judgment: false
  - id: D7
    description: Live Platega purchase, WebView kill/resume on a device and graced connection on a device
    requirement: REQ-BE-07
    verification: []
    human_judgment: true
    rationale: Platega test credentials and a physical device are external blockers; only source-level and mocked verification is possible in this phase (21-VALIDATION.md).
metrics:
  duration: 9min
  completed: 2026-11-28
status: complete
---

# Phase 21 Plan 06: Integration seams, single issuer and final guards Summary

**Pending-payment resume with honest terminal cleanup, a real Shop/WebView router pair, server-gated no-key connect, and a filesystem regression guard that locks the sole webhook → outbox → worker issuer**

## Performance

- **Duration:** 9 min (2026-11-28T04:44:15Z → 04:52:43Z)
- **Started:** 2026-11-28T04:44:15Z
- **Completed:** 2026-11-28T04:52:43Z
- **Tasks:** 3 of 3 (Task 1 followed RED → GREEN)
- **Commits:** 5 task commits (test / feat / feat / chore / test)

## Accomplishments

- Extended `PaymentFlow.resumePending()` to restart from a stored non-secret order id, normalize terminal DB statuses (including `CHARGEBACKED`/`DISPUTED`), clear the id on every terminal outcome, and call `onProvisioned` exactly once only for `provisioned`. A 100-poll cap ends in a waiting timeout with the id deliberately retained for the next launch.
- Added 8 focused Dart tests (17/17 in the payment file) proving no second create call, no fake success from a timer, no URL/token/transaction id persisted, and exact-once subscription invalidation.
- Router now serves the real Shop Screen and an https-validated `/payment/webview` route with no status side effect; ConnectPanel blocks a no-key/no-grace connect with the exact «Нужен активный ключ» toast and a real `/shop` destination while continuing to consume the server's grace-aware `hasKey`.
- Added `tests/unit/mobile-single-issuer.test.ts`, a filesystem-based guard that fails if a mobile issue/renew route or direct key-issue call appears, or if the webhook's header check, re-query, amount/currency equality, atomic one-outbox-row claim or worker idempotency key changes.
- Verification: payment tests 17/17, router/gating widget tests 14/14, full mobile suite 309/309, targeted backend suites 28/28, `npx prisma validate` clean, `build_runner` clean, analyze clean with 0 errors/warnings in 21-06 files.

## Task Commits

1. **Task 1 (RED): failing resume/terminal-cleanup/timeout tests** - `86511a5` (test)
2. **Task 1 (GREEN): resume with honest terminal cleanup and exactly-once callback** - `0cc1037` (feat)
3. **Task 2: real /shop, WebView route and no-key connect gating** - `993d4c7` (feat)
4. **Task 2 (generated): router provider regenerated after route docs** - `5d75a5a` (chore)
5. **Task 3: single-issuer regression guard** - `765880b` (test)

**Plan metadata:** final docs commit on `main` (docs: complete plan).

## Files Created/Modified

- `mobile/lib/core/payment/payment_flow.dart` - terminal normalization, `onProvisioned` seam, id cleanup on every terminal status
- `mobile/test/unit/core/payment/payment_flow_test.dart` - resume, terminal cleanup, secret discipline and timeout tests
- `mobile/lib/app/router.dart` - real Shop Screen comment plus https-validated `/payment/webview` route and safe fallback
- `mobile/lib/app/router.g.dart` - regenerated provider docs (build_runner output)
- `mobile/lib/features/servers/widgets/connect_panel.dart` - D-11 no-key toast/gate and guarded connect handler
- `mobile/lib/features/servers/server_pool_screen.dart` - shop callbacks now navigate to `/shop`; removed the phase-21 stub toast
- `mobile/test/widget/features/servers/connect_panel_test.dart` - no-key gate and key-connect widget tests
- `mobile/test/widget/app/router_test.dart` - WebView route and no-confirmation source assertions
- `tests/unit/mobile-single-issuer.test.ts` - new filesystem regression guard for the sole issuer

## Decisions Made

- `REQ-BE-05` is recorded as superseded: the existing webhook → outbox → worker path is the only issuer and a regression test now prevents a second one.
- Terminal provider spellings are normalized before mapping; `CHARGEBACKED` maps to `refunded` and `DISPUTED` to `failed`, both non-success and both clearing the stored id.
- The pending id is intentionally NOT cleared on timeout so the next app launch can resume, as required by D-06.
- No client-side entitlement math was introduced: `hasKey` remains the server's grace-aware flag from plan 02.
- No new package, no schema change and no webhook/outbox/worker edit was made to satisfy any test.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Real shop navigation needed the host screen, not just the panel**
- **Found during:** Task 2 (no-key connect gating)
- **Issue:** `ConnectPanel` is a stateless widget with injected callbacks; its `onBuy`/`onConnect` were wired to `_shopStub(context)`, which only showed «Магазин · Купить — фаза 21». Without editing the host, no tap could actually reach `/shop` and the D-11 "routes to the shop" acceptance criterion could not be met.
- **Fix:** `server_pool_screen.dart` now uses `context.go('/shop')` for the header, no-key banner and panel buy callbacks; the stub toast was deleted. `ConnectPanel` itself shows the locked toast and guards its connect handler.
- **Files modified:** `mobile/lib/features/servers/server_pool_screen.dart`, `mobile/lib/features/servers/widgets/connect_panel.dart`
- **Verification:** `connect_panel_test.dart` 8/8 and `server_pool_screen_test.dart` 11/11 pass; no stub copy remains.
- **Committed in:** `993d4c7`

**2. [Rule 3 - Blocking] Generated router provider diverged after the route comment change**
- **Found during:** Task 3 (final `build_runner` run)
- **Issue:** Riverpod copies the provider doc comment into `router.g.dart`; leaving the old stub text there would keep stale generated output in the tree.
- **Fix:** Ran `dart run build_runner build --delete-conflicting-outputs` and committed the regenerated file.
- **Files modified:** `mobile/lib/app/router.g.dart`
- **Verification:** `build_runner` exits 0 and full `flutter test` passes 309/309.
- **Committed in:** `5d75a5a`

**3. [Rule 1 - Bug] Test assertion matched a comment rather than a leaked field**
- **Found during:** Task 3 (first vitest run)
- **Issue:** The webhook secrecy assertion rejected `plategaTxId` anywhere in the source, but the file's header comment legitimately names that field while describing order resolution.
- **Fix:** Narrowed the assertion to the fields that must never be emitted (`paymentUrl`, `accessToken`, `refreshToken`).
- **Files modified:** `tests/unit/mobile-single-issuer.test.ts`
- **Verification:** Targeted vitest suites 28/28 pass.
- **Committed in:** `765880b`

---

**Total deviations:** 3 auto-fixed (1 missing critical wiring, 1 generated artifact, 1 test assertion). **Impact:** All were necessary to meet the plan's own acceptance criteria; no scope creep, no new endpoint and no money-pipeline change.

## Issues Encountered

- **TDD RED:** the first payment test run failed to compile because `onProvisioned` did not exist yet — expected RED gate before the GREEN implementation.
- **Bare `flutter analyze`** reports 1718 pre-existing info lints across the repository; `flutter analyze --no-fatal-infos --no-fatal-warnings` exits 0 and no 21-06 file has an error or warning. Pre-existing lints were not changed.
- **`npx tsc --noEmit` exits 2 with 46 errors**, all in unrelated admin/promo/`blockedAt` files touched by uncommitted user edits in the working tree. `tests/unit/mobile-single-issuer.test.ts` has zero type errors; these out-of-scope failures were not fixed.
- **`npm test` (full backend suite) has 28 failed / 74 passed files** from the same unrelated working-tree changes. The three suites in this plan's verify command (`mobile-single-issuer`, `callback-route`, `outbox-worker`) pass 28/28 together. `trial-claim` specifically cannot run because the local DB lacks `users.partner_rate_kind` from an uncommitted `prisma/schema.prisma` change with no applied migration — pre-existing and out of scope.
- **Known flaky deep-link timer tests** passed in the full 309/309 mobile run and were not modified.
- **`npx prisma validate` passes** against the working-tree schema; no schema change was made by this plan.

## User Setup Required

None. No credential, environment variable, migration or dependency was introduced. Live Platega test credentials and an on-device run remain the external blockers already recorded in `21-VALIDATION.md`.

## Next Phase Readiness

- Phase 21's automated integration seams are closed: resume/cleanup, real shop/WebView router, no-key gating and the single-issuer guard all have passing automated proof.
- Human UAT remains: live Platega test-mode purchase, WebView kill/resume and graced connect on a device, plus visual confetti/ring review and inherited phase 19/20 UAT. None was faked or simulated.
- Phase 22 can build device management on the unchanged server entitlement gate; no device mutation route was added here.

---
*Phase: 21-subscription-purchase-7-days*
*Completed: 2026-11-28*

## Self-Check: PASSED

All 9 implementation/test files and all 5 task commits exist in git history. No 21-06 file is left uncommitted; pre-existing unrelated working-tree edits were not staged.
