# Roadmap: 3set-white — v2.0 Мобильный клиент

## Milestones

| Version | Name | Status | Phases |
|---------|------|--------|--------|
| v1.0 | MVP (Bot + Cabinet + Payments) | Shipped | 1-6 |
| v1.1 | Расширенная аналитика | Shipped | 7-11 |
| v1.2 | Стабилизация и качество | Completed | 12-17 |
| **v2.0** | **Мобильный клиент** | **Executing** | **18-23** |

---

## Phase Overview (v2.0)

| Phase | Title | Focus | Est. Days | Depends On |
|-------|-------|-------|-----------|------------|
| **18** | **Foundation & Auth** | Flutter project, Riverpod, secure_storage, email/Telegram auth, JWT, biometric | 5 | — |
| **19** | **Server Pools & Auto-Ping** | `/api/mobile/servers`, pool UI, libbox urltest, Drift cache, quick-path, connectivity | 7 | 18 |
| **20** | **VPN Core & Connect FSM** | libbox FFI, VpnService/NE, connection FSM, kill switch, foreground service | 10 | 19 |
| **21** | **Subscription & Purchase** | `/api/mobile/subscription`, `/payments/*`, Platega webview, polling, key issuance, confetti | 7 | 18, 20 |
| **22** | **Devices, Settings & Polish** | Device management, referral, push notifications (expiry), UI polish, settings | 5 | 21 |
| **23** | **Hardening & Release** | Error handling (ARTEMIDA codes), captive portal, IPv6 leak test, CI/CD, Play/TestFlight | 7 | 22 |

**Total: ~41 days (6 weeks)**

---

## Phase Details

### Phase 18: Foundation & Auth (5 days)

**Goal**: Working Flutter app with auth (email + Telegram) and secure session persistence.

#### Plans

| Plan | Title | Wave | Depends On | Status | Description |
|------|-------|------|------------|--------|-------------|
| 18-01a | Flutter Project Scaffold | 1 | — | ✅ Complete | `flutter create`, Riverpod, `flutter_secure_storage`, `dio`, `app_links`, `connectivity_plus`, `logger`, `freezed`, `jwt_decoder`, `go_router`, Material 3 theme. All 20 JwtUtils tests pass. |
| 18-01b | Secure Storage + HTTP Client | 1 | 18-01a | ✅ Complete | TokenStore with biometric/non-biometric reads, DioClient with AuthInterceptor (single-flight refresh). 6 storage/api tests pass. |
| 18-01c | AuthNotifier State Machine | 1 | 18-01b | ✅ Complete | AuthState (freezed), AuthNotifier with session restore (validates via /subscription, refresh on 401), login, register, logout, startTelegramAuth. 10 unit tests pass. |
| 18-01d | DeepLinkHandler + AppRouter | 1 | 18-01c | ✅ Complete | Telegram deep link polling, GoRouter redirect on auth state, ConnectivityService. |
| 18-01e | Native Deep Links + Integration Test | 2 | 18-01d, 18-02 | ✅ Complete | Android App Links (autoVerify), iOS Universal Links (associated domains), VPN/foreground permissions, deep_link_tracer_test.dart vertical slice test. |
| 18-02 | Backend Mobile Auth Routes | 1 | — | ✅ Complete | `POST /api/mobile/auth/login`, `register`, `refresh`, `telegram/nonce`, `telegram/poll`, `GET /api/mobile/subscription`. `lib/mobile-auth.ts` shared logic. `TelegramLinkToken` Prisma model. `assetlinks.json` + `apple-app-site-association`. 33 integration tests pass. |
| 18-03 | Auth Screens + Telegram Flow + Providers | 2 | 18-01e, 18-02 | ✅ Complete | Login/Register/TelegramWait screens. AuthForm + ErrorToast widgets. Router redirect on auth state. Logout. Session restore routing. `currentTabProvider`, `subscriptionProvider`. Widget + integration tests. |

#### Deliverables

- Flutter app runs on Android/iOS simulators
- Email/password + Telegram auth working
- JWT persisted securely, biometric unlock
- Backend auth routes deployed

---

### Phase 19: Server Pools & Auto-Ping (7 days)

**Goal**: Two server tabs with live ping, quick-path selection, network-aware cache invalidation.

#### Tasks

