# Phase 20: VPN Core & Connect FSM (10 days) - Context

**Gathered:** 2026-11-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Рабочий VPN-туннель на Android/iOS с честной машиной состояний, kill switch, отменой подключения, авто-реконнектом и живой панелью подключения.

В фазе 20:
- `GET /api/mobile/config?serverId=...` — бэкенд под JWT + активный ключ заново парсит subscription-links ARTEMIDA и собирает полный sing-box config для выбранного сервера; клиент получает готовый JSON и передаёт его в libbox.
- Расширение собственного C-shared shim (D-08) до TUN-режима: `libbox_start_with_tun(fd, config)` / `libbox_stop`, без gomobile/community pkg, без `libbox_urltest`.
- Android: Kotlin `VpnService` (`prepare()`, `establish()`, `protect()`) + foreground service с уведомлением «VPN активен · 3set» и action «Отключить»; channel между Flutter и нативом.
- iOS: `NEPacketTunnelProvider` + `NEOnDemandRuleConnect` + entitlements — готовим код, но не собираем/не проверяем туннель до одобрения entitlement Apple (Android-first).
- Connection FSM: `idle → pinging → connecting → connected → disconnecting → idle` + `error`; переходы логируются; cancel во время `connecting` → `disconnecting` → `idle`, без orphan tunnel.
- Kill switch **всегда включён**: при потере туннеля/отключении трафик заблокирован; Android `allowBypass=false`, iOS `NEOnDemandRuleConnect` для всех интерфейсов.
- Permission flows: отказ → toast «Нужно разрешение VPN» + «Повторить»; отзыв во время туннеля → FSM error → disconnecting → idle + toast.
- Auto-reconnect: смена сети →清 кеш пинга, fresh ping, перевыбор лучшего сервера по RTT, reconnect, toast «Сеть изменена — переподключение».
- Core restart backoff ×3 (1s/2s/4s), счётчик сбрасывается после успешного `connected`, затем error toast «VPN остановлен, попробуйте снова».
- Error mapping: libbox errors → пользовательские тосты (auth, unreachable, config, permission), без raw errors.
- Connected Panel: flag+city, protocol, IP, ping, session timer, ↓/↑ MB; IP через внешний IP-эндпоинт внутри туннеля, при ошибке «—»; трафик/таймер 1s из libbox counters.

Не в фазе 20:
- Магазин/покупка/продление/устройства/subscription link — фаза 21; `/shop` остаётся заглушкой.
- Профиль, промокоды, платежи, grace — фаза 21.
- Состояние kill switch toggle — не реализуем (решение: всегда включён).
- Проверка iOS-туннеля на устройстве — до одобрения NetworkExtension entitlement от Apple (внешний блокер).
- Android-сборка в этом окружении — нет OpenJDK 17 / Android SDK/NDK (внешний блокер); CI-artifacts.
- load-бар — отложен с фазы 19 (REQ-POOL-04; D-04).
</domain>

<decisions>
## Implementation Decisions

### Конфиг и ключ
- **D-01:** Полный sing-box config для подключения отдаёт новый бэкенд-эндпоинт `GET /api/mobile/config?serverId=...`. Бэкенд проверяет JWT + активный ключ + владение, заново читает ARTEMIDA subscription-links (`getSubscriptionForUserId` + `getSubscriptionLinks`) и собирает config для выбранного сервера. Клиент получает готовый JSON. — **Reversibility:** costly — новый публичный контракт; клиент, тесты и FSM завязаны на него.
- **D-02:** Идентификация сервера — только `serverId` от клиента; бэкенд сам пере-парсит подписку и найдёт outbound. Клиент не хранит и не шлёт сырые outbound. — **Reversibility:** reversible — маппинг на бэкенде.
- **D-03:** `/config` гейтится при **каждом** запросе: нет JWT → 401; нет активного/принадлежащего ключа → `no_active_key` 403 + без конфига. Если ключ истёк во время активного туннеля — отключение при следующем reconnect. — **Reversibility:** reversible — можно ослабить гейт.
- **D-04:** Никаких `/pricing`, `getKeyWithLinks`, `/servers.outbound` как источника полного конфига. Наследуем D-01/D-05 фазы 19: `/pricing` — тарифы; `getKeyWithLinks` не существует; `/servers.outbound` — только ping-only. — **Reversibility:** reversible — запрет зафиксирован в тестах.

