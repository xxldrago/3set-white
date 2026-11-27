---
phase: 19-server-pools-auto-ping-7-days
plan: 06
subsystem: mobile-data-layer
tags: [flutter, dart, riverpod, freezed, dio, drift, ping, server-pools, selection-only, ttl-cache, connectivity, no-simulation]

# Dependency graph
requires:
  - phase: 19-server-pools-auto-ping-7-days
    provides: "19-01 GET /api/mobile/servers contract (no_active_key, key metadata); 19-03 PingRepository/PingTarget/rankBest; 19-04 PingCacheDao with TTL 60s, last_good, selection and current_tab; 19-05 dark theme constants"
provides:
  - "freezed Server/ServerPools/ServerKey/PoolTab metadata models with PingTarget mapping and no load field"
  - "Locked serverPoolProvider, pingCacheProvider, bestServerProvider plus currentTabProvider (PoolTab) and per-tab selection/last-good"
  - "connect(mode) selection-only algorithm: fresh cache, <=3 last-good quick path (800ms), full ping (2000ms), manual fallback"
  - "Real-connectivity invalidation with startup skip, 500ms debounce, generation cancel and keep-on-clear"
  - "17 deterministic unit tests (12 provider + 5 network invalidation) with in-memory Drift and fake libbox"
affects:
  - "19-07 consumes these providers in the prototype screen and removes the legacy bottom-nav provider; phase 20 attaches the real VPN core/FSM to the selected server"

# Actuals — same scale as the plan estimate (chars/4 over realized handwritten diff)
actuals:
  tokens: 11864
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added:
    - "no new dependencies; reuses Riverpod 3.5 Notifier/NotifierProvider.family, freezed 4, Dio 5, Drift 2.35, connectivity_plus"
  patterns:
    - "Riverpod family providers keyed by PoolTab; async Drift seam kept behind overrideable providers for unit tests"
    - "Degraded FutureProvider: provider/network failure returns metadata-only cached pools plus error/notice instead of throwing"
    - "Generation-token cancellation shared between manual refresh and real connectivity changes"

key-files:
  created:
    - mobile/lib/features/servers/server.dart
    - mobile/lib/features/servers/server.freezed.dart
    - mobile/lib/features/servers/server.g.dart
    - mobile/lib/features/servers/providers.dart
    - mobile/test/unit/features/servers/server_pool_providers_test.dart
    - mobile/test/unit/core/ping/network_invalidation_test.dart
  modified:
    - mobile/lib/features/home/providers.dart
    - mobile/lib/app/router.dart

key-decisions:
  - "Server carries metadata only (id,name,city,cc,flag,proto,sni?,tab,host,port,protocol,outbound); no load and no raw share link; outbound stays machine-only for libbox ping"
  - "serverPoolProvider calls our BFF dio.get(Endpoints.servers) with the AuthInterceptor; client never calls ARTEMIDA"
  - "REQ-POOL-04 load bar remains deferred per D-04: ranking is RTT-only with stable input order, no load field is parsed or emitted"
  - "currentTabProvider is now a persisted PoolTab; bottomNavIndexProvider keeps the phase-18 router compiling until 19-07 deletes bottom navigation"
  - "connect(mode) is server selection only (D-18): no tunnel, no core.start, no FSM, no simulated connection"
  - "no_active_key (403/402 or body key null) blocks ping and selection with Russian banner copy; empty pools suggest switching tab"
  - "Network invalidation skips the startup connectivity emission, debounces 500ms, cancels in-flight probes and clears ping_cache+last_good while keeping selection+current_tab"

patterns-established:
  - "SelectionNotifier uses NotifierProvider.family with a per-tab instance captured in the create callback (Riverpod 3.5 has no FamilyNotifier)"
  - "Async DB writes triggered by ping callbacks are collected and awaited before the provider completes, so tests and app scopes cannot outlive them"
  - "Offline degradation is carried in ServerPools.stale/error/notice for the UI layer to render in 19-07"

requirements-completed: [REQ-POOL-01, REQ-POOL-02, REQ-POOL-03, REQ-POOL-04, REQ-POOL-05, REQ-PING-02, REQ-PING-03, REQ-PING-04, REQ-PING-05, REQ-PING-06, REQ-PING-07, REQ-PING-08]

