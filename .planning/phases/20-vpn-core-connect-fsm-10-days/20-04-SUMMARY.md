---
phase: 20-vpn-core-connect-fsm-10-days
plan: 04
subsystem: mobile
tags: [ios, networkextension, nepackettunnelprovider, ondemand, kill-switch, compile-only, swift, entitlements, xcode, no-simulation]

# Dependency graph
requires:
  - phase: 20-vpn-core-connect-fsm-10-days
    provides: "20-01 GET /api/mobile/config supplies the non-secret TUN values; 20-02 own C-shared shim reserves the fd-taking seam"
  - phase: 19-server-pools-auto-ping-7-days
    provides: "Tracer-first verification conventions and source-assertion test style"
provides:
  - "Compile-only PacketTunnelProvider.swift: startTunnel/stopTunnel + setTunnelNetworkSettings from non-secret TUN values"
  - "PacketTunnel Info.plist with packet-tunnel extension point and $(PRODUCT_MODULE_NAME).PacketTunnelProvider principal class"
  - "Embedded PacketTunnel.appex target in Runner with NetworkExtension.framework, reusing the existing packet-tunnel-provider entitlement"
  - "NEOnDemandRuleConnect always-on kill switch source for all interfaces; no toggle, no excluded routes"
  - "ios_prepared_test.dart: 6 source-level assertions including no-simulation and no-build/sign negatives"
affects:
  - "Phase 20 plans 05-07: connection FSM must not report a real iOS connected state until entitlement approval"
  - "Entitlement-approved follow-up: fd handoff ([ASSUMED] private KVC) and on-device tunnel/kill-switch UAT"

# Actuals (#2632) — same chars/4 scale as the plan's estimate (38000 tokens).
actuals:
  tokens: 5015
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Compile-only platform preparation: concrete Swift/plist/target sources with no build, sign or on-device verification (D-07)"
    - "OnDemand kill switch is structural: NEOnDemandRuleConnect() with no interface filter, no excluded routes, no user toggle (D-09)"
    - "fd acquisition stays [ASSUMED] private KVC in a comment only; documented NEPacketTunnelFlow seam, no packet-buffer bridge, no fake state"
    - "Generic Swift error codes; raw NSError, config, tokens and secrets never logged or surfaced"
    - "Negative source assertions construct forbidden tokens from adjacent string constants so the test cannot self-match"

key-files:
  created:
    - mobile/ios/PacketTunnel/PacketTunnelProvider.swift
    - mobile/ios/PacketTunnel/Info.plist
    - mobile/test/unit/core/vpn/ios_prepared_test.dart
  modified:
    - mobile/ios/Runner.xcodeproj/project.pbxproj

key-decisions:
  - "D-07 confirmed by the user at the blocking decision gate as compile-only (locked): prepare NE sources only; no iOS build, sign or tunnel UAT until Apple approves packet-tunnel-provider"
  - "D-09 kill switch stays always-on in iOS source via NEOnDemandRuleConnect for all interfaces; no toggle and no excluded routes"
  - "fd KVC (socket.fileDescriptor) is recorded as [ASSUMED] risk T-20-13 and deliberately not implemented; no private-API workaround in this phase"
  - "The existing packet-tunnel-provider entitlement is retained unchanged; no new unapproved entitlement added"
  - "No fake 'connected' state, IP, traffic or packet-buffer bridge is authored; iOS readiness remains source-level only"

patterns-established:
  - "App-extension embedding: PBXCopyFilesBuildPhase dstSubfolderSpec=13 (PlugIns) with a product reference; no build phase signs or runs the tunnel"
  - "Readiness tests read source files with dart:io and assert fixed labels only, never file contents"

