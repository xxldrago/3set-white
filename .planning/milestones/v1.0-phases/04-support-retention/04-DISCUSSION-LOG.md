# Phase 4: Support & Retention - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-03
**Phase:** 4-Support & Retention
**Areas discussed:** Ticket model, Attachments, Reply fan-out, Expiry reminders

---

## Ticket model

| Option | Description | Selected |
|--------|-------------|----------|
| Thread + messages | Один тикет = диалог | ✓ |
| Flat messages | Каждое сообщение — тикет | |

**User's choice:** Thread + messages; статусы open/answered/closed; ответы в Phase 4 — admin/API only; простая модель без категорий/приоритетов
**Notes:** Полноценная reply-панель агентов откладывается на Phase 5.

---

## Attachments

| Option | Description | Selected |
|--------|-------------|----------|
| Local volume | Файлы на сервере | ✓ |
| S3/Object store | Внешнее хранилище | |

**User's choice:** Local volume; images only (jpg/png/webp), 5 МБ, sharp downscale; бот через Bot API file_id, кабинет через multipart; gated serving (владелец/админ)
**Notes:** Публичных URL нет — защита PII/скриншотов.

---

## Reply fan-out

| Option | Description | Selected |
|--------|-------------|----------|
| Outbox push | Через outbox-worker в оба канала | ✓ |
| Sync send | Синхронная отправка | |

**User's choice:** Outbox push; unread tracking (счётчик/бейдж + пуш, read при открытии); ответ пользователя переоткрывает тикет
**Notes:** Переиспользуется outbox-паттерн Phase 3.

---

## Expiry reminders

| Option | Description | Selected |
|--------|-------------|----------|
| Daily cron | Ежедневный джоб сканирует ≤3 дня | ✓ |
| Per-key schedule | Расписание на ключ | |

**User's choice:** Daily cron; напоминать ежедневно до истечения; inline-кнопка «Продлить»; включая trial-ключи
**Notes:** Частота ежедневная (не однократно); trial напоминаем, CTA ведёт к покупке полного.

---

## the agent's Discretion

None — пользователь закрыл все развилки явным выбором.

## Deferred Ideas

None.
