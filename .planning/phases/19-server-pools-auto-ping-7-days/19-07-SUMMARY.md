---
phase: 19-server-pools-auto-ping-7-days
plan: 07
subsystem: mobile-ui
tags: [flutter, dart, riverpod, freezed, prototype, server-pools, ping, aria-selected, dark-theme, no-simulation]

# Dependency graph
requires:
  - phase: 19-server-pools-auto-ping-7-days
    provides: "19-05 AppTheme.dark palette/ping colors; 19-06 Server models, serverPoolProvider, pingCacheProvider, bestServerProvider, ConnectController selection algorithm"
provides:
  - "ServerPoolScreen ConsumerWidget with the full prototype main layout (no bottom nav) and seven composed widgets"
  - "Segmented pool tabs with aria-selected parity, per-tab SNI/last-good, pingClass colors and no load bar"
  - "Key-gated banner/ConnectPanel with selection-only Подключить and 11 widget tests"
affects:
  - "19-08 swaps the router to ServerPoolScreen, removes the legacy NavigationBar and adds /shop; phase 20 attaches the VPN core/FSM"

# Actuals (#2632) — chars/4 over the realized handwritten diff
actuals:
  tokens: 16135
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added:
    - "no new dependencies; reuses Flutter Material 3, Riverpod 3.5, Drift in-memory test DB, mocktail and the existing dark theme"
  patterns:
    - "One scrollable main Column with a pinned ConnectPanel; avoids nested scroll-view overlap on short viewports"
    - "Semantics(button/selected/label) gives the segmented tabs aria-selected parity in Flutter"
    - "Widget tests override networkLabelProvider/currentUserProvider/pingRepositoryProvider and use an in-memory Drift DB; real async awaited via tester.runAsync"

key-files:
  created:
    - mobile/lib/features/servers/server_pool_screen.dart
    - mobile/lib/features/servers/widgets/server_card.dart
    - mobile/lib/features/servers/widgets/auto_select_card.dart
    - mobile/lib/features/servers/widgets/pool_tab_bar.dart
    - mobile/lib/features/servers/widgets/pool_toolbar.dart
    - mobile/lib/features/servers/widgets/connect_panel.dart
    - mobile/lib/features/servers/widgets/main_header.dart
    - mobile/lib/features/servers/widgets/no_key_banner.dart
    - mobile/test/widget/features/servers/server_pool_screen_test.dart
  modified: []

key-decisions:
  - "No bottom NavigationBar in ServerPoolScreen; the router swap stays in 19-08 per plan scope"
  - "Main column scrolls as one unit with the connect panel pinned, so the server list never collapses to zero height"
  - "Provider/offline retry banner takes precedence over the no-key banner; missing key shows Нет ключа, inactive key shows Ключ неактивен — серверы недоступны, and the panel always shows Нет активного ключа"
  - "Refresh outcomes carry no server id and never announce a phantom selection; only Подключить selections show the phase-20 notice"
  - "IP, timer and traffic render honest dashes plus «Туннель, IP и трафик — фаза 20»; no fake connection data"
  - "SNI chip is rendered only for whitelist servers; proto badge and «последний» chip use metadata/last-good, not a load bar"

patterns-established:
  - "PingBadge is the single ping renderer: pingClass -> prototype palette, offline shows офлайн/нет ответа, missing sample shows the — мс wait dash"
  - "Stubs (shop/profile/logic) are in-app toasts/bottom sheets in 19-07; the /shop route is 19-08 and the real flows are 19-21"

