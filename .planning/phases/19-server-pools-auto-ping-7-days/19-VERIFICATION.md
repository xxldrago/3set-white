---
phase: 19-server-pools-auto-ping-7-days
verified: "2026-11-27T05:57:54Z"
status: human_needed
score: 36/37 must-haves verified (automated)
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "On a device with a live paid ARTEMIDA key, call GET /api/mobile/servers (via the app or curl with a Bearer access token) and inspect the pools."
    expected: "simple/whitelist populate from the real links[] payload; proto, sni (whitelist only), remark→city/cc/flag, key.active and key.remainingDays are correct."
    why_human: "The real ARTEMIDA links[] shape is [ASSUMED] in 19-RESEARCH.md — only `vless://placeholder` was observable in this environment. The parser is tolerant with a scheme allowlist, but the live contract cannot be proven without a paid key."
  - test: "On a built app with real servers, trigger manual refresh and «Подключить», then disable the libbox shim (or use an unsupported platform/UDP-only server) to force the fallback."
    expected: "Real URLTest RTT + online render with pingClass colors; when libbox is unavailable a silent TCP Socket.connect result renders identically (no approx indicator); hostname-based servers are resolved and reachable; all-offline shows «Нет доступных серверов. Попробуй другой таб» + Повторить."
    why_human: "Requires a native build plus real server endpoints. Android native build is blocked here (no OpenJDK 17 / Android SDK/NDK); iOS builds but on-device urltest cannot run in this host."
  - test: "Toggle WiFi↔LTE on a physical device while the server list is open, then press «Подключить»."
    expected: "ping_cache and last_good are cleared, in-flight pings cancelled, a fresh ping runs, per-tab selection and current tab survive, and the network chip updates read-only. The first real change after startup must not be swallowed."
    why_human: "Real connectivity_plus stream transitions and native SQLite state cannot be exercised in the host test environment; the provider is now activated in App.build (CR-01 fix) but device behavior still needs observation."
  - test: "Build the Android libbox shim in CI (OpenJDK 17 + Android SDK/NDK) and verify the arm64-v8a / armeabi-v7a .so artifacts are present, then smoke-test URLTest through a real outbound."
    expected: "go build -buildmode=c-shared produces both ABIs; libbox.urltest(memberTag) redirects to the urltest group and returns online + RTT via WriteGroups; no gomobile artifact is required."
    why_human: "This environment has no JDK/SDK; build.sh is provided but native artifacts are gitignored CI outputs."
  - test: "Decide whether the shop/«Купить» buttons in the pool screen should navigate to the existing /shop stub route."
    expected: "Either (a) the buttons call context.go('/shop') and the ShopScreen stub opens, or (b) the current toast stub is formally accepted as the phase-19 shop placeholder."
    why_human: "The /shop route exists and is tested (router_test.dart), but no live UI code navigates to it — both «Купить» actions currently show a toast. This is a wiring decision, not a code absence."
  - test: "[Post-fix WR-02] On a real native build, inspect the generated sing-box config during a ping and confirm the urltest group carries url: https://www.gstatic.com/generate_204 and that URLTest is triggered on the group tag (ut-srv-<id>), with the async sample mirrored back under srv-<id>."
    expected: "The fixed generate_204 target is probed through the real outbound; RTT/online rendering is unchanged; a forced fallback still marks UDP-only servers honestly offline."
    why_human: "The Dart config and Go shim group redirection are unit-tested, but the actual sing-box URLTest behavior against a live outbound can only be confirmed on a built app."
  - test: "[Post-fix WR-06] After a successful ping, leave the app open past the 60 s TTL without any ping write (e.g. background and resume, or trigger any unrelated UI rebuild), then check the server card, connect panel and auto-select card."
    expected: "Expired samples are not shown as fresh or ranked as best by any consumer; the next connect triggers a fresh ping."
    why_human: "Read-time TTL filtering is unit-tested with an injected clock, but Drift's stream only re-emits on writes — whether the UI rebuilds promptly enough on a real device needs observation."
