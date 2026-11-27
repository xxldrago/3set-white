---
phase: 20-vpn-core-connect-fsm-10-days
reviewed: 2026-11-27T12:30:00Z
depth: standard
files_reviewed: 40
files_reviewed_list:
  - app/api/mobile/config/route.ts
  - lib/mobile-config.ts
  - tests/unit/mobile-config-route.test.ts
  - mobile/native/libbox_shim/main.go
  - mobile/native/libbox_shim/libbox_shim.h
  - mobile/native/libbox_shim/main_test.go
  - mobile/lib/core/ping/ffigen.yaml
  - mobile/lib/core/ping/generated/libbox_bindings.dart
  - mobile/lib/core/ping/libbox_core.dart
  - mobile/test/unit/core/ping/libbox_core_tun_test.dart
  - mobile/android/app/src/main/AndroidManifest.xml
  - mobile/android/app/src/main/kotlin/com/u3set/mobile/MainActivity.kt
  - mobile/android/app/src/main/kotlin/com/u3set/mobile/VpnService.kt
  - mobile/android/app/src/main/kotlin/com/u3set/mobile/VpnForegroundService.kt
  - mobile/lib/core/vpn/vpn_bridge.dart
  - mobile/test/unit/core/vpn/vpn_bridge_test.dart
  - mobile/ios/PacketTunnel/PacketTunnelProvider.swift
  - mobile/ios/PacketTunnel/Info.plist
  - mobile/ios/Runner.xcodeproj/project.pbxproj
  - mobile/test/unit/core/vpn/ios_prepared_test.dart
  - mobile/lib/core/api/endpoints.dart
  - mobile/lib/core/vpn/connection_state.dart
  - mobile/lib/core/vpn/connection_state.freezed.dart
  - mobile/lib/core/vpn/config_repository.dart
  - mobile/lib/core/vpn/connection_notifier.dart
  - mobile/lib/core/vpn/error_mapping.dart
  - mobile/test/unit/core/vpn/connection_state_test.dart
  - mobile/test/unit/core/vpn/cancel_test.dart
  - mobile/test/unit/core/vpn/error_mapping_test.dart
  - mobile/test/unit/core/vpn/config_repository_test.dart
  - mobile/lib/core/vpn/restart_backoff.dart
  - mobile/test/unit/core/vpn/reconnect_test.dart
  - mobile/test/unit/core/vpn/restart_backoff_test.dart
  - mobile/lib/main.dart
  - mobile/lib/core/vpn/connected_stats.dart
  - mobile/test/unit/core/vpn/connected_stats_test.dart
  - mobile/lib/features/servers/widgets/connect_panel.dart
  - mobile/lib/features/servers/server_pool_screen.dart
  - mobile/test/widget/features/servers/connect_panel_test.dart
  - mobile/test/widget/features/servers/server_pool_screen_test.dart
findings:
  critical: 2
  warning: 4
  info: 2
  total: 8
status: fixed
resolved_at: 2026-11-27T21:40:00Z
fix_iteration: 1
---

# Phase 20: Code Review Report

**Reviewed:** 2026-11-27T12:30:00Z
**Depth:** standard
**Files Reviewed:** 40
**Status:** fixed (all 8 findings resolved — see Resolution lines below)

## Summary

Reviewed all 40 source files committed across plans 20-01..20-07 (commits `4756bc6`..`8e99bfe`). The uncommitted admin/promo working-tree changes were excluded per scope. The implementation is disciplined about the invariants this phase cared about most: JWT + active-key gating happens on every `/config` request, raw links/secrets/config fragments are not logged, the config is opaque end-to-end, the TUN fd is passed as an opaque integer and libbox dups it (verified against cached sing-box v1.14.4 `service.go`), no `load`/`Math.random`/`sleep`/fake IP appeared in production paths, the kill switch has no bypass toggle, and no secret was found in logs or error toasts.

