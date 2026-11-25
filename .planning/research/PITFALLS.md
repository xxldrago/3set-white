# PITFALLS Research — Mobile VPN Client (v2.0)

## Context
Security constraints from PROJECT.md:
- Secrets only in env/secret manager, never committed
- ARTEMIDA limits: trial no renew/upgrade, permanent delete no refund, handle 401/402/409/429/502/503 + Retry-After
- RU/RUB, unlimited by default
- HTTPS mandatory (Platega webhook + Telegram webhook)

## Licensing Pitfalls

| Pitfall | Impact | Prevention |
|---------|--------|------------|
| **GPL-3.0 (sing-box/libbox/Karing)** | App must be open source or provide source offer; dynamic linking required | Use dylib/so dynamic linking, isolate in separate process, publish source on GitHub, include license notices |
| **MPL-2.0 (Xray-core)** | File-level copyleft, easier compliance | Not chosen — missing Hysteria2/Reality |
| **App Store / Play Store** | GPL app may be rejected if not compliant | Provide source offer in app description, use dynamic linking, legal review |

## Android VPN Pitfalls

| Pitfall | Impact | Prevention |
|---------|--------|------------|
| **VpnService + Foreground Service** | Must show persistent notification; Play rejects if hidden | Always show notification with "VPN active" + disconnect action; `NotificationCompat.PRIORITY_LOW` |
| **Play Policy: Traffic Logging** | Ban if any traffic inspection/logging | **Never** log packet contents, destinations, or volumes to disk/cloud |
| **Play Policy: Privacy Policy** | Required in Play Console + in-app link | Publish privacy policy at `https://3set.online/privacy`, link in Play Console and app settings |
| **Battery Optimization** | System kills background VPN | Request "Unrestricted" battery usage, use `flutter_background_service` with foreground notification |
| **VPN Permission Revoke** | User can revoke in Settings → tunnel dies | Listen for `VpnService.onRevoke()`, cleanup gracefully, show toast |
| **Multiple VPN Apps** | Only one VpnService active | Detect conflict, show "Another VPN active" error |

## iOS VPN Pitfalls

| Pitfall | Impact | Prevention |
|---------|--------|------------|
| **NetworkExtension Entitlement** | Required from Apple, manual review | Apply early via Developer Portal, justify "VPN client for privacy" |
| **App Store Review: Packet Tunnel** | Strict review, often rejected first time | Provide test account, video demo, privacy manifest, no traffic inspection |
| **NEOnDemandRule for Kill Switch** | Complex rules, limited actions | Use `NEOnDemandRuleConnect` with `interfaceTypeMatching: .any`, `action: .connect` |
| **Background Execution Limits** | iOS kills NEPacketTunnelProvider after ~10min idle | Use `NEPacketTunnelProvider` with `setTunnelNetworkSettings`, keep alive via periodic ping |
| **No VpnService Equivalent** | Different API, cannot share code | Platform channel abstraction, shared Dart logic |

## Backend Integration Pitfalls

| Pitfall | Impact | Prevention |
|---------|--------|------------|
| **Payment Idempotency** | Duplicate charges on retry | `Idempotency-Key` header on `/payments/create` (UUID v4), unique constraint on `payment_id` in DB |
| **ARTEMIDA Rate Limits** | 429/502/503 + Retry-After | `p-retry` with exponential backoff honoring `Retry-After`, max 3 retries |
| **Trial Constraints** | Trial cannot renew/upgrade | Backend: block renew/upgrade if `key.type === 'trial'`; Client: hide renew for trial |
| **Key Expiry / Device Limits** | User exceeds limit → config fails | Client: enforce device limit before connect; Backend: validate on key issue |
| **Webhook Race Conditions** | Platega webhook arrives before client polls | Idempotent webhook handler (unique `transaction_id`), return 200 fast, process async |
| **Grace Period** | Expired key still works briefly | Backend: configurable grace (e.g., 24h), Client: show "expiring soon" banner |

## Network & Connectivity Pitfalls

| Pitfall | Impact | Prevention |
|---------|--------|------------|
| **Network Change → Stale Ping Cache** | Connect to dead server | `connectivity_plus` stream → invalidate Drift ping cache immediately |
| **IPv6 / DNS Leaks** | Traffic bypasses VPN | libbox config: `dns: { servers: ["1.1.1.1"], strategy: "ipv4_only" }`, test with `dnsleaktest.com` |
| **Captive Portal (Wi-Fi login)** | VPN blocks portal → no internet | Detect captive portal (HTTP 302 to non-HTTPS), auto-disconnect VPN, show "Login to Wi-Fi first" |
| **Server Failover** | Selected server dies mid-session | Connection FSM: on disconnect error → auto-reconnect to next best (from ping cache) |
| **Background Reconnect** | App killed, VPN down, no auto-reconnect | Foreground service (Android) / NEPacketTunnelProvider (iOS) with `NEOnDemandRule` |

## Auth & Security Pitfalls

| Pitfall | Impact | Prevention |
|---------|--------|------------|
| **JWT Theft** | Account takeover | Short TTL (15m), refresh token rotation, secure storage only |
| **Biometric Bypass** | Local auth bypassed | `flutter_secure_storage` with `biometricAuth: true`, fallback to device PIN |
| **Deep-Link Hijack** | Telegram auth code stolen | Nonce-based: `t.me/bot?start=nonce`, server validates nonce once, 5min TTL |
| **Subscription Link Exposure** | Key shared by user | Link is bearer token — accept; backend: device limit enforces sharing cap |

## Build & Distribution Pitfalls

| Pitfall | Impact | Prevention |
|---------|--------|------------|
| **Flutter Version Drift** | Incompatible plugins | Pin Flutter in `FVM` or `asdf`, use `flutter_version` in CI |
| **iOS Code Signing** | CI fails on macOS runner | Xcode Cloud or GitHub Actions macOS-latest with `fastlane match` |
| **Android Keystore Loss** | Cannot update app | Store keystore in 1Password/secret manager, document recovery |
| **App Bundle Size** | libbox + Flutter = large | `--split-per-abi`, R8/ProGuard, defer non-critical assets |

## Testing Gaps

| Gap | Risk | Mitigation |
|-----|------|------------|
| **No Real Device Farm** | Platform-specific bugs missed | Test on physical Android (API 24-34) + iOS (15-18) |
| **VPN Permission Flows** | User denies → crash | Unit test all permission states, integration test with `flutter_driver` |
| **Network Change Simulation** | Reconnect logic untested | `connectivity_plus` mock + integration test with network link conditioner |
| **Payment Flow E2E** | Flaky webhook/polling | Staging Platega + test cards, contract test webhook payload |
| **ARTEMIDA Error Codes** | Unhandled 401/402/409/429/502/503 | Mock server returning each code, verify retry/backoff/UI |

## Prevention Checklist (Definition of Ready for Phase Planning)

- [ ] Licensing: legal review of GPL-3.0 dynamic linking approach
- [ ] Apple: NetworkExtension entitlement applied & approved
- [ ] Google: Privacy policy published, Play Console configured
- [ ] Backend: `/api/mobile/*` routes designed, Zod schemas shared
- [ ] CI: GitHub Actions workflows for Android AAB + iOS IPA
- [ ] Secrets: Keystore, Apple certs, API keys in secret manager
- [ ] Monitoring: Crashlytics/Sentry + custom events (connect success/fail, payment complete)
