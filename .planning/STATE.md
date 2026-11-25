---
gsd_state_version: "1.0"
milestone: v2.0
milestone_name: Мобильный клиент
current_phase: 18
status: executing
stopped_at: Completed 18-01d-PLAN.md — BiometricGate, ConnectivityService, DeepLinkHandler with unit tests
last_updated: "2026-11-25T21:00:00.000Z"
last_activity: 2026-11-25
last_activity_desc: Completed Plan 18-01d — BiometricGate, ConnectivityService, DeepLinkHandler with unit tests
state_head: 1963ab75ab9e4e950c25be5610f321039ad62166
progress:
  total_phases: 6
  completed_phases: 0
  total_plans: 7
  completed_plans: 4
  percent: 57
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-11-25)

**Core value:** Пользователь за пару кликов покупает или продлевает VPN-подписку через бота или кабинет и сразу получает рабочую ссылку подписки.
**Current focus:** v2.0 Мобильный клиент (Phase 18 — Plan 18-01d complete)

## Current Position

Phase: 18
Plan: 18-01d (complete)
Status: Executing — BiometricGate, ConnectivityService, DeepLinkHandler with unit tests
Last activity: 2026-11-25 — Plan 18-01d complete

## Per-Milestone Progress

| Milestone | Phases | Completed | Status |
|-----------|--------|-----------|--------|
| v1.0 MVP | 6 | 6 | Shipped |
| v1.1 Расширенная аналитика | 5 | 5 | Shipped |
| v1.2 Стабилизация и качество | 5 | 5 | Completed |
| **v2.0 Мобильный клиент** | **6** | **0** | **Planning** |

## Active Workstreams

None (flat mode)

## Blockers

- Apple NetworkExtension entitlement (apply ASAP)
- Platega test credentials (requested)
- GPL-3.0 legal review (schedule)

## Next Actions

1. Begin Plan 18-01e — Native deep link configuration (Android App Links, iOS Universal Links) and integration test

## Decisions

- [Phase 18]: Flutter project scaffold created with Riverpod 3.4+, flutter_secure_storage 11.2+, dio 5.9+, app_links 6.4+, freezed + json_serializable, go_router 15+, Material 3 theme
- [Phase 18]: All 20 JwtUtils unit tests pass; flutter analyze clean (0 errors); flutter build ios --debug --no-codesign succeeds; build_runner generates freezed/json_serializable code without conflicts
- [Phase 18]: Used flutter_secure_storage v11 API with storageNamespace instead of deprecated encryptedSharedPreferences/keyAlias
- [Phase 18]: AuthInterceptor uses single-flight refresh pattern with Completer-based request queue
- [Phase 18]: Biometric reads for access token only; refresh token reads without biometric for background refresh
- [Phase 18]: TokenPair.fromJson used directly in refresh flow; userId extracted from TokenPair
- [Phase 18-01c]: AuthNotifier uses AsyncNotifierProvider for async session restore on app launch; session restore validates tokens via /api/mobile/subscription, attempts refresh on 401; login/register save tokens then re-trigger restore; logout clears storage
- [Phase 18-01d]: BiometricGate (WidgetsBindingObserver) triggers on app resume when tokens exist; ConnectivityService emits distinct connectivity stream; DeepLinkHandler parses Telegram deep links (t.me/set3vpn_bot, three-set-vpn://) and polls /api/mobile/auth/telegram/poll; unit tests cover all three providers

## Performance Metrics

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 18 P01a | 7200 | 1 tasks | 15 files |
| Phase 18 P01b | 25 | 1 tasks | 6 files |
| Phase 18 P01c | 150 | 1 tasks | 3 files |
| Phase 18 P01d | 300 | 1 tasks | 3 files |

## Session

**Last session:** 2026-11-25T19:52:00.000Z
**Stopped at:** Completed 18-01d-PLAN.md — BiometricGate, ConnectivityService, DeepLinkHandler with unit tests
**Resume file:** None
