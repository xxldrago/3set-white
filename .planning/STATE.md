---
gsd_state_version: 1.0
milestone: v2.0
milestone_name: Мобильный клиент
current_phase: 19
current_phase_name: Server Pools & Auto-Ping
status: executing
stopped_at: Completed 19-05-PLAN.md
last_updated: "2026-11-27T04:25:40.405Z"
last_activity: 2026-11-27
last_activity_desc: Phase 19 execution started
state_head: f0ad7497af1a41fef2d32a54345c73a0aaa32d71
progress:
  total_phases: 6
  completed_phases: 0
  total_plans: 15
  completed_plans: 12
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-11-25)

**Core value:** Пользователь за пару кликов покупает или продлевает VPN-подписку через бота или кабинет и сразу получает рабочую ссылку подписки.
**Current focus:** Phase 19 — Server Pools & Auto-Ping

## Current Position

Phase: 19 (Server Pools & Auto-Ping) — EXECUTING
Plan: 6 of 8
Status: Ready to execute
**Progress:** [░░░░░░░░░░] 0%
Last activity: 2026-11-27 — Phase 19 execution started

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

## Session

**Last session:** 2026-11-27T04:25:40.365Z
**Stopped at:** Completed 19-05-PLAN.md
**Resume file:** None
