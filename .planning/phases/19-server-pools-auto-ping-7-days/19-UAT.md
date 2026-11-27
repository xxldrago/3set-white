---
status: testing
phase: 19-server-pools-auto-ping-7-days
source: [19-VERIFICATION.md]
started: 2026-11-27T05:30:00Z
updated: 2026-11-27T05:30:00Z
---

## Current Test

number: 1
name: Live ARTEMIDA links[] payload on a paid key
expected: |
  Simple/whitelist populate from the real `links[]` payload; `proto`, `sni` (whitelist only), remark→city/cc/flag, `key.active` and `key.remainingDays` are correct.
awaiting: user response

## Tests

### 1. Live ARTEMIDA links[] payload on a paid key

expected: On a device with a live paid ARTEMIDA key, `GET /api/mobile/servers` (app or curl with Bearer access token) returns correct pools, proto, SNI, flag/city and key metadata.
result: [pending]

### 2. Real libbox ping + silent fallback

expected: On a built app with real servers, manual refresh and «Подключить» show real `URLTest` RTT/offline with `pingClass` colors; with libbox unavailable, `Socket.connect` fallback renders identically, no `approx` indicator; all-offline shows «Нет доступных серверов. Попробуй другой таб» + «Повторить».
result: [pending]

### 3. WiFi↔LTE invalidation

expected: On a physical device, toggling WiFi↔LTE with the server list open clears `ping_cache` and `last_good`, cancels in-flight pings, triggers a fresh ping, keeps per-tab selection and current tab, and updates the read-only network chip (no simulation toggle).
result: [pending]

### 4. Android libbox shim build in CI

expected: With OpenJDK 17 + Android SDK/NDK, `go build -buildmode=c-shared` produces `arm64-v8a` and `armeabi-v7a` `.so` artifacts; `libbox.urltest(tag)` returns online + RTT via `WriteGroups`; no gomobile artifact required.
result: [pending]

### 5. Shop / «Купить» wiring decision

expected: Decide whether the pool screen's «Купить» buttons navigate to the existing tested `/shop` stub route, or formally accept the current toast stub as the phase-19 placeholder.
result: [pending]

### 6. Post-fix WR-02 — group-triggered URLTest

expected: On a real native build, inspect the generated sing-box config during a ping; the `urltest` group carries `url: https://www.gstatic.com/generate_204`, `URLTest` is triggered on the group tag (`ut-srv-<id>`), and the async sample is mirrored back under `srv-<id>`.
result: [pending]

### 7. Post-fix WR-06 — read-time TTL expiry

expected: After a successful ping, leave the app open past the 60 s TTL without any ping write (e.g. background and resume, or any unrelated UI rebuild); server card, connect panel and auto-select card must treat rows as stale and re-ping.
result: [pending]

## Summary

total: 7
passed: 0
issues: 0
pending: 7
skipped: 0
blocked: 0

## Gaps

[none yet]
