---
phase: 19-server-pools-auto-ping-7-days
plan: 08
subsystem: mobile-navigation
tags: [flutter, dart, gorouter, riverpod, server-pools, prototype-layout, auth-redirect, shop-stub, no-simulation]

# Dependency graph
requires:
  - phase: 19-server-pools-auto-ping-7-days
    provides: "19-05 dark AppTheme; 19-06 ServerPoolScreen data providers and persisted PoolTab; 19-07 full prototype ServerPoolScreen with in-app shop/profile/logic stubs"
provides:
  - "GoRouter home / now renders const ServerPoolScreen() with the bottom NavigationBar and legacy int bottom-nav wiring removed"
  - "/shop ShopScreen phase-21 stub with a non-purchasing Купить action and dark prototype styling"
  - "Auth routes /auth, /register, /telegram-wait, redirect, refreshListenable and app-level deep-link/biometric listeners preserved"
  - "6 router widget/source tests; 28 widget+integration tests green, 0 analyzer errors/warnings in plan files"
affects:
  - "Phase 20 attaches the VPN core/FSM to the selected server; phase 21 replaces the /shop stub with the real purchase flow"

# Actuals — chars/4 over the realized handwritten+generated diff, same scale as the plan estimate
actuals:
  tokens: 4689
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added:
    - "no new dependency; reuses GoRouter 15+, flutter_riverpod/Riverpod 3.5, Material 3 and AppTheme.dark"
  patterns:
    - "Auth redirect stays a pure ref.read(authStateProvider) + isAuthRoute check while the router's ValueNotifier refreshes on authNotifierProvider changes"
    - "Router widget tests drive the real routerProvider with a fixed-state AuthNotifier and in-memory Drift/PingRepository overrides"
    - "Source-level guards complement widget tests for structural constraints (no bottom nav, auth wiring present)"

key-files:
  created:
    - mobile/lib/features/shop/shop_screen.dart
    - mobile/test/widget/app/router_test.dart
  modified:
    - mobile/lib/app/router.dart
    - mobile/lib/app/router.g.dart
    - mobile/lib/features/home/providers.dart

key-decisions:
  - "D-15 gate confirmed locked by the user at the checkpoint: full prototype layout, remove bottom NavigationBar, home => ServerPoolScreen, add /shop, keep auth+redirect"
  - "Deleted the legacy bottomNavIndexProvider (its last consumer was the removed NavigationBar); currentTabProvider remains the persisted PoolTab from 19-06"
  - "Profile and logic remain in-app sheet stubs on ServerPoolScreen; shop gets a real /shop route but its Купить action only shows a phase-21 SnackBar"
  - "Auth behaviour is byte-for-byte preserved: initialLocation /auth, redirect/refreshListenable, isAuthRoute, authNotifierProvider listener, context.go in auth screens and app-level deep-link/biometric listeners"
  - "No load metric, no Math.random/fake connection and no purchase/payment flow anywhere in the shipped router or shop stub"

patterns-established:
  - "A fixed-state AuthNotifier subclass plus ProviderContainer.overrideWith makes GoRouter redirect logic deterministic in widget tests"
  - "Source-level assertions guard the router's structural must-haves that widget trees cannot see (refreshListenable, isAuthRoute, absent bottom-nav wiring)"

requirements-completed: [REQ-POOL-01]

# Coverage metadata
coverage:
  - id: D1
    description: "Home route renders the full prototype ServerPoolScreen and no bottom NavigationBar"
    requirement: REQ-POOL-01
    verification:
      - kind: automated_ui
        ref: "mobile/test/widget/app/router_test.dart#home renders the pool screen without a bottom nav"
        status: pass
    human_judgment: false
  - id: D2
    description: "/shop route renders the dark phase-21 ShopScreen stub with a non-purchasing Купить action"
    requirement: REQ-POOL-01
    verification:
      - kind: automated_ui
        ref: "mobile/test/widget/app/router_test.dart#shop route shows the phase-21 stub"
        status: pass
    human_judgment: false
  - id: D3
    description: "Auth routes and redirect directions survive the layout swap"
    requirement: REQ-POOL-01
    verification:
      - kind: automated_ui
        ref: "mobile/test/widget/app/router_test.dart#unauthenticated auth routes are preserved / authenticated auth routes redirect to the pool screen / unauthenticated protected navigation redirects to auth"
        status: pass
    human_judgment: false
  - id: D4
    description: "Router source keeps refreshListenable, redirect, isAuthRoute and app-level listeners while dropping all bottom-nav int wiring"
    requirement: REQ-POOL-01
    verification:
      - kind: unit
        ref: "mobile/test/widget/app/router_test.dart#router source keeps auth wiring and drops the bottom nav"
        status: pass
    human_judgment: false
  - id: D5
    description: "On-device confirmation that the prototype layout is the only app screen and the shop stub reads as a stub"
    requirement: REQ-POOL-01
    verification: []
    human_judgment: true
    rationale: "Requires a device/simulator session and visual judgement; this environment has no interactive device. Structure and copy are covered deterministically by the widget and source tests."