deferred:
  - truth: "REQ-POOL-04 load indicator (0-100% bar, green/yellow/red from `load`)"
    addressed_in: "Future milestone (real load metric required)"
    evidence: "CONTEXT D-04 explicitly defers the load bar; no `load` field served or shown; no simulation; REQ-PING-06 tie-break is RTT-only while load is hidden."
  - truth: "REQ-BE-02 /pricing-based server source"
    addressed_in: "Superseded — not planned"
    evidence: "CONTEXT D-01 replaces /pricing with subscription-links (getSubscriptionForUserId → artemida.getSubscriptionLinks); recorded in COVERAGE.md."
  - truth: "getKeyWithLinks key read"
    addressed_in: "Superseded — does not exist"
    evidence: "Researcher correction: getSubscriptionForUserId is the canonical read; no such symbol in lib/keys-service.ts."
  - truth: "Real ARTEMIDA links[] payload verification"
    addressed_in: "Staging UAT with a paid key"
    evidence: "19-RESEARCH.md flags the payload as [ASSUMED]; 19-VALIDATION.md Manual-Only Verifications table records the re-verification step."
re_verification:
  previous_status: human_needed
  previous_score: 36/37
  gaps_closed:
    - "CR-01: network-change invalidation activated in App.build; deterministic real-change stream (no startup broadcast, no .skip(1))"
    - "WR-01: outbound secrets stripped from Drift server_list_cache; inert outbound injected on offline decode"
    - "WR-02: real urltest group with fixed generate_204 URL; Go shim redirects member tag to group"
    - "WR-03: silent TCP fallback resolves hostnames via Socket.connect(String, port)"
    - "WR-04: debug LogInterceptor no longer dumps request/response bodies"
    - "WR-05: stable id hashes the full canonical outbound before tag assignment"
    - "WR-06: ping TTL re-evaluated at read time in bestServerProvider and screen consumers"
    - "WR-07: libbox bindings published only after successful setup; start() serialized"
    - "IN-01: AppTheme.pingColor treats negative RTT as offline"
    - "IN-02: backend linksCache namespaced by ${userId}:${keyId}"
  gaps_remaining: []
  regressions: []
---

# Phase 19: Server Pools & Auto-Ping (7 days) — Re-Verification Report

**Phase Goal:** Two server tabs with live ping, quick-path selection, network-aware cache invalidation.
**Verified:** 2026-11-27T05:57:54Z
**Status:** human_needed
**Re-verification:** Yes — after code-review fixes (`a51b81e`…`ad972e9`; `19-REVIEW.md` status `all_fixed`, 10/10 findings fixed).

This pass re-checked every code-review fix against the actual diff, re-ran the automated
suites, and re-tested the previously flagged wiring concerns. No new gaps were found.
The one pre-existing ⚠️ UNCERTAIN truth (shop-button → `/shop` wiring) persists and is a
human decision item; it is not a review finding and was not part of the fix set.

## Goal Achievement

### Observable Truths

