# Phase 19: Server Pools & Auto-Ping (7 days) - Pattern Map

**Mapped:** 2026-11-27
**Files analyzed:** 51 new/modified files (5 backend + 46 Flutter)
**Analogs found:** concrete in-repo matches for the majority; net-new libbox shim / Drift / ping core / `features/servers` widgets / native artifacts listed in "No Analog Found" (use RESEARCH.md snippets + canonical prototype instead)

Source of truth for scope: `19-CONTEXT.md` (D-01..D-22), `19-RESEARCH.md`, `ROADMAP.md §Phase 19`, `REQUIREMENTS.md §REQ-POOL/REQ-PING`, `.planning/seeds/prototype-mobile-client.html`, `.planning/seeds/SEED-001-mobile-client-karing.md`. Backend = thin wrapper over ARTEMIDA; **D-01 overrides ROADMAP 19.1 `/pricing`** → source is `lib/keys-service.ts` → `artemida.getSubscriptionLinks(keyId)`. CONTEXT canonical refs are ground truth; "No `load`, no simulation, no secrets in logs/cards" (D-04/D-05/D-11/D-18).

> **Tracked-source gate:** every analog below is a git-TRACKED path (`git ls-files` verified). No gitignored mirrors.
> **Read-only:** this file is the only artifact written; no source code modified.

---

## File Classification

### Backend (Next.js 16.3.7, App Router, `@/` alias, TS strict)

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `app/api/mobile/servers/route.ts` **(NEW)** | route / controller | request-response (+ provider error→empty degradation) | `app/api/mobile/subscription/route.ts` | exact |
| `lib/server-pool.ts` **(NEW)** | utility (pure transform; share-URI→`Server`, pool classify, remark/flag parse, sing-box `outbound` build) | transform | `lib/email-canonical.ts` (pure module, never throws) + `lib/artemida.ts` tolerant normalizers | role-match |
| `lib/servers-source.ts` **(NEW, RESEARCH-recommended; not yet present)** | service (cache-first links source; in-memory short-TTL `linksCache` keyed `keyId`; provider-error→cached/empty; D-22) | request-response | `lib/keys-service.ts` `getSubscriptionForOwnedKey` + `lib/artemida.ts` p-retry/`ArtemidaError` | role-match |
| `tests/unit/server-pool.test.ts` **(NEW)** (RESEARCH names `test/server-pool.test.ts`; repo vitest include is `tests/**/*.test.ts`) | test | transform | `tests/unit/artemida-client.test.ts` + `tests/unit/keys-service.test.ts` | role-match |
| `tests/unit/mobile-servers-route.test.ts` **(NEW)** | test (route; mock `artemida`, mock `verifyAccessToken`; D-21/D-22; no secret logging) | request-response | `tests/unit/devices-route.test.ts` + `tests/unit/artemida-client.test.ts` + `tests/helpers/fake-fetch.ts` | role-match |

**Reused, NOT modified (canonical backend assets, verified tracked):**
`lib/mobile-auth.ts` `verifyAccessToken`; `lib/keys-service.ts` `listKeysByUserId`/`deriveStatusKind`/`daysUntilExpiry`/`getSubscriptionForUserId`/`STATUS_ORDER`; `lib/artemida.ts` `artemida` singleton + `getSubscriptionLinks`/`listKeys` + `ArtemidaError` + `ArtemidaCode` + `RETRYABLE` + `parseRetryAfter` + both error envelopes + `normalizeSubscriptionLinks` + `asString/asStringArray/asArray`; `lib/logger.ts` (pino, no-secrets); `lib/prisma.ts` `prisma`; `prisma/schema.prisma` `KeyCache`; `docs/artemida-v1-contract.md`; `vitest.config.ts` + `tests/helpers/fake-fetch.ts`. **`getKeyWithLinks` does NOT exist** (RESEARCH verified) → use `getSubscriptionForUserId`. **No `/pricing`** (D-01). **No `load`** (D-04).