requirements-completed: [REQ-CONN-05, REQ-CONN-06]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "Swift PacketTunnelProvider implements startTunnel/stopTunnel/setTunnelNetworkSettings from non-secret TUN values"
    requirement: REQ-CONN-05
    verification:
      - kind: unit
        ref: "mobile/test/unit/core/vpn/ios_prepared_test.dart#Swift provider implements the documented NE contract (6/6 pass)"
        status: pass
      - kind: other
        ref: "grep -q 'NEPacketTunnelProvider|setTunnelNetworkSettings' mobile/ios/PacketTunnel/PacketTunnelProvider.swift"
        status: pass
    human_judgment: false
  - id: D2
    description: "Extension Info.plist declares the packet-tunnel point and principal class"
    requirement: REQ-CONN-05
    verification:
      - kind: unit
        ref: "mobile/test/unit/core/vpn/ios_prepared_test.dart#extension plist declares the packet-tunnel point and class"
        status: pass
    human_judgment: false
  - id: D3
    description: "packet-tunnel-provider entitlement retained and PacketTunnel target embedded in Runner"
    requirement: REQ-CONN-05
    verification:
      - kind: unit
        ref: "mobile/test/unit/core/vpn/ios_prepared_test.dart#entitlement is retained and target is embedded in the app"
        status: pass
      - kind: other
        ref: "plutil -lint ios/Runner.xcodeproj/project.pbxproj → OK"
        status: pass
    human_judgment: false
  - id: D4
    description: "NEOnDemandRuleConnect always-on kill switch exists in source for all interfaces"
    requirement: REQ-CONN-06
    verification:
      - kind: unit
        ref: "mobile/test/unit/core/vpn/ios_prepared_test.dart#Swift provider NE contract token NEOnDemandRuleConnect"
        status: pass
    human_judgment: false
  - id: D5
    description: "No fabricated connected state, simulation, fake IP, private-KVC solution or tunnel build/sign in the slice"
    requirement: REQ-CONN-05
    verification:
      - kind: unit
        ref: "mobile/test/unit/core/vpn/ios_prepared_test.dart#no fabricated connected state; no tunnel build or signing command"
        status: pass
      - kind: other
        ref: "grep [ASSUMED]/NOT implemented in provider; entitlement unchanged; no build command in verify"
        status: pass
    human_judgment: false
  - id: D6
    description: "Real iOS tunnel build/sign, fd acquisition and on-device kill-switch leak test"
    requirement: REQ-CONN-06
    verification: []
    human_judgment: true
    rationale: "External blocker per D-07: Apple packet-tunnel-provider entitlement is unapproved and packetFlow has no public fd API ([ASSUMED] private KVC). Recorded as unrun-verify in .planning/WINDOWS.md entry 28."

# Metrics
duration: 8 min
completed: 2026-11-27
status: complete
---

# Phase 20 Plan 04: iOS Compile-Only Packet Tunnel Summary

**Compile-only `NEPacketTunnelProvider` + `NEOnDemandRuleConnect` sources, packet-tunnel extension plist and an embedded PacketTunnel target — no tunnel build, sign, fake state or private-KVC fd solution**

## Performance

- **Duration:** 8 min
- **Started:** 2026-11-27T09:42:31Z
- **Completed:** 2026-11-27T09:50:27Z
- **Tasks:** 3 (1 blocking decision gate + 1 tracer + 1 auto)
- **Files modified:** 4 (3 created, 1 modified)

## Accomplishments

- Added `PacketTunnelProvider.swift`: `startTunnel`/`stopTunnel` overrides and `setTunnelNetworkSettings` with MTU, DNS, IPv4 address/mask and full-route inclusion derived from non-secret TUN values; generic error codes only, never raw `NSError`.
- Added the `[ASSUMED]` fd-handoff risk comment (private KVC on `packetFlow`) and a documented `NEPacketTunnelFlow` seam — deliberately no private API, no packet-buffer bridge and no fake connected state.
- Added `PacketTunnel/Info.plist` with `NSExtensionPointIdentifier = com.apple.networkextension.packet-tunnel` and `$(PRODUCT_MODULE_NAME).PacketTunnelProvider`, without duplicating the Runner deep-link keys.
- Embedded `PacketTunnel.appex` in the Runner target via an Embed App Extensions phase (dstSubfolderSpec 13), with `NetworkExtension.framework` and a per-configuration build setting that reuses the existing `Runner.entitlements`; `plutil -lint` passes.
- Added `NEOnDemandRuleConnect` for all interfaces as the always-on kill switch (D-09) — no user toggle, no excluded routes.
- Added 6 source-level readiness tests; all pass, with negatives for simulation tokens, fabricated connected state and any build/sign command.

