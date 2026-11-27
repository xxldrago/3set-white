---
phase: 20-vpn-core-connect-fsm-10-days
plan: 06
subsystem: vpn
tags: [flutter, riverpod, connectivity-plus, reconnect, backoff, fsm, dart]

requires:
  - phase: 20-05
    provides: guarded ConnectionNotifier FSM, generation token, /config gate,
      safe RU error toasts
  - phase: 19-06
    provides: real ConnectivityService stream + networkPingInvalidationProvider
      (500 ms debounce, clearPingCacheAndLastGood)
provides:
  - debounced, VPN-only-filtered network-change reconnect through the single FSM
  - RTT reselection persisted before the native restart, with one fixed toast
  - bounded 1/2/4 s restart backoff with reset on connected and cancellation
affects:
  - 20-07 (Connected Panel reads the FSM phases during reconnect/restart)
  - Phase 21 (subscription gating on live connection state)

actuals:
  tokens: 9432
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - app-level Riverpod listener owns the real connectivity subscription
    - one FSM + one generation token for connect, reconnect and core restart
    - injectable controlled Timer factory for deterministic backoff tests

key-files:
  created:
    - mobile/lib/core/vpn/restart_backoff.dart
    - mobile/test/unit/core/vpn/reconnect_test.dart
    - mobile/test/unit/core/vpn/restart_backoff_test.dart
  modified:
    - mobile/lib/core/vpn/connection_notifier.dart
    - mobile/lib/main.dart

key-decisions:
  - "D-15 confirmed by the user (blocking gate): reselect + full reconnect — "
    "server may change on a real network change; VPN-only changes ignored."
  - "Reconnect stays on the existing ConnectionNotifier FSM; no second state "
    "machine, no manual network-chip simulation."
  - "New selection is persisted via SelectionNotifier before bridge.stop(); "
    "/config is refetched for the new serverId so D-03 key expiry is enforced."
  - "Backoff uses exactly 1/2/4 s, max three retries, reset on connected, and "
    "cancels on user disconnect/cancel/provider disposal."
  - "The real connectivity subscription lives in an app-level provider so "
    "pure-Dart FSM unit tests need no Flutter platform binding."

patterns-established:
  - "connectivity → onConnectivityChanged → debounce → reconnect (single FSM)"
  - "controlled Timer factory for exact-Duration backoff assertions"

requirements-completed: [REQ-CONN-08, REQ-CONN-09, REQ-PING-05]

coverage:
  - id: D1
    description: "Debounced real connectivity listener that ignores VPN-only "
      "self-changes and only reconnects while connected"
    requirement: REQ-CONN-08
    verification:
      - kind: unit
        ref: "test/unit/core/vpn/reconnect_test.dart#VPN-only result-set deltas are ignored — no self-triggered loop"
        status: pass
    human_judgment: false
  - id: D2
    description: "WiFi→LTE invalidation, RTT reselection, persisted selection, "
      "refetched /config, full FSM restart and exactly one RU toast"
    requirement: REQ-PING-05
    verification:
      - kind: unit
        ref: "test/unit/core/vpn/reconnect_test.dart#WiFi to LTE invalidates, reselects, reconnects and toasts once"
        status: pass
      - kind: unit
        ref: "test/unit/core/ping/network_invalidation_test.dart#startup check never emits and a real network change clears ping_cache + last_good while keeping selection and current_tab"
        status: pass
    human_judgment: false
  - id: D3
    description: "Stale generation callbacks and no_active_key on refetch "
      "cannot announce a new tunnel"
    requirement: REQ-CONN-03
    verification:
      - kind: unit
        ref: "test/unit/core/vpn/reconnect_test.dart#a stale reconnect callback cannot announce a second tunnel"
        status: pass
      - kind: unit
        ref: "test/unit/core/vpn/reconnect_test.dart#no_active_key on the reconnect refetch maps to error + auth toast"
        status: pass
    human_judgment: false
  - id: D4
    description: "RestartBackoff exact 1/2/4 s delays, max three, reset and "
      "cancellation with no fourth retry"
    requirement: REQ-CONN-09
    verification:
      - kind: unit
        ref: "test/unit/core/vpn/restart_backoff_test.dart#delays are exactly 1/2/4 s, max three, then exhaustion"
        status: pass
      - kind: unit
        ref: "test/unit/core/vpn/restart_backoff_test.dart#reset after a successful connected restores the 1 s first delay"
        status: pass
      - kind: unit
        ref: "test/unit/core/vpn/restart_backoff_test.dart#cancel and dispose kill a pending timer with no later callback"
        status: pass
    human_judgment: false
  - id: D5
    description: "Native core-stop callback feeds the backoff and exhaustion "
      "maps to «VPN остановлен, попробуйте снова»"
    requirement: REQ-CONN-09
    verification:
      - kind: unit
        ref: "test/unit/core/vpn/restart_backoff_test.dart#core stop feeds the notifier backoff and exhaustion emits the toast"
        status: pass
      - kind: unit
        ref: "test/unit/core/vpn/error_mapping_test.dart#every stable code maps to its exact locked RU string"
        status: pass
    human_judgment: false
  - id: D6
    description: "Real WiFi↔LTE reconnect and native crash behaviour on an "
      "Android device"
    verification: []
    human_judgment: true
    rationale: "External Android/native blocker; the plan defers real-device "
      "WiFi↔LTE and native-abort UAT to CI/manual verification. Dart cannot "
      "catch a native abort, so the status-probe path cannot be unit-proven."