# Coverage metadata
coverage:
  - id: D1
    description: "freezed Server/ServerPools/ServerKey/PoolTab metadata models mapping to PingTarget without load or secrets"
    requirement: REQ-POOL-03
    verification:
      - kind: unit
        ref: "mobile/test/unit/features/servers/server_pool_providers_test.dart#load is deferred: no load field is parsed or emitted"
        status: pass
    human_judgment: false
  - id: D2
    description: "serverPoolProvider fetches pools from the BFF, degrades to metadata-only Drift cache and blocks no_active_key"
    requirement: REQ-POOL-02
    verification:
      - kind: unit
        ref: "mobile/test/unit/features/servers/server_pool_providers_test.dart#no_active_key blocks ping and selection / provider failure falls back to the metadata-only Drift cache / provider failure without a cache is a retryable network error"
        status: pass
    human_judgment: false
  - id: D3
    description: "pingCacheProvider watches fresh Drift rows with the inclusive 60s TTL"
    requirement: REQ-PING-04
    verification:
      - kind: unit
        ref: "mobile/test/unit/features/servers/server_pool_providers_test.dart#pingCacheProvider exposes only rows inside the 60 s TTL"
        status: pass
    human_judgment: false
  - id: D4
    description: "bestServerProvider ranks online servers by RTT only, stably, and refuses to select when blocked or all offline"
    requirement: REQ-PING-06
    verification:
      - kind: unit
        ref: "mobile/test/unit/features/servers/server_pool_providers_test.dart#bestServerProvider ranks by RTT only and keeps offline servers last / all offline yields an error, retry hint and no selection"
        status: pass
    human_judgment: false
  - id: D5
    description: "currentTabProvider persists PoolTab; selection and last-good are independent per tab"
    requirement: REQ-PING-07
    verification:
      - kind: unit
        ref: "mobile/test/unit/features/servers/server_pool_providers_test.dart#selection, last-good and current tab are independent per tab"
        status: pass
    human_judgment: false
  - id: D6
    description: "connect(mode) selects via fresh cache, 800ms quick path, 2000ms full ping and 1500ms manual probe without starting a tunnel"
    requirement: REQ-PING-02
    verification:
      - kind: unit
        ref: "mobile/test/unit/features/servers/server_pool_providers_test.dart#end-to-end /servers -> ping cache -> best server -> connect selects without starting a tunnel / manual choice is probed first and falls back to auto when offline"
        status: pass
      - kind: other
        ref: "grep of mobile/lib/features/servers/ for core.start, Math.random and load shows only negating doc comments"
        status: pass
    human_judgment: false
  - id: D7
    description: "Real connectivity changes clear ping cache and last-good, cancel in-flight probes and re-ping, keeping selection and tab"
    requirement: REQ-PING-05
    verification:
      - kind: unit
        ref: "mobile/test/unit/core/ping/network_invalidation_test.dart#network change skips the startup emission and clears ping_cache + last_good while keeping selection and current_tab / changes are debounced for 500 ms and identical events are coalesced / a none/net transition cancels in-flight work via the generation token"
        status: pass
    human_judgment: false
  - id: D8
    description: "Manual refresh re-pings the whole tab and reports «Пинг обновлён»"
    requirement: REQ-PING-08
    verification:
      - kind: unit
        ref: "mobile/test/unit/features/servers/server_pool_providers_test.dart#manual refresh re-pings and reports «Пинг обновлён»"
        status: pass
    human_judgment: false
  - id: D9
    description: "On-device behaviour: real libbox urltest, real network transitions and rendered Russian toasts/banners"
    requirement: REQ-PING-05
    verification: []
    human_judgment: true
    rationale: "Requires a physical device with native libbox artifacts and real WiFi/LTE switches; this environment has no device session. The data layer is fully unit-tested with in-memory Drift and a fake libbox client."

# Metrics
duration: 11 min
completed: 2026-11-27
status: complete
---

# Phase 19 Plan 06: Mobile server pools, ping cache and selection Summary

**Reactive Riverpod data layer that turns the BFF server list into RTT-ranked selection with a quick last-good path, Drift TTL cache and real-connectivity invalidation — no tunnel, no load metric, no simulation**

## Performance

- **Duration:** 11 min
- **Started:** 2026-11-27T04:27:29Z
- **Completed:** 2026-11-27T04:38:21Z
- **Tasks:** 3 (1 tracer + 2 auto)
- **Files created/modified:** 8 (6 created, 2 modified)

