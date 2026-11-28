# Phase 23: Hardening & Release - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-29
**Phase:** 23-hardening-release-7-days
**Areas discussed:** VPN/DNS hardening

---

## DNS leak fix

| Option | Description | Selected |
|--------|-------------|----------|
| IPv4-only 1.1.1.1 в конфиге | Заменить DNS-секцию в `lib/mobile-config.ts`, убрать IPv6; бэкенд остаётся источником конфига | ✓ |
| Оставить local hijack | Не менять D-08 фазы 20, риск утечек зафиксировать | |
| Опциональный режим | Две ветви конфига с флагом | |

**User's choice:** IPv4-only 1.1.1.1 в конфиге.

## Captive portal detection

| Option | Description | Selected |
|--------|-------------|----------|
| Реальный HTTP-проб через туннель | generate_204; 302 на non-HTTPS → disconnect + toast | ✓ |
| Только на старте подключения | Один раз перед connect | |
| Source-only / manual | Код без реальной проверки в проде | |

**User's choice:** Реальный HTTP-проб через туннель.

## Reaction on detection

| Option | Description | Selected |
|--------|-------------|----------|
| Disconnect + toast + «Повторить» | FSM → idle, ручной повтор, без авто-реконнекта | ✓ |
| Авто-реконнект | Продолжить проб и reconnect самому | |
| Оставить туннель + баннер | Предупреждение без разрыва | |

**User's choice:** Disconnect + toast + «Повторить».

## Verification boundary

| Option | Description | Selected |
|--------|-------------|----------|
| Manual-only UAT | Автотесты конфига/FSM; dnsleaktest и портал — на устройстве | ✓ |
| Авто-проверка в коде | CI-тест через внешний сайт | |
| Отложить REQ 23.3 | DNS не менять | |

**User's choice:** Manual-only UAT.

## the agent's Discretion

- Остальные задачи фазы подлежат research; пользователь обсудил только VPN/DNS.

## Deferred Ideas

- Авто-реконнект после портала — отклонён из-за гонки с D-15 фазы 20.
- Фейковый DNS-leak probe через внешний сайт — отклонён.
- Release gating, crash reporting, ARTEMIDA errors, battery, CI/CD, metadata, version bump — не обсуждались; остаются в фазе с внешними блокерами.
