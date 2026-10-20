# Phase 5: Admin & Deploy - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-03
**Phase:** 5-Admin & Deploy
**Areas discussed:** Roles & access, Admin features, White Label, Deploy

---

## Roles & access

| Option | Description | Selected |
|--------|-------------|----------|
| admin_users table | Роли в БД по telegram_id | ✓ |
| Env only | Списки env | |

**User's choice:** `admin_users` table; standard matrix; admin-managed; bootstrap первого админа из env
**Notes:** Заменяется Phase 4 `requireAdminSession`.

---

## Admin features

| Option | Description | Selected |
|--------|-------------|----------|
| User lookup + profile | Поиск + карточка | ✓ |
| List only | Только список | |

**User's choice:** поиск+карточка; статистика DB+ARTEMIDA; threshold-алерт баланса; outbox-broadcast
**Notes:** Broadcast через worker (rate limits/блокировки).

---

## White Label

| Option | Description | Selected |
|--------|-------------|----------|
| Brand sub-link domain | my.3set.online | |
| Subdomain only | sub.my.3set.online | ✓ |

**User's choice:** `sub.my.3set.online` (A→144.31.93.193); ручная настройка бренда + чек-лист; verify + fallback
**Notes:** Код только читает домен из provider-ответа.

---

## Deploy

| Option | Description | Selected |
|--------|-------------|----------|
| Compose + Nginx | Docker + HTTPS | ✓ |
| Bare metal | systemd | |

**User's choice:** Compose+Nginx; pull+build+migrate; env+rotate root; backup+rollback
**Notes:** Без CI/CD в v1; секреты только на сервере.

---

## the agent's Discretion

None — пользователь закрыл все развилки явным выбором.

## Deferred Ideas

None.
