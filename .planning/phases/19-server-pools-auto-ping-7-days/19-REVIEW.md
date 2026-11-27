---
phase: 19-server-pools-auto-ping-7-days
reviewed: 2026-11-27T05:38:38Z
depth: standard
files_reviewed: 35
files_reviewed_list:
  - app/api/mobile/servers/route.ts
  - lib/server-pool.ts
  - lib/servers-source.ts
  - mobile/native/libbox_shim/main.go
  - mobile/native/libbox_shim/build.sh
  - mobile/native/libbox_shim/libbox_shim.h
  - mobile/native/libbox_shim/go.mod
  - mobile/lib/core/ping/ffigen.yaml
  - mobile/lib/core/ping/libbox_core.dart
  - mobile/lib/core/ping/ping_result.dart
  - mobile/lib/core/ping/libbox_ping_service.dart
  - mobile/lib/core/ping/socket_ping_service.dart
  - mobile/lib/core/ping/ping_repository.dart
  - mobile/lib/core/db/tables.dart
  - mobile/lib/core/db/app_database.dart
  - mobile/lib/core/db/ping_cache_dao.dart
  - mobile/lib/app/theme.dart
  - mobile/lib/main.dart
  - mobile/lib/app/router.dart
  - mobile/lib/features/home/providers.dart
  - mobile/lib/features/servers/server.dart
  - mobile/lib/features/servers/providers.dart
  - mobile/lib/features/servers/server_pool_screen.dart
  - mobile/lib/features/servers/widgets/server_card.dart
  - mobile/lib/features/servers/widgets/connect_panel.dart
  - mobile/lib/features/servers/widgets/main_header.dart
  - mobile/lib/features/servers/widgets/no_key_banner.dart
  - mobile/lib/features/servers/widgets/pool_tab_bar.dart
  - mobile/lib/features/servers/widgets/pool_toolbar.dart
  - mobile/lib/features/servers/widgets/auto_select_card.dart
  - mobile/lib/features/shop/shop_screen.dart
  - mobile/lib/features/auth/widgets/auth_form.dart
  - mobile/lib/features/auth/widgets/error_toast.dart
  - mobile/lib/features/auth/screens/login_screen.dart
  - mobile/pubspec.yaml
findings:
  critical: 1
  warning: 7
  info: 2
  total: 10
status: all_fixed
fixed_at: 2026-11-27T05:52:02Z
fix_iteration: 1
---

# Phase 19: Code Review Report

**Reviewed:** 2026-11-27T05:38:38Z
**Depth:** standard
**Files Reviewed:** 35 production files (plus supporting contract files `keys-service.ts`, `artemida.ts`, `dio_client.dart`, `connectivity_service.dart`, `constants.dart`, `auth_notifier.dart`; generated `.g.dart`/`.freezed.dart`/bindings and binary fonts were not deeply reviewed)
**Status:** all_fixed (10/10 findings fixed in iteration 1; see per-finding Resolution lines)

## Summary

Reviewed all phase-19 implementation commits (`3b19837` … `3622dc9`) across the backend servers route, share-URI parser, cache-first source, the Go/C-shared libbox shim, Dart FFI core, ping services/repository, Drift cache, dark theme, Riverpod data layer, UI widgets and router swap.

The JWT/active-key gate, ownership-scoped subscription read, scheme allowlist with never-throw parsing, no-`load`/no-simulation discipline, and router/auth preservation are sound. However, several locked constraints are only partially realized in code: **the real-connectivity invalidation provider is never activated by any production widget**, making a core promised feature dead; protocol secrets are persisted in plaintext SQLite despite an explicit "no secrets at rest" decision; the "fixed `generate_204`" probe URL is a dead constant; and the TCP fallback cannot resolve hostname-based servers (which are the majority). Additional reliability issues affect cache freshness and FFI init state.

Unrelated admin/promo files present in the git range (from a concurrent process, explicitly noted out-of-scope in all 8 summaries) were not reviewed.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: Network-change invalidation is wired in tests only — never activated in the app

**Resolution:** FIXED in `a51b81e` — `App.build` now watches `networkPingInvalidationProvider` so the real connectivity stream stays alive; `ConnectivityService._updateStatus` no longer broadcasts a startup event, and the provider listens to real changes without `.skip(1)`.

