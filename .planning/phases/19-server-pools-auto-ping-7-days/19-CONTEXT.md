# Phase 19: Server Pools & Auto-Ping (7 days) - Context

**Gathered:** 2026-11-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Два серверных пула с бэкенда, живой пинг, быстрый выбор по last-good, кеш с TTL 60 с и инвалидация при смене сети.

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
</domain>

<decisions>
## Implementation Decisions

### Источник серверов и состав пулов
- **D-01:** `/api/mobile/servers` не использует ARTEMIDA `/pricing`. Источник — `lib/keys-service.ts` → `artemida.getSubscriptionLinks(keyId)`, парсинг `vless://`, `ss://`, `hysteria2://`, `trojan://`, `wg://`, `vmess://` в серверную модель. — **Reversibility:** costly — определяет контракт `/servers`, поля и маппинг пулов; клиент и тесты завязаны на него.
- **D-02:** Деление на пулы **по remark** (имени ссылки). Если remark содержит `WL`, `whitelist` или `обход` (без учёта регистра) → `whitelist`. Иначе `simple`. Если метки нет — fallback на протокол: `VLESS + Reality` → `whitelist`, всё остальное → `simple`. — **Reversibility:** reversible — маппинг на бэкенде, можно перенести в конфиг.
- **D-03:** Поля карточки: `id, name, city, cc, flag, proto, sni?, tab`. `name/city/cc/flag` парсятся из remark: emoji-флаг + текст города; без успеха `name` = remark, `city/cc/flag` пустые, host показывается вторичной строкой. `proto` = схема + подпротокол из ссылки (`WireGuard`, `Shadowsocks`, `VLESS`, `VLESS · Reality`, `Hysteria2`, `Trojan`, `VMess`). `sni` = query `sni`/`serverName`, только для `whitelist`, показывается «SNI: domain». — **Reversibility:** reversible.
- **D-04:** `load` **не отдаётся и не показывается** до появления реальной метрики нагрузки. Запрещена симуляция. REQ-POOL-04 отложена. Сортировка Автовыбора тогда только по RTT. При появлении реального `load` — добавить поле и tie-break RTT→load. — **Reversibility:** reversible.
- **D-05:** Конфиги/секреты outbound **не возвращаются** в списке для UI-карточек. Бэкенд хранит сырые ссылки/конфиги на сервере; клиенту отдаются метаданные + (для пинга/подключения через libbox) минимальные параметры outbound. Никогда не логировать и не коммитить ссылки. — **Reversibility:** reversible — секреты остаются на бэкенде; что отдавать клиенту решает бэкенд.

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
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/ROADMAP.md` §Phase 19 — goal + tasks 19.1–19.11 + deliverables.
- `.planning/REQUIREMENTS.md` §REQ-POOL (REQ-POOL-01..05) §REQ-PING (REQ-PING-01..08) — locked requirements.
- `.planning/PROJECT.md` — v2.0 Мобильный клиент scope, RU/RUB, безлимит, constraints, «прототип → спека», «живые API».
- `.planning/STATE.md` — current phase 18 verifying; phase 19 next; known blockers (NetworkExtension entitlement, GPL-3.0, Platega creds; Android build blocked in this env).

### Seed & prototype (UI + product source of truth)
- `.planning/seeds/SEED-001-mobile-client-karing.md` — Karing/sing-box architecture, two pools, server model, autoping algorithm `connect(mode)`, network-change invalidation (Karing bug), security, RU copy; `prototype-mobile-client.html`.
- `.planning/seeds/prototype-mobile-client.html` — full dark design system (`--bg #0e1512`, `--lime #b7ff45`, `--teal #3ee6b0`, Manrope/Unbounded/JetBrains Mono, grad), main screen structure, server card markup, ping colors `good/mid/warn/bad`, `loadClass`, last-good, `connect()`, tabs, «Как это работает», profile sheet, `pingClass`, prototype copy. NOTE: prototype ping `Math.random`, `sleep`, fake IP are simulation — replace with real `libbox.urltest`/`Socket.connect`; prototype hardcoded servers are replaced by backend-parsed subscription links.
- Prototype auth says «Пароль · минимум 6 символов» but locked requirement is **min 8** (phase 18); ignore prototype value.

