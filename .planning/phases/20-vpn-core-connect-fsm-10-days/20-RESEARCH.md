# Phase 20: VPN Core & Connect FSM (10 days) - Research

**Researched:** 2026-11-27
**Domain:** Flutter 3.50.1 / Dart 3.14 mobile; own C-shared **sing-box libbox v1.14.4** shim extended to TUN; Android Kotlin `VpnService` + foreground service; iOS `NEPacketTunnelProvider` (prepared only, unverified); Riverpod 3.5 FSM; Next.js 16.3.7 BFF `GET /api/mobile/config?serverId=...`; kill switch; live stats.
**Confidence:** **HIGH** for in-repo values, backend reuse, libbox source-level facts and a *built + smoke-tested* TUN C ABI; **MEDIUM** for Android FGS/manifest and iOS NetworkExtension platform contracts (official docs, cannot run on-device here); **LOW/[ASSUMED]** for the iOS fd handoff until Apple entitlement, and for exact ARTEMIDA `links[]` shapes (inherited from phase 19).

Provenance: `[VERIFIED: path:lines]` = file opened with Read this session, values quoted verbatim; `[VERIFIED: smoke ...]` = tool-confirmed build/run output pasted; `[CITED: url]` = official docs; `[ASSUMED]` = training/community, needs confirmation. Absolute sing-box paths are the cached authoritative source `$(go env GOPATH)/pkg/mod/github.com/sagernet/sing-box@v1.14.4/…`.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
*(copied verbatim from `20-CONTEXT.md` `<decisions>`; phase boundary restated below.)*

**Phase boundary (domain, verbatim):** Рабочий VPN-туннель на Android/iOS с честной машиной состояний, kill switch, отменой подключения, авто-реконнектом и живой панелью подключения.
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

### Deferred Ideas (OUT OF SCOPE)
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

</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REQ-CONN-01 | FSM `idle → pinging → connecting → connected → disconnecting → idle` + `error`; transitions in UI | §Uncertainty #4: Riverpod `Notifier<ConnectionState>` with guarded transitions; reuse `ConnectOutcome` selection step; FSM enum values quoted from CONTEXT D-13 |
| REQ-CONN-02 | Cancel during `connecting` → `disconnecting` → `idle`, toast, no orphan tunnel | §Uncertainty #4/#5: generation token + `await native.stop()` before idle; CONTEXT D-14 |
| REQ-CONN-03 | Config generation from subscription + selected server | §Uncertainty #1/#9: backend reuses `verifyAccessToken` + `servers-source` + `parsePools`, adds pure `buildMobileConfig`; smoke-proven TUN config |
| REQ-CONN-04 | Android `VpnService` + foreground service notification «VPN активен · 3set» with disconnect | §Uncertainty #2: `prepare`/`establish`/`protect`, `BIND_VPN_SERVICE`, **no `vpn` FGS type** — use `specialUse` (ToyVpn sample) |
| REQ-CONN-05 | iOS `NEPacketTunnelProvider` + OnDemand | §Uncertainty #3: code prepared, not built; entitlement external; fd handoff risk documented |
| REQ-CONN-06 | Kill switch always-on, no leaks on disconnect | §Uncertainty #2/#3: Android no `allowBypass`; iOS OnDemand + included routes; D-09 |
| REQ-CONN-07 | Connected Panel live server/IP/ping/timer/↓↑ MB at 1s | §Uncertainty #6: `WriteStatus` totals via `CommandStatus=1`; IP via HTTP through tunnel, «—» fallback |
| REQ-CONN-08 | Auto-reconnect on network change with fresh ping + reselection | §Uncertainty #4: reuse `networkPingInvalidationProvider` + `ConnectController.connect`; router/tab guard |
| REQ-CONN-09 | Restart backoff 1s/2s/4s ×3, reset on `connected` | §Uncertainty #5: native watchdog callbacks → FSM `error`; backoff in Dart not Go |
| REQ-CONN-10 | Error mapping to safe RU toasts, no raw errors | §Uncertainty #5: shim already returns generic strings; map stable codes only |
| REQ-PING-05 | Network-change invalidation (carry-forward; now triggers reconnect) | §Uncertainty #4: existing invalidation clears cache + last-good, keep selection/current_tab; add reconnect when `connected` |
</phase_requirements>

---

## Project Constraints (from AGENTS.md)

Authority: repo `AGENTS.md` (read this session). Locked; research does not recommend contradictions. No `mobile/AGENTS.md` exists (glob verified).

1. **Project:** 3set-white VPN sales service, ARTEMIDA Paid API V1 `https://artemida.cc/v1`; backend = thin wrapper; RU/RUB; v2.0 adds Flutter mobile client.
2. **Tech stack:** Node + Next.js + Telegraf (user choice); mobile = Flutter + libbox per v2.0 scope.
3. **API limits:** trial cannot renew/upgrade; handle `401/402/409/429/502/503` + `Retry-After`.
4. **Security:** `ARTEMIDA_API_KEY`, Platega secrets, SSH/root password only in env/secrets; never commit; never log raw subscription links.
5. **Compatibility:** ARTEMIDA is **server-to-server only**; client never calls ARTEMIDA; mobile calls our `/api/mobile/*`; HTTPS mandatory.
6. **Infrastructure:** single server, `dash.3set.online`.
7. **Compliance:** RU/RUB, unlimited traffic by default.
8. **Next.js rules:** read `node_modules/next/dist/docs/` before writing backend code; App Router Route Handlers with `export const dynamic = "force-dynamic"`; Next **16.3.7** `[VERIFIED: AGENTS.md; node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md (phase 19)]`.
9. **GSD workflow:** plans in `.planning/phases/NN-*`; verify `flutter analyze`, `flutter test`, `npx tsc`, `npx prisma validate`; strict mobile lints.
10. **No simulation:** prototype `Math.random` ping, fake IP, `sleep`, fake connection must not appear in production paths (CONTEXT D-20).

### Known blockers (recorded; not re-solved)
- **GPL-3.0:** sing-box/libbox is GPL-3.0-or-later; legal review + source offer Phase 23. Dynamic linking does not auto-avoid obligations. `[CITED: cached sing-box LICENSE; .planning/research/STACK.md]`
- **Apple NetworkExtension entitlement** external (D-07). **Android build** blocked in this env: no JDK (`java --version` → "Unable to locate a Java Runtime"), no Android SDK/NDK `[VERIFIED: this session shell probe]`.
- **No live ARTEMIDA key** (probe key returns placeholder links) — inherited `[ASSUMED]` from phase 19.

---

## Summary

Phase 20 has four seams to build, plus two external blockers to respect. **(1) Backend:** a new `GET /api/mobile/config?serverId=...` that reuses the phase-19 JWT/active-key gate and parser and returns a *complete* sing-box config (TUN inbound included), never raw links or client→ARTEMIDA calls. **(2) Native:** extend the already-built own C-shared Go shim with `libbox_start_with_tun(fd, config)`; libbox's platform interface calls `OpenTun(options)`, queries the TUN name from the fd, **dups the fd**, and runs sing-box; Kotlin `VpnService` supplies that fd from `Builder.establish()`, with a foreground service + notification action and `onRevoke` handling. **(3) Dart:** a Riverpod FSM wrapping `ConnectOutcome` selection, with cancel/reselect-on-network-change/backoff/error mapping, plus a 1 Hz Connected Panel driven by libbox `StatusMessage` traffic counters. **(4) iOS:** prepare Swift target, OnDemand rules and entitlements, but do not build/verify the tunnel (D-07).

**Highest-value new findings (correcting/quantifying locked wording):**
- There **is no `vpn` Android foreground-service type**. Official Android 14 types are `camera, connectedDevice, dataSync, health, location, mediaPlayback, mediaProjection, microphone, phoneCall, remoteMessaging, shortService, specialUse, systemExempted` `[CITED: developer.android.com/about/versions/14/changes/fgs-types-required]`. Google's ToyVpn sample uses `FOREGROUND_SERVICE_SPECIAL_USE` + `android:foregroundServiceType="specialUse"` + `<property android:name="android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE" android:value="vpn"/>` + `BIND_VPN_SERVICE` `[CITED: android.googlesource.com/platform/development/.../ToyVpn/AndroidManifest.xml]`. The current manifest's `FOREGROUND_SERVICE_TYPE_VPN` and `VPN_MANAGE` are both bogus; fix both (D-06 says remove `VPN_MANAGE`).
- A **C-shared TUN shim was built and smoke-tested in this session**: `libbox_start_with_tun(int32_t fd, char* config)` exports cleanly; `libbox.CheckConfig` accepts a minimal TUN config. Passing a non-TUN fd **aborts the process (exit 134 SIGABRT)** rather than returning a C error — the fd must be a real platform TUN fd, and the plan must not "test" the happy path with a dummy fd.
- Traffic counters need no new package: libbox `StatusMessage` already carries `TrafficAvailable/Uplink/Downlink/UplinkTotal/DownlinkTotal` `[VERIFIED: cached libbox command_types.go:29-38]`; the phase-19 shim's `WriteStatus` is a no-op and must be extended, plus `AddCommand(CommandStatus=1)`.
- iOS fd handoff is **not a public API**: upstream Apple platform code calls `setTunnelNetworkSettings` then reads `packetFlow.value(forKeyPath: "socket.fileDescriptor")` (private KVC) with a C-loop fallback `[CITED: getlantern/lantern mirror of sing-box NetworkUtils.swift]`; Apple forums say the correct API is `NEPacketTunnelFlow` read/write, not an assumed fd `[CITED: developer.apple.com/forums/thread/756852]`. With D-07 (do not build iOS), prepare the seam but do not lock the fd mechanism.