| Task | Description | Acceptance |
|------|-------------|------------|
| 19.1 | **Backend: `/api/mobile/servers`** — source subscription-links (NOT ARTEMIDA `/pricing`; CONTEXT D-01 supersedes); two pools `simple`/`whitelist`; `id,name,city,cc,flag,proto,sni?,tab,host,port,protocol,outbound`; NO `load`; `no_active_key` 403; `getSubscriptionForUserId` | JSON matches spec |
| 19.2 | **Server List UI** — two tabs (Simple/Whitelist), protocol badges, SNI display; **load bar DEFERRED** (REQ-POOL-04, CONTEXT D-04; no `load`; no simulation) | Matches prototype |
| 19.3 | **libbox FFI Setup** — compile sing-box for Android (arm64-v8a, armeabi-v7a) + iOS (arm64), `ffigen` bindings | `libbox.urltest()` callable |
| 19.4 | **Urltest Implementation** — `libbox.urltest` HTTP through real outbound `generate_204`; real `URLTest(outboundTag)` + async `WriteGroups.URLTestDelay`; NOT ICMP; NOT `libbox_urltest`; silent `Socket.connect` `approx` fallback; return `{online,rtt}`; NOT `libbox.urltest(url)` sync RTT | 2000ms timeout; quick-path 800ms |
| 19.5 | **Ping Cache (Drift)** — table `ping_cache(server_id, tab, rtt, online, ts)`, TTL 60s | Query returns fresh/stale |
| 19.6 | **Quick Path (Last-Good)** — on connect, ping ≤3 last-good first (800ms timeout) | Falls back to full ping |
| 19.7 | **Full Ping** — parallel ping all in tab (2s timeout), update UI with RTT/offline | All cards show ping |
| 19.8 | **Best Server Selection** — sort by RTT asc, then `load` asc (RTT-only now; `load` deferred D-04); auto card shows best; connect = selection only (D-18) | Auto selects fastest |
| 19.9 | **Connectivity Invalidation** — `connectivity_plus` stream → clear Drift cache on network change | WiFi↔LTE → fresh ping |
| 19.10 | **Manual Refresh** — refresh button → full ping → toast | Spinner + toast |
| 19.11 | **Riverpod: `serverPoolProvider`, `pingCacheProvider`, `bestServerProvider`** | Reactive UI updates |

#### Deliverables

- Two tabs with live server data (no `load`; REQ-POOL-04 deferred; no simulation; `no_active_key`; `/api/mobile/servers` subscription-links not `/pricing`)
- Ping works (quick-path + full; `libbox.urltest` `URLTest`+`WriteGroups`; silent TCP `approx`; NOT `libbox_urltest`), cache TTL 60s respected; connect=selection only (phase 20 tunnel)
- Network change invalidates cache (clear ping_cache+last_good; keep selection+current_tab)
- libbox FFI integrated (own C-shared sing-box v1.14.4 shim + `ffigen`; Android blocked here; silent fallback; GPL recorded)

**Plans:** 8 plans

Plans:
**Wave 1**

- [x] 19-01-PLAN.md — Backend `/api/mobile/servers` + `lib/server-pool.ts` parser + `lib/servers-source.ts`; JWT + active key + `no_active_key` 403 + D-22; no `/pricing`, no `load`, no secrets

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 19-02-PLAN.md — libbox FFI: own C-shared sing-box v1.14.4 shim + `ffigen`; `URLTest(tag)` + async `WriteGroups.URLTestDelay`; `generate_204`; NOT `libbox_urltest`; NOT gomobile/sing-ffi/community pkg; no TUN; D-08 `own-shim` confirmed

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 19-03-PLAN.md — Ping service + repository: `PingResult`/`pingClass`, `LibboxPingService`, silent `Socket.connect` `approx` fallback, `PingRepository`/`PingTarget`/`PingCacheWriter`; quick-path ≤3/800ms → full 2000ms; D-06 `locked` confirmed

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 19-04-PLAN.md — Drift `ping_cache(server_id,tab,rtt,online,ts)` TTL60 + `last_good`<=5 + `selection` + `current_tab` + `server_list_cache`; network clear; no Prisma change

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 19-05-PLAN.md — Dark prototype theme app-wide (`AppTheme.dark` verbatim; `ThemeMode.dark`; M3; fonts); re-theme auth; no `load`; min-8; D-16 `locked` confirmed

**Wave 6** *(blocked on Wave 5 completion)*

- [x] 19-06-PLAN.md — `Server` + `serverPoolProvider`/`pingCacheProvider`/`bestServerProvider`/`currentTabProvider`; `connect(mode)` selection-only; invalidation; refresh; `load` deferred

**Wave 7** *(blocked on Wave 6 completion)*

