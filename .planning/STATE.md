---
gsd_state_version: 1.0
milestone: v2.0
milestone_name: Мобильный клиент
current_phase: 20
current_phase_name: VPN Core & Connect FSM
status: executing
stopped_at: Completed 20-02-PLAN.md
last_updated: "2026-11-27T09:09:11.151Z"
last_activity: 2026-11-27
last_activity_desc: Phase 20 execution started
state_head: 7b101dff65abcdcc35ca999adf0e7964b2c0bd95
progress:
  total_phases: 6
  completed_phases: 0
  total_plans: 22
  completed_plans: 17
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-11-25)

**Core value:** Пользователь за пару кликов покупает или продлевает VPN-подписку через бота или кабинет и сразу получает рабочую ссылку подписки.
**Current focus:** Phase 20 — VPN Core & Connect FSM

## Current Position

Phase: 20 (VPN Core & Connect FSM) — EXECUTING
Plan: 3 of 7
Status: Ready to execute
**Progress:** [░░░░░░░░░░] 0%
Last activity: 2026-11-27 — Phase 20 execution started

## Per-Milestone Progress

| Milestone | Phases | Completed | Status |
|-----------|--------|-----------|--------|
| v1.0 MVP | 6 | 6 | Shipped |
| v1.1 Расширенная аналитика | 5 | 5 | Shipped |
| v1.2 Стабилизация и качество | 5 | 5 | Completed |
| **v2.0 Мобильный клиент** | **6** | **0** | **Executing** |

## Active Workstreams

None (flat mode)

## Blockers

- Apple NetworkExtension entitlement (apply ASAP)
- Platega test credentials (requested)
- GPL-3.0 legal review (schedule)
- **Phase 18 P0 — Telegram deep-link login cannot complete:** the bot `/start` handler parses only `login_` and `link_` payloads, never `nonce_`, so `telegram/poll` stays `202 pending` until TTL expiry. Needs a handshake decision (nonce-only bind vs code-confirmed) before Phase 18 can close.
- Phase 18 UAT: signed App Links/Universal Links (assetlinks fingerprint + AASA Team ID), biometric hardware
- Mobile app hardcodes the production base URL (`dio_client.dart:23`, `auth_interceptor.dart:99`) — no non-prod target, so login/restart UAT cannot be exercised without creating production accounts

## Next Actions

1. Decide the mobile Telegram handshake (nonce-only bind vs code-confirmed) and implement the bot-side `nonce_` branch — this is the only thing blocking Phase 18 close
2. Add a `--dart-define=API_BASE_URL` override so UAT 2/3 can run against a local backend
3. Re-run UAT tests 2, 3 and 4, then close Phase 18
4. Begin Phase 19 — Server Pools & Auto-Ping

## Decisions