### Flutter (3.50.1 / Dart 3.14, package `mobile`, Riverpod 3.4.2, freezed 4.0.3, Dio, GoRouter 18, `flutter_lints` strict)

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `mobile/lib/features/servers/server.dart` **(NEW)** | model (freezed `Server`, `ServerPools`, `ServerKey`, `PoolTab`; `@JsonKey`; `fromJson`) | transform | `mobile/lib/models/auth_models.dart` | role-match |
| `mobile/lib/features/servers/server_pool_screen.dart` **(NEW)** | component (`ConsumerWidget`; replaces `_HomeScreen`; prototype `#screen-main`; no bottom nav) | request-response + streaming | `mobile/lib/features/auth/screens/login_screen.dart` + `mobile/lib/app/router.dart` `_HomeScreen` + prototype | role-match |
| `mobile/lib/features/servers/providers.dart` **(NEW)** | provider (Riverpod `serverPoolProvider`, `pingCacheProvider`, `bestServerProvider`, `currentTabProvider`, `selection`, last-good, network invalidation) | streaming / event-driven | `mobile/lib/features/subscription/providers.dart` + `mobile/lib/features/home/providers.dart` + `mobile/lib/core/auth/auth_notifier.dart` + `router.dart` `@riverpod` | role-match |
| `mobile/lib/features/servers/widgets/server_card.dart` **(NEW)** | component (server row; flag/name/city/cc/host/proto/SNI/`последний`/ping `N мс`·`офлайн`·`нет ответа`/selected; no load bar) | request-response | `mobile/lib/features/auth/widgets/*` (widget style) + prototype `.srv` | partial |
| `mobile/lib/features/servers/widgets/auto_select_card.dart` **(NEW)** | component («Автовыбор» + «Выберу самый быстрый сервер» + `Лучший: {city} · {proto}` + ping) | request-response | `mobile/lib/features/auth/widgets/*` + prototype `.auto` | partial |
| `mobile/lib/features/servers/widgets/pool_tab_bar.dart` **(NEW)** | component (segmented `Простой VPN`/`Обход белых списков`, `aria-selected`, per-tab persist) | event-driven | `router.dart` `NavigationBar` (being removed; style reference) + prototype `.seg` | partial |
| `mobile/lib/features/servers/widgets/pool_toolbar.dart` **(NEW)** | component (`modeDesc`, read-only network chip Wi-Fi/LTE, refresh button → full ping + «Пинг обновлён») | request-response | prototype `.toolbar` + `mobile/lib/core/connectivity/connectivity_service.dart` | partial |
| `mobile/lib/features/servers/widgets/connect_panel.dart` **(NEW)** | component (conn-panel + «Подключить» → selection only; hint «Автопинг перед подключением…»; no simulated connect; VPN core = Phase 20; «Нет активного ключа»+«Купить» when no key) | event-driven | `router.dart` `_HomeScreen` `FilledButton` + prototype `.conn-panel` | partial |
| `mobile/lib/features/servers/widgets/main_header.dart` **(NEW)** | component (brand 3set.online, greeting, status pill, key pill `ключ · N дн.`, date pill, refresh/shop/logic/avatar buttons) | request-response | `router.dart` `AppBar` + prototype `.main-head` | partial |
| `mobile/lib/features/servers/widgets/no_key_banner.dart` **(NEW)** | component («Ключ неактивен — серверы недоступны» / «Нет активного ключа» + «Купить» stub; «Повторить») | request-response | `mobile/lib/features/auth/widgets/error_toast.dart` + prototype banner | partial |
| `mobile/lib/features/shop/shop_screen.dart` **(NEW)** | component (`/shop` stub «Купить»/«Магазин»; Phase 21) | request-response | `router.dart` route pattern + auth stubs | partial |
| `mobile/lib/core/ping/ping_result.dart` **(NEW)** | model (freezed `PingResult{online, rttMs?, approx, tsMs}`; `pingClass` good≤60/mid≤110/warn≤180/bad/offline) | transform | `mobile/lib/models/auth_models.dart` | role-match |
| `mobile/lib/core/ping/ping_repository.dart` **(NEW)** | service (`pingServer`; quick-path ≤3 last-good 800 ms → full ping all-in-tab 2000 ms concurrency 10–16; fresh-cache TTL 60 s check; silent `Socket.connect` fallback `approx`; cancellation/generation token; serialize urltests) | streaming | **No direct analog**; `connectivity_service.dart` service style + RESEARCH §Ping snippet | partial |
| `mobile/lib/core/ping/libbox_ping_service.dart` **(NEW)** | service (`LibboxPingService`; `libbox.urltest`→`URLTest(tag)`+`WriteGroups.URLTestDelay`; NOT ICMP; silent fallback boundary) | request-response | **No analog**; `dio_client.dart` service style + RESEARCH sing-box facts | none |
| `mobile/lib/core/ping/socket_ping_service.dart` **(NEW)** | service (`SocketPingService`; `dart:io Socket.connect(host,port,timeout:)`; real TCP RTT; `approx=true`; `SocketException`/`TimeoutException`→offline; strip IPv6 `[]`; `socket.destroy()`; silent) | request-response | **No analog** (no sockets in repo); RESEARCH §Fallback snippet | none |
| `mobile/lib/core/ping/libbox_core.dart` **(NEW)** | service (`LibboxPingCore` singleton; `init`/`start(configJson)`/`stop`/`urltest`/`dispose`; minimal sing-box 1.14 no-TUN config; never log config secrets) | event-driven | **No analog**; RESEARCH §libbox + `connectivity_service.dart` lifecycle | none |
| `mobile/lib/core/ping/generated/libbox_bindings.dart` **(NEW, generated)** | provider/utility (ffigen output from shim `.h`; `DynamicLibrary`; `calloc`/`Utf8`) | transform | **No analog**; ffigen convention | none |
| `mobile/lib/core/ping/ffigen.yaml` **(NEW)** | config (ffigen `name`/`description`/`output`/`headers`/`compiler-opts`) | file-I/O | `mobile/build.yaml` style; RESEARCH ffigen `^23.0.0` | partial |
| `mobile/native/libbox_shim/main.go` **(NEW)** | service/native (Go `package main`, `//export libbox_setup/start/stop/urltest/urltest_take/free_string`, `go build -buildmode=c-shared`, own `PlatformInterface` no-op, `CommandClient(CommandGroup)`, `URLTest(tag)`; `link==""`→`https://www.gstatic.com/generate_204`; `with_utls` etc. tags) | event-driven | **No analog** (no Go in repo); RESEARCH §Own FFI shim verbatim skeleton | none |
| `mobile/native/libbox_shim/go.mod` **(NEW)** | config (Go 1.24+; sing-box v1.14.4) | file-I/O | `mobile/pubspec.yaml` analog style | partial |
| `mobile/lib/core/db/app_database.dart` **(NEW)** | store (`@DriftDatabase(tables:[PingCache,LastGood,Selection,CurrentTab,ServerListCache])`; `driftDatabase(name:…)`; `appDatabaseProvider`; `.g.dart`) | CRUD | **No analog** (no Drift yet); `token_store.dart`/`secure_storage.dart` persistence style + RESEARCH Drift snippet | partial |
| `mobile/lib/core/db/tables.dart` **(NEW)** | model (Drift `Table` defs; `ping_cache(server_id,tab,rtt,online,ts)` PK(server_id,tab); `approx`; `last_good`≤5; `selection`; `current_tab`; `server_list_cache`; TTL `ts+60000`) | CRUD | **No analog**; RESEARCH §Drift `PingCache` snippet | none |
| `mobile/lib/core/db/ping_cache_dao.dart` **(NEW)** | store (`PingCacheDao`; `upsert`, `watchFresh`, `isFresh` TTL 60 s, `clear`, `markOnline`, `clearLastGood`, selection persist; keep `selection`/`current_tab` on clear) | CRUD + streaming | **No analog**; `token_store.dart` persistence + RESEARCH `PingCacheDao` | partial |
| `mobile/lib/app/router.dart` **(MODIFY)** | route/config (`@riverpod router`, `GoRouter`, `redirect`, `refreshListenable`, `authNotifierProvider`, keep `/auth`,`/register`,`/telegram-wait`,`/`,`redirect`; replace `_HomeScreen`→`ServerPoolScreen`; **remove `NavigationBar`**; add `/shop`; profile/logic sheets; repurpose `currentTabProvider`→pool tab) | event-driven | self (existing `router.dart`) | exact |
| `mobile/lib/app/theme.dart` **(MODIFY)** | config (**dark prototype `AppTheme.dark` app-wide, keep M3**; palette `--bg #0e1512`,`--bg2`,`--surface`,`--surface2`,`--surface3`,`--line`,`--lime #b7ff45`,`--lime2`,`--lime3`,`--teal #3ee6b0`,`--amber`,`--red`,`--blue`,`--text`,`--muted`,`--dim`, grad; Manrope/Unbounded/JetBrains Mono; primary/ghost/danger; ping colors good/mid/warn/bad/offline; `--r 18`) | transform | self (existing `AppTheme.light`/`dark`) + prototype `:root` | exact |
| `mobile/lib/main.dart` **(MODIFY)** | config (`themeMode: ThemeMode.dark`, `theme=AppTheme.dark`, `darkTheme=AppTheme.dark`; keep `ProviderScope`, `deepLinkHandlerProvider`, `resumeBiometricGateProvider`, `routerProvider`, `MediaQuery` scaler) | request-response | self | exact |
| `mobile/lib/features/home/providers.dart` **(MODIFY)** | provider (`currentTabProvider` → `PoolTab` persisted, NOT bottom-nav int; `homeScreenProvider` superseded by `serverPoolProvider`; keep `currentUserProvider` wiring) | streaming | self + `features/subscription/providers.dart` | exact |
| `mobile/lib/app/constants.dart` **(REFERENCE — already satisfied)** | config (`Endpoints.servers='/api/mobile/servers'` already; `apiBaseUrl`; `ConnectivityConfig.debounceDuration=500ms`; `StorageKeys`) | — | self | exact |
| `mobile/lib/core/api/endpoints.dart` **(REFERENCE — already satisfied)** | config (duplicate `Endpoints.servers='/api/mobile/servers'` used by `DioClient`) | — | self | exact |
| `mobile/pubspec.yaml` **(MODIFY)** | config (add `drift`,`drift_flutter`,`sqlite3`,`sqlite3_flutter_libs`,`path`,`path_provider`,`ffigen`,`ffi`, fonts `Manrope`/`Unbounded`/`JetBrains Mono` or `google_fonts`; dev `drift_dev`; `build_runner`; keep `flutter_riverpod`/`riverpod_annotation`/`riverpod_generator`/`freezed`/`json_serializable`/`connectivity_plus`/`dio`/`go_router`/`mocktail`; sdk `^3.14.0`; sort) | file-I/O | self | exact |
| `mobile/lib/features/auth/screens/login_screen.dart` **(MODIFY)** | component (re-theme dark; keep auth + `context.go('/')` + `showErrorToast`; **min password 8** phase 18) | request-response | self + `theme.dart` | exact |
| `mobile/lib/features/auth/screens/register_screen.dart` **(MODIFY)** | component (re-theme dark; **min 8** not prototype 6) | request-response | self | exact |
| `mobile/lib/features/auth/screens/telegram_wait_screen.dart` **(MODIFY)** | component (re-theme dark; keep polling/`DeepLinkHandler`/`url_launcher`) | streaming | self | exact |
| `mobile/lib/features/auth/widgets/auth_form.dart` **(MODIFY)** | component (re-theme dark inputs/buttons; keep `GlobalKey<FormState>`, validation, min 8) | event-driven | self | exact |
| `mobile/lib/features/auth/widgets/error_toast.dart` **(MODIFY)** | service/component (re-theme; reuse for «Пинг обновлён»/«offline»/«Повторить»/«Нет активного ключа»/«Купить»/`Кеш пинга сброшен`; `scaffoldMessengerKey`; `errorToastProvider`) | event-driven | self | exact |
| `mobile/android/app/src/main/AndroidManifest.xml` **(MODIFY)** | config (`ACCESS_NETWORK_STATE`,`INTERNET`; libbox artifacts; no `BIND_VPN_SERVICE`/VPN perms — Phase 20) | file-I/O | self | exact |
| `mobile/android/app/src/main/jniLibs/<abi>/` **(NEW artifacts, CI; blocked in this env)** | native (C-shared `.so` `arm64-v8a`,`armeabi-v7a`; OpenJDK17+Android SDK; silent TCP fallback if absent) | file-I/O | **No analog**; RESEARCH §Platform wiring; `mobile/android/` | none |
| `mobile/android/app/libs/` **(NEW artifacts, alt; blocked)** | native (official gomobile `libbox.aar` alt to own shim; GPL-3.0 recorded) | file-I/O | **No analog** | none |
| `mobile/ios/Frameworks/` **(NEW artifacts)** | native (`Libbox.xcframework`/shim `.xcframework`, `arm64`, iOS 15+; `DynamicLibrary.process()`; no NetworkExtension for urltest-only) | file-I/O | **No analog**; `mobile/ios/` structure | none |
| `mobile/test/unit/features/servers/server_pool_providers_test.dart` **(NEW)** | test (`serverPoolProvider`/`pingCacheProvider`/`bestServerProvider`; per-tab; mock `dio`; `ProviderContainer` overrides) | streaming | `mobile/test/unit/core/auth/auth_notifier_test.dart` + `mobile/test/widget/features/auth/login_screen_test.dart` (mocktail) | role-match |
| `mobile/test/unit/core/ping/ping_repository_test.dart` **(NEW)** | test (urltest + silent fallback; quick-path ≤3 800 ms→best→full; full parallel 2000 ms concurrency; `approx`; cancel; fake `LibboxPingService` + fake `Socket`; timeouts) | streaming | `mobile/test/unit/core/connectivity/connectivity_service_test.dart` style | partial |
| `mobile/test/unit/core/ping/network_invalidation_test.dart` **(NEW)** | test (mock `ConnectivityService`; wifi↔mobile; skip-initial; cancel in-flight; clear `ping_cache`+last-good; keep selection) | event-driven | `mobile/test/unit/core/connectivity/connectivity_service_test.dart` | role-match |
| `mobile/test/unit/core/db/ping_cache_test.dart` **(NEW)** | test (Drift `NativeDatabase.memory()`; TTL 60 s fresh/stale; upsert; clear; last-good ≤5 dedupe) | CRUD | `mobile/test/unit/core/storage/token_store_test.dart` style | partial |
| `mobile/test/widget/features/servers/server_pool_screen_test.dart` **(NEW)** | test (widget; two tabs; list; auto card; connect; no bottom nav; no-key banner; dark theme; `Повторить`; «Пинг обновлён») | request-response | `mobile/test/widget/features/auth/login_screen_test.dart` | role-match |
| `mobile/test/widget/app/router_test.dart` **(NEW)** | test (no `NavigationBar`; `/shop`; auth routes preserved; `redirect`) | event-driven | `mobile/test/widget/features/auth/*` + `router.dart` | partial |
| `mobile/test/widget/app/theme_test.dart` **(NEW)** | test (dark tokens app-wide; ping colors; M3; auth re-theme) | transform | `mobile/test/widget/features/auth/*` | partial |
| `mobile/test/widget/features/auth/login_screen_test.dart` **(MODIFY)** | test (dark theme; keep phase-18 assertions; **min 8**) | request-response | self | exact |
| `mobile/test/widget/features/auth/register_screen_test.dart` **(MODIFY)** | test (dark theme; **min 8** not 6) | request-response | self | exact |

