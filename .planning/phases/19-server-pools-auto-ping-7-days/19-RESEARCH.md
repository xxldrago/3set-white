# Phase 19: Server Pools & Auto-Ping (7 days) - Research

**Researched:** 2026-11-27
**Domain:** Flutter 3.50.1 / Dart 3.14 mobile + Next.js 16.3.7 BFF route; sing-box **libbox v1.14.4** FFI (`urltest`); share-URI parsing → two server pools; Drift (SQLite) `ping_cache` TTL 60 s; `connectivity_plus` network invalidation; Riverpod 3.4.2.
**Confidence:** HIGH for backend contract + in-repo reuse + sing-box source-level facts + pub.dev versions; MEDIUM for share-link per-protocol parameter coverage (community specs, ARTEMIDA real payload unobservable in this env); the **actual `links[]` contents of a live ARTEMIDA key are `[ASSUMED]`** (no live key; probe key emits placeholders).

Provenance tags follow the agent contract: `[VERIFIED: path:lines]` (read source-of-truth this session + verbatim quote), `[CITED: url]`, `[ASSUMED]`. In-repo discrete values are quoted verbatim.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
*(copied verbatim from `19-CONTEXT.md` `<decisions>`; phase boundary restated below.)*

**Phase boundary (domain, verbatim):** Два серверных пула с бэкенда, живой пинг, быстрый выбор по last-good, кеш с TTL 60 с и инвалидация при смене сети.
В фазе 19:
- Новый бэкенд-эндпоинт `GET /api/mobile/servers` (`app/api/mobile/servers/route.ts`), защищённый JWT и требующий активный ключ, возвращающий `{simple: [], whitelist: []}`.
- Парсинг ARTEMIDA subscription-ссылок в серверную модель.
- Flutter-экран с полным макетом прототипа (два сегментированных таба, список серверов, шапка, кнопка «Подключить»).
- libbox FFI-каркас + `libbox.urltest`, Dart TCP-fallback.
- Drift `ping_cache`, quick-path last-good, full ping, best-server, инвалидация при смене сети, ручное обновление.
- Тёмная тема прототипа на всё приложение.
- Riverpod-провайдеры `serverPoolProvider`, `pingCacheProvider`, `bestServerProvider`.
Не в фазе 19 (отложено):
- Сам туннель, Connection FSM, kill switch, реконнект — фаза 20. Кнопка «Подключить» лишь выбирает сервер.
- Магазин покупки ключа — фаза 21. Кнопка «Купить»/магазин — заглушка.
- Профиль, устройства, подписка `/subscription.keys` — фаза 21. Профиль-шторка — заглушка.
- load-бар — до появления реальной метрики (REQ-POOL-04 отложена).
- «Как это работает» — можно заполнить текстом из прототипа, но это не ядро фазы.

### Источник серверов и состав пулов
- **D-01:** `/api/mobile/servers` не использует ARTEMIDA `/pricing`. Источник — `lib/keys-service.ts` → `artemida.getSubscriptionLinks(keyId)`, парсинг `vless://`, `ss://`, `hysteria2://`, `trojan://`, `wg://`, `vmess://` в серверную модель. — **Reversibility:** costly — определяет контракт `/servers`, поля и маппинг пулов; клиент и тесты завязаны на него.
- **D-02:** Деление на пулы **по remark** (имени ссылки). Если remark содержит `WL`, `whitelist` или `обход` (без учёта регистра) → `whitelist`. Иначе `simple`. Если метки нет — fallback на протокол: `VLESS + Reality` → `whitelist`, всё остальное → `simple`. — **Reversibility:** reversible — маппинг на бэкенде, можно перенести в конфиг.
- **D-03:** Поля карточки: `id, name, city, cc, flag, proto, sni?, tab`. `name/city/cc/flag` парсятся из remark: emoji-флаг + текст города; без успеха `name` = remark, `city/cc/flag` пустые, host показывается вторичной строкой. `proto` = схема + подпротокол из ссылки (`WireGuard`, `Shadowsocks`, `VLESS`, `VLESS · Reality`, `Hysteria2`, `Trojan`, `VMess`). `sni` = query `sni`/`serverName`, только для `whitelist`, показывается «SNI: domain». — **Reversibility:** reversible.
- **D-04:** `load` **не отдаётся и не показывается** до появления реальной метрики нагрузки. Запрещена симуляция. REQ-POOL-04 отложена. Сортировка Автовыбора тогда только по RTT. При появлении реального `load` — добавить поле и tie-break RTT→load. — **Reversibility:** reversible.
- **D-05:** Конфиги/секреты outbound **не возвращаются в списке** для UI-карточек. Бэкенд хранит сырые ссылки/конфиги на сервере; клиенту отдаются метаданные + (для пинга/подключения через libbox) минимальные параметры outbound. Никогда не логировать и не коммитить ссылки. — **Reversibility:** reversible — секреты остаются на бэкенде; что отдавать клиенту решает бэкенд.

### Метод пинга и кеш
- **D-06:** Пинг = `libbox.urltest`, HTTP-проверка через реальный outbound, не ICMP. Основной путь. — **Reversibility:** costly — нативная сборка + FFI; есть fallback.
- **D-07:** Fallback, если libbox недоступен (не инициализировался / платформа / сборка) или urltest для сервера упал: Dart `Socket.connect(host, port)` с таймаутом. Результат — реальный TCP RTT, помечается внутри как `approx`. **Молча, без индикации в UI.** — **Reversibility:** reversible.
- **D-08:** `libbox` FFI-каркас: sing-box под Android `arm64-v8a`, `armeabi-v7a` и iOS `arm64`, `ffigen`-биндинги, `libbox.urltest(...)` вызываем. — **Reversibility:** costly — нативные артефакты + сборка; можно остаться на HTTP-fallback.
- **D-09:** Таймауты/параллелизм: quick-path ≤3 last-good, 800 мс; full ping все в табе, 2000 мс, параллелизм 10–16; full ping обновляет UI. — **Reversibility:** reversible.
- **D-10:** Кеш пинга — Drift, таблица `ping_cache(server_id, tab, rtt, online, ts)`, TTL 60 с; fresh/stale; ручное обновление и смена сети сбрасывают. Список серверов кешируется на бэкенде (`KeyCache`/ARTEMIDA cache) и локально для офлайн-показа; подключение требует ядро. — **Reversibility:** reversible.
- **D-11:** `connectivity_plus` `.distinct()` поток → при смене сети очистить Drift `ping_cache` и last-good → свежий пинг. Сеть-чип в продакшне — read-only, **без симуляции** смены сети. — **Reversibility:** reversible.
- **D-12:** Last-good per-tab (≤5, dedupe); quick-path пингует ≤3 последних живых 800 мс, если хоть один online → самый быстрый, иначе full ping. Чип «последний» на самом свежем успешном сервере. — **Reversibility:** reversible.
- **D-13:** Автовыбор (карточка «Автовыбор»): sort RTT ↑, затем `load` ↑ (сейчас только RTT, т.к. load скрыт); если все offline — ошибка, «Повторить», подсказка сменить таб. Ручной выбор per-tab персистится. — **Reversibility:** reversible.
- **D-14:** Переключение таба не рвёт ничего в фазе 19 (нет туннеля); выбор и last-good per-tab. — **Reversibility:** reversible.

### UI и навигация
- **D-15:** **Полный макет прототипа.** Убрать нижнюю навигацию `NavigationBar`. Главный экран: шапка (бренд, greeting, статус, key pill, дата, кнопки обновления/магазина/логики/аватара), баннер, два сегментированных таба, toolbar, список, connect-панель + кнопка. Магазин — отдельный экран-заглушка. Профиль/логика — шторки-заглушки. Существующие auth-маршруты и redirect сохраняются. — **Reversibility:** costly — роутер + тесты фазы 18 + вёрстка; можно вернуть `NavigationBar`.
- **D-16:** **Тёмная тема прототипа для всего приложения.** `AppTheme.dark` по палитре прототипа: `--bg #0e1512`, `--lime #b7ff45`, `--teal #3ee6b0`, grad, surface, dim; шрифты Manrope / Unbounded / JetBrains Mono; кнопки primary/ghost/danger; ping-цвета `good/mid/warn/bad/offline`, load-цвета. Перекрасить auth-экраны фазы 18 и обновить виджет-тесты. — **Reversibility:** costly — затрагивает все экраны; можно вернуть светлую `AppTheme.light`.
- **D-17:** Тексты кнопок/статусов — русские из прототипа: «Простой VPN», «Обход белых списков», «Автовыбор», «Выберу самый быстрый сервер», «Подключить», «мс», «офлайн», «нет ответа», «Пинг обновлён», «Нет активного ключа», «Купить». — **Reversibility:** reversible.
- **D-18:** Кнопка «Подключить» в фазе 19 запускает **выбор сервера** (quick-path → full ping → подсветка выбранного; Автовыбор выбирает лучший). Туннель не поднимается; после выбора показываем, что VPN-ядро — фаза 20. **Без симуляции подключения.** — **Reversibility:** reversible — в фазе 20 подключить FSM.
- **D-19:** Шапка в фазе 19 (минимум + заглушки): greeting, статус VPN, key pill «ключ · N дн.», дата, кнопка обновления; магазин, аватар, «Как это работает» присутствуют, но ведут в заглушки. Сеть-чип read-only. — **Reversibility:** reversible.
- **D-20:** key pill питается метаданными ключа из `/api/mobile/servers` (`key.active`, `key.remainingDays`/`key.expireAt`); без ключа «Нет ключа». `/api/mobile/subscription` `keys` заполняется в фазе 21. — **Reversibility:** reversible.

### Ключ и гейтинг
- **D-21:** `/api/mobile/servers` требует JWT и **активный ключ**. Без активного ключа — машинно-читаемая ошибка (`no_active_key`, 403/402) + пустые `simple/whitelist`. UI: баннер «Нет активного ключа» + «Купить» (заглушка до фазы 21); пинг и выбор заблокированы. Ключ ищется через `lib/keys-service.ts` (`KeyCache`/ARTEMIDA `listKeys`, только `active`, не `trial-expired`). — **Reversibility:** reversible — можно ослабить.
- **D-22:** Бэкенд кеширует subscription-links (cache-first `KeyCache`, ARTEMIDA `cached`); не дёргать ARTEMIDA на каждый запрос; обрабатывать `401/402/409/429/502/503`, `Retry-After`, error-конверт обоих видов. Ошибки → `simple/whitelist` пустые + toast + «Повторить»; кеш + тост офлайн. — **Reversibility:** reversible.

### the agent's Discretion
- Точный ffigen-контракт libbox и имя нативного модуля; провайдер libbox (собственный FFI-пакет vs уже собранный sing-box артефакт); способ подключения шрифтов (`google_fonts` vs бандл).
- Точная структура freezed-модели `Server`/`PingResult`; имена провайдеров Riverpod.
- Точный HTTP-URL для `libbox.urltest` (`generate_204`-эквивалент) и имя outbound; реализация парсера share-ссылок.
- Конкретный словарь emoji-флагов → cc, если remark не содержит cc.
- Наличие `country`/`host` вторичной строкой.
- Какие заглушки для магазина/профиля/логики показать в фазе 19.

### Deferred Ideas (OUT OF SCOPE)
- **REQ-POOL-04 load bar** — needs a real `load` source (backend metric / provider); hide until then. Tie-break RTT→load later.
- **REQ-PING-07 «последний»** implemented in 19; no further work.
- **VPN tunnel / Connection FSM / kill switch / reconnect / cancel** — Phase 20. Connect button stops at server selection in 19.
- **Shop/purchase + key gating UX** — Phase 21; 19 shows banner + stub. `/subscription.keys` filled in 21.
- **Profile sheet full content / device management / subscription link** — Phase 21.
- **Manual network-chip simulation** — prototype artifact; production reacts to `connectivity_plus` only.
- **Static server catalog** — rejected in favor of subscription parsing (D-01); can revisit if provider remarks are insufficient.
- **SNI allowlist** — rejected; remark tag + Reality fallback (D-02). SNI shown for display only.
- **Light theme toggle** — rejected; dark prototype theme app-wide (D-16).
- **Bottom nav** — rejected; full prototype layout (D-15).
- Android App Links/VPN/`BIND_VPN_SERVICE`, `VPN_MANAGE` fix — Phase 20; NetworkExtension entitlement — external blocker; GPL-3.0 review — external.
- None — discussion stayed within phase scope. No folded/reviewed todos (`todo.match-phase` empty).
</user_constraints>

---

## Project Constraints (from AGENTS.md)

Authority: repo `AGENTS.md`. These are locked; research does not recommend approaches that contradict them.

1. **Project:** 3set-white VPN sales service on **ARTEMIDA Paid API V1** `https://artemida.cc/v1`. Telegram bot + PWA + Platega. Backend = thin wrapper. RU/RUB. (For v2.0 milestone, the Flutter mobile client is added.)
2. **Tech stack:** Node + Next.js + Telegraf (user choice). **Mobile:** Flutter + libbox (Karing/sing-box) per v2.0 milestone scope `[VERIFIED: .planning/PROJECT.md]`.
3. **API limits:** Trial **cannot renew/upgrade**; permanent delete no refund; handle **`401/402/409/429/502/503` + `Retry-After`**. `[VERIFIED: docs/artemida-v1-contract.md:52-57]`.
4. **Security:** `ARTEMIDA_API_KEY`, Platega secrets, SSH/root password **only in env/secrets; never commit secrets**. Never log raw subscription links. `[VERIFIED: docs/artemida-v1-contract.md:155-161; lib/artemida.ts:1-5]`.
5. **Compatibility:** PWA installable; Telegram Bot API + Login Widget. **ARTEMIDA is server-to-server only** (`CORS OPTIONS → 501`, provider `connect-src 'self'`); **browser/client must never call ARTEMIDA** `[VERIFIED: docs/artemida-v1-contract.md:37-38]`. Mobile calls **our** `/api/mobile/*`.
6. **Infrastructure:** single server, `dash.3set.online`, **HTTPS mandatory**. `[VERIFIED: .planning/PROJECT.md]`.
7. **Compliance:** RU/RUB, **unlimited traffic by default**.
8. **Next.js rules:** This repo's `AGENTS.md` (appended block) states Next.js has breaking changes vs. training data; **read relevant guide in `node_modules/next/dist/docs/`** before writing code; heed deprecation notices. `[VERIFIED: AGENTS.md; node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md]`. Concrete: App Router Route Handlers `app/api/.../route.ts`, `export async function GET`, **not cached by default**, `export const dynamic = "force-dynamic"`, `Response.json()`. **Next 16.3.7** `[VERIFIED: node_modules/next/package.json]`.
9. **GSD workflow:** plans in `.planning/phases/NN-*`, `must_haves`, tracer-first; verify `flutter analyze`, `flutter test`, `npx tsc`, `npx prisma validate`. `[VERIFIED: AGENTS.md; .planning/config.json]`. Mobile has **strict lints** `[VERIFIED: mobile/analysis_options.yaml]`.
10. **No simulation for production paths:** prototype simulation (`Math.random` ping, fake IP, `sleep`, localStorage-only) **must be replaced** `[VERIFIED: .planning/seeds/SEED-001-mobile-client-karing.md:52-54; .planning/seeds/prototype-mobile-client.html]`; CONTEXT D-11/D-18 reiterate no network simulation / no fake connection.