- [Phase 18]: Flutter project scaffold created with Riverpod 3.4+, flutter_secure_storage 11.2+, dio 5.9+, app_links 6.4+, freezed + json_serializable, go_router 15+, Material 3 theme
- [Phase 18]: All 20 JwtUtils unit tests pass; flutter analyze clean (0 errors); flutter build ios --debug --no-codesign succeeds; build_runner generates freezed/json_serializable code without conflicts
- [Phase 18]: Used flutter_secure_storage v11 API with storageNamespace instead of deprecated encryptedSharedPreferences/keyAlias
- [Phase 18]: AuthInterceptor uses single-flight refresh pattern with Completer-based request queue
- [Phase 18]: Biometric reads for access token only; refresh token reads without biometric for background refresh
- [Phase 18]: TokenPair.fromJson used directly in refresh flow; userId extracted from TokenPair
- [Phase 18-01c]: AuthNotifier uses AsyncNotifierProvider for async session restore on app launch; session restore validates tokens via /api/mobile/subscription, attempts refresh on 401; login/register save tokens then re-trigger restore; logout clears storage
- [Phase 18-01d]: BiometricGate (WidgetsBindingObserver) triggers on app resume when tokens exist; ConnectivityService emits distinct connectivity stream; DeepLinkHandler parses Telegram deep links (t.me/set3vpn_bot, three-set-vpn://) and polls /api/mobile/auth/telegram/poll; unit tests cover all three providers
- [Phase 18-02]: All 6 mobile auth API routes implemented (login, register, refresh, telegram nonce, telegram poll, subscription); JWT access 15m / refresh 30d with rotation; Telegram nonce/poll flow with 10min TTL; credentialsChangedAt watermark for token revocation; assetlinks.json & apple-app-site-association served from /.well-known/; Prisma schema includes TelegramLinkToken; curl test suite validates all endpoints
- [Phase 18-01e]: Android App Links with autoVerify for dash.3set.online/3set.online; iOS Universal Links with associated domains; Android VPN/foreground permissions declared; integration test covers cold start deep link → polling → authenticated → biometric resume → logout vertical slice; DeepLinkHandler.extractNonce unit tests for Telegram and custom scheme formats; flutter analyze clean (0 errors); iOS build succeeds
- [Phase 18-03]: Flutter auth UI layer complete with LoginScreen, RegisterScreen, TelegramWaitScreen; AuthForm widget with validation; ErrorToast service; Riverpod providers for auth, home, subscription; GoRouter with auth-based redirects; home screen with bottom navigation and logout; widget tests for auth screens; flutter analyze clean (0 errors); all 83 unit tests pass; iOS build succeeds
- [Phase 18 verification]: 36/36 must-haves implemented; 103 tests pass; 0 analyzer errors; iOS build OK; on-device smoke 2/2. Status `human_needed` until UAT.
- [Phase 18 verification]: Fixed Telegram auth end to end — poll 200 body is `{tokenPair}`, token pair is persisted before `restoreSession()`, bot opens via `url_launcher`; DeepLinkHandler + biometric resume gate instantiated at app root; GoRouter refreshes redirects on auth changes.
- [Phase 18 verification]: Biometric lock is a resume gate (`local_auth`) rather than a storage ACL read, so Face ID is not requested on every HTTP request; the interceptor reads tokens non-biometrically.
- [Phase 18 verification]: Session restore persists `userId` from the validated subscription user (backend token pair carries no `userId`), keeping the fast path alive.
- [Phase 19-server-pools-auto-ping-7-days]: D-01 gate confirmed locked: /api/mobile/servers source = getSubscriptionForUserId -> artemida.getSubscriptionLinks (NOT /pricing, NOT getKeyWithLinks); no load; no_active_key 403
- [Phase 19-server-pools-auto-ping-7-days]: 19-01: active-key gate adds explicit raw-status exclusion (expired/revoked/disabled/trial-expired) alongside deriveStatusKind; secrets confined to machine-only outbound
- [Phase 19]: 19-02: D-08 confirmed own-shim — own C-shared Go shim + ffigen on sing-box v1.14.4; NOT gomobile-via-ffigen, NOT sing-ffi, NOT community pkg, NOT URLTest C symbol
- [Phase 19]: 19-02: URLTest(outboundTag) returns error only; RTT async via WriteGroups URLTestDelay/URLTestTime (CommandGroup=2), 0,0 => offline; no-TUN config + CheckConfig + WG endpoint + NEW DNS; no secrets logged
- [Phase 19-server-pools-auto-ping-7-days]: 19-03: D-06 gate confirmed locked — ping primary = libbox.urltest HTTP-through-outbound via real URLTest(srv-<id>) + async WriteGroups URLTestDelay, NOT ICMP/NOT libbox_urltest/NOT sync RTT
- [Phase 19-server-pools-auto-ping-7-days]: 19-03: silent approx TCP fallback owned by PingRepository; LibboxPingService null on unavailable/0,0; no UI indication, no secrets logged
- [Phase 19-server-pools-auto-ping-7-days]: 19-03: 0,0 => offline fallback; online 0ms sample kept; no load field; rankBest is separate stable RTT-only ranking (REQ-PING-06 deferred)
- [Phase 19]: 19-04: Drift ping_cache PK(server_id,tab) with inclusive 60s TTL; re-ping only after expiry, manual refresh or network change
- [Phase 19]: 19-04: network-change clearPingCacheAndLastGood clears ping_cache + last_good but keeps per-tab selection and current_tab (D-11)
- [Phase 19]: 19-04: last_good PK(tab,server_id) dedupe most-recent-first capped at 5; current_tab singleton defaults to simple
- [Phase 19]: 19-04: PingCacheLookup.fresh made async so a Drift DAO can implement the cache seam; 19-03 fake cache and tests updated
- [Phase 19]: 19-05: D-16 gate confirmed locked - AppTheme.dark app-wide with ThemeMode.dark, M3 kept, AppTheme.light unused; no light toggle, no load, min password 8
- [Phase 19]: 19-05: bundled official OFL variable TTFs (Manrope/Unbounded/JetBrains Mono) instead of google_fonts - offline-safe, no new dependency
- [Phase 19]: 19-05: pingOffline=dim distinct from pingBad=red; pingColor thresholds 60/110/180, no load colors and no simulation
- [Phase 19]: 19-06: connect(mode) is server selection only (D-18) - quick 800ms last-good then 2000ms full ping, no tunnel/core.start/FSM
- [Phase 19]: 19-06: REQ-POOL-04 load bar remains deferred (D-04); best-server ranking is RTT-only with stable input order
- [Phase 19]: 19-06: currentTabProvider now persists PoolTab; bottomNavIndexProvider keeps phase-18 router compiling until 19-07
- [Phase 19]: 19-07: full prototype ServerPoolScreen composed from 7 widgets; no bottom nav in the screen (router swap is 19-08), no load bar and no simulation
- [Phase 19]: 19-07: single scrollable main column with pinned connect panel; fixes nested-flex overlap that collapsed the pool list and made tabs untappable
- [Phase 19]: 19-07: offline/retry banner outranks the no-key banner; refresh outcomes (no serverId) never announce a phantom server selection
- [Phase 19]: 19-07: segmented tabs use Semantics(selected/button/label) for aria-selected; IP/timer/traffic are dashes with a phase-20 note (no fake data)
- [Phase 19-server-pools-auto-ping-7-days]: D-15 gate confirmed locked: full prototype layout — remove bottom NavigationBar, home / renders ServerPoolScreen, add /shop stub, preserve auth routes/redirect/refreshListenable and deep-link/biometric listeners — User explicitly selected locked at the 19-08 decision checkpoint; matches the locked prototype layout decisions D-15/D-19 in 19-CONTEXT.md
- [Phase 20-01]: D-01 backend-full-config confirmed at blocking gate: GET /api/mobile/config builds the complete TUN config from serverId; client sends only serverId and never assembles config — User selected the locked option explicitly; secrets stay server-side and one contract serves the FSM, native tunnel and reconnect
- [Phase 20-01]: D-08 WireGuard stays a sing-box 1.14 endpoint, never an outbound; chosen outbound copied verbatim into endpoints (WG) or outbounds (others) — Must-have and CheckConfig smoke shape require WG as endpoint; all other protocols stay outbounds
- [Phase 20-01]: Per-request JWT + active-key gate on /config; unknown or malformed serverId returns 200 {ok:false,error:server_not_found}; provider errors degrade to 200 stable codes + Retry-After — D-03 requires expiry to drop the tunnel on reconnect; uniform domain-error envelope avoids 5xx and client transport exceptions
- [Phase 20]: D-05 confirmed at blocking gate as own-c-shared: TUN fd enters libbox through our own C-shared Go shim, regenerated via build.sh header + ffigen; no gomobile/sing-ffi/community package/libbox_urltest — Locked costly decision; smoke-proven ABI and one shim two modes
- [Phase 20]: 20-02: one shim, two config modes - no-TUN generate_204 ping path stays functional alongside the TUN path — D-08 additive TUN extension, no regression to phase-19 ping
- [Phase 20]: 20-02: fd stays platform-owned and libbox dups it internally; no reset export before CI evidence; no dummy-fd test — Non-TUN fd aborts with SIGABRT, cannot be caught in Dart
- [Phase 20]: 20-02: traffic {down,up,available} from libbox StatusMessage via WriteStatus + CommandStatus; no fabricated bytes — REQ-CONN-07 live counters, distinct from ping RTT fields
- [Phase 20]: 20-02: stop any existing no-TUN service before libbox_start_with_tun so the fd-carrying platform is used — Reload into the inert ping platform cannot supply a TUN fd (Rule 2)

## Performance Metrics

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 18 P01a | 7200 | 1 tasks | 15 files |
| Phase 18 P01b | 25 | 1 tasks | 6 files |
| Phase 18 P01c | 150 | 1 tasks | 3 files |
| Phase 18 P01d | 300 | 1 tasks | 3 files |
| Phase 18 P02 | 400 | 3 tasks | 12 files |
| Phase 18 P01e | 7200 | 1 tasks | 1 files |
| Phase 18 P03 | 7200 | 1 tasks | 13 files |
| Phase 19-server-pools-auto-ping-7-days P01 | 6min | 3 tasks | 6 files |
| Phase 19-server-pools-auto-ping-7-days P02 | 11min | 1 tasks | 11 files |
| Phase 19-server-pools-auto-ping-7-days P03 | 9 min | 3 tasks | 10 files |
| Phase 19 P04 | 10 min | 3 tasks | 10 files |
| Phase 19-server-pools-auto-ping-7-days P05 | 8 min | 3 tasks | 17 files |
| Phase 19-server-pools-auto-ping-7-days P06 | 11 min | 3 tasks | 8 files |
| Phase 19 P07 | 28 min | 3 tasks | 9 files |
| Phase 19-server-pools-auto-ping-7-days P08 | 8 min | 3 tasks | 5 files |
| Phase 20 P01 | 4 min | 3 tasks | 5 files |
| Phase 20 P02 | 10 min | 3 tasks | 7 files |

## Session

**Last session:** 2026-11-27T09:08:59.771Z
**Stopped at:** Completed 20-02-PLAN.md
**Resume file:** None
