# Phase 1: Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-30
**Phase:** 1-Foundation
**Areas discussed:** Bot runtime, DB setup, Auth детали, PWA scope

---

## Bot runtime

| Option | Description | Selected |
|--------|-------------|----------|
| Bot-in-Next | Один процесс, webhook route handleUpdate, проще деплой | ✓ |
| Отдельный процесс | bot/ контейнер рядом с web, независимые рестарты | |
| You decide | На усмотрение планировщика | |

**User's choice:** Bot-in-Next (prod webhook; dev polling; 2 токена прод+тест; single Next app: app/ + lib/bot.ts + webhook route)
**Notes:** Закрыто расхождение research STACK (отдельный процесс) vs ARCHITECTURE (bot-in-Next) в пользу bot-in-Next для single-VPS простоты.

---

## DB setup

| Option | Description | Selected |
|--------|-------------|----------|
| Postgres+Prisma | Postgres 17 + Prisma 7 в Docker сразу | ✓ |
| SQLite dev | SQLite локально, Postgres в проде | |
| You decide | На усмотрение планировщика | |

**User's choice:** Postgres 17 + Prisma ^7.10, Compose с day one, таблицы users + keys_cache, migrate+seed
**Notes:** Без SQLite-стадии — единый Compose локально и в проде.

---

## Auth детали

| Option | Description | Selected |
|--------|-------------|----------|
| Оба входа | Widget web + WebApp initData, одна сессия | ✓ |
| Widget only | Только Login Widget | |
| You decide | На усмотрение планировщика | |

**User's choice:** Dual Widget+initData, httpOnly cookie (jose), окно auth_date 24ч + replay-cache, ключ telegram-id unique
**Notes:** Строже стандартных 30-дневных примеров Telegram — защита от replay как в PITFALLS.

---

## PWA scope

| Option | Description | Selected |
|--------|-------------|----------|
| Manifest+shell | Install prompt + базовый shell | ✓ |
| Manifest+Serwist | Сразу с offline | |
| You decide | На усмотрение планировщика | |

**User's choice:** Manifest+shell; PWA показывает вход + статические гайды; /start — привет+кнопки; RU через i18n-ключи
**Notes:** Serwist отложен (проверка только на прод-сборке). Второй круг областей (Auth, PWA) добавлен по запросу "Explore more gray areas".

---

## the agent's Discretion

None — пользователь закрыл все развилки явным выбором.

## Deferred Ideas

None.
