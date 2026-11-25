# STACK Research — Mobile VPN Client (v2.0)

## Context
Existing project: 3set-white VPN service (Node 24, Next.js 16, Telegraf, PostgreSQL 17, Prisma 7, Tailwind 4)
New milestone: v2.0 — Native mobile VPN client (Flutter + libbox/Karing)

## Decision: Client Stack (NEW)

| Component | Choice | Version | Rationale |
|-----------|--------|---------|-----------|
| **Framework** | Flutter | 3.24+ (stable) | Single codebase Android/iOS, native performance, rich ecosystem |
| **State Management** | Riverpod | 2.5+ | Compile-time safety, testable, scales well for VPN state machine |
| **VPN Core** | libbox (sing-box) | latest | Go-based, supports WG/SS/VLESS/Hysteria2/Trojan/Reality, GPL-3.0 |
| **Alternative Core** | Xray-core | latest | MPL-2.0 (more permissive), but less protocol coverage |
| **Bindings** | ffigen + dart:ffi | - | Direct Go↔Dart calls, zero-copy buffer passing |
| **Secure Storage** | flutter_secure_storage | 9.0+ | Encrypted keystore/Keychain, biometric unlock |
| **Connectivity** | connectivity_plus | 6.0+ | Network change detection for ping invalidation |
| **Background Execution** | flutter_background_service | 5.0+ | Foreground service (Android) / Background tasks (iOS) |
| **HTTP Client** | dio | 5.4+ | Interceptors, retry, timeout — for backend API calls |
| **Local DB** | drift (SQLite) | 2.18+ | Typed, reactive, migration support for offline cache |
| **Push Notifications** | firebase_messaging / flutter_local_notifications | latest | FCM + local fallback for expiry reminders |
| **Deep Links** | uni_links | 0.5.1+ | Telegram auth flow handling |
| **Logging** | logger | 2.0+ | Structured logs, matches backend pino format |

## Decision: VPN Core Licensing

**Chosen: libbox (sing-box, GPL-3.0)**
- Full protocol support: WireGuard, Shadowsocks, VLESS, Hysteria2, Trojan, Reality
- Actively maintained, used by Karing, NekoBox, SFW
- **Mitigation**: Dynamic linking via dylib/so, isolate in separate process, provide source offer

**Rejected: Xray-core (MPL-2.0)**
- More permissive but missing Hysteria2, Reality SNI routing maturity

## Decision: Native VPN Layer

| Platform | API | Key Constraints |
|----------|-----|-----------------|
| **Android** | VpnService + Foreground Service | Play policy: must show persistent notification, no traffic logging, privacy policy URL in Play Console |
| **iOS** | NetworkExtension (Packet Tunnel Provider) | App Store review: requires entitlement, privacy manifest, no traffic inspection, kill switch via NEOnDemandRule |

## Integration with Existing Backend

| Backend Endpoint | Mobile Client Usage |
|------------------|---------------------|
| `POST /api/auth/login` | Email/password → JWT |
| `POST /api/auth/telegram` | Deep-link token exchange |
| `GET /api/servers` | Pool listing (simple/whitelist) |
| `GET /api/subscription` | Key status, expiry, device limit, link |
| `POST /api/payments/create` | Platega payment initiation |
| `GET /api/payments/status` | Polling payment confirmation |
| `POST /api/keys/issue` | Issue new subscription key |
| `POST /api/keys/renew` | Renew existing key |
| `GET /api/devices` | List registered devices |
| `DELETE /api/devices/:id` | Remove device |

## Build & Distribution

| Target | Method |
|--------|--------|
| **Android** | Play Store (internal testing → production), APK/AAB via GitHub Actions |
| **iOS** | TestFlight → App Store, Xcode Cloud or GitHub Actions (macOS runner) |
| **Versioning** | Semantic, shared with backend via `pubspec.yaml` + `package.json` sync |

## Dependencies on Existing Stack

- **No changes** to Node/Next.js/Telegraf/Postgres/Prisma backend
- **New**: Mobile-specific API routes under `/api/mobile/*` (thin wrapper, same ARTEMIDA/Platega clients)
- **Shared**: Zod schemas for API contracts (generate Dart types via openapi-generator)