- [x] 19-07-PLAN.md — `ServerPoolScreen` full prototype + 7 widgets; no bottom nav; `pingClass`; `последний`; SNI; proto; no `load`; no simulation; Russian

**Wave 8** *(blocked on Wave 7 completion)*

- [x] 19-08-PLAN.md — Router: `ServerPoolScreen`; remove `NavigationBar`; `/shop` stub; auth/redirect/deep-link/biometrics preserved; D-15 `locked` confirmed

**Cross-cutting constraints:**

- No simulation; no `Math.random`; no fake IP; no `sleep`; no `load`; no fake connection.
- No simulation; no `load`.

---

### Phase 20: VPN Core & Connect FSM (10 days)

**Goal**: Working VPN tunnel with proper FSM, kill switch, platform compliance.

#### Tasks

| Task | Description | Acceptance |
|------|-------------|------------|
| 20.1 | **libbox Config Generation** — parse subscription link → sing-box config JSON for selected server | Config valid per sing-box schema |
| 20.2 | **Connection FSM (Riverpod)** — `idle`→`pinging`→`connecting`→`connected`→`disconnecting`→`idle` + `error` | State transitions logged |
| 20.3 | **Cancel Connecting** — button during `connecting` → `disconnecting` → `idle` | Immediate cancel |
| 20.4 | **Android: VpnService** — `VpnService.prepare()`, `establish()`, foreground service with notification | Notification persistent |
| 20.5 | **Android: Foreground Service** — `flutter_background_service`, notification "VPN активен · 3set" with disconnect | Tap notification → disconnect |
| 20.6 | **iOS: NetworkExtension** — `NEPacketTunnelProvider`, `setTunnelNetworkSettings`, entitlements | Tunnel starts on iOS |
| 20.7 | **iOS: Kill Switch** — `NEOnDemandRuleConnect` for all interfaces | Non-VPN traffic blocked |
| 20.8 | **Android: Kill Switch** — `VpnService` routes all traffic, `allowBypass=false` | Traffic blocked on disconnect |
| 20.9 | **Connected Panel UI** — server info, IP, ping, timer, ↓/↑ MB (libbox counters, 1s update) | Live stats match prototype |
| 20.10 | **Auto-Reconnect** — network change during `connected` → full FSM reconnect | Seamless, toast shown |
| 20.11 | **Core Restart Backoff** — libbox crash → restart ×3 (1s, 2s, 4s) → error toast | Max 3 retries |
| 20.12 | **Error Mapping** — libbox errors → user toasts (auth, unreachable, config, permission) | No raw errors |
| 20.13 | **Permission Flows** — VPN permission request, handle deny/revoke gracefully | Toast + retry button |

#### Deliverables

- VPN connects on Android + iOS
- FSM handles all states + cancel
- Kill switch works both platforms
- Connected panel shows live stats
- Foreground service / NE compliant

**Plans:** 7 plans

Plans:
**Wave 1**

- [x] 20-01-PLAN.md — Backend `GET /api/mobile/config?serverId=...` + pure `buildMobileConfig` (D-01 gate): JWT + per-request active-key gate, full TUN config, no secrets; `COVERAGE.md` (REQ-CONN-03)
- [x] 20-02-PLAN.md — Own C-shared shim extension (D-05 gate): `libbox_start_with_tun(fd,config)` + `libbox_traffic()`, regenerated header/bindings, Dart facade; ping path intact (REQ-CONN-04/07)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 20-03-PLAN.md — Android Kotlin `VpnService` + foreground service (D-06 + D-09 gates): `specialUse` manifest, always-on kill switch, method-channel bridge, no orphan tunnel (REQ-CONN-04/06)
- [x] 20-04-PLAN.md — iOS `NEPacketTunnelProvider` compile-only (D-07 gate): extension plist, entitlement, embedded target, OnDemand kill switch; no tunnel build until entitlement (REQ-CONN-05/06)

**Wave 3** *(blocked on Waves 1–2)*

- [x] 20-05-PLAN.md — Connection FSM: freezed state + Riverpod notifier + `/config` repository + generation-token cancel + safe RU error toasts (REQ-CONN-01/02/03/10)

**Wave 4** *(blocked on Wave 3)*

- [x] 20-06-PLAN.md — Auto-reconnect (D-15 gate) + REQ-PING-05: VPN-only-change filter, invalidation, RTT reselection, one toast, 1/2/4s backoff (REQ-CONN-08/09, REQ-PING-05)
- [x] 20-07-PLAN.md — Connected Panel: live flag/proto/IP/ping/timer/↓↑MB from FSM + libbox counters at 1 Hz; «—» IP fallback; FSM-aware button (REQ-CONN-07)

