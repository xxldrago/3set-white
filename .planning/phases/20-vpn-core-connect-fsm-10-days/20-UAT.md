---
status: testing
phase: 20-vpn-core-connect-fsm-10-days
source: [20-VERIFICATION.md]
started: 2026-11-27T06:30:00Z
updated: 2026-11-27T06:30:00Z
---

## Current Test

number: 1
name: Android native tunnel build + on-device connect
expected: |
  arm64-v8a/armeabi-v7a .so artifacts build; real Builder.establish() fd is handed to libbox_start_with_tun; tunnel carries traffic through the selected server (CR-01 route fix), not direct; method channel and «VPN активен · 3set» notification work.
awaiting: user response

## Tests

### 1. Android native tunnel build + on-device connect
expected: Build the Android shim + VpnService in CI (JDK17 + SDK/NDK), install, tap «Подключить», verify routed traffic through the selected server.
result: [pending]

### 2. Foreground notification lifecycle + «Отключить»
expected: Notification «VPN активен · 3set» is ongoing/non-swipeable; tapping «Отключить» drives disconnecting → idle and stops the core before idle.
result: [pending]

### 3. Android kill-switch leak + unexpected core stop
expected: No traffic leaks on disconnect/revoke; kill-switch toast; no orphan tunnel; unexpected core stop emits onCoreStopped → 1/2/4 s backoff → terminal toast «VPN остановлен, попробуйте снова».
result: [pending]

### 4. Real WiFi↔LTE reconnect
expected: 500 ms debounce; VPN-only self-changes ignored; ping cache + last-good cleared while selection/current_tab persist; best server reselected by RTT; /config refetched; exactly one «Сеть изменена — переподключение» toast.
result: [pending]

### 5. iOS entitlement + tunnel UAT
expected: After Apple approves packet-tunnel-provider, build/sign the extension; NEPacketTunnelProvider starts with IPv4+IPv6 settings; installAlwaysOnRules() blocks non-VPN traffic; fd handoff viability confirmed.
result: [pending]

### 6. Live IP-through-tunnel + 1 Hz counters
expected: Connected Panel IP matches the real in-tunnel address (or «—» on failure); ↓/↑ MB update once per second from libbox StatusMessage counters; timer resets on reconnect.
result: [pending]

### 7. Live ARTEMIDA links[] on a paid key
expected: `GET /api/mobile/config?serverId=...` resolves against the real links[] and returns a complete routed config; 401/403/no_active_key behave as specified; no secret in body or logs.
result: [pending]

### 8. Phase 19 deferred UAT
expected: The 7 items in `19-VERIFICATION.md` (live links[], real ping/fallback, WiFi↔LTE invalidation, Android native build, shop-button decision, group URLTest, read-time TTL) are resolved before milestone close.
result: [pending]

## Summary

total: 8
passed: 0
issues: 0
pending: 8
skipped: 0
blocked: 0

## Gaps

[none yet]