requirements-completed: [REQ-POOL-01, REQ-POOL-02, REQ-POOL-03, REQ-POOL-05, REQ-PING-01, REQ-PING-02, REQ-PING-03, REQ-PING-07, REQ-PING-08]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "Full prototype main screen: brand/greeting/status/key/date header, banner, two tabs, toolbar, scrollable list, connect panel"
    requirement: REQ-POOL-01
    verification:
      - kind: automated_ui
        ref: "mobile/test/widget/features/servers/server_pool_screen_test.dart#renders the full prototype main screen"
        status: pass
    human_judgment: true
    rationale: "Pixel-level fidelity to the seed prototype and dark-theme feel require human visual review; the test proves structure, not aesthetics."
  - id: D2
    description: "Two segmented tabs with aria-selected parity, per-tab mode description and switching without teardown"
    requirement: REQ-POOL-01
    verification:
      - kind: automated_ui
        ref: "mobile/test/widget/features/servers/server_pool_screen_test.dart#both tabs expose aria-selected and switch without teardown"
        status: pass
    human_judgment: false
  - id: D3
    description: "Server cards show proto badge, whitelist-only SNI and the «последний» last-good chip"
    requirement: REQ-POOL-03
    verification:
      - kind: automated_ui
        ref: "mobile/test/widget/features/servers/server_pool_screen_test.dart#shows proto, whitelist-only SNI and the last-good chip"
        status: pass
    human_judgment: false
  - id: D4
    description: "pingClass maps real RTTs to the prototype palette; offline renders офлайн/нет ответа"
    requirement: REQ-PING-03
    verification:
      - kind: automated_ui
        ref: "mobile/test/widget/features/servers/server_pool_screen_test.dart#pingClass maps real RTTs to the prototype palette"
        status: pass
    human_judgment: false
  - id: D5
    description: "No bottom navigation bar and no load bar anywhere on the main screen"
    requirement: REQ-POOL-04
    verification:
      - kind: automated_ui
        ref: "mobile/test/widget/features/servers/server_pool_screen_test.dart#has no bottom navigation and no load bar"
        status: pass
      - kind: other
        ref: "grep of new lib files for loadClass/loadbar/load: returns 0 matches"
        status: pass
    human_judgment: false
  - id: D6
    description: "No-key/inactive-key gates block selection with Russian banner copy and a shop stub"
    requirement: REQ-POOL-02
    verification:
      - kind: automated_ui
        ref: "mobile/test/widget/features/servers/server_pool_screen_test.dart#inactive key shows the gate banner and blocks selection / missing key shows Нет ключа and the shop stub action"
        status: pass
    human_judgment: false
  - id: D7
    description: "Manual refresh reports «Пинг обновлён»; provider failure and all-offline offer «Повторить» and another tab"
    requirement: REQ-PING-08
    verification:
      - kind: automated_ui
        ref: "mobile/test/widget/features/servers/server_pool_screen_test.dart#manual refresh reports Пинг обновлён / all offline suggests another tab and retry / provider failure degrades to a retryable offline banner"
        status: pass
    human_judgment: false
  - id: D8
    description: "Подключить only selects a server and announces the phase-20 VPN core; no tunnel FSM or simulated connection"
    requirement: REQ-PING-02
    verification:
      - kind: automated_ui
        ref: "mobile/test/widget/features/servers/server_pool_screen_test.dart#connect only selects a server and announces phase 20"
        status: pass
    human_judgment: false

# Metrics
duration: 28 min
completed: 2026-11-27
status: complete
---

# Phase 19 Plan 07: Full Prototype Server Pool Screen Summary

**Full prototype main screen with two server tabs, real ping colors, key gating and selection-only connect, built from 19-05/19-06 providers without a load bar, bottom nav or simulation**

## Performance

- **Duration:** 28 min
- **Started:** 2026-11-27T04:42:38Z
- **Completed:** 2026-11-27T05:10:18Z
- **Tasks:** 3 / 3
- **Files created:** 9

## Accomplishments