**Primary recommendation:** Land the backend `/config` contract and pure config builder first; extend the own shim with a fd-taking C ABI + status counters and regenerate ffigen bindings; implement Kotlin `VpnService`/foreground service with `specialUse` manifest; then wire the Riverpod FSM, reconnect and panel on Android; keep iOS code compile-only and GPL/entitlement as recorded blockers.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| JWT + active-key gate for `/config` | API / Backend | Database (`KeyCache`) | secrets + ownership server-side; D-01/D-03; `[VERIFIED: app/api/mobile/servers/route.ts:66-89]` |
| Re-read ARTEMIDA subscription links + `serverId` → outbound | API / Backend | `KeyCache` cache-first | server-to-server only; D-01/D-02; `[VERIFIED: lib/servers-source.ts:14-25]` |
| Full sing-box config (TUN inbound, DNS, endpoint/outbound, route) | API / Backend | — | D-01 client receives ready JSON; pure builder + `CheckConfig` on client |
| TUN fd handoff + core lifecycle | Native (own C-shared shim) | Browser/Client (Dart FFI) | `OpenTun` is a platform callback, fd owned by platform; D-05 |
| Android `VpnService.prepare/establish/protect`, `onRevoke`, foreground notification | Native (Kotlin) | Flutter method channel | OS-owned VPN consent + fd; D-06 |
| iOS packet tunnel, OnDemand kill switch | Native (Swift app extension) | — | D-07; unverified until entitlement |
| FSM, cancel, reconnect, backoff, toasts | Browser/Client (Riverpod notifier) | Native core callbacks | D-13..D-19; selection comes from phase 19 |
| Kill switch enforcement | Native (Android route/no bypass; iOS OnDemand) | FSM (no orphan tunnel) | D-09; security boundary lives in OS tunnel |
| Connected Panel live stats | Browser/Client (Dart, 1 Hz) | Native libbox `WriteStatus` counters | D-16/D-17; no fake IP/traffic |
| Ping cache / last-good / connectivity invalidation | Database/Client (Drift, `connectivity_plus`) | FSM | REQ-PING-05 carry-forward; existing DAO |

---

## Standard Stack

### Core (no new npm/package dependencies required by locked scope)

| Library | Version | Purpose | Why Standard | Provenance |
|---------|---------|---------|--------------|------------|
| Next.js App Router | `16.3.7` | `app/api/mobile/config/route.ts` Route Handler | reuse phase-19 pattern, `force-dynamic`, no caching | `[VERIFIED: AGENTS.md; phase-19 19-RESEARCH.md]` |
| `@/lib/mobile-auth` `verifyAccessToken` | in-repo | JWT access guard | reuse, no new auth | `[VERIFIED: lib/mobile-auth.ts:45-56]` quote: `export async function verifyAccessToken(`, `req: Request,`, `): Promise<{ userId: number; telegramId: number \| null } \| null> {` |
| `@/lib/keys-service` + `@/lib/servers-source` + `@/lib/server-pool` | in-repo | active key, cache-first links, `parsePools`, `Server.outbound` | reuse exactly; D-04 forbids other sources | `[VERIFIED: lib/server-pool.ts:14,25-46; app/api/mobile/servers/route.ts:99-100]` |
| `zod` | `4.6.5` | validate `serverId` query + config response | existing | `[VERIFIED: phase-19 19-RESEARCH.md Standard Stack]` |
| `pino` logger | in-repo | outcome codes only; no links/secrets | existing | `[VERIFIED: app/api/mobile/servers/route.ts:142]` |
| Flutter / Dart | `3.50.1` / `3.14.0` | app + tests | installed SDK this session | `[VERIFIED: flutter --version output]` |
| `flutter_riverpod` / `riverpod_annotation` / `freezed` | `3.4.2` / `4.0.8` / `4.0.3` | FSM notifier + `ConnectionState` | phase 19 established | `[VERIFIED: mobile/pubspec.yaml:20,30,42]` |
| `connectivity_plus` | `^7.3.2` | real network-change stream for reconnect | already `.distinct()` in `ConnectivityService` | `[VERIFIED: mobile/pubspec.yaml:12; mobile/lib/core/connectivity/connectivity_service.dart:29-33]` |
| Dart `dart:ffi` + `package:ffi` + `ffigen` | `ffi ^2.2.0` / `ffigen ^23.0.0` (dev) | bind the extended shim | existing D-08 path | `[VERIFIED: mobile/pubspec.yaml:17,38]` |
| Go + sing-box libbox | Go `1.26.3`, sing-box `1.14.4` | own C-shared shim | `[VERIFIED: go version; mobile/native/libbox_shim/go.mod]` `require github.com/sagernet/sing-box v1.14.4` |
| `drift` / `drift_flutter` | `^2.35.4` / `^0.3.1` | ping cache, last-good, selection reused by reconnect | existing | `[VERIFIED: mobile/pubspec.yaml:15-16]` |
| Flutter `MethodChannel` (`flutter/services.dart`) | SDK built-in | Flutter ↔ Kotlin bridge; fd stays native | D-06; no plugin needed | `[CITED: docs.flutter.dev/platform-integration/platform-channels]` |
| Kotlin + AndroidX framework notification APIs | Gradle/Kotlin JVM 17 | `VpnService`, foreground service, notification action | no new Gradle dep required | `[VERIFIED: mobile/android/app/build.gradle]` `sourceCompatibility = JavaVersion.VERSION_17`, `jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17` |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `dart:io` `HttpClient`/`Socket` | SDK | IP-through-tunnel request with 1–2 s timeout | D-16; fallback «—» |
| `flutter_test` + `mocktail` | SDK/pub already present | FSM/unit/widget tests | all phases |
| `integration_test` | Flutter SDK | on-device vertical slice (CI) | Android CI only here |
| `AppTheme.dark` tokens | in-repo | Connected Panel styling | D-17 |
| `libbox_shim.h` + `ffigen.yaml` | committed ABI | regenerate `libbox_bindings.dart` after ABI change | D-05 |

### Alternatives Considered (and rejected under locked decisions)

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `libbox_start_with_tun(fd, config)` in own shim | official gomobile `.aar`/`.xcframework` + platform channels | upstream-supported but **not C-ABI**; violates D-05/D-08 `[VERIFIED: phase-19 19-RESEARCH.md]` |
| own shim | `flutter_sing_box` / `singbox_ffi` community pkg | not ffigen, no URLTest, pub legitimacy unverifiable by seam; D-05 forbids |
| Kotlin foreground service | `flutter_background_service` plugin | ROADMAP 20.5 names it, but **CONTEXT D-06 locks Kotlin service + method channel**; plugin would duplicate the notification/FGS lifecycle |
| `specialUse` FGS type | `systemExempted` | sing-box-for-android uses `systemExempted`, but official docs reserve it for system-configured VPNs; ToyVpn uses `specialUse` — choose `specialUse` for a third-party store app `[CITED: both sources]` |
| backend-generated full config | client assembles from `/servers.outbound` | D-01/D-04 explicitly forbid; also leaks secrets to client |
| real IP via external endpoint | fake/hardcoded IP from prototype | D-16/D-20 forbid simulation |

**Installation:** no new `npm install` / `flutter pub add` required. Regenerate bindings after ABI change: `cd mobile && dart run ffigen --config lib/core/ping/ffigen.yaml`; rebuild shim: `cd mobile/native/libbox_shim && ./build.sh host|android|ios`.

**Version verification:** `flutter --version` → 3.50.1/Dart 3.14.0 `[VERIFIED]`; `go version` → 1.26.3 `[VERIFIED]`; `node --version` → v24.15.0 `[VERIFIED]`; sing-box module pinned `v1.14.4` in `go.mod` `[VERIFIED]`.

## Package Legitimacy Audit

> No external package is *added* by this phase — the shim is our own Go module, the FFI/Dart/Next packages are already installed. The gate was still run for the packages that would be tempting to add.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `flutter_background_service` | pub.dev | — | — | — | not checked | **REMOVED** — contradicts locked D-06 (Kotlin foreground service) |
| `flutter_sing_box` / `singbox_ffi` | pub.dev | — | — | — | not checked | **REMOVED** — contradicts D-05 (own shim only) |
| own `libbox_shim` Go module | in-repo | — | — | in-repo | N/A | Approved |

**Packages removed:** `flutter_background_service`, `flutter_sing_box`, `singbox_ffi` (scope violation, not a registry verdict).
**Packages flagged suspicious:** none checked. *Note:* the `package-legitimacy check` seam supports npm/pypi/crates only; pub.dev cannot be machine-cleared `[VERIFIED: gsd-tools; phase-19 19-RESEARCH.md]`. If a future plan adds any pub package, insert `checkpoint:human-verify` before install.

---

## Critical Uncertainty #1 — Minimal sing-box v1.14.4 TUN config + fd handoff through our C shim

### What is authoritative (read + smoke-tested this session) `[VERIFIED]`

The libbox platform seam is:

> `[VERIFIED: $(go env GOPATH)/pkg/mod/github.com/sagernet/sing-box@v1.14.4/experimental/libbox/platform.go:5-10]`
> `type PlatformInterface interface {` … `OpenTun(options TunOptions) (int32, error)`

`TunOptions` exposes exactly the values Kotlin/Swift must mirror into the OS tunnel:

> `[VERIFIED: .../experimental/libbox/tun.go:18-25]`
> `type TunOptions interface {` / `GetInet4Address() RoutePrefixIterator` / `GetInet6Address() RoutePrefixIterator` / `GetDNSMode() *StringBox` / `GetDNSServerAddress() (StringIterator, error)` / `GetMTU() int32` / `GetAutoRoute() bool` / `GetStrictRoute() bool`

When a TUN inbound is configured, libbox calls `OpenTun`, queries the interface name **from the fd**, dups it, and constructs the tun:

> `[VERIFIED: .../experimental/libbox/service.go:68-85]`
> `tunFd, err := w.iif.OpenTun(&tunOptions{options, routeRanges, platformOptions})`
> `options.Name, err = getTunnelName(tunFd)`
> `dupFd, err := dup(int(tunFd))`
> `options.FileDescriptor = dupFd`
> `return tun.New(*options)`