Legend: ✓ VERIFIED · ✗ FAILED (BLOCKER) · ⚠️ UNCERTAIN (WARNING / human decision) ·
DEFERRED (explicitly out of scope by locked decision). Evidence marked **re-verified**
changed in the fix range.

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| 1  | `GET /api/mobile/servers` → 200 `{ok:true,simple,whitelist,key,stale}`; no JWT → 401 | ✓ VERIFIED | `route.ts:66-78,138`; route tests green |
| 2  | Active-key gate: no active key → `no_active_key` 403 with empty pools; `RenderedKey.id` + statusKind + expiry + raw status filter; trial active until expireAt | ✓ VERIFIED | `route.ts:16-38,82-89`; route tests green |
| 3  | `key` meta `{active,keyId,isTrial,remainingDays,expireAt}` | ✓ VERIFIED | `route.ts:40-46,91-97`; `server.dart:56-69` |
| 4  | No `load` field served anywhere; no simulation | ✓ VERIFIED | `server-pool.ts:31-47`; grep over shipped code still clean after fixes |
| 5  | Card fields metadata-only; `outbound` minimal sing-box for ping only, never rendered/logged; raw share-link never returned | ✓ VERIFIED | **re-verified** `providers.dart:38-82` — `_metadataOnly` strips `outbound` before `jsonEncode`, `_offlinePools` injects `{}` on decode; new test «online pools are cached metadata-only — no outbound secrets at rest» green; `dio_client.dart:36-45` bodies off (WR-04), new interceptor test green |
| 6  | Pool split D-02 by remark, else VLESS+Reality → whitelist; marker wins; XOR | ✓ VERIFIED | `server-pool.ts:62-63,179-187,595-612` |
| 7  | Source D-01 subscription-links via `getSubscriptionForUserId`, NOT `/pricing`, NOT `getKeyWithLinks` | ✓ VERIFIED | `servers-source.ts:68`; grep clean |
| 8  | Caching D-22: cache-first, TTL 60s keyed by owner+keyId, provider errors → error code + empty/cached + `stale` + `Retry-After`, never 5xx | ✓ VERIFIED | **re-verified** `servers-source.ts:22,60-76` cache key `${userId}:${keyId}` (IN-02); new cross-user isolation test green; `route.ts:102-131,139-146` |
| 9  | Tolerant share-URI parsing: scheme allowlist, all 6 protocols, skips unparseable/`vless://placeholder`, no eval | ✓ VERIFIED | `server-pool.ts:65-77,138-155,229-589` |
| 10 | `proto` verbatim values | ✓ VERIFIED | `server-pool.ts:16-23` |
| 11 | Remark/flag parse + host secondary on failure | ✓ VERIFIED | `server-pool.ts:189-220`; `server_card.dart:171-178` |
| 12 | SNI from `sni`/`serverName`, whitelist only, «SNI: domain» | ✓ VERIFIED | `server-pool.ts:580-584,606-607`; widget test green |
| 13 | Stable deterministic id, not raw link; distinct configs must not collapse | ✓ VERIFIED | **re-verified** `server-pool.ts:568-572` now hashes `scheme|JSON.stringify(outbound)` before tag assignment (WR-05); backend regression test green |
| 14 | Minimal outbound: WireGuard endpoint, Reality pbk/sid/sni/fp/flow + utls, NEW DNS | ✓ VERIFIED | `server-pool.ts:264-280,448-478`; `libbox_ping_service.dart:98-123` |
| 15 | No secrets committed/logged/rendered | ✓ VERIFIED | **re-verified** WR-01 (no secrets at rest) + WR-04 (no body logs) fixes; secret-logging grep clean |
| 16 | Own C-shared Go shim, sing-box v1.14.4, build tags, Android/iOS ABIs | ✓ VERIFIED | `main.go:13,194-369`; `go.mod:5`; `build.sh:14-17,44-91` |
| 17 | ffigen bindings, DynamicLibrary, NOT gomobile/sing-ffi | ✓ VERIFIED | `ffigen.yaml`; `libbox_bindings.dart`; `libbox_core.dart:120-132` |
| 18 | Ping = real `URLTest` with fixed `generate_204` target, RTT async via `WriteGroups`, `0,0` → offline, NOT ICMP/sync RTT | ✓ VERIFIED | **re-verified** WR-02: `libbox_ping_service.dart:116-129` emits `urltest` group `ut-srv-<id>` with `url: generate204Url`; `main.go:118-142,212-236,262-296,341-368` maps member→group, triggers group, mirrors sample under member; config test asserts `nodes.last["url"] == generate204Url` |
| 19 | `LibboxPingCore` singleton; bindings published only after successful setup; start/urltest/stop serialized; no config logging | ✓ VERIFIED | **re-verified** WR-07: `libbox_core.dart:76-118,138-178,248-262` — `_bindings = null` on failure, `_takeString(pointer, bindings)` uses producing bindings, `start()` wrapped in `_serialized` |
| 20 | Silent TCP fallback with real DNS resolution, `approx=true`, IPv6 strip, no UI indication | ✓ VERIFIED | **re-verified** WR-03: `socket_ping_service.dart:7-11,31-80` — `SocketConnector(String host, …)` and `Socket.connect(String, port)`; hostname tests green; `ping_repository.dart:243-253` |
| 21 | Honest fallback gap acknowledged | ✓ VERIFIED | `libbox_ping_service.dart:48-52`; `COVERAGE.md:50` |
| 22 | `PingResult` freezed + `pingClass` / `AppTheme.pingColor` thresholds, negative RTT offline, no load | ✓ VERIFIED | **re-verified** IN-01: `theme.dart:105-120` guards `rttMs < 0`; theme test covers negative case; `ping_result.dart:34-48` |
| 23 | Quick-path ≤3 last-good, 800ms parallel, fastest online else full | ✓ VERIFIED | `ping_repository.dart:261-291`; tests green |
| 24 | Full ping 2000ms, concurrency 10-16, per-result + final update, generation cancellation, serialization | ✓ VERIFIED | `ping_repository.dart:297-355`; tests green |
| 25 | `pingServer`: fresh-cache first, libbox, silent fallback, writes Drift | ✓ VERIFIED | `ping_repository.dart:217-256` |
| 26 | Drift `ping_cache` PK + TTL60 + upsert + clear; TTL re-checked at read time by every consumer | ✓ VERIFIED | **re-verified** WR-06: `tables.dart:4-26`; `providers.dart:143-158,168` `freshPingRows`; `server_pool_screen.dart:186-193,205-210`; new read-time TTL test green |
| 27 | `last_good` ≤5 per-tab dedupe, «последний» chip, cleared on network change | ✓ VERIFIED | `ping_cache_dao.dart:119-160`; `server_card.dart:164-167` |
| 28 | Per-tab selection + current_tab persisted, kept on clear; offline list cache metadata-only | ✓ VERIFIED | **re-verified** WR-01: `providers.dart:38-82` caches only metadata; `ping_cache_dao.dart:173-217` |
| 29 | Network invalidation D-11: provider activated by `App.build`, real-change stream only (no synthetic startup event), distinct + 500ms debounce, clear cache+last-good, cancel in-flight, keep selection/tab | ✓ VERIFIED | **re-verified** CR-01: `main.dart:4,21-29` watches `networkPingInvalidationProvider`; `connectivity_service.dart:58-78` no startup broadcast; `providers.dart:488-517` no `.skip(1)`; `network_invalidation_test.dart` green in 199/199 |
| 30 | Locked Riverpod names `serverPoolProvider`, `pingCacheProvider`, `bestServerProvider` | ✓ VERIFIED | `providers.dart:97,130,139`; screen watches all three |
| 31 | `serverPoolProvider` uses `dio.get(Endpoints.servers)` + offline Drift fallback; no client→ARTEMIDA | ✓ VERIFIED | `providers.dart:100-130`; WR-04 keeps secret bodies out of logs |
| 32 | `bestServerProvider` RTT-asc stable ranking with read-time TTL, all-offline copy, no-key blocked | ✓ VERIFIED | **re-verified** WR-06: `providers.dart:163-186` uses `freshPingRows`; `server_pool_screen.dart:244-279` |
| 33 | Connect D-18 = selection only; no-key gate; manual→auto notice; refresh spinner + «Пинг обновлён» | ✓ VERIFIED | `providers.dart:290-463`; `connect_panel.dart`; widget test green |
| 34 | Full prototype layout, Russian copy, no bottom NavigationBar, no load bar | ✓ VERIFIED | `server_pool_screen.dart:104-183`; router/widget tests green |
| 35 | AppTheme.dark verbatim palette/fonts, ThemeMode.dark, auth re-themed, min-8 | ✓ VERIFIED | `theme.dart:10-120`; `main.dart`; theme/auth tests green |
| 36 | Router: home `/` → `ServerPoolScreen`, `/shop` stub, auth/redirect preserved, no NavigationBar | ✓ VERIFIED | `router.dart:30-100`; `router_test.dart` green |
| 37 | Shop/«Купить» buttons target the `/shop` stub route | ⚠️ UNCERTAIN | Unchanged by fix range: `/shop` route exists and is tested (`router.dart:93-97`), but both live «Купить» actions call `_shopStub` toast (`server_pool_screen.dart:117,137,359-361`). Human decision requested. |