**Cross-cutting constraints:**

- No simulation: no `Math.random`, fake IP, `sleep`, fake connection; no `load` bar; no bottom nav; no `/shop` purchase.
- No client→ARTEMIDA; no raw links/config/secrets/fd in logs or UI; no `/pricing`, `getKeyWithLinks` or `/servers.outbound` config source; no gomobile/community package, no `libbox_urltest`; no iOS tunnel build before entitlement; no kill switch bypass.
- No Prisma schema change this phase; `npx prisma validate` only. Android native build/UAT and iOS tunnel are CI/human-judgment gated (external blockers).

---

### Phase 21: Subscription & Purchase (7 days)

**Goal**: Full purchase flow — subscription status, shop, Platega payment, key issuance.

#### Tasks

| Task | Description | Acceptance |
|------|-------------|------------|
| 21.1 | **Backend: `/api/mobile/subscription`** — aggregates ARTEMIDA `/keys` + `/wallet` → status, expiry, deviceLimit, link, devices | JSON matches spec |
| 21.2 | **Backend: `/api/mobile/payments/create`** — Platega create, idempotency key, returns `payment_url` + `payment_id` | Platega test: 200 + URL |
| 21.3 | **Backend: `/api/mobile/payments/status/{id}`** — polling endpoint, checks Platega status | Returns `PENDING/CONFIRMED/CANCELED` |
| 21.4 | **Backend: Platega Webhook** — `CONFIRMED` → ARTEMIDA `keys.issue`/`keys.renew` → update subscription | Idempotent on `transaction_id` |
| 21.5 | **Backend: `/api/mobile/keys/issue`, `/keys/renew`** — call ARTEMIDA, return subscription link | Returns valid link |
| 21.6 | **Shop Screen UI** — 5 terms (115/400/1000/1900/3800), device stepper (2-10), promo, payment chips | Matches prototype exactly |
| 21.7 | **Price Calculation** — `base × devices/2 × (1-discount)`, per-day-per-device, live update | All values correct |
| 21.8 | **Promo Codes** — `LIME15` (−15%), `3SET5` (−5%), invalid shake+error | Applied to summary |
| 21.9 | **Payment WebView** — open `payment_url`, poll `/payments/status` (3s, 5min max), show "Ожидаем оплату…" | Success → confetti |
| 21.10 | **Confetti Animation** — on `CONFIRMED`, overlay with key details, "Подписка продлена до {date}" | Animation + toast |
| 21.11 | **Subscription Gating** — no key → connect blocked → shop redirect | Toast "Нужен активный ключ" |
| 21.12 | **Trial Block** — trial keys: hide renew/upgrade, show "Триал не продлевается" | Backend + UI aligned |
| 21.13 | **Subscription Ring (Shop)** — SVG ring `days/30`, color by threshold | Visual matches prototype |

#### Deliverables

- Shop screen fully functional
- Platega payment flow works (test mode)
- Key issued on payment success
- Subscription status everywhere
- Confetti celebration

---

### Phase 22: Devices, Settings & Polish (5 days)

**Goal**: Device management, settings, push notifications, UI polish.

#### Tasks

| Task | Description | Acceptance |
|------|-------------|------------|
| 22.1 | **Backend: `/api/mobile/devices`** — GET list, DELETE remove | CRUD works |
| 22.2 | **Profile Sheet** — avatar, name, email, method, subscription status, device count, link copy | Matches prototype |
| 22.3 | **Device List** — name, last seen, remove with undo toast (5s) | Undo restores |
| 22.4 | **Add Current Device** — button → POST → appears in list | Count increments |
| 22.5 | **Settings Toggles** — Kill Switch, Auto-Connect (persist in Drift) | Toggles work |
| 22.6 | **Referral Link** — copy `https://dash.3set.online/?ref=3SET-{code}` | Toast on copy |
| 22.7 | **Reset Demo** — clear secure storage + Drift → reload | Fresh state |
| 22.8 | **Network Chip** — WiFi/LTE toggle in toolbar, invalidates ping cache | Toast on toggle |
| 22.9 | **Push: Local Notifications** — `flutter_local_notifications` at T-7d, T-3d, T-1d before expiry | Shows if app closed |
| 22.10 | **Push: FCM Token** — register token with backend on login | Backend receives token |
| 22.11 | **UI Polish** — toasts with actions, confetti, loading states, empty states, haptics | Feels native |
| 22.12 | **Accessibility** — labels, contrast, dynamic type | Passes a11y audit |