**Reused, NOT modified (Flutter):** `mobile/lib/core/api/dio_client.dart` `dioClientProvider`+`DioClient.create`+`AuthInterceptor` single-flight; `mobile/lib/core/api/auth_interceptor.dart`; `mobile/lib/core/auth/*` `AuthNotifier`/`AuthState`/`dioClientProvider`/`authNotifierProvider`; `mobile/lib/core/auth/auth_state.freezed.dart`; `mobile/lib/core/connectivity/connectivity_service.dart` `connectivityServiceProvider`+`.distinct()`; `mobile/lib/core/storage/secure_storage.dart` `SecureStorage.instance`; `mobile/lib/core/storage/token_store.dart` `tokenStoreProvider`; `mobile/lib/features/auth/providers.dart` `currentUserProvider`/`authStateProvider` + re-exports; `mobile/lib/models/auth_models.dart`; `mobile/lib/features/auth/widgets/error_toast.dart`; `mobile/lib/utils/logger.dart` `createLogger` (never log links/secrets); `mobile/build.yaml`; `mobile/analysis_options.yaml`. `connectivity_plus` already in `pubspec.yaml`. **`mobile/lib/app/constants.dart` `Endpoints.servers` + `mobile/lib/core/api/endpoints.dart` `Endpoints.servers` already declared.** `ConnectivityService` doc comment already says "for use by ping cache invalidation (Phase 19)". No simulation anywhere (replace prototype `Math.random`/`sleep`/fake IP/`load`/network-toggle).

---

## Pattern Assignments

### `app/api/mobile/servers/route.ts` (route / controller, request-response) — NEW

**Analog:** `app/api/mobile/subscription/route.ts` (+ `app/api/mobile/auth/login/route.ts`, `lib/mobile-auth.ts`)

**Imports + dynamic + JWT + try/catch** (`app/api/mobile/subscription/route.ts` lines 1-16, 48-52; `app/api/mobile/auth/login/route.ts` lines 3-12, 72-76):
```ts
// GET /api/mobile/subscription
import { NextRequest, NextResponse } from "next/server";
import { verifyAccessToken } from "@/lib/mobile-auth";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const started = Date.now();
  try {
    const claims = await verifyAccessToken(req);
    if (!claims) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    // ...
    logger.info({ route: "/api/mobile/subscription", userId: claims.userId, outcome: "success", durationMs: Date.now() - started });
    return NextResponse.json({ /* ... */ });
  } catch (err) {
    logger.error({ route: "/api/mobile/subscription", error: String(err), durationMs: Date.now() - started });
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
```
Phase-19 deviation: provider errors are **not** rethrown to 500 — D-22 returns `{ok:false,error:<code>,simple:[],whitelist:[],key}` + `200`/`403`, serves cached copy, `Retry-After` passthrough on `rate_limited`. Never log links/keys/`Authorization` (`lib/artemida.ts` lines 1-5; `lib/logger.ts` lines 1-4).

**`verifyAccessToken`** (`lib/mobile-auth.ts` lines 45-76): `Bearer`, `jose.jwtVerify(...{algorithms:["HS256"]})`, `payload.typ==="access"`, `uid`, credentials watermark (`credentialsChangedAt`); returns `{userId,telegramId}|null`; `env.SESSION_SECRET`.

**Active-key gate (D-21) + cache-first (D-22)** (`lib/keys-service.ts` lines 157-165, 55-65, 92-97, 273-319):
```ts
const keys = await listKeysByUserId(claims.userId);            // RenderedKey[]; KeyCache prisma.keyCache; STATUS_ORDER active→expiring→...
const active = keys.find(k =>
  k.keyId &&
  (k.statusKind === "active" || k.statusKind === "expiring") && // deriveStatusKind: expiry wins, NOT stored status; trial-expired→expired
  (!k.expiresAt || new Date(k.expiresAt).getTime() > Date.now()));
// no active → {ok:false,error:"no_active_key",simple:[],whitelist:[],key:null} status 403 (402 acceptable)
// key pill D-20: key.active; key.remainingDays ?? daysUntilExpiry(expiresAt); key.expireAt; key.isTrial
```
`deriveStatusKind` (`lib/keys-service.ts` lines 55-65): `remaining<=0→expired`, `remaining<=3d→expiring`, else `active`; `status` `pending/expired` only when no expiry. Ownership: `keyCache` filtered by `userId`; non-owned==missing (`lib/keys-service.ts` lines 284-288). `KeyCache` model `prisma/schema.prisma` lines 245-270 (`keyId`,`status`,`isTrial`,`expiresAt`,`subscriptionUrl`,`customerRef`,...). Trial key **is** active until `expireAt`; **trial cannot renew/upgrade**; `no_active_key` excludes trial-expired.

