# Phase 4: Support & Retention - Context

**Gathered:** 2026-10-03
**Status:** Ready for planning

## Phase Boundary

Phase 4 — помощь и удержание. Пользователь создаёт обращение в поддержку из бота и из кабинета; все обращения попадают в единую очередь (thread-модель) со статусами open/answered/closed, с вложениями (фото/скриншоты) и fan-out ответов в оба канала; и получает push-напоминание в Telegram за 3 дня до истечения ключа с кнопкой продления. Ответы поддержки в Phase 4 — через admin/API (полноценная админ-панель — Phase 5). Триггер напоминаний — ежедневный cron. Регистрация/оплата/ключи уже реализованы (Phases 1–3).

## Implementation Decisions

### Ticket model

- **D-49:** Тикет = thread-диалог: `Ticket` + `TicketMessage` (сообщения внутри); не плоские обращения — **Reversibility:** costly — переход к плоской модели ломает историю и очередь
- **D-50:** Статусы `open → answered → closed`; ответ пользователя в answered/closed тикет переоткрывает его (`reopens`) — **Reversibility:** costly — смена семантики статусов затрагивает очередь, UI и fan-out
- **D-51:** Ответы поддержки в Phase 4 — только через admin/API (session-gated admin-эндпоинты/бот); полноценная панель в Phase 5 — не строим reply-UI для агентов сейчас
- **D-52:** Простая модель v1: subject (тема/первое сообщение), без категорий и приоритетов

### Attachments

- **D-53:** Хранение — локальный volume на сервере (single-server), в БД путь/метаданные; не S3 — **Reversibility:** costly — переезд на объектное хранилище затрагивает upload/download/миграцию файлов
- **D-54:** Только изображения (jpg/png/webp), лимит 5 МБ, downscale через `sharp` перед сохранением
- **D-55:** Бот получает вложение через Telegram Bot API (`getFile` по file_id); кабинет — multipart upload; оба пути ведут в один attachment-контракт
- **D-56:** Отдача вложений — gated: авторизованный роут отдаёт файл только владельцу тикета или админу; публичных URL нет — **Reversibility:** costly — публичные URL = утечка PII/скриншотов

### Reply fan-out

- **D-57:** Доставка ответа поддержки в оба канала — через outbox-worker (существующий `lib/outbox.ts`): Telegram push + отражение в кабинете; синхронной отправки нет — **Reversibility:** costly — sync-send теряет ответы при Bot API сбое
- **D-58:** Учёт непрочитанных: счётчик/бейдж в кабинете + пуш в бот; отметка `read` при открытии тикета
- **D-59:** Ответ пользователя в answered/closed тикет → сообщение в тот же thread, статус `reopens` (не новый тикет)

### Expiry reminders (PAY-05)

- **D-60:** Триггер — ежедневный cron-джоб (через `instrumentation.ts`, как reconcile Phase 3); сканирует ключи с истечением ≤ 3 дней
- **D-61:** Напоминать ежедневно до истечения (не однократно) — **Reversibility:** costly — смена частоты затрагивает дедуп/идемпотентность и качество UX (риск спама)
- **D-62:** Напоминание содержит inline-кнопку «Продлить» → renew-flow Phase 3
- **D-63:** Напоминаем и по trial-ключам (include trial), несмотря на запрет renew — CTA для trial ведёт к покупке полного

### the agent's Discretion

None — все развилки закрыты явным выбором пользователя.

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project scope

- `.planning/PROJECT.md` — core value, constraints (RU/RUB, безлимит, trial)
- `.planning/REQUIREMENTS.md` — Phase 4: PAY-05, SUP-01, SUP-02, SUP-03
- `.planning/ROADMAP.md` § Phase 4: Support & Retention — цель, success criteria (4 шт.), **UI hint: yes**

### Prior phases