## Accomplishments

- Added freezed `Server`, `ServerPools`, `ServerKey`, `PoolTab` with `@JsonKey` parsing, `PingTarget` mapping and generated `.freezed.dart`/`.g.dart`; no `load`, no raw link, no secrets rendered.
- Wired the locked `serverPoolProvider` to `dio.get(Endpoints.servers)` through `AuthInterceptor`, with metadata-only Drift offline fallback, `no_active_key` blocking and machine-readable degradation fields.
- Wired `pingCacheProvider` (Drift `watchFresh`, TTL 60 s), RTT-only stable `bestServerProvider`, persisted `currentTabProvider` (`PoolTab`) and per-tab `selectionProvider`/last-good.
- Implemented `connect(mode)` as selection only (D-18): fresh cache → ≤3 last-good at 800 ms → full ping at 2000 ms → manual 1500 ms probe with auto fallback; no `core.start`, FSM or simulated connection.
- Implemented real-connectivity invalidation: startup-emission skip, `distinct()`, 500 ms debounce, generation cancellation, clear ping_cache + last-good, keep selection + current tab, then re-ping.
- Added 17 deterministic unit tests; `flutter test test/unit/features/servers/ test/unit/core/ping/` passes 49/49 including the 32 existing ping tests.

## Task Commits

1. **Task 1 (tracer): end-to-end pools → ping cache → best → connect selection** — `a3fc085` (feat)
2. **Task 2: provider tests (pools, TTL, per-tab, no-key, deferred load)** — `9459ed1` (test)
3. **Task 3: network-change invalidation tests** — `1ff3d8a` (test)

**Plan metadata:** final docs commit (SUMMARY + STATE + ROADMAP).

## Files Created/Modified

- `mobile/lib/features/servers/server.dart` — freezed metadata models, `PoolTab` wire parsing and `PingTarget` mapping.
- `mobile/lib/features/servers/server.freezed.dart`, `server.g.dart` — generated freezed/json_serializable output.
- `mobile/lib/features/servers/providers.dart` — DAO/repository providers, pools, ping cache, best, selection, connect and invalidation.
- `mobile/lib/features/home/providers.dart` — `currentTabProvider` repurposed to persisted `PoolTab`; legacy `bottomNavIndexProvider`.
- `mobile/lib/app/router.dart` — bottom-nav index switched to the legacy provider so phase 18 still compiles until 19-07.
- `mobile/test/unit/features/servers/server_pool_providers_test.dart` — 12 provider/selection tests.
- `mobile/test/unit/core/ping/network_invalidation_test.dart` — 5 connectivity invalidation tests.

## Decisions Made

- REQ-POOL-04 `load` bar stays deferred (D-04): only RTT is parsed/ranked; a test asserts an incoming `load` key never reaches the model JSON.
- `connect(mode)` deliberately stops at selection; the VPN core and connection FSM belong to phase 20.
- `no_active_key` blocks before any ping; empty pools produce a retry/suggest-other-tab outcome rather than a fabricated target.
- The offline path returns metadata from `server_list_cache` and a Russian notice; the UI renders it in 19-07 (this plan creates no UI).
- Toast/banner presentation of `error`/`notice`/`stale` is data-wired here and intentionally left to the 19-07 screen.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Legacy bottom-nav provider for the phase-18 router**
- **Found during:** Task 1 (first `flutter analyze` after repurposing `currentTabProvider`)
- **Issue:** `router.dart` used `currentTabProvider` as an `int` (`selectedIndex`, `.state = index`) in five places; changing it to `PoolTab` broke compilation, while 19-07 owns bottom-nav removal.
- **Fix:** Added `bottomNavIndexProvider` (legacy `StateProvider<int>`) in `features/home/providers.dart` and switched the five router reads to it. `currentTabProvider` is now exclusively the persisted pool tab.
- **Files modified:** `mobile/lib/features/home/providers.dart`, `mobile/lib/app/router.dart`
- **Verification:** `flutter analyze` shows no error/warning in either file; router behavior unchanged.