**Subscription-links source (D-01/D-22)** (`lib/artemida.ts` lines 679-682, 422-431; `lib/keys-service.ts` lines 273-319):
```ts
const links = await artemida.getSubscriptionLinks(keyId);      // GET /keys/{id}/subscription-links; server-to-server Bearer
// SubscriptionLinks { subscriptionUrl: string|null; links: string[] } ; normalizeSubscriptionLinks: links.length ? links : vless
// keyId scoped to owner before provider call; propagates ArtemidaError; mirrors subscriptionUrl guarded non-null; NOT /pricing
```
`artemida` (`lib/artemida.ts` line 752 `export const artemida = createArtemidaClient();`); `Authorization: Bearer ${env.ARTEMIDA_API_KEY}` + `Idempotency-Key` (lines 583-590); `force-dynamic`; `@/` alias. Contract `docs/artemida-v1-contract.md` `GET /keys/{id}/subscription-links` `data.{keyId,subscriptionUrl,fetchedAt,cached,count,vless[],links[],protocols}`; `links[]` strings; `count≠links.length`; `vless://placeholder` unparseable; `cached`; success `{ok,data,meta}`; **both error envelopes** `{ok:false,error:{code,message}}` + `{ok:false,error:"…"}`.

**Output (D-03/D-04/D-05/D-20):** `{ ok:true, simple: Server[], whitelist: Server[], key, stale }`. `Server = { id,name,city,cc,flag,proto,sni?,tab,host,port,protocol,outbound }`. **No `load`.** No raw `vless://`/secrets/`uuid`/`password`/`pbk`/`sid`/WG key in card list or logs; `outbound` minimal sing-box only. Errors → empty pools + `error` + toast + «Повторить» client-side; cached + offline toast.

---

### `lib/server-pool.ts` (utility, pure transform) — NEW

**Analog:** `lib/email-canonical.ts` + `lib/artemida.ts` tolerant normalizers. No in-repo share-link parser exists (sing-box has none; no new npm dep).

**Pure-module contract** (`lib/email-canonical.ts` lines 1-11):
```ts
// Pure module by design: no node:crypto, no env import, no next/headers, no DB
// — importable from vitest's node environment without a Next runtime. Never throws.
```
Phase-19: `parseShareLink`, `classifyPool`, `parseRemark`, `flagToCc`, `buildOutbound`, `parsePools`, `WL`. Skip unparseable (`vless://placeholder`); scheme allowlist `vless,ss,hysteria2,hy2,trojan,wg,wireguard,vmess`; **accept `hy2://`→Hysteria2, `wireguard://`+`wg://`→WireGuard** (D-01 names `wg://`; community is `wireguard://`; RESEARCH A7); length limits; no `eval`. Tolerant, never throw.

**Tolerant helpers** (`lib/artemida.ts` lines 343-357; `422-431`): `asString`, `asStringArray`, `asArray`; `normalizeSubscriptionLinks`. Reference `lib/artemida.ts` discipline (zod `.passthrough()`, normalize to internal model, branch on `code`).

**Pool classification (D-02):** case-insensitive remark scan `WL` (token-ish) / `whitelist` / `обход` → `whitelist`; else `simple`. If no marker: `scheme==="vless" && security==="reality"` → `whitelist`, else `simple`. Strip markers from display name. Research uses `/(?:\bWL\b|whitelist|обход)/i`. NOT SNI-allowlist (deferred); SNI display only.
```ts
const WL = /(?:\bWL\b|whitelist|обход)/i;
export function classifyPool(remark: string, scheme: string, security?: string): "simple" | "whitelist" {
  if (WL.test(remark)) return "whitelist";
  if (!WL.test(remark) && scheme === "vless" && security === "reality") return "whitelist";
  return "simple";
}
```

**Remark/flag parsing (D-03):** `name/city/cc/flag` from remark; emoji flag **regional-indicator pair U+1F1E6..U+1F1FF → cc** + remaining text `city`; `flag` reconstructed from `cc`; on failure `name=remark`, `city/cc/flag=""`, host shown secondary. Proto (D-03 verbatim): `WireGuard`,`Shadowsocks`,`VLESS`,`VLESS · Reality`,`Hysteria2`,`Trojan`,`VMess`. `sni`=`sni`/`serverName` query, **only for `whitelist`**, shown `SNI: domain`. `id` stable deterministic short hash (scheme+host+port+secret-fingerprint), **not** raw link. `host`/`port` for ping + TCP fallback; IPv6 `[host]`; Hysteria2 first-port; VMess `port` int-as-string→int. `buildOutbound` minimal sing-box outbound; **WireGuard 1.14 = `endpoint`, NOT outbound** (`endpoints[]`); **Reality needs `pbk/sid/sni/fp/flow`, `with_utls`**; not returned as raw link. **No `load`.**