- `.planning/phases/01-foundation/01-CONTEXT.md` — D-01..D-16 (bot-in-Next, Prisma, identity, i18n, `chatId` на users)
- `.planning/phases/02-keys-trial/02-CONTEXT.md` — D-17..D-32 (ARTEMIDA client, cache-first keys, sub-link/QR)
- `.planning/phases/03-payments/03-CONTEXT.md` — D-33..D-48 (money path, outbox, orders) — outbox — переиспользуемый паттерн
- `.planning/phases/03-payments/03-03-SUMMARY.md` — outbox worker + instrumentation (шаблон для cron/напоминаний)
- `.planning/phases/03-payments/03-06-SUMMARY.md`, `03-07-SUMMARY.md` — кабинет и бот-паритет (образцы компонентов/веток бота)

### Research

- `.planning/research/ARCHITECTURE.md` — паттерны: BFF, outbox fulfillment, notify fan-out (channel-agnostic queue, `chat_id` per user)
- `.planning/research/PITFALLS.md` — Pitfall: единая очередь тикетов бот+кабинет; вложения и PII
- Platega docs — много оплат — оплата уже в Phase 3
- `docs/artemida-v1-contract.md` — ARTEMIDA контракт (renew для кнопки напоминания)

## Existing Code Insights

### Reusable Assets

- `lib/outbox.ts` — idempotent enqueue keyed `(orderId,type)`, atomic claim; шаблон для notify-тикетов и напоминаний
- `lib/worker.ts` — `startWorker` singleton, drain loop, `startReconcileTick` — шаблон для daily reminder-cron
- `instrumentation.ts` — bootstrap worker/reconcile (Node-runtime guard, lazy import) — сюда добавится reminder-tick
- `lib/bot.ts` + `lib/bot-payments.ts` — Telegraf singleton, `/start` меню, ветки keys/payments/guides; notify-dispatch функция
- `lib/session.ts`, `lib/auth.ts` — session-gate; `chatId` на `users` — fan-out anchor (SUP-03)
- `lib/prisma.ts`, `prisma/schema.prisma` — `User`/`KeyCache`/`Order`/`Outbox`; сюда `Ticket`/`TicketMessage`/`Attachment` (D-49/53)
- `lib/keys-service.ts` — ownership joins, cache-first; источник данных для напоминаний (expiresAt/isTrial)
- `lib/i18n/messages/ru.ts` + `t()`/`tp()` — все новые строки
- `app/api/**/route.ts` — BFF-паттерн (session-gate, zod, typed errors)
- `components/*` — SubscriptionCard/ConfirmPanel/CopyButton/QrSvg как образцы
- `lib/logger.ts` — pino (PII-дисциплина)

### Established Patterns

- Outbox + worker для асинхронной доставки; атомарные `updateMany`-claim; UNIQUE-идемпотентность
- Gated BFF-роуты (session + ownership join; non-owned ≡ 404)
- Все видимые строки через `t()` (RU); i18n-ключ добавляется в задаче, где впервые используется
- Тесты vitest: unit + integration, DB-backed на `setwhite`

### Integration Points

- Новые модели `Ticket`/`TicketMessage`/`Attachment` в `prisma/schema.prisma` (+ миграция)
- Новые BFF-роуты: тикеты (create/list/get/reply), attachment upload/download
- Расширение `lib/worker.ts`/`instrumentation.ts` — notify-ticket fan-out + daily reminder tick
- Вложения: локальный volume (путь в env/конфиге) + sharp
- Бот: ветки создания тикета/приёма фото, кнопка «Продлить» в напоминании

## Specific Ideas

- Единая очередь: обращения из бота и кабинета — один пул (не два отдельных)
- Пользователь никогда не видит raw-ошибок; вложения не публичны
- Напоминание — мягкое и полезное, с реальной кнопкой продления (Phase 3 renew-flow)

## Deferred Ideas

None — discussion stayed within phase scope

---

*Phase: 4-Support & Retention*
*Context gathered: 2026-10-03*
