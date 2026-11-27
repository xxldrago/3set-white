---
phase: "20"
slug: "vpn-core-connect-fsm-10-days"
status: planned
nyquist_compliant: true
wave_0_complete: false
created: "2026-11-27"
revised: "2026-11-27"
---

# Phase 20 — Validation Strategy

> Per-phase validation contract for backend `/config`, Flutter FSM/VPN core, Android Kotlin VpnService, and iOS compile-only NE.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (backend) + flutter_test (mobile) + Go `go test`/`go build -buildmode=c-shared` (native shim) |
| **Config file** | `package.json` (`vitest run tests/unit`) + `mobile/pubspec.yaml` + `mobile/native/libbox_shim/go.mod` |
| **Quick run command** | `npx vitest run tests/unit` and `cd mobile && flutter test` |
| **Full suite command** | `npm test` + `npx tsc --noEmit` + `cd mobile && flutter analyze && flutter test` + `cd mobile/native/libbox_shim && go build -buildmode=c-shared` |
| **Estimated runtime** | ~60s backend + ~120s mobile + ~120s Go |

`npx prisma validate`; `cd mobile && dart run build_runner build --delete-conflicting-outputs`; `dart run ffigen --config lib/core/ping/ffigen.yaml`.

---

## Sampling Rate

- **After every task commit:** quick backend + mobile tests (focused path).
- **After every plan wave:** full suites + analyzer + Go shim build/typecheck.
- **Before `/gsd-verify-work`:** all green; native device/on-device items tracked as manual-only.
- **Max feedback latency:** 180 seconds.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 20-01-01 | 01 | 1 | REQ-CONN-03 | T-20-01/02 | JWT+key gate, no secrets in body/log | unit + tsc | `npx tsc --noEmit && npx vitest run tests/unit/mobile-config-route.test.ts tests/unit/mobile-servers-route.test.ts` | ❌ W0 | ⬜ pending |
| 20-01-02 | 01 | 1 | REQ-CONN-03 | T-20-02/04 | no secret in body or logs; reasoned coverage matrix | unit + coverage gate | `npx vitest run tests/unit/mobile-config-route.test.ts && { node /Users/alekseimikhalkin/.config/opencode/gsd-core/bin/gsd-tools.cjs query check api-coverage.verify-pre .planning/phases/20-vpn-core-connect-fsm-10-days 2>/dev/null \|\| true; }` | ❌ W0 | ⬜ pending |
| 20-02-01 | 02 | 1 | REQ-CONN-04/07 | T-20-05/06 | real TUN fd ABI only; generic errors; no config echo | native smoke + analyze | `cd /Users/alekseimikhalkin/Documents/bot-artemida/mobile/native/libbox_shim && ./build.sh host && grep -q 'libbox_start_with_tun' libbox_shim.h && grep -q 'libbox_traffic' libbox_shim.h && cd /Users/alekseimikhalkin/Documents/bot-artemida/mobile && dart run ffigen --config lib/core/ping/ffigen.yaml && flutter analyze` | ❌ W0 | ⬜ pending |
| 20-02-02 | 02 | 1 | REQ-CONN-07 | T-20-05/06 | CheckConfig schema; no dummy fd; idempotent bindings | go test + unit | `cd /Users/alekseimikhalkin/Documents/bot-artemida/mobile/native/libbox_shim && go test ./... && cd /Users/alekseimikhalkin/Documents/bot-artemida/mobile && flutter analyze && flutter test test/unit/core/ping/libbox_core_tun_test.dart && git diff --exit-code -- lib/core/ping/generated/libbox_bindings.dart` | ❌ W0 | ⬜ pending |
| 20-03-01 | 03 | 2 | REQ-CONN-04/06 | T-20-08/09/10/11 | manifest perms; no bypass; exact notification; stop-before-idle | unit + source gate | `cd mobile && flutter analyze && flutter test test/unit/core/vpn/vpn_bridge_test.dart && grep -v '^#' android/app/src/main/AndroidManifest.xml \| grep -c 'BIND_VPN_SERVICE' \| grep -q '^1$' && ! grep -Eq 'VPN_MANAGE\|FOREGROUND_SERVICE_TYPE_VPN' android/app/src/main/AndroidManifest.xml && ! grep -Eq 'allowBypass' android/app/src/main/kotlin/com/u3set/mobile/VpnService.kt && grep -q 'VPN активен · 3set' android/app/src/main/kotlin/com/u3set/mobile/VpnForegroundService.kt` | ❌ W0 | ⬜ pending |
| 20-04-01 | 04 | 2 | REQ-CONN-05/06 | T-20-12/13/14 | compile-only NE; OnDemand; no fake connected state | source gate + analyze | `cd mobile && flutter analyze && grep -q 'NEPacketTunnelProvider' ios/PacketTunnel/PacketTunnelProvider.swift && grep -q 'setTunnelNetworkSettings' ios/PacketTunnel/PacketTunnelProvider.swift && grep -q 'NEOnDemandRuleConnect' ios/PacketTunnel/PacketTunnelProvider.swift && grep -q 'com.apple.networkextension.packet-tunnel' ios/PacketTunnel/Info.plist && grep -q 'packet-tunnel-provider' ios/Runner/Runner.entitlements && grep -q 'PacketTunnel' ios/Runner.xcodeproj/project.pbxproj` | ❌ W0 | ⬜ pending |
| 20-04-02 | 04 | 2 | REQ-CONN-05 | T-20-12/13 | no simulation in iOS sources | unit | `cd mobile && flutter analyze && flutter test test/unit/core/vpn/ios_prepared_test.dart` | ❌ W0 | ⬜ pending |
| 20-05-01 | 05 | 3 | REQ-CONN-01/02/03 | T-20-15/16/17 | guarded transitions; opaque config; no secret log | unit + codegen | `cd mobile && dart run build_runner build --delete-conflicting-outputs && flutter analyze && flutter test test/unit/core/vpn/connection_state_test.dart` | ❌ W0 | ⬜ pending |
| 20-05-02 | 05 | 3 | REQ-CONN-02/10 | T-20-15/16 | stop before idle; exact RU toasts; no raw errors | unit | `cd mobile && flutter analyze && flutter test test/unit/core/vpn/cancel_test.dart test/unit/core/vpn/error_mapping_test.dart` | ❌ W0 | ⬜ pending |
| 20-06-01 | 06 | 4 | REQ-CONN-08, REQ-PING-05 | T-20-18/19/20 | VPN-only filter; one toast; no stale selection | unit | `cd mobile && flutter analyze && flutter test test/unit/core/vpn/reconnect_test.dart && flutter test test/unit/core/ping/network_invalidation_test.dart` | ❌ W0 | ⬜ pending |
| 20-06-02 | 06 | 4 | REQ-CONN-09 | T-20-21 | exact 1/2/4s backoff; no fake crash | unit | `cd mobile && flutter analyze && flutter test test/unit/core/vpn/restart_backoff_test.dart test/unit/core/vpn/error_mapping_test.dart` | ❌ W0 | ⬜ pending |
| 20-07-01 | 07 | 4 | REQ-CONN-07 | T-20-22/23 | live cells from FSM+counters; no simulation | widget | `cd mobile && flutter analyze && flutter test test/widget/features/servers/connect_panel_test.dart` | ❌ W0 | ⬜ pending |
| 20-07-02 | 07 | 4 | REQ-CONN-07 | T-20-22/24 | «—» IP fallback; timer cancel; full suite | unit + full suite | `cd mobile && flutter analyze && flutter test test/unit/core/vpn/connected_stats_test.dart && flutter test` | ❌ W0 | ⬜ pending |