### Known blockers (recorded; not re-solved here)
- **GPL-3.0**: sing-box / libbox is **GPL-3.0-or-later** `[VERIFIED: /tmp sing-box v1.14.4 LICENSE]`; `.planning/research/STACK.md` + `PITFALLS.md` record legal review required, dynamic linking, source offer. Roadmap Phase 23. **pkg.go.dev lists `experimental/libbox` as `GPL-2.0` `[CITED: pkg.go.dev/.../experimental/libbox]`, but repo-root LICENSE = GPL-3.0-or-later — treat as GPL-3.0 for compliance.** Apple NetworkExtension entitlement external; Android build blocked in this env.
- **Apple NetworkExtension entitlement** (external). **GPL-3.0 legal review** (external). **Android build blocked in this env** (no JDK; `/usr/bin/java` stub: "Unable to locate a Java Runtime"; Android SDK not verified; `cocoapods` `pod` not on PATH in this env) — CONTEXT `code_context`. iOS builds work here (`xcodebuild` present; Phase 18 verified `flutter build ios --debug --no-codesign`) `[VERIFIED: .planning/STATE.md]`.

---

## Summary

Phase 19 has **two independent halves** plus glue:

1. **Backend (Next.js BFF).** New `app/api/mobile/servers/route.ts`. `GET`, JWT (`verifyAccessToken` from `lib/mobile-auth.ts`), `export const dynamic = "force-dynamic"`. Resolves **one active key** for `claims.userId` from **`KeyCache` (`prisma.keyCache`, `listKeysByUserId`)**, reusing `lib/keys-service.ts`; **never calls ARTEMIDA `/pricing`** (D-01). Pulls raw share links via **`artemida.getSubscriptionLinks(keyId)`** (cache-first; `KeyCache` + ARTEMIDA `cached`; D-22). **Parses `vless://`, `ss://`, `hysteria2://`(+`hy2://`), `trojan://`, `wg://`(+`wireguard://`), `vmess://`** into `Server`. Splits pools by **remark** (D-02). Returns `{ simple, whitelist, key }`. No active key → **`no_active_key` 403** (402 acceptable) + empty pools (D-21). Provider errors mapped (`ArtemidaError` `unauthorized/payment_required/conflict/rate_limited/bad_gateway/unavailable` + `retryAfterSec`; **both error envelopes**; `Retry-After`; already retried `429/502/503` ×2 by `artemida`) → **empty pools + `error`**, **not** a 5xx; **cached copy served** where available; **nothing secret returned for card list; raw link never returned/logged** (D-05); `load` **not returned** (D-04/REQ-POOL-04 deferred).

2. **Flutter.** Replace phase-18 `_HomeScreen` + bottom `NavigationBar` (D-15) with prototype main screen; **dark prototype theme app-wide** (D-16); `features/servers/` (or `features/server_pool/`); `core/ping/`; `core/db/`. **Riverpod** `serverPoolProvider`, `pingCacheProvider`, `bestServerProvider` (+ helpers). **Drift** `ping_cache` (+ `last_good`, `selection`, `current_tab` recommended). **Ping = `libbox.urltest`, not ICMP**; **silent `Socket.connect` TCP fallback** marked `approx` (D-07). **quick-path** (≤3 last-good, 800 ms) → **full ping** (all in tab, 2000 ms, concurrency 10–16); **fresh-cache 60 s** check first. **Connect = server selection only** (D-18). 

3. **libbox reality check (highest-value finding, corrects locked wording).** sing-box **v1.14.4** (current stable `[VERIFIED: pkg.go.dev .../v1.14.4; Makefile]`). **There is NO official Flutter package and NO exported C symbol `libbox_urltest`.** gomobile outputs are **JNI `.aar` / ObjC `.xcframework`, not C-ABI**; the `sing-ffi` `*_new` targets need a **non-public** tool `[VERIFIED: SagerNet/sing-box issue #4016; Makefile]`. The real symbol is **`func (c *CommandClient) URLTest(outboundTag string) error`** `[VERIFIED: experimental/libbox/command_client.go:599-608]`, which **returns only `error`, not RTT**; **RTT comes back asynchronously** via `CommandClientHandler.WriteGroups` (`OutboundGroupItem.URLTestDelay` int32 ms, `URLTestTime` int64 s; `CommandGroup`=2; no history → `0,0`; failed test → history deleted → `0,0`) `[VERIFIED: experimental/libbox/command_types.go:60-72; daemon/started_service.go:717-745,605-633; command.go]`. `URLTest` with `link==""` uses **`https://www.gstatic.com/generate_204`** `[VERIFIED: common/urltest/urltest.go]`. **To honor locked D-08 (`ffigen` + `libbox.urltest`), build a custom minimal C-shared shim** (own tiny Go `package main`, `go build -buildmode=c-shared`) around `libbox`, generate Dart bindings with `ffigen`. **PROVEN in this session**: shim `.dylib` built + `libbox.CheckConfig` + `libbox.Version` called successfully. **Offloading alternative**: official gomobile `libbox.aar` + `Libbox.xcframework` + **Flutter platform channels**, or community `flutter_sing_box` (Clash API `urlTest`) / `singbox_ffi` (C-ABI but **no URLTest**; `[ASSUMED]` not legitimacy-cleared) — **not** `ffigen`. **Phase 19 ping needs only `libbox.Setup` + `CommandServer.StartOrReloadService(minimal sing-box config, no TUN)` + `CommandClient.URLTest`; no VPN**. WireGuard: sing-box **1.14 WireGuard is an `endpoint`, not outbound**; `URLTest` falls back to `endpointManager` `[VERIFIED: adapter/outbound/manager.go:153-159]`. WireGuard community scheme is `wireguard://`, not `wg://`; **accept both** (D-01 says `wg://`).
4. **Fallback (D-07).** `dart:io Socket.connect(host, port, timeout:)`, real TCP RTT, `approx`, silent; **cannot validate UDP-only transports** (Hysteria2 QUIC/UDP, WireGuard UDP) when libbox is absent — honest gap. Port from share link; IPv6 `[host]`; same timeouts. 

**Primary recommendation:** Backend reuse `verifyAccessToken` + `keys-service` + `artemida`, add `lib/server-pool.ts` parser (`parseShareLink` + `classifyPool` + `parseRemark`) with **exhaustive unit tests**, route `app/api/mobile/servers/route.ts`. Client: `Server`/`PingResult` freezed; `DriftPingCache`; `PingRepository` (`LibboxPingService` + `SocketPingService`); `connectivity_plus` invalidation; Riverpod providers; prototype UI + dark theme; **custom C-shared libbox shim + ffigen**; silent TCP fallback. Keep `REQ-POOL-04` deferred; **no `load`, no simulation, no secrets in logs**. Android libbox build documented (OpenJDK 17 + Android SDK; blocked here); iOS `Libbox.xcframework` arm64; **silent fallback means Phase 19 still ships if native libbox is absent**.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| JWT auth for `/api/mobile/servers` | API / Backend (`verifyAccessToken`) | — | ARTEMIDA key + secrets server-only; `[VERIFIED: lib/mobile-auth.ts]`. |
| Active-key resolution + caching | API / Backend (`KeyCache`, `keys-service`) | Database (`prisma.keyCache`) | cache-first D-29; ownership `userId`; `[VERIFIED: lib/keys-service.ts; prisma/schema.prisma:245]`. |
| Subscription-links fetch | API / Backend (`artemida.getSubscriptionLinks`) | `KeyCache` | server-to-server only; `[VERIFIED: docs/artemida-v1-contract.md:37-38,56; lib/artemida.ts:679-683]`. |
| Share-URI → `Server` parse + pool split | API / Backend | — | raw links never leave server; `[VERIFIED: D-01/D-02/D-05]`. |
| `load` metric | — (deferred) | — | REQ-POOL-04 deferred; no simulation `[VERIFIED: D-04]`. |
| Server list cache (offline) | Drift (local) + `KeyCache` (backend) | — | D-10; `[VERIFIED: D-10]`. |
| Ping = `libbox.urltest` | Browser/Client (sing-box libbox) | Dart `Socket.connect` | D-06/D-07; sing-box test runs client-side `[VERIFIED: sing-box daemon/started_service.go]`. |
| sing-box config generation | Browser/Client | — | `[VERIFIED: .planning/research/ARCHITECTURE.md]`. |
| Ping result cache TTL 60 s | Drift SQLite (`ping_cache`) | — | REQ-PING-04; `[VERIFIED: D-10]`. |
| Last-good (≤5) + quick-path | Drift (`last_good`) | — | D-12; `[VERIFIED: SEED-001 §5; D-12]`. |
| Network-change invalidation | Browser/Client (`connectivity_plus`) | — | D-11; `[VERIFIED: connectivity_plus source]`. |
| Best-server ranking | Browser/Client (derived Riverpod) | — | D-13; `[VERIFIED: bestOnline in prototype]`. |
| Server selection persistence per-tab | Drift (`selection`) / `flutter_secure_storage` | — | D-13/D-14; REQ-POOL-01. |
| Dark prototype theme | Browser/Client (`AppTheme.dark`) | — | D-16. |
| VPN tunnel | — (Phase 20) | — | out of scope D-18. |

## Standard Stack

### Backend (existing; no new external packages required)
| Library | Version | Purpose | Why Standard | Provenance |
|---------|---------|---------|--------------|------------|
| Next.js App Router | `16.3.7` | `app/api/mobile/servers/route.ts` Route Handler | existing; `force-dynamic`, not cached by default | `[VERIFIED: node_modules/next/package.json; node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md]` |
| `@/lib/mobile-auth` `verifyAccessToken` | in-repo | JWT access 15m + refresh 30d (`jose` HS256, `typ:"access"`, `uid`, `tid`, credentials watermark) | reuse; phase 18 | `[VERIFIED: lib/mobile-auth.ts:10-11,45-76]` |
| `@/lib/keys-service` `listKeysByUserId`, `deriveStatusKind`, `daysUntilExpiry` | in-repo | active-key resolution + `KeyCache` read; ownership `userId` | reuse; D-21/D-22 | `[VERIFIED: lib/keys-service.ts:157-165,55-65,92-97]` |
| `@/lib/artemida` `artemida.getSubscriptionLinks`, `listKeys`, `ArtemidaError` | in-repo | `GET /keys/{id}/subscription-links`; `401/402/409/429/502/503`+`Retry-After`; both error envelopes; p-retry `429/502/503` ×2; `normalizeSubscriptionLinks` | reuse; D-01/D-22 | `[VERIFIED: lib/artemida.ts:22-71,91-125,422-431,592-635,679-683; p-retry@7.1.1]` |
| `prisma` `keyCache` (`KeyCache`) | in-repo | server key cache; fields `status,isTrial,expiresAt,deviceLimit,devices,subscriptionUrl,customerRef` | reuse | `[VERIFIED: prisma/schema.prisma:245-270; lib/keys-service.ts]` |
| `zod` | `4.6.5` | validate provider + route output | existing | `[VERIFIED: node_modules/zod/package.json]` |
| `pino` logger | in-repo | no secret logging | existing | `[VERIFIED: lib/mobile-auth.ts; lib/artemida.ts]` |

**No ARTEMIDA `/pricing`** for this route (D-01). **No new backend dependency.** Parser `lib/server-pool.ts` is hand-rolled (no share-link lib; sing-box has none built in `[VERIFIED: sing-box v1.14.4 source]`).

### Mobile (Flutter 3.50.1 / Dart 3.14.0; add to `mobile/pubspec.yaml`)
| Package | Version | Purpose | Provenance |
|---------|---------|---------|------------|
| `drift` | `^2.35.4` | reactive SQLite; `ping_cache` (+ `last_good`, `selection`, `current_tab`) | `[VERIFIED: pub.dev/api/packages/drift; sdk >=3.10.0; verified publisher simonbinder.eu]` |
| `drift_flutter` | `^0.3.1` | `driftDatabase(name:)` Flutter setup; pulls `path`, `path_provider`, `sqlite3`, `sqlite3_flutter_libs`, `sqlcipher_flutter_libs` | `[VERIFIED: pub.dev/api/packages/drift_flutter]` |
| `sqlite3_flutter_libs` | `0.6.0+eol` | bundled SQLite native (Android/iOS); **EOL but current**; pulled transitively by `drift_flutter` | `[VERIFIED: pub.dev/api/packages/sqlite3_flutter_libs]` |
| `sqlite3` | `^3.9.2` | sqlite3 bindings | `[VERIFIED: pub.dev/api/packages/sqlite3]` |
| `path` | `^1.9.1` | DB file path | `[VERIFIED: pub.dev/api/packages/path]` |
| `path_provider` | `^2.1.6` | app documents dir | `[VERIFIED: pub.dev/api/packages/path_provider]` |
| `drift_dev` (dev) | `^2.35.3` | code generation | `[VERIFIED: pub.dev/api/packages/drift_dev]` |
| `build_runner` (dev) | `^2.17.1` | `dart run build_runner build` (already present) | `[VERIFIED: mobile/pubspec.yaml]` |
| `ffigen` (dev) | `^23.0.0` | generate Dart bindings from our shim `.h`; needs `package:ffi` | `[VERIFIED: pub.dev/api/packages/ffigen]` |
| `ffi` | (transitive/explicit) | `DynamicLibrary`, `calloc`, `Utf8` | `[CITED: pub.dev/packages/ffigen]` |
| `connectivity_plus` | `^7.3.2` | `onConnectivityChanged` `Stream<List<ConnectivityResult>>`, **already `.distinct()`**; `ConnectivityResult{bluetooth,wifi,ethernet,mobile,none,vpn,satellite,other}`; Android `ACCESS_NETWORK_STATE` in plugin manifest | `[VERIFIED: connectivity_plus-7.3.2 source; mobile/pubspec.yaml; mobile/lib/core/connectivity/connectivity_service.dart]` |
| `flutter_riverpod` + `riverpod_annotation` + `riverpod_generator` + `freezed` + `json_serializable` | `3.4.2 / 4.0.8 / 4.0.10 / 4.0.3 / 6.15.2` | providers + models; `build_runner` | `[VERIFIED: mobile/pubspec.yaml; phase 18]` |
| fonts: `Manrope`, `Unbounded`, `JetBrains Mono` | variable | prototype typefaces; `google_fonts` `^9.0.0` **or bundled assets** (discretion) | `[CITED: .planning/seeds/prototype-mobile-client.html; pub.dev google_fonts@9.0.0]` |

**libbox itself** = sing-box **v1.14.4** Go module `github.com/sagernet/sing-box/experimental/libbox`; build tags `with_gvisor,with_quic,with_wireguard,with_utls,with_naive_outbound,with_clash_api,badlinkname,tfogo_checklinkname0` `[VERIFIED: Makefile; cmd/internal/build_libbox/main.go]`. `with_utls` **required for Reality** `[VERIFIED: sing-box check output "uTLS, which is required by reality is not included in this build, rebuild with -tags with_utls"]`.