- Composed `ServerPoolScreen` from seven widgets reproducing the seed prototype main layout: header (brand, greeting, idle VPN status, key pill, Russian date, refresh/shop/logic/avatar), key/offline banner, segmented tabs, toolbar with read-only network chip, scrollable pool list and pinned connect panel.
- Two segmented tabs carry `Semantics(selected/button/label)` for `aria-selected` parity; each shows its own mode description, servers, SNI chip (whitelist only) and «последний» last-good chip.
- `PingBadge` renders real `pingClass` colors (good/mid/warn/bad/offline), the wait dash and «офлайн»/«нет ответа» — no `load` bar, no simulated ping, no fake IP/timer/traffic.
- No-key/inactive-key and provider-error states display locked Russian copy with «Купить»/«Повторить» stubs and block ping/selection; `Подключить` performs server selection only and defers the VPN core to phase 20.
- 11 widget tests cover the full slice; `flutter test test/widget/features/servers/` is green and focused `flutter analyze` has 0 errors/0 warnings.

## Task Commits

Each task was committed atomically:

1. **Task 1 (tracer): End-to-end ServerPoolScreen — full prototype, two tabs, ping, connect selection, no-key banner** — `6bda496` (feat)
2. **Task 2: server card + auto card + tab + toolbar + connect + header + banner widget refinements** — `c354c86` (refactor)
3. **Task 3: widget test slice: no bottom nav, two tabs, auto card, connect, no-key, no load, no simulation, pingClass, refresh/retry** — `5ec8682` (test)

**Plan metadata:** included in the final `docs(19-07)` documentation commit.

_Tracer feedback gate: end-of-phase mode with automated-only `<verify>` — the tracer verify was re-run end-to-end before expansion and passed; no checkpoint was required._

## Files Created/Modified

- `mobile/lib/features/servers/server_pool_screen.dart` — `ConsumerWidget` composing the full prototype screen; added `poolBusyProvider`, `networkLabelProvider`, `lastGoodProvider`; owns refresh/connect/tab/stub handlers.
- `mobile/lib/features/servers/widgets/main_header.dart` — brand, localized greeting, idle status pill, D-20 key pill, Russian date pill and four actions.
- `mobile/lib/features/servers/widgets/no_key_banner.dart` — inline key-gate / provider-error banner with a single stub action.
- `mobile/lib/features/servers/widgets/pool_tab_bar.dart` — segmented pool tabs with `aria-selected` parity.
- `mobile/lib/features/servers/widgets/pool_toolbar.dart` — locked `modeDesc`, read-only network chip and refresh button.
- `mobile/lib/features/servers/widgets/server_card.dart` — `ServerCard` plus shared `PingBadge`; proto/SNI/last-good/ping, no load.
- `mobile/lib/features/servers/widgets/auto_select_card.dart` — «Автовыбор» card with best-server summary.
- `mobile/lib/features/servers/widgets/connect_panel.dart` — selection-only connect panel; honest IP/timer/traffic dashes and phase-20 note.
- `mobile/test/widget/features/servers/server_pool_screen_test.dart` — 11 widget tests with overrides for dio, DB, ping repository, network label and user.

## Decisions Made

- Kept the router untouched: 19-07 builds the screen only; the bottom-nav removal, `/shop` route and `ServerPoolScreen` wiring are 19-08 work, matching the plan's file list.
- Chose a single scrollable main column with a pinned `ConnectPanel` over a fixed header + separate `ListView`, because nested flex allocation collapsed the list and made the tabs untappable on short viewports.
- Made the offline/retry banner win over the no-key banner so provider failures always surface their notice and «Повторить» action.
- Treat refresh outcomes as non-selections: they have no `serverId`, so they must not trigger the «Сервер выбран» notice/toast; only an explicit `Подключить` does.
- Rendered timer/traffic/IP as dashes with an explicit phase-20 caption instead of the prototype's `00:00:00` / `0 МБ` placeholders, avoiding simulated connection data.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Pool list overlapped the tab bar on short viewports**
- **Found during:** Task 3 (widget test slice) — taps on the whitelist tab never switched tabs.
- **Issue:** `Flexible(header) + Expanded(ListView)` allocated ~57 px to the header, so the scrollable header content painted under the list and the tabs failed hit testing.
- **Fix:** Wrapped header, tabs, toolbar and cards in one `SingleChildScrollView` inside a single `Expanded`, with `ConnectPanel` pinned below; `_list` now returns a `Column` of cards instead of a nested `ListView`.
- **Files modified:** `mobile/lib/features/servers/server_pool_screen.dart`
- **Verification:** Tab-switch / SNI / last-good widget tests pass; no render overflow.
- **Committed in:** `5ec8682`