Two BLOCKER-tier defects survive that discipline. (1) The generated sing-box config sets `route.final = "direct"` with no route rule, so the selected server outbound/WireGuard endpoint is never used — per official sing-box docs `final` is the default outbound, which means all tunnel traffic exits directly. The smoke proof only ran `CheckConfig` (syntax), which cannot catch this. (2) The `core_stopped` event consumed by the FSM has no producer anywhere in native or Dart code, making the entire 1/2/4 s restart backoff (REQ-CONN-09) unreachable and leaving the FSM "connected" with all traffic blackholed after a core stop. Several WARNINGs compound these: start failures that are not `VpnBridgeException` are unhandled (FSM stuck in `connecting`), outbound socket protection is wired on neither side, cancel is a no-op during `pinging`, and the iOS "always-on" source is IPv4-only with its OnDemand installer never called.

## Critical Issues

### CR-01: `route.final = "direct"` means the selected server is never used (BLOCKER)

**File:** `lib/mobile-config.ts:76-87` (also `app/api/mobile/config/route.ts:113`, `tests/unit/mobile-config-route.test.ts:166-169`, `mobile/native/libbox_shim/main_test.go:36-40`, `.planning/phases/20-vpn-core-connect-fsm-10-days/20-RESEARCH.md:303-305`)
**Issue:** `buildMobileConfig` copies the chosen `Server.outbound` into `outbounds` (or WireGuard into `endpoints`) but emits `route: { final: "direct" }` with **no `route.rules`**. The cached sing-box v1.14.4 docs state: `final` = "Default outbound tag. the first outbound will be used if empty." With `final` explicitly set to `"direct"` and no rules, every connection is routed through the `direct` outbound; the VLESS/WireGuard server config is dead data. The tunnel interface comes up and `CheckConfig` passes, but traffic is not sent through the paid VPN server — a functional failure and a false sense of protection under the always-on kill switch. The test suite actually asserts the broken shape (`expect(config.route).toEqual({ final: 'direct' })`), so it cannot catch this.
**Fix:** Make the chosen outbound the effective default (and keep `direct` only as a declared fallback). Example for `buildMobileConfig`:

```ts
const chosenTag = outbound && typeof outbound.tag === "string" ? outbound.tag : null;
return {
  log: { level: "error" },
  dns: { servers: [{ type: "local", tag: "local" }], final: "local" },
  inbounds: [tunInbound()],
  endpoints,
  outbounds,
  // route to the selected server; never silently fall back to direct
  route: chosenTag ? { rules: [{ outbound: chosenTag }], final: chosenTag } : { final: "direct" },
};
```

Add a vector asserting the selected tag is the route target, and update the Go TUN test vector accordingly.

**Resolution:** FIXED (`6de3db7`) — `buildMobileConfig` now emits `route.rules` + `route.final` pointing at the chosen outbound/endpoint tag for VLESS/TLS, VLESS/Reality and WireGuard; `direct` stays declared only as a fallback. Added assertions for both endpoint kinds and updated the Go `CheckConfig` smoke vector to route via the server tag.

### CR-02: `core_stopped` has no producer — restart backoff is dead code (BLOCKER)

**File:** `mobile/lib/core/vpn/vpn_bridge.dart:158-166` and `mobile/lib/core/vpn/connection_notifier.dart:139-149,375-418` (also `mobile/native/libbox_shim/main.go:108-115`)
**Issue:** `ConnectionNotifier._onBridgeEvent` handles a `"core_stopped"` event and `handleCoreStopped()` implements the whole 1/2/4 s bounded restart, but **no code ever emits that event**. `MethodChannelVpnBridge._onNativeEvent` produces only `revoked` and `disconnect`; Kotlin `VpnMethodChannel` exposes only `emitRevoked()`/`emitDisconnect()`; Go `noopServerHandler.ServiceStop()` is an empty no-op; `LibboxPingCore` has no stop/status callback. Searching the whole `mobile/` tree for `core_stopped`/`onCoreStopped`/`emitCoreStopped` yields only the consumer, the error-code enum, and tests — no producer. Consequently REQ-CONN-09 never runs in production: a core stop leaves the FSM in `connected` while the always-on kill switch blackholes all traffic, with no toast and no retry.
**Fix:** Add a real native→Dart signal for core stop and map it:

```dart
// vpn_bridge.dart — _onNativeEvent
case "onCoreStopped":
  _events.add(const VpnBridgeEvent("core_stopped"));
```

with a corresponding Kotlin `channel?.invokeMethod("onCoreStopped", null)` on service-stop/status loss (and/or a Go→Dart status callback wired through the existing handler). If no reliable native signal is available before entitlement/CI work, document the backoff as non-functional rather than shipping a path that can never fire.

**Resolution:** FIXED (`4cf2a42`) — real producer wired end-to-end: the Dart bridge maps `onCoreStopped` → `core_stopped`, and Kotlin `ThreeSetVpnService` emits it on unexpected service death (user cancel/disconnect/revoke are explicitly excluded). Tests drive native event → real stop → 1/2/4 s backoff → connected reset with no orphan tunnel.

## Warnings

### WR-01: Non-`VpnBridgeException` start failures leave the FSM stuck in `connecting`

**File:** `mobile/lib/core/vpn/connection_notifier.dart:257-269` and `mobile/lib/core/vpn/vpn_bridge.dart:178-190`
**Issue:** `MethodChannelVpnBridge.start()` catches only `PlatformException`. Errors from `_core.startWithTun` (`LibboxConfigException`, `LibboxUnavailableException`) — the normal outcome when sing-box rejects the config or the native library is missing — propagate unchanged. `_startTunnel` catches only `VpnBridgeException`, so the Future rejects unhandled: no `_fail()`, no toast, and the phase stays `connecting` forever (button reads «Подключение…» with a cancel that can never succeed).
**Fix:** Fail closed at the bridge boundary and/or broaden the FSM catch:

```dart
// vpn_bridge.dart start(): wrap any non-platform failure too
} on Object {
  throw const VpnBridgeException("config_invalid");
}
```

```dart
// connection_notifier.dart _startTunnel: safety net
} on Object {
  _handleStartFailure("config_invalid", "bridge_start_failed", generation, onFailure);
  return;
}
```

**Resolution:** FIXED (`4758d24`) — the bridge maps any non-platform core/config failure to the stable `config_invalid` code and the FSM adds catch-all safety nets around config fetch, `prepare()` and `start()`. All paths now reach `error` + toast instead of hanging in `connecting`; bridge- and FSM-level tests added.

### WR-02: Outbound socket protection is never wired (routing-loop / no-connectivity risk)

**File:** `mobile/android/app/src/main/kotlin/com/u3set/mobile/VpnService.kt:90,242-249`, `mobile/lib/core/vpn/vpn_bridge.dart:126,209-213`, `mobile/native/libbox_shim/main.go:38-42,55-59,95-102`
**Issue:** `VpnBridge.protect()` and Kotlin `protectFd()` exist but have **no production caller** (grep across `mobile/` finds only the definitions and Kotlin handler). Meanwhile `tunPlatform` embeds `noopPlatform`, whose `UsePlatformAutoDetectInterfaceControl()` returns `false`, `AutoDetectInterfaceControl(int32)` returns `nil`, and `FindConnectionOwner(...)` returns `errUnsupported`. sing-box docs note `auto_detect_interface` is unsupported on Android, so with full IPv4/IPv6 routes and no bypass the tunnel's own outbound socket to the VPN server is not protected and can be captured by its own TUN routes. Once CR-01 is fixed (real server dialing), this becomes a self-routing loop / dead connection.
**Fix:** Route libbox's socket-protection callback to `VpnService.protect(fd)` (JNI/platform channel) or explicitly protect the server socket before `StartOrReloadService`. At minimum add an on-device UAT item that verifies connectivity with the always-on routes; do not rely on the no-op `noopPlatform` hooks.

**Resolution:** FIXED (`c993bfe`) — `tunPlatform` now opts into `AutoDetectInterfaceControl`; TUN sessions enable `route.auto_detect_interface` in the shim (backend config unchanged), and a Dart-registered C callback dispatches `VpnBridge.protect(fd)` → Kotlin `VpnService.protectFd(fd)`. Refused protection fails the dial rather than looping through the TUN; Go + Dart hook tests added.

