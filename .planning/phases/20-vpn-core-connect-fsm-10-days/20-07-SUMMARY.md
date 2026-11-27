---
phase: 20-vpn-core-connect-fsm-10-days
plan: 07
subsystem: ui
tags: [flutter, riverpod, dart-io, libbox, fsm, connected-panel, traffic-counters]

requires:
  - phase: 20-05
    provides: "ConnectionState FSM with phase/connectedAt/rtt/ip/down/up/errorCode and cancel/disconnect"
  - phase: 20-06
    provides: "single FSM reconnect/restart semantics the panel reads without a second state machine"
  - phase: 20-02
    provides: "LibboxPingCore.traffic() with decodeTrafficSnapshot from libbox CommandStatus counters"
  - phase: 19-07
    provides: "dark AppTheme tokens and prototype ConnectPanel cell/copy layout"
provides:
  - "ConnectedStats: one cancellable 1 Hz timer, per-session tunnel IP and libbox ↓/↑ MB counters"
  - "live Connected Panel with FSM-aware button copy including tap-to-cancel"
  - "screen wiring from the panel button to connect/cancel/disconnect on the single FSM"
affects:
  - "20-08 / phase 21 — subscription gating and shop remain out of scope"
  - "phase 19/20 verification — real IP-through-tunnel and on-device counters are manual-only"

actuals:
  tokens: 8338
  tasks: 2
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Riverpod NotifierProvider watches the single FSM and owns one cancellable Timer.periodic at 1 Hz"
    - "dart:io HttpClient GET through the tunnel with InternetAddress.tryParse validation and empty-string fallback"
    - "injectable HTTP/traffic/ticker providers keep IP, counters and timer tests network-free and sleep-free"

key-files:
  created:
    - mobile/lib/core/vpn/connected_stats.dart
    - mobile/test/widget/features/servers/connect_panel_test.dart
    - mobile/test/unit/core/vpn/connected_stats_test.dart
  modified:
    - mobile/lib/features/servers/widgets/connect_panel.dart
    - mobile/lib/features/servers/server_pool_screen.dart
    - mobile/test/widget/features/servers/server_pool_screen_test.dart

key-decisions:
  - "Session identity is ConnectionState.connectedAt: a new value cancels the previous timer and invalidates the cached IP, so reconnect never shows stale live values."
  - "IP comes from a real GET to https://api.ipify.org through the tunnel with a 2 s timeout; only a parsed IP literal is accepted, anything else renders «—». No fake IP."
  - "Traffic reuses LibboxPingCore.traffic()/decodeTrafficSnapshot and formats integer bytes with a fixed two-decimal, truncation-free rule; unavailable counters render honest zeros."
  - "Button copy comes from the existing ConnPhase.buttonLabel extension; connecting/pinging routes to FSM cancel, connected to disconnect, disconnecting is disabled."
  - "All external seams (HTTP, traffic, ticker) are injectable Riverpod providers, so unit tests never use a real network, sleep or simulated data."

patterns-established:
  - "connectedStatsProvider: one 1 Hz ticker, session-scoped IP cache, fail-closed async callbacks"
  - "FSM-aware widget: panel reads metadata only, never writes phase or assembles config"

requirements-completed: [REQ-CONN-07]