*Task IDs count implementation tasks only; `checkpoint:decision` gates are non-implementation and excluded.* Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky. Every row's `<automated>` command has a sibling `<fails_when>` in its PLAN.md (13/13). The `20-01-02` advisory coverage check is brace-grouped so a vitest failure still yields a non-zero exit. No silent drops: unresolved/unclassified spec-less probe items are surfaced as flagged assumptions, never auto-dismissed. Human-only native items are listed below.

---

## Wave 0 Requirements

- [ ] Backend vitest infrastructure — existing.
- [ ] Mobile `flutter_test` — existing, 199/199 green at phase 19 closeout.
- [ ] Go toolchain available for C-shared smoke build (`go build -buildmode=c-shared` with locked tags) — verified in phase 19 research.
- [ ] `cd mobile && flutter pub get` if new deps added; keep `ffi/ffigen/drift`.
- [ ] `dart run build_runner build` + `dart run ffigen` after C ABI changes.
- [ ] No Prisma schema change; `npx prisma validate`.
- [ ] Android native build NOT runnable here (no JDK17/SDK/NDK) — CI artifact only; tracked manual.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real TUN tunnel on Android | REQ-CONN-03/04 | No JDK/SDK + real device | CI build VpnService + shim, install, connect, confirm tunnel and notification. |
| Cancel/restart/kill switch on device | REQ-CONN-02/06/08/09 | Native lifecycle | Device UAT with real network changes and permission revocation. |
| Connected Panel live IP/traffic | REQ-CONN-07 | Needs live tunnel + IP endpoint | Compare displayed IP with `ipify` inside tunnel; counters update 1s. |
| iOS NE tunnel | REQ-CONN-05/06 | No Apple entitlement | Build compile-only; device test after approval. |
| GPL/Play compliance | all | Legal | `/gsd-secure-phase 20` + legal review (external). |
| Phase 19 deferred UAT | inherited | Device/live key | `/gsd-verify-work 19` before milestone close. |

*All other phase behaviors have automated verification.*

---

## Validation Sign-Off

- [x] All 13 implementation tasks have `<automated>` verify + sibling `<fails_when>` (checkpoints are non-implementation)
- [x] Sampling continuity: every task has an automated verify; no 3 consecutive tasks without one
- [x] Wave 0 section covers all infrastructure prerequisites; the ❌ W0 test files are created by their own tasks, so `wave_0_complete` stays false until execution
- [x] No watch-mode flags
- [x] Feedback latency < 180s (backend ~60s, mobile ~120s, Go ~120s)
- [x] `nyquist_compliant: true` set in frontmatter — coverage check passes at plan time
- [ ] Execution-time results (test green, analyzer clean) — pending `/gsd-execute-phase 20`

**Approval:** planning complete; execution-time sign-off pending. `nyquist_compliant` attests plan coverage only, not executed test results.