#### Deliverables

- Profile sheet complete
- Device management with undo
- Settings persist
- Push notifications for expiry
- UI feels polished

---

### Phase 23: Hardening & Release (7 days)

**Goal**: Production-ready apps on Play Store (Internal) + TestFlight.

#### Tasks

| Task | Description | Acceptance |
|------|-------------|------------|
| 23.1 | **ARTEMIDA Error Handling** — map 401/402/409/429/502/503 + Retry-After to UI/retry | No unhandled errors |
| 23.2 | **Captive Portal Detection** — HTTP 302 to non-HTTPS → disconnect VPN + toast "Авторизуйтесь в Wi-Fi" | Works on captive WiFi |
| 23.3 | **IPv6/DNS Leak Test** — configure libbox DNS `1.1.1.1` IPv4 only, verify on `dnsleaktest.com` | No leaks |
| 23.4 | **Battery Optimization** — request unrestricted (Android), background modes (iOS) | <2%/hour idle |
| 23.5 | **Privacy Policy** — publish at `https://3set.online/privacy`, link in Play Console + app | Legal compliant |
| 23.6 | **GPL-3.0 Compliance** — source offer in app, dynamic linking verified, license file included | Legal sign-off |
| 23.7 | **CI/CD: Android** — GitHub Actions: `flutter build appbundle` → upload to Play Console (Internal) | AAB on Play Console |
| 23.8 | **CI/CD: iOS** — GitHub Actions (macOS): `flutter build ipa` → TestFlight via `fastlane` | Build on TestFlight |
| 23.9 | **Crash Reporting** — Sentry/Crashlytics initialized, custom events (connect_success, payment_complete) | Events in dashboard |
| 23.10 | **Internal Testing** — 5 testers on Android + iOS, feedback collection | No P0 bugs |
| 23.11 | **App Store Metadata** — screenshots, descriptions, privacy manifest (iOS), data safety (Android) | Ready for review |
| 23.12 | **Version Bump** — `pubspec.yaml` + `package.json` sync, tag `mobile/v2.0.0` | Tags pushed |

#### Deliverables

- AAB on Play Console Internal Testing
- IPA on TestFlight
- All P0/P1 bugs fixed
- Privacy/GPL compliant
- Crash reporting active

---

## Cross-Phase Dependencies

```
Phase 18 (Auth) ──┐
                  ├── Phase 19 (Pools/Ping) ── Phase 20 (VPN Core)
Phase 21 (Shop) ──┘           │                    │
                  │           │                    │
                  └───────────┴────────────────────┘
                              │
                        Phase 22 (Devices/Polish)
                              │
                        Phase 23 (Release)
```

- **Phase 18** is prerequisite for all (auth + session)
- **Phase 19** needs Phase 18 (authenticated API calls)
- **Phase 20** needs Phase 19 (server selection + ping)
- **Phase 21** can start after Phase 18 (auth) + Phase 20 (connected state for gating)
- **Phase 22** needs Phase 21 (subscription for device limit)
- **Phase 23** needs all prior phases complete

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Apple NetworkExtension rejection | High | Blocks iOS release | Early entitlement, test account, video demo |
| GPL-3.0 compliance issue | Medium | Legal/Store rejection | Legal review Phase 20, dynamic linking |
| libbox FFI build failures | Medium | Delays Phase 19-20 | Prebuilt binaries, CI matrix |
| Platega test credentials delayed | Medium | Blocks Phase 21 | Request early, mock in CI |
| Battery/performance issues | Medium | Poor reviews | Profile early, optimize Phase 23 |
| VPN permission UX friction | High | User drop-off | Clear rationale, in-app guide |

---

## Success Criteria (Milestone v2.0)

| Metric | Target |
|--------|--------|
| **Android**: Connect success rate | >95% |
| **iOS**: Connect success rate | >95% |
| **Crash-free sessions** | >99.5% |
| **App launch (cold)** | <2s |
| **Connect time (cached)** | <3s |
| **Battery drain (connected, idle)** | <2%/hour |
| **Play Store Internal** | 0 crashes, 5 testers |
| **TestFlight** | 0 crashes, 5 testers |
| **Privacy/GPL audit** | Pass |

---

## Next Actions

1. **Immediate**: Apply for Apple NetworkExtension entitlement
2. **Immediate**: Request Platega test credentials
3. **Immediate**: Legal review GPL-3.0 dynamic linking approach
4. **Phase 18 Kickoff**: `/gsd-plan-phase 18` — detailed task breakdown