### WR-03: Tapping «Подключение…» during `pinging` does nothing

**File:** `mobile/lib/features/servers/server_pool_screen.dart:351-354` and `mobile/lib/core/vpn/connection_notifier.dart:100-101`
**Issue:** `_connect()` routes both `pinging` and `connecting` phases to `notifier.cancel()`, and the panel shows «Подключение…» for both (`connection_state.dart:56`). But `cancel()` starts with `if (state.phase != ConnPhase.connecting) return;`, so a tap during server selection is silently ignored. This contradicts the locked copy «Подключение…» with cancellation (D-13) and leaves the user unable to abort a selection round.
**Fix:** Allow cancel from both in-flight phases (the generation check after `connectController.connect()` at line 190 already prevents a late success from setting `connected`):

```dart
if (state.phase != ConnPhase.connecting && state.phase != ConnPhase.pinging) return;
```

**Resolution:** FIXED (`a83e831`) — `cancel()` now accepts both `pinging` and `connecting`; the generation guard prevents a late selection from announcing a tunnel and the locked «Подключение отменено» toast is emitted. Test added.

### WR-04: iOS "always-on" source is IPv4-only and its OnDemand installer is never called

**File:** `mobile/ios/PacketTunnel/PacketTunnelProvider.swift:25-48,68-77,106-119`
**Issue:** `TunnelValues.fallback` defines only an IPv4 address/route and `startTunnel` sets only `NEIPv4Settings`; no `NEIPv6Settings` is ever configured, so IPv6 traffic is not captured despite the comment "all IP traffic enters the tunnel" and the backend config carrying an IPv6 TUN address. Separately, `PacketTunnelOnDemand.installAlwaysOnRules()` is defined but has no caller anywhere in the repo, so `NEOnDemandRuleConnect` is never installed. This is compile-only by D-07, but the prepared source does not yet deliver the always-on kill switch it claims.
**Fix:** Build `NEIPv6Settings` from options (address `fdfe:dcba:9876::1`, included route `::/0`, no excluded routes), and wire `installAlwaysOnRules()` from the host app once the entitlement is approved (or record it explicitly as a follow-up rather than an implemented control).

**Resolution:** FIXED (`95c4d7a`, compile-only per D-07) — `NEIPv6Settings`/`NEIPv6Route` capture `::/0` with no excluded routes, and `installAlwaysOnRules()` is now called from the prepared source. No entitlement request, build, signing or device verification was performed.

## Info

### IN-01: «Повторить» snack-bar action only dismisses the snack bar

**File:** `mobile/lib/core/vpn/error_mapping.dart:117-121`
**Issue:** For permission-denied/revoked errors the toast carries a `SnackBarAction(label: "Повторить", onPressed: messenger.hideCurrentSnackBar)`, so the button never reconnects — it only hides itself. The panel button also reads «Повторить» in `error`, so a retry path exists, but the affordance on the snack bar is misleading.
**Fix:** Either invoke `connectionNotifierProvider.connect(...)` from the action (with the preserved tab/serverId) or drop the action label so only the panel offers retry.

**Resolution:** FIXED (`5589593`) — retry toasts now carry a real FSM callback that re-runs the last failed connect with its preserved tab/serverId instead of only hiding the snack bar. Test added.

### IN-02: Revoke does not cancel a pending restart backoff

**File:** `mobile/lib/core/vpn/connection_notifier.dart:153-165` (contrast `cancel()` at 102 and `disconnect()` at 115)
**Issue:** `cancel()` and `disconnect()` call `restartBackoffProvider.cancel()`, but `_handleRevoked()` does not. A queued 1/2/4 s retry can therefore fire after consent was revoked; `bridge.prepare()` will fail, but the app issues a pointless reconnect attempt (and extra permission prompt) after revocation.
**Fix:** Call `ref.read(restartBackoffProvider).cancel();` at the start of `_handleRevoked()`.

**Resolution:** FIXED (`dbe1ed9`) — `_handleRevoked()` cancels the pending `RestartBackoff` timer; the test asserts no retry fires after consent is revoked.

---

_Reviewed: 2026-11-27T12:30:00Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