**2. [Rule 1 - Bug] Offline retry banner was masked by the no-key banner**
- **Found during:** Task 3 — provider-failure test could not find «Нет соединения. Повторите».
- **Issue:** `hasActiveKey` is false when no key is present, so the key banner branch ran before the error branch and hid the provider error/notice.
- **Fix:** Reordered the banner chain so `pools.error != null && error != "no_active_key"` renders first.
- **Files modified:** `mobile/lib/features/servers/server_pool_screen.dart`
- **Verification:** Provider-failure widget test finds the notice and «Повторить».
- **Committed in:** `5ec8682`

**3. [Rule 1 - Bug] Manual refresh announced a phantom server selection**
- **Found during:** Task 3 — refresh test failed to find «Пинг обновлён».
- **Issue:** `ConnectController.refresh` writes a `ConnectOutcome(ok:true)` with no `serverId`; the screen's listener treated it as a selection and the two snackbars raced.
- **Fix:** `_announceOutcome` and the connect-panel notice now require a non-null `serverId`; `effectiveId` no longer clears a real selection after refresh.
- **Files modified:** `mobile/lib/features/servers/server_pool_screen.dart`
- **Verification:** Refresh test finds «Пинг обновлён» exactly once; connect test still finds the phase-20 notice.
- **Committed in:** `5ec8682`

---

**Total deviations:** 3 auto-fixed (3 × Rule 1 bug). **Impact on plan:** All three were correctness fixes uncovered by the required widget tests; no scope creep, no locked constraint relaxed.

## Issues Encountered

- Bare `cd mobile && flutter analyze` exits 1 with 1630 pre-existing `info` lints (1622 before this plan; the 8 new ones are the unavoidable framework-wide `material.dart` deprecation notice on each new file). There are **0 errors and 0 warnings**; focused analysis of the new files is clean apart from that deprecation info. Logged to `deferred-items.md` per the scope-boundary rule.
- Android/iOS native ping artifacts and on-device UAT remain out of scope/environment-blocked; the real ping path is unaffected on the UI side.
- REQ-POOL-01 is shared with plan 19-08 and stays unmarked in `REQUIREMENTS.md` until that plan lands (shared-ID gate).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Ready for 19-08: wire `ServerPoolScreen` into `app/router.dart`, delete the legacy `_HomeScreen`/`NavigationBar` and `bottomNavIndexProvider`, add the `/shop` stub route, and update the phase-18 router tests.
- The screen's shop/profile/logic actions are in-app stubs in 19-07; phase 21 replaces them with real flows.
- Phase 20 will attach the VPN core/FSM to the selection made by `ConnectController`; the UI already avoids any simulated connection state.

## Known Stubs

- `mobile/lib/features/servers/server_pool_screen.dart` — `_shopStub()` shows «Магазин · Купить — фаза 21» instead of purchase flow; intentional per D-15/D-21, real shop is phase 21 and the `/shop` route is 19-08.
- `mobile/lib/features/servers/server_pool_screen.dart` — `_profileSheet()` shows «Устройства и подписка — фаза 21»; intentional per D-19, full profile is phase 21.
- `mobile/lib/features/servers/widgets/connect_panel.dart` — IP/timer/traffic cells show dashes with «Туннель, IP и трафик — фаза 20»; intentional because the VPN core/FSM is phase 20 and simulation is forbidden.

## Self-Check: PASSED

- All 9 created files exist on disk.
- All 3 task commits verified in git history (`6bda496`, `c354c86`, `5ec8682`).
- Final `flutter test test/widget/features/servers/` → 11/11 passed.

---
*Phase: 19-server-pools-auto-ping-7-days*
*Completed: 2026-11-27*