**Score:** 36/37 merged must-have truths VERIFIED automatically; 1 ⚠️ UNCERTAIN (pre-existing wiring decision, non-blocking). 0 behavior-unverified. **No new gaps.**

### Deferred Items

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | REQ-POOL-04 load bar | Future milestone — real metric needed | CONTEXT D-04; no `load` served/shown, no simulation |
| 2 | REQ-BE-02 /pricing source | Superseded by D-01 | COVERAGE.md:6,16 |
| 3 | `getKeyWithLinks` | Superseded — does not exist | `getSubscriptionForUserId` used |
| 4 | Live ARTEMIDA `links[]` shape | Staging UAT with paid key | `19-RESEARCH.md` `[ASSUMED]` |

### Required Artifacts

All 45 declared artifact paths still exist and are substantive. No stubs, no debt markers in phase-created files. Representative re-checked files:

| Artifact | Status | Re-verification evidence |
|----------|--------|--------------------------|
| `app/api/mobile/servers/route.ts` | ✓ VERIFIED | 148 lines, unchanged by fixes, all branches wired |
| `lib/server-pool.ts` | ✓ VERIFIED | stable-id fix at `:568-572`; regression test added |
| `lib/servers-source.ts` | ✓ VERIFIED | owner-namespaced cache at `:60-76`; cross-user test added |
| `mobile/native/libbox_shim/main.go` | ✓ VERIFIED | group redirection added at `:118-142,212-236,341-368` |
| `mobile/lib/core/ping/{libbox_core,libbox_ping_service,socket_ping_service,ping_repository}.dart` | ✓ VERIFIED | WR-02/03/07 changes re-read and unit-tested |
| `mobile/lib/core/db/`, `mobile/lib/features/servers/` | ✓ VERIFIED | WR-01/06 changes re-read; new tests green |
| `mobile/lib/main.dart`, `core/connectivity/connectivity_service.dart` | ✓ VERIFIED | CR-01 activation + deterministic stream re-read |
| `mobile/lib/app/theme.dart`, `core/api/dio_client.dart` | ✓ VERIFIED | IN-01 / WR-04 fixes re-read; tests green |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `servers/route.ts` | `lib/mobile-auth.ts` | `verifyAccessToken` → 401 | ✓ WIRED | `route.ts:70` |
| `servers/route.ts` | `lib/keys-service.ts` | `listKeysByUserId` + `isActiveKey` | ✓ WIRED | `route.ts:80-97` |
| `servers-source.ts` | `lib/keys-service.ts` | `getSubscriptionForUserId` | ✓ WIRED | owner-scoped, `:68` |
| `servers-source.ts` | `lib/artemida.ts` | `artemida.getSubscriptionLinks` | ✓ WIRED | no `/pricing` |
| `servers/route.ts` | `lib/server-pool.ts` | `parsePools(links)` | ✓ WIRED | `route.ts:100` |
| `libbox_ping_service.dart` | `libbox_core.dart` | `init/start/urltest` | ✓ WIRED | WR-07 serialization verified |
| `libbox_core.dart` | shim C ABI | ffigen `libbox_*` | ✓ WIRED | bindings + DynamicLibrary |
| Dart config `ut-srv-<id>` | Go shim group redirection | `groupFor` map → `URLTest(group)` | ✓ WIRED | WR-02; config test asserts fixed URL |
| `ping_repository.dart` | `socket_ping_service.dart` | silent fallback, hostname DNS | ✓ WIRED | WR-03 |
| `ping_cache_dao.dart` | `ping_repository.dart` | `PingCacheWriter`/`Lookup` | ✓ WIRED | `ping_cache_dao.dart:20` |
| `servers/providers.dart` | `/api/mobile/servers` | `dio.get(Endpoints.servers)` | ✓ WIRED | `:101` |
| `servers/providers.dart` | `ping_repository.dart` | quickPath/fullPing | ✓ WIRED | `:319,328,389,398,449` |
| `App.build` | `networkPingInvalidationProvider` | `ref.watch(...)` at app root | ✓ WIRED | **NEW (CR-01)** `main.dart:21-29` |
| `connectivity_service.dart` | invalidation provider | real-change stream only (no startup broadcast) | ✓ WIRED | **NEW (CR-01)** `connectivity_service.dart:58-78`; `providers.dart:501` |
| `server_pool_screen.dart` | locked providers + `freshPingRows` | watches all 3, TTL re-check | ✓ WIRED | WR-06 |
| `router.dart` | `ServerPoolScreen` / `ShopScreen` | home `/` and `/shop` | ✓ WIRED | `:88-97` |
| pool screen «Купить» buttons | `/shop` route | `context.go('/shop')` | ⚠️ NOT WIRED | Unchanged; toast stub used |