### TUN и нативный слой
- **D-05:** TUN-fd передаётся в libbox через **расширение собственного C-shared shim**: `libbox_start_with_tun(fd, config)` / `libbox_stop`; единый FFI-путь, без gomobile, без sing-ffi, без community Flutter-пакетов, без `libbox_urltest`. — **Reversibility:** costly — меняется C ABI, ffigen-биндинги, нативные артефакты и сборка.
- **D-06:** Android — Kotlin `VpnService` (`prepare()`, `establish()`, `protect()`) + foreground service с постоянным уведомлением «VPN активен · 3set» и действием «Отключить»; Flutter ↔ native через method channel. В манифесте убрать несуществующий `android.permission.VPN_MANAGE`, добавить реальную declarative/service часть для VPN. — **Reversibility:** costly — нативный код Android + манифест + service; откат = возврат к no-TUN shim.
- **D-07:** iOS — готовим `NEPacketTunnelProvider`, `setTunnelNetworkSettings`, `NEOnDemandRuleConnect`, entitlements; **не собираем и не проверяем туннель** до одобрения entitlement Apple. Основной проверяемый путь фазы — Android. — **Reversibility:** costly — отложенная проверка означает, что iOS-код может потребовать правок после одобрения.
- **D-08:** Конфигурация libbox в TUN-режиме: те же sing-box v1.14.4 и `generate_204` für urltest, но с TUN inbound; WireGuard как endpoint (не outbound), новый DNS; секреты/конфиг never logged. — **Reversibility:** reversible.

### Kill switch и права
- **D-09:** Kill switch **всегда включён**, без пользовательского toggle: потеря туннеля или явное отключение блокирует трафик. Android `VpnService` с `allowBypass=false`; iOS `NEOnDemandRuleConnect` для всех интерфейсов. Соответствует REQ-CONN-06 «Disconnect → no traffic leaks». — **Reversibility:** costly — меняется поведение безопасности и нативные OnDemand-правила; откат = введение toggle и снятие always-on.
- **D-10:** Отказ пользователя в VPN-разрешении → остаёмся в `idle`, тост «Нужно разрешение VPN» + кнопка «Повторить»; kill switch не блокирует без туннеля. — **Reversibility:** reversible.
- **D-11:** Отзыв разрешения во время активного туннеля → FSM `error` → `disconnecting` → `idle` + тост и кнопка повтора. — **Reversibility:** reversible.
- **D-12:** Тост kill switch: «Kill switch: трафик вне VPN заблокирован». — **Reversibility:** reversible.

### FSM, reconnect и панель
- **D-13:** FSM — `idle → pinging → connecting → connected → disconnecting → idle` + `error` из любого состояния; владелец — Riverpod notifier; переходы логируются без секретов. Кнопка: «Подключить» / «Подключение…» с отменой / «Отключить». — **Reversibility:** reversible — переходы и UI-копия.
- **D-14:** Cancel во время `connecting` → `disconnecting` → `idle`, тост «Подключение отменено», никакого orphan tunnel; нативный `stop()` вызывается до перехода в `idle`. — **Reversibility:** reversible.
- **D-15:** Auto-reconnect при смене сети: очистить кеш пинга и last-good, сделать fresh ping, **перевыбрать лучшего сервера по RTT**, reconnect, тост «Сеть изменена — переподключение». Сервер может смениться. Наследует D-10/D-11 фазы 19 (инвалидация кеша). — **Reversibility:** costly — поведение выбора и FSM; откат = «тот же сервер».
- **D-16:** IP для Connected Panel — реальный запрос к IP-эндпоинту (например `https://api.ipify.org`) **через туннель**, таймаут 1–2 с; при ошибке «—». Без симуляции/fake IP. — **Reversibility:** reversible — можно заменить источник.
- **D-17:** Connected Panel: server flag+city, protocol, ping, session timer, ↓/↑ MB; трафик и таймер обновляются раз в 1с из libbox counters. Стиль/копия — прототип, тёмная тема (наследует D-15..D-17 фазы 19). — **Reversibility:** reversible.
- **D-18:** Restart backoff ядра: 3 попытки 1s/2s/4s, счётчик **сбрасывается после успешного `connected`**, затем error toast «VPN остановлен, попробуйте снова». — **Reversibility:** reversible.
- **D-19:** Error mapping: libbox/нативные ошибки → action-тосты (auth failed, server unreachable, config invalid, permission denied), без raw-текстов и без утечки конфига. — **Reversibility:** reversible.
- **D-20:** Наследуемые из фазы 19 жёсткие запреты: без симуляции (никаких `Math.random`, fake IP, `sleep`, fake connection), без `load`, без секретов в логах/UI, без client→ARTEMIDA, без нижней навигации, без `/shop`-покупки. — **Reversibility:** reversible — это инварианты фазы 19, перенесённые в 20.