## Task Commits

Each task was committed atomically:

1. **Task 1 (checkpoint:decision, gate blocking): D-07 compile-only confirmation** — `279437c` (docs). The user explicitly selected `compile-only`; not auto-approved. Decision recorded in this SUMMARY and STATE.md.
2. **Task 2 (tracer): provider → plist → entitlement → embedded target** — `6c2d3dd` (feat). Tracer feedback gate re-ran the automated verify successfully; interactive `end-of-phase` + automated-only verify produced no extra checkpoint.
3. **Task 3 (auto): iOS-readiness source assertions** — `ab05dd4` (test). 6/6 tests pass.

**Plan metadata:** recorded by the final `docs(20-04): complete ...` commit.

## Files Created/Modified

- `mobile/ios/PacketTunnel/PacketTunnelProvider.swift` — compile-only NE provider, OnDemand kill switch, documented fd risk.
- `mobile/ios/PacketTunnel/Info.plist` — packet-tunnel extension declaration.
- `mobile/ios/Runner.xcodeproj/project.pbxproj` — embedded PacketTunnel target, framework, copy phase and configurations.
- `mobile/test/unit/core/vpn/ios_prepared_test.dart` — 6 source-level readiness assertions.
- `.planning/STATE.md` — D-07 decision, position, metrics and session (planning metadata).

## Decisions Made

- **D-07 (user-confirmed at the blocking gate):** compile-only iOS preparation; no build, sign or tunnel UAT until Apple approves the entitlement.
- **D-09:** kill switch permanently on via `NEOnDemandRuleConnect` matching all interfaces; no toggle and no bypass routes.
- The fd handoff remains `[ASSUMED]` private KVC and is recorded as risk T-20-13; no private-API workaround is committed.
- The existing `packet-tunnel-provider` entitlement is retained unchanged; no new unapproved entitlement or CocoaPods dependency was added.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Negative source assertions matched their own token literals**
- **Found during:** Task 3 (`ios_prepared_test.dart`)
- **Issue:** The no-build/sign negative test read the test file itself; the forbidden token literals (and later their constant identifiers) appeared verbatim in the test source, so the assertion failed on itself. Adjacent strings inside a list literal also added 5 lint infos.
- **Fix:** Moved the tokens to top-level concatenated constants with neutral identifiers (`_fbToken`, `_xbToken`, `_csToken`, `_ncToken`, `_rndToken`) and referenced them in the lists.
- **Files modified:** `mobile/test/unit/core/vpn/ios_prepared_test.dart`
- **Verification:** `flutter test test/unit/core/vpn/ios_prepared_test.dart` 6/6 pass; `flutter analyze` reports no findings in the new file.
- **Committed in:** `ab05dd4` (Task 3 commit)

**2. Plan no-op (not an auto-fix): `Runner.entitlements` already satisfied the requirement**
- **Found during:** Task 2 (tracer)
- **Issue:** The plan lists `mobile/ios/Runner/Runner.entitlements` as modified, but it already declared `com.apple.developer.networking.networkextension` with `packet-tunnel-provider`. Adding anything would have violated the "no new unapproved entitlement" constraint.
- **Fix:** Left the file byte-identical; reused it as `CODE_SIGN_ENTITLEMENTS` for the extension target.
- **Verification:** `git diff a90cd30..HEAD -- mobile/ios/Runner/Runner.entitlements` is empty; grep for `packet-tunnel-provider` passes.

