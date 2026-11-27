# Phase 20: VPN Core & Connect FSM (10 days) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-27
**Phase:** 20-VPN Core & Connect FSM (10 days)
**Areas discussed:** Источник конфига и ключ, TUN и нативный слой, Kill switch и права, FSM/reconnect/панель

---

## Selection

User selected all four gray areas: **Источник конфига и ключ, TUN и нативный слой, Kill switch и права, FSM/reconnect/панель**.

Not re-asked (carried forward): REQ-CONN-01..10; D-01/D-04/D-05/D-08/D-10/D-11/D-15..D-22 from phase 19; dark theme; no bottom nav; no simulation; no `load`; no secret leakage; `connect` selection-only in phase 19 becomes real tunnel here; live APIs.

---

## Источник конфига и ключ

| Option | Selected |
|--------|----------|
| Бэкенд-эндпоинт `/config` | ✓ |
| Клиент парсит subscription | |
| Расширить `/servers.outbound` | |

**User's choice:**_backend `/api/mobile/config?serverId=...`, backend parses subscription links via `getSubscriptionForUserId` + `getSubscriptionLinks`, returns full sing-box JSON; secrets stay server-side.

| Option (server identification) | Selected |
|-------------------------------|----------|
| По `serverId`, парсинг на бэкенде | ✓ |
| Клиент шлёт outbound | |
| Вся подписка на клиенте | |

| Option (gating) | Selected |
|-----------------|----------|
| Гейт при каждом конфиге (401 / `no_active_key` 403) | ✓ |
| Только при старте | |
| Без гейта | |

**Notes:** if key expires mid-session → disconnect at next reconnect. No `/pricing`, no `getKeyWithLinks`, no `/servers.outbound` as full config source.

---

## TUN и нативный слой

| Option (TUN FFI) | Selected |
|------------------|----------|
| Расширить свой C-shared shim (`libbox_start_with_tun(fd, config)`) | ✓ |
| gomobile + channels | |
| Сторонний плагин | |

| Option (Android) | Selected |
|------------------|----------|
| Kotlin `VpnService` + foreground service + method channel | ✓ |
| Только `flutter_background_service` | |
| Flutter VPN-плагин | |

| Option (iOS) | Selected |
|--------------|----------|
| Android-first, iOS подготовить без сборки до entitlement | ✓ |
| iOS сразу, CI красный | |
| Отложить iOS | |

**Notes:** Kotlin `VpnService.prepare()/establish()/protect()`; notification «VPN активен · 3set» with disconnect action; fix manifest `VPN_MANAGE` → `BIND_VPN_SERVICE`; `NEPacketTunnelProvider` + OnDemand rules prepared but not verified without Apple entitlement.

---

## Kill switch и права

| Option (kill switch) | Selected |
|----------------------|----------|
| Всегда включён (no toggle) | ✓ |
| Только во время туннеля | |
| Toggle, по умолчанию вкл | |

| Option (permission deny) | Selected |
|--------------------------|----------|
| Toast + кнопка «Повторить», остаёмся в idle | ✓ |
| Блокировать и при отказе | |
| Авто-повтор запроса | |

| Option (revoked while connected) | Selected |
|----------------------------------|----------|
| Отключить + toast | ✓ |
| Продолжить до обрыва | |
| Игнорировать | |

**Notes:** Android `allowBypass=false`; iOS `NEOnDemandRuleConnect` all interfaces; kill-switch toast «Kill switch: трафик вне VPN заблокирован».

---

## FSM, reconnect и панель

| Option (auto-reconnect) | Selected |
|-------------------------|----------|
| Перевыбор лучшего по RTT (cleared cache + fresh ping) | ✓ |
| Тот же сервер, fallback при failure | |
| Тот же сервер всегда | |

| Option (IP source) | Selected |
|--------------------|----------|
| IP через API внутри туннеля, при ошибке «—» | ✓ |
| Скрыть IP | |
| Только из libbox | |

| Option (restart backoff reset) | Selected |
|--------------------------------|----------|
| Сброс после успешного `connected` | ✓ |
| Без сброса до disconnect | |
| Бесконечно | |

**Notes:** FSM `idle→pinging→connecting→connected→disconnecting→idle` + `error`, transitions logged; cancel during connecting → disconnecting → idle + «Подключение отменено»; toast «Сеть изменена — переподключение»; 3 restarts 1s/2s/4s then «VPN остановлен, попробуйте снова»; Connected Panel 1s from libbox counters.

---

## the agent's Discretion

- C ABI signature for TUN fd (ownership, stop/reset), ffigen config.
- Kotlin VpnService/foreground service code and method-channel name.
- sing-box TUN inbound config, DNS/WG endpoint details, IP endpoint and timeout.
- Internal names of FSM states, `ConnectionState` model, log events.
- Exact toast strings not locked above; iOS readiness gating before entitlement.

## Deferred Ideas

- iOS tunnel verification until Apple entitlement.
- Android native build/UAT until JDK17/SDK/NDK in CI.
- Kill switch toggle — rejected; always-on.
- Shop/purchase/subscription/profile/devices/promo — phase 21.
- load bar — deferred from phase 19 (REQ-POOL-04).
- Manual network-chip simulation — prototype artifact, not production.
- GPL-3.0 legal review, Play/App Store compliance — external.
- Android fingerprint / AASA Team ID — phase 18 UAT, external.
- Phase 19 UAT still deferred; return to `/gsd-verify-work 19` before milestone close.