### Data-Flow Trace (Level 4)

| Artifact | Value | Source | Real data | Status |
|----------|-------|--------|-----------|--------|
| `servers/route.ts` | pools | `getSubscriptionLinksCacheFirst` (owner-namespaced cache) → `parsePools` | ✓ | ✓ FLOWING |
| `server_pool_screen.dart` card fields | metadata | backend `Server` JSON → freezed model → card | ✓ | ✓ FLOWING |
| `PingBadge` | RTT / offline | real `URLTest` (fixed `generate_204` group) or DNS-resolved `Socket.connect` → Drift → `freshPingRows` | ✓ | ✓ FLOWING |
| `bestServerProvider` | best server | Drift rows, TTL re-checked at read time | ✓ | ✓ FLOWING |
| `MainHeader` key pill | days / expiry | backend `key` meta | ✓ | ✓ FLOWING |
| Offline card `outbound` | `{}` | metadata-only cache (secrets stripped) | intentional | ✓ NO SECRET AT REST |
| Connect panel IP/timer/traffic | `—` | Phase 20 | honest placeholder | ✓ NO FABRICATION |

### Behavioral Spot-Checks (re-run after fixes)

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full Flutter suite | `cd mobile && flutter test` | **199/199 passed** (exit 0) | ✓ PASS |
| Flutter analyze | `cd mobile && flutter analyze` | 0 errors, 0 phase-file warnings; 1622 pre-existing `info` lints + 1 pre-existing legacy-plugin warning in `analysis_options.yaml` | ✓ PASS (phase scope) |
| Backend typecheck | `npx tsc --noEmit` | exit 0, 0 bytes of output | ✓ PASS |
| Focused backend tests | `npx vitest run tests/unit/server-pool.test.ts tests/unit/mobile-servers-route.test.ts tests/unit/servers-source.test.ts` | **46/46 passed** (3 files) | ✓ PASS |
| Full backend suite (baseline) | `npx vitest run tests/unit` | Previous initial-verification baseline unchanged; all failures in unrelated pre-existing/admin files, none in phase-19 files | ⚠️ OUT OF SCOPE |

