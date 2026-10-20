# Phase 3: Payments - Context

**Gathered:** 2026-10-02
**Status:** Ready for planning

## Phase Boundary

Phase 3 — money path. Пользователь оплачивает выбранный тариф через Platega (карты МИР/СБП) и мгновенно получает рабочую подписку (sub-ссылка + QR в бот и кабинет); продление не-trial ключа и докупка устройств идут тем же pipeline; пользователь видит историю платежей. Всё в боте и в PWA. Напоминания об истечении (PAY-05) и тикеты — Phase 4; админка/деплой/White Label — Phase 5. Ключи/прайсинг/трафик уже реализованы в Phase 2.

## Implementation Decisions

### Platega contract

- **D-33:** Redirect flow — создаём транзакцию на сервере, пользователь платит на хостед-странице Platega, возвращается в кабинет/бота — **Reversibility:** costly — смена payment UX затрагивает и BFF, и бота, и кабинет
- **D-34:** Перед выдачей — верификация callback (заголовки отправителя) И серверный re-query статуса транзакции у Platega (`GET transaction/{id}`); callback сам по себе не является источником истины — **Reversibility:** costly — снятие re-query открывает forgiveness/forge-риск на всем money path
- **D-35:** Сверяем сумму и валюту платежа против сохранённого заказа; расхождение → не выдаём, алерт — **Reversibility:** costly — ослабление проверки суммы = финансовые потери
- **D-36:** Два режима: тестовый merchant/ключ в `.env.local` (dev), боевой — в проде; переключение по env — **Reversibility:** costly — тестовый и боевой ключи в одном коде требуют чёткого разделения, иначе риск спутать
- **D-37:** Типизированный `PlategaError` + zod на всех границах, `lib/platega.ts` — единственное место сетевых вызовов; секреты (merchant id / secret) только в `lib/env.ts`

### Money pipeline

- **D-38:** Ingest-fast / fulfill-async: callback хендлер проверяет + отвечает 200 немедленно, выдача ключа идёт из outbox-worker'а (устойчиво к ARTEMIDA 502/429) — **Reversibility:** one-way — перенос выдачи внутрь callback после запуска ломает идемпотентность/retry-контракт Platega
- **D-39:** Заказ — state machine `pending → paid → provisioning → provisioned / failed`; `Platega transaction id` UNIQUE (tx-id dedupe) — **Reversibility:** one-way — смена модели состояний заказов требует миграции и перепривязки истории платежей
- **D-40:** Reconcile-job (ежечасный) сверяет незавершённые заказы с Platega (`GET transaction`) и добивает потерянные callback'и
- **D-41:** ARTEMIDA-сбой при выдаче (502/429/402) → retry с backoff + состояние `PROVISION_ERROR`; при исчерпании попыток — алерт/тикет, заказ не теряется

### Renew & upgrade

- **D-42:** Один pipeline для new/renew/upgrade — заказ несёт `{kind, keyId?, params}`; выдача ветвится по `kind`, платёжная логика общая — **Reversibility:** costly — второй платёжный flow дублирует деньги/идемпотентность
- **D-43:** Цена renew/upgrade считается через `GET /pricing` (artemida quote), как в Phase 2
- **D-44:** На trial-ключах renew/upgrade скрыты и в боте, и в кабинете (API их запрещает); показывается CTA «Купить подписку»
- **D-45:** Семантика standard: renew добавляет дни к текущему сроку; upgrade добавляет устройства с prorated-доплатой (как считает ARTEMIDA)

### Payment history

- **D-46:** История строится из нашей БД (orders/payments), без живого запроса к Platega — **Reversibility:** costly — переход на live-историю меняет контракт страницы и оффлайн-поведение
- **D-47:** История видна и в боте, и в кабинете
- **D-48:** Строка платежа: сумма, статус, дата, что куплено (new/renew/upgrade + ключ)

### the agent's Discretion

None — все развилки закрыты явным выбором пользователя.

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project scope

- `.planning/PROJECT.md` — core value, constraints, Key Decisions (оплата сразу за ключ)
- `.planning/REQUIREMENTS.md` — Phase 3: PAY-01, PAY-02, PAY-03, PAY-04
- `.planning/ROADMAP.md` § Phase 3: Payments — цель, success criteria (4 шт.), **UI hint: yes**