Share formats (RESEARCH Critical Uncertainty #1, community specs; real ARTEMIDA payload `[ASSUMED]` re-verify on live paid key): `vless://uuid@host:port?params#remark`; `ss://base64url(method:password)@host:port#remark` + legacy whole-info base64 + SIP003; `hysteria2://password@host:port[,ports]?…#remark` (+`hy2`); `trojan://password@host:port?…#remark` (TLS default); `vmess://base64(JSON)` (`{v,ps,add,port,id,aid,scy,net,type,host,path,tls,sni,fp,alpn}`); `wg://privateKey@host:port?publickey=&address=&mtu=&reserved=#remark`. **sing-box 1.14 DNS NEW format** `dns.servers[{type:"local"…}]`. Minimal ping config `{log,dns,inbounds:[],endpoints,outbounds:[{direct}+tag "srv-<id>"],route}`. `sing-box` `CheckConfig`.

---

### `lib/servers-source.ts` (service, cache-first; D-22) — NEW, RESEARCH-recommended

**Analog:** `lib/keys-service.ts` cache-first `getSubscriptionForOwnedKey` + `lib/artemida.ts` `artemida` p-retry + `ArtemidaError`. No `links[]` column in `KeyCache`; `KeyCache` caches `subscriptionUrl` only (`prisma/schema.prisma` 245-270).

**Graceful degradation (D-22 + Pitfall 10):** cache-first `KeyCache` + ARTEMIDA `cached`; **do not call ARTEMIDA per request**; in-memory short-TTL `linksCache` keyed `keyId`; serve cached copy on provider error; `artemida` already retries `429/502/503` ×2 (`RETRYABLE` lines 59-63; pRetry lines 613-634; `parseRetryAfter` lines 115-125; `MAX_RETRY_AFTER_MS`).
```ts
// lib/artemida.ts lines 22-43
export type ArtemidaCode = "unauthorized"|"payment_required"|"conflict"|"rate_limited"|"bad_gateway"|"unavailable"|"not_found"|"unknown";
export class ArtemidaError extends Error { constructor(readonly code: ArtemidaCode, readonly status: number, readonly retryAfterSec?: number, readonly requestId?: string){ super(`artemida:${code}`); this.name="ArtemidaError"; } }
// map provider `unauthorized(401)/payment_required(402)/conflict(409)/rate_limited(429)/bad_gateway(502)/unavailable(503)/not_found(404)`; branch on `.code`, never provider text; `Retry-After` seconds|HTTP-date.
```
Handled codes D-22: `401/402/409/429/502/503` + `Retry-After`; both envelopes; `unauthorized→no_active_key`-safe; `rate_limited` may pass `Retry-After`; empty pools + `error`, not 5xx. Reuse `getSubscriptionForUserId(userId,keyId)` shape (`{subscriptionUrl,links,traffic}`) — ownership-checked — rather than re-implementing; research calls `artemida.getSubscriptionLinks` directly for raw links, note `getSubscriptionForUserId` **also fetches `getTraffic`** (not needed) and mirrors cache. **No secrets logged.**

---

### `mobile/lib/features/servers/server.dart` (model, freezed) — NEW

**Analog:** `mobile/lib/models/auth_models.dart`. Freezed 4.0.3 + json_serializable + `@JsonKey`.
```dart
import 'package:freezed_annotation/freezed_annotation.dart';
part 'server.freezed.dart';
part 'server.g.dart';

@freezed
abstract class User with _$User { const factory User({ required int id, @JsonKey(name:'telegramId') int? telegramId, String? email }) = _User; factory User.fromJson(Map<String,dynamic> json) => _$UserFromJson(json); }
```
Phase-19 `Server` (RESEARCH discretion; match backend D-03 + `outbound`): `{ id,name,city,cc,flag,proto,sni?,tab,host,port,protocol,outbound }`. `PoolTab{simple,whitelist}`. `ServerPools{simple,whitelist,key}`. `ServerKey{active,keyId,isTrial,remainingDays,expireAt}` D-20; no-key→«Нет ключа». No `load`. No raw link. `build_runner` + `build.yaml` generate_for `lib/features/**`. Closest skeleton also `mobile/lib/core/auth/auth_state.dart` (`@freezed sealed class`). No existing `Server`.

---

### `mobile/lib/features/servers/providers.dart` (provider) — NEW

**Analogs:** `mobile/lib/features/subscription/providers.dart`, `mobile/lib/features/home/providers.dart`, `mobile/lib/core/auth/auth_notifier.dart`, `mobile/lib/app/router.dart`. **Locked provider names (D-19/ROADMAP 19.11): `serverPoolProvider`, `pingCacheProvider`, `bestServerProvider`.**

**Riverpod 3.4.2 + riverpod_annotation** (`router.dart` lines 1-27 + `@riverpod` + `part 'router.g.dart';`; `build.yaml` `riverpod_generator generate_for lib/**/*.dart`):
```dart
@riverpod
GoRouter router(Ref ref) { return _createRouter(ref); }
```
Manual style (`features/subscription/providers.dart`): `Provider`, `FutureProvider.autoDispose`, `FutureProvider.family`, `ref.watch`. **`StateProvider` needs `package:flutter_riverpod/legacy.dart`** (`features/home/providers.dart` lines 1-7):
```dart
final currentTabProvider = StateProvider<int>((ref) => 0);
final homeScreenProvider = FutureProvider.autoDispose<Map<String,dynamic>>((ref) async { final user = ref.watch(currentUserProvider); ... });
```
**AsyncNotifier** (`auth_notifier.dart` lines 11-43): `AsyncNotifierProvider`, `ref.read(dioClientProvider)`, `state = AsyncData(...)`, `ref.invalidate`. `currentUserProvider` (`features/auth/providers.dart` lines 51-61). **`ref.invalidate(serverPoolProvider)`** for manual refresh + `.autoDispose`. 

Phase-19 shapes (RESEARCH Pattern M1, discretion on exact naming): `serverPoolProvider` FutureProvider → `dio.get(Endpoints.servers)` `/api/mobile/servers`; offline Drift `server_list_cache` fallback; `pingCacheProvider` Stream → Drift `watchFresh`; `bestServerProvider` derived `Server?` online-first RTT↑ (+`load`↑ deferred; **RTT-only** D-13); `currentTabProvider`→`PoolTab` persisted (research `current_tab`; **repurposed, no longer bottom-nav int** D-15); `selection` per-tab persisted; last-good per-tab ≤5 dedupe; quick-path; network invalidation. Connect (D-18): `connect(mode)` selection only → quick-path→full→highlight; auto→best; all-offline→«Нет доступных серверов. Попробуй другой таб»+«Повторить»+suggest tab; no key→blocked + «Нет активного ключа»+«Купить»; **no tunnel/simulation**; pushFront last-good; **not** `core.start`. 

**HTTP** (`dio_client.dart`, `endpoints.dart`, `auth_interceptor.dart`): `dio.get(Endpoints.servers)`; `Endpoints.servers='/api/mobile/servers'`; base `apiBaseUrl` `https://dash.3set.online` (`app/constants.dart` + `core/api/endpoints.dart`); `AuthInterceptor` `Bearer` + single-flight refresh; `DioException`. `Endpoints.subscription`. ARTEMIDA never called from client.

**Connectivity invalidation (D-11; `connectivity_service.dart`, `app/constants.dart` `ConnectivityConfig.debounceDuration=500ms`; Pitfall 9; re-export `connectivityServiceProvider` `features/auth/providers.dart`):**
```dart
// existing service: Connectivity().onConnectivityChanged.distinct() → broadcast `connectivityStream`; `_updateStatus` emits once at startup
// phase-19 listener (RESEARCH):
connectivityService.connectivityStream.skip(1).listen((_) async {
  cancelInflight();                 // generation token
  await db.pingCache.deleteAll();   // clear ping_cache
  await clearLastGood();            // clear last_good
  // keep selection + current_tab; NOT network-simulated; re-ping; skip initial emission; debounce 500ms
});
```
`ConnectivityService` already notes "for use by ping cache invalidation (Phase 19)"; `.distinct()`. **Read-only network chip; no manual simulation** D-11. Karing bug (urltest doesn't survive network change → invalidate + re-ping).

---

### `mobile/lib/features/servers/server_pool_screen.dart` + widgets (component, ConsumerWidget) — NEW

**Analog:** `mobile/lib/features/auth/screens/login_screen.dart` + `router.dart` `_HomeScreen` + `mobile/lib/features/auth/widgets/*` + **canonical prototype `.planning/seeds/prototype-mobile-client.html` (#screen-main)** + `SEED-001`. `ConsumerWidget`/`ConsumerStatefulWidget`, `ref.watch`, `Theme.of(context)`, `showErrorToast`, `context.go`. Phase-18 route builders `const LoginScreen()` etc.

Full prototype layout D-15 (no bottom nav): header + key pill + net chip + refresh + shop + logic + avatar + greeting + status pill + date; banner; two segmented tabs; toolbar `modeDesc` + read-only net chip + refresh; scrollable list «Автовыбор» first + server cards; `pingClass`; `последний`; **no load bar**; conn-panel + «Подключить» (selection only; IP/timer/traffic Phase 20, NOT simulated; hint); profile/logic sheets stub; shop stub. Russian copy D-17 + prototype: «Простой VPN»,«Обход белых списков»,«Автовыбор»,«Выберу самый быстрый сервер»,«Подключить»,«мс»,«офлайн»,«нет ответа»,«Пинг обновлён»,«Нет активного ключа»,«Купить»,«Ключ неактивен — серверы недоступны»,«Ключ истёк»,«Нет ключа»,«Повторить»,«SNI: …»,«Лучший: …»,«последний». `pingClass(rtt,online)`: `!online→bad`, `<=60 good`,`<=110 mid`,`<=180 warn`,`else bad`. `modeDesc` simple/whitelist. Toasts via `errorToast`. 

---

### `mobile/lib/core/ping/*` (service + model + FFI) — NEW

**Analog:** `mobile/lib/core/connectivity/connectivity_service.dart` + `dio_client.dart`; **no ping/sing-box analog in repo**; RESEARCH §Critical Uncertainty #2/#4 + sing-box v1.14.4 facts; silent `Socket.connect` fallback mandatory so absence of native artifact still ships (D-07).

**Ping = `libbox.urltest`, NOT ICMP** D-06. Honest mapping (corrects locked `libbox.urltest(...)` wording; RESEARCH §libbox reality check): real symbol **`func (c *CommandClient) URLTest(outboundTag string) error`** — **returns only `error`, NOT RTT**; RTT async via `CommandClientHandler.WriteGroups` → `OutboundGroupItem.URLTestDelay int32 ms`,`URLTestTime int64`,`CommandGroup=2`, no history→`0,0`, failed→cleared→`0,0`. `URLTest` `link==""`→`https://www.gstatic.com/generate_204`; requires `ServiceStatus_STARTED`; finds outbound by tag, **falls back to endpoint**. Phase-19 needs `libbox.Setup` + `CommandServer.StartOrReloadService(minimal no-TUN config)` + `CommandClient.URLTest`; no VPN. `outboundTag` `srv-<id>`; generate_204 URL + tag name **agent discretion**. **No official Flutter libbox package; no exported C `libbox_urltest`; gomobile `.aar`/`.xcframework` is NOT C-ABI; `sing-ffi` `_new` needs non-public tool (#4016)** → **own minimal C-shared Go shim + `ffigen`** (recommended; satisfies D-08). 

`PingResult` (freezed; not persisted raw): `{ online, rttMs?, approx, tsMs }`. **`approx`=true on TCP fallback; `approx=false` on urltest; silent, NO UI** D-07.

**Timeouts/parallelism D-09:** quick-path ≤3 last-good **800 ms** parallel; full ping all-in-tab **2000 ms** concurrency **10–16**, per-result + final UI update; prototype manual 1500 ms; `Future.wait` bounded pool; `Duration`. 

**Silent TCP fallback D-07** (RESEARCH §Ping; **no analog**):
```dart
final sw = Stopwatch()..start();
final socket = await Socket.connect(host, port, timeout: timeout); // SocketException on refuse/timeout
sw.stop(); socket.destroy(); // measure CONNECT; RTT = sw.elapsedMilliseconds
// strip [] IPv6; InternetAddress.tryParse; port int.tryParse; on SocketException/TimeoutException → online=false; approx=true; NOT exposed in UI
```
Honest gap: TCP-ok ≠ VPN creds valid; can't distinguish RST vs drop; **UDP-only (Hysteria2 QUIC/UDP, WireGuard UDP, SS-UDP) → offline when libbox absent**; can't measure through-proxy/TLS/Reality handshake; whitelist reliability needs libbox. Fallback only when libbox unavailable (not initialized/platform/build) or urltest failed for that server. **No `Math.random`, no fake IP, no `sleep`, no `load`.**

**`LibboxPingCore` singleton; serialize urltests; `init`/`start(configJson)`/`stop`/`urltest(tag,timeout)`/`dispose`; `CheckConfig`; never log config (secrets).** `PingRepository.pingServer(Server, timeout)`: libbox-first, silent `Socket.connect` fallback. `pingClass`. `cancelInflight` generation token. 

**`ffigen` `^23.0.0`, `ffi`, `dart run ffigen --config ffigen.yaml`.** Generated `libbox_bindings.dart`. **`DynamicLibrary`** (`DynamicLibrary.open` Android `.so`, `DynamicLibrary.process()` iOS linked-in, `DynamicLibrary.executable()`); `calloc`, `Utf8`. `ffigen` strict lints; generated excluded in `analysis_options`. 

**Own C-shared shim** (RESEARCH verbatim skeleton; `package main`, no `gomobile`, `go build -buildmode=c-shared`, per-ABI `CC=<abi-clang>`, `CGO_ENABLED=1`): `libbox_setup`,`libbox_check_config`,`libbox_start`,`libbox_stop`,`libbox_urltest`,`libbox_urltest_take`,`libbox_free_string`; `func main(){}`. **sing-box v1.14.4** `github.com/sagernet/sing-box/experimental/libbox`; build tags `with_gvisor,with_quic,with_wireguard,with_utls,with_naive_outbound,with_clash_api,badlinkname,tfogo_checklinkname0`; `-ldflags "-X github.com/sagernet/sing-box/constant.Version=… -s -w -buildid= -checklinkname=0"`; **`with_utls` required for Reality**; `-X` version. `libbox.Setup(SetupOptions{BasePath,WorkingPath,TempPath,…})`,`CheckConfig`,`Version`,`NewCommandServer(noop PlatformInterface)`,`StartOrReloadService`,`NewStandaloneCommandClient`/`NewCommandClient`,`AddCommand(CommandGroup)`,`Connect`,`Close`. **Go 1.24+** (env 1.26.3). **GPL-3.0-or-later recorded blocker (not solved here); Phase 23; dynamic linking + source offer + legal review; NOT a C-ABI/MPL swap.** 

**Platform wiring D-08:** Android `arm64-v8a`,`armeabi-v7a`, `jniLibs`/`libbox.aar`, minSdk 24, OpenJDK17+Android SDK (**blocked in this env: no JDK; silent TCP fallback**), `ACCESS_NETWORK_STATE`/`INTERNET`, no `BIND_VPN_SERVICE` (Phase 20); iOS `arm64`,`Libbox.xcframework`,iOS 15+,no NetworkExtension for urltest-only (external entitlement blocker); `Flutter SPM`/CI `pod`. **Android build blocked here; iOS builds (Phase 18 verified).** 

---

### `mobile/lib/core/db/*` (store, CRUD + streaming) — NEW

**Analog:** `mobile/lib/core/storage/secure_storage.dart` + `token_store.dart` persistence style + Riverpod provider + `connectivity_service.dart`. **No Drift in repo yet.** RESEARCH §Drift `ping_cache`. `drift ^2.35.4`,`drift_flutter ^0.3.1`,`sqlite3`,`sqlite3_flutter_libs`,`path`,`path_provider`, dev `drift_dev`,`build_runner`, `dart run build_runner build`. `NativeDatabase.memory()` tests. `.g.dart`. `mobile/build.yaml` generated excluded. 

`@DriftDatabase(tables:[PingCache,LastGood,Selection,CurrentTab,ServerListCache])`, `driftDatabase(name:…)`, `appDatabaseProvider`. 

**`ping_cache` table D-10/REQ-PING-04** (research verbatim): `server_id, tab, rtt, online, ts` (+`approx`); PK `{serverId,tab}`; `tab 'simple'|'whitelist'`; `rtt` nullable; `ts` epoch ms; **TTL 60 s `fresh = ts >= now-60000`**; fresh/stale; re-ping after expiry or manual or network change.
```dart
class PingCache extends Table {
  TextColumn get serverId => text()();
  TextColumn get tab => text()();
  IntColumn get rtt => integer().nullable()();
  BoolColumn get online => boolean()();
  IntColumn get ts => integer()();
  BoolColumn get approx => boolean().withDefault(const Constant(false))();
  @override Set<Column> get primaryKey => {serverId, tab};
}
```
`PingCacheDao`: `upsert`,`watchFresh`,`isFresh`,`clear`,`markOnline`,`clearLastGood`, selection persist. **Clear `ping_cache` + `last_good` on network change; keep `selection`/`current_tab`.** `last_good(tab,server_id,ts)` **≤5 dedupe per-tab** D-12; `selection(tab,server_id)` D-13/D-14 per-tab persist; `current_tab` D-14; `server_list_cache` offline list D-10. Last-good = «последний» chip on most recent successful server (not requiring connected) REQ-PING-07; quick-path picks last-good. **Drift cache separate from backend `KeyCache` + local server-list cache; connection requires core (Phase 20).** 

---

### `mobile/lib/app/router.dart` (route/config; MODIFY)

**Analog:** self. Keep `@riverpod router`,`_createRouter`,`ValueNotifier authRefresh`,`ref.listen(authNotifierProvider)`,`ref.onDispose`,`refreshListenable`, `redirect`, `isAuthRoute`, `context.go('/auth')`,`context.go('/')`, logout `authNotifierProviderForUI`. Keep `/auth`,`/register`,`/telegram-wait` + auth widgets + `redirect`. Replace `_HomeScreen`→`const ServerPoolScreen()`. **Remove `bottomNavigationBar NavigationBar` + `currentTabProvider` int wiring + `_HomeContent`.** `NavigationBar`→nothing. `currentTabProvider`→pool tab. Add `GoRoute(path:'/shop',name:'shop',builder:(_,__)=>const ShopScreen())`. Profile/logic **sheets** (stubs) not routes. `deepLinkHandlerProvider`/`resumeBiometricGateProvider` app-level (`main.dart`). **`currentTabProvider` also still exported from `features/home`** (repurposed). Phase-18 router widget tests updated. 

---

### `mobile/lib/app/theme.dart` (config; MODIFY) — dark prototype app-wide D-16

**Analog:** self + prototype `:root`. Keep `ThemeData(useMaterial3:true)`, `ColorScheme`, `AppBarTheme`, `CardThemeData`, `ElevatedButtonThemeData`, `OutlinedButtonThemeData`, `TextButtonThemeData`, `InputDecorationTheme`, `TextTheme`, `SnackBarThemeData`, `DividerThemeData`, `NavigationBarThemeData`(legacy; no nav now). Current light `_primaryColor #2563EB`,`_secondaryColor #059669`,`_errorColor #DC2626`,`_surfaceColor #FFFFFF`,`_backgroundColor #F8FAFC`. Replace **`AppTheme.dark`** (remove `ThemeMode.system`; `AppTheme.light` retained but unused/light toggle deferred). 

Verbatim prototype palette: `--bg #0e1512`,`--bg2 #0b110e`,`--surface #131c16`,`--surface2 #182419`,`--surface3 #1d2b1f`,`--line rgba(183,255,69,.14)`,`--line2 rgba(183,255,69,.3)`,`--lime #b7ff45`,`--lime2 #d4ff85`,`--lime3 #7fd41f`,`--teal #3ee6b0`,`--amber #ffc24b`,`--red #ff6b6b`,`--blue #2aabee`,`--text #f2f7ec`,`--muted #a7b8a9`,`--dim #6f8272`,`--grad linear-gradient(135deg,#d4ff85,#7fd41f)`,`--grad-teal linear-gradient(135deg,#8ffbe0,#1fbf8f)`,`--r 18px`. Fonts **Manrope Variable, Unbounded Variable, JetBrains Mono Variable**. Buttons primary(`--grad`)/ghost/danger. Ping colors good/mid/warn/bad/offline; **no load colors** (D-04). `scaffoldBackgroundColor`,`ColorScheme.dark(primary:lime,secondary:teal,error:red,surface,onPrimary,onSurface,…)`,`cardTheme`,`appBarTheme`,buttons,`snackBarTheme`,`inputDecorationTheme`. Re-theme phase-18 auth. **Not a "templated default" palette.** (Prototype artifacts NOT copied: `Math.random` ping,`sleep`,fake IP,localStorage,hardcoded servers,`load` bar,network-toggle,prototype min-password-6 → **min 8**.) 

**`main.dart` (MODIFY):** `theme=AppTheme.dark`,`darkTheme=AppTheme.dark`,`themeMode=ThemeMode.dark`. 

---

### `mobile/pubspec.yaml` (config; MODIFY)

**Analog:** self. Add `drift`,`drift_flutter`,`sqlite3`,`sqlite3_flutter_libs`,`path`,`path_provider`,`ffigen`,`ffi`, fonts (`google_fonts` or bundled assets + `flutter.fonts`; discretion; offline-safe bundled recommended); dev `drift_dev`. Keep `connectivity_plus`,`flutter_secure_storage`,`dio`,`go_router`,`flutter_riverpod`,`riverpod_annotation`,`freezed_annotation`,`json_annotation`,`app_links`,`logger`,`url_launcher`,`local_auth`,`jwt_decoder`,`cupertino_icons`,`build_runner`,`freezed`,`json_serializable`,`riverpod_generator`,`mocktail`,`flutter_lints`,`integration_test`. `sort_pub_dependencies`. `uses-material-design`. `dart run build_runner build --delete-conflicting-outputs`. **No new backend npm dep.** (libbox shim = own Go; native artifacts vendored/CI; `sqlite3_flutter_libs` EOL-current; GPL-3.0 recorded.) 

---

### Auth screens re-themed (MODIFY) D-16

**Analog:** self + `app/theme.dart`. `LoginScreen` (`ConsumerStatefulWidget`,`_isLoading`,`authNotifier.login`,`context.go('/')`,`showErrorToast`,`mounted`; **min 8**), `RegisterScreen`, `TelegramWaitScreen` (poll/`DeepLinkHandler`/`url_launcher`/`context.go('/')`; `mounted`/`context.mounted`), `AuthForm` (`GlobalKey<FormState>`,`TextEditingController`,`dispose`,`_obscure*`,`onSubmit`,`submitLabel`,`toggleLabel`; **min 8** not prototype 6), `errorToast` `ErrorToastService`(`scaffoldMessengerKey`,`colorScheme.error/onError`,`SnackBar`,`SnackBarAction`,`errorToastProvider`,`showErrorToast`/`showSuccessToast`). Keep `Theme.of`, strict lints, `always_declare_return_types`,`public_member_api_docs`. 

**Tests re-themed:** `mobile/test/widget/features/auth/login_screen_test.dart` + `register_screen_test.dart` (mocktail `MockDioClient`/`MockDio`/`MockResponse`/`MockTokenStore`,`registerFallbackValue`,`ProviderContainer(overrides:[dioClientProvider.overrideWithValue,tokenStoreProvider.overrideWithValue])`,`TestWidgetsFlutterBinding.ensureInitialized`,`pumpWidget`,`pump`,`find`,`expect`); **min-8** assertions. 

---

## Shared Patterns (cross-cutting; apply to all relevant plans)

### Authentication / key gating
**Source:** `lib/mobile-auth.ts` (`verifyAccessToken`, HS256 `jose`,`typ:"access"`,`uid`,`tid`,15m/30d, credentials watermark `credentialsChangedAt`, never log `Authorization`); `lib/keys-service.ts` (`listKeysByUserId`,`deriveStatusKind`,`daysUntilExpiry`, ownership `userId`==`keyCache.userId`, trial-expired excluded); mobile `mobile/lib/core/api/auth_interceptor.dart` (`Bearer`, single-flight refresh, `AuthInterceptor`, `tokenStoreProvider`); `mobile/lib/core/auth/auth_notifier.dart` (`authNotifierProvider`,`authStateProvider`,`currentUserProvider`,`dioClientProvider`,`AsyncNotifier`). **Apply to:** `app/api/mobile/servers/route.ts`, `lib/servers-source.ts`, `serverPoolProvider`, `features/auth/*`. **D-21 `no_active_key` 403/402 + empty pools + blocked UI;** **D-22 cache-first, no per-request ARTEMIDA, `Retry-After`, both envelopes.** 

### ARTEMIDA client (server-to-server only)
**Source:** `lib/artemida.ts` `artemida`+`createArtemidaClient`,`getSubscriptionLinks`,`listKeys`,`ArtemidaError`,`ArtemidaCode`,`RETRYABLE`,p-retry `429/502/503`×2,`parseRetryAfter`,`MAX_RETRY_AFTER_MS`,`normalizeSubscriptionLinks`,`asString/asStringArray/asArray`,`mapStatus`,`Idempotency-Key`,`Bearer`,`force-dynamic`; `docs/artemida-v1-contract.md` (401/402/409/429/502/503+`Retry-After`,`X-RateLimit-Policy`,both envelopes,server-to-server 501 CORS,no secrets). **Apply to:** backend only. **Client never calls ARTEMIDA; `Endpoints.servers`→our BFF.** **No `/pricing` (D-01); no `getKeyWithLinks` (doesn't exist); no `load` (D-04); `getSubscriptionForUserId` not `getKeyWithLinks`.** 

### Pure transform modules + tolerant parsing
**Source:** `lib/email-canonical.ts`; `lib/artemida.ts` normalizers (zod `.passthrough()`,`asArray`,`asStringArray`,never-throw tolerant). **Apply to:** `lib/server-pool.ts`. **Skip unparseable; scheme allowlist; no raw link returned; stable id hash; no secrets.** 

### Error handling / graceful degradation
**Backend:** `try/catch`→`NextResponse.json`; `logger.error` (no secrets); `ArtemidaError.code`; **D-22 provider error→empty pools + `error`, not 5xx; cached + toast; `Retry-After`.** **Flutter:** `DioException`; `AsyncValue.when(data/loading/error)`; `ref.invalidate` `Повторить`; `showErrorToast`; silent `approx` fallback (no UI); **no simulation.** **`pingClass`** offline→`офлайн`+`нет ответа`. 

### Logging (no secrets)
**Source:** `lib/logger.ts` pino; `lib/artemida.ts` header; mobile `createLogger`. **Apply to:** all. **Never log raw subscription links, `vless://…`,`uuid`,`password`,`pbk`,`sid`,WG keys,`ARTEMIDA_API_KEY`,JWT,`Authorization`,sing-box config; log ids/outcomes; `X-Request-Id`.** No secrets in repo. 

### Code generation
**Backend:** zod; Prisma `npx prisma validate`. **Flutter:** freezed+`@JsonKey`+json_serializable+riverpod_generator+`@riverpod`+Drift+ffigen; `build_runner`; `part '*.g.dart'/'*.freezed.dart'`; `mobile/build.yaml` generate_for; generated excluded in `analysis_options`; `dart run build_runner build --delete-conflicting-outputs`. 

### Riverpod wiring
**Source:** `features/subscription/providers.dart`,`features/home/providers.dart`,`auth_notifier.dart`,`router.dart`. `Provider`/`FutureProvider.autoDispose`/`.family`/`AsyncNotifier`/`StateProvider`(legacy)/`@riverpod`; `ref.watch`/`ref.read`/`ref.listen`/`ref.invalidate`; `overrideWithValue`; `ProviderContainer`. Locked names `serverPoolProvider`,`pingCacheProvider`,`bestServerProvider`. 

### Network change invalidation
**Source:** `mobile/lib/core/connectivity/connectivity_service.dart` (`connectivity_plus`,`.distinct()`,broadcast,`connectivityServiceProvider`,`ConnectivityConfig.debounceDuration=500ms`,`connectivityStream`, note Phase-19); `app/constants.dart`. `.distinct`, `.skip(1)`, cancel in-flight (generation token), clear `ping_cache`+`last_good`, keep `selection`/`current_tab`, debounce 500 ms, re-ping, read-only chip, no simulation, skip initial. 

### Dark theme / UI
**Source:** `app/theme.dart`, prototype `:root`, `main.dart`, auth widgets. `AppTheme.dark` app-wide M3; verbatim palette; fonts; `ThemeMode.dark`; re-theme auth; `Theme.of`; Russian copy D-17 + prototype; `showErrorToast`. 

### Reuse note
`Endpoints.servers` already in `mobile/lib/app/constants.dart` + `mobile/lib/core/api/endpoints.dart`; `apiBaseUrl`; `currentTabProvider` (repurposed). `prisma` singleton; `logger`. 

---

## No Analog Found

Files with no close match in the repo (planner should use RESEARCH.md patterns + canonical prototype + CONTEXT instead of an existing in-repo excerpt). Role-match fallbacks noted in Pattern Assignments.

| File | Role | Data Flow | Reason / Fallback |
|------|------|-----------|-------------------|
| `lib/server-pool.ts` (core) | utility | transform | No share-URI parser in repo; sing-box has none; hand-rolled `parseShareLink`. Closest style `lib/email-canonical.ts` + `lib/artemida.ts` normalizers. |
| `lib/servers-source.ts` | service | request-response | Not yet present (RESEARCH-recommended wrapper); closest `lib/keys-service.ts` cache-first + `artemida`. No `links[]` KeyCache column; in-memory `linksCache`. |
| `mobile/lib/core/ping/ping_repository.dart` | service | streaming | No ping layer in repo; RESEARCH §Ping snippet; service style `connectivity_service.dart`. |
| `mobile/lib/core/ping/libbox_ping_service.dart` | service | request-response | No libbox; sing-box facts in RESEARCH; honest `URLTest(tag)`+`WriteGroups`, no `libbox_urltest`. |
| `mobile/lib/core/ping/socket_ping_service.dart` | service | request-response | No `dart:io` sockets in repo; RESEARCH §Fallback snippet; `approx` silent. |
| `mobile/lib/core/ping/libbox_core.dart` | service | event-driven | No FFI/native in repo; own C-shared shim; `Setup`+`StartOrReloadService`+`URLTest`; no TUN. |
| `mobile/lib/core/ping/generated/libbox_bindings.dart` | generated | transform | ffigen output; no existing generated FFI; `package:ffi`. |
| `mobile/native/libbox_shim/main.go` (+`go.mod`) | native | event-driven | No Go in repo; RESEARCH verbatim shim; `go build -buildmode=c-shared`; sing-box v1.14.4; GPL-3.0 recorded. |
| `mobile/lib/core/db/app_database.dart`, `tables.dart`, `ping_cache_dao.dart` | store | CRUD/streaming | No Drift yet; RESEARCH Drift snippet; persistence style `secure_storage`/`token_store`. `NativeDatabase.memory()`. |
| `mobile/lib/features/servers/*`, `mobile/lib/features/shop/shop_screen.dart` | component | request-response/streaming | No `features/servers` yet; prototype `#screen-main`; widget style `features/auth/widgets`. |
| `mobile/android/...jniLibs`, `libs`, `mobile/ios/Frameworks` | native artifact | file-I/O | No prebuilt libbox; **Android blocked (no JDK); silent TCP fallback**; iOS builds; CI; GPL-3.0. |

*(Not truly "no analog": `app/api/mobile/servers/route.ts`,`router.dart`,`theme.dart`,`main.dart`,`pubspec.yaml`,`login/register/telegram-wait`,`error_toast`,`providers.dart`,`home/providers`,`auth_models`,`connectivity_service`,`dio/endpoints/interceptor`,`constants`,`build.yaml`,`analysis_options`,tests have strong in-repo analogs — see tables.)*

---

## Metadata

**Analog search scope:** `app/api/mobile/**`, `app/api/**`, `lib/**`, `prisma/schema.prisma`, `docs/**`, `tests/**`, `tests/helpers`, `mobile/lib/**`, `mobile/test/**`, `mobile/pubspec.yaml`, `mobile/build.yaml`, `mobile/analysis_options.yaml`, `mobile/android`, `mobile/ios`, `.planning/seeds/**`, `.planning/research/**`, `.planning/ROADMAP.md`, `node_modules/next/dist/docs`, Next 16.3.7 / Flutter 3.50.1 / Dart 3.14 docs cross-ref. **No `.claude/skills` / `.agents/skills`.** **No gitignored mirrors; all analogs `git ls-files`-tracked.** 

**Reuse-first:** backend reuse `verifyAccessToken`+`keys-service`+`artemida`+`logger`+`prisma`; Flutter reuse `DioClient`/`AuthInterceptor`/`auth_notifier`/`ConnectivityService`/`SecureStorage`/`TokenStore`/`error_toast`/`Endpoints`/`build.yaml`/strict lints. **Only net-new code: one backend route + `lib/server-pool.ts` (+ recommended `lib/servers-source.ts`) + `features/servers` + `core/ping` + `core/db` + libbox shim/ffigen + dark-theme rewrite + `/shop`.** No simulation; no `load`; no secrets; no raw links. 

**Files scanned:** ~120 repo sources incl. all `app/api/mobile`, `lib`, `mobile/lib`, `mobile/test`, `prisma`, `docs`, `tests`, seeds. **Pattern extraction date:** 2026-11-27.

**Known blockers (recorded; not re-solved; per CONTEXT/RESEARCH):** Android build blocked in this env (no JDK/Android SDK; `/usr/bin/java` stub; `pod` not on PATH) → **silent `Socket.connect` TCP fallback** ships; **GPL-3.0-or-later sing-box/libbox legal review** (Phase 23; dynamic linking + source offer); **Apple NetworkExtension entitlement** (Phase 20; not needed urltest-only); **no live ARTEMIDA key in env** (`vless://placeholder`; real `links[]` `[ASSUMED]` re-verify on paid key + snapshot fixtures; `count≠links.length`; `hy2`/`wireguard`/`.conf` tolerant); sing-box **WireGuard endpoint** + **1.14 DNS**; **`URLTest` async RTT**; **own C-shared shim not gomobile/sing-ffi**. 

**REQ reconciliation (per RESEARCH):** REQ-POOL-02 `load` not sent; REQ-POOL-04 **deferred**; REQ-PING-06 `load` tie-break deferred (RTT-only); REQ-BE-02 `/pricing`→**subscription-links** (D-01); REQ-PING-07 «последний» not requiring connected; **no `load`, no simulation, no secrets.** 

**Validation (per AGENTS/GSD):** `npx tsc --noEmit`, `npx vitest run`, `npx prisma validate`, `flutter analyze`, `flutter test`, `dart run build_runner build`, `flutter pub get`. 

---

*Phase 19 pattern map · read-only · only `19-PATTERNS.md` written.*