**Probe Execution:** N/A — no declared probes.

### Code-Review Fix Verification (`19-REVIEW.md` → `all_fixed`)

| Finding | Fix commit | Verified in code | Status |
|---------|-----------|------------------|--------|
| CR-01 network invalidation dead | `a51b81e` | `main.dart` watches provider; startup broadcast removed; `.skip(1)` removed | ✓ FIXED |
| WR-01 secrets in plaintext SQLite | `42e2637` | `_metadataOnly` strips `outbound`; decode injects `{}`; test added | ✓ FIXED |
| WR-02 dead `generate204Url` | `43bcc07` | real `urltest` group with fixed URL; Go shim group redirection; config test | ✓ FIXED |
| WR-03 hostname fallback offline | `4f1f636` | `Socket.connect(String, port)` DNS; hostname tests | ✓ FIXED |
| WR-04 Dio body logs secrets | `fbf500c` | bodies/headers off; interceptor test | ✓ FIXED |
| WR-05 narrow dedupe id | `1a85fc9` | id hashes full outbound before tag; backend test | ✓ FIXED |
| WR-06 TTL only on emission | `3367356` | `freshPingRows` read-time re-check; test | ✓ FIXED |
| WR-07 FFI init/start race | `459b243` | bindings published post-setup; `start()` serialized | ✓ FIXED |
| IN-01 negative RTT "good" | `6d09ad6` | `pingColor` guards `<0`; theme test | ✓ FIXED |
| IN-02 cache keyed by keyId only | `ad972e9` | `${userId}:${keyId}` key; cross-user test | ✓ FIXED |