**2. [Rule 1 - Bug] Non-throwing 403/402 responses bypassed the no-key gate**
- **Found during:** Task 2 (no-key test with a mocked Dio `Response`)
- **Issue:** `serverPoolProvider` only mapped 403/402 inside the `DioException` branch; a response carrying that status without an exception parsed as a normal payload with `error == null`.
- **Fix:** After parsing, any 403/402 status now yields `ServerPools(error: "no_active_key", ...)` before ping/selection is allowed.
- **Files modified:** `mobile/lib/features/servers/providers.dart`
- **Verification:** `no_active_key blocks ping and selection` passes and asserts zero urltest calls.

**3. [Rule 1 - Bug] Unawaited last-good writes during manual refresh**
- **Found during:** Task 2 (refresh test tear-down)
- **Issue:** `refresh()` pushed last-good rows from the `onResult` callback with `unawaited`, so SQLite work could outlive the provider/test scope ("can't re-open a closed database").
- **Fix:** Collected the futures and `await Future.wait(...)` before invalidating the ping cache and returning the outcome.
- **Files modified:** `mobile/lib/features/servers/providers.dart`
- **Verification:** All 12 provider tests pass, including manual refresh.

---

**Total deviations:** 3 auto-fixed (1 Rule 3, 2 Rule 1). **Impact:** all fixes were required for compilation, correct no-key gating and lifecycle safety; no scope creep.

## Issues Encountered

- `flutter analyze` exits with ~1622 pre-existing `info` lints in unrelated phase-18 files; zero errors/warnings in any file created or modified by this plan. Per the scope-boundary rule they were not fixed.
- `requirements.mark-complete` reported `not_found` for REQ-PING-04/05/06 because `.planning/REQUIREMENTS.md` uses table rows, not checkbox lines. No requirement checkbox exists to tick; REQ-POOL-04 is additionally deferred by D-04 and intentionally left unmarked.
- Concurrent, unrelated admin files remain modified/untracked in the working tree; only mobile plan files were staged and committed.
- `.planning/ROADMAP.md` has a pre-existing one-plan label offset: the checkbox labelled `19-06-PLAN.md` describes the `ServerPoolScreen` UI work that actually belongs to a later plan. `roadmap.update-plan-progress` counts PLAN/SUMMARY files by filename (6 of 8 now checked), so the execution state is correct; the stale description text was left untouched as out of scope.

## User Setup Required

None - no external service configuration required for this plan.

## Known Stubs

- Toast/banner rendering of `ServerPools.error`/`notice`/`stale` and `ConnectOutcome.notice` is intentionally data-only here; the 19-07 screen owns the visible banner/toast and «Купить» stub. This is plan scope, not a fabricated value.
- `bottomNavIndexProvider` is a deliberate legacy shim until 19-07 removes bottom navigation.

## Threat Flags

None new. All work stays inside the PLAN threat register: no secrets or raw links in models/logs/Drift, no client→ARTEMIDA call, real `connectivity_plus` events only (no simulated network), no `Math.random`/fake ping, no VPN core start and no `load` metric.

## Next Phase Readiness

- 19-07 can build the prototype screen directly on `serverPoolProvider`, `pingCacheProvider(tab)`, `bestServerProvider(tab)`, `currentTabProvider`, `selectionProvider(tab)` and `connectControllerProvider`, and can delete `bottomNavIndexProvider` with the bottom nav.
- Data contracts ready for UI: `ServerPools.error/notice/stale`, `ConnectOutcome.blocked/suggestOtherTab/notice`, `ConnectController.refresh(tab)`, `networkPingInvalidationProvider`.
- Open risks: on-device libbox urltest and real network switches remain human-UAT items (coverage D9); REQ-POOL-04 load bar stays deferred until a real metric exists.

---
*Phase: 19-server-pools-auto-ping-7-days*
*Completed: 2026-11-27*

## Self-Check: PASSED

- All nine created/modified files present on disk, including generated freezed/json_serializable output.
- All three task commits verified in `git log` (`a3fc085`, `9459ed1`, `1ff3d8a`), no tracked-file deletions.
- Final rerun: `flutter test test/unit/features/servers/ test/unit/core/ping/` 49/49 pass; `dart run build_runner build` clean; `flutter analyze` reports 0 errors/warnings in plan files; `npx tsc --noEmit` exit 0.
- Prohibition scan finds no `core.start`, `Math.random`, fake ping, secret logging or `load` field in production plan files (only negating doc comments).
