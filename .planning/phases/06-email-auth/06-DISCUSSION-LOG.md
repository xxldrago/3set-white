# Phase 6: Email Auth - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-05
**Phase:** 6-Email Auth
**Areas discussed:** Identity model, Password security, Email delivery, Login & linking UX

---

## Identity model

| Option | Description | Selected |
|--------|-------------|----------|
| Nullable telegramId | email/hash на User, один аккаунт | ✓ |
| Separate table | Отдельная credentials-таблица | |

**User's choice:** Nullable telegramId; trial один на аккаунт; merge on link (trialUsed = OR); сессия по userId
**Notes:** D-12 (telegram-id identity) эволюционирует — one-way миграция.

---

## Password security

| Option | Description | Selected |
|--------|-------------|----------|
| Argon2id | OWASP-рекомендация | ✓ |
| bcrypt-12 | Проще в деплое | |

**User's choice:** Argon2id; backoff + lock от перебора; мин. 8 символов; та же httpOnly cookie
**Notes:** —

---

## Email delivery

| Option | Description | Selected |
|--------|-------------|----------|
| Own SMTP | Свой relay | ✓ |
| Hosted API | Resend/Postmark | |

**User's choice:** Own SMTP; токен 1h one-time; честный ответ о существовании (enumeration-риск принят); welcome + reset письма
**Notes:** —

---

## Login & linking UX

| Option | Description | Selected |
|--------|-------------|----------|
| Form + widget stacked | Форма сверху, виджет ниже | ✓ |
| Tabs | Табы TG/Email | |

**User's choice:** Form + widget stacked (чинит и десктоп-кнопку); раздел «Аккаунт» для link/unlink; отвязку всего разрешить (lockout-риск принят); email-вход только в кабинете
**Notes:** —

---

## the agent's Discretion

None — пользователь закрыл все развилки явным выбором.

## Deferred Ideas

None.
