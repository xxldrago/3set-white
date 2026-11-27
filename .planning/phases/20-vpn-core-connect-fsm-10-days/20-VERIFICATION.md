---
phase: 20-vpn-core-connect-fsm-10-days
verified: 2026-11-27T21:45:00Z
status: human_needed
score: 13/13 must-haves verified (source/unit level)
behavior_unverified: 0
overrides_applied: 0
deferred:
  - truth: "Shop / purchase / subscription / devices / promo UI"
    addressed_in: "Phase 21"
    evidence: "CONTEXT.md explicitly excludes shop/purchase from phase 20; server_pool_screen.dart keeps pre-existing phase-21 stubs only (WINDOWS.md #18)."
  - truth: "GPL-3.0 legal review / Play-App Store compliance"
    addressed_in: "Phase 23 (external owner)"
    evidence: "20-RESEARCH.md + COVERAGE.md:51 + plan 02 threat T-20-GPL record legal review as an owned external blocker; no new licensing decision in phase 20."
  - truth: "Real iOS packet-tunnel build, fd KVC handoff and on-device kill-switch UAT"
    addressed_in: "Entitlement-approved follow-up phase"
    evidence: "LOCKED D-07 scopes iOS to compile-only until Apple approves packet-tunnel-provider; 20-04-SUMMARY.md marks D6 as human_judgment=true."
  - truth: "Phase 19 deferred device/live-key UAT"
    addressed_in: "/gsd-verify-work 19 before milestone close"
    evidence: "19-VERIFICATION.md status human_needed with 7 open items; CONTEXT.md §Deferred Ideas line 174 requires a return to phase 19 UAT."
human_verification:
  - test: "Build the Android libbox shim + VpnService in CI (OpenJDK 17 + Android SDK/NDK), install on a device, tap Подключить and inspect the established tunnel."
    expected: "arm64-v8a/armeabi-v7a .so artifacts build; real Builder.establish() fd is handed to libbox_start_with_tun; tunnel carries traffic through the selected server (CR-01 route fix), not direct; method channel and «VPN активен · 3set» notification work."
    why_human: "No JDK17/Android SDK/NDK in this environment; a non-TUN fd aborts natively (exit 134). Only source gates + Dart fake-bridge tests are locally verifiable."
  - test: "On a built Android app, verify the foreground notification is ongoing/non-swipeable and its «Отключить» action disconnects."
    expected: "Notification title exactly «VPN активен · 3set» persists while connected; tapping «Отключить» drives FSM disconnecting → idle and stops the core before idle."
    why_human: "Native notification lifecycle and method-channel action cannot be exercised without a device build."
  - test: "Android kill-switch leak test: disconnect, cancel, revoke consent and unexpectedly kill the service; check for traffic leaks."
    expected: "No traffic outside the tunnel on disconnect/revoke; «Kill switch: трафик вне VPN заблокирован» toast on explicit disconnect; no orphan tunnel; an unexpected core stop emits onCoreStopped → 1/2/4 s backoff → terminal toast."
    why_human: "Real VpnService routes, onRevoke and onDestroy ordering are source-verified only; the Dart backoff is proven with fake events but the real native producer needs a device."
  - test: "Toggle WiFi↔LTE on a physical device while connected."
    expected: "500 ms debounce; VPN-only self-changes ignored (no reconnect loop); ping cache + last-good cleared while selection/current_tab persist; best server reselected by RTT; /config refetched; exactly one «Сеть изменена — переподключение» toast."
    why_human: "Real connectivity_plus emissions and native state cannot be reproduced on host; verified here by fake connectivity-stream tests."
  - test: "After Apple approves the packet-tunnel-provider entitlement, build/sign the iOS extension and verify the tunnel + IPv6/OnDemand kill switch."
    expected: "NEPacketTunnelProvider starts with IPv4+IPv6 settings from TUN values; installAlwaysOnRules() installs NEOnDemandRuleConnect for all interfaces; no non-VPN traffic leaks; fd handoff viability confirmed."
    why_human: "Entitlement is unapproved (external blocker) and packetFlow fd acquisition is [ASSUMED] private KVC; D-07 forbids any tunnel build/sign in this phase."
  - test: "With a live Android tunnel, compare the Connected Panel IP with an in-tunnel ipify request and watch the 1 Hz counters."
    expected: "IP matches the real in-tunnel address (or «—» on any failure); ↓/↑ MB update once per second from libbox StatusMessage counters; timer resets on reconnect; no stale values."
    why_human: "Requires a live tunnel and real network; verified here only through injectable HTTP/traffic/ticker seams."
  - test: "On a device with a paid ARTEMIDA key, call GET /api/mobile/config?serverId=... via the app with a Bearer token."
    expected: "The serverId resolves against the real links[] payload and returns a complete routed config; 401/403/no_active_key paths behave as specified; no secret appears in body or logs."
    why_human: "The live ARTEMIDA links[] shape is [ASSUMED], inherited from phase 19; no paid key in this environment."
  - test: "Complete the phase 19 deferred UAT before milestone close."
    expected: "The 7 items in 19-VERIFICATION.md (live links[], real ping/fallback, WiFi↔LTE invalidation, Android native build, shop-button decision, group URLTest, read-time TTL) are resolved."
    why_human: "Device/live-key/UX items explicitly deferred by the prior phase; inherited blocker."