# Metrics
duration: 8 min
completed: 2026-11-27
status: complete
---

# Phase 19 Plan 08: Router layout swap and shop stub Summary

**GoRouter home now renders the full prototype ServerPoolScreen with no bottom NavigationBar, a /shop phase-21 stub, and every auth route/redirect/refresh listener preserved**

## Performance

- **Duration:** 8 min
- **Started:** 2026-11-27T05:14:59Z
- **Completed:** 2026-11-27T05:23:18Z
- **Tasks:** 3 implementation tasks completed (1 D-15 decision gate confirmed `locked`, not counted in the implementation budget)
- **Files created/modified:** 5 (2 created, 3 modified)

## Accomplishments

- Replaced `_HomeScreen` with `const ServerPoolScreen()` on `/`; deleted `_HomeScreen`, `_HomeContent`, the `NavigationBar` and the last legacy int bottom-nav provider. `currentTabProvider` remains the persisted `PoolTab` from 19-06.
- Added `GoRoute(path: '/shop', name: 'shop', builder: (_ , __) => const ShopScreen())` with a dark prototype stub: «Магазин» app bar, «Купить» heading/action and an explicit phase-21 note. The action only shows a SnackBar — no purchase, payment or simulation.
- Preserved the phase-18 auth contract verbatim: `/auth`, `/register`, `/telegram-wait`, the `authStateProvider`/`isAuthRoute` redirect, `refreshListenable: authRefresh`, `ref.listen(authNotifierProvider)`, `ref.onDispose` and the app-level `deepLinkHandlerProvider`/`resumeBiometricGateProvider` in `main.dart`.
- Regenerated `router.g.dart`, added 6 router widget/source tests, and kept all 28 router/auth/integration tests green with 0 analyzer errors or warnings.

## Task Commits

Each task was committed atomically:

1. **Task 1 (`checkpoint:decision`, D-15)** — no commit; the user explicitly selected `locked` (non-implementation gate; decision recorded in STATE.md).
2. **Task 2 (`tracer`): end-to-end router swap + shop stub** — `70483a5` (feat)
3. **Task 3: shop stub refinement (`Купить` phase-21 action)** — `def6fc2` (feat)
4. **Task 4: router widget/source test slice** — `3622dc9` (test)

**Plan metadata:** included in the final `docs(19-08)` documentation commit.

_Tracer feedback gate: interactive + `end-of-phase` + automated-only `<verify>` — the tracer verify was re-run end-to-end after commit and passed; no extra checkpoint was required._

## Files Created/Modified

- `mobile/lib/app/router.dart` — home route now renders `ServerPoolScreen`, `/shop` stub route added, bottom nav and legacy home content removed, auth wiring unchanged.
- `mobile/lib/app/router.g.dart` — regenerated Riverpod provider metadata after the router rewrite.
- `mobile/lib/features/shop/shop_screen.dart` — new `ConsumerWidget` phase-21 shop stub with dark palette and non-purchasing «Купить» action.
- `mobile/lib/features/home/providers.dart` — removed `bottomNavIndexProvider` and its now-unused `legacy.dart` import; `currentTabProvider` untouched.
- `mobile/test/widget/app/router_test.dart` — 6 tests: home/no-nav, `/shop`, unauthenticated redirect, auth routes preserved, authenticated redirect, source guards.

## Decisions Made

- **D-15 gate:** the user selected `locked` — remove bottom navigation, home is the prototype pool screen, `/shop` stub added, auth preserved. The `keep-nav` option was rejected as contradictory to the locked CONTEXT decision.
- Removed the legacy `bottomNavIndexProvider` because the router was its only consumer; leaving it would contradict the D-15 full-layout change.
- Shop/profile/logic are intentionally stubs in phase 19: `/shop` is a real route (this plan), profile and logic stay in-app sheets (19-07), and the real purchase/key flows land in phase 21.
- No `load`, no simulated ping/connection/IP/traffic and no real payment path were introduced — the router and shop stub only navigate or show a stub notice.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test notifier field shadowed `AsyncNotifier.state`**
- **Found during:** Task 2 (first `flutter analyze` after writing the router test)
- **Issue:** `FakeAuthNotifier.state` collided with the inherited `AsyncValue<AuthState> state` getter (`invalid_override`).
- **Fix:** Renamed the field to `authState`.
- **Files modified:** `mobile/test/widget/app/router_test.dart`
- **Verification:** Analyzer errors/warnings dropped to 0; router tests green.
- **Committed in:** `70483a5`

