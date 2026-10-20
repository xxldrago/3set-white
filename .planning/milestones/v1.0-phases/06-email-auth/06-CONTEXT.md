# Phase 6: Email Auth - Context

**Gathered:** 2026-10-05
**Status:** Ready for planning

## Phase Boundary

Phase 6 — второй способ входа. Пользователь регистрируется и входит по email + пароль (без верификации email), может связать Telegram-аккаунт с email-аккаунтом и наоборот, восстанавливает пароль по ссылке из письма. Плюс исправление позиционирования кнопки «Войти через Telegram» на десктопе (AUTH-06). Оплата/тикеты/админка/деплой — другие фазы, не трогаем. Вход из бота остаётся TG-only.

## Implementation Decisions

### Identity model

- **D-79:** `User.telegramId` становится nullable; `email` (unique) + `passwordHash` добавляются на `User` — один аккаунт на человека, а не две таблицы — **Reversibility:** one-way — возврат к non-nullable identity требует миграции аккаунтов и перепривязки ключей/заказов/тикетов
- **D-80:** Trial — один на аккаунт: email-аккаунт без TG получает trial, повторный заблокирован сервером (тот же atomic-claim, что D-22)
- **D-81:** Связка сливает данные: ключи/заказы/тикеты обоих аккаунтов объединяются в один, `trialUsed = OR` — **Reversibility:** one-way — разъединить слитые данные без ручной разборки невозможно
- **D-82:** Сессия несёт `userId` (Int), `telegramId` опционален; старые `tid`-сессии мигрируют/перевыпускаются — **Reversibility:** costly — смена сабжекта затрагивает все auth-места (BFF-gate, бот, кабинет)

### Password security

- **D-83:** Хеширование — Argon2id (OWASP-рекомендация) — **Reversibility:** costly — смена алгоритма требует re-hash миграции при логине
- **D-84:** Защита логина — экспоненциальный backoff + временный лок после N неудачных попыток, без капчи
- **D-85:** Политика паролей — минимум 8 символов, без сложных правил
- **D-86:** Сессии email-входа — та же httpOnly cookie (jose), logout общий

### Email delivery

- **D-87:** Отправка — свой SMTP (relay на сервере/провайдере), не хостед API — **Reversibility:** costly — смена провайдера затрагивает mail-модуль и конфиг
- **D-88:** Токен сброса — одноразовый, живёт 1 час, инвалидируется после использования
- **D-89:** Ответ на запрос сброса для несуществующего email — честный (раскрывает существование аккаунта); enumeration-риск принят владельцем осознанно
- **D-90:** Письма Phase 6 — сброс пароля + welcome; остальные уведомления позже

### Login & linking UX

- **D-91:** Layout `/login` — форма email+пароль сверху, Telegram-виджет ниже, оба в потоке по центру; это же исправляет выпадение кнопки TG в левый нижний угол на десктопе (AUTH-06)
- **D-92:** Привязка/отвязка и смена пароля — раздел «Аккаунт» в кабинете
- **D-93:** Отвязку последнего способа входа разрешить (риск lockout принят владельцем); поддержка восстанавливает доступ вручную
- **D-94:** Email-вход — только кабинет; бот остаётся TG-only

### the agent's Discretion

None — все развилки закрыты явным выбором пользователя.

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project scope

- `.planning/PROJECT.md` — core value, constraints (RU/RUB, секреты только в env)
- `.planning/REQUIREMENTS.md` — Phase 6: AUTH-01..AUTH-06
- `.planning/ROADMAP.md` § Phase 6: Email Auth — цель, success criteria (5 шт.), **UI hint: yes**

### Prior phases

- `.planning/phases/01-foundation/01-CONTEXT.md` — D-09..D-16 (dual auth, httpOnly, 24h+replay, telegram-id identity, i18n)
- `.planning/phases/02-keys-trial/02-CONTEXT.md` — D-21..D-24 (trial atomic claim/rollback, чистые RU-ошибки)
- `.planning/phases/03-payments/03-CONTEXT.md` — money path (заказы принадлежат userId — важно для merge)
- `.planning/research/ARCHITECTURE.md` — auth-паттерны (dual Telegram auth, signed session)

### Code (читать перед планированием)

- `prisma/schema.prisma` — `User` (telegramId unique non-nullable сейчас), `KeyCache`, `Order`, `Ticket`
- `lib/auth.ts` — `verifyWidget`/`verifyInitData`/`signSession`/`verifySession`, `SESSION_COOKIE`, `AUTH_MAX_AGE_SEC`
- `lib/session.ts` — `requireSession()` возвращает telegramId (поменяется на userId), `requireAdminSession`
- `app/api/auth/telegram/route.ts` — контракт auth-роута (образец для email-роутов)
- `app/login/page.tsx` + `components/LoginButton.tsx` — текущая вёрстка входа (BOT_USERNAME build-time, виджет через next/script)
- `lib/i18n/messages/ru.ts` — все новые строки через ключи
- `lib/env.ts` — сюда SMTP-конфиг

## Existing Code Insights

### Reusable Assets

- `lib/auth.ts` — HMAC-верифаеры + jose-сессии; расширить сабжектом userId
- `lib/session.ts` — BFF-gate; переключить на userId с обратной совместимостью tid
- `lib/bot.ts` — `/start` upsert по telegramId (не трогать для email)
- `lib/env.ts` — zod fail-fast; сюда SMTP
- `lib/prisma.ts` — singleton; `updateMany`-claim паттерн для trial/линковки
- `lib/i18n/` — `t()`/`tp()`; все строки через ключи, i18n-тест ловит unused keys
- `app/api/auth/telegram/route.ts` — BFF-образец (session-gate, zod, typed errors)
- `tests/unit/` + `tests/integration/auth-flow.test.ts` — auth-векторы как образец

### Established Patterns

- Server-only `lib/` + zod на границах; секреты только в env
- Атомарные DB-защиты (UNIQUE, `UPDATE ... WHERE`) вместо client-side флагов
- Чистые RU-ошибки пользователю, никаких raw-деталей
- Тесты vitest: unit-векторы + integration flow; DB `setwhite`

### Integration Points

- `prisma/schema.prisma` — миграция: nullable telegramId, email unique, passwordHash, reset-токены
- Новые BFF-роуты: register/login/logout/reset/request/link/unlink (по образцу auth-роута)
- `lib/mail.ts` (новый) — единственное место отправки писем (SMTP)
- `app/login/page.tsx` — форма + виджет в потоке; раздел «Аккаунт» для link/unlink
- Trial-claim и money path начинают работать по userId, не только telegramId

## Specific Ideas

- Без верификации email (решение владельца); связка аккаунтов двусторонняя; сброс — ссылкой из письма
- Кнопка TG на десктопе: виджет-инжектируемый iframe выпадает из потока — лечить layout (оба элемента в нормальном потоке по центру), а не костылями позиционирования
- Отвязка всего — осознанный риск lockout; саппорт восстанавливает вручную

## Deferred Ideas

None — discussion stayed within phase scope

---

*Phase: 6-Email Auth*
*Context gathered: 2026-10-05*