On Apple, `getTunnelName` is `unix.GetsockoptString(fd, 2 /*SYSPROTO_CONTROL*/, 2 /*UTUN_OPT_IFNAME*/)` `[VERIFIED: .../experimental/libbox/tun_name_darwin.go]`; on Linux/Android it is an `ioctl(TUNGETIFF)` `[VERIFIED: .../experimental/libbox/tun_name_linux.go]`. `dup` is `syscall.Dup` on non-Windows `[VERIFIED: .../experimental/libbox/service_other.go]`. **Implication:** the passed fd must be a *real OS TUN fd*, not a pipe/socket; libbox duplicates it, so the native side keeps ownership of the original `ParcelFileDescriptor`.

Our current shim's platform deliberately returns an error for TUN:

> `[VERIFIED: mobile/native/libbox_shim/main.go:30,40-42]`
> `var errUnsupported = errors.New("not supported by the ping-only libbox shim")`
> `func (noopPlatform) OpenTun(libbox.TunOptions) (int32, error) {` / `return 0, errUnsupported` / `}`

and the committed C ABI has **no TUN entry point**:

> `[VERIFIED: mobile/native/libbox_shim/libbox_shim.h:90-96]`
> `extern char* libbox_setup(char* basePath, char* workingPath, char* tempPath);`
> `extern char* libbox_check_config(char* configJSON);`
> `extern char* libbox_start(char* configJSON);`
> `extern void libbox_stop(void);`
> `extern int urltest(char* tag, int timeoutMs);`
> `extern char* urltest_take(char* tag);`
> `extern void libbox_free_string(char* value);`

### Smoke proof (performed this session; scratch dir, not repo) `[VERIFIED: smoke ...]`

Built a C-shared shim from the cached sing-box v1.14.4 module, adding `libbox_start_with_tun(int32_t fd, char* cfg)` with a platform that returns the supplied fd from `OpenTun` and captures `TunOptions`. Commands/results:

```
CGO_ENABLED=1 go build -trimpath -buildmode=c-shared \
  -tags "with_gvisor,with_quic,with_wireguard,with_utls,with_naive_outbound,with_clash_api,badlinkname,tfogo_checklinkname0" \
  -ldflags "-X github.com/sagernet/sing-box/constant.Version=1.14.4 -s -w -buildid= -checklinkname=0" \
  -o libsmoke.dylib .
BUILD_OK
nm -gU libsmoke.dylib → T _libbox_start_with_tun, T _libbox_check_config, T _libbox_tun_options, T _libbox_stop, T _libbox_setup, T _libbox_free_string
setup: ''
check: ''          # libbox.CheckConfig accepted the minimal TUN config below
start_with_tun(socket fd 4): <process aborted>   # exit=134 (SIGABRT), no C error returned
```

**Two hard conclusions for the plan:**
1. The C ABI change is feasible with the existing toolchain; regenerate `libbox_shim.h` and `libbox_bindings.dart` from it (do not hand-write bindings).
2. An fd that is not a real TUN fd causes a **process abort**, because sing-box panics in a goroutine after `OpenTun` and cgo cannot recover it in the exported function (a `defer recover()` inside the export did not help). Never smoke-test `start_with_tun` with a dummy fd; validate in Kotlin/Swift that `establish()`/fd acquisition succeeded before calling FFI, and treat any native abort as a crash-recovery/backoff input.

### Minimal TUN config shape (accepted by `CheckConfig` in the smoke run)

> `[CITED: cached sing-box docs/configuration/inbound/tun.md:72-87]` verbatim structure keys: `"type": "tun"`, `"tag": "tun-in"`, `"address": ["172.18.0.1/30", "fdfe:dcba:9876::1/126"]`, `"mtu": 9000`, `"dns_mode": "hijack"`, `"dns_address": ["172.18.0.2", "fdfe:dcba:9876::2"]`, `"auto_route": true`; line 100: `"strict_route": true`; line 121: `"stack": "system"`.

Recommended backend-built config (values below are the accepted smoke variant; exact address/MTU must be mirrored by Kotlin):

```json
{
  "log": { "level": "error" },
  "dns": { "servers": [ { "type": "local", "tag": "local" } ], "final": "local" },
  "inbounds": [ {
    "type": "tun", "tag": "tun-in",
    "address": ["172.18.0.1/30", "fdfe:dcba:9876::1/126"],
    "mtu": 1500, "dns_mode": "hijack",
    "dns_address": ["172.18.0.2", "fdfe:dcba:9876::2"],
    "auto_route": true, "strict_route": true, "stack": "gvisor"
  } ],
  "endpoints": [ /* WireGuard endpoints, unchanged from phase 19 */ ],
  "outbounds": [ { "type": "direct", "tag": "direct" }, /* chosen server outbound */ ],
  "route": { "final": "direct" }
}
```

Kotlin must read these values from `TunOptions` (or from a side-channel the shim exposes) rather than hardcoding: `[VERIFIED: smoke captured TunOptions]` `inet4Address`, `inet6Address`, `mtu`, `autoRoute`, `strictRoute`, `dnsMode`. `stack: "gvisor"` is chosen because Android's system stack with VPN fd is less reliable for UDP/Reality `[ASSUMED — verify on device in CI]`. WireGuard stays an `endpoint` in 1.14 `[VERIFIED: phase-19 19-RESEARCH.md, sing-box outbound/wireguard.md]`.

### Keep the ping path intact
D-08 keeps `generate_204` urltest. The existing Dart config builder is the source of truth for the no-TUN shape:

> `[VERIFIED: mobile/lib/core/ping/libbox_ping_service.dart:9]` `const String generate204Url = "https://www.gstatic.com/generate_204";`
> `[VERIFIED: mobile/lib/core/ping/libbox_ping_service.dart:104-131]` `"log"`, `"dns"`, `"inbounds": <Map<String, dynamic>>[]`, `"endpoints"`, `"outbounds"`, `"route"`, `"type": "urltest"`, `"tag": "ut-$tag"`, `"url": generate204Url`.

