# Phase 2: Keys & Trial - Context

**Gathered:** 2026-09-30
**Status:** Ready for planning

## Phase Boundary

Phase 2 — первая реальная интеграция с ARTEMIDA API. Пользователь получает trial-ключ в один тап, выбирает тариф (7/30/90 дней × 1–10 устройств) с живой ценой, и видит «Мои подписки»: ключи со статусом и сроком, subscription-ссылки (VLESS/Trojan) с QR, расход трафика и управление устройствами. Всё в боте и в PWA. Оплата (Platega) — Phase 3; тикеты/напоминания — Phase 4; админка/деплой — Phase 5. Инструкции по подключению уже сделаны в Phase 1 (TRIAL-03 фактически закрыт скелетом).

## Implementation Decisions

### ARTEMIDA client

- **D-17:** Полный клиент `lib/artemida.ts` сразу (весь V1 surface: pricing/trial/keys CRUD/renew/upgrade/traffic/devices/subscription-links), даже если Phase 2 использует только read+trial — **Reversibility:** costly — ретрофитить клиент в вызывающие места позже больнее, чем определить единый контракт сейчас
- **D-18:** Retry — `p-retry`: повтор на 429 с уважением `Retry-After`, и на 502/503 с backoff; `Idempotency-Key` (UUID) на каждый POST/DELETE — **Reversibility:** costly — смена retry/idempotency-политики затрагивает все write-вызовы (trial/renew/upgrade/create)
- **D-19:** Ошибки — типизированный `ArtemidaError` с полем `code` и HTTP-статусом, маппинг 401/402/409/429/502/503; вызывающий код ветвится по `code`, не парсит текст — **Reversibility:** costly — смена типа ошибки затрагивает все catch-сайты и UI-сообщения
- **D-20:** `ARTEMIDA_API_KEY` + `ARTEMIDA_BASE_URL` (default `https://artemida.cc/v1`) добавляются в `lib/env.ts` и валидируются fail-fast как остальные секреты

### Trial anti-abuse

- **D-21:** Факт trial хранится на `users`: `trialUsed: Boolean` + `trialKeyId: String?` — одна запись на telegram-id, отдельная таблица не нужна — **Reversibility:** costly — переезд на отдельную trials-таблицу потребует миграции и перепривязки
- **D-22:** Атомарная защита от гонки: `UPDATE users SET trial_used=true WHERE telegram_id=? AND trial_used=false` до `POST /trial`; строка не изменена → trial уже использован, отдаём чистый ответ (не проксируем ошибку ARTEMIDA)
- **D-23:** Если `POST /trial` упал (502/429), флаг откатывается в `false` (rollback), чтобы пользователь мог повторить; `Idempotency-Key` защищает от дубля на стороне ARTEMIDA
- **D-24:** Повторный trial — чистый RU-ответ с CTA «купить подписку» (через i18n-ключ), без raw-ошибок API

### Tariff UX

- **D-25:** Выбор тарифа есть и в боте (inline keyboard), и в PWA
- **D-26:** PWA получает цену через серверный BFF `GET /api/pricing` (проксирует ARTEMIDA) — клиент никогда не носит API-ключ
- **D-27:** Цена обновляется живьём при смене числа устройств (1–10), без submit
- **D-28:** Цены показываем ровно как считает ARTEMIDA `GET /pricing` (без своей витрины/наценки)

### Keys freshness & display

- **D-29:** Cache-first: `keys_cache` рендерится мгновенно, фоновое обновление из ARTEMIDA `GET /keys` при открытии — **Reversibility:** costly — смена модели чтения затрагивает cabinet + bot read path
- **D-30:** Конфиги подключения — sub-ссылка + QR-код (отдельный экран в PWA / сообщение в боте)
- **D-31:** Расход трафика показываем (display-only, продажа лимитов — вне scope v1)
- **D-32:** Необратимые действия устройств (удаление одного, сброс всех) требуют подтверждения

### the agent's Discretion

None — все развилки закрыты явным выбором пользователя.

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project scope

- `.planning/PROJECT.md` — core value, constraints (RV/RUB, безлимит, trial 1д/2устр), Key Decisions
- `.planning/REQUIREMENTS.md` — Phase 2 требования: TRIAL-01/02/03, CAB-01, CAB-03, CAB-04
- `.planning/ROADMAP.md` § Phase 2: Keys & Trial — цель, success criteria (4 шт.), **UI hint: yes**