### the agent's Discretion
- Точный C ABI shim (`libbox_start_with_tun` signature, fd ownership, stop/reset) и ffigen-конфиг.
- Точный Kotlin-код VpnService/foreground service и имя method channel; способ передачи fd в Dart FFI.
- Формат sing-box config для TUN inbound, DNS, WireGuard endpoint, `generate_204` tag.
- Конкретный IP-эндпоинт и таймаут; кэширование IP в течение сессии.
- Внутренние имена FSM-состояний, struct freezed-модели `ConnectionState` и лог-событий.
- Точные строки тостов, если не заданы locked-решениями.
- Как именно отразить iOS-готовность в UI/флагах до entitlement (деградация без туннеля).
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/ROADMAP.md` §Phase 20 — goal + tasks 20.1–20.13 + deliverables.
- `.planning/REQUIREMENTS.md` §REQ-CONN (REQ-CONN-01..10) — locked requirements.
- `.planning/PROJECT.md` — v2.0 Мобильный клиент, RU/RUB, безлимит, GPL-3.0 блокер, live APIs, «прототип → спека».
- `.planning/STATE.md` — текущая фаза 19 в verifying, UAT отложен; phase 20 Pending; blockers (NetworkExtension entitlement, GPL-3.0, Platega creds, Android JDK/SDK).

### Prior phase decisions (LOCKED)
- `.planning/phases/19-server-pools-auto-ping-7-days/19-CONTEXT.md` — D-01 (не `/pricing`), D-04 (нет load), D-05 (секреты), D-08 (свой shim+ffigen), D-10/11 (TTL+инвалидация), D-15..D-20 (макет/тема/копия/ключ), D-21 (gating), D-22 (cache-first).
- `.planning/phases/19-server-pools-auto-ping-7-days/19-RESEARCH.md` — sing-box v1.14.4, `URLTest(tag)`+`WriteGroups`, `generate_204`, WG endpoint, new DNS, own C-shared shim, silent TCP fallback, `[ASSUMED]` links[], Android blocked, GPL-3.0.
- `.planning/phases/19-server-pools-auto-ping-7-days/19-PATTERNS.md` — аналоги файлов и выдержки кода.
- `.planning/phases/19-server-pools-auto-ping-7-days/19-01-SUMMARY.md`…`19-08-SUMMARY.md` — что уже построено.

### Seed & prototype
- `.planning/seeds/SEED-001-mobile-client-karing.md` — Karing/sing-box архитектура, `connect(mode)`, TUN plumbing, reconnect, kill switch, device limits, GPL-3.0, RU copy.
- `.planning/seeds/prototype-mobile-client.html` — Connected Panel markup: `cpServer/cpProto/cpIp/cpPing/cpTime/cpDown/cpUp`, `conn.status`, `connect()` FSM, ping colors, dark palette, RU copy. NOTE прототип содержит симуляцию (`Math.random`, fake IP, `sleep`) — не переносить.

### Mobile app (existing)
- `mobile/lib/core/ping/libbox_core.dart` — `init/start(config)/stop/urltest`, no-TUN, `_serialized`, `LibboxUnavailableException`, `LibboxConfigException`; расширить до TUN по D-05.
- `mobile/lib/core/ping/{ping_repository.dart,libbox_ping_service.dart,socket_ping_service.dart,ping_result.dart}` — проверенный ping-слой; не ломать.
- `mobile/lib/core/db/{app_database.dart,tables.dart,ping_cache_dao.dart}` — Drift; TTL60; last_good/selection/current_tab; можно добавить connection state если нужно.
- `mobile/lib/core/connectivity/connectivity_service.dart` — `.distinct()`, реальный поток; используется для reconnect.
- `mobile/lib/features/servers/{providers.dart,server.dart,server_pool_screen.dart,widgets/connect_panel.dart}` — `ConnectOutcome` (пока только выбор), Connect Panel с прочерками IP/timer/traffic; заменить на реальный FSM/Connected Panel.
- `mobile/lib/app/router.dart`, `mobile/lib/app/theme.dart`, `mobile/lib/main.dart` — единый тёмный макет, `/shop` stub, app-level listeners; не ломать.
- `mobile/lib/core/api/{endpoints,dio_client,auth_interceptor}.dart` — `Endpoints` (добавить `config`), Dio + refresh; JWT.
- `mobile/lib/core/auth/*`, `mobile/lib/models/auth_models.dart` — auth/token store.
- `mobile/pubspec.yaml` — добавить `flutter_background_service`/method channel по решению D-06; сохранить `ffi/ffigen/drift`.
- `mobile/android/app/src/main/AndroidManifest.xml` — `FOREGROUND_SERVICE_TYPE_VPN`, ошибочный `VPN_MANAGE`; добавить `VpnService` + `BIND_VPN_SERVICE`, foreground service.
- `mobile/ios/Runner/Info.plist` + `*.entitlements` — `FlutterDeepLinkingEnabled`, associated domains, `packet-tunnel-provider` entitlement уже есть; добавить `NEPacketTunnelProvider` target.
- `mobile/native/libbox_shim/{main.go,go.mod,build.sh}` — свой C-shared shim; расширить TUN.
- `AGENTS.md` (root) + `mobile/AGENTS.md` если есть; Next.js docs при бэкенд-коде.

### Backend
- `app/api/mobile/servers/route.ts`, `lib/server-pool.ts`, `lib/servers-source.ts` —бэкенд-контракт+парсер.
- `app/api/mobile/subscription/route.ts` (phase 21), `lib/keys-service.ts` (`getSubscriptionForUserId`, `getSubscriptionLinks`, `KeyCache`, `statusKind`), `lib/artemida.ts`, `lib/mobile-auth.ts` (`verifyAccessToken`), `lib/logger.ts`.
- `docs/artemida-v1-contract.md` / `.json` — subscriptionUrl / links / protocols; error envelope; 401/402/409/429/502/503 + Retry-After.

### Research docs
- `.planning/research/{ARCHITECTURE,FEATURES,PITFALLS,STACK,SUMMARY}.md` — sing-box/Drift/connectivity/parallel/timeouts/last-good;pitfalls: network-change→reconnect, IPv6/DNS leaks, GPL-3.0, entitlements, CORS server-to-server.

### No SPEC.md / no UI-SPEC
- No `20-SPEC.md`, no `20-UI-SPEC.md` (по явному выбору `--skip-ui`); прототип и CONTEXT 19 задают визуальный контекст.
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `LibboxPingCore` singleton + serialized calls + safe `LibboxConfigException` (не логирует конфиг) — расширить TUN, сохранить сериализацию и секретный контур.
- `PingRepository`/`PingCacheDao`/`freshPingRows`/`last_good` — готовый свежий пинг и выбор сервера для reconnect (D-15).
- `ConnectivityService` + `networkPingInvalidationProvider` — реальный поток смены сети; подключить к FSM reconnect.
- `DioClient`/`AuthInterceptor`/`Endpoints` — добавить `Endpoints.config`.
- `AppTheme.dark` + `ConnectPanel` — наследовать тёмный Connected Panel, заменить прочерки живыми данными.
- `verifyAccessToken`/`getSubscriptionForUserId`/`artemida.getSubscriptionLinks`/`KeyCache` — готовый backend-путь для `/config`.
- `pino` logger без секретов; `ArtemidaError` два вида error envelope.

### Established Patterns
- Backend = тонкая обёртка над ARTEMIDA; server-to-server; secrets env-only; `force-dynamic`; zod validation.
- Flutter Riverpod `AsyncNotifier`/`Notifier`/`FutureProvider.autoDispose`; freezed + `build_runner`; strict lints.
- GSD tracer-first plans; `must_haves`, `<fails_when>`, `<threat_model>`; verify `flutter analyze`, `flutter test`, `npx tsc`, `npx prisma validate`.
- No simulation; no `load`; no fake IP; no raw links/secrets in logs/UI.

### Integration Points
- `app/api/mobile/config/route.ts` (NEW) — `verifyAccessToken` + `getSubscriptionForUserId` + `artemida.getSubscriptionLinks` + `server-pool` parser → full sing-box config for `serverId`.
- `mobile/lib/core/vpn/` (NEW) — `ConnectionState` FSM, `ConnectionNotifier`, `ConfigRepository`, `VpnCore` facade, `RestartBackoff`, error mapping.
- `mobile/lib/core/ping/libbox_core.dart` — add `startWithTun(fd, config)` / stop; keep `urltest`.
- `mobile/native/libbox_shim/main.go` — add C exports for TUN fd; regenerate `libbox_bindings.dart`.
- `mobile/android/` (NEW Kotlin) — `VpnService`, foreground service, notification, method channel; manifest cleanup (`VPN_MANAGE` → `BIND_VPN_SERVICE`).
- `mobile/ios/` (NEW Swift) — `NEPacketTunnelProvider`, OnDemand rules, entitlements; build only after entitlement.
- `mobile/lib/features/servers/widgets/connect_panel.dart` → Connected Panel with IP/timer/traffic; reuse dark theme/copy.
- `mobile/lib/main.dart` / `app/router.dart` — app-level connection listener if needed; no bottom nav.
</code_context>

<specifics>
## Specific Ideas

- Reference prototype Connected Panel IDs: `cpServer`, `cpProto`, `cpIp`, `cpPing`, `cpTime`, `cpDown`, `cpUp`; status pill «VPN выключен/подключено», connect button states.
- Reference seed §6 FSM + cancel + network change reconnect + restart ×3; §4 two pools; §5 autoping.
- IP fallback: external endpoint through tunnel; таймаут 1–2 с; при ошибке «—» (не fake IP).
- Backoff: 1s/2s/4s after crash, reset after `connected`; max 3, then toast «VPN остановлен, попробуйте снова».
- Toasts: «Подключение отменено», «Сеть изменена — переподключение», «Нужно разрешение VPN», «Kill switch: трафик вне VPN заблокирован», «VPN остановлен, попробуйте снова».
- Android notification: «VPN активен · 3set» with disconnect action; swipe not dismissible.
- iOS entitlement `packet-tunnel-provider` уже в entitlements, но одобрение Apple не получено — внешний блокер.
- Min password 8 (phase 18); ignore prototype «минимум 6».

## Deferred Ideas

- Реальная сборка/тест iOS-туннеля — до одобрения NetworkExtension entitlement (внешний).
- Android native build/UAT — до появления JDK17 + Android SDK/NDK в CI; локально невозможно.
- Toggle kill switch — rejecting; always-on per D-09.
- Shop/purchase/subscription/profile/devices/promo — фаза 21.
- load-бар — фаза 21+ (REQ-POOL-04 отложена с фазы 19).
- Manual network-chip simulation — прототип-артефакт; только реальный `connectivity_plus`.
- Static server catalog / SNI allowlist / light theme / bottom nav — решения фазы 19 отклонены, не пересматривать.
- GPL-3.0 юридическая проверка и Play/App Store compliance — внешние блокеры.
- Android App Links fingerprint / AASA Team ID — фаза 18 UAT, внешние.
- Phase 19 UAT всё ещё отложен; перед финальным закрытием мильстоуна нужно вернуться к `/gsd-verify-work 19`.
</specifics>

<deferred>
## Deferred Ideas

See `<specifics>` Deferred Ideas above. No scope creep captured; no folded/reviewed todos (`todo.match-phase` empty). No UI-SPEC by explicit `--skip-ui` choice.
</deferred>

---
*Phase: 20-VPN Core & Connect FSM (10 days)*
*Context gathered: 2026-11-27*