coverage:
  - id: D1
    description: "Live six-cell Connected Panel: flag+city, protocol, IP, ping, HH:MM:SS timer and ↓/↑ MB from injected real values"
    requirement: REQ-CONN-07
    verification:
      - kind: unit
        ref: "test/widget/features/servers/connect_panel_test.dart#connected panel renders live IP, timer and traffic cells"
        status: pass
      - kind: unit
        ref: "test/widget/features/servers/connect_panel_test.dart#idle panel shows honest dashes and «Подключить»"
        status: pass
    human_judgment: false
  - id: D2
    description: "FSM-driven button copy with tap-to-cancel and no phase-20 stub text, bottom nav, load bar or shop purchase"
    requirement: REQ-CONN-01
    verification:
      - kind: unit
        ref: "test/widget/features/servers/connect_panel_test.dart#connecting button reads «Подключение…» and tap cancels once"
        status: pass
      - kind: unit
        ref: "test/widget/features/servers/connect_panel_test.dart#no phase-20 stub, bottom nav, load bar or shop purchase"
        status: pass
    human_judgment: false
  - id: D3
    description: "connectedStatsProvider starts one cancellable 1 Hz timer and caches a validated IP for the connected session"
    requirement: REQ-CONN-07
    verification:
      - kind: unit
        ref: "test/unit/core/vpn/connected_stats_test.dart#connected caches IP and reads traffic at 1 Hz"
        status: pass
    human_judgment: false
  - id: D4
    description: "Non-200, timeout, malformed body and raw errors yield «—»/zeros with no fabricated IP or byte value"
    requirement: REQ-CONN-07
    verification:
      - kind: unit
        ref: "test/unit/core/vpn/connected_stats_test.dart#non-200, malformed body and timeout yield an empty IP"
        status: pass
      - kind: unit
        ref: "test/unit/core/vpn/connected_stats_test.dart#raw libbox errors never reach UI values"
        status: pass
    human_judgment: false
  - id: D5
    description: "Disconnect/reconnect cancels the timer, invalidates the IP and clears stale values"
    requirement: REQ-CONN-08
    verification:
      - kind: unit
        ref: "test/unit/core/vpn/connected_stats_test.dart#leaving connected cancels timer and invalidates IP"
        status: pass
      - kind: unit
        ref: "test/unit/core/vpn/connected_stats_test.dart#reconnect resets the session, refetches IP and clears old values"
        status: pass
    human_judgment: false
  - id: D6
    description: "Real IP-through-tunnel and live libbox counters on an Android device"
    verification: []
    human_judgment: true
    rationale: "External Android JDK/SDK/NDK blocker; the plan defers on-device IP/counter UAT. Proven here by injectable-seam tests only, with no simulation."

duration: 12min
completed: 2026-11-27
status: complete
---

# Phase 20 Plan 07: Live Connected Panel Summary

**Live Connected Panel driven by the FSM with real api.ipify.org IP-through-tunnel, 1 Hz libbox traffic counters and a session timer**

## Performance

- **Duration:** 12 min
- **Started:** 2026-11-27T11:00:18Z
- **Completed:** 2026-11-27T11:12:00Z
- **Tasks:** 2 (tracer + edge-case expansion)
- **Files modified:** 6 (3 created, 3 modified)

## Accomplishments

- `connectedStatsProvider` runs exactly one cancellable 1 Hz timer while the FSM phase is `connected`, derives `HH:MM:SS` from `connectedAt`, reads `LibboxPingCore.traffic()` counters and caches the tunnel IP per session.
- The IP is fetched with a real `dart:io` `HttpClient` GET to `https://api.ipify.org` through the tunnel (2 s timeout), validated as an IP literal, and rendered «—» on any failure — no fake IP, no raw error text.
- The Connected Panel now shows flag+city, protocol, IP, ping, timer and ↓/↑ MB in the prototype dark-theme cells; the phase-19 «Туннель, IP и трафик — фаза 20» and selection-only stub copy are gone.
- Button copy follows `ConnPhase`: «Подключить» / «Подключение…» (tap cancels via the FSM) / «Отключить» / «Повторить»; no separate simulated busy state.
- Disconnect, error and reconnect cancel the timer and invalidate the cached IP; unavailable traffic renders honest zeros and no stale live value survives.
- Widget and unit tests cover all button states, live cells, IP fallback, session caching/invalidation, timer cancellation, lossless traffic decode and fixed two-decimal MB formatting. All 256 mobile tests pass; `npx prisma validate` green.

## Task Commits

Each task was committed atomically:

1. **Task 1: End-to-end Connected Panel (tracer)** — `ebc874c` (feat)
2. **Task 2: IP fallback + timer/counter edge cases** — `8d83fb2` (test)

**Plan metadata:** recorded by the final `docs(20-07)` commit (SUMMARY + STATE + ROADMAP).

## Files Created/Modified

- `mobile/lib/core/vpn/connected_stats.dart` — `ConnectedStats`, `connectedStatsProvider`, `fetchTunnelIp`, MB/elapsed formatters and injectable HTTP/traffic/ticker seams.
- `mobile/lib/features/servers/widgets/connect_panel.dart` — live six-cell panel with FSM-aware button and no stub copy.
- `mobile/lib/features/servers/server_pool_screen.dart` — wires `connectionNotifierProvider`/`connectedStatsProvider`; FSM errors mapped via `error_mapping.dart`.
- `mobile/test/widget/features/servers/connect_panel_test.dart` — six widget tests for button states and live cells.
- `mobile/test/unit/core/vpn/connected_stats_test.dart` — nine unit tests for fallback, lifecycle and formatting.
- `mobile/test/widget/features/servers/server_pool_screen_test.dart` — existing connect test updated to assert FSM wiring instead of removed stub copy.