Phase 20 must keep `libbox_start` + `urltest`/`urltest_take` working for the pre-connect ping (the FSM's `pinging` state) and add `libbox_start_with_tun` for the tunnel. Do **not** replace the ping core with the tunnel core; use one shim, two config modes.

---

## Critical Uncertainty #2 — Android Kotlin `VpnService` + foreground service + manifest

### Official contract `[CITED: developer.android.com/reference/android/net/VpnService]`
Steps (verbatim summary from doc): call `prepare(context)` and launch its intent if non-null; start service when prepared; create tunnel and negotiate parameters; call `Builder.establish()`; process packets on the returned fd; on `onRevoke()` close fd and shut down tunnel gracefully. Service declaration required:

```xml
<service android:name=".ExampleVpnService"
        android:permission="android.permission.BIND_VPN_SERVICE">
    <intent-filter>
        <action android:name="android.net.VpnService"/>
    </intent-filter>
</service>
```

The doc also states: "There can be only one VPN connection running at the same time. The existing interface is deactivated when a new one is created"; "The network is restored automatically when the file descriptor is closed"; "The VPN app must promote itself to the foreground after it's launched or the system will shut down the app."

### FGS type correction (highest-value Android finding) `[CITED]`
Android 14 FGS types do **not** include `vpn` `[CITED: developer.android.com/about/versions/14/changes/fgs-types-required]`. Missing type → `MissingForegroundServiceTypeException`; missing type permission → `SecurityException`. Google ToyVpn manifest uses:

```xml
<uses-permission android:name="android.permission.FOREGROUND_SERVICE"/>
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_SPECIAL_USE"/>
<service android:name=".ToyVpnService"
    android:permission="android.permission.BIND_VPN_SERVICE"
    android:foregroundServiceType="specialUse">
    <property android:name="android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE" android:value="vpn" />
    <intent-filter><action android:name="android.net.VpnService"/></intent-filter>
</service>
```
`[CITED: android.googlesource.com/platform/development/+/refs/heads/main/samples/ToyVpn/AndroidManifest.xml]`

Current repo manifest (all four lines verbatim) `[VERIFIED: mobile/android/app/src/main/AndroidManifest.xml:3-6]`:
> `<uses-permission android:name="android.permission.INTERNET" />`
> `<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />`
> `<uses-permission android:name="android.permission.FOREGROUND_SERVICE_TYPE_VPN" />`
> `<uses-permission android:name="android.permission.VPN_MANAGE" />`

**Fix:** delete `VPN_MANAGE` (D-06) **and** `FOREGROUND_SERVICE_TYPE_VPN` (not a real permission); add `FOREGROUND_SERVICE_SPECIAL_USE`; add `<service>` with `BIND_VPN_SERVICE`, `foregroundServiceType="specialUse"`, subtype property `vpn`, and the `android.net.VpnService` intent filter. Note `sing-box-for-android` uses `systemExempted` `[CITED: github.com/SagerNet/sing-box-for-android/blob/dev/app/src/main/AndroidManifest.xml]`, but official docs reserve that type for system-configured VPNs — **`specialUse` is the safer store-app choice**.

### Notification + method channel (D-06)
- Channel id/name are discretion; notification title exactly «VPN активен · 3set» `[VERIFIED: 20-CONTEXT.md:14,159]`. Disconnect `PendingIntent` action → Dart method channel → FSM `disconnecting`.
- `startForeground()` must happen promptly after service start; notification is ongoing (`Ongoing` + `setOngoing(true)`), swipe-not-dismissible. Enable/importance channel at API 26+; no `POST_NOTIFICATIONS` runtime prompt is strictly required for a foreground-service notification, but Android 13+ notification permission affects visibility `[CITED: developer.android.com/develop/background-work/services/fgs/launch]`.
- `allowBypass=false` is achieved by **not calling** `Builder.allowBypass()` (D-09). Also never call `Builder.setUnderlyingNetworks(null)` casually — that can exclude underlying networks; keep defaults.
- `Builder.addAddress/addRoute/addDnsServer/setMtu` must use values derived from libbox `TunOptions` (§1), not hardcoded, so routes match the tunnel's expectations.

### Permission deny / revoke (D-10/D-11)
- `prepare()` returning non-null `Intent` → stay `idle`, toast «Нужно разрешение VPN» + «Повторить» (retry calls `prepare()` again).
- `onRevoke()` → native callback to Dart → FSM `error` → `disconnecting` → `idle` + toast/retry; close fd and stop core before idle (no orphan tunnel).

---

## Critical Uncertainty #3 — iOS `NEPacketTunnelProvider` preparation only (D-07)

### Official contract `[CITED: developer.apple.com/documentation/networkextension/nepackettunnelprovider.md]`
- "`The com.apple.developer.networking.networkextension entitlement is required in order to use NEPacketTunnelProvider`."
- Override `startTunnel(options:completionHandler:)` and `stopTunnel(with:completionHandler:)`; use `setTunnelNetworkSettings(_:completionHandler:)` with `NEPacketTunnelNetworkSettings` (virtual IP, DNS, routes, MTU).
- `packetFlow: NEPacketTunnelFlow` is an object for reading/writing packets — **no public file-descriptor API**.
- App extension target must set `NSExtensionPointIdentifier = com.apple.networkextension.packet-tunnel` and `NSExtensionPrincipalClass` in its Info.plist, and be embedded in the app target.
- `NEOnDemandRuleConnect`: "When rules of this class match, the system starts the VPN connection whenever an application running on the system opens a network connection" `[CITED: developer.apple.com/documentation/networkextension/neondemandruleconnect.md]`.

Repo state `[VERIFIED: mobile/ios/Runner/Runner.entitlements:11-15]` verbatim:
> `<!-- Network Extension entitlement for VPN (required for future VPN phases) -->`
> `<key>com.apple.developer.networking.networkextension</key>`
> `<array>`
> `<string>packet-tunnel-provider</string>`
> `</array>`

The entitlement is **declared but not Apple-approved**; D-07 forbids building/verifying the tunnel now.

### fd handoff reality (recorded, not solved)
Upstream-derived Swift platform interface (Lantern mirror of sing-box `NetworkUtils.swift`) does:
1. `let settings = NEPacketTunnelNetworkSettings(tunnelRemoteAddress: "127.0.0.1")`, `settings.mtu = NSNumber(value: options.getMTU())`, `NEDNSSettings(servers: [dnsServer.value])` with `matchDomains = [""]`, `NEIPv4Settings(addresses:ipv4Address, subnetMasks:ipv4Mask)`, routes from `getInet4RouteAddress()` with subrange fallback, `excludeAPNs` `17.0.0.0/8`;
2. `try await tunnel.setTunnelNetworkSettings(settings)`;
3. `if let tunFd = tunnel.packetFlow.value(forKeyPath: "socket.fileDescriptor") as? Int32 { ret0_.pointee = tunFd }` with fallback `LibboxGetTunnelFileDescriptor()`.
`[CITED: raw.githubusercontent.com/getlantern/lantern/.../ExtensionPlatformInterface.swift]`

That KVC path is **private API**; Apple forums explicitly warn not to assume a tunnel fd and to use `NEPacketTunnelFlow` APIs instead `[CITED: developer.apple.com/forums/thread/756852]`. Since iOS is unverifiable here, the plan should:
- add the Swift extension target files + OnDemand rules + entitlements as **compile-only** sources;
- keep the fd-taking shim as the native seam but mark the Swift fd acquisition `[ASSUMED]` until entitlement approval;
- degrade UI/iOS flags without pretending a tunnel exists (D-07) — no fake "connected" state;
- **do not** spend phase time on a private-API workaround or a packet buffer bridge now; record it as an open question for the entitlement-approved follow-up.

`flutter build ios --no-codesign` compiled in phase 18 `[VERIFIED: .planning/STATE.md decisions]`; adding a NetworkExtension target changes signing/provisioning requirements, so local no-codesign may compile app sources but cannot exercise the extension.

---

## Critical Uncertainty #4 — FSM with Riverpod 3.5, cancel, reconnect, backoff

### Reusable phase-19 seams `[VERIFIED]`

- Selection already exists and must be the FSM's first stage:
  > `[VERIFIED: mobile/lib/features/servers/providers.dart:231-259]` `class ConnectOutcome {` / `required this.ok,` / `this.serverId,` / `this.error,` / `this.notice,` / `this.suggestOtherTab = false,` / `bool get blocked => error == "no_active_key";`
  > `[VERIFIED: mobile/lib/features/servers/providers.dart:311-385]` `Future<ConnectOutcome> connect(PoolTab tab, { required bool auto, String? manualServerId, }) async {` — quick-path/full ping only; D-18 comment: "Deliberately stops at selection: no tunnel, no `core.start`, no FSM and no simulated connection (D-18). The VPN core lands in phase 20."
- Real connectivity stream + invalidation already exist:
  > `[VERIFIED: mobile/lib/features/servers/providers.dart:495-528]` `final networkPingInvalidationProvider = Provider<bool>((ref) {` … `repository.cancelInflight();` … `await dao.clearPingCacheAndLastGood();` … keeps `selection` + `current_tab`.
  > `[VERIFIED: mobile/lib/core/connectivity/connectivity_service.dart:57-63]` `_controller.add(results);` with startup `_updateStatus()` deliberately not broadcasting.
- Native calls are serialized in Dart by a Completer tail `[VERIFIED: mobile/lib/core/ping/libbox_core.dart:238-249]`, and the library load path is platform-specific:
  > `[VERIFIED: mobile/lib/core/ping/libbox_core.dart:124-135]` `if (Platform.isAndroid) { return ffi.DynamicLibrary.open("libboxshim.so"); }` / `if (Platform.isIOS || Platform.isMacOS) { return ffi.DynamicLibrary.process(); }`

### Recommended FSM design (D-13/D-14/D-15/D-18)

`freezed` union or enum + data class, owned by one `Notifier<ConnectionState>` (name discretion; e.g. `connectionNotifierProvider`). Transitions only through methods; log `{from,to,reason}` with no config/secrets:

```
idle --connect--> pinging --selected--> connecting --native connected--> connected
  ^                  |                    |                    |
  |                  +---- error ---------+--------------------+-- crash --> (backoff) --> connecting
  |                                       |                    |
  +-------- disconnecting <---------------+--------------------+-- disconnect/network change
                        |
                       idle
```

- `pinging`: call the existing `ConnectController.connect(tab, auto:, manualServerId:)`; a `ConnectOutcome` with `ok == false` → `error` (map `no_active_key` → auth toast; `all_offline` → unreachable toast). `blocked` getter already exists `[VERIFIED: providers.dart:258]`.
- `connecting`: fetch `/config` with the chosen `serverId` (D-01), then `libbox_start_with_tun(fd, config)`. Button becomes «Подключение…» and cancels on second tap.
- **Cancel (D-14):** a generation/token correlated with the FSM instance; on cancel, set `disconnecting`, `await nativeStop()` (shim `libbox_stop` + close `ParcelFileDescriptor`), then `idle`, toast «Подключение отменено». Never set `idle` before `stop()` returns — this is the "no orphan tunnel" invariant.
- **Network change (D-15 + REQ-PING-05):** in `connected`, debounce (existing 500 ms), clear ping cache + last-good, keep selection/current_tab, run fresh ping, reselect best by RTT (server may change), then full `disconnecting → connecting` and toast «Сеть изменена — переподключение». Guard against the VPN interface itself adding a connectivity emission (`ConnectivityResult.vpn` exists in 7.3.2 `[VERIFIED: phase-19 19-RESEARCH.md]`) — compare result sets and ignore VPN-only self-changes.
- **Backoff (D-18):** Dart-side `RestartBackoff` with delays `1s, 2s, 4s`, max 3, counter reset on first `connected`. Native crash/stop callbacks (or a periodic status probe) feed it; after 3 failures → `error` + toast «VPN остановлен, попробуйте снова». Keep timers cancellable on user disconnect/app logout.
- App-level listener: `App.build` already watches `networkPingInvalidationProvider` `[VERIFIED: phase-19 19-06-SUMMARY]`; add a connection listener there only if needed to keep the notifier alive — do not reintroduce bottom nav.

---

## Critical Uncertainty #5 — Error mapping, crash signals, safe toasts

The shim **already returns generic C strings** by design:

> `[VERIFIED: mobile/native/libbox_shim/main.go:206-210]` `// cErrorMessage deliberately returns a generic message: sing-box errors can echo configuration fragments, which must never reach logs or the UI.` / `func cErrorMessage(generic string) *C.char { return C.CString(generic) }`

Dart wraps these in safe exceptions:

> `[VERIFIED: mobile/lib/core/ping/libbox_core.dart:21-34]` `class LibboxConfigException implements Exception {` … `// The raw libbox error is deliberately discarded: it can echo configuration` / `// fragments, and configuration contains outbound secrets.`

**Rule:** never surface the C string; map a small stable code set to Russian toasts (D-19): `permission_denied` → «Нужно разрешение VPN» + «Повторить»; `auth_failed`/`no_active_key` → «Нет активного ключа» (or auth screen on 401 from `/config`); `unreachable` → «Сервер недоступен»; `config_invalid` → «Не удалось подготовить подключение»; `core_stopped` → «VPN остановлен, попробуйте снова»; `revoked` → permission toast. Log only `{code, state, durationMs}` via pino-equivalent Dart logger; never log config, links, tokens, fd numbers, or raw provider text.

**Crash/abort signal:** §1 smoke test proved a bad fd aborts the process with no C error. Since Dart cannot catch a native abort, the plan must treat "service disappeared while `connected`" as a crash event for the backoff (status probe or native death callback), and avoid feeding arbitrary fds.

---

## Critical Uncertainty #6 — Connected Panel live stats (traffic, timer, IP)

**Traffic counters are already available in libbox** — no new plugin:

> `[VERIFIED: cached .../experimental/libbox/command_types.go:29-38]`
> `type StatusMessage struct {` / `TrafficAvailable bool` / `Uplink int64` / `Downlink int64` / `UplinkTotal int64` / `DownlinkTotal int64` / `}`

Status is streamed to `CommandClientHandler.WriteStatus(*StatusMessage)` when the client subscribes to `CommandStatus`:

> `[VERIFIED: cached .../experimental/libbox/command.go:4-6]` `CommandLog int32 = iota` / `CommandStatus` / `CommandGroup`

The phase-19 shim only subscribes to groups:

> `[VERIFIED: mobile/native/libbox_shim/main.go:294-296]` `options := &libbox.CommandClientOptions{}` / `options.AddCommand(libbox.CommandGroup)` / `client := libbox.NewCommandClient(handler, options)`
> `[VERIFIED: mobile/native/libbox_shim/main.go:177-186]` `func (h *urltestHandler) WriteStatus(*libbox.StatusMessage) {}` (no-op)

**Extension:** add `AddCommand(CommandStatus)`, store totals in the handler's `WriteStatus`, and export e.g. `libbox_traffic()` returning JSON `{"down":<bytes>,"up":<bytes>,"available":<bool>}` (reuse `cErrorMessage`/`libbox_free_string` discipline). Dart's panel polls it on a 1 s `Timer` (D-17); session timer is Dart-side `DateTime.now() - connectedAt` (not native). Display MB with the prototype's existing format; IP via a real HTTP GET to `https://api.ipify.org` (D-16; endpoint/timeout discretion, 1–2 s) through the tunnel, cached per session, fallback «—» on any error. No simulation: the prototype's `conn.down += rand(...)` and `fakeIp()` `[VERIFIED: prototype lines 722,768]` must not be ported.

Prototype cells to replace `[VERIFIED: mobile/lib/features/servers/widgets/connect_panel.dart:132-168]` verbatim: `Expanded(child: _cell("IP", "—", theme))`, `Text("—:—:—", ...)`, `Text("↓ —   ↑ —", ...)`, `"Туннель, IP и трафик — фаза 20"`. Locked panel fields `[VERIFIED: 20-CONTEXT.md:22]` verbatim: `flag+city, protocol, IP, ping, session timer, ↓/↑ MB`.

---

## Critical Uncertainty #7 — GPL-3.0 / store compliance (recorded blocker, not re-solved)

`[VERIFIED: cached sing-box v1.14.4 LICENSE; phase-19 19-RESEARCH.md §9]` sing-box/libbox = **GPL-3.0-or-later**; Karing also GPL-3.0. Phase 20 extends the same shim, so obligations are unchanged. Dynamic linking (`.so`/`.dylib`) does not automatically discharge a GPL-3.0 source offer; Phase 23 owns legal review + source offer + store metadata. App Store review also requires the NetworkExtension entitlement and a VPN-purpose explanation; Play requires FGS type declaration in app content (see FGS doc). **Do not re-solve here** — note in plan risks.

---

## Critical Uncertainty #8 — Environment constraints and CI artifacts

`[VERIFIED: shell probes this session]`:
- Flutter `3.50.1`, Dart `3.14.0`, Go `1.26.3`, Node `v24.15.0` — available.
- `java --version` → "Unable to locate a Java Runtime" — **no JDK 17**; Android SDK/NDK not verified → cannot build Android `.so` or run Android UAT here (D-07/STATE blockers).
- `xcodebuild` present; phase 18 verified `flutter build ios --debug --no-codesign`; CocoaPods `pod` not on PATH in this env.
- sing-box v1.14.4 module is cached locally; host c-shared build + CheckConfig smoke **succeeded**.
- Native binaries remain gitignored CI outputs `[VERIFIED: mobile/.gitignore via 19-02-SUMMARY]`.

Plan implication: all Android/iOS runtime acceptance is `human_judgment: true` / CI-artifact gated; the locally verifiable slice is Dart unit/widget tests, backend vitest/tsc, ffigen regeneration, shim host build, `CheckConfig`, `flutter analyze`, and iOS compile-only if the new Swift target does not require provisioning.

---

## Critical Uncertainty #9 — Backend `/api/mobile/config?serverId=...` route pattern

Reuse the phase-19 contract verbatim where possible `[VERIFIED: app/api/mobile/servers/route.ts:14,66-99]`:
> `export const dynamic = "force-dynamic";`
> `const claims = await verifyAccessToken(req);` / `if (!claims) { ... 401 }`
> `const keys = await listKeysByUserId(claims.userId);`
> `error: "no_active_key"` … `403`
> `const source = await getSubscriptionLinksCacheFirst(claims.userId, active.id);`
> `const { simple, whitelist } = parsePools(source.links);`

Recommended shape for the new route (pure builder in a new `lib/mobile-config.ts` or exported from `lib/server-pool.ts`):
1. `verifyAccessToken` → 401 with `{ok:false,error:"unauthorized"}`.
2. active key gate (`isActiveKey` from the servers route is exported) → 403 `{ok:false,error:"no_active_key"}` (D-03 per-request).
3. `serverId` query must be a non-empty string, zod-validated; find the server in `parsePools(links)` by `id` (D-02); unknown id → 404 or 200 `{ok:false,error:"server_not_found"}` (discretion) — never accept a client-supplied outbound/config fragment (D-04).
4. Assemble full config with a pure `buildMobileConfig(server)`: TUN inbound (§1), DNS new-format, endpoints for WireGuard, `srv-<id>` outbound (`Server.outbound` verbatim shape `[VERIFIED: lib/server-pool.ts:25-46]` `interface ServerOutbound { type: string; tag: string; [key: string]: unknown; }`), direct outbound, `route.final = "direct"`. `generate_204` urltest group retained for the pre-connect ping if the client still pings through this config.
5. Return `{ok:true, config:{...}, server:{id,city,flag,proto,sni?,tab}}`; **never** log/return raw links or the whole `links[]`. Provider errors degrade like `/servers` (no 5xx; `Retry-After`; cached/stale) `[VERIFIED: route.ts:111-131]`.
6. Tests (vitest): 401, 403, unknown `serverId`, success config matches schema, WG endpoint placement, no raw link/secret in body or logs, provider error mapping.

Client: add `Endpoints.config` to `[VERIFIED: mobile/lib/core/api/endpoints.dart:14-18]` `// Future endpoints (Phase 19+)` with `static const String servers = '/api/mobile/servers';` — extend the same class, no new API client.

---

## Architecture Patterns

### System Architecture Diagram

```
   Flutter UI (dark prototype, no bottom nav)
     ConnectPanel (idle/pinging/connecting/connected/disconnecting/error)
        │ tap                         ▲ 1s timer: timer + ↓/↑ MB + IP
        ▼                             │
   ConnectionNotifier (Riverpod FSM) ────── RestartBackoff (1/2/4s, reset on connected)
        │ 1. pinging: ConnectController.connect(tab)  [phase-19 selection, fresh cache/last-good]
        │ 2. config:  dio GET /api/mobile/config?serverId=... (JWT, per-request key gate)
        ▼
   VpnBridge (MethodChannel) ── Kotlin VpnService
        │ prepare() → consent Intent (deny → idle + toast)
        │ establish() → ParcelFileDescriptor  ── protect(fd) for core sockets
        │ TunOptions → Builder.addAddress/addRoute/setMtu (no allowBypass)
        │ onRevoke() → error → disconnecting → idle + toast
        ▼ fd (native-owned)
   Own C-shared Go shim (sing-box v1.14.4)
     libbox_start_with_tun(fd, config) ── OpenTun → getTunnelName(fd) → dup(fd) → tun.New
     libbox_traffic() ← WriteStatus (CommandStatus=1) ← CommandClient
     libbox_stop() → close core; Dart awaits stop before idle
        │ tunneled traffic
        ▼
   ARTEMIDA server endpoints (WireGuard endpoint / VLESS / SS / HY2 / Trojan / VMess)
        ▲ server-to-server only
   Next.js BFF: /api/mobile/config
     verifyAccessToken → isActiveKey → getSubscriptionLinksCacheFirst → parsePools → buildMobileConfig(serverId)
        │ never client→ARTEMIDA; no secrets in logs; force-dynamic
        ▼
   ARTEMIDA Paid API V1
```

### Recommended project structure (added)

```
app/api/mobile/config/route.ts            # NEW: JWT+key gated full config
lib/mobile-config.ts                      # NEW: pure buildMobileConfig(server) + zod schema
tests/unit/mobile-config-route.test.ts    # backend tests
mobile/lib/core/vpn/                      # NEW: connection_state.dart, connection_notifier.dart,
                                          #   vpn_bridge.dart, config_repository.dart,
                                          #   restart_backoff.dart, error_mapping.dart
mobile/lib/core/ping/libbox_core.dart     # EXTEND: startWithTun(fd, config), traffic(), stop/reset
mobile/native/libbox_shim/main.go         # EXTEND: libbox_start_with_tun fd platform + status capture
mobile/native/libbox_shim/libbox_shim.h   # REGENERATE + ffigen.yaml + libbox_bindings.dart
mobile/android/.../kotlin/com/u3set/mobile/VpnService.kt, VpnForegroundService.kt (names discretion)
mobile/android/app/src/main/AndroidManifest.xml  # fix bogus perms; add service + specialUse
mobile/ios/PacketTunnel/                  # NEW Swift files (compile-only; D-07)
mobile/lib/features/servers/widgets/connect_panel.dart # live Connected Panel
mobile/lib/core/api/endpoints.dart        # + config
mobile/lib/main.dart / app/router.dart    # app-level connection listener only if needed
```

### Pattern 1: fd stays native; Dart only sees a handle-free call
**What:** Kotlin creates the fd, calls `libbox_start_with_tun(fd, configJson)` via JNI-free FFI wrapper, and never serializes fd into Dart; Dart calls `startWithTun(config)` on a platform object that hands the fd natively.
**When:** D-05/D-06 single FFI path with a method channel for VPN permission.
**Example (C ABI; signature is discretion per CONTEXT, name locked):**
```c
extern char* libbox_start_with_tun(int32_t fd, char* configJSON); // returns "" or generic error
extern char* libbox_traffic(void);   // {"down":N,"up":N,"available":bool}
extern void libbox_stop(void);
```
Values in the example: `fd`, `configJSON` from D-05; `down/up/available` from `[VERIFIED: cached libbox command_types.go:34-38]`.

### Anti-Patterns to Avoid
- **Calling ARTEMIDA from the client** or sending raw outbound/config from client (D-01/D-04).
- **Building a fake connected state** (`sleep`, `Math.random`, `fakeIp`) — D-20; prototype simulation is an artifact.
- **Passing a dummy fd to the shim** to "test" TUN start — proven SIGABRT (§1).
- **Using `VPN_MANAGE` / `FOREGROUND_SERVICE_TYPE_VPN`** manifest permissions — not real Android permissions (§2).
- **Treating gomobile `.aar`/`.xcframework` as C-ABI for ffigen** — phase-19 verified false.
- **Synchronous RTT from `URLTest`** — returns `error` only; RTT async via `WriteGroups` (phase 19).
- **`flutter_background_service`** for the VPN notification — D-06 locks Kotlin foreground service.
- **Setting `idle` before native `stop()` completes** — orphan tunnel (D-14).
- **Logging config/secrets/fd/raw provider errors** — D-19/D-20.
- **iOS tunnel work requiring entitlement** — D-07; prepare code only.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| VPN protocols + TUN packet processing | custom proxy core | own C-shared shim over **sing-box libbox v1.14.4** | protocol correctness; D-05 |
| Dart↔C bindings | hand-written `dart:ffi` | `ffigen` from regenerated `libbox_shim.h` | D-05; phase-19 pattern |
| Android VPN permission + OS routes | custom socket/VPN implementation | Kotlin `VpnService.prepare/establish/protect` | OS consent + fd lifecycle `[CITED: Android VpnService]` |
| Foreground notification | `flutter_background_service` plugin | Kotlin foreground service + method channel | D-06 |
| Server selection/ping cache | new algorithm | phase-19 `ConnectController`/`PingRepository`/Drift DAO | already tested |
| Config generation from links | client-side string templating | backend pure `buildMobileConfig` + `libbox.CheckConfig` | D-01; secret boundary |
| Traffic counters | estimate from timers/fake bytes | libbox `StatusMessage` + `WriteStatus` | `[VERIFIED command_types.go:29-38]` |
| Auth/key gating | new JWT/key logic | `verifyAccessToken` + `isActiveKey` + `getSubscriptionLinksCacheFirst` | phase 19 |
| Network-change detection | polling/manual toggle | `connectivity_plus` stream + existing invalidation | REQ-PING-05 |

**Key insight:** phase 20's original code is **one C ABI extension, one Kotlin service pair, one backend route+builder, one FSM, and one panel** — not a VPN core, not a ping engine, not an auth system.

---

## Common Pitfalls

### Pitfall 1: invalid TUN fd aborts the app
**What:** any fd that is not a real OS TUN fd passed to `libbox_start_with_tun`. **Why:** `getTunnelName(fd)` + Go panic in another goroutine, unrecoverable across cgo. **Avoid:** only call after successful `establish()`; never use a pipe/socket in tests; treat disappearance as crash/backoff. **Warning:** `exit=134` with no C error `[VERIFIED: smoke]`.

### Pitfall 2: bogus manifest permissions / FGS type
**What:** `VPN_MANAGE` and `FOREGROUND_SERVICE_TYPE_VPN`. **Why:** not valid Android permissions/types. **Avoid:** `BIND_VPN_SERVICE` + `FOREGROUND_SERVICE_SPECIAL_USE` + `foregroundServiceType="specialUse"` + subtype property. **Warning:** `MissingForegroundServiceTypeException`/`SecurityException` at `startForeground()`.

### Pitfall 3: `idle` before `stop()`
**What:** cancel/revoke sets `idle` while native core still routes packets. **Avoid:** `await stop()` then idle; close fd in `onRevoke`. **Warning:** traffic still flowing with UI "disconnected".

### Pitfall 4: network-change reconnect loops
**What:** VPN interface itself emits a connectivity change → infinite reconnect. **Avoid:** compare result sets, ignore VPN-only self-changes, keep 500 ms debounce, reuse `connectivityService`. **Warning:** repeated «Сеть изменена» toasts.

### Pitfall 5: stale selection after reselection
**What:** D-15 may change server; old selection remains. **Avoid:** persist new selection via `SelectionNotifier.select()`; keep per-tab semantics. **Warning:** next connect uses the old server.

### Pitfall 6: key expiry mid-tunnel
**What:** key expires while connected. **Avoid:** D-03 gating at every `/config` request → next reconnect gets 403 → `error` → disconnect + auth toast. **Warning:** tunnel stays up indefinitely on an expired key.

### Pitfall 7: secret leakage through config
**What:** logging config JSON or raw links; returning `links[]` to client. **Avoid:** backend returns only assembled config over HTTPS + JWT; no logs of body; Dart exceptions stay generic. **Warning:** secrets in CI logs or crash reports.

### Pitfall 8: fake stats/IP
**What:** prototype `rand()` bytes, `fakeIp()`, `sleep()` connect. **Avoid:** `StatusMessage` counters + real HTTP IP with «—» fallback. **Warning:** tests pass but product lies.

### Pitfall 9: `WriteStatus` not subscribed
**What:** panel shows zeros forever. **Avoid:** `options.AddCommand(libbox.CommandStatus)` alongside `CommandGroup`. **Warning:** `TrafficAvailable == false`.

### Pitfall 10: iOS overreach
**What:** trying to sign/build/test the packet tunnel now. **Avoid:** compile-only Swift + OnDemand; D-07. **Warning:** blocked by entitlement/private KVC.

### Pitfall 11: GPL blocker forgotten
**What:** shipping libbox-derived binary without source offer. **Avoid:** record risk for Phase 23; no new licensing decisions here.

### Pitfall 12: backend degradation mismatch
**What:** `/config` returns 5xx or raw provider error on ARTEMIDA failure. **Avoid:** mirror `/servers` (empty/error code, cached/stale, `Retry-After`, no secrets).

---

## Code Examples

Verified patterns; exact Dart/Kotlin names are discretion, but all discrete values below are quoted from source-of-truth files above.

### C shim extension (main.go) — fd-taking entry + status capture
```go
// values quoted: libbox.PlatformInterface.OpenTun(options) (int32, error) from
// cached platform.go:9; options.Name/getTunnelName/dup from service.go:68-81.
type tunPlatform struct{ fd int32 }

func (p *tunPlatform) OpenTun(o libbox.TunOptions) (int32, error) {
    // mirror o.GetMTU()/GetInet4Address()/GetDNSMode() into Kotlin elsewhere
    return p.fd, nil
}

//export libbox_start_with_tun
func libbox_start_with_tun(fd C.int32_t, cfg *C.char) *C.char { /* CheckConfig → NewCommandServer → Start → StartOrReloadService; generic errors only */ }

//export libbox_traffic
func libbox_traffic() *C.char { /* JSON from StatusMessage: TrafficAvailable/UplinkTotal/DownlinkTotal */ }
```
> Quoted values: `[VERIFIED: cached platform.go:9]` `OpenTun(options TunOptions) (int32, error)`; `[VERIFIED: cached service.go:68,72,77]` `tunFd, err := w.iif.OpenTun(...)`, `options.Name, err = getTunnelName(tunFd)`, `dupFd, err := dup(int(tunFd))`; `[VERIFIED: cached command_types.go:34-38]` `TrafficAvailable`, `UplinkTotal`, `DownlinkTotal`.

### Minimal TUN config (backend builder output)
```json
{ "log":{"level":"error"},
  "dns":{"servers":[{"type":"local","tag":"local"}],"final":"local"},
  "inbounds":[{"type":"tun","tag":"tun-in","address":["172.18.0.1/30","fdfe:dcba:9876::1/126"],"mtu":1500,"dns_mode":"hijack","dns_address":["172.18.0.2","fdfe:dcba:9876::2"],"auto_route":true,"strict_route":true,"stack":"gvisor"}],
  "endpoints":[], "outbounds":[{"type":"direct","tag":"direct"}], "route":{"final":"direct"} }
```
> Quoted values: `[CITED: cached docs/configuration/inbound/tun.md:74-87,100,121]` `"type": "tun"`, `"tag": "tun-in"`, `"address": ["172.18.0.1/30", "fdfe:dcba:9876::1/126"]`, `"dns_mode": "hijack"`, `"dns_address": ["172.18.0.2", "fdfe:dcba:9876::2"]`, `"auto_route": true`, `"strict_route": true`, `"stack": "system"` — `"gvisor"`/`mtu:1500` are the smoke-tested variant `[VERIFIED: smoke check: '']`.

### Kotlin VpnService lifecycle (shape)
```kotlin
class ThreeSetVpnService : VpnService() {
  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    startForeground(NOTIF_ID, notification()) // ongoing, «VPN активен · 3set», disconnect action
    val fd = Builder().addAddress(/* from TunOptions */).addRoute(/* ... */)
                     .setMtu(/* ... */).setSession(/* ... */).establish() ?: return START_NOT_STICKY
    fd.use { pfd -> nativeStartWithTun(pfd.fd, configJson) }
    return START_STICKY
  }
  override fun onRevoke() { nativeStop(); stopSelf() } // → FSM error → disconnecting → idle
}
```
> Quoted values: `[VERIFIED: 20-CONTEXT.md:14,159]` «VPN активен · 3set»; `[CITED: developer.android.com/reference/android/net/VpnService]` `prepare`, `establish`, `protect`, `onRevoke`, one-VPN-at-a-time, fd-close restores network. `START_NOT_STICKY`/`START_STICKY` are Android framework constants (public API, not in-repo discrete values) `[CITED]`.

### FSM transitions (Dart shape)
```dart
enum ConnPhase { idle, pinging, connecting, connected, disconnecting, error }
// transitions: idle→pinging→connecting→connected→disconnecting→idle; error from any
Future<void> cancel() async {
  if (state.phase == ConnPhase.connecting) {
    _generation++;
    state = state.copyWith(phase: ConnPhase.disconnecting);
    await ref.read(vpnBridgeProvider).stop();   // native stop BEFORE idle
    state = const ConnectionState(ConnPhase.idle);
    toast("Подключение отменено");
  }
}
```
> Quoted values: `[VERIFIED: 20-CONTEXT.md:16,55]` `idle → pinging → connecting → connected → disconnecting → idle` + `error`; `[VERIFIED: 20-CONTEXT.md:56]` `cancel во время connecting → disconnecting → idle`, тост «Подключение отменено»; `[VERIFIED: mobile/lib/features/servers/providers.dart:258]` `bool get blocked => error == "no_active_key";`.

### Backend route (shape)
```ts
export const dynamic = "force-dynamic";
const claims = await verifyAccessToken(req);          // 401
const active = keys.find(isActiveKey);                 // 403 no_active_key
const parsed = zodServerId.safeParse(req.nextUrl.searchParams.get("serverId"));
const { simple, whitelist } = parsePools(source.links);
const server = [...simple, ...whitelist].find(s => s.id === parsed.data);
return NextResponse.json({ ok: true, config: buildMobileConfig(server), server: meta(server) });
```
> Quoted values: `[VERIFIED: app/api/mobile/servers/route.ts:14,70,81,99-100]` verbatim lines shown in §9; `[VERIFIED: lib/server-pool.ts:14]` `export type PoolTab = "simple" | "whitelist";`.

### Traffic polling (Dart shape)
```dart
Timer.periodic(const Duration(seconds: 1), (_) async {
  if (state.phase != ConnPhase.connected) return;
  final raw = await ref.read(libboxCoreProvider).traffic(); // {"down":..,"up":..,"available":bool}
  final secs = DateTime.now().difference(state.connectedAt!).inSeconds;
  // render ↓/↑ MB + HH:MM:SS; IP cached from real HTTP-through-tunnel, else "—"
});
```
> Quoted values: `[VERIFIED: 20-CONTEXT.md:22]` `трафик/таймер 1s из libbox counters`; `[VERIFIED: cached command_types.go:35-38]` `Uplink`, `Downlink`, `UplinkTotal`, `DownlinkTotal`; `[VERIFIED: mobile/lib/features/servers/widgets/connect_panel.dart:132-149]` `"IP", "—"`, `"—:—:—"`, `"↓ —   ↑ —"`.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| phase-19 no-TUN libbox + client-side ping config | backend full config + TUN inbound in the same libbox v1.14.4 shim | phase 20 D-01/D-05 | one core, two config modes |
| `libbox_start` only | `libbox_start_with_tun(fd, config)` + regenerate bindings | phase 20 | fd stays platform-owned; C ABI change is costly |
| `flutter_background_service` idea (ROADMAP 20.5) | Kotlin `VpnService` + foreground service + method channel | CONTEXT D-06 overrides | correct OS lifecycle |
| `VPN_MANAGE`/`FOREGROUND_SERVICE_TYPE_VPN` | `BIND_VPN_SERVICE` + `FOREGROUND_SERVICE_SPECIAL_USE`/`specialUse`+subtype `vpn` | Android 14 FGS rules `[CITED]` | avoids FGS exceptions |
| prototype fake stats/IP | libbox `StatusMessage` counters + real IP HTTP | D-16/D-17/D-20 | honest live panel |
| 403 no key at connect | 403 at every `/config` request + reconnect-time drop | D-03 | expiry enforced |
| `WriteGroups` only | `CommandStatus` added for traffic | phase 20 | 1 Hz counters |

**Deprecated/outdated in scope:** prototype simulation (`Math.random`, `sleep`, `fakeIp`), `VPN_MANAGE`, `FOREGROUND_SERVICE_TYPE_VPN`, `flutter_background_service` for VPN, client-supplied outbound, and `.planning/research/STACK.md` stale versions (superseded by actual pubspec as recorded in phase 19).

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `stack: "gvisor"` and MTU 1500 work on Android VPN fd | §1 config | CI on-device tuning may change values; `CheckConfig` only proves schema |
| A2 | Android `specialUse` FGS is accepted by Play for a VPN app | §2 | Play review may demand `systemExempted` or different subtype; Play Console declaration needed |
| A3 | iOS fd can be obtained from `packetFlow` KVC or a compatible bridge after entitlement | §3 | private API / App Store rejection; may require memory-buffer bridge |
| A4 | Exact ARTEMIDA `links[]` formats match phase-19 parser assumptions | §9 | serverId lookup misses; inherited `[ASSUMED]` checkpoint from phase 19 |
| A5 | `api.ipify.org` is reachable through the tunnel within 1–2 s | §6 | IP shows «—»; endpoint is discretion and replaceable |
| A6 | Native crash manifests as missing status/callback detectable by Dart | §4/#5 | backoff may not fire; needs CI verification |
| A7 | `flutter build ios --no-codesign` still compiles after adding a Swift extension target | §8 | may need CI provisioning even for compile-only |

**Verified-not-assumed:** all in-repo values quoted above; libbox source signatures, TUN ABI build + `CheckConfig`, traffic fields; Android/iOS official doc statements; Next route pattern; tools available in env.

---

## Open Questions (RESOLVED)
1. **Exact `libbox_start_with_tun` signature** — What we know: D-05 locks the name and fd+config inputs; smoke build proves `int32_t fd, char* cfg` works. Unclear: whether fd ownership needs `dup` on the Kotlin side too (libbox dups internally, so likely not), and whether a separate `reset()` C call is needed after abort. Recommendation: keep fd native-owned; add reset only if CI shows stale state. **RESOLVED: keep fd native-owned; `int32_t fd, char* config` C ABI; libbox dups internally, no Kotlin-side dup; add reset only after CI evidence of stale state; post-entitlement/UAT check.**
2. **iOS packet-flow → libbox fd** — What we know: `packetFlow` has no public fd; upstream uses private KVC. Unclear: entitlement approval outcome; App Store policy. Recommendation: compile-only Swift + recorded risk; do not solve in phase 20 (D-07). **RESOLVED: compile-only Swift `NEPacketTunnelProvider` + entitlements per D-07; packet-flow private KVC risk recorded, not solved in phase 20; no iOS tunnel verification until Apple approval.**
3. **VPN self-triggered connectivity events** — What we know: `connectivity_plus` 7.3.2 includes `vpn`. Unclear: exact emission on Android during establish. Recommendation: ignore VPN-only changes in the reconnect listener; verify in CI UAT. **RESOLVED: reconnect listener ignores VPN-only connectivity changes (`ConnectivityResult.vpn`) to avoid self-triggered loops; verify in CI UAT.**
4. **Toast copy for non-locked errors** — What we know: locked strings from CONTEXT §specifics. Unclear: exact wording for `config_invalid`/`unreachable`. Recommendation: discretion, keep short Russian, no raw errors. **RESOLVED: agent discretion — short Russian action toasts for `config_invalid`/`unreachable`, no raw libbox/config text; locked strings from CONTEXT take precedence.**
5. **Config response contract** — What we know: D-01 says ready JSON. Unclear: whether to return metadata (`flag/city/proto`) alongside config. Recommendation: include minimal metadata (panel needs it) and keep the config object opaque. **RESOLVED: `/config` returns the ready config JSON plus minimal metadata (`flag/city/proto`) for the panel; config object opaque; no secrets in logs.**
6. **GPL/Play compliance** — recorded external blocker; no decision in phase 20. **RESOLVED: GPL-3.0/Play/App Store compliance remains an external recorded blocker; no phase-20 decision; do not implement compliance work.**

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Flutter / Dart | app + tests | ✓ | 3.50.1 / 3.14.0 | — |
| Go | shim rebuild | ✓ | 1.26.3 | — |
| sing-box module | shim | ✓ (cache) | v1.14.4 | — |
| clang + c-shared build | host smoke | ✓ | Apple clang | — |
| Xcode / macOS | iOS compile-only | ✓ | present | — |
| CocoaPods `pod` | iOS plugins | ✗ | — | SPM/CI; phase-18 iOS build still worked |
| OpenJDK 17 | Android `.so`/Gradle | ✗ | — | CI artifacts; no local Android build/UAT |
| Android SDK/NDK | Android build | ✗ | — | CI artifacts |
| ARTEMIDA key | live `/config` verify | ✗ | placeholder only | fixtures + `[ASSUMED]` re-verify |
| NetworkExtension entitlement | iOS tunnel | ✗ (declared, unapproved) | — | compile-only (D-07) |

**Missing with no fallback:** JDK17 + Android SDK/NDK (Android runtime verification), Apple entitlement (iOS tunnel verification). **Missing with fallback:** ARTEMIDA live key (fixtures), CocoaPods (CI/SPM).

---

## Validation Architecture

> `workflow.nyquist_validation = true` and `security_enforcement = true` `[VERIFIED: .planning/config.json]`. Both sections included.

### Test Framework
| Property | Value |
|----------|-------|
| Mobile | `flutter_test` + `mocktail`; `integration_test`; `flutter analyze`; `flutter test` |
| Backend | `vitest`; `npx tsc --noEmit`; `npx prisma validate` |
| Native | `go build -buildmode=c-shared` + host C/ctypes smoke (`CheckConfig`, ABI symbols); Android/iOS artifacts in CI |
| Quick run | `flutter analyze && flutter test test/unit/core/vpn` + `npx vitest run tests/unit/mobile-config*` |
| Full suite | `flutter test` + `npx vitest run` + `npx tsc --noEmit` + `npx prisma validate` |
| Phase gate | all green before `/gsd-verify-work` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| REQ-CONN-01 | FSM transitions + logging | unit | `flutter test test/unit/core/vpn/connection_state_test.dart` | ❌ Wave 0 |
| REQ-CONN-02 | cancel → stop before idle | unit (fake bridge) | `flutter test test/unit/core/vpn/cancel_test.dart` | ❌ Wave 0 |
| REQ-CONN-03 | `/config` 401/403/200 + full schema | vitest | `npx vitest run tests/unit/mobile-config-route.test.ts` | ❌ Wave 0 |
| REQ-CONN-04 | Android service/notification/manifest | source/unit + CI | `flutter analyze`; CI `./gradlew lint` | ❌ Wave 0 |
| REQ-CONN-05 | iOS files present (compile-only) | source test | `flutter build ios --no-codesign` (CI) | ❌ Wave 0 |
| REQ-CONN-06 | kill switch flags | source + UAT | test source asserts no `allowBypass`; CI UAT | ❌ Wave 0 |
| REQ-CONN-07 | 1 Hz panel + real IP fallback | widget + unit fake traffic | `flutter test test/widget/.../connect_panel_test.dart` | ❌ Wave 0 |
| REQ-CONN-08 | network change → reselection + toast | unit (mock connectivity) | `flutter test test/unit/core/vpn/reconnect_test.dart` | ❌ Wave 0 |
| REQ-CONN-09 | 1/2/4s backoff reset | unit (fake clock) | `flutter test test/unit/core/vpn/restart_backoff_test.dart` | ❌ Wave 0 |
| REQ-CONN-10 | error → safe toast | unit | `flutter test test/unit/core/vpn/error_mapping_test.dart` | ❌ Wave 0 |
| REQ-PING-05 | invalidation keeps selection | unit (existing DAO) | `flutter test test/unit/core/db/ping_cache_test.dart` | ✅ phase 19 |
| D-05 TUN ABI | symbols + CheckConfig | native smoke | `go build c-shared` + ctypes `check_config` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `flutter analyze` + targeted `flutter test`; backend `npx tsc --noEmit` + focused vitest.
- **Per wave merge:** `flutter test` + `npx vitest run`.
- **Phase gate:** full suite + `npx prisma validate`; Android/iOS artifacts and on-device tunnel UAT are `human_judgment: true` (external blockers).

### Wave 0 Gaps
- [ ] `tests/unit/mobile-config-route.test.ts` + `lib/mobile-config.ts` (REQ-CONN-03)
- [ ] `mobile/lib/core/vpn/*` tests: FSM, cancel, backoff, error mapping, reconnect (REQ-CONN-01/02/08/09/10)
- [ ] shim TUN ABI + traffic C exports + regenerated `libbox_bindings.dart` + ffigen idempotency (D-05/REQ-CONN-07)
- [ ] Kotlin `VpnService`/foreground service source-level guards (REQ-CONN-04/06)
- [ ] Connected Panel widget tests with fake traffic + IP fallback (REQ-CONN-07)
- [ ] iOS compile-only source test (REQ-CONN-05)
- [ ] `flutter pub get` + `build_runner` if new freezed models added

---

## Security Domain

> `workflow.security_enforcement = true`, `security_asvs_level = 1`, `security_block_on = high` `[VERIFIED: .planning/config.json]`. Phase handles auth, secrets, OS VPN privilege and external config → required.

### Applicable ASVS Categories (L1)

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | yes | `verifyAccessToken` on `/config`; 401; no token logging `[VERIFIED: mobile-auth.ts:45-56]` |
| V3 Session Management | yes | JWT access 15m/refresh 30d; 401 → auth flow; no token in logs |
| V4 Access Control | yes | per-request active-key gate + `serverId` ownership via `parsePools(userId)`; no client outbound injection (D-02/D-03/D-04) |
| V5 Input Validation | yes | zod `serverId`; `libbox.CheckConfig`; scheme allowlist inherited; no eval |
| V6 Cryptography | yes | sing-box TLS/uTLS/Reality; never hand-roll; no secrets in logs |
| V7 Error Handling & Logging | yes | generic C strings; stable codes to toasts; no config/link/fd/raw provider text logged |
| V8 Data Protection | yes | config over HTTPS+JWT; raw links server-side; no secrets in Drift/UI |
| V9 Communications | yes | HTTPS; server-to-server ARTEMIDA; no client→ARTEMIDA |
| V11 Business Logic | yes | always-on kill switch; no fake stats; backoff bounded |
| V14 Configuration | yes | manifest permissions corrected; entitlements env/CI-managed; pinned versions |

### Known Threat Patterns for Flutter + Next.js + libbox + Android VPN

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Bogus/excessive VPN permission or FGS type | Elevation | `BIND_VPN_SERVICE` only, `specialUse` subtype; no `VPN_MANAGE` |
| Orphan tunnel after cancel/revoke | Tampering / DoS | `await stop()` before `idle`; close fd in `onRevoke`; generation token |
| Traffic leak when core dies | Info Disclosure | always-on kill switch; no `allowBypass`; iOS OnDemand; backoff stops at error |
| Config/secret leakage | Info Disclosure | backend-only assembly; generic errors; no raw links in body/logs |
| Invalid fd → native abort | DoS | fd from OS `establish()` only; no dummy-fd tests; crash → backoff |
| Expired key mid-session | Elevation | `/config` re-gate on reconnect; drop tunnel on 403 |
| Fake connected state | Tampering | real status/traffic counters; real IP or «—» |
| GPL license violation | legal | recorded blocker; Phase 23 |

---

## Sources

### Primary (HIGH confidence)
- In-repo files read this session: `20-CONTEXT.md`, `REQUIREMENTS.md`, `STATE.md`, `ROADMAP.md`, `AGENTS.md`, `.planning/config.json`, `app/api/mobile/servers/route.ts`, `lib/server-pool.ts`, `lib/servers-source.ts`, `lib/mobile-auth.ts`, `mobile/lib/core/ping/{libbox_core.dart,libbox_ping_service.dart,generated/libbox_bindings.dart}`, `mobile/lib/core/connectivity/connectivity_service.dart`, `mobile/lib/features/servers/{providers.dart,widgets/connect_panel.dart}`, `mobile/lib/core/api/endpoints.dart`, `mobile/native/libbox_shim/{main.go,go.mod,libbox_shim.h,build.sh}`, `mobile/android/app/src/main/AndroidManifest.xml`, `mobile/android/app/build.gradle`, `mobile/ios/Runner/{Info.plist,Runner.entitlements}`, `mobile/pubspec.yaml`, phase-19 CONTEXT/RESEARCH/summaries 01–08, `prototype-mobile-client.html`, `SEED-001`.
- Cached sing-box v1.14.4 source (authoritative, opened with Read): `experimental/libbox/{platform.go,tun.go,service.go,setup.go,command_types.go}`, `docs/configuration/inbound/tun.md`, `common/urltest/urltest.go` (grep).
- Own smoke build: `/tmp/lb20-smoke` c-shared `.dylib` + ctypes calls; `BUILD_OK`, `check: ''`, `nm` symbols, `exit=134` on dummy fd.

### Secondary (MEDIUM confidence)
- `https://developer.android.com/reference/android/net/VpnService` — prepare/establish/protect/onRevoke, manifest service example, background-start requirement.
- `https://developer.android.com/about/versions/14/changes/fgs-types-required` — FGS type list + exceptions.
- `https://android.googlesource.com/platform/development/+/refs/heads/main/samples/ToyVpn/AndroidManifest.xml` — `specialUse` + subtype `vpn`.
- `https://developer.apple.com/documentation/networkextension/nepackettunnelprovider.md` and `.../neondemandruleconnect.md`.
- `https://raw.githubusercontent.com/getlantern/lantern/.../ExtensionPlatformInterface.swift` — upstream-derived Apple platform pattern.

### Tertiary (LOW / [ASSUMED])
- iOS `packetFlow` KVC viability after entitlement (private API; forum warning at `developer.apple.com/forums/thread/756852`).
- `gvisor` stack on Android VPN fd; exact ARTEMIDA `links[]` shapes.

---

## Metadata

**Confidence breakdown:**
- **Standard stack / versions:** HIGH — installed toolchain + pubspec + go.mod verified.
- **Architecture / libbox TUN ABI:** HIGH — source read + C-shared smoke build + CheckConfig; Android/iOS platform contracts MEDIUM (docs only, no device here).
- **Backend reuse:** HIGH — phase-19 route/parser/tests read.
- **FSM/panel design:** HIGH for seams, MEDIUM for runtime semantics (needs CI device).
- **Pitfalls:** HIGH for proven crashes/manifest errors; MEDIUM/LOW for iOS.

**Research date:** 2026-11-27
**Valid until:** 30 days (stable stack); re-verify ARTEMIDA live links, iOS entitlement, Android CI artifact before execution.

---

*Every in-repo discrete value above is quoted verbatim beside its `[VERIFIED: path:lines]` tag; external claims are `[CITED]`; anything unverified is `[ASSUMED]`. Known blockers (GPL-3.0, entitlement, no Android toolchain here, no live ARTEMIDA key) are recorded, not re-solved.*