**File:** `mobile/lib/features/servers/providers.dart:471-504`, `mobile/lib/main.dart:14-43`, `mobile/lib/features/servers/server_pool_screen.dart:394-396`
**Issue:** `networkPingInvalidationProvider` is a lazy Riverpod `Provider`. A repo-wide grep shows it is read **only** by `mobile/test/unit/core/ping/network_invalidation_test.dart` (lines 159/190/207/234/253) and by **no** file under `mobile/lib/`. Neither `App.build` (which watches only `deepLinkHandlerProvider` and `resumeBiometricGateProvider`) nor `ServerPoolScreen.build` watches it. The connectivity subscription, 500 ms debounce, `repository.cancelInflight()`, `clearPingCacheAndLastGood()`, re-ping and `ref.invalidate` therefore never execute in production. The UI actively advertises the dead feature: «Смена сети — Wi-Fi ↔ LTE инвалидирует кеш и запускает ре-пинг». Locked requirement REQ-PING-05 / D-11 is non-functional. A secondary latent bug: `ConnectivityService` emits its startup event from `_updateStatus()` on a broadcast controller that typically has no listener yet, so `.skip(1)` (line 477) can swallow the first *real* change once the provider is finally activated.
**Fix:** Watch the provider from a long-lived widget, e.g. in `App.build` next to the existing app-level listeners:

```dart
// mobile/lib/main.dart — add import of features/servers/providers.dart
ref.watch(networkPingInvalidationProvider); // keep connectivity invalidation alive
```

Additionally, make startup skipping deterministic — subscribe `networkPingInvalidationProvider` to `Connectivity().onConnectivityChanged` directly (which emits only real changes) instead of `connectivityStream.skip(1)`, or make the service emit an explicit initial event after subscription.

## Warnings

### WR-01: Protocol secrets are written to plaintext SQLite despite the "metadata-only cache" decision

**Resolution:** FIXED in `42e2637` (test baseline corrected in `2b0125a`) — `_cachePools` strips `outbound` before `jsonEncode`, and `_offlinePools` injects an empty outbound on decode. Added a test asserting no `outbound`/`uuid` reaches the Drift cache.

**File:** `mobile/lib/features/servers/providers.dart:38-51` (`_cachePools`), `mobile/lib/features/servers/server.dart:35-48`
**Issue:** `Server.toJson()` includes the `outbound` map, which carries `uuid`, `password`, `private_key`, Reality `pbk`/`sid`, etc. `_cachePools` serializes `server.toJson()` straight into `server_list_cache` via `dao.cacheServerList(...)`. `tables.dart:69` and the 19-04 summary Threat Flags explicitly require "metadata-only JSON; no raw links or outbound secrets in local SQLite". The debug `LogInterceptor` then also dumps the secret-bearing response body (see WR-04). Storing the user's own VPN credentials unencrypted on-device violates the stated security control and broadens exposure (backups, DB dumps).
**Fix:** Strip `outbound` before caching and supply an inert outbound on decode (offline cards are never pinged):

```dart
final meta = Map<String, dynamic>.from(server.toJson())..remove('outbound');
// jsonEncode(meta) -> cacheServerList
// on decode:
final json = Map<String, dynamic>.from(item as Map);
json.putIfAbsent('outbound', () => <String, dynamic>{});
return Server.fromJson(json);
```

### WR-02: `generate204Url` is dead code — the locked "fixed generate_204" probe target is not configured

**Resolution:** FIXED in `43bcc07` (test baseline corrected in `26f5b66`) — `_buildConfig` now emits a real `urltest` outbound group with `url: generate204Url`; the Go shim maps member tags to their group and redirects `URLTest` to the group so the fixed target is actually probed. Config test updated.

**File:** `mobile/lib/core/ping/libbox_ping_service.dart:6-10, 98-123`
**Issue:** `const String generate204Url = "https://www.gstatic.com/generate_204"` is referenced only by a test that asserts its literal value (`libbox_ping_service_test.dart:109`). It is not used in `_buildConfig`, not passed to the shim, and `libbox_setup` configures no URL-test target. The comment ("the shim calls URLTest(outboundTag), which resolves to this fixed generate_204 target internally") is misleading: the probe actually uses whatever sing-box default applies. D-06's "fixed generate_204" constraint is not enforced by code.
**Fix:** Add an explicit `urltest` outbound group to the generated config and trigger URLTest on that group with `url: generate204Url`, or pass the URL through the shim; otherwise delete the constant and correct the comment. Example:

```dart
"outbounds": [
  {"type":"direct","tag":"direct"},
  if (!isEndpoint) node,
  {"type":"urltest","tag":"urltest","outbounds":[tag],"url":generate204Url,"interval":"1m"},
],
// then ping the "urltest" group tag instead of the raw node tag
```

### WR-03: Silent TCP fallback always marks hostname-based servers offline

**Resolution:** FIXED in `4f1f636` — `SocketConnector` now accepts a host string and the production connector uses `Socket.connect(String, port)` so the platform resolver handles DNS; IPv6 bracket stripping is kept and `approx` stays silent. Tests updated for hostnames; no IP-literal-only gate remains.

**File:** `mobile/lib/core/ping/socket_ping_service.dart:42-49, 74-80`
**Issue:** `_parseHost` uses `InternetAddress.tryParse`, which parses IP literals only and performs no DNS resolution. `server-pool.ts` supplies `hp.host` — normally a hostname such as `simple.example.com` for VLESS/Trojan/Hysteria2/VMess. For those, `address == null` and `ping()` returns `online:false` without ever opening a socket. The test at `socket_ping_service_test.dart:75-90` codifies `"not-an-ip" -> offline`, masking the gap. With native libbox artifacts absent (the documented current state), every ping falls back to TCP, so all hostname servers appear offline.
**Fix:** Let `Socket.connect` resolve hostnames (its `String host` overload does DNS), or resolve explicitly:

```dart
final ip = InternetAddress.tryParse(host) ??
    (await InternetAddress.lookup(host).catchError((_) => <InternetAddress>[])).firstOrNull;
```

Keep bracket stripping for IPv6 literals and widen `SocketConnector` to accept a hostname string.

### WR-04: Debug-mode Dio interceptor logs the secret-bearing servers response

**Resolution:** FIXED in `fbf500c` — `LogInterceptor` now has `requestBody: false` / `responseBody: false` (headers already off), so outbound secrets can never be logged. Added a test asserting the interceptor flags.

**File:** `mobile/lib/core/api/dio_client.dart:36-45` (pre-existing config, newly exposed by phase 19), `app/api/mobile/servers/route.ts:99-138`
**Issue:** `DioClient` adds `LogInterceptor(requestBody: true, responseBody: true, logPrint: (obj) => _logger.d(obj.toString()))` in debug builds. The `/api/mobile/servers` body now includes `outbound` with all protocol secrets (confirmed by `tests/unit/mobile-servers-route.test.ts:129-135`, which strips `outbound` only for its own assertion). Debug/profile builds therefore log VPN credentials, contradicting "no secret ... in logs" (D-05).
**Fix:** Add a redacting interceptor for `Endpoints.servers`, or disable `responseBody`/`requestBody` logging (the response is already covered by structured tests).

### WR-05: Dedupe id is too narrow — distinct server configs are silently dropped

**Resolution:** FIXED in `1a85fc9` — the stable id now hashes `scheme|JSON.stringify(outbound)` before the tag is assigned, so configs differing in security/sni/pbk/flow/transport no longer collapse. Added a backend regression test; focused vitest passes.

**File:** `lib/server-pool.ts:99-109` (`stableHash`), `lib/server-pool.ts:568`, `lib/server-pool.ts:595-612` (`parsePools`)
**Issue:** The stable id hashes only `scheme|host|port|secret`. Two genuinely different configs that share UUID/password and host:port but differ in `security`, `path`, `sni`, `pbk`/`sid`, flow or transport (common with panel-generated links reusing one UUID on one endpoint) produce the same id. `parsePools` then skips the second server via `seen.has(server.id)` — silent data loss from the pool list. The doc claim "byte-identical duplicates collapse" is not what is implemented.
**Fix:** Hash the full canonical outbound (before the tag is assigned), e.g.:

```ts
const id = stableHash(`${split.scheme}|${JSON.stringify(parsed.server.outbound)}`);
```

### WR-06: `watchFresh` TTL is evaluated only on emission — stale rows can be ranked indefinitely

**Resolution:** FIXED in `3367356` — added `freshPingRows` which re-checks the 60 s TTL at read time; `bestServerProvider` and both screen consumers (`_sampleFor`, `_list`) now use it. Added a read-time TTL test with an injectable clock.