## Decisions Made

- Session identity is `connectedAt`; a new value means a new session, so the timer and IP cache are reset.
- `api.ipify.org` with a 2 s timeout was chosen as the replaceable real endpoint; `InternetAddress.tryParse` rejects HTML/error bodies rather than inventing an address.
- Traffic reuses the existing libbox counter decode; no new plugin, dependency or native change.
- The panel never writes FSM state and never sees config, outbound, fd or tokens — metadata/counters only.
- All I/O is injectable so tests use neither real network nor `sleep`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Existing screen test asserted the removed phase-20 stub copy**
- **Found during:** Task 1 (full-suite verification)
- **Issue:** `server_pool_screen_test.dart` expected «VPN-ядро — фаза 20», which the plan explicitly removes, and had no FSM stand-in for the new wiring.
- **Fix:** Added `FakeConnectionNotifier` override and rewrote the test to assert `connect()` is invoked with no stub text.
- **Files modified:** `mobile/test/widget/features/servers/server_pool_screen_test.dart` (not in the plan's `files_modified`)
- **Verification:** Full `flutter test` green.
- **Committed in:** `ebc874c`

**2. [Rule 2 - Missing Critical] Injected IP fetcher failure could leak raw text into state**
- **Found during:** Task 2 (raw-error test)
- **Issue:** `_refreshIp` assumed `fetchTunnelIp` always fails closed; an injected or third-party fetcher throwing would propagate and could surface raw HTTP text.
- **Fix:** Wrapped the fetch in `try/catch` that yields an empty IP, matching the «—» contract.
- **Files modified:** `mobile/lib/core/vpn/connected_stats.dart`
- **Verification:** `raw libbox errors never reach UI values` passes; no raw text in `ipLabel`/`trafficLabel`.
- **Committed in:** `8d83fb2`

**3. [Rule 3 - Blocking] Dart rejected a default value in the `TunnelHttpGet` typedef**
- **Found during:** Task 2 (test compile)
- **Issue:** Function-type typedefs cannot declare default parameter values; the HTTP seam failed to compile.
- **Fix:** Made `timeout` a `required` named parameter on the typedef and `dartIoGet`; `fetchTunnelIp` still supplies its 2 s budget.
- **Files modified:** `mobile/lib/core/vpn/connected_stats.dart`, `mobile/test/unit/core/vpn/connected_stats_test.dart`
- **Verification:** Unit suite compiles and all 9 tests pass.
- **Committed in:** `8d83fb2`

---

**Total deviations:** 3 auto-fixed (1 missing-critical, 2 blocking) + 2 out-of-scope items recorded.
**Impact:** All fixes were required for correctness and a green suite; no scope creep into unrelated code.

## Issues Encountered

- Bare `flutter analyze` exits 1 on ~1632 pre-existing `info`/`warning` lints in unrelated files (0 errors). The plan's verification used `flutter analyze --no-fatal-infos --no-fatal-warnings` (exit 0), the 20-05/20-06 precedent. No unrelated file was touched.
- Real IP-through-tunnel and live libbox counters on an Android device are CI/manual-only (no JDK17/Android SDK/NDK here). No simulation was introduced.
- A pre-existing non-fatal tap hit-test warning remains in `server_pool_screen_test.dart`; it does not affect the suite result.

## Authentication Gates

None — no auth-required tooling was used during this plan.

## User Setup Required

None — no external service configuration is introduced by this plan.

## Known Stubs

- `mobile/lib/features/servers/server_pool_screen.dart` — shop/profile/logic actions remain intentional phase-21 stubs (pre-existing, D-15/D-19); already recorded in `WINDOWS.md` #18. No new stub was introduced by 20-07.

## Next Phase Readiness

Phase 20 is complete: the Connected Panel is live, FSM-driven and honest. Ready for phase verification/UAT; real IP-through-tunnel and on-device counters remain external Android-blocker checks.

---
*Phase: 20-vpn-core-connect-fsm-10-days*
*Completed: 2026-11-27*

## Self-Check: PASSED

- All six key files exist on disk.
- Task commits `ebc874c` and `8d83fb2` exist in git history.
- `flutter analyze --no-fatal-infos --no-fatal-warnings` exit 0 (0 errors), full `flutter test` 256/256 green, `npx prisma validate` green.
- No stub/TODO/FIXME pattern in the newly introduced production files.
