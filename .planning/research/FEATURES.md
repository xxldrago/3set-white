# FEATURES Research — Mobile VPN Client (v2.0)

## Context
Seed: SEED-001 (Мобильный клиент на базе Karing)
Milestone: v2.0 — Native mobile VPN client

## Feature Categories (from Seed + Market Analysis)

### Table Stakes (Must Have)
| ID | Feature | Description | Priority |
|----|---------|-------------|----------|
| F-01 | **Auth: Email + Password** | Min 8 chars, JWT, secure storage, biometric unlock | P0 |
| F-02 | **Auth: Telegram Deep-Link** | `t.me/bot?start=nonce` → token exchange, no password | P0 |
| F-03 | **Server Pools (2 tabs)** | Simple (full tunnel) / Whitelist (Reality+SNI) | P0 |
| F-04 | **Auto-Ping / Server Selection** | HTTP urltest, quick-path last-good (≤3, 800ms) → full (2s), cache 60s | P0 |
| F-05 | **One-Button Connect** | Idle → pinging → connecting → connected → disconnecting, cancel connecting | P0 |
| F-06 | **Subscription Gating** | No active key → blocked configs, shop redirect | P0 |
| F-07 | **Purchase / Renewal** | 5 terms (7d/1m/3m/6m/12m), devices 2-10, promo codes, Platega | P0 |
| F-08 | **Device Management** | List, remove, add current, limit enforcement | P0 |
| F-09 | **Kill Switch** | Android: block non-VPN traffic; iOS: NEOnDemandRule | P0 |
| F-10 | **Auto-Reconnect** | Network change → invalidate ping cache → reconnect if was connected | P0 |

### Differentiators (Should Have)
| ID | Feature | Description | Priority |
|----|---------|-------------|----------|
| F-11 | **Protocol Badge** | Show WG/SS/VLESS/HY2/TR badge per server | P1 |
| F-12 | **Load Indicator** | Visual load bar per server (from backend) | P1 |
| F-13 | **Last-Good Chip** | "последний" tag on recently successful server | P1 |
| F-14 | **Subscription Ring** | SVG progress ring (days left / 30) in shop | P1 |
| F-15 | **Traffic Stats Live** | Connected panel: ↓/↑ MB, session timer, IP, ping | P1 |
| F-16 | **Toast with Undo** | Device removal → "Вернуть" action | P1 |
| F-17 | **Confetti on Purchase** | Celebration animation | P1 |
| F-18 | **Referral Link** | Copy/share referral code in profile | P1 |

### Anti-Features (Explicitly Out)
| ID | Feature | Reason |
|----|---------|--------|
| AF-01 | Split Tunneling (per-app) | Complexity, not in seed scope |
| AF-02 | Custom DNS / Routing Rules | Advanced, defer to v2.1+ |
| AF-03 | Multi-hop / Chaining | Not in ARTEMIDA offering |
| AF-04 | Traffic Logging / Analytics | Privacy policy forbids |
| AF-05 | Free Tier / Trial in App | Trial cannot renew/upgrade (ARTEMIDA constraint) |
| AF-06 | In-App Purchases (Apple/Google) | Must use Platega web payment (RUB, RU compliance) |

## Complexity & Dependencies

| Feature | Complexity | Depends On |
|---------|------------|------------|
| F-01, F-02 (Auth) | Medium | Backend `/api/auth/*`, secure storage |
| F-03 (Pools) | Low | Backend `/api/servers` |
| F-04 (Auto-Ping) | High | libbox urltest, connectivity_plus, cache logic |
| F-05 (Connect FSM) | High | libbox, VpnService/NE, state machine |
| F-06 (Gating) | Low | Subscription status check |
| F-07 (Purchase) | Medium | Platega web flow, polling, key issuance |
| F-08 (Devices) | Low | Backend `/api/devices` |
| F-09 (Kill Switch) | High | Platform-specific VPN APIs |
| F-10 (Reconnect) | Medium | Connectivity + FSM |
| F-11..F-18 (UI) | Low-Medium | Design system, Riverpod state |

## Acceptance Criteria (per Seed)

- **Ping**: last-good path ≤800ms for ≤3 servers; full ping ≤2000ms all; cache TTL 60s; invalidated on network change
- **Connect**: idle→pinging→connecting→connected; cancel during connecting; auto-reconnect on network change if was connected
- **Auth**: email (8+ chars) + Telegram deep-link; JWT in secure storage; biometric unlock
- **Purchase**: 5 terms × devices (2-10) × promo (LIME15/3SET5) → Platega → key issued → confetti
- **Subscription**: key blocks config access if expired; shop shows expiry ring, days left, device count
- **Devices**: limit enforced; remove with undo toast; add current device