### Flutter version note
Repo pins Dart `^3.14.0` `[VERIFIED: mobile/pubspec.yaml]`; installed Flutter **3.50.1 / Dart 3.14.0** `[VERIFIED: flutter --version]`. The project `AGENTS.md` v2.0 research says Flutter 3.24+, but **actual is 3.50.1**; phase-19 research validates against the installed SDK. NOTE: repo `.planning/research/STACK.md` is stale (Flutter 3.24 / Riverpod 2.5 / Drift 2.18 / connectivity_plus 6 / `uni_links`); **actual pubspec is Riverpod 3.4.2 + connectivity_plus 7.3.2 + app_links 7.2.2 + Flutter 3.50.1** `[VERIFIED: mobile/pubspec.yaml]`.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| **Custom C-shared libbox shim + `ffigen`** (recommended, satisfies D-08) | Official gomobile `libbox.aar` + `Libbox.xcframework` + **Flutter platform channels** | Upstream-supported path, but NOT `dart:ffi`/`ffigen`; native glue per platform; more code. Own shim is smaller for `urltest`-only. |
| custom shim | `singbox_ffi` `^0.1.6` (pub, verified `loafman.top`) | raw C-ABI but **no URLTest**; native artifacts sold separately; GPL-3.0; `[ASSUMED]` not legitimacy-cleared (`package-legitimacy` seam only supports npm/pypi/crates; can't verify pub) |
| custom shim | `flutter_sing_box` `^3.1.0` (pub) | Clash-API `urlTest(groupTag)`, share→sing-box conversion; platform-channel; NOT `ffigen`; community |
| custom shim | `sing-box-lib` prebuilt (`proother/sing-box-lib`, AAR + XCFramework zip) | saves Go toolchain; verify provenance + sing-box version pin; still JNI/ObjC → needs channels/shim |
| `sing-ffi` `_new` targets | — | **non-public tool `[VERIFIED: SagerNet/sing-box#4016]`** |
| **`google_fonts`** `^9.0.0` | bundled `.ttf` assets + `pubspec.fonts` | runtime network fetch vs offline-safe; prototype uses CDN fontsource; discretion `[CITED]` |
| Drift `drift_flutter` | `sqlite3_flutter_libs` + `path_provider` manual `NativeDatabase` | `drift_flutter` is simpler; both work |
| hand-rolled TCP-only ping | always `Socket.connect` | loses real outbound measurement; D-06 requires `libbox.urltest` primary |

**Package-legitimacy note.** `package-legitimacy check` seam supports **npm/pypi/crates only** (`[VERIFIED: gsd-tools]`); **pub.dev packages cannot be machine-cleared**. All Dart packages above are verified on pub.dev registry + verified publisher where shown; recommend a `checkpoint:human-verify` before adding third-party `singbox_ffi`/`flutter_sing_box`, which are NOT required by the locked scope. No `[SLOP]`. `load` source has no package (deferred).

**Installation (backend):** none. **Mobile:** add `drift drift_flutter sqlite3 sqlite3_flutter_libs path path_provider ffigen ffi` + dev `drift_dev`; `dart run build_runner build --delete-conflicting-outputs`. **libbox:** build shim (below), vendor artifacts. No new **npm** package for the backend phase.

## Critical Uncertainty #1 — Actual `links[]` payload of `GET /keys/{id}/subscription-links`

### What the locked contract guarantees `[VERIFIED]`
`GET /keys/{id}/subscription-links` (key-scoped `id`, server-to-server Bearer):
- Success `200`, success envelope `{"ok":true,"data":{…},"meta":{"requestId":"req_…"}}`.
- `data.{ keyId, subscriptionUrl, fetchedAt, cached, count, vless[], links[], protocols.{ vless[] } }` `[VERIFIED: docs/artemida-v1-contract.md:56,124-127]`.
- **`links[]` is an array of strings** (`asStringArray` filters non-strings `[VERIFIED: lib/artemida.ts:351-353,422-431]`); `links.length ? links : vless` `[VERIFIED: lib/artemida.ts:429]`. `protocols` is **read but not used** by `normalizeSubscriptionLinks`; only `vless` key observed.
- Observed verbatim probe output (placeholder links, probe key): `{"keyId":"key_9f603bde96971407","subscriptionUrl":"https://xskx.artemida.live/M2HGD-qjFynCB9Ns","fetchedAt":1790996368,"cached":false,"count":3,"links":["vless://placeholder"],"protocols":{"vless":["vless://placeholder"]}}` `[VERIFIED: docs/artemida-v1-contract.json subscriptionLinks.observed]`. **`count=3` but `links` has 1 placeholder — contract does NOT guarantee `count == links.length`.** The probe key emits **placeholder links**; **`vless://placeholder` is not parseable** (no host). 
- `subscriptionUrl` example `https://xskx.artemida.live/M2HGD-qjFynCB9Ns`; `rewriteSubscriptionHost` rewrites host to `WHITELABEL_HOST` `[VERIFIED: lib/artemida.ts:366-381]`. `fetchedAt` epoch seconds; `cached` bool. `key.subscriptionUrl` + `key.customSubscriptionUrl`.
- `cached` flag + `fetchedAt` → cache-first `KeyCache` + `artemida` retry; not drive-around per request (D-22). **Subscription `links` content itself is NOT cached in `KeyCache`** — `KeyCache` caches key metadata + `subscriptionUrl`, not `links[]` `[VERIFIED: prisma/schema.prisma:245-270; lib/keys-service.ts:280-319]`. D-22 says cache subscription-links; **recommend a small server-side in-memory/KeyCache-adjacent cache for `{keyId → links[]}`** (none exists; `getSubscriptionForOwnedKey` calls `artemida.getSubscriptionLinks(keyId)` every time `[VERIFIED: lib/keys-service.ts:292]`). ARTEMIDA itself returns `cached:true/false`. 

### What is NOT guaranteed `[ASSUMED]`
The locked contract only ever observed `protocols.vless` and a `vless://placeholder`. **A real ARTEMIDA key's actual per-protocol share URIs are not observable in this environment** (no live `ARTEMIDA_API_KEY`; `.env.local` key length 4 → `401 invalid_api_key` `[VERIFIED: live probe attempt; error body "API-ключ недействителен."]`). The contract does **not** document per-protocol query params, remark/`#fragment` naming, flag emojis, or whether `links[]` always contains **bare share-URIs**. CONTEXT D-01 **assumes** bare share URIs (`vless://`, `ss://`, `hysteria2://`, `trojan://`, `wg://`, `vmess://`) and D-02 **assumes** remark parsing + `WL`/`whitelist`/`обход`. A real payload could also contain `hy2://`, `wireguard://`, `.conf`, base64-subscription blobs, or `protocols.{ss,trojan,hysteria2,wireguard,vmess}`. **This is exactly uncertainty #1 and must be re-verified against a live paid key before locking; recommend an ASSUMED checkpoint.**

### Concrete share-link formats (target for the parser) 
*(community specs; sing-box has no built-in share parser; CONTEXT locks scheme list.)*

**VLESS** `[CITED: Surge VLESS manual; v2rayN; Xray; incy share-links doc]`
```
vless://<uuid>@<host>:<port>?<params>#<remark>
```
`encryption` (default `none`; VLESS has no transport encryption); `flow` (`xtls-rprx-vision`); `type`/network (`tcp`,`ws`,`grpc`,`xhttp`/`splithttp`,`kcp`,`quic`, default `tcp`); `security` (`none`,`tls`,`reality`, default `none`); TLS `sni`, `fp`, `alpn`, `allowInsecure`/`insecure`, `ech`, `pinSHA256`; **Reality `pbk`, `sid`, `spx`, `fp`, `sni`, `serverName`**. `sni`/`serverName` aliases. Reality → **`VLESS · Reality`** + `security=reality`. Fragment `#remark` URL-decoded; remark after `#`, optionally `?serverDescription=base64`. `remark`/`name` may carry `🇳🇱 City`, `WL`/`whitelist`/`обход`. (CONTEXT relies on remark parsing + Reality fallback → **must** parse `#fragment`, `sni`, `serverName`, `security`, `pbk`, `sid`, `fp`, `flow`.)

**Shadowsocks** `[CITED: SIP002 URI scheme; incy]`
```
ss://base64url(method:password)@host:port#remark            (SIP002 / modern)
ss://base64url(method:password@host:port)#remark            (legacy whole-info base64)
```
`method` ∈ sing-box list `[VERIFIED: sing-box outbound/shadowsocks.md]` (`2022-blake3-aes-128-gcm`, `2022-blake3-aes-256-gcm`, `2022-blake3-chacha20-poly1305`, `none`, `aes-*-gcm`, `chacha20-ietf-poly1305`, `xchacha20-ietf-poly1305`, legacy `*-cfb`/`*-ctr`, `rc4-md5`); `password`; optional SIP003 `plugin`/`plugin_opts` (`v2ray-plugin`,`obfs-local`). Base64 padding tolerant; URL-safe. → `Shadowsocks`. sing-box fields `method`,`password`,`server`,`server_port`,`plugin`,`plugin_opts`. **WL pool note:** `ss://` is NOT VLESS+Reality → `simple` unless remark marks `WL/whitelist/обход` (D-02).

**Hysteria2** `[CITED: hysteria.network URI scheme; incy; sing-box hysteria2 outbound]`
```
hysteria2://<password>@<host>:<port>[,<port>-<port>...]?<params>#remark
hy2://<password>@<host>:<port>?...#remark                 (alias)
```
`insecure`(`1`)/`allowInsecure`, `sni`, `fp`, `alpn`, `obfs`(`salamander`), `obfs-password`, `pinSHA256`, `up`/`down`, `mport`/`ports` (port hopping; **first port used**), `mportHopInt`/`portHopInt`. → `Hysteria2`. sing-box `password`, `tls`, `obfs`, `up_mbps`,`down_mbps`,`server_ports`,`hop_interval`. **UDP/QUIC transport** → silent TCP fallback can't validate (see #4). 

**Trojan** `[CITED: trojan share; incy; sing-box trojan outbound]`
```
trojan://<password>@<host>:<port>?<params>#remark
```
`security` default `tls`; `sni`/`peer`, `fp`, `alpn`, `insecure`, `type`/network, `serviceName`, `path`,`host`; Reality params same as VLESS. → `Trojan`. sing-box `password`,`tls`,`transport`. 

**VMess** `[CITED: v2rayN convention; incy; sing-box vmess outbound]`
```
vmess://base64(JSON)
```
JSON `{ v, ps, add, port, id, aid, scy, net, type, host, path, tls, sni, fp, alpn, ... }` (`ps`=remark; `add`=host; `port`; `id`=uuid; `aid`=alterId default 0; `scy`=`auto|none|aes-128-gcm|chacha20-poly1305|zero`; `net`=`tcp|ws|grpc|...`; `tls`=`tls`/empty; `sni`; `host`=Host header; `path`; `type`). **`vmess://` base64 JSON is NOT URL-form.** → `VMess`. sing-box `security`(=scy),`alter_id`,`transport`,`tls`. `ps` remark → pool/remark. `[ASSUMED]` field completeness.

**WireGuard** `[CITED: incy; community wg scheme; sing-box endpoint]`
- **CONTEXT D-01 says `wg://`, but the community scheme is `wireguard://` `[CITED]`. Accept BOTH.** Also raw WireGuard `.conf`. 
```
wg://<privateKey>@<host>:<port>?publickey=<peerPublicKey>&address=<addr[,addr]>&mtu=1500&reserved=1,22,33#remark
wireguard://<privateKey>@<host>:<port>?publickey=...&address=...&mtu=...&reserved=...#remark
```
`publickey` (peer), `address` (local, comma-separated), `mtu`, `reserved`, `allowedips`, `presharedkey`, `keepalive`. → `WireGuard`. **sing-box 1.14 WireGuard is an `endpoint`, NOT outbound** `[VERIFIED: sing-box outbound/wireguard.md "Deprecated in 1.11.0 ... removed in 1.13.0"; endpoint/wireguard.md]`. Endpoint `{type:"wireguard",tag,address[],private_key,peers:[{address,port,public_key,pre_shared_key,allowed_ips,persistent_keepalive_interval,reserved}],mtu}`. `URLTest` resolves tags via `outboundManager.Outbound(tag)` which **falls back to `endpoint.Get(tag)`** `[VERIFIED: adapter/outbound/manager.go:153-159]`. **UDP transport** → silent TCP fallback can't validate (see #4). WireGuard hosts for TCP-fallback `Socket.connect` will usually fail → offline. **`wg://` scheme `[ASSUMED]`-compatible; real links `[ASSUMED]`.**

### Server model (D-03; recommended freezed `Server`) 
`id, name, city, cc, flag, proto, sni?, tab, host, port, protocol, outbound`.
- `id`: stable deterministic id (e.g. SHA-256 short of `tab + scheme + host + port + secret-fingerprint`); NOT the raw link. 
- `name/city/cc/flag` from remark: **emoji flag (regional indicator pair U+1F1E6..U+1F1FF) → `cc`** + remaining text = `city`. Strip `WL`/`whitelist`/`обход` markers from display `name`. On parse failure `name`=remark, `city/cc/flag`="", **host shown secondary** `[VERIFIED: D-03]`. `flag` emoji reconstructed from `cc` if remark has explicit `CC`. 
- `proto` (D-03 verbatim values): `WireGuard`, `Shadowsocks`, `VLESS`, `VLESS · Reality`, `Hysteria2`, `Trojan`, `VMess`. `hy2://`→`Hysteria2`. Reality = `security=reality`. Prototype badge `pc` derived in UI `[CITED: prototype SERVERS; pc wg/ss/vl/hy/tr]`. REQ-POOL-03 protocol badge.
- `sni` = `sni`/`serverName` query; **only returned for `whitelist`**; shown `SNI: domain` (REQ-POOL-05). 
- `tab` = `simple|whitelist`. 
- `host`/`port` = server address/port for **ping + TCP fallback**; host display secondary. `port` numeric; default per proto (443 VLESS/Trojan/HY2, 80/443; SS/WG explicit; VMess `port` int-as-string). Hysteria2 first-port. 
- `outbound` = **minimal sing-box outbound/endpoint JSON for ping/connect** `[VERIFIED: D-05]`; **not a UI-card secret field; raw `vless://...` link NOT returned**. 

### Pool classification (D-02; `classifyPool`)
Case-insensitive remark scan: contains `WL` or `whitelist` or `обход` → `whitelist`; else `simple`. **If no marker:** `VLESS + Reality` (`scheme=vless && security=reality`) → `whitelist`, else `simple`. `WL` matching must be token-ish (avoid matching inside unrelated words) `[ASSUMED refinement; D-02 literal says "contains WL"]`. 

---

## Critical Uncertainty #2 — libbox FFI reality check (sing-box v1.14.4)

### Is there an official Flutter libbox package? `[VERIFIED]`
**No.** sing-box ships **gomobile** outputs for its own native apps. No first-party `package:libbox`. `sing-box-for-apple` → `Libbox.xcframework`; `sing-box-for-android` → `libbox.aar`. 

### Is there a minimal `libbox.urltest` C symbol? `[VERIFIED]`
**No.** Real API (Go, v1.14.4):
- `func Setup(options *SetupOptions) error` `[VERIFIED: setup.go]`; `SetupOptions{BasePath,WorkingPath,TempPath,FixAndroidStack,CommandServerListenPort,CommandServerSecret,LogMaxLines,Debug,CrashReportSource,AppVersion,AppMarketingVersion,...}`.
- `func CheckConfig(configContent string) error`.
- `func Version() string` (`constant.Version`, set via `-X github.com/sagernet/sing-box/constant.Version=...`; else `"unknown"` `[VERIFIED]`).
- `func NewCommandServer(handler CommandServerHandler, platformInterface PlatformInterface) (*CommandServer, error)`; `(*CommandServer).Start() error`; `(*CommandServer).StartOrReloadService(configContent string, options *OverrideOptions) error` (`OverrideOptions{AutoRedirect,IncludePackage,ExcludePackage}`); `(*CommandServer).Close()`; `(*CommandServer).CloseService()`. `PlatformInterface` (many methods) must be implemented; in our Go shim a no-op.
- `func NewStandaloneCommandClient() *CommandClient` (no handler) **OR** `func NewCommandClient(handler CommandClientHandler, options *CommandClientOptions) *CommandClient`. `(*CommandClient).Connect() error`. `(*CommandClientOptions).AddCommand(command int32)`. `CommandLog=0,CommandStatus=1,CommandGroup=2,CommandClashMode=3,CommandConnections=4,CommandOutbounds=5` `[VERIFIED: command.go]`. 
- **`func (c *CommandClient) URLTest(outboundTag string) error` `[VERIFIED: command_client.go:599-608]`. `outboundTag`, not `url`. No RTT return.** `URLTest` requires `ServiceStatus_STARTED`, finds outbound by tag (falls back to endpoint), else `codes.NotFound`. 
  - plain outbound → `urltest.URLTest(ctx, "", outbound)`; `link==""` → **`https://www.gstatic.com/generate_204`** `[VERIFIED: common/urltest/urltest.go]`; measures real RTT `t uint16`. 
  - `group.URLTest` → `CheckOutbounds()`; other `OutboundGroup` → `URLTestOutbounds`. 
  - stores `adapter.URLTestHistory{Time,Delay}`; on error `DeleteURLTestHistory`. 
- `CommandClientHandler` `[VERIFIED: command_client.go]`: `Connected(); Disconnected(message string); SetDefaultLogLevel(int32); ClearLogs(); WriteLogs(LogIterator); WriteStatus(*StatusMessage); WriteGroups(OutboundGroupIterator); WriteOutbounds(OutboundGroupItemIterator); InitializeClashMode(StringIterator,string); UpdateClashMode(string); WriteConnectionEvents(*ConnectionEvents)`.
- `OutboundGroup{Tag,Type,Selectable,Selected,IsExpand, GetItems()}`; **`OutboundGroupItem{Tag,Type,URLTestTime int64,URLTestDelay int32}`** `[VERIFIED: command_types.go:60-72]`. `UrlTestTime` Unix s; `URLTestDelay` ms; `0,0`=no history; **failed→cleared→`0,0`**; `history.Delay` uint16 → int32. **RTT retrieval = subscribe `CommandGroup`; after `URLTest`, read `URLTestDelay` for `outboundTag`.** No `URLTestError` field; failure = history removed.
- **CONTEXT's `libbox.urltest(...)` is shorthand; the honest mapping is `URLTest(outboundTag)` + `WriteGroups`.** 

### Own FFI shim + ffigen (recommended; satisfies locked D-08) `[VERIFIED in-session]`
gomobile output is **JNI `.aar` / ObjC `.xcframework`, not C-ABI**; `dart:ffi` cannot bind it; **`sing-ffi` `_new` targets require non-public `sing-ffi`** `[VERIFIED: Makefile; SagerNet/sing-box#4016]`. **Build own minimal C-shared shim.** 

Proven minimal shim (this session built `libboxshim.dylib` + `.h`, `libbox_check_config` returned `''`, `libbox_version` returned sing-box `C.Version`):
```go
// package main
import "C"
//export libbox_setup          func libbox_setup(basePath,workingPath,tempPath *C.char) *C.char { return cstr(libbox.Setup(&libbox.SetupOptions{...})) }
//export libbox_check_config   func libbox_check_config(configJSON *C.char) *C.char { ... libbox.CheckConfig ... }
//export libbox_start          func libbox_start(configJSON *C.char) *C.char { server.StartOrReloadService(C.GoString(configJSON), &libbox.OverrideOptions{}) ... }
//export libbox_stop           func libbox_stop() ...
//export libbox_urltest        func libbox_urltest(outboundTag *C.char) C.int { client.URLTest(C.GoString(outboundTag)); ... } // async result:
//export libbox_urltest_take   func libbox_urltest_take(outboundTag *C.char) C.long { return delayMs }   // or JSON out param
//export libbox_free_string    func libbox_free_string(s *C.char) { C.free(...) }
func main() {}
```
`URLTest` is async; shim stores `URLTestDelay` in Go map on `WriteGroups`, exposes `libbox_urltest_take` (or returns JSON `{online,rttMs}`; `timeoutMs` passed to Go `context` inside shim; expose `approx=false`). **Dart side uses `ffigen`** on shim `.h`. 

### Build steps (concrete) `[VERIFIED: Makefile; cmd/internal/build_libbox/main.go; gomobile v0.1.13]`
**Common:**
```bash
go install github.com/sagernet/gomobile/cmd/gomobile@v0.1.13
go install github.com/sagernet/gomobile/cmd/gobind@v0.1.13
```
**Own C-shared shim (no gomobile needed for `c-shared`):**
```bash
# per ABI, CGO_ENABLED=1, CC=<abi-clang> for Android NDK; output .so / framework
go build -trimpath -buildmode=c-shared \
  -tags "with_gvisor,with_quic,with_wireguard,with_utls,with_naive_outbound,with_clash_api,badlinkname,tfogo_checklinkname0" \
  -ldflags "-X github.com/sagernet/sing-box/constant.Version=<ver> -s -w -buildid= -checklinkname=0" \
  -o <out>.so|<out>.dylib .
```
**Official gomobile path (if chosen instead):**
```bash
git clone https://github.com/SagerNet/sing-box -b v1.14.4 && cd sing-box
make lib_install
# Android (OpenJDK 17 REQUIRED + Android SDK; outputs libbox.aar + libbox-legacy.aar; API 24/21; arm64-v8a+armeabi-v7a(+x86/x86_64); -javapkg=io.nekohasekai; -libname=box)
make lib_android            # = go run ./cmd/internal/build_libbox -target android   [blocked in THIS env: no JDK]
# iOS (Xcode + macOS; outputs Libbox.xcframework; targets ios,iossimulator,tvos,tvossimulator,macos; iosversion 15.0; restrict `-platform ios` for arm64-only)
make lib_apple              # = go run ./cmd/internal/build_libbox -target apple [-platform ios]
```
**Android JDK requirement `[VERIFIED: cmd/internal/build_libbox/main.go checkJavaVersion]`:** `java --version` output must contain **`openjdk 17`**; `JAVA_HOME` honored; `log.Fatal("java version should be openjdk 17")`. Android SDK required (`FindSDK`); `ANDROID_HOME`/`ANDROID_SDK_ROOT`. **This env has no JDK (`/usr/bin/java` stub; "Unable to locate a Java Runtime") → Android libbox build BLOCKED here; documented fallback = silent `Socket.connect`.** iOS `arm64` + `iossimulator` buildable on this macOS + Xcode. 
**Go toolchain:** **Go 1.24+** (repo `go.mod`; installed `go1.26.3` `[VERIFIED]`); sing-box v1.14.4. `-checklinkname=0`, `badlinkname,tfogo_checklinkname0` tags `[VERIFIED]`. 

### Minimal sing-box config for ping `[VERIFIED: sing-box check passes]`
```json
{
  "log": { "level": "error" },
  "dns": { "servers": [ { "type": "local", "tag": "local" } ], "final": "local" },
  "inbounds": [],
  "endpoints": [ <wireguard endpoints...> ],
  "outbounds": [ { "type": "direct", "tag": "direct" }, <server outbounds... tag="srv-<id>"> ],
  "route": { "final": "direct" }
}
```
**sing-box 1.14 DNS = NEW format; legacy `dns.servers` removed in 1.14.1 `[VERIFIED: sing-box docs; flutter_sing_box note]`.** No TUN inbound needed for `urltest`. No `experimental.clash_api` needed (libbox uses its own gRPC daemon `[VERIFIED]`). `with_utls` build tag for Reality. URLTest default `https://www.gstatic.com/generate_204`. `generate_204`-equivalents (`http://www.gstatic.com/generate_204`, `https://cp.cloudflare.com/generate_204`, `http://connectivitycheck.gstatic.com/generate_204`) NOT exposed by libbox `URLTest` (uses sing-box default; our shim can choose, but `""`→gstatic). **`generate_204` URL + outbound tag name are agent discretion `[CONTEXT]`.** 

### Platform wiring `[CITED; Phase-20 context; CONTEXT D-08]`
- **Android:** vendor `libbox.aar` `android/app/libs/` (or C-shared `.so` `android/app/src/main/jniLibs/<abi>/`), `arm64-v8a`+`armeabi-v7a`, minSdk 24, OpenJDK17 build. `ACCESS_NETWORK_STATE`/`INTERNET`. (`VpnService`/`PlatformInterface.OpenTun` NOT needed for urltest-only Phase 19.) 
- **iOS:** vendor `Libbox.xcframework`/shim `.xcframework`, `arm64`, iOS 15.0+, link into Runner. `DynamicLibrary.process()` for C-shared linked-in `[CITED: singbox_ffi]`. No NetworkExtension needed for urltest-only. 
- **ffigen** `pubspec` `ffigen: ^23.0.0`, `ffi`. Generate `dart run ffigen --config ffigen.yaml`. 

---

## Critical Uncertainty #4 — Ping fallback reliability + `libbox.urltest` mechanics

**Primary (D-06):** `libbox.urltest` HTTP-through-outbound `generate_204`. **Fallback (D-07):** `dart:io Socket.connect(host, port, timeout:)`.
```dart
final sw = Stopwatch()..start();
final socket = await Socket.connect(host, port, timeout: timeout); // throws SocketException on refuse/timeout
sw.stop(); socket.destroy(); // measure CONNECT phase; RTT = sw.elapsedMilliseconds
```
- Real **TCP-connect RTT**, NOT ICMP, NOT through-proxy `[VERIFIED concept; D-07]`. Marked internally `approx`, **silent in UI**. 
- **host:** strip `[]` IPv6 brackets; `InternetAddress.tryParse` or `host` string; `Socket.connect(host,...)`. **port:** from share link (`server_port`; Hysteria2 first-port; VMess `port` string→int; WireGuard endpoint `peers[].port`). 
- **timeout:** same as phase (quick-path 800 ms; full 2000 ms; prototype manual 1500 ms; SEED connect(selected) 1500 ms `[CITED: prototype]`). `SocketException`/`TimeoutException` → `online=false`. 
- **Reliability caveats `[ASSUMED honest gap]`:** TCP success ≠ VPN credentials valid; can't distinguish `RST` vs silent drop; **UDP-only protocols (Hysteria2 QUIC/UDP, WireGuard UDP, SS-UDP) `Socket.connect`→offline when libbox absent**; can't measure through-proxy RTT; can't test TLS/Reality handshake. SEED §5 notes whitelist "голый TCP может быть заблокирован, handshake с правильным SNI проходит" — **libbox is required for whitelist reliability; silent TCP fallback may show offline** `[CITED: SEED-001 §5; D-07]`. 
- **`approx`** = `PingResult.approx` bool; `approx=true` on TCP fallback; `approx=false` on `urltest`. No UI. 

**Timeouts/parallelism (D-09 `[VERIFIED]`):**
- quick-path: **≤3 last-good, 800 ms**, parallel. 
- full ping: **all in tab, 2000 ms, concurrency 10–16**, updates UI per-result + final. `Future.wait`, bounded pool. 
- (prototype manual-select ping 1500 ms `[CITED]`.) 
- **Fresh cache:** `ping_cache` TTL **60 s**; `fresh = ts + 60s > now`; re-ping only after expiry or **manual refresh** or **network change** `[VERIFIED: D-10; prototype cacheFresh 60000]`. 

---

## Critical Uncertainty #5 — Reusable active-key logic in `lib/keys-service.ts`

`[VERIFIED: lib/keys-service.ts]` `KeyCache` Prisma `[VERIFIED: prisma/schema.prisma:245-270]`.
- **Read:** `listKeysByUserId(userId)` → `prisma.keyCache.findMany({where:{userId}, orderBy:{updatedAt:"desc"}})`, `toRenderedKey`, sort `STATUS_ORDER active→expiring→expired→pending→unknown`. `getKeyForUserId(userId,keyId)`. (`listKeys(telegramId)` TG variant.) 
- **Status:** `deriveStatusKind(status, expiresAt)` `[VERIFIED: lines 55-65]` — expiry wins: `remaining<=0→expired`, `remaining<=3d→expiring`, else `active`; `status` `pending`/`expired` only if no expiry; **`status` string `"ACTIVE"` observed** `[VERIFIED: contract key example]`, provider status NOT trusted for active when expiry known. `statusKind` lowercase enum `active|expiring|expired|pending|unknown`. 
- **Active-key gate for Phase 19 (D-21):** choose `statusKind === 'active' || 'expiring'`, `expiresAt` future, provider `status` not `expired/revoked/disabled`, **exclude trial-expired**, `keyId` non-empty. **Trial handling:** ARTEMIDA `trial:true` + `isTrial` mirror; trial key **is** active until `expireAt`; **trial cannot renew/upgrade** `[VERIFIED: contract; keys-service; PROJECT]`. `isTrial` does NOT disqualify from servers. `key.active` = computed bool; `key.isTrial`. **No active key → `no_active_key`.** 
- **Sync:** `revalidateKeysByUserId(userId)` — `artemida.listKeys()`, **ownership filter `customerRef === 'email:{userId}'`** `[VERIFIED: lines 204-211; T-02-22]` (mobile email accounts created `email:{userId}` `[VERIFIED: keys-service startTrialByUserId]`; **telegram-linked mobile users `customerRef === String(telegramId)`** `[VERIFIED: revalidateKeys]`). Ownership never assumed. 
- **`getKeyWithLinks`?** CONTEXT names `getKeyWithLinks`, **but it is NOT present in current `lib/keys-service.ts`** `[VERIFIED: read of `lib/keys-service.ts`; no such export; grep]`. Actual key-scoped reads are `getSubscriptionForUserId(userId,keyId) → SubscriptionForUser{subscriptionUrl,links,traffic}` (ownership-checked; propagates `ArtemidaError`; updates `keyCache`; tolerant; `subscriptionUrl` write guarded `[VERIFIED: lines 243-319]`) + `getSubscriptionLinks`. **Use `getSubscriptionForUserId`, not a non-existent `getKeyWithLinks`.** 
- **Subscription-links cache:** `KeyCache.subscriptionUrl` + ARTEMIDA `cached`; **no `links[]` column** `[VERIFIED]`. Recommend in-memory short-TTL `linksCache` keyed `keyId` (D-22). 
- **`remainingDays`:** key field `remainingDays` `[VERIFIED: contract]`; `KeyCache` has `expiresAt` (no remainingDays column); `daysUntilExpiry(expiresAt)`. `key.expireAt`. `key.active`. 

---

## Critical Uncertainty #6 — Backend route handler pattern (`app/api/mobile/servers/route.ts`)

Reuse `app/api/mobile/subscription/route.ts` + `app/api/mobile/auth/login/route.ts` `[VERIFIED]`.
```ts
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) { /* ... */ }
```
- `const claims = await verifyAccessToken(req); if (!claims) return NextResponse.json({error:"unauthorized"},{status:401});`.
- `NextResponse.json(body,{status})`. `logger.info/error`. `prisma`. try/catch → `{error:"internal"}` 500. `X-Request-Id`. **No secrets in logs; `Authorization` never logged.** `@/` alias `[VERIFIED: tsconfig]`. 
- **Output `{ simple: Server[], whitelist: Server[], key: {...} }`**; `key` nullable. 
- **Errors (D-21/D-22):** no active key → **`{ok:false,error:"no_active_key",simple:[],whitelist:[],key:null}` status `403`** (or 402; CONTEXT says 403/402); provider `ArtemidaError` → `{ok:false,error:<code>,...empty}` **not** 5xx; `unauthorized`(401)→`no_active_key`-safe handling; `rate_limited`→ maybe `Retry-After` passthrough; **both envelopes already parsed** `[VERIFIED: lib/artemida.ts]`. 

---

## Critical Uncertainty #7 — Network-change invalidation (`connectivity_plus` + Drift)

`[VERIFIED: mobile/lib/core/connectivity/connectivity_service.dart; connectivity_plus-7.3.2]`
- **connectivity_plus 7.3.2** `onConnectivityChanged` returns `Stream<List<ConnectivityResult>>`, **already `.distinct(...)`** internally; phase-18 `ConnectivityService` re-applies `.distinct()`, exposes broadcast `connectivityStream`, `connectivityServiceProvider`, `ConnectivityConfig.debounceDuration = Duration(milliseconds:500)`. `ConnectivityResult` `[VERIFIED pub-cache]`. 
- **Pattern (D-11):** listen `connectivityService.connectivityStream`; **skip initial emission**; on change (e.g. `wifi↔mobile`, `none→...`, set differs) **`await pingCache.clear()` (delete `ping_cache`) + clear `last_good` + `lastGoodPrefs`, keep `selection`**; **cancel in-flight pings** (token/generation counter like prototype `pingToken`); next connect does **fresh ping**. **Debounce 500 ms.** `ConnectivityService._updateStatus()` emits once at startup `[VERIFIED]` — guard. 
- **Karing bug `[CITED: SEED-001 §5]`:** urltest doesn't survive network change → must invalidate + re-ping; Phase 19 re-pings; auto-reconnect deferred to Phase 20. 
- **Read-only network chip** Wi-Fi/LTE `[VERIFIED: prototype netChip; D-11/D-19]`; **no manual simulation**. `vpn` result: note Phase 20 VPN would itself emit connectivity change; Phase 19 has no tunnel. 

---

## Critical Uncertainty #8 — Existing libbox/sing-box in repo / `.planning/research`

`[VERIFIED: repo scan]`
- **No native libbox/sing-box artifacts in repo** (no `libbox.aar`, `Libbox.xcframework`, `*.so`, Go shim, `ffigen.yaml`); `mobile/android/app/src/main/jniLibs` absent; no `libbox` in `mobile/pubspec.yaml`. Phase 18 declared `VPN_MANAGE`/`FOREGROUND_SERVICE*` permissions (no `ACCESS_NETWORK_STATE` added manually; plugin adds it; no `BIND_VPN_SERVICE` yet `[VERIFIED: mobile/android/app/src/main/AndroidManifest.xml]`; Phase 20). 
- **`.planning/research/`** records intent only: `STACK.md` (libbox sing-box latest, GPL-3.0, dynamic linking, `ffigen`, `with_*`, Drift 2.18→, connectivity_plus; **stale versions**); `ARCHITECTURE.md` (client ping/urltest, `serverPoolProvider/pingCacheProvider/connectionProvider`, `bestServerProvider`, `/api/mobile/servers`, **NOTE says source ARTEMIDA `/pricing`+`/servers` — CONTEXT D-01 OVERRIDES**); `PITFALLS.md` (GPL-3.0, network-change stale cache, UDP/IPv6/DNS, build); `SUMMARY.md`. 
- **18-RESEARCH.md** mentions libbox only in passing (no concrete symbol). 
- **Conclusion:** Phase 19 builds libbox FFI **from scratch**; own shim recommended; **silent TCP fallback mandatory** so absence of native artifact still passes. 

---

## Critical Uncertainty #9 — GPL-3.0 implications (recorded known blocker; NOT re-solved)

`[VERIFIED: sing-box v1.14.4 LICENSE; pkg.go.dev note; .planning research]`
- sing-box + `experimental/libbox` = **GPL-3.0-or-later** (repo `Copyright (C) 2022 nekohasekai`; "either version 3 ... or (at your option) any later version"). pkg.go.dev shows `GPL-2.0` for the subpackage `[CITED]`, but repo-root `LICENSE` governs → **treat GPL-3.0.** (Repo's own notes say GPL-3.0 `[VERIFIED: .planning/research/STACK.md; PITFALLS.md; PROJECT]`.) Karing also GPL-3.0. 
- **Implications (known blocker; note only):** dynamic linking **does NOT automatically avoid** GPL-3.0 for GPL-3.0 core; providing source / corresponding-source offer + license notices likely required; app-store compatibility needs **legal review**. Recommended mitigations already recorded: dynamic linking (`dylib`/`.so`), isolate, source offer, license file. **Phase 23** (GPL compliance) + external legal review. **Alternative** `Xray-core` MPL-2.0 **but** lacks Hysteria2/Reality parity `[CITED: .planning/research]` — rejected. 
- **MPL-2.0 note.** Not chosen. 
- **Native build provenance:** `sing-box-lib` prebuilt binaries `[CITED]` still GPL-3.0. 
- **Not re-solving.** Phase 19 records + keeps `with_clash_api`/`with_utls`. 

---

## Architecture Patterns

### System Architecture Diagram
```
                         (RU user, Flutter 3.50.1 / Dart 3.14; Android arm64-v8a/armeabi-v7a | iOS arm64)
   ┌────────────────────────────── FLUTTER CLIENT ──────────────────────────────┐
   │  Prototype dark UI (no bottom nav)                                          │
   │    ServerPoolScreen: header + key pill + net chip + refresh + banner        │
   │      + two tabs(Простой VPN / Обход белых списков) + toolbar + server list  │
   │      + "Автовыбор" + connect panel + "Подключить" (selection only, P19)     │
   │  Riverpod: serverPoolProvider · pingCacheProvider · bestServerProvider      │
   │            currentTabProvider(per-tab persisted) · selection per-tab        │
   │  core/ping: PingRepository ── LibboxPingService(urltest) ──┐                │
   │                                   └── SocketPingService(Socket.connect,approx,silent fallback)│
   │  core/db: Drift SQLite  ping_cache(server_id,tab,rtt,online,ts) TTL60s     │
   │                          last_good(tab,server_id,ts) ≤5 dedupe · selection  │
   │  connectivity_plus (.distinct) ── on network change ── clear ping_cache+last_good + cancel in-flight │
   │  dio → /api/mobile/servers (JWT AuthInterceptor single-flight refresh)      │
   └──────────────────────────────┬──────────────────────────────────────────────┘
            HTTPS GET /api/mobile/servers (Bearer access token)        │
   ┌──────────────────────────────▼─────────────── NEXT.JS 16.3.7 BFF ──────────┐
   │ app/api/mobile/servers/route.ts  force-dynamic                              │
   │   verifyAccessToken(JWT) → active key from KeyCache(prisma.keyCache,userId) │
   │   → artemida.getSubscriptionLinks(keyId) [server-to-server Bearer; retry;   │
   │      cache-first KeyCache + cached; 401/402/409/429/502/503+Retry-After;    │
   │      both error envelopes]                                                  │
   │   → lib/server-pool.ts: parseShareLink + classifyPool + parseRemark         │
   │      (vless/ss/hysteria2+hy2/trojan/wg+wireguard/vmess; NO /pricing;        │
   │       raw link kept server-side; no secrets for cards; no logs)             │
   │   → { simple, whitelist, key }                                              │
   └──────────────────────────────┬──────────────────────────────────────────────┘
                                  │ server-to-server ONLY (never client)
                                  ▼  ARTEMIDA Paid API V1 https://artemida.cc/v1
                         GET /keys · GET /keys/{id}/subscription-links  (Bearer ARTEMIDA_API_KEY)
   ┌────────────────────────────── CLIENT-SIDE PING ──────────────────────────┐
   │  C-shared libbox shim (sing-box v1.14.4; no TUN) + ffigen                 │
   │   libbox.Setup → CommandServer.StartOrReloadService(minimal sing-box json)│
   │   → CommandClient(CommandGroup).URLTest(tag)                              │
   │   → WriteGroups → OutboundGroupItem.URLTestDelay(ms)/URLTestTime          │
   │   generate_204 = https://www.gstatic.com/generate_204 · NOT ICMP          │
   │   silent fallback: dart:io Socket.connect(host,port,timeout) → approx     │
   └───────────────────────────────────────────────────────────────────────────┘
```

### Backend patterns
**Pattern B1: Reuse `verifyAccessToken` + `keys-service`.** `[VERIFIED]`; no new auth. Active key from `keys_cache`; ownership `userId`. 
**Pattern B2: `artemida` singleton.** `[VERIFIED: lib/artemida.ts:752]` `export const artemida = createArtemidaClient()`. `getSubscriptionLinks`. Tolerant zod + normalizers. `ArtemidaError.code`. 
**Pattern B3: `force-dynamic`.** `[VERIFIED]`. 
**Pattern B4: cache-first + graceful degradation.** `KeyCache` + ARTEMIDA `cached`; serve cached on provider error; empty + toast; `Retry-After`. (D-22.) 
**Pattern B5: server-side parser `lib/server-pool.ts`.** Pure functions `parseShareLink`, `classifyPool`, `parseRemark`, `flagToCc`, `buildOutbound`; **no I/O**; exhaustive tests. 

### Mobile patterns
**Pattern M1: Riverpod `AsyncNotifier`/`StreamProvider`.** `[VERIFIED: phase 18; Riverpod 3.4.2]`. 
```dart
// generated with riverpod_annotation + build_runner; freezed models.
@riverpod
Future<ServerPools> serverPool(ServerPoolRef ref) async { /* dio GET Endpoints.servers */ }

@riverpod
Stream<Map<String, PingResult>> pingCache(PingCacheRef ref) { /* Drift watch ping_cache */ }

@riverpod
Server? bestServer(BestServerRef ref) { /* derived: online-first, RTT asc; load deferred */ }
```
Names are agent discretion but **`serverPoolProvider`, `pingCacheProvider`, `bestServerProvider` are locked** `[VERIFIED: D-19/roadmap 19.11]`. 
**Pattern M2: `PingRepository`.** `Future<PingResult> ping(Server, {required timeout})`. `LibboxPingService` + `SocketPingService`. `approx`. concurrency. cancellation token. 
**Pattern M3: `DriftPingCache`.** `PingCacheDao`; `upsert`, `watchFresh`, `clear`, `markOnline`. TTL filter `ts >= now-60000`. 
**Pattern M4: connectivity invalidation.** listen `connectivityStream`; `skip(1)`; `distinct`; `clearPingCache + clearLastGood`; cancel in-flight. 
**Pattern M5: libbox service.** `LibboxPingCore` `init`, `start(configJson)`, `stop`, `urltest(tag, timeout)`, `dispose`; **singleton per app**; **serialize urltests** (sing-box internal); **never log config (secrets)**. 
**Pattern M6: server-list offline cache.** last `{simple,whitelist}` in Drift; offline toast; connection requires core. (D-10.) 

### Recommended project structure (added)
```
app/api/mobile/servers/route.ts                 # NEW backend
lib/server-pool.ts                              # NEW parser + classifier (+ tests)
mobile/lib/features/servers/                    # or features/server_pool/
  server.dart · providers.dart · server_pool_screen.dart · widgets/...
mobile/lib/core/ping/                           # libbox + socket + PingResult + concurrency
mobile/lib/core/db/                             # Drift db + ping_cache(+last_good,selection,current_tab)
mobile/native/libbox_shim/                      # own Go C-shared shim + generated Dart (ffigen)
mobile/android/app/libs/libbox.aar | jniLibs/   # built artifacts (gitignored binaries / CI)
mobile/ios/Frameworks/Libbox.xcframework        # built artifact
mobile/lib/app/theme.dart                       # dark prototype rewrite
mobile/lib/app/router.dart                      # replace _HomeScreen; remove NavigationBar; +/shop
```

### Anti-Patterns to Avoid
- **Calling ARTEMIDA from client** (server-to-server only `[VERIFIED]`). 
- **Using ARTEMIDA `/pricing`** for servers (D-01). 
- **Simulating ping** (`Math.random`) / **fake connection** / **fake IP** `[VERIFIED prototype replaced]`; **no `load`** (D-04). 
- **ICMP ping** (D-06 says HTTP urltest; Android ICMP needs root anyway). 
- **Returning raw share links / secrets in card list; logging links** (D-05; security `[VERIFIED]`). 
- **Assuming `getKeyWithLinks` exists** `[VERIFIED not present]`. 
- **Assuming `URLTest` returns RTT** `[VERIFIED returns error; RTT async]`. 
- **Binding gomobile `.aar`/`.xcframework` via `dart:ffi`** `[VERIFIED not C-ABI]`. 
- **Using `sing-ffi` `_new`** `[VERIFIED non-public]`. 
- **sing-box WireGuard as outbound** `[VERIFIED removed 1.13 → endpoint]`. 
- **legacy sing-box DNS format** `[VERIFIED removed 1.14.1 → new]`. 
- **network-change stale cache** (Karing bug `[CITED]`). 
- **trusting `status` string over `expiresAt`** `[VERIFIED deriveStatusKind]`. 
- **trial renew/upgrade** `[VERIFIED]`. 

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| VPN protocols (VLESS/SS/Hy2/Trojan/VMess/WG, Reality, TLS, uTLS) | own proxy core | **sing-box libbox** | protocol correctness; GPL-3.0 recorded |
| HTTP-through-outbound ping | own TLS/handshake prober | **`libbox.urltest` (`URLTest` + `generate_204`)** | real RTT; whitelist/Reality needs handshake `[CITED SEED]` |
| `generate_204` reachability | custom endpoint server | sing-box default + optional shim URL | nothing to host |
| sing-box config build/validate | string templating without check | `libbox.CheckConfig` + `StartOrReloadService` | `[VERIFIED]` |
| Dart↔C FFI bindings | hand-written `dart:ffi` | **`ffigen`** on shim `.h` | `[CONTEXT]` |
| SQLite reactive + migrations | hand SQL + change notify | **Drift** | typed; `drift_dev` |
| ping TTL cache | hand expiry | Drift query `ts > now-60000` | simple but persistent |
| network-change detection | platform channels | **`connectivity_plus`** `.distinct()` | `[VERIFIED]` |
| auth + refresh | custom JWT | existing `verifyAccessToken` + `AuthInterceptor` | phase 18 `[VERIFIED]` |
| ARTEMIDA HTTP + retry + error mapping | new client | **`artemida`** + `ArtemidaError` + p-retry | `[VERIFIED]` |
| key cache + ownership | new store | **`KeyCache`/`keys-service`** | `[VERIFIED]` |
| share-URI parse | pull random package | own `parseShareLink` `[ASSUMED none official; sing-box none]` | protocol control; no new dep |

**Key insight:** sing-box is a full core; libbox exposes a typed async command API; Drift/`connectivity_plus`/Riverpod are mature. Phase 19's *own* code is **one parser + one route + one ping repo + one cache + one shim + UI**, not a VPN.

---

## Common Pitfalls

### Pitfall 1: `links[]` not what you expect `[ASSUMED verify on live key]`
**What goes wrong:** assume bare share-URIs; real `links[]` may differ (`hy2`,`wireguard`,`.conf`, base64 blob, `protocols.*`). `vless://placeholder` unparseable `[VERIFIED]`. `count≠links.length`. 
**How to avoid:** tolerant parser; skip unparseable entries; `links.length?links:vless`; re-verify on a real paid key; `[ASSUMED]` checkpoint. 

### Pitfall 2: `URLTest` returns `error`, not RTT `[VERIFIED]`
**What goes wrong:** `await urltest(...)` expecting number. 
**How to avoid:** subscribe `CommandGroup`, read `OutboundGroupItem.URLTestDelay`; `URLTestTime` to know fresh; `0,0`=no history; failed→cleared; bound with timeout; tag must match outbound/endpoint tag. 

### Pitfall 3: gomobile output ≠ C-ABI `[VERIFIED]`
**What goes wrong:** `ffigen` on `.aar`/`.xcframework`. 
**How to avoid:** own C-shared shim; OR platform channels. 

### Pitfall 4: Android JDK17 + Android SDK for libbox `[VERIFIED]`
**What goes wrong:** `checkJavaVersion` fails; `FindSDK`. 
**How to avoid:** OpenJDK 17; `JAVA_HOME`; Android SDK; **blocked in this env → fallback**. CI build. 

### Pitfall 5: sing-box 1.14 WireGuard endpoint `[VERIFIED]`
**What goes wrong:** WG outbound removed. 
**How to avoid:** `endpoints[]`. 

### Pitfall 6: sing-box 1.14 DNS new format `[VERIFIED]`
**How to avoid:** `dns.servers[{type:local,...}]`. 

### Pitfall 7: Reality needs `with_utls` + correct `pbk/sid/sni/fp/flow` `[VERIFIED]`
**What goes wrong:** `uTLS required by reality`, handshake fail → offline. 
**How to avoid:** parse `pbk`,`sid`,`sni`/`serverName`,`fp`,`flow`; default `fp=chrome`; `security=reality`; **whitelist pool**; SNI allowlist NOT enforced (D-02; display only `[VERIFIED]`). 

### Pitfall 8: silent TCP fallback masks real failure `[ASSUMED honest]`
**What goes wrong:** `Socket.connect` ok but proxy broken; UDP-only server offline under fallback. 
**How to avoid:** fallback only when libbox absent/urltest failed; `approx`; don't equate TCP-ok with online-VPN; D-06 primary. 

### Pitfall 9: network-change stale cache (Karing bug `[CITED]`)
**How to avoid:** `connectivity_plus.distinct`; clear `ping_cache`+last-good; cancel in-flight; re-ping; debounce 500ms; skip initial. 

### Pitfall 10: `count`/empty + provider errors `[VERIFIED]`
**What goes wrong:** `no_active_key`, `unauthorized`, `payment_required`, `conflict`, `rate_limited`, `bad_gateway`, `unavailable`, `not_found`,`unknown`; `Retry-After`; string-error 404. 
**How to avoid:** `artemida` retry `429/502/503`+`Retry-After`; map; empty pools; cached + toast; never 5xx to client; no secret logs. 

### Pitfall 11: `deriveStatusKind` + trial `[VERIFIED]`
**What goes wrong:** expired `status` stale; trial treated no-key; trial renew. 
**How to avoid:** expiry-derived; exclude trial-expired; `no_active_key`. 

### Pitfall 12: `getKeyWithLinks` doesn't exist `[VERIFIED]`
**How to avoid:** `getSubscriptionForUserId`. 

### Pitfall 13: secrets `[VERIFIED D-05 + security]`
**What goes wrong:** raw `vless://` logged/committed; `ARTEMIDA_API_KEY`. 
**How to avoid:** server-only; card metadata + minimal `outbound`; never log links/keys; `.env`. 

### Pitfall 14: `Socket.connect` details `[CITED dart:io]`
**What goes wrong:** IPv6 `[]`; `port` string; not destroying socket; timeout type. 
**How to avoid:** strip brackets; `int.tryParse`; `socket.destroy()`; catch `SocketException`/`TimeoutException`; `timeout:`. 

### Pitfall 15: Drift code-gen + Flutter version
**What goes wrong:** missing `drift_dev`/`build_runner`; sdk `>=3.10`. 
**How to avoid:** `dart run build_runner build`; `drift_flutter`. 

---

## Code Examples

*(Reference patterns; exact freezed/Riverpod names are agent discretion; locked provider names `serverPoolProvider`/`pingCacheProvider`/`bestServerProvider`. NOT runnable until libbox shim + generated code exist.)*

### Backend route (`app/api/mobile/servers/route.ts`) `[VERIFIED pattern + contract]`
```ts
import { NextRequest, NextResponse } from "next/server";
import { verifyAccessToken } from "@/lib/mobile-auth";
import { logger } from "@/lib/logger";
import { listKeysByUserId, deriveStatusKind, daysUntilExpiry } from "@/lib/keys-service";
import { getSubscriptionLinksCacheFirst } from "@/lib/servers-source"; // recommended wrapper around artemida.getSubscriptionLinks + KeyCache
import { parsePools, type ServerPools } from "@/lib/server-pool";

export const dynamic = "force-dynamic";

const empty = (key: unknown) => ({ simple: [], whitelist: [], key });

export async function GET(req: NextRequest) {
  const started = Date.now();
  try {
    const claims = await verifyAccessToken(req);
    if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    // active key (KeyCache; only active/expiring; not trial-expired) — D-21
    const keys = await listKeysByUserId(claims.userId);
    const active = keys.find(k =>
      k.keyId &&
      (deriveStatusKind(k.status, k.expiresAt ? new Date(k.expiresAt) : null) === "active" ||
       deriveStatusKind(k.status, k.expiresAt ? new Date(k.expiresAt) : null) === "expiring") &&
      (!k.expiresAt || new Date(k.expiresAt).getTime() > Date.now()));
    const keyMeta = active
      ? { active: true, keyId: active.keyId, isTrial: active.isTrial,
          remainingDays: daysUntilExpiry(active.expiresAt), expireAt: active.expiresAt }
      : null;

    if (!active) {
      logger.info({ route: "/api/mobile/servers", userId: claims.userId, outcome: "no_active_key" });
      return NextResponse.json(
        { ok: false, error: "no_active_key", simple: [], whitelist: [], key: null },
        { status: 403 }, // 402 also acceptable per D-21
      );
    }

    let links: string[] = [];
    let stale = false;
    try {
      const res = await getSubscriptionLinksCacheFirst(claims.userId, active.keyId); // artemida.getSubscriptionLinks
      links = res.links; stale = res.cachedFromLocal ?? false;
    } catch (err) { // ArtemidaError → empty + stale cache + (caller toasts) — D-22
      logger.error({ route: "/api/mobile/servers", error: String(err) }); // NEVER log links
      links = (await getCachedLinks?.(claims.userId, active.keyId)) ?? [];
      stale = true;
    }

    const pools = parsePools(links); // {simple, whitelist}
    logger.info({ route: "/api/mobile/servers", userId: claims.userId, outcome: "success",
      simple: pools.simple.length, whitelist: pools.whitelist.length, stale, durationMs: Date.now() - started });
    return NextResponse.json({ ok: true, ...pools, key: keyMeta, stale });
  } catch (err) {
    logger.error({ route: "/api/mobile/servers", error: String(err) });
    return NextResponse.json({ ok: false, error: "internal", simple: [], whitelist: [], key: null }, { status: 200 }); // D-22 empty + toast; not 5xx
  }
}
```

### Parser (`lib/server-pool.ts`) `[CITED formats + D-02/D-03]`
```ts
export type PoolTab = "simple" | "whitelist";
export interface Server {
  id: string; name: string; city: string; cc: string; flag: string;
  proto: string; sni?: string; tab: PoolTab; host: string; port: number;
  protocol: string; outbound: Record<string, unknown>; // minimal sing-box; no raw link
}
const WL = /(?:\bWL\b|whitelist|обход)/i;
export function classifyPool(remark: string, scheme: string, security: string | undefined): PoolTab {
  if (WL.test(remark)) return "whitelist";
  if (!WL.test(remark) && scheme === "vless" && security === "reality") return "whitelist";
  return "simple";
}
// flag emoji U+1F1E6..U+1F1FF pair -> cc; city = remaining text; strip WL markers for display.
export function parseShareLink(raw: string): Server | null { /* scheme dispatch; skip unparseable */ }
```

### Drift `ping_cache` `[VERIFIED drift 2.35.4]`
```dart
class PingCache extends Table {
  TextColumn get serverId => text()();
  TextColumn get tab => text()();           // 'simple'|'whitelist'
  IntColumn get rtt => integer().nullable()();
  BoolColumn get online => boolean()();
  IntColumn get ts => integer()();          // epoch ms
  BoolColumn get approx => boolean().withDefault(const Constant(false))();
  @override Set<Column> get primaryKey => {serverId, tab};
}
// fresh = ts >= DateTime.now().millisecondsSinceEpoch - 60000
// @DriftDatabase(tables:[PingCache, LastGood, Selection, ...]) ... driftDatabase(name:'app_db')
```

### `PingResult` (freezed) `[VERIFIED D-10]`
```dart
@freezed class PingResult with _$PingResult {
  const factory PingResult({ required bool online, int? rttMs, required bool approx,
    required int tsMs, }) = _PingResult; // not persisted raw; cached in Drift
}
```

### Ping (`core/ping`) `[VERIFIED D-06/D-07/D-09]`
```dart
Future<PingResult> pingServer(Server s, {required Duration timeout}) async {
  if (libboxReady) {
    final r = await libbox.urltest(tagFor(s), timeout); // URLTest + WriteGroups
    if (r.online) return PingResult(online: true, rttMs: r.rttMs, approx: false, tsMs: now);
  }
  // silent fallback — NOT exposed in UI (D-07)
  final sw = Stopwatch()..start();
  try { final sock = await Socket.connect(s.host, s.port, timeout: timeout); sw.stop(); sock.destroy();
        return PingResult(online: true, rttMs: sw.elapsedMilliseconds, approx: true, tsMs: now); }
  on SocketException { return PingResult(online:false, rttMs:null, approx:true, tsMs:now); }
  on TimeoutException { return PingResult(online:false, rttMs:null, approx:true, tsMs:now); }
}
// fullPing(tab, servers, timeout: 2000ms, concurrency: 10..16)
// quickPath(lastGood.take(3), timeout: 800ms) -> best online else fullPing
```

### Network invalidation `[VERIFIED D-11 + connectivity_plus]`
```dart
connectivityService.connectivityStream.skip(1).listen((_) async {
  cancelInflight();                      // generation token
  await db.pingCache.deleteAll();        // clear ping_cache
  await clearLastGood();                 // clear last_good
  // selection + current_tab preserved
});
```

### connect(mode) per SEED §5 (Phase 19 subset; tunnel = Phase 20 `[CITED]` `[VERIFIED D-18]`)
```dart
// no active key -> shop stub (P19); 
// selected != auto -> ping(selected, 1500); offline -> "Сервер недоступен — включаю автовыбор" + auto;
// auto -> freshCache?bestOnline : (lastGood.take(3).pingParallel(800)->alive?bestOnlineLastGood : fullPing(2000)->bestOnline);
// P19 stops at SELECTION + lastGood.pushFront(dedupe,<=5); NOT core.start (Phase 20); NOT simulated.
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| ICMP ping | `libbox.urltest` HTTP `generate_204` through outbound | always for VPN; sing-box `URLTest` | real proxy RTT; whitelist/Reality |
| assume `URLTest`→RTT | `URLTest(tag)` + `WriteGroups.URLTestDelay` | sing-box libbox v1.14.4 `[VERIFIED]` | async read-back |
| gomobile + platform channels only | own C-shared shim + `ffigen` for `urltest`-only | `sing-ffi` non-public `[VERIFIED]` | true `dart:ffi` |
| sing-box WireGuard **outbound** | WireGuard **endpoint** | sing-box 1.11 deprecated / **1.13 removed** `[VERIFIED]` | `endpoints[]` |
| legacy `dns.servers` | **new DNS** `servers[{type:local...}]` | sing-box **1.14.1** `[VERIFIED]` | 1.14.4 requires |
| `wireguard://` vs `wg://` | accept both + `.conf` | community `[CITED]` + D-01 `wg://` | tolerant parse |
| prototype localStorage/simulated ping | real `/api/mobile/servers` + `libbox`/`Socket` + Drift | Phase 19 `[VERIFIED]` | production |
| ARTEMIDA `/pricing` servers | **subscription-links parsing** | CONTEXT D-01 **overrides** `.planning/research/ARCHITECTURE.md` `[VERIFIED]` | contract |
| `load` bar | **deferred**; no `load`; no simulation | D-04/REQ-POOL-04 `[VERIFIED]` | RTT-only ranking |
| GPL dynamic-link assumption | **GPL-3.0-or-later legal review** | `[VERIFIED LICENSE]` + recorded blocker | Phase 23 |

**Deprecated/outdated:**
- `.planning/research/STACK.md` versions (Flutter 3.24, Riverpod 2.5, Drift 2.18, connectivity_plus 6, `uni_links`, `/api/servers`, `/pricing` source) `[VERIFIED actual pubspec]`. 
- `uni_links` → `app_links 7.2.2` `[VERIFIED]`. 
- WireGuard outbound `[VERIFIED]`. 
- sing-box legacy DNS `[VERIFIED]`. 
- `sqlite3_flutter_libs` **EOL** `[VERIFIED 0.6.0+eol]`. 
- prototype ping `Math.random`, `load`, fake IP, `sleep`, network toggle simulation `[CITED]` — replaced/removed. 
- REQ-POOL-02 `load` + REQ-BE-02 `/pricing` + `load` `[VERIFIED REQUIREMENTS]` — **superseded** by CONTEXT D-01/D-04. 

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support | Status |
|----|-------------|------------------|--------|
| REQ-POOL-01 | **Two Tabs** "Простой VPN"/"Обход белых списков"; state persisted | prototype two-tab; `poolClassifier`; Drift `current_tab` + `selection`; D-14 `[VERIFIED]` | address |
| REQ-POOL-02 | **Server List from Backend** `GET /api/mobile/servers` `{simple:[],whitelist:[]}` `id,city,cc,flag,proto,load,sni?`; pull-to-refresh | **CONTEXT supersedes `load`**: D-03 `id,name,city,cc,flag,proto,sni?,tab`, **no `load`** (D-04); **CONTEXT supersedes source**: subscription-links NOT `/pricing` (D-01); pull-to-refresh = manual reload + ping refresh `[VERIFIED REQUIREMENTS + CONTEXT]` | address (`load` not sent; note) |
| REQ-POOL-03 | **Protocol Badge** WG/SS/VLESS/HY2/TR per server | `proto` `WireGuard/Shadowsocks/VLESS/VLESS · Reality/Hysteria2/Trojan/VMess`; prototype `pc` `[VERIFIED D-03 + prototype]` | address |
| REQ-POOL-04 | **Load Indicator** bar 0-100 from `load` | **DEFERRED** per CONTEXT D-04 + phase scope; no `load`; no simulation; `loadClass` exists in prototype but unused `[VERIFIED CONTEXT D-04; deferred §]` | **deferred** |
| REQ-POOL-05 | **SNI Display** whitelist only `SNI: domain` | `sni`=`sni`/`serverName`, only `whitelist` `[VERIFIED D-03 + prototype]` | address |
| REQ-PING-01 | **HTTP Urltest via libbox** RTT + online | `libbox.urltest`→`URLTest`+`generate_204`+`URLTestDelay` `[VERIFIED sing-box]`; **honest note CONTEXT says `libbox.urltest(url)`, real is `URLTest(outboundTag)`** | address |
| REQ-PING-02 | **Quick Path** ≤3 last-good 800ms; else full | `last_good`≤5 dedupe per-tab; ≤3; 800ms `[VERIFIED D-09/D-12 + prototype + SEED]` | address |
| REQ-PING-03 | **Full Ping** parallel all in tab 2000ms; RTT/офлайн | 2000ms; concurrency 10–16 `[VERIFIED D-09 + prototype]` | address |
| REQ-PING-04 | **Cache TTL 60s** Drift `ping_cache(server_id,tab,rtt,online,ts)`; re-ping after 60s or manual | Drift; TTL `ts+60000`; clear on refresh + network `[VERIFIED D-10 + prototype]` | address |
| REQ-PING-05 | **Network Change Invalidation** `connectivity_plus`→clear cache; WiFi↔LTE | `.distinct()`; clear `ping_cache`+last-good; cancel in-flight `[VERIFIED D-11 + connectivity_plus source + Karing bug]` | address |
| REQ-PING-06 | **Best Server** sort RTT asc, load asc; auto; manual persists | RTT-only now (`load` deferred); `bestServerProvider`; `selection` `[VERIFIED D-13 + prototype bestOnline]` | address (`load` deferred) |
| REQ-PING-07 | **Last-Good Chip** «последний» on most recent successful | `last_good[tab][0]`; `last_good`; note Phase-19 "most recent successful server" not connected `[VERIFIED D-12 + prototype]` | address |
| REQ-PING-08 | **Manual Refresh** full ping; spinner; toast «Пинг обновлён» | clear TTL; `refresh` `[VERIFIED D-17 + prototype refreshBtn + `setBusy`]` | address |

*(REQ-POOL-02 wording says `load`, REQ-POOL-04 load bar, REQ-BE-02 `/pricing`; **CONTEXT D-01/D-03/D-04 supersede** `[VERIFIED REQUIREMENTS.md:29-34,119; CONTEXT]`.)*
</phase_requirements>

---

## Phase 19 UI — full prototype layout (D-15/D-16/D-17/D-18/D-19/D-20) `[VERIFIED prototype + CONTEXT]`

**Remove** `_HomeScreen`'s bottom `NavigationBar` + `currentTabProvider` bottom-nav wiring `[VERIFIED: mobile/lib/app/router.dart:144-171]`. Keep auth routes `/auth`,`/register`,`/telegram-wait`,`redirect`,`refreshListenable`,`authNotifierProvider`. Home `/`. Add `/shop` stub route + profile/logic **sheets**. **`/` currentTabProvider** repurposed for **pool tab `simple|whitelist`**, persisted. 

**Main screen structure (prototype `#screen-main`):**
- **Status bar** (prototype artifact; native OS; read-only). 
- **Header `main-head`:** brand `3set.online`, logo; `mh-actions` **refresh** `refreshBtn`(→ full ping + «Пинг обновлён», spinner), **`shopBtn`**(→ `/shop` stub «Купить»/«Магазин»), **`logicBtn`**(→ «Как это работает» sheet stub; can fill prototype 6-step text), **`avatarBtn`**(→ profile sheet stub); **greeting** (`Доброе утро/Добрый день/Добрый вечер, {name}`); **status pill** `VPN выключен`/`VPN активен · защита включена`/`Подключение…` (P19 idle-only); **key pill `ключ · N дн.` / `Ключ истёк` / `Нет ключа`** (D-20 `key.active`,`key.remainingDays`,`key.expireAt`); **date pill** ru `weekday day month`. 
- **Banner** `Ключ неактивен — серверы недоступны` + `Купить` (stub) when no active key (D-21); also `Нет активного ключа`; offline toast + «Повторить» on provider error. 
- **Tabs** `simple`→`Простой VPN`, `whitelist`→`Обход белых списков`, selected style, `aria-selected`; **switching tab does not tear anything (no tunnel P19); per-tab selection + last-good** (D-14); per-tab ping. 
- **Toolbar:** `modeDesc` (`simple`: `Полный туннель · весь трафик через сервер · WireGuard / Hysteria2 / SS`; `whitelist`: `Reality с SNI разрешённых доменов · работает при белых списках оператора`); **read-only network chip** Wi-Fi/LTE `[CITED prototype; D-11/D-19; no simulation]`; refresh button. 
- **Server list** scrollable: **`Автовыбор` card first** (bolt, `Выберу самый быстрый сервер`, best server `Лучший: {city} · {proto}` + ping); each server: `flag`, `name`/`city`, `cc`, secondary `host`, `proto` badge, `SNI:` (whitelist), **`последний` chip** on `last_good[tab][0]`, **ping** (`N мс` color `good/mid/warn/bad`, `офлайн`+`нет ответа`, `—`/wait); **NO load bar** (D-04). Selected state; manual select persists per-tab; **all offline → `Нет доступных серверов. Попробуй другой таб`, `Повторить`, suggest other tab** (D-13). 
- **Connect panel + button:** `conn-panel` (server/proto/IP/ping/timer/traffic — **Phase 19 shows selection; IP/timer/traffic Phase 20; NOT simulated**); **`Подключить`** → **server selection only** (D-18): quick-path→full→highlight; auto selects best; no tunnel; after selection indicate **VPN core = Phase 20**; no `Подключение отменено`/`Отключить` FSM in P19. **no active key → blocked + `Нет активного ключа` + `Купить` stub.** hint `Автопинг перед подключением · быстрый путь по последним живым серверам`. 
- **Ping colors `pingClass(rtt,online)`** `[CITED prototype line 625; D-16]`: `!online→bad(offline)`, `rtt<=60 good`, `<=110 mid`, `<=180 warn`, `else bad`. **`loadClass` NOT used.** 
- **Toasts** (lime/teal/red/amber; `Пинг обновлён`,`офлайн`,`Повторить`,`Нет активного ключа`,`Купить`,`Кеш пинга сброшен`,`Нет доступных серверов`,`Сервер недоступен — включаю автовыбор`...). **Russian copy D-17 + prototype** `[VERIFIED]`. 

### Dark theme `AppTheme.dark` app-wide (D-16 `[VERIFIED prototype CSS + mobile/theme.dart]`)
Palette (verbatim prototype `:root`): `--bg #0e1512`, `--bg2 #0b110e`, `--surface #131c16`, `--surface2 #182419`, `--surface3 #1d2b1f`, `--line rgba(183,255,69,.14)`, `--line2 rgba(183,255,69,.3)`, `--lime #b7ff45`, `--lime2 #d4ff85`, `--lime3 #7fd41f`, `--teal #3ee6b0`, `--amber #ffc24b`, `--red #ff6b6b`, `--blue #2aabee`, `--text #f2f7ec`, `--muted #a7b8a9`, `--dim #6f8272`, `--grad linear-gradient(135deg,#d4ff85,#7fd41f)`, `--grad-teal linear-gradient(135deg,#8ffbe0,#1fbf8f)`, `--r 18px`. Fonts `Manrope Variable`, `Unbounded Variable`, `JetBrains Mono Variable`. Buttons primary/ghost/danger. Ping colors good/mid/warn/bad/offline. (load colors not used.) **`themeMode: ThemeMode.dark`, `theme=AppTheme.dark`, `darkTheme=AppTheme.dark`; re-theme phase-18 auth screens; update widget tests** `[VERIFIED: mobile/main.dart; mobile/theme.dart]`. Re-theme but **keep Material 3**. 

---

## Assumptions Log

> Claims tagged `[ASSUMED]`. Planner/discuss-phase should get user confirmation before locking.

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | **Real ARTEMIDA `links[]` are bare share-URIs for `vless/ss/hysteria2/trojan/wg/wireguard/vmess`.** Contract only observed `vless://placeholder` + `protocols.vless`; no live key in env (`401 invalid_api_key`, key len 4). CONTEXT D-01 locks schemes. | Critical Uncertainty #1 | Parser misses protocols; `protocols.*`; `.conf`; base64 blob; `hy2`. **Re-verify on a live paid key before locking.** |
| A2 | **Share-link per-protocol query params** (`pbk,sid,sni,serverName,fp,flow,security,password,method,publickey,address,mtu,reserved,scy,aid,host,path,net,tls,insecure,obfs,...`) match community specs `[CITED]`. | #1 | sing-box outbound rejects; handshake fails. |
| A3 | **Remark `#fragment`** carries emoji-flag + city; `WL`/`whitelist`/`обход` markers present in remarks. | #1 / D-02 | pool misclassification; `city/cc/flag` empty. |
| A4 | **No active key ownership ref beyond `email:{userId}` / `String(telegramId)`.** | #5 | `no_active_key`. **Verify on real key.** |
| A5 | **`load` source absent.** No provider field. | D-04 | none (deferred). |
| A6 | **TCP fallback acceptable for UDP-only protocols** is FALSE — documented gap; libbox required. | #4 | offline shown when libbox absent. |
| A7 | **`wg://` scheme.** Community is `wireguard://`; D-01 says `wg://`. Accept both; exact ARTEMIDA WG emission unknown. | #1 | WG parse. |
| A8 | **generate_204- equivalents** not exposed; libbox uses gstatic default; shim could override; tag name discretion. | #2 | ping target. |
| A9 | **`WL` token matching.** D-02 says "contains WL"; token-ish matching recommended. | #1 | classification. |
| A10 | **`sqlite3_flutter_libs` EOL** still current. | Standard Stack | use `drift_flutter`. |
| A11 | **`package-legitimacy` can't clear pub.dev.** | Standard Stack | manual `checkpoint:human-verify` for any 3rd-party sing-box Flutter pkg; own shim avoids. |
| A12 | **pkg.go.dev GPL-2.0 vs repo GPL-3.0.** | #9 | compliance treat as GPL-3.0. |
| A13 | **Custom `city/cc/flag` emoji dictionary.** No official mapping; parse regional indicators; optional cc. | discretion | `cc/flag` empty fallback. |
| A14 | **min `Server.outbound` field name + `id` scheme.** | discretion | client contract. |

**Verified-not-assumed:** backend contract, `KeyCache`, `verifyAccessToken`, `artemida`, `deriveStatusKind`, Next16, pub versions, sing-box source signatures/build, `connectivity_plus`, prototype, CONTEXT.

---

## Open Questions

1. **Real ARTEMIDA `links[]` shape on a live paid key.** What we know: contract `links[]` strings; `vless://placeholder`; `protocols.vless`. Unclear: real per-protocol URIs/params; `hy2`; WG emission; remark conventions; `count`. Recommendation: **re-run `GET /keys/{id}/subscription-links` on a real active key in CI/staging; snapshot; add fixtures; `[ASSUMED]` checkpoint.** 
2. **`wg://` vs `wireguard://`.** D-01 `wg://`; community `wireguard://`. Recommendation: accept both + `.conf`. 
3. **Card `outbound` minimal params (D-05).** What we know: client gets minimal outbound for ping; raw not for cards; no logging. Unclear: exact field split. Recommendation: metadata-only card fields + separate `outbound`; **confirm secret boundary.** 
4. **`no_active_key` status 403 vs 402.** Recommendation 403 (D-21 allows either). 
5. **`getKeyWithLinks`.** Named in CONTEXT; **not present**. Recommendation `getSubscriptionForUserId`. 
6. **libbox exact `generate_204` + tag.** Recommendation default `https://www.gstatic.com/generate_204`, tag `srv-<id>`. 
7. **Own shim vs gomobile+channels vs community pkg.** Recommendation own C-shared + `ffigen`. 
8. **`load`.** Deferred. 
9. **Last-good storage.** Drift vs secure storage. Recommendation Drift `last_good`. 
10. **Fonts.** `google_fonts` vs bundled. Recommendation bundled for offline; `google_fonts` simplest. 

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Flutter | app + tests | ✓ | **3.50.1** | — |
| Dart | SDK | ✓ | **3.14.0** | — |
| Node.js | Next backend + tsc | ✓ | 24.15.0 | — |
| Next.js | BFF | ✓ | 16.3.7 | — |
| pnpm/npm | packages | ✓ | npm | — |
| TypeScript | backend | ✓ | 5.9 (repo) | — |
| PostgreSQL + Prisma | `keyCache` | ✓ (project) | 17 / 7.10 | `npx prisma validate`; needs `DATABASE_URL` |
| **Go** | build libbox shim | ✓ | **1.26.3** (need ≥1.24) | — |
| **gomobile/gobind** | official libbox | ✗ not installed | v0.1.13 | `go install ...@v0.1.13`; **own shim avoids** |
| **OpenJDK 17** | libbox **Android** build | ✗ **no JDK** (`/usr/bin/java` stub; "Unable to locate a Java Runtime") | — | **silent `Socket.connect`**; CI JDK17; **Android blocked here** `[VERIFIED; CONTEXT]` |
| Android SDK | libbox Android | ✗ not verified | — | silent fallback; CI |
| **Xcode + macOS** | iOS + libbox Apple | ✓ | present | Phase-18 iOS build verified `[VERIFIED STATE]` |
| **CocoaPods `pod`** | iOS plugins | ✗ `pod not found` this env | — | Flutter SPM / CI; Phase-18 iOS still built |
| Android NDK | C-shared `.so` per ABI | ✗ | — | gomobile; blocked here |
| ARTEMIDA API key | live `/keys` `/subscription-links` | ✗ **placeholder len 4; `401 invalid_api_key`** `[VERIFIED live probe]` | — | contract + fixtures + **re-verify on real key** |
| connectivity (network) | `connectivity_plus` | ✓ (device) | 7.3.2 | — |
| libbox native artifact | ping primary | ✗ not built in repo | sing-box 1.14.4 | **silent `Socket.connect`** `[VERIFIED D-07; blocked build]` |

**Missing with no fallback:** real ARTEMIDA key (for live verify); **OpenJDK17+SDK for Android libbox** (P19 still passes via fallback). **Missing with fallback:** libbox artifacts (TCP), `pod`, gomobile, CocoaPods.

---

## Validation Architecture

> `workflow.nyquist_validation = true` `[VERIFIED .planning/config.json]`. (Not disabled.)

### Test Framework
| Property | Value |
|----------|-------|
| Mobile | **flutter_test** + **mocktail** `[VERIFIED mobile/pubspec.yaml; phase 18]`; `integration_test`; `flutter analyze`; `flutter test`; `build_runner`. **Drift in-memory `NativeDatabase.memory()`** `[CITED drift]`. |
| Backend | **vitest** `[VERIFIED AGENTS; package]`; `npx tsc --noEmit`; `npx prisma validate`. Mock `artemida`; mock `verifyAccessToken`. |
| Quick run | `flutter analyze && flutter test` (mobile); `npx tsc --noEmit` (backend) |
| Full suite | `flutter test` + `npx vitest run` + `npx tsc` + `npx prisma validate` |
| Phase gate | full suite green before `/gsd-verify-work`; **`flutter test`, `flutter analyze`, `npx tsc`, `npx prisma validate`** `[VERIFIED AGENTS]` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REQ-POOL-01 | two tabs persisted | widget + unit | `flutter test test/widget/...` ; provider test | ❌ Wave 0 |
| REQ-POOL-02 | `/api/mobile/servers` `{simple,whitelist}` | backend unit (vitest, mock artemida) | `npx vitest run test/server-pool` | ❌ Wave 0 |
| REQ-POOL-03 | protocol badge | widget | `flutter test` | ❌ |
| REQ-POOL-04 | — deferred | — | — | n/a |
| REQ-POOL-05 | SNI whitelist | backend + widget | `npx vitest` + `flutter test` | ❌ |
| REQ-PING-01 | urltest via libbox + silent fallback | unit (fake libbox + fake socket) | `flutter test test/unit/core/ping` | ❌ Wave 0 |
| REQ-PING-02 | quick-path ≤3 800ms→best→full | unit | `flutter test` | ❌ |
| REQ-PING-03 | full parallel 2000ms concurrency | unit | `flutter test` | ❌ |
| REQ-PING-04 | Drift TTL 60s | drift memory test | `flutter test` | ❌ Wave 0 |
| REQ-PING-05 | connectivity clear | unit (mock connectivity stream) | `flutter test` | ❌ Wave 0 |
| REQ-PING-06 | best RTT; manual persists | unit | `flutter test` | ❌ |
| REQ-PING-07 | last-good chip ≤5 dedupe | unit + widget | `flutter test` | ❌ |
| REQ-PING-08 | manual refresh spinner + toast | widget | `flutter test` | ❌ |
| D-21 key gating | no_active_key 403 empty | backend vitest | `npx vitest` | ❌ Wave 0 |
| D-22 provider errors | 401/402/409/429/502/503+Retry-After+envelopes→empty+cached | backend vitest | `npx vitest` | ❌ Wave 0 |
| parser | `parseShareLink`/`classifyPool`/`parseRemark`/`flagToCc` per scheme + WL fallback + Reality + unparseable | backend vitest | `npx vitest` | ❌ Wave 0 |
| D-16 theme | dark tokens app-wide; auth re-theme | widget | `flutter test` | rewrite existing auth widget tests |
| router | no bottom nav; `/shop`; auth preserved | widget/integration | `flutter test` | update phase-18 router tests |

### Sampling Rate
- **Per task commit:** `flutter analyze` + targeted `flutter test`; `npx tsc --noEmit`. 
- **Per wave merge:** `flutter test` + `npx vitest run`. 
- **Phase gate:** full suite + `npx prisma validate` before `/gsd-verify-work`. 

### Wave 0 Gaps
- [ ] `lib/server-pool.ts` + `test/server-pool.test.ts` (vitest) — share-link fixtures per scheme + WL + Reality + `vless://placeholder` + `count` + malformed. 
- [ ] `app/api/mobile/servers/route.ts` + backend test (no key→403; provider error→empty; cached; no secret logs; active filter incl. trial-expired). 
- [ ] `mobile/lib/core/db/` Drift + `ping_cache`(+`last_good`,`selection`,`current_tab`) + `NativeDatabase.memory()` test; generated `*.g.dart`. 
- [ ] `mobile/lib/core/ping/` `PingRepository` + fake `LibboxPingService` + `SocketPingService`; concurrency/timeout/cancel tests; `approx`. 
- [ ] `mobile/lib/features/servers/` provider tests (`serverPoolProvider`,`pingCacheProvider`,`bestServerProvider`); mock `dio`. 
- [ ] connectivity invalidation test (mock `ConnectivityService`; wifi↔mobile; skip-initial; cancel in-flight). 
- [ ] libbox shim + ffigen generated bindings; **iOS arm64**; Android ABIs (CI; blocked here). 
- [ ] dark-theme widget tests re-theme phase-18 auth. 
- [ ] `flutter pub get` + `build_runner`. 
*(No live ARTEMIDA key in CI → contract fixtures + `[ASSUMED]` re-verify.)*

---

## Security Domain

> `workflow.security_enforcement = true`, `security_asvs_level = 1`, `security_block_on = high` `[VERIFIED .planning/config.json]`. Phase includes auth + secrets + external data → Security Domain required.

### Applicable ASVS Categories (V1–V14 L1; list relevant)
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | JWT `verifyAccessToken` (HS256 `jose`, `typ:"access"`, `uid`, 15m, credentials watermark) `[VERIFIED lib/mobile-auth.ts]`; secure storage phase 18; no new auth. |
| V3 Session Management | yes | access 15m + refresh 30d rotation; `AuthInterceptor` single-flight; no token logging. |
| V4 Access Control | yes | **active-key gating** (`no_active_key`); **ownership `userId`** `KeyCache`; no keyId spoofing; `keyId` scoped to owner; `[VERIFIED keys-service T-02-13/17/22]`. |
| V5 Input Validation | yes | **`zod`**; tolerant parser; **reject unparseable share links**; scheme allowlist `vless/ss/hysteria2/hy2/trojan/wg/wireguard/vmess`; length limits; no eval; sing-box `CheckConfig`. |
| V6 Cryptography | yes | rely on sing-box TLS/uTLS/Reality; **no hand-rolled crypto**; `pbk`/`sid` passed through; JWT `jose`. |
| V7 Error Handling & Logging | yes | `ArtemidaError.code` not provider text; **never log links/secrets/`ARTEMIDA_API_KEY`/`Authorization`**; no stack to client. |
| V8 Data Protection | yes | secrets env-only; **raw links server-side**; `ARTEMIDA` server-to-server; no committed secrets `[VERIFIED AGENTS]`. |
| V9 Communications | yes | HTTPS mandatory; server-to-server Bearer; `Retry-After`; no client→ARTEMIDA `[VERIFIED]`. |
| V11 Business Logic | yes | trial not renewable; **no `load`; no simulation**; ping not a security gate. |
| V14 Configuration | yes | no secrets in repo; `.env`; pinned versions; `force-dynamic`. |

### Known Threat Patterns for {Flutter + Next.js + sing-box + ARTEMIDA + share-links}
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Client calling ARTEMIDA / leaking `ARTEMIDA_API_KEY` | Info Disclosure | server-to-server only; key env `[VERIFIED]`. |
| **Share-link secret leakage** (`uuid`,`password`,`pbk`,`sid`, private WG key) in logs/cards/lists | Info Disclosure | raw link server-side; **no secret in card list; minimal `outbound` only for ping; never log** (D-05); `[VERIFIED]`. |
| `no_active_key` bypass / key spoofing | Elevation | active-key check server-side; ownership; `[VERIFIED]`. |
| JWT forgery/theft | Spoofing | `jose` verify; `typ`; watermark; secure storage `[VERIFIED]`. |
| **SSRF via ping `host`** | Tampering | ping targets derive from **ARTEMIDA subscription links** (trusted backend source), not user input; scheme allowlist; **no arbitrary user URL in P19**; `generate_204` URL fixed; `[VERIFIED]`. |
| **sing-box config injection** | Tampering | build config server/client from parsed fields; `libbox.CheckConfig`; no raw unvalidated JSON `[VERIFIED]`. |
| Provider error/`Retry-After` mishandling | DoS | `artemida` retry; map; empty; no secret `[VERIFIED]`. |
| Prototype simulation left in prod | (multiple) | **no `Math.random`, no fake IP, no `sleep`, no fake ping, no network toggle sim, no `load`** `[VERIFIED CONTEXT D-04/D-11/D-18 + seed]`. |
| **GPL-3.0 license violation** | (legal) | known blocker; dynamic linking + source offer + legal review; Phase 23 `[VERIFIED]`. |

---

## Sources

### Primary (HIGH confidence) — in-repo, read this session + verified
- `docs/artemida-v1-contract.md` (envelope 39-43; `GET /keys/{id}/subscription-links` 56,124-127; key fields 55,86-94; `status ACTIVE`; `trial`; `remainingDays`; `expireAt`; `subscriptionUrl`; errors `401/402/409/429/502/503`+`Retry-After`; **both error envelopes**; server-to-server 37-38; secret hygiene 155-161).
- `docs/artemida-v1-contract.json` (`subscriptionLinks.observed` verbatim `vless://placeholder`; `protocols.vless`; `count=3`; `cached`; `fetchedAt`; `keyDetail`).
- `lib/artemida.ts` (`ArtemidaError`,`mapStatus`,`parseRetryAfter`,`RETRYABLE`,p-retry,`normalizeSubscriptionLinks`,`normalizeKey`,`rewriteSubscriptionHost`,`getSubscriptionLinks`,`listKeys`,`NormalizedKey`,`SubscriptionLinks`,`asArray`,`asStringArray`,`artemida`). 
- `lib/keys-service.ts` (`listKeysByUserId`,`deriveStatusKind`,`daysUntilExpiry`,`getSubscriptionForUserId`,`getSubscriptionForOwnedKey`,`revalidateKeysByUserId`,`revalidateKeys`,`upsertCachedKey`,`isTrial`,ownership,`STATUS_ORDER`; **no `getKeyWithLinks`**). 
- `lib/mobile-auth.ts` (`verifyAccessToken`,JWT,watermark); `app/api/mobile/subscription/route.ts`; `app/api/mobile/auth/login/route.ts`. 
- `prisma/schema.prisma` `KeyCache`. 
- `mobile/` pubspec/theme/router/connectivity/endpoints/dio/providers/build.yaml/manifest; `mobile/test`. 
- `.planning/PROJECT.md`, `ROADMAP.md`, `REQUIREMENTS.md`, `STATE.md`, `MILESTONES.md`, `AGENTS.md`, `.planning/config.json`, `.planning/research/*`. 
- `.planning/seeds/SEED-001-mobile-client-karing.md`, `.planning/seeds/prototype-mobile-client.html`. 
- `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`; `node_modules/next/package.json`. 
- `mobile/.pub-cache`/`~/.pub-cache` `connectivity_plus-7.3.2`, `connectivity_plus_platform_interface-2.1.0`. 

### Primary (HIGH) — sing-box v1.14.4, cloned + read + **built + smoke-tested**
- `experimental/libbox/` `command_client.go`(`URLTest`,`CommandClient`,`CommandClientHandler`,`CommandClientOptions`,`NewStandaloneCommandClient`,`NewCommandClient`,`Connect`), `command.go`(`Command*` consts), `command_types.go`(`OutboundGroup*`,`URLTestTime`,`URLTestDelay`), `command_server.go`(`NewCommandServer`,`StartOrReloadService`,`OverrideOptions`,`Start`,`Close*`), `setup.go`(`Setup`,`SetupOptions`,`Version`,`CheckConfig`,`GoVersion`,`SetLocale`), `config.go`, `platform.go`, `ffi.json`, `LICENSE`. 
- `common/urltest/urltest.go` (`URLTest`, default `https://www.gstatic.com/generate_204`, `uint16`, `detour`). 
- `daemon/started_service.go` (`URLTest` 717-745, `ServiceStatus_STARTED`, history `Store/Delete`, `SubscribeGroups`/`SubscribeOutbounds`, `UrlTestDelay`,`UrlTestTime`, `NetworkTCP`). 
- `adapter/outbound/manager.go` (`Outbound`→endpoint fallback). 
- `docs/configuration/outbound/{vless,shadowsocks,hysteria2,trojan,vmess,wireguard,urltest}.md`, `docs/configuration/endpoint/wireguard.md`, `docs/configuration/shared/{tls,utls}.md`, `docs/configuration/dns/server/local.md`, `docs/configuration/index.md`. 
- `Makefile` (`lib_install`,`lib_android`,`lib_apple`,`_new`,`SING_FFI`,`LIBBOX_FFI_CONFIG`), `cmd/internal/build_libbox/main.go` (`checkJavaVersion openjdk 17`,`FindSDK`,`gomobile`,`-javapkg`,`-libname`,`androidapi`,`iosversion`,`Libbox.xcframework`,`libbox.aar`,`libbox-legacy.aar`), `cmd/internal/build_shared/*`, `go.mod`. 
- **`sing-box check`** validated minimal 1.14 config; `go build -buildmode=c-shared` + C smoke test `libbox_check_config`/`libbox_version`/`libbox_free_string` **PROVEN**. 
- `LICENSE` GPL-3.0-or-later. **`SagerNet/sing-box` issue #4016 `sing-ffi` not public.** 
- https://pkg.go.dev/github.com/sagernet/sing-box/experimental/libbox **v1.14.4** (+ `GPL-2.0` subpackage note; `URLTest`; `CommandClientHandler`; `OutboundGroupItem`).

### Secondary (MEDIUM)
- **pub.dev registry** `[VERIFIED api/packages/...]`: `drift@2.35.4`, `drift_flutter@0.3.1`, `drift_dev@2.35.3`, `sqlite3@3.9.2`, `sqlite3_flutter_libs@0.6.0+eol`, `path@1.9.1`, `path_provider@2.1.6`, `ffigen@23.0.0`, `connectivity_plus@7.3.2`, `google_fonts@9.0.0`, `singbox_ffi@0.1.6`(GPL-3.0), `flutter_sing_box@3.1.0`, `sing_box_flutter`, `zod@4.6.5`, `p-retry@7.1.1`. (**package-legitimacy seam only supports npm/pypi/crates.**) 
- **Share-link community specs `[CITED]`:** SIP002 URI Scheme; XTLS VLESS sharing scheme; Surge VLESS manual (`pbk`,`sid`,`fp`,`sni`,`security`,`flow`,`reality-public-key`,`reality-short-id`,`serverName`); Hysteria2 URI scheme; v2rayN VMess base64; WireGuard `wireguard://` scheme; **INCY share-links doc** (VLESS/VMess/Trojan/Shadowsocks/Hysteria2/SOCKS5/WireGuard tables). 
- sing-box-for-android `libbox.aar`, sing-box-for-apple `Libbox.xcframework`, `proother/sing-box-lib`. 
- `.planning/research/STACK.md` (**stale**), `ARCHITECTURE.md` (source-`/pricing` **overridden** by D-01), `PITFALLS.md`, `SUMMARY.md`, `FEATURES.md`. 

### Tertiary (LOW) `[ASSUMED]`
- Real ARTEMIDA per-protocol share-URI payload; `wg://` emission; remark conventions; `count`. 
- Exact `singbox_ffi`/`flutter_sing_box` URLTest exposure; community pkg legitimacy. 
- `sqlite3_flutter_libs` EOL successor details; `google_fonts` offline. 

---

## Metadata

**Confidence breakdown:**
- **Backend `/api/mobile/servers` + key gating + `artemida` reuse + ARTEMIDA contract:** **HIGH** `[VERIFIED]`. 
- **Standard stack versions:** **HIGH** `[VERIFIED pub.dev + repo]`. 
- **sing-box libbox real API + build + minimal config + WireGuard endpoint + DNS 1.14 + GPL:** **HIGH** `[VERIFIED cloned v1.14.4 source + built + check]`. **D-08 wording corrected (no `libbox_urltest`; `URLTest(tag)`; async `WriteGroups`; no official Flutter pkg; `sing-ffi` non-public; gomobile≠C-ABI; own shim recommended).** 
- **Share-link formats:** **MEDIUM** `[CITED community]`; **real ARTEMIDA payload `[ASSUMED]`.** 
- **Ping fallback + timeouts/parallelism + quick-path + TTL + invalidation:** **HIGH** for mechanism `[VERIFIED D-06..D-12 + prototype + sing-box]`; **MEDIUM** for TCP-only reliability `[ASSUMED honest]`. 
- **UI/theme/copy:** **HIGH** `[VERIFIED prototype + D-15..D-20]`. 
- **Environment/build blockers:** **HIGH** `[VERIFIED this env]`. 

**Research date:** 2026-11-27
**Valid until:** 30 days (stable); **re-verify share-link payload on a live ARTEMIDA key + libbox shim build in CI before execution.**

**Requirement reconciliation `[VERIFIED REQUIREMENTS + CONTEXT]`:**
- REQ-POOL-02 `load` → **not sent** (D-04). REQ-POOL-04 `load` bar → **DEFERRED**. REQ-PING-06 `load` tie-break → **deferred** (RTT-only). 
- REQ-BE-02 `/pricing` source → **subscription-links** (D-01). (`.planning/research/ARCHITECTURE.md` says `/pricing`; **CONTEXT overrides.**) 
- REQ-PING-07 "most recent successful server" → `last_good[tab][0]`, P19 not requiring connected. 
- REQ-POOL-01 `state persisted`. 
- **REQ-POOL-04 recorded as deferred, NOT implemented.** 

---

*Sources cited inline; in-repo claims `[VERIFIED: path:lines]` + verbatim; external `[CITED: url]`; unverified `[ASSUMED]`. Known blockers (GPL-3.0, NetworkExtension, no JDK/Android SDK here, no live ARTEMIDA key) recorded, not re-solved.*