duration: 17min
completed: 2026-11-27
status: complete
---

# Phase 20 Plan 06: VPN Network-Change Reconnect and Bounded Restart Backoff Summary

**Debounced, VPN-only-filtered network-change reconnect with RTT reselection on the single FSM, plus cancellable 1/2/4 s restart backoff with reset on connected**

## Performance

- **Duration:** 17 min
- **Started:** 2026-11-27T10:38:48Z
- **Completed:** 2026-11-27T10:55:26Z
- **Tasks:** 3 (D-15 blocking decision confirmed, tracer, backoff expansion)
- **Files modified:** 5 (3 created, 2 modified)

## Accomplishments

- D-15 decision gate confirmed by the user as `reselect-reconnect`; recorded in STATE.md.
- A real OS connectivity change while `connected` is debounced 500 ms, compared as a result set, and filtered when the only delta is `ConnectivityResult.vpn` — no self-triggered loop.
- Genuine changes clear ping cache + last-good (selection and `current_tab` preserved), reselect by RTT, persist the new selection before `bridge.stop()`, refetch `/config`, and re-run `disconnecting → connecting → connected` on the same generation token with exactly one «Сеть изменена — переподключение» toast.
- `no_active_key` (403) on the reconnect refetch goes to `error` with the auth toast and starts no tunnel — key expiry is enforced at the next reconnect (D-03).
- `RestartBackoff` schedules exactly 1 s / 2 s / 4 s, at most three retries, resets on successful `connected`, cancels on user disconnect/cancel/provider disposal, and maps exhaustion to «VPN остановлен, попробуйте снова».
- Native `core_stopped` callbacks are fed through `handleCoreStopped()`; no simulated crash, fake IP, `load`, `sleep`, `Math.random` or secret logging.

## Task Commits

Each task was committed atomically:

1. **Task 1: Confirm D-15 reselect-on-network-change reconnect (blocking decision)** — no code commit; decision recorded in STATE.md and in the metadata commit.
2. **Task 2: End-to-end reconnect slice (tracer)** — `87d2a4e` (feat)
3. **Task 3: Bounded core restart backoff 1/2/4 s with reset** — `7d0d70b` (feat)

**Plan metadata:** pending close-out commit (`docs(20-06): complete ...`)

## Files Created/Modified

- `mobile/lib/core/vpn/connection_notifier.dart` — reconnect listener hooks, VPN-only filter, 500 ms debounce, reselection/persist/refetch path, `handleCoreStopped`, shared guarded `_startTunnel`.
- `mobile/lib/core/vpn/restart_backoff.dart` — `RestartBackoff` utility and `restartBackoffProvider` with controlled timer factory.
- `mobile/lib/main.dart` — watches `connectionReconnectListenerProvider` for the app lifetime; no bottom navigation reintroduced.
- `mobile/test/unit/core/vpn/reconnect_test.dart` — fake connectivity stream, DAO, selection, config and bridge; proves single toast, ignored VPN-only deltas, stale-callback guard and `no_active_key` failure.
- `mobile/test/unit/core/vpn/restart_backoff_test.dart` — exact delay order, max three, reset/cancel/dispose and notifier exhaustion toast.