**File:** `mobile/lib/core/db/ping_cache_dao.dart:81-95`, `mobile/lib/features/servers/providers.dart:139-165, 186-193`
**Issue:** `watchFresh` filters `row.ts >= clock() - ttl` inside `.map()`, i.e. only when Drift re-emits after a write. If no ping write occurs for over 60 s (and network invalidation is dead — see CR-01), the stream keeps returning the same rows and they remain "fresh" forever from the UI's perspective. `bestServerProvider` and `_sampleFor`/`_list` consume those rows directly without re-checking `ts`, so an expired sample can be shown as best/online.
**Fix:** Filter by `ts` at read time in every consumer (e.g. in `bestServerProvider` and `_list`), or have `watchFresh` schedule a `Timer` to re-emit at the oldest row's expiry.

### WR-07: `LibboxPingCore` sets `_bindings` before setup succeeds; `start()` races with serialized calls

**Resolution:** FIXED in `459b243` — `_bindings` is assigned only after a successful `libbox_setup` and cleared on init failure; `_takeString` takes explicit bindings for the in-flight setup; `start()` is wrapped in `_serialized` alongside `urltest()`/`stop()`.

**File:** `mobile/lib/core/ping/libbox_core.dart:93-118, 137-164, 230-241`
**Issue:** `_performInit` assigns `_bindings = bindings` before `libbox_setup` returns, and `init()` only resets `_initFuture` on failure — it leaves `_bindings` non-null, so `isAvailable` reports true after a failed init and a later `start()` would use an uninitialized shim. Also, `start()` is not wrapped in `_serialized` while `urltest()` and `stop()` are, so a start concurrent with a ping/stop can race on the single native command client.
**Fix:** Assign `_bindings` only after a successful setup (`if (error.isNotEmpty) { throw ... } _bindings = bindings;`) and null it in the error path; wrap `start()` in `_serialized<void>(...)`.

## Info

### IN-01: `AppTheme.pingColor` treats negative RTT as "good"

**Resolution:** FIXED in `6d09ad6` — `pingColor` now guards `rttMs < 0` and returns `pingOffline`, matching `pingClass`; theme test covers the negative case.

**File:** `mobile/lib/app/theme.dart:106-120`
**Issue:** Unlike `pingClass` (`ping_result.dart:34-37`), `AppTheme.pingColor` does not guard `rttMs < 0`; a negative sample would render with `pingGood`. Real pings never yield negatives, but the two mappers are inconsistent.
**Fix:** Add `if (rttMs < 0) return pingOffline;` (or delegate to `pingClass`).

### IN-02: Backend in-memory cache is keyed by keyId only

**Resolution:** FIXED in `ad972e9` — `linksCache` is now keyed by `${userId}:${keyId}`, checked before any provider call; added a cross-user isolation test. Focused vitest passes.

**File:** `lib/servers-source.ts:22, 62-65`
**Issue:** `linksCache` has no user namespace and is checked before `getSubscriptionForUserId`. This is currently safe because the route passes an id drawn from `listKeysByUserId(claims.userId)` and `RenderedKey.id === row.keyId` (globally unique), and `getSubscriptionForOwnedKey` joins ownership on cache miss. Nonetheless, the design relies on the caller for access control; a future caller passing an unvalidated id would get cached links without an ownership check.
**Fix:** Key by `${userId}:${keyId}` or perform the ownership join before the cache read if this module is ever reused.

---

## Fix Verification (iteration 1, 2026-11-27T05:52:02Z)

- `cd mobile && flutter analyze` — 0 errors, 0 warnings; 1622 pre-existing `info` lint notices remain (style-only, unrelated to these fixes). Analyzer ran in the **main checkout** (isolated worktree had no `.dart_tool`).
- `cd mobile && flutter test` — **199/199 passed** (main checkout).
- `npx tsc --noEmit` — no errors in any touched file; 174 pre-existing implicit-any errors remain in unrelated legacy test files.
- Focused backend vitest (`server-pool`, `servers-source`, `mobile-servers-route`) — **46/46 passed**.
- Go shim syntax checked with `gofmt -d`: no diff in changed regions (only pre-existing alignment diffs elsewhere).
- Locked CONTEXT D-01..D-22 respected: no `load`, no `/pricing`, no `libbox_urltest`, no simulation, no secrets in logs/UI, no raw share-links in client cache. Unrelated admin/promo working-tree files were not touched.

_Reviewed: 2026-11-27T05:38:38Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