---

**Total deviations:** 1 auto-fixed (1 Rule 1 bug) + 1 documented plan no-op. **Impact on plan:** none on scope; no new dependency, entitlement or secret surface.

## Issues Encountered

- Bare `flutter analyze` exits 1 on 1622 pre-existing `info`/`warning` lints across unrelated files (0 errors, 1 pre-existing `analysis_options.yaml` warning). `flutter analyze --no-fatal-infos --no-fatal-warnings` exits 0 and no findings occur in 20-04 files. Per the scope boundary, this lint debt was not fixed; recorded as a deviation in `.planning/WINDOWS.md` entry 29.
- No iOS build, sign or on-device tunnel/kill-switch UAT was attempted (D-07 external blocker); recorded as `unrun-verify` in `.planning/WINDOWS.md` entry 28.
- The blocking D-07 checkpoint paused the first executor session before any production commit; the user explicitly selected `compile-only`, so it was not auto-approved.
- `requirements.mark-complete` could not check off REQ-CONN-05/06: `REQUIREMENTS.md` has only a table with no checkbox surface for these IDs. Completion is recorded in this SUMMARY's `requirements-completed` frontmatter and in STATE.md decisions instead; no requirement row was edited.

## Authentication Gates

None. No CLI/credential gate occurred.

## User Setup Required

External, not locally automatable: Apple must approve the `com.apple.developer.networking.networkextension` / `packet-tunnel-provider` entitlement (Apple Developer Portal → Certificates, Identifiers & Profiles → App ID → Network Extension entitlements) before any tunnel build or UAT. This is already a STATE.md blocker and is recorded in the plan's `user_setup` block. No `{phase}-USER-SETUP.md` was generated — prior plans in phase 20 followed the same convention and recorded external blockers in STATE.md instead.

## Known Stubs

- `mobile/ios/PacketTunnel/PacketTunnelProvider.swift:90` — `documentedPacketFlowSeam()` returns `packetFlow` and is intentionally not wired to a read loop or the fd-taking shim. This is a deliberate compile-only seam per D-07, not a placeholder; the fd mechanism is `[ASSUMED]` private KVC and tracked as risk T-20-13 for the entitlement-approved follow-up.

## Threat Flags

None new. All changes stay inside the plan's threat register (T-20-12 entitlement, T-20-13 fd KVC accept, T-20-14 OnDemand kill switch, T-20-SC no package installs): no new network endpoint, no auth path, no schema change, no dependency install, and no config/token/fd/raw-`NSError` logging.

## Next Phase Readiness

- Plans 05-07 can build the Riverpod FSM, reconnect and Connected Panel against the existing Dart/Android seams; iOS must continue to degrade honestly with no simulated connected state, IP or traffic until entitlement approval.
- Remaining external checks: Apple entitlement approval, compile of the extension with provisioning, fd viability (`[ASSUMED]` private KVC) and on-device kill-switch leak test.

## Self-Check: PASSED

- All 4 created/modified plan files and this SUMMARY exist on disk.
- All 3 task commits (`279437c`, `6c2d3dd`, `ab05dd4`) are present in `git log` with no unexpected deletions.
- Re-ran every acceptance criterion: start/stop/setTunnelNetworkSettings, NEOnDemandRuleConnect, both NSExtension keys, retained entitlement, embedded target.
- `flutter test test/unit/core/vpn/ios_prepared_test.dart` 6/6 pass; `flutter analyze --no-fatal-infos --no-fatal-warnings` exit 0; `npx prisma validate` valid; `plutil -lint project.pbxproj` OK.
- No build/sign/UAT was run, no private-KVC solution or fake connected state was authored, and only 20-04 files were staged.

---
*Phase: 20-vpn-core-connect-fsm-10-days*
*Completed: 2026-11-27*
