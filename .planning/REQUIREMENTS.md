# REQUIREMENTS — v2.0 Мобильный клиент

*Derived from SEED-001, Research Summary, and user decisions (2026-11-25)*

## Milestone Context
- **Version**: v2.0
- **Name**: Мобильный клиент
- **Status**: planning
- **Seed**: SEED-001 (mobile client Karing)
- **Trigger**: "when mobile client is scheduled" — now activated

---

## Requirements (REQ-IDs)

### REQ-AUTH: Authentication & Session

| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| REQ-AUTH-01 | **Email/Password Login** — min 8 chars, JWT (15m access + 30d refresh), stored in `flutter_secure_storage` with biometric unlock | P0 | Valid credentials → JWT stored; biometric prompt on app open; invalid → error toast |
| REQ-AUTH-02 | **Register Flow** — email + password (min 8), confirm password, POST `/api/mobile/auth/register` → JWT | P0 | Registered → auto-login → main screen |
| REQ-AUTH-03 | **Telegram Deep-Link Auth** — `t.me/set3vpn_bot?start={nonce}` → nonce exchange → JWT | P0 | Deep link opens app → "Waiting for Telegram" → success → main screen |
| REQ-AUTH-04 | **Session Restore** — on launch, read JWT from secure storage, validate via `/api/mobile/subscription` | P0 | Valid JWT → skip auth; expired → refresh token; invalid → auth screen |
| REQ-AUTH-05 | **Logout** — clear secure storage, disconnect VPN if connected, show auth screen | P0 | Logout → VPN off → auth screen |

### REQ-POOL: Server Pools & Selection

| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| REQ-POOL-01 | **Two Tabs** — "Простой VPN" (Simple) / "Обход белых списков" (Whitelist) | P0 | Tab bar visible, switchable, state persisted |
| REQ-POOL-02 | **Server List from Backend** — GET `/api/mobile/servers` returns `{simple: [], whitelist: []}` with `id, city, cc, flag, proto, load, sni?` | P0 | Lists populate on tab select; pull-to-refresh |
| REQ-POOL-03 | **Protocol Badge** — show WG/SS/VLESS/HY2/TR badge per server | P1 | Badge matches `proto` field |
| REQ-POOL-04 | **Load Indicator** — visual bar (0-100%) from `load` field | P1 | Bar width = load%, color: green/yellow/red |
| REQ-POOL-05 | **SNI Display** (Whitelist only) — show "SNI: domain" | P1 | Visible for whitelist servers with `sni` |

### REQ-PING: Auto-Ping & Server Selection

| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| REQ-PING-01 | **HTTP Urltest via libbox** — ping each server via HTTP (not ICMP), measure RTT | P0 | `libbox.urltest(url)` returns RTT ms + online bool |
| REQ-PING-02 | **Quick Path (Last-Good)** — on connect, ping ≤3 last-good servers first (800ms timeout each) | P0 | If any online → select fastest; else → full ping |
| REQ-PING-03 | **Full Ping** — parallel ping all servers in current tab (2000ms timeout) | P0 | All servers show RTT or "офлайн" |
| REQ-PING-04 | **Cache TTL 60s** — store results in Drift, invalidate after 60s | P0 | Re-ping only after 60s or manual refresh |
| REQ-PING-05 | **Network Change Invalidation** — `connectivity_plus` stream → clear ping cache immediately | P0 | WiFi↔LTE switch → next connect does fresh ping |
| REQ-PING-06 | **Best Server Selection** — sort by RTT asc, then load asc; auto-select if "Автовыбор" | P0 | Auto card shows best; manual select persists |
| REQ-PING-07 | **Last-Good Chip** — "последний" tag on most recent successful server | P1 | Tag appears on server card |
| REQ-PING-08 | **Manual Refresh** — refresh button triggers full ping, shows spinner | P1 | Button spins during ping; toast "Пинг обновлён" |

### REQ-CONN: Connection FSM & VPN Tunnel

| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| REQ-CONN-01 | **FSM States** — `idle` → `pinging` → `connecting` → `connected` → `disconnecting` → `idle` | P0 | State transitions visible in UI; cancel during `connecting` |
| REQ-CONN-02 | **Cancel Connecting** — tap button during `connecting` → `disconnecting` → `idle`, toast "Подключение отменено" | P0 | Immediate cancel, no orphan tunnel |
| REQ-CONN-03 | **libbox Config Generation** — build sing-box config from subscription link + selected server | P0 | Config valid, tunnel establishes |
| REQ-CONN-04 | **Android: VpnService + Foreground Service** — persistent notification "VPN активен · 3set" with disconnect action | P0 | Notification shows; swipe not dismissible; tap disconnect → FSM |
| REQ-CONN-05 | **iOS: NetworkExtension Packet Tunnel** — NEPacketTunnelProvider, NEOnDemandRule for kill switch | P0 | Tunnel starts; kill switch blocks non-VPN traffic |
| REQ-CONN-06 | **Kill Switch** — Android: `VpnService` blocks non-VPN; iOS: `NEOnDemandRuleConnect` | P0 | Disconnect → no traffic leaks; toast "Kill switch: трафик вне VPN заблокирован" |
| REQ-CONN-07 | **Connected Panel** — show server flag+city, protocol, IP, ping, session timer, ↓/↑ MB (live) | P0 | Updates every 1s; IP from libbox; traffic from libbox counters |
| REQ-CONN-08 | **Auto-Reconnect on Network Change** — if `connected` + network change → full reconnect FSM | P0 | Seamless reconnect; toast "Сеть изменена — переподключение" |
| REQ-CONN-09 | **Core Restart Backoff** — on libbox crash, restart ×3 with exponential backoff (1s, 2s, 4s) | P1 | Max 3 retries; then error toast "VPN остановлен, попробуйте снова" |
| REQ-CONN-10 | **Error Handling** — map libbox errors to user toasts (auth failed, server unreachable, config invalid) | P1 | No raw errors; actionable messages |

### REQ-SUB: Subscription & Key Gating

| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| REQ-SUB-01 | **Subscription Status** — GET `/api/mobile/subscription` → `{expiresAt, deviceLimit, link, devices[]}` | P0 | Displayed in shop & profile |
| REQ-SUB-02 | **Key Gates Configs** — no active subscription → connect blocked, shop screen shown | P0 | Tap connect without key → toast "Нужен активный ключ" → shop |
| REQ-SUB-03 | **Expiry Display** — "ключ · N дн." in header; shop shows SVG ring (days/30) | P0 | Ring animates; color: green/yellow/red by days left |
| REQ-SUB-04 | **Device Limit Enforcement** — max devices from subscription; block add if at limit | P0 | Toast "Лимит устройств достигнут" at limit |
| REQ-SUB-05 | **Subscription Link** — copy button in shop & profile; toast "Ссылка скопирована" | P0 | Clipboard write works |
| REQ-SUB-06 | **Grace Period** — expired key works 24h (backend config) with "expires soon" banner | P1 | Banner shows when <24h left |

### REQ-SHOP: Purchase & Renewal

| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| REQ-SHOP-01 | **5 Terms** — 7д (115₽), 1м (400₽), 3м (1000₽), 6м (1900₽), 12м (3800₽) | P0 | Prices match exactly; "Хит" badge on 1м |
| REQ-SHOP-02 | **Device Selector** — 2 to 10 devices, stepper + dots visual | P0 | Min 2, max 10; price = base × devices/2 |
| REQ-SHOP-03 | **Promo Codes** — `LIME15` (−15%), `3SET5` (−5%), invalid → shake + error | P0 | Applied discount shown in summary; persists until changed |
| REQ-SHOP-04 | **Payment Methods** — МИР, VISA, MC, SBP, CRYPTO (chips) | P0 | Selection persists |
| REQ-SHOP-05 | **Price Summary** — base, devices, discount, total, per-day-per-device | P0 | All values correct, updates live |
| REQ-SHOP-06 | **Platega Payment Flow** — POST `/api/mobile/payments/create` → webview URL → poll `/api/mobile/payments/status/{id}` (3s interval, 5min max) | P0 | Webview opens; polling shows "Ожидаем оплату…"; success → confetti |
| REQ-SHOP-07 | **Confetti on Success** — animation + toast "Подписка продлена до {date}" | P1 | Confetti plays; overlay shows key details |
| REQ-SHOP-08 | **Trial Block** — trial keys cannot renew/upgrade (backend enforces, UI hides) | P0 | Trial users see "Триал не продлевается" |

### REQ-DEV: Device Management

| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| REQ-DEV-01 | **Device List** — in profile sheet: name, last seen, remove button | P0 | Shows all registered devices |
| REQ-DEV-02 | **Remove Device** — DELETE `/api/mobile/devices/{id}` → toast with "Вернуть" undo (5s) | P0 | Undo restores device |
| REQ-DEV-03 | **Add Current Device** — button "Добавить это устройство" → POST → toast "Устройство добавлено" | P0 | Count increments; appears in list |
| REQ-DEV-04 | **Limit Enforcement** — cannot add if at deviceLimit | P0 | Toast "Лимит устройств достигнут" |

### REQ-SETTINGS: Settings & Profile

| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| REQ-SET-01 | **Kill Switch Status (read-only)** — profile row: "Kill switch: включён" + explanation; always-on per Phase 20 D-09 / REQ-CONN-06, no toggle and no native change | P0 | Status is displayed and non-interactive; traffic stays blocked outside VPN |
| REQ-SET-02 | **Auto-Connect Toggle** — on app launch, if connected before → auto connect | P1 | Toggle persists |
| REQ-SET-03 | **Referral Link** — copy `https://dash.3set.online/?ref=3SET-{code}` | P1 | Copy toast |
| REQ-SET-04 | **Reset Demo** — clear localStorage (prototype) / secure storage (prod) → reload | P1 | Fresh state |
| REQ-SET-05 | **Network Chip** — WiFi/LTE toggle in toolbar, invalidates ping cache | P0 | Tap → toggles → toast "Сеть изменена — кеш пинга сброшен" |

### REQ-NOTIF: Push Notifications

| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| REQ-NOTIF-01 | **Expiry Reminders** — local notifications at T-7d, T-3d, T-1d before expiry | P1 | Shows if app not open; deep-links to shop |
| REQ-NOTIF-02 | **FCM Token Registration** — register token with backend on login | P1 | Backend can send remote push |

### REQ-BACKEND: Backend API Additions

| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| REQ-BE-01 | **Mobile Auth Routes** — `POST /api/mobile/auth/login`, `POST /api/mobile/auth/register`, `POST /api/mobile/auth/telegram` | P0 | Return JWT + refresh; validate Telegram nonce |
| REQ-BE-02 | **Mobile Servers Route** — `GET /api/mobile/servers` → transformed ARTEMIDA pricing | P0 | Two pools, load, proto, sni |
| REQ-BE-03 | **Mobile Subscription Route** — `GET /api/mobile/subscription` → key status, expiry, deviceLimit, link, devices | P0 | Aggregates ARTEMIDA `/keys` + `/wallet` |
| REQ-BE-04 | **Mobile Payments Routes** — `POST /api/mobile/payments/create`, `GET /api/mobile/payments/status/{id}` | P0 | Platega integration, idempotency key |
| REQ-BE-05 | **Mobile Keys Routes** — `POST /api/mobile/keys/issue`, `POST /api/mobile/keys/renew` | P0 | Call ARTEMIDA, return subscription link |
| REQ-BE-06 | **Mobile Devices Routes** — `GET /api/mobile/devices`, `DELETE /api/mobile/devices/{id}` | P0 | CRUD via ARTEMIDA |
| REQ-BE-07 | **Platega Webhook** — handle `CONFIRMED`/`CANCELED`/`CHARGEBACKED`, idempotent on `transaction_id` | P0 | Issues/renews key, updates subscription |
| REQ-BE-08 | **Shared Zod Schemas** — generate OpenAPI → Dart types for type-safe client | P1 | `openapi-generator` in CI |

---

## Non-Functional Requirements

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-01 | **App Launch (cold)** | <2s to interactive |
| NFR-02 | **Connect Time (cached ping)** | <3s idle→connected |
| NFR-03 | **Connect Time (fresh ping)** | <5s idle→connected |
| NFR-04 | **Battery Impact (connected, idle)** | <2%/hour |
| NFR-05 | **APK Size (arm64)** | <50MB |
| NFR-06 | **IPA Size** | <100MB |
| NFR-07 | **Crash-Free Sessions** | >99.5% |
| NFR-08 | **Privacy** | Zero traffic logging, no analytics without consent |

---

## Dependencies & Blockers

| Blocker | Description | Resolution |
|---------|-------------|------------|
| **Apple NetworkExtension Entitlement** | Required for iOS VPN | Apply immediately via Developer Portal |
| **GPL-3.0 Legal Review** | Dynamic linking compliance | Legal review before Phase 23 |
| **Platega Test Credentials** | Needed for payment flow testing | Request from Platega |
| **Flutter libbox Build** | Compile sing-box for Android/iOS | Prebuilt binaries or CI build step |

---

## Traceability: Seed → Requirements

| Seed Section | Requirements |
|--------------|--------------|
| 1. Архитектура (4 слоя) | REQ-CONN, REQ-BE |
| 2. Экраны и навигация | REQ-AUTH, REQ-POOL, REQ-SHOP, REQ-SETTINGS |
| 3. Авторизация | REQ-AUTH-01..05 |
| 4. Пулы серверов | REQ-POOL-01..05 |
| 5. Автопинг и urltest | REQ-PING-01..08 |
| 6. Машина состояний подключения | REQ-CONN-01..10 |
| 7. Покупка и продление | REQ-SHOP-01..08, REQ-SUB-01..06 |
| 8. API-контракт бэкенда | REQ-BE-01..08 |
| 9. Ошибки и крайние случаи | REQ-CONN-10, REQ-PING-05, NFR |
| 10. Лицензии и сборка | Blockers section |

---

## Next Step
Run `/gsd-roadmapper` or `/gsd-plan-phase 18` to create phased ROADMAP.md with task breakdown.
