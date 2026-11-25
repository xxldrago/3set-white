# ARCHITECTURE Research — Mobile VPN Client (v2.0)

## Context
Existing: Backend (Node/Next.js) — thin wrapper over ARTEMIDA V1 + Platega + Telegram Bot
New: Flutter mobile client + libbox core + native VPN layer

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      MOBILE CLIENT (Flutter)                    │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────────┐ │
│  │   UI Layer  │  │  State Layer │  │    Core Layer (Dart)   │ │
│  │  (Riverpod) │◄─►│  (Riverpod)  │◄─►│  ┌─────────────────┐  │ │
│  │  Screens:   │  │  Providers:  │  │  │ libbox (ffi)    │  │ │
│  │  Auth, Main,│  │  auth, pool, │  │  │ - urltest       │  │ │
│  │  Shop, Prof │  │  connect,    │  │  │ - config gen    │  │ │
│  │  Sheets     │  │  sub, device │  │  │ - traffic stats │  │ │
│  └─────────────┘  └──────────────┘  │  └────────┬────────┘  │ │
│                                     └───────────┼───────────┘ │
│                                                 │ dart:ffi      │
│  ┌─────────────┐  ┌──────────────┐             ▼             │
│  │  Platform   │  │   Services   │  ┌─────────────────┐      │
│  │  Channels   │  │  (Background)│  │  Native VPN     │      │
│  │  - VPN      │  │  - Foreground│  │  Android:       │      │
│  │  - Storage  │  │  - Connect.  │  │  VpnService     │      │
│  │  - Notifs   │  │  - Notifs    │  │  iOS:           │      │
│  │  - DeepLink │  │  - DeepLink  │  │  NetworkExt     │      │
│  └─────────────┘  └──────────────┘  └─────────────────┘      │
└─────────────────────────────────────────────────────────────────┘
                              │ HTTPS/REST
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    BACKEND (Next.js + Telegraf)                 │
│  ┌──────────────┐  ┌────────────┐  ┌──────────┐  ┌───────────┐ │
│  │ /api/mobile/ │  │  ARTEMIDA  │  │ Platega  │  │ Telegram  │ │
│  │  auth        │◄─►│  Client    │  │  Client  │  │  Bot      │ │
│  │  servers     │  │  (balance, │  │  (pay,   │  │  (webhook)│ │
│  │  subscription│  │  pricing,  │  │  webhook)│  │           │ │
│  │  payments    │  │  keys,     │  │          │  │           │ │
│  │  keys        │  │  traffic)  │  │          │  │           │ │
│  │  devices     │  │            │  │          │  │           │ │
│  └──────────────┘  └────────────┘  └──────────┘  └───────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │  PostgreSQL 17  │
                    │  (Prisma 7)     │
                    └─────────────────┘
```

## Boundaries: Client vs Backend

| Responsibility | Client (Flutter) | Backend (Next.js) |
|----------------|------------------|-------------------|
| **Auth State** | JWT in secure storage, biometric | Issue/validate JWT, Telegram token exchange |
| **Server List** | Cache, display, ping, select | Source of truth from ARTEMIDA `/pricing` + `/servers` |
| **Ping/Urltest** | **Client-side** (HTTP urltest via libbox) | Provide server endpoints only |
| **Config Generation** | **Client-side** (libbox builds sing-box config) | Provide subscription link / key parameters |
| **VPN Tunnel** | **Client-side** (libbox + VpnService/NE) | — |
| **Subscription Status** | Cache, display | Source of truth (ARTEMIDA `/keys`, `/wallet`) |
| **Payments** | Initiate, poll status, show webview | Create Platega payment, webhook handling, key issuance |
| **Key Issuance** | Receive link, store | Call ARTEMIDA `/keys/issue`, `/keys/renew` |
| **Device Management** | Display, add/remove current | Enforce limits, CRUD via ARTEMIDA `/devices` |
| **Traffic Stats** | **Client-side** (libbox counters) | Optional: aggregate for analytics |
| **Push Notifications** | Register token, display local | Send expiry reminders (T-7/T-3/T-1) via FCM |

## Data Flow: Key Operations

### 1. App Launch / Auth Restore
```
Client: read JWT from secure_storage
     → if valid: GET /api/mobile/subscription → hydrate state
     → if invalid/expired: show Auth screen