### Prior phase

- `.planning/phases/01-foundation/01-CONTEXT.md` — locked D-01..D-16 (bot-in-Next, Prisma, identity, i18n), на которые Phase 2 опирается
- `.planning/phases/01-foundation/01-03-SUMMARY.md` — dual-HMAC auth + session + `/start` upsert (identity-контракт для trial/keys)
- `.planning/phases/01-foundation/01-04-SUMMARY.md` — PWA shell + i18n dictionary + guides

### Research

- `.planning/research/ARCHITECTURE.md` § «ARTEMIDA wrapper» — single server-only client, Idempotency-Key, Retry-After, error mapping; cache-first reads from `keys_cache`
- `.planning/research/SUMMARY.md` § Architecture / Critical Pitfalls
- `.planning/research/PITFALLS.md` § Pitfall 5 (trial farming — server-side one-trial-per-user), § Pitfall 6 (trial renew/upgrade crash — блокировать в UI и backend), § Pitfall (trial/paid keys visually identical — badge)
- `.planning/research/FEATURES.md` — tariff picker, my subscriptions, device management, traffic display
- ARTEMIDA Paid API V1 (внешний док, `https://artemida.cc/v1`): `/pricing`, `POST /trial`, `GET /keys`, `GET /keys/{id}`, `GET /keys/{id}/subscription-links`, `GET /keys/{id}/devices`, `DELETE /keys/{id}/devices/{token}`, `POST /keys/{id}/devices/clear`, `/keys/{id}/traffic`, trial нельзя renew/upgrade

## Existing Code Insights

### Reusable Assets

- `lib/env.ts` — zod env-схема fail-fast; сюда добавляются `ARTEMIDA_API_KEY`/`ARTEMIDA_BASE_URL` (D-20)
- `lib/prisma.ts` — Prisma singleton (`generated/prisma` client, `PrismaPg` adapter)
- `lib/auth.ts` — `verifyWidget`/`verifyInitData`/`signSession`/`verifySession`, `SESSION_COOKIE` — источник telegram-id для BFF
- `lib/i18n/index.ts` + `lib/i18n/messages/ru.ts` — `t()` + `I18nKey`; все новые строки (trial CTA, тарифы, статусы ключей) идут сюда
- `lib/bot.ts` — Telegraf singleton + `/start` upsert; сюда добавится trial/keys ветки
- `lib/logger.ts` — pino; PII-дисциплина (только id/исходы)
- `lib/replay.ts` — replay-cache
- `prisma/schema.prisma` — `User` (telegramId unique), `KeyCache` (userId+keyId unique, status, expiresAt), `ReplayCache`; сюда: `trialUsed`/`trialKeyId` (D-21)
- `app/api/auth/telegram/route.ts` — контракт auth-роута (BFF-паттерн для новых `/api/*`)
- `app/page.tsx` — session-aware shell; здесь рендерится «Мои ключи»
- `components/LoginButton.tsx`, `components/InstallPrompt.tsx` — клиентские компоненты-образцы
- `app/guides/page.tsx` — статические гайды (TRIAL-03)

### Established Patterns

- Server-only `lib/` клиенты + zod на каждой внешней границе; BFF Route Handlers не отдают секреты клиенту
- Все видимые строки через `t()` (RU), EN позже без рефакторинга
- Атомарные DB-защиты (UNIQUE, `UPDATE ... WHERE`) вместо client-side флагов
- Тесты vitest: unit-векторы + integration flow

### Integration Points

- Новая точка: `lib/artemida.ts` (D-17) — единственное место сетевых вызовов к ARTEMIDA
- Новые BFF-роуты под pricing/trial/keys/devices (по образцу auth-роута)
- `keys_cache` наполняется/обновляется из read-путей (D-29)
- `prisma/schema.prisma` — миграция под `trialUsed`/`trialKeyId`

## Specific Ideas

- Trial-ключи визуально отличать (badge), CTA только «Купить подписку» — не показывать renew/upgrade
- Пользователь не видит raw-ошибок API — только человеческие RU-сообщения

## Deferred Ideas

None — discussion stayed within phase scope

---

*Phase: 2-Keys & Trial*
*Context gathered: 2026-09-30*
