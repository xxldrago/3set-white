# RESEARCH SUMMARY — Mobile VPN Client (v2.0)

*Synthesized from STACK.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md*

## Overview
**Goal**: Native mobile VPN client (Flutter + libbox/Karing) for 3set-white VPN service.
**Scope**: Two server pools (Simple/Whitelist), one-button connect, autoping, subscription-gated configs, purchase/renewal via Platega.
**Milestone**: v2.0 (new platform product, Phase 18+)

---

## Stack Decisions (Final)

| Layer | Choice | Version | Key Rationale |
|-------|--------|---------|---------------|
| **Framework** | Flutter | 3.24+ | Single codebase, native perf, Dart FFI for libbox |
| **State** | Riverpod | 2.5+ | Compile-time safety, FSM-friendly |
| **VPN Core** | libbox (sing-box) | latest | Full protocol support (WG/SS/VLESS/HY2/TR/Reality) |
| **Licensing** | GPL-3.0 dynamic linking | — | dylib/so isolation, source offer published |
| **Android VPN** | VpnService + Foreground Service | — | Play policy compliant, persistent notification |
| **iOS VPN** | NetworkExtension (Packet Tunnel) | — | App Store review path, NEOnDemandRule kill switch |
| **Secure Storage** | flutter_secure_storage | 9.0+ | Encrypted keystore/Keychain, biometric |
| **Connectivity** | connectivity_plus | 6.0+ | Network change → ping cache invalidation |
| **Background** | flutter_background_service | 5.0+ | Foreground service (Android) / BG tasks (iOS) |
| **HTTP** | dio | 5.4+ | Interceptors, retry, timeout |
| **Local DB** | drift (SQLite) | 2.18+ | Typed, reactive, ping cache TTL |
| **Push** | firebase_messaging + flutter_local_notifications | — | FCM + local fallback |
| **Deep Links** | uni_links | 0.5.1+ | Telegram auth nonce flow |

---

## Feature Set (Prioritized)

### P0 — Table Stakes (Launch Blockers)
| ID | Feature | Complexity | Depends On |
|----|---------|------------|------------|
| F-01 | Auth: Email+Password (min 8) | Medium | Backend `/api/auth/*`, secure storage |
| F-02 | Auth: Telegram Deep-Link | Medium | Backend `/api/auth/telegram`, uni_links |
| F-03 | Server Pools (2 tabs) | Low | Backend `/api/servers` |
| F-04 | Auto-Ping / Selection | **High** | libbox urltest, connectivity_plus, Drift cache |
| F-05 | One-Button Connect FSM | **High** | libbox, VpnService/NE, Riverpod FSM |
| F-06 | Subscription Gating | Low | Subscription status |
| F-07 | Purchase/Renewal (5 terms, 2-10 devices, promo) | Medium | Platega web flow, polling, key issuance |
| F-08 | Device Management | Low | Backend `/api/devices` |
| F-09 | Kill Switch | **High** | Platform VPN APIs |
| F-10 | Auto-Reconnect | Medium | Connectivity + FSM |

### P1 — Differentiators (Polish)
F-11 Protocol badges, F-12 Load indicators, F-13 Last-good chip, F-14 Subscription ring, F-15 Live traffic stats, F-16 Toast with undo, F-17 Confetti, F-18 Referral link

### Explicitly Out (Anti-Features)
Split tunneling, custom DNS, multi-hop, traffic logging, free tier, IAP (Apple/Google)

---

## Architecture Integration Points

**Client owns**: Ping/urltest, config generation, VPN tunnel, traffic stats, local auth state
**Backend owns**: ARTEMIDA/Platega secrets, key issuance/renewal, subscription source of truth, payment webhook, device limit enforcement

**New Backend Routes** (`/api/mobile/*`):
- `POST /auth/login` — email/password → JWT
- `POST /auth/telegram` — nonce exchange → JWT
- `GET /servers` — pool listing with load/proto
- `GET /subscription` — status, expiry, device limit, link
- `POST /payments/create` — Platega init → payment_url + id
- `GET /payments/status/:id` — polling endpoint
- `POST /keys/issue` — new key (backend calls ARTEMIDA)
- `POST /keys/renew` — renew key
- `GET /devices` — list
- `DELETE /devices/:id` — remove

**Data Flow Highlights**:
1. **Launch**: JWT from secure_storage → `/subscription` → hydrate
2. **Ping**: `/servers` → libbox urltest → Drift cache (TTL 60s) → quick-path last-good (≤3, 800ms)
3. **Connect**: IDLE → PINGING → CONNECTING (libbox + VpnService/NE) → CONNECTED (stats timer)
4. **Purchase**: `/payments/create` → webview → poll `/payments/status` → CONFIRMED → `/subscription` → confetti
5. **Network Change**: connectivity_plus → invalidate cache → if CONNECTED: full reconnect FSM

**State Management**: Riverpod providers for auth, serverPool, pingCache, connection (FSM), subscription, device, shop

---

## Critical Pitfalls & Mitigations

| Area | Top Risks | Mitigation |
|------|-----------|------------|
| **Licensing** | GPL-3.0 compliance, App Store rejection | Dynamic linking, separate process, source offer, legal review |
| **Android** | Play policy (notification, logging, privacy) | Persistent notification, zero traffic logging, privacy policy URL |
| **iOS** | NetworkExtension entitlement, review rejection | Early entitlement request, test account + video, privacy manifest |
| **Payments** | Idempotency, webhook races, trial constraints | Idempotency-Key, unique transaction_id, trial block in backend |
| **Network** | Stale ping cache, captive portal, IPv6 leaks | connectivity_plus invalidation, captive detection, DNS config |
| **Auth** | JWT theft, deep-link hijack | Short TTL, refresh rotation, nonce-based Telegram flow |
| **Build** | Keystore loss, code signing, bundle size | Secret manager, fastlane match, `--split-per-abi` |
| **Testing** | No device farm, permission flows, network simulation | Physical devices, flutter_driver integration, network link conditioner |

---

## Phase Breakdown Recommendation (for Roadmap)

| Phase | Focus | Key Deliverables |
|-------|-------|------------------|
| **18** | **Foundation & Auth** | Flutter project, Riverpod, secure_storage, email/Telegram auth, JWT, biometric |
| **19** | **Server Pools & Ping** | `/api/mobile/servers`, pool UI, libbox urltest, Drift cache, quick-path, connectivity |
| **20** | **VPN Core & Connect FSM** | libbox FFI, VpnService/NE, connection FSM, kill switch, foreground service |
| **21** | **Subscription & Purchase** | `/api/mobile/subscription`, `/payments/*`, Platega webview, polling, key issuance, confetti |
| **22** | **Devices & Polish** | Device management, referral, push notifications (expiry T-7/3/1), UI polish |
| **23** | **Hardening & Release** | Error handling (ARTEMIDA codes), captive portal, IPv6 leak test, CI/CD, Play/TestFlight |

---

## Open Questions for Requirements Phase

1. **Grace period duration** for expired keys? (Seed: not specified → suggest 24h)
2. **Push provider**: FCM only or APNs direct? (Seed: not specified → FCM + local fallback)
3. **Telegram bot username**: `set3vpn_bot` confirmed? (Seed: used in prototype)
4. **Platega test credentials** available for CI? (Need for Phase 21)
5. **Apple Developer account** access for NetworkExtension entitlement? (Blocking for Phase 20)
6. **Legal review** timeline for GPL-3.0 dynamic linking? (Blocking for release)

---

## Next Step
Run `/gsd-plan-phase` with this summary to create detailed REQUIREMENTS.md (REQ-IDs) and phased ROADMAP.md.