---

# Phase 20: VPN Core & Connect FSM (10 days) Verification Report

**Phase Goal:** Working VPN tunnel with proper FSM, kill switch, platform compliance.
**Verified:** 2026-11-27T21:45:00Z
**Status:** human_needed
**Re-verification:** No — initial verification (no prior `20-VERIFICATION.md` existed)

All 40 reviewed files exist, are substantive, and are wired. Every automated check was re-run independently and passed. All 8 code-review findings (2 CRITICAL) are fixed in the actual code, not just in commit messages. All 20 locked CONTEXT decisions are honored. No gaps and no blockers were found. The remaining items are explicitly-scoped external/on-device verification (Android native build, iOS entitlement, live IP/key, GPL legal, phase-19 UAT) recorded under Human Verification; these are the reason for `human_needed` rather than `passed`.

## Goal Achievement

### Observable Truths

Truths are the 13 roadmap tasks (20.1–20.13). "VERIFIED" means verified at the level this phase's locked decisions scope for local verification (source, wiring, and passing unit/widget/native tests); on-device behavior is itemized separately under Human Verification.

| # | Truth (roadmap task) | Req | Status | Evidence |
|---|----------------------|-----|--------|----------|
| 20.1 | Backend builds a complete sing-box v1.14 TUN config from one `serverId`; JWT + active-key gate on every request; config routes via the selected server | REQ-CONN-03 | ✓ VERIFIED | `app/api/mobile/config/route.ts:43-120` (verifyAccessToken 401, isActiveKey 403, cache-first links, parsePools, zod serverId, provider-error degrade, no 5xx); `lib/mobile-config.ts:73-100` emits TUN inbound + WG endpoint + `route.rules`/`route.final` = chosen tag (CR-01 fix `6de3db7`); 13 vitest vectors + Go CheckConfig test; no secret in body/logs |
| 20.2 | FSM `idle→pinging→connecting→connected→disconnecting→idle` + `error`, one owner, transitions logged | REQ-CONN-01 | ✓ VERIFIED | `connection_state.dart:1-61` (exactly six phases, no config/outbound/link/fd field); `connection_notifier.dart` single `_transition` logging `{from,to,reason}`, generation guard; `connection_state_test.dart` happy path + stale generation + button copy; phase-19 selection reused at `:192` |
| 20.3 | Cancel during `connecting` → `disconnecting` → `idle`, toast, no orphan tunnel | REQ-CONN-02 | ✓ VERIFIED | `connection_notifier.dart:105-140` awaits `bridge.stop()` before idle, gen bump; `cancel_test.dart` completer-gated stop-before-idle + revoke `error→disconnecting→idle`; WR-03 (`a83e831`) extends cancel to `pinging`; IN-02 (`dbe1ed9`) cancels backoff on revoke |
| 20.4 | Android `VpnService` prepare/establish/protect + fd handoff | REQ-CONN-04 | ✓ VERIFIED (source/facade) | `VpnService.kt:66-77,99-109` prepare/establish/protect/onRevoke with full IPv4/IPv6 routes; opaque fd into `startWithTun`; `MainActivity.kt:3` channel registration (Rule-2 fix); `vpn_bridge_test.dart` 10 tests. Real device tunnel = human item #1 |
| 20.5 | Foreground notification «VPN активен · 3set» with disconnect action | REQ-CONN-04 | ✓ VERIFIED (source) | `VpnForegroundService.kt` exact title grep=1, setOngoing, «Отключить» PendingIntent → `com.u3set.mobile/vpn` → FSM; Kotlin FGS per locked D-06 (roadmap's `flutter_background_service` wording superseded by CONTEXT D-06). Live notification = human item #2 |
| 20.6 | iOS `NEPacketTunnelProvider` + `setTunnelNetworkSettings` + entitlements | REQ-CONN-05 | ✓ VERIFIED (compile-only) | `PacketTunnelProvider.swift:25-48,81-111` start/stop + IPv4 **and** IPv6 settings (WR-04 `95c4d7a`); `Info.plist:26-27` extension keys; `Runner.entitlements:14` packet-tunnel-provider retained; `project.pbxproj` PacketTunnel target embedded (24 refs); `ios_prepared_test.dart` 7 source assertions. No build/sign per D-07. Device = human item #5 |
| 20.7 | iOS kill switch `NEOnDemandRuleConnect` for all interfaces | REQ-CONN-06 | ✓ VERIFIED (source) | `PacketTunnelProvider.swift:111,140-146` `installAlwaysOnRules()` now called and sets `NEOnDemandRuleConnect()` with no interface filter/excluded routes (WR-04). No toggle. Device leak test = human item #5 |
| 20.8 | Android kill switch: all traffic through VpnService, no bypass | REQ-CONN-06 | ✓ VERIFIED (source) | `VpnService.kt` full `addRoute(0.0.0.0/0)` + `::/0`, no `allowBypass` (grep=0), no user toggle, `onRevoke` stops core before idle. Device leak test = human item #3 |
| 20.9 | Connected Panel: flag+city, protocol, IP, ping, timer, ↓/↑ MB at 1 Hz | REQ-CONN-07 | ✓ VERIFIED | `connected_stats.dart:14,67-112,168,198-290` real `api.ipify.org` GET (2 s, literal validation, «—» fallback), `LibboxPingCore.traffic()`, one cancellable `Timer.periodic`, session-keyed IP/timer invalidation; `connect_panel.dart` six live cells + FSM button; `connect_panel_test.dart` (6) + `connected_stats_test.dart` (9). Live on-device = human item #6 |
| 20.10 | Auto-reconnect on network change, one toast, no self-loop | REQ-CONN-08 / REQ-PING-05 | ✓ VERIFIED | `connection_notifier.dart:59,349-387,478` app-level connectivity listener, VPN-only result-set filter, 500 ms debounce, `clearPingCacheAndLastGood()` (keeps selection/tab), reselection, `/config` refetch, single toast; `reconnect_test.dart` 4 tests + phase-19 `network_invalidation_test.dart`; `main.dart:34` watches listener |
| 20.11 | Core restart backoff 1/2/4 s ×3, reset on connected, terminal toast | REQ-CONN-09 | ✓ VERIFIED | `restart_backoff.dart:26-68` exact `Duration(seconds:1/2/4)`, max 3, reset, cancel/dispose; `connection_notifier.dart:418-450` `handleCoreStopped()` + real native producer `VpnService.kt:112-118` `onDestroy → emitCoreStopped` (CR-02 `4cf2a42`) mapped in `vpn_bridge.dart:185-188`; `restart_backoff_test.dart` 8 tests. Real native stop = human item #3 |
| 20.12 | libbox/native errors → fixed RU toasts, no raw text | REQ-CONN-10 | ✓ VERIFIED | `error_mapping.dart` 10 exact locked strings + `{code,state,durationMs}` logs; WR-01 (`4758d24`) `on Object → config_invalid` + FSM catch-alls; IN-01 (`5589593`) retry toast re-runs last connect (`connection_notifier.dart:547-559`); `error_mapping_test.dart` 4 tests assert exact strings and no leak |
| 20.13 | Permission flows: request, deny/revoke gracefully, toast + retry | REQ-CONN-04/06 (D-10/11) | ✓ VERIFIED | `connect()` awaits `bridge.prepare()` before start (Rule-2 fix `34f7acf`); `vpn_bridge.dart:197` permission_denied; `error_mapping.dart:70-74` «Нужно разрешение VPN» + real retry action; `cancel_test.dart` revoke path. Real permission dialog = human items #1/#3 |

**Score:** 13/13 roadmap must-have tasks VERIFIED at the phase-scoped source/unit level. 0 behavior-unverified (all state-transition/cancellation/ordering invariants have passing tests). 0 present-but-hollow artifacts. 0 overrides applied.

### Deferred Items

Items not met in phase 20 but explicitly scheduled elsewhere (informational only; do not affect status).

| # | Item | Addressed In | Evidence |
|---|------|--------------|----------|
| 1 | Shop/purchase/subscription/UI | Phase 21 | CONTEXT.md §Phase Boundary; only pre-existing stubs remain |
| 2 | GPL-3.0 legal / store compliance | Phase 23 (external) | COVERAGE.md:51; T-20-GPL accepted |
| 3 | Real iOS tunnel + fd KVC UAT | Entitlement follow-up | LOCKED D-07 compile-only; T-20-13 accepted risk |
| 4 | Phase 19 device/live-key UAT | `/gsd-verify-work 19` | 19-VERIFICATION.md 7 open items; CONTEXT.md:174 |

### Required Artifacts

All 43 declared artifact paths exist and are substantive (no stubs, no empty implementations). Representative checks:

| Artifact | Lines | Status | Details |
|----------|-------|--------|---------|
| `app/api/mobile/config/route.ts` | 121 | ✓ VERIFIED | Full gate + error envelope + outcome-only logs |
| `lib/mobile-config.ts` | 118 | ✓ VERIFIED | Never-throw builder; CR-01 route via chosen tag |
| `mobile/native/libbox_shim/main.go` | 620 | ✓ VERIFIED | `start_with_tun`, `traffic`, protect handler, two-mode shim |
| `libbox_shim.h` / `libbox_bindings.dart` | 104 / 161 | ✓ VERIFIED | All 3 new symbols; bindings git-clean; nm exports confirmed |
| `VpnService.kt` / `VpnForegroundService.kt` / `AndroidManifest.xml` | 302 / 113 / 100 | ✓ VERIFIED | Exact gate greps pass; no invalid permission/bypass |
| `PacketTunnelProvider.swift` / `Info.plist` / `project.pbxproj` | 154 / 31 / 794 | ✓ VERIFIED | Compile-only NE + IPv6 + OnDemand + embedded target |
| `connection_state.dart` / `connection_notifier.dart` / `config_repository.dart` | 61 / 593 / 79 | ✓ VERIFIED | 6 phases, generation guard, opaque BFF config |
| `error_mapping.dart` / `restart_backoff.dart` / `connected_stats.dart` | 150 / 85 / 290 | ✓ VERIFIED | Exact toasts, 1/2/4 s, 1 Hz live stats |
| All 14 test files | 13–469 ea | ✓ VERIFIED | No skipped/disabled tests, no circular fixtures |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `config/route.ts` | `lib/mobile-auth.ts` | `verifyAccessToken` → 401 | ✓ WIRED | `:47-51` |
| `config/route.ts` | `servers/route.ts` | exported `isActiveKey` → 403 | ✓ WIRED | `:16,54-61` |
| `config/route.ts` | `servers-source.ts` / `server-pool.ts` | `getSubscriptionLinksCacheFirst` → `parsePools` | ✓ WIRED | `:63-64` |
| `config/route.ts` | `lib/mobile-config.ts` | `buildMobileConfig(server)` → `config` body | ✓ WIRED | `:113` |
| `connection_notifier.dart` | `ConnectController.connect` / `ConfigRepository` / `VpnBridge` | select → `/config` → `start` | ✓ WIRED | `:192,245,266-293` |
| `config_repository.dart` | `dioClientProvider` / `Endpoints.config` | shared Dio GET `?serverId` | ✓ WIRED | `endpoints.dart:18`, repo `:39-40,78` |
| `connection_notifier.dart` | `vpn_bridge.dart` → `libbox_core.dart` | `startWithTun(fd, config)` + `traffic()` | ✓ WIRED | opaque int, no fd stored |
| `VpnService.kt` | `libbox_shim` | `establish()` fd → `libbox_start_with_tun`; protect callback | ✓ WIRED | WR-02 hook to `protect(fd)` |
| `VpnService.kt` (onDestroy) | `vpn_bridge` → `handleCoreStopped` | `onCoreStopped` → `core_stopped` → backoff | ✓ WIRED | CR-02 producer chain complete |
| `connection_notifier.dart` | `connectivityServiceProvider` / `pingDao` | debounce + `clearPingCacheAndLastGood` | ✓ WIRED | `:59,356` |
| `connected_stats.dart` | `LibboxPingCore.traffic()` / `api.ipify.org` | 1 Hz ticker + real HTTP | ✓ WIRED | `:168,229-230,274` |
| `server_pool_screen.dart` | `connectionNotifierProvider` / `connectedStatsProvider` | button → connect/cancel/disconnect | ✓ WIRED | `:79-80,349-357` |
| `main.dart` | `connectionReconnectListenerProvider` | app-lifetime watch | ✓ WIRED | `:34` |
| `PacketTunnel/Info.plist` | `project.pbxproj` / entitlements | embedded PacketTunnel target | ✓ WIRED | D-07 compile-only |

### Data-Flow Trace (Level 4)

| Artifact | Value | Source | Real data | Status |
|----------|-------|--------|-----------|--------|
| `/config` response | `config` | `getSubscriptionLinksCacheFirst` → `parsePools` → `buildMobileConfig` (routed via chosen tag) | ✓ | ✓ FLOWING |
| `/config` response | `server` meta | `serverMeta` (id/city/flag/proto/sni?/tab) only | ✓ | ✓ NO SECRET |
| Connected Panel | ↓/↑ MB | `LibboxPingCore.traffic()` (StatusMessage Downlink/Uplink) | ✓ | ✓ FLOWING |
| Connected Panel | IP | real `HttpClient` GET `api.ipify.org` through tunnel; «—» fallback | ✓ | ✓ FLOWING (honest fallback) |
| Connected Panel | timer | `DateTime.now() - connectedAt` | ✓ | ✓ FLOWING |
| Panel / FSM state | config, outbound, link, token, fd | — | — | ✓ NEVER STORED/RENDERED |
| Logs / toasts | outcome codes + fixed RU strings | stable code vocabulary only | ✓ | ✓ NO RAW TEXT |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full Flutter suite | `cd mobile && flutter test` | **265/265 passed**, exit 0 | ✓ PASS |
| Flutter analyze (errors) | `flutter analyze --no-fatal-infos --no-fatal-warnings` | exit 0; 0 errors (1627 infos + 1 warning, pre-existing) | ✓ PASS |
| Backend focused vitest | `npx vitest run tests/unit/mobile-config-route.test.ts tests/unit/mobile-servers-route.test.ts` | **27/27 passed** (2 files), exit 0 | ✓ PASS |
| Backend typecheck | `npx tsc --noEmit` | exit 0, 0 errors (whole repo clean at verify time) | ✓ PASS |
| Prisma schema | `npx prisma validate` | "schema ... is valid", exit 0 | ✓ PASS |
| Go shim build | `cd mobile/native/libbox_shim && ./build.sh host` | exit 0, host dylib produced | ✓ PASS |
| Go shim tests | `go test ./...` | `ok github.com/3set-white/mobile/native/libbox_shim` | ✓ PASS |
| Native symbol exports | `nm -gU mobile/build/libboxshim.dylib \| grep ...` | `_libbox_start_with_tun`, `_libbox_traffic`, `_libbox_register_protect_handler` all present | ✓ PASS |

### Probe Execution

No probes declared in PLAN/SUMMARY and no conventional `scripts/*/tests/probe-*.sh` files apply to this phase. N/A.

### Code-Review Fix Verification (`20-REVIEW.md` → `status: fixed`)

All 8 findings verified fixed in the actual code (not only in commit messages):

| Finding | Commit | Code evidence | Status |
|---------|--------|---------------|--------|
| CR-01 route.final=direct bypassed server | `6de3db7` | `mobile-config.ts:85-99` `route.rules` + `route.final` = `chosenTag`; Go vector updated | ✓ FIXED |
| CR-02 core_stopped had no producer | `4cf2a42` | `VpnService.kt:112-118` emits on unexpected death; `vpn_bridge.dart:185-188`; notifier `handleCoreStopped` | ✓ FIXED |
| WR-01 non-VpnBridgeException stuck in connecting | `4758d24` | `vpn_bridge.dart:215-218` `on Object → config_invalid`; FSM catch-alls | ✓ FIXED |
| WR-02 outbound socket unprotected | `c993bfe` | `main.go:132-150` AutoDetectInterfaceControl + `register_protect_handler`; `vpn_bridge.dart:244-255` → Kotlin `protect(fd)` | ✓ FIXED |
| WR-03 cancel no-op during pinging | `a83e831` | `connection_notifier.dart:108-109` accepts `pinging` + `connecting` | ✓ FIXED |
| WR-04 iOS IPv4-only + OnDemand never installed | `95c4d7a` | `PacketTunnelProvider.swift:95-111,143-146` IPv6 + `installAlwaysOnRules()` called | ✓ FIXED |
| IN-01 retry toast only hid snackbar | `5589593` | `error_mapping.dart:121-127` action → `retryLastAction()` | ✓ FIXED |
| IN-02 revoke did not cancel backoff | `dbe1ed9` | `connection_notifier.dart:161-164` `_handleRevoked` cancels timer | ✓ FIXED |

Open review findings: **0**. No regressions in the fix range.

### Requirements Coverage

| Requirement | Plan(s) | Description | Status | Evidence |
|-------------|---------|-------------|--------|----------|
| REQ-CONN-01 | 05 | FSM states + transitions visible/logged | ✓ SATISFIED | `connection_state.dart`, notifier, tests |
| REQ-CONN-02 | 05 | Cancel connecting, no orphan tunnel | ✓ SATISFIED | `cancel_test.dart` stop-before-idle + revoke |
| REQ-CONN-03 | 01,05 | libbox config generation from subscription+serverId | ✓ SATISFIED | `/config` route + builder, CR-01 routed via server |
| REQ-CONN-04 | 02,03,05 | Android VpnService + foreground service | ✓ SATISFIED (source) | Kotlin pair + manifest + bridge; device UAT open |
| REQ-CONN-05 | 04 | iOS NE packet tunnel | ✓ SATISFIED (compile-only) | Swift/plist/target; device UAT blocked by entitlement |
| REQ-CONN-06 | 03,04 | Kill switch both platforms | ✓ SATISFIED (source) | no bypass / OnDemand; device leak test open |
| REQ-CONN-07 | 02,07 | Connected Panel live stats | ✓ SATISFIED | panel + stats + widget/unit tests; live IP UAT open |
| REQ-CONN-08 | 06 | Auto-reconnect on network change | ✓ SATISFIED | reconnect listener + tests |
| REQ-CONN-09 | 06 | Core restart backoff 1/2/4 s | ✓ SATISFIED | `RestartBackoff` + real producer + tests |
| REQ-CONN-10 | 05 | Error mapping to user toasts | ✓ SATISFIED | error_mapping + tests |
| REQ-PING-05 | 06 | Network-change invalidation on connect | ✓ SATISFIED | `clearPingCacheAndLastGood` in reconnect + phase-19 test |

All 11 task-specified IDs (REQ-CONN-01..10, REQ-PING-05) appear in PLAN frontmatter and exist in REQUIREMENTS.md (REQ-CONN §lines 53–62, REQ-PING-05 line 44). **No missing IDs, no orphaned IDs.** REQUIREMENTS.md has no phase-mapping column, so no additional phase-20 IDs were expected.

### Test Quality Audit

| Test file(s) | Active | Skipped | Circular | Assertion level | Verdict |
|--------------|--------|---------|----------|-----------------|---------|
| `mobile-config-route.test.ts` | 13 | 0 | 0 | value + secrecy + schema | PASS |
| `main_test.go` | 5 | 0 | 0 | CheckConfig + generic error | PASS |
| `libbox_core_tun_test.dart` | 7 | 0 | 0 | value (lossless int64, zeros) | PASS |
| `vpn_bridge_test.dart` / `ios_prepared_test.dart` | 10 / 7 | 0 | 0 | behavioral + source | PASS |
| `connection_state` / `cancel` / `error_mapping` / `config_repository` | 4 / 4 / 4 / 3 | 0 | 0 | behavioral ordering + exact strings | PASS |
| `reconnect_test` / `restart_backoff_test` | 4 / 8 | 0 | 0 | behavioral (filter/toast/delays/reset) | PASS |
| `connected_stats_test` / `connect_panel_test` / `server_pool_screen_test` | 9 / 6 / 11 | 0 | 0 | value + widget | PASS |

No disabled/skipped tests, no circular fixture generation, no insufficient assertion levels on requirement-linked tests.

### Decision Coverage

`check.decision-coverage-verify`: **20/20 trackable CONTEXT.md decisions honored** (`not_honored: []`, `blocking: false`). Gate is non-blocking/warning-only.

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| — | TBD / FIXME / XXX | — | None in phase-20 files |
| — | TODO / HACK / PLACEHOLDER / "not implemented" | — | None |
| — | Math.random / fake IP / sleep / load / simulation | — | None (matches only "NOT used" comments) |
| — | empty impls / hardcoded fake data | — | None; `ip = ""` are honest «—» fallbacks, test-verified |
| `mobile/ios/PacketTunnel/PacketTunnelProvider.swift:90` | documented compile-only `packetFlow` seam | ℹ️ Info | Intentional per D-07; fd KVC is `[ASSUMED]`/T-20-13, not a placeholder |
| `server_pool_screen.dart` | pre-existing shop/profile stubs | ℹ️ Info | Phase-21 scope, recorded in WINDOWS.md #18 |

No debt-marker blocker, no new stub, no simulation.

### Human Verification Required

8 items — all external, device, or prior-phase scope explicitly documented by locked decisions / VALIDATION.md. **No automated gap is hidden among them.**

1. **Android native tunnel build + on-device connect** — build CI artifacts, install, verify real `establish()` fd, routed traffic, notification. Expected: tunnel carries traffic via selected server. (no JDK/SDK/NDK here)
2. **Foreground notification lifecycle** — ongoing/non-swipeable, «Отключить» → FSM disconnect. Expected: exact title, stop-before-idle.
3. **Android kill switch + core-stop backoff on device** — disconnect/revoke/kill service; no leaks; unexpected stop → 1/2/4 s → toast.
4. **Real WiFi↔LTE reconnect** — debounce, VPN-only filter, reselection, one toast, no loop.
5. **iOS entitlement + tunnel UAT** — after Apple approval, build/sign, verify IPv6/OnDemand kill switch and fd KVC viability.
6. **Live IP-through-tunnel + 1 Hz counters** — panel IP matches in-tunnel ipify; MB updates; timer resets.
7. **Live ARTEMIDA links[] shape** — paid-key UAT of serverId lookup (inherited `[ASSUMED]`).
8. **Phase 19 deferred UAT** — 7 items from 19-VERIFICATION.md before milestone close.

### Gaps Summary

No gaps and no blockers. The phase's own code contract is fully delivered: 43 artifacts substantive and wired, all 11 requirement IDs covered, 13/13 roadmap tasks verified at the scoped level, all 8 review findings (including both CRITICALs) fixed in code, 20/20 decisions honored, and every automated suite green (265/265 Flutter, 27/27 backend vitest, Go build+test, tsc clean, prisma valid, 0 analyzer errors). `human_needed` reflects only the explicitly-deferred device/native/legal/prior-phase UAT items above — not an implementation deficiency.

---

_Verified: 2026-11-27T21:45:00Z_
_Verifier: the agent (gsd-verifier)_