**2. [Rule 1 - Bug] `ServerPoolScreen` was hidden by a narrow `show` import**
- **Found during:** Task 2 (first analyzer run)
- **Issue:** `undefined_identifier` in the router test because `server_pool_screen.dart` was imported with `show networkLabelProvider` only.
- **Fix:** Added `ServerPoolScreen` to the `show` list.
- **Files modified:** `mobile/test/widget/app/router_test.dart`
- **Verification:** 0 analyzer errors; router tests green.
- **Committed in:** `70483a5`

**3. [Rule 1 - Warning] Unused `flutter_riverpod` import after the router rewrite**
- **Found during:** Task 2 focused analysis of `router.dart`
- **Issue:** `ConsumerWidget` disappeared with `_HomeScreen`, leaving the import redundant (`unnecessary_import: warning`).
- **Fix:** Removed the import; `Ref` comes from `riverpod_annotation` and `ValueNotifier` from `material.dart`.
- **Files modified:** `mobile/lib/app/router.dart`
- **Verification:** Focused and project-wide analyze report 0 warnings/errors.
- **Committed in:** `70483a5`

**4. [Rule 1 - Cleanup] Dead legacy bottom-nav provider**
- **Found during:** Task 2 (after deleting the `NavigationBar`)
- **Issue:** `bottomNavIndexProvider` existed solely to keep the phase-18 router compiling and had no remaining consumer.
- **Fix:** Deleted the provider and its now-unused `package:flutter_riverpod/legacy.dart` import from `mobile/lib/features/home/providers.dart` (one file beyond the plan's `files_modified`, directly required by D-15).
- **Files modified:** `mobile/lib/features/home/providers.dart`
- **Verification:** Project-wide grep shows no `bottomNavIndexProvider` reference; 0 analyzer errors/warnings.
- **Committed in:** `70483a5`

---

**Total deviations:** 4 auto-fixed (3 × Rule 1 bug/warning, 1 × Rule 1 scope-contained cleanup). **Impact on plan:** no locked constraint relaxed, no scope creep — all fixes were needed to compile, remove the last bottom-nav wiring and keep the analyzer clean.

## Issues Encountered

- Plain `cd mobile && flutter analyze` still exits 1 with 1610 pre-existing `info` lints (framework-wide `material.dart` deprecation and untouched phase-18 style lints); there are **0 errors and 0 warnings**. Per the established scope-boundary pattern in this phase, only plan files were fixed; the errors-only gate was used for the tracer and task verifies.
- `dart run build_runner build --delete-conflicting-outputs` reports that the flag was removed and ignored by the installed build_runner; codegen still completed cleanly and regenerated `router.g.dart`.
- Unrelated admin files remain modified/untracked in the working tree from another process; they were deliberately left unstaged and were never part of any 19-08 commit.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 19 is complete: router, screen, data layer, backend and theme all landed. Ready for phase verification and UAT.
- Phase 20 can attach the VPN core/FSM to `ConnectController`'s selected server; the router and screen already avoid any simulated connection state.
- Phase 21 replaces the `/shop` stub and the in-app profile/logic stubs with real purchase, key and subscription flows.

## Known Stubs

- `mobile/lib/features/shop/shop_screen.dart` — the «Купить» action only shows «Магазин ключей — фаза 21»; intentional per D-15/D-19, the real shop ships in phase 21 (recorded in `.planning/WINDOWS.md`).
- `mobile/lib/features/servers/server_pool_screen.dart` — profile/logic sheet stubs and honest IP/timer/traffic dashes remain from 19-07; intentional, resolved in phases 20/21.

## Threat Flags

None new. Router→auth keeps `redirect`/`refreshListenable`/`isAuthRoute` intact (T-19-03), `/shop` performs no purchase (T-19-15) and no `Math.random`, `load` or simulated network state was added (T-19-09).

## Self-Check: PASSED

- All 5 created/modified files exist on disk, including regenerated `router.g.dart`.
- All 3 task commits verified in git history (`70483a5`, `def6fc2`, `3622dc9`); no tracked-file deletions.
- `flutter test test/widget/app/router_test.dart test/widget/features/auth/ test/integration/` → 28/28 pass.
- `flutter analyze` → 0 errors, 0 warnings (1610 pre-existing infos documented above).
- Must-have greps: 0 `NavigationBar`/`_HomeContent`/`currentTabProvider` in router, 1 `const ServerPoolScreen()`, 1 `/shop` route, 3 auth routes, 1 `refreshListenable`, 2 app-level listeners in `main.dart`.

---
*Phase: 19-server-pools-auto-ping-7-days*
*Completed: 2026-11-27*