### ARTEMIDA contract (server source)
- `docs/artemida-v1-contract.md` — locked V1 contract; **no `/servers`**; `/pricing` = tariffs; `GET /keys/{id}/subscription-links` returns `{subscriptionUrl, links[], protocols{}...}`; success `{ok,data,meta}`; error envelopes object+string; `401/402/409/429/502/503`, `Retry-After`, `X-RateLimit-Policy`, server-to-server only; `GET /keys`, `GET /keys/{id}` key fields (`status`, `expireAt`, `remainingDays`, `devices`, `subscriptionUrl`, `trial`, ...).
- `docs/artemida-v1-contract.json` — machine-readable verbatim contract.
- `lib/artemida.ts` — `artemida` singleton, `getSubscriptionLinks`, `listKeys`, `getKey`, `request`, retry/`Retry-After`, `ArtemidaError`, `normalizeSubscriptionLinks`, `asArray`.
- `lib/keys-service.ts` — cache-first subscription read (`KeyCache`, D-29), `getKeyWithLinks`, `getUserSubscription`, `getSubscriptionLinks`, active-key logic, `getTraffic`.
- `lib/mobile-auth.ts` — `verifyAccessToken`, JWT 15m/30d.
- `app/api/mobile/subscription/route.ts` — current `keys: []` stub (phase 21 fills), `verifyAccessToken`.
- `app/api/mobile/auth/*` — patterns for route handlers, `prisma`, `logger`.

### Mobile app (existing)
- `mobile/lib/app/router.dart` — GoRouter routes `/auth`,`/register`,`/telegram-wait`,`/`; `_HomeScreen` + `NavigationBar` (to be replaced); `refreshListenable`; `redirect`. Phase 19 replaces `_HomeScreen`, removes bottom nav.
- `mobile/lib/app/theme.dart` — current light M3 `AppTheme.light`/`dark`; rewrite dark prototype theme.
- `mobile/lib/app/constants.dart` — `Endpoints` already has `servers = '/api/mobile/servers'`; `apiBaseUrl`; connectivity debounce; biometric; `currentTabProvider` home.
- `mobile/lib/features/home/providers.dart` — `homeScreenProvider` placeholder; `currentTabProvider`. Replace/augment with `serverPoolProvider`, `pingCacheProvider`, `bestServerProvider`.
- `mobile/lib/features/subscription/providers.dart` — `PricingPlan` 115/400/1000/1900/3800, `userSubscriptionProvider`, `createPaymentProvider` stubs.
- `mobile/lib/features/auth/providers.dart` + `mobile/lib/core/auth/*` + `mobile/lib/models/auth_models.dart` — auth, token store, `currentUserProvider`, `dioClientProvider`.
- `mobile/lib/core/api/dio_client.dart` + `auth_interceptor.dart` + `endpoints.dart` — Dio, single-flight refresh.
- `mobile/lib/core/connectivity/connectivity_service.dart` — `ConnectivityService`, `.distinct()`, `connectivityServiceProvider`.
- `mobile/pubspec.yaml` — current deps; add `drift`, `sqlite3_flutter_libs`, `path`, `path_provider`, `ffigen`, libbox; fonts. Phase 18 Riverpod 3.4+/freezed; build_runner.
- `mobile/lib/main.dart`, `mobile/AGENTS.md` + root `AGENTS.md` — app wiring, Next-agent rules, project conventions.

### Stack research
- `.planning/research/SUMMARY.md`, `STACK.md`, `ARCHITECTURE.md`, `FEATURES.md`, `PITFALLS.md` — libbox sing-box, Drift TTL 60s, connectivity invalidation, parallel 10–16, timeouts, last-good, network-change→reconnect pitfall, ARTEMIDA error codes, GPL-3.0.