Open review findings: **0**. No regressions introduced by the fix range.

### Requirements Coverage

All 13 phase-19 IDs remain accounted for: REQ-POOL-01/02/03/05 ✓ SATISFIED, REQ-POOL-04
DEFERRED (D-04), REQ-PING-01/02/03/04/05/06/07/08 ✓ SATISFIED (01/05 with listed device UAT).
No orphaned IDs. Full per-requirement evidence is unchanged from the initial verification
except: REQ-PING-05 now has production wiring (CR-01), REQ-PING-04 has read-time TTL (WR-06),
REQ-PING-01 has the enforced fixed probe target (WR-02) and DNS-capable fallback (WR-03).

### Test Quality Audit

New tests from the fix range are value-level and non-circular: «no outbound secrets at rest»,
read-time TTL with injected clock, Dio interceptor flags, hostname fallback, fixed-url config,
dedupe-by-outbound, negative RTT color, cross-user cache isolation, and real-change network
invalidation. No disabled/skipped tests in phase files. No blocker from test quality.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `mobile/lib/features/home/providers.dart` | 61-62 | `TODO` placeholder `homeScreenProvider` retained from phase 18 | ℹ️ Info | Superseded by `serverPoolProvider`; not wired to live UI; pre-existing and documented |
| pool screen «Купить» actions | 117,137 | Toast stub instead of `/shop` navigation | ⚠️ Warning | Unchanged; human decision item #5 |

Previously flagged WR-01 docstring mismatch is resolved (cache is genuinely metadata-only).
No `TBD`/`FIXME`/`XXX`, no `Math.random`, fake IP, `sleep`, simulation or `load` in shipped code.

### Decision Coverage

Decision coverage re-check: **22/22 trackable CONTEXT.md decisions honored**
(`check.decision-coverage-verify`, `not_honored: []`). Fixes reinforce D-05 (no secrets in
cache/logs), D-06 (fixed `generate_204`), D-07 (hostname-capable silent fallback), D-10
(read-time TTL), D-11 (live network invalidation), D-13 (stable identity).

### Human Verification Required (7 items)

1. **Live ARTEMIDA `links[]` payload** — paid-key UAT; payload shape `[ASSUMED]`.
2. **On-device real ping + silent fallback** — includes hostname resolution; native build needed.
3. **WiFi↔LTE invalidation** — CR-01 now wired in `App.build`; first real change must not be swallowed.
4. **Android native build** — CI build with JDK17/SDK/NDK; group-redirected URLTest smoke test.
5. **Shop-button wiring decision** — `/shop` route exists but no live button targets it.
6. **[WR-02] Group-triggered URLTest on a real build** — fixed `generate_204` group config + mirrored RTT.
7. **[WR-06] Read-time TTL expiry** — expired samples must not be shown as fresh after >60 s without writes.

### Gaps Summary

No new gaps and no blockers. All 10 code-review findings are verified fixed in code with
supporting tests; automated suites are green (199/199 Flutter, 46/46 focused backend, tsc
clean, phase-scope analyzer clean). The single ⚠️ UNCERTAIN truth from the initial verification
(shop-button → `/shop`) remains a human wiring decision and keeps the status `human_needed`
alongside the four device/external UAT items and two new post-fix checks.

---

_Verified: 2026-11-27T05:57:54Z_
_Verifier: the agent (gsd-verifier)_