### Prior phases

- `.planning/phases/01-foundation/01-CONTEXT.md` — D-01..D-16 (bot-in-Next, Prisma, identity, i18n)
- `.planning/phases/02-keys-trial/02-CONTEXT.md` — D-17..D-32 (ARTEMIDA client, trial, tariff UX, cache-first, sub-link/QR)
- `.planning/phases/02-keys-trial/02-06-SUMMARY.md` — что уже построено в кабинете/роутах
- `.planning/phases/02-keys-trial/02-VERIFICATION.md` — текущее состояние и owner-pending пункты

### Research

- `.planning/research/SUMMARY.md` — ingest-fast/fulfill-async, outbox, order state machine, hourly reconcile, header verify + re-query
- `.planning/research/ARCHITECTURE.md` — паттерны: signed-proxy BFF, outbox fulfillment, integration contracts (Platega callback)
- `.planning/research/PITFALLS.md` — Pitfall 1 (paid-but-no-key), Pitfall 2 (double provisioning на retry), Pitfall 3 (forged callbacks), Pitfall 4 (wallet dry), Pitfall 6 (trial renew/upgrade)
- Platega.io docs (`https://docs.platega.io/`) — CreateTransaction, callback (`CONFIRMED`/`CANCELED`/`CHARGEBACKED`), `X-MerchantId`/`X-Secret`, transaction status re-query
- `docs/artemida-v1-contract.md` — LOCKED ARTEMIDA-контракт (renew/upgrade/create shapes)

## Existing Code Insights

### Reusable Assets

- `lib/artemida.ts` — полный V1 клиент (create/renew/upgrade/keys) с typed errors, Idempotency-Key, p-retry (D-17/18/19)
- `lib/keys-service.ts` — ownership-фильтр, cache-first, sub-link/QR, device management (Phase 2)
- `lib/session.ts`, `lib/auth.ts` — session/id для BFF-gate
- `lib/env.ts` — zod env fail-fast; сюда добавятся Platega-секреты (D-37)
- `lib/i18n/messages/ru.ts` + `t()`/`tp()` — все новые строки (CTA оплаты, статусы заказов, история)
- `lib/bot.ts` — Telegraf singleton; сюда ветки purchase/renew/upgrade + команда истории
- `app/api/*/route.ts` — BFF-паттерн (session-gate, zod, типизированные ошибки); образец для payment/orders/callback
- `prisma/schema.prisma` — `User`/`KeyCache`; сюда `Order`/`Payment`/`Outbox` модели (D-39)
- `components/*` — LoginButton/TariffPicker/TrialButton/ConfirmPanel как образцы клиентских компонентов
- `docs/artemida-v1-contract.md` — источник истины по ARTEMIDA shout-формам

### Established Patterns

- Server-only `lib/` клиенты + zod на каждой границе; BFF не отдаёт секреты клиенту
- Атомарные DB-защиты (UNIQUE, `UPDATE ... WHERE`) вместо client-side флагов
- Идемпотентность: `Idempotency-Key` на ARTEMIDA POST/DELETE (D-18), tx-id dedupe (D-39)
- Все видимые строки через `t()` (RU)

### Integration Points

- Новая точка: `lib/platega.ts` (D-37) — единственное место вызовов Platega
- Новый публичный `/api/platega/callback` (без session, с верификацией заголовков) + session-gated order/history-роуты
- `prisma/schema.prisma` — миграция под Order/Payment/Outbox (D-39)
- Доставка ключа после выдачи — в бот (push) и в кабинет (purchase status)

## Specific Ideas

- Мгновенная выдача — core value: money taken → key delivered, без «оплачено, но ключа нет»
- Platega callback содержательных данных не гарантирует — всегда re-query + сверка суммы (D-34/35)
- Пользователь никогда не видит raw-ошибок платёжки/API — только человеческие RU-статусы

## Deferred Ideas

None — discussion stayed within phase scope

---

*Phase: 3-Payments*
*Context gathered: 2026-10-02*