```

### 2. Server Selection & Ping
```
Client: GET /api/mobile/servers → two pools (simple/whitelist)
     → User selects tab → auto-ping triggered
     → libbox.urltest(server.urls) → RTT + online
     → Cache in Drift (TTL 60s), update UI
     → Quick-path: ping last-good (≤3) first (800ms timeout)
```

### 3. Connect Flow (FSM)
```
IDLE → PINGING (auto-ping or quick-path)
  → CONNECTING (libbox.start(config), VpnService.prepare/NE.start)
  → CONNECTED (foreground service/notification, stats timer)
  → DISCONNECTING (libbox.stop, VPN tear down)
  → IDLE
Cancel: any → IDLE (tear down if CONNECTING)
Error:  any → ERROR → IDLE (toast, retry option)
```

### 4. Purchase Flow
```
Client: POST /api/mobile/payments/create {term, devices, promo, method}
     → Backend: Platega.create → return payment_url + payment_id
     → Client: open webview / browser tab → user pays
     → Client: poll GET /api/mobile/payments/status/{id} (every 3s, max 5min)
     → Backend: Platega webhook → ARTEMIDA.keys.issue → update subscription
     → Client: status=CONFIRMED → GET /api/mobile/subscription → confetti
```

### 5. Network Change / Reconnect
```
Client: connectivity_plus stream → network type changed
     → Invalidate ping cache (Drift clear)
     → If CONNECTED: DISCONNECTING → IDLE → PINGING → CONNECTING → CONNECTED
     → If IDLE: nothing (next connect will fresh ping)
```

## State Management (Riverpod Providers)

```dart
// Core providers
final authProvider = StateNotifierProvider<AuthNotifier, AuthState>((ref) => AuthNotifier(ref));
final serverPoolProvider = FutureProvider.family<List<Server>, PoolTab>((ref, tab) => ...);
final pingCacheProvider = StateNotifierProvider<PingCacheNotifier, Map<String, PingResult>>(...);
final connectionProvider = StateNotifierProvider<ConnectionNotifier, ConnectionState>((ref) => ConnectionNotifier(ref));
final subscriptionProvider = StateNotifierProvider<SubscriptionNotifier, SubscriptionState>((ref) => SubscriptionNotifier(ref));
final deviceProvider = StateNotifierProvider<DeviceNotifier, List<Device>>((ref) => DeviceNotifier(ref));
final shopProvider = StateNotifierProvider<ShopNotifier, ShopState>((ref) => ShopNotifier(ref));

// Derived
final bestServerProvider = Provider.autoDispose<Server?>((ref) {
  final cache = ref.watch(pingCacheProvider);
  final pool = ref.watch(serverPoolProvider(ref.watch(currentTabProvider)));
  // return best online by RTT then load
});
```

## Build & Deployment Integration

| Artifact | Source | Trigger |
|----------|--------|---------|
| **Android AAB** | `flutter build appbundle` | GitHub Actions on tag `mobile/v*` |
| **iOS IPA** | `flutter build ipa` (macOS runner) | GitHub Actions on tag `mobile/v*` |
| **Backend API** | Existing Next.js deploy | Unchanged |
| **Shared Types** | Zod → OpenAPI → Dart (openapi-generator) | CI on schema change |

## Security Boundaries

- **JWT**: Short-lived (15m access + 30d refresh), stored in `flutter_secure_storage` (encrypted)
- **ARTEMIDA API Key**: **Never** on client — backend only
- **Platega Secrets**: **Never** on client — backend only
- **VPN Configs**: Generated client-side from subscription link (no secret material)
- **Traffic**: Never logged, never leaves device
- **Biometric**: Local auth only, unlocks secure storage