## Decisions Made

- D-15 confirmed as `reselect-reconnect`; serverId may change, selection persisted before reconnect.
- Reconnect and core restart reuse the plan-05 FSM and its generation token; no second state machine.
- Real connectivity subscription lives in an app-level provider (`connectionReconnectListenerProvider`) while the notifier owns filtering, debounce and the reconnect action.
- Backoff retries reuse `_startTunnel` with an `onFailure` continuation; terminal auth/permission codes stay terminal.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Failed core restart blocked the next retry**
- **Found during:** Task 3 (notifier exhaustion test)
- **Issue:** `_restartCore` only ran from `ConnPhase.idle`, but a failed restart leaves the FSM in `connecting`; the second and third retries never scheduled.
- **Fix:** Allow `_restartCore` from both `idle` and `connecting`.
- **Files modified:** `mobile/lib/core/vpn/connection_notifier.dart`
- **Verification:** `restart_backoff_test.dart` exhaustion test now schedules 1/2/4 s and ends in `error` with the locked toast.
- **Committed in:** `7d0d70b`

**2. [Rule 3 - Blocking] Connectivity subscription broke pure-Dart FSM tests**
- **Found during:** Task 2 (tracer verification)
- **Issue:** Reading `connectivityServiceProvider` in `ConnectionNotifier.build()` constructed the real plugin; existing VPN unit tests have no Flutter binding and failed.
- **Fix:** Moved the stream subscription into `connectionReconnectListenerProvider` in the same file, watched from `App.build`; the notifier keeps filter/debounce/reconnect logic and exposes `onConnectivityChanged`.
- **Files modified:** `mobile/lib/core/vpn/connection_notifier.dart`, `mobile/lib/main.dart`, `mobile/test/unit/core/vpn/reconnect_test.dart`
- **Verification:** All 35 `test/unit/core/vpn/` tests pass, including the pre-existing cancel/state/bridge suites.
- **Committed in:** `87d2a4e`

**3. [Scope boundary] Pre-existing lint debt**
- **Found during:** Task 2 verification
- **Issue:** Bare `flutter analyze` exits 1 on ~1624 pre-existing `info`/`warning` lints in unrelated files (0 errors), so the plan's literal command cannot be green.
- **Fix:** None applied to unrelated files; used `flutter analyze --no-fatal-infos --no-fatal-warnings` (the 20-05 precedent) and confirmed zero findings in 20-06 files.
- **Files modified:** none
- **Verification:** `analyze_exit=0`; no findings in the five 20-06 files. Recorded in `.planning/WINDOWS.md` as an open lint-warning item.

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking) + 1 out-of-scope lint debt recorded.
**Impact:** All fixes were required for correctness and for the existing suite to remain green; no scope creep into unrelated code.

## Issues Encountered

- Real WiFi↔LTE and native-abort behavior remain CI/manual-only (external Android blocker); no simulation was introduced.
- Bare `flutter analyze` baseline debt handled per the scope boundary (see deviation 3).
- `requirements.mark-complete` could not check off REQ-CONN-08/09 and REQ-PING-05: `REQUIREMENTS.md` has only tables with no checkbox surface for these IDs. Completion is recorded in this SUMMARY's `requirements-completed` frontmatter and in STATE.md (same approach as 20-05).

## Authentication Gates

None — no auth-required tooling was used during this plan.

## User Setup Required

None — no external service configuration is introduced by this plan.

## Next Phase Readiness

Ready for `20-07-PLAN.md` (Connected Panel). The FSM now exposes reconnect and restart transitions with safe metadata; the panel must keep showing «—»/zeros on failed reconnect and reset its timer for the new session.

---
*Phase: 20-vpn-core-connect-fsm-10-days*
*Completed: 2026-11-27*

## Self-Check: PASSED

- All six key files exist on disk.
- Task commits `87d2a4e` and `7d0d70b` exist in git history.
- 35/35 VPN unit tests, phase-19 invalidation tests and `npx prisma validate` pass.