### No SPEC.md / no prior phase-19 CONTEXT
- No `19-SPEC.md`, no `19-CONTEXT.md` prior; no `.planning/codebase/*.md` maps; no DECISIONS-INDEX; prior v1.2 CONTEXT files are stubs/corrupted — ignore.
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ConnectivityService` + `connectivityServiceProvider`, `.distinct()`, `ConnectivityConfig.debounceDuration` — network-change invalidation (add Drift cache clear + last-good clear).
- `connectivity_plus` already in `mobile/pubspec.yaml`.
- `lib/artemida.ts` `artemida.getSubscriptionLinks`, `listKeys`, retry/`Retry-After`, `ArtemidaError`, `asArray`, `normalizeSubscriptionLinks` — reuse; no new ARTEMIDA client.
- `lib/keys-service.ts` cache-first `KeyCache`, `getKeyWithLinks`, active-key resolution — reuse for `/servers`.
- `lib/mobile-auth.ts` `verifyAccessToken` + Next route-handler pattern (`app/api/mobile/auth/*`, `app/api/mobile/subscription/route.ts`).
- `logger` (pino) — log `paymentId`/no secrets; `X-Request-Id`.
- Riverpod 3.4 + freezed + `riverpod_annotation`/`riverpod_generator` + `build_runner`; `flutter_riverpod` `StateProvider`.
- `dio` `DioClient` + `AuthInterceptor` single-flight refresh + `Endpoints`.
- `AppTheme` in `mobile/lib/app/theme.dart` — rewrite dark prototype palette; keep Material 3.
- `GoRouter` + `authNotifierProvider` `refreshListenable`.
- `Endpoints.servers` already declared.

### Established Patterns
- Backend = thin wrapper over ARTEMIDA; secrets server-only; `prisma`; `p-retry`-style retry on `429/502/503` + `Retry-After`; both error envelope shapes; `force-dynamic`.
- Flutter `AsyncNotifier`/`FutureProvider`, `.autoDispose`, `invalidate`, `ConsumerWidget`.
- `.distinct()` streams; debounce `500ms`.
- Freezed models with `@JsonKey`; `build_runner`.
- Light→dark theme swap is centralized in `AppTheme`; `Theme.of`.
- GSD: plans in `.planning/phases/NN-*`, `must_haves`, tracer-first; verify `flutter analyze`, `flutter test`, `npx tsc`, `npx prisma validate`.
- No simulation for production paths (prototype simulation explicitly replaced).

### Integration Points
- `app/api/mobile/servers/route.ts` (NEW) — JWT + active key + `keys-service` + `artemida.getSubscriptionLinks`; returns `{simple, whitelist, key}`.
- `mobile/lib/app/router.dart` — `_HomeScreen` replaced; bottom `NavigationBar` removed; add prototype routes `/shop`, profile/logic sheets; keep auth routes + `redirect`.
- `mobile/lib/features/...` NEW `features/servers/` (or `features/server_pool/`): `Server` model, `serverPoolProvider`, `pingCacheProvider`, `bestServerProvider`, `ServerList` widgets, prototype screen.
- `mobile/lib/core/ping/` NEW — `libbox` FFI `urltest`, `Socket.connect` fallback, `PingResult`.
- `mobile/lib/core/db/` NEW — Drift database + `ping_cache` table (`server_id, tab, rtt, online, ts`, TTL 60s).
- `mobile/lib/app/theme.dart` — dark prototype `ThemeData`; auth screens re-themed.
- `mobile/pubspec.yaml` — add `drift`, `sqlite3_flutter_libs`, `path`, `path_provider`, `ffigen`, libbox, fonts.
- `mobile/android/`, `mobile/ios/` — libbox native artifacts; NOTE Android build blocked in this env (no JDK); iOS builds.
</code_context>

<specifics>
## Specific Ideas

- Reference: `.planning/seeds/prototype-mobile-client.html` — copy design system + copy + structure; replace simulated ping/servers with real `/api/mobile/servers` + `libbox.urltest`/`Socket.connect`.
- Reference: `.planning/seeds/SEED-001-mobile-client-karing.md` §5 autoping algorithm `connect(mode)` and §4 two pools.
- UI copy from prototype: «Простой VPN» / «Обход белых списков», «Автовыбор» / «Выберу самый быстрый сервер», «Автопинг перед подключением · быстрый путь по последним живым серверам», «мс», «офлайн»/«нет ответа», «последний», «Пинг обновлён», «Ключ неактивен — серверы недоступны» / «Купить», «Ключ истёк» / «Нет ключа».
- `pingClass(rtt,online)`: good ≤60, mid ≤110, warn ≤180, bad; offline → «офлайн». `loadClass`: <45 good, <70 mid, ≥70 hi — not used until real `load`.
- Pool classification keywords: `WL`, `whitelist`, `обход` (case-insensitive) in remark; fallback `VLESS+Reality → whitelist`.
- Min password 8 (phase 18); ignore prototype «минимум 6».

## Deferred Ideas

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
</specifics>

<deferred>
## Deferred Ideas

See `<specifics>` Deferred Ideas above. No scope creep captured; no todos folded.
</deferred>

---
*Phase: 19-Server Pools & Auto-Ping (7 days)*
*Context gathered: 2026-11-27*
