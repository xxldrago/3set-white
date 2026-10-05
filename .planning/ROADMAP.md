# Roadmap: 3set-white — сервис продажи VPN

## Overview

От пустого репозитория до работающего магазина VPN за 5 фаз: сначала фундамент (репо, БД, Telegram-идентичность, скелет бота), затем чтение ARTEMIDA (ключи, trial, тарифы), затем деньги (Platega → мгновенная выдача ключа), затем поддержка и удержание (тикеты, напоминания), в конце админка и боевой деплой на 64.188.97.106.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Foundation** - Репозиторий, БД, единый Telegram-identity, скелет бота и PWA-оболочка
- [ ] **Phase 2: Keys & Trial** - Trial в один тап, тарифы с живой ценой, «Мои подписки», устройства, конфиги
- [ ] **Phase 3: Payments** - Оплата Platega с мгновенной выдачей, продление, апгрейд, история платежей
- [ ] **Phase 4: Support & Retention** - Единая очередь тикетов, напоминания об истечении, вложения
- [ ] **Phase 5: Admin & Deploy** - Админ-панель с ролями, White Label, боевой деплой на my.3set.online
- [ ] **Phase 6: Email Auth** - Регистрация/вход по email + привязка Telegram, сброс пароля, фикс layout кнопки Telegram на десктопе

## Phase Details

### Phase 1: Foundation

**Goal**: Приложение существует: единый аккаунт по telegram-id работает в боте и PWA, бот отвечает на /start, PWA устанавливается
**Mode:** mvp
**Depends on**: Nothing (first phase)
**Requirements**: OPS-03, CAB-02, CAB-05
**Success Criteria** (what must be TRUE):

  1. Пользователь открывает PWA, входит через Telegram Login Widget и видит свой аккаунт; повторный вход не создаёт дубликат
  2. Пользователь пишет боту /start и получает приветствие с кнопками; бот знает его chat_id
  3. Пользователь может установить PWA на телефон (install prompt) и открыть её с иконки

**Plans**: 4/4 plans executed

Plans:

- [x] 01-01-PLAN.md — Scaffold, green test runner, GitHub repo pushed (OPS-03)
- [x] 01-02-PLAN.md — Postgres + Prisma schema, Compose, blocking migrate + seed (OPS-03)
- [x] 01-03-PLAN.md — Unified Telegram identity, /start skeleton, webhook intake (CAB-02)
- [x] 01-04-PLAN.md — Installable RU PWA shell, login + guides, i18n + icons (CAB-05)

### Phase 2: Keys & Trial

**Goal**: Пользователь получает trial, выбирает тариф и видит свои подписки с рабочими конфигами
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: TRIAL-01, TRIAL-02, TRIAL-03, CAB-01, CAB-03, CAB-04
**Success Criteria** (what must be TRUE):

  1. Пользователь в один тап получает trial-ключ (1 день / 2 устройства) из бота и из кабинета; второй trial заблокирован
  2. Пользователь выбирает срок 7/30/90 дней и число устройств 1–10 и видит живую цену
  3. Пользователь видит список «Мои подписки» со статусом и сроком, открывает детали ключа с subscription-ссылкой, QR и расходом трафика
  4. Пользователь управляет устройствами ключа (список, удаление одного, сброс всех) и видит инструкции по подключению (v2rayNG / Streisand / Hiddify)

**Plans**: 7/7 plans executed + 1 gap-closure plan

Plans:

- [x] 02-01-PLAN.md — ARTEMIDA live-probe gate: lock V1 contract (owner supplies API key)
- [x] 02-02-PLAN.md — ARTEMIDA client + live tariff price tracer (TRIAL-02)
- [x] 02-03-PLAN.md — Trial anti-abuse + schema migration (TRIAL-01)
- [x] 02-04-PLAN.md — «Мои подписки» cache-first list (CAB-01)
- [x] 02-05-PLAN.md — Key detail: subscription link + QR + traffic + guides (CAB-04, TRIAL-03)
- [x] 02-06-PLAN.md — Device management + inline confirmations (CAB-03)
- [x] 02-07-PLAN.md — Gap closure: ownership-filtered revalidateKeys + null-safe sub-link write (CAB-01/03/04)

**UI hint**: yes

### Phase 3: Payments

**Goal**: Пользователь платит картой/СБП и мгновенно получает рабочую подписку; продление и апгрейд работают тем же путём
**Mode:** mvp
**Depends on**: Phase 2
**Requirements**: PAY-01, PAY-02, PAY-03, PAY-04
**Success Criteria** (what must be TRUE):

  1. Пользователь оплачивает выбранный тариф через Platega и сразу после CONFIRMED получает subscription-ссылку + QR в бот и кабинет
  2. Пользователь продлевает не-trial ключ с доплатой разницы; на trial-ключах кнопок продления/апгрейда нет, есть CTA «купить полный»
  3. Пользователь докупает устройства к ключу через тот же платёжный pipeline
  4. Пользователь видит историю своих платежей (сумма, статус, дата)

**Plans**: 7/7 plans executed

Plans:
**Wave 1**

- [x] 03-01-PLAN.md — ARTEMIDA probe gate: lock paid-key create + upgrade charge; createKey + idempotencyKey (PAY-01, PAY-03)
- [x] 03-02-PLAN.md — Money-path tracer: Order/Outbox migration, Platega client, order create + verified callback (PAY-01)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 03-03-PLAN.md — Outbox worker + instrumentation + hourly reconcile (PAY-01)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 03-04-PLAN.md — Renew/upgrade pipeline + upgrade quote + trial block (PAY-02, PAY-03)

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 03-05-PLAN.md — Order status + payment history read service/routes (PAY-04)

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 03-06-PLAN.md — Cabinet payment surfaces: pay CTA, status panel, history, renew/upgrade UI (PAY-01..04)

**Wave 6** *(blocked on Wave 5 completion)*

- [x] 03-07-PLAN.md — Bot payment entry + QR delivery + history menu (PAY-01, PAY-04)

**UI hint**: yes

### Phase 4: Support & Retention

**Goal**: Пользователь получает помощь из любого канала и не забывает продлить подписку
**Mode:** mvp
**Depends on**: Phase 3
**Requirements**: PAY-05, SUP-01, SUP-02, SUP-03
**Success Criteria** (what must be TRUE):

  1. Пользователь создаёт обращение из бота и из кабинета; все обращения видны в единой очереди со статусами open/answered/closed
  2. Пользователь прикрепляет фото/скриншот к тикету из бота и из кабинета
  3. Ответ поддержки приходит и в бот, и в кабинет
  4. Пользователь получает push-напоминание в Telegram за 3 дня до истечения с кнопкой продления

**Plans**: 8/8 plans executed
**UI hint**: yes

Plans:

**Wave 1**

- [x] 04-01-PLAN.md — Support data spine: Ticket/TicketMessage/Attachment/Notification schema + blocking migration + shared tickets-service (SUP-01, SUP-03)
- [x] 04-02-PLAN.md — Attachment pipeline: sharp magic-byte validate/downscale + local volume + env/compose (SUP-02)

**Wave 2** *(blocked on Wave 1)*

- [x] 04-03-PLAN.md — Support reply fan-out: Notification queue + worker drain + ticket-notify builders (SUP-03)

**Wave 3** *(blocked on Wave 2)*

- [x] 04-04-PLAN.md — Ticket BFF + admin routes: create/reply/read/gated serve/admin reply+close (SUP-01, SUP-02, SUP-03)
- [x] 04-07-PLAN.md — Bot support intake: menu + text/photo create via shared service (SUP-01, SUP-02, SUP-03)

**Wave 4** *(blocked on Wave 3)*

- [x] 04-05-PLAN.md — Cabinet support list + create + home unread entry (SUP-01, SUP-02)

**Wave 5** *(blocked on Wave 4)*

- [x] 04-06-PLAN.md — Cabinet ticket thread + composer + mark-read + gated attachments (SUP-01, SUP-02, SUP-03)

**Wave 6** *(blocked on Wave 5)*

- [x] 04-08-PLAN.md — Expiry reminders: daily tick + /api/cron/remind fallback + key-id callback migration (PAY-05)

### Phase 5: Admin & Deploy

**Goal**: Команда управляет сервисом через админ-панель, весь стек работает на my.3set.online
**Mode:** mvp
**Depends on**: Phase 4
**Requirements**: ADM-01, ADM-02, ADM-03, ADM-04, OPS-01, OPS-02
**Success Criteria** (what must be TRUE):

  1. Администратор, техподдержка и менеджер заходят в админ-панель и видят только свои разделы согласно ролям
  2. Админ находит пользователя по telegram-id / ключу, видит его ключи и платежи; видит статистику выручки и баланс ARTEMIDA с алертом о низком балансе; делает broadcast-рассылку
  3. Пользователь открывает кабинет по https://my.3set.online, бот и Platega-webhook работают через этот домен
  4. Subscription-ссылки отдаются через White Label домен my.3set.online
  5. Все изменения кода закоммичены и запушены в GitHub 3set-white, деплой воспроизводится на сервере

**Plans**: 7/7 plans executed
**UI hint**: yes

Plans:

**Wave 1** *(RBAC spine — tracer; owner-gated on one-way D-64)*

- [x] 05-01-PLAN.md — RBAC spine: `AdminUser` migration, `admin-auth` guard + create-only bootstrap, gated `/admin` shell (ADM-01)

**Wave 2** *(blocked on Wave 1)*

- [x] 05-02-PLAN.md — User search + read-only profile (keys/payments/tickets, per-section degrade) (ADM-02)

**Wave 3** *(blocked on Wave 1)*

- [x] 05-04-PLAN.md — Role-aware admin gate migration + ticket queue reuse + roles management (ADM-01)
- [x] 05-05-PLAN.md — White Label sub-link verify/fallback + shallow health + prod env wiring (OPS-02)

**Wave 4** *(blocked on Wave 1)*

- [x] 05-03-PLAN.md — Broadcast queue: enqueue → deduped Notifications → batched worker delivery (terminal-403/backoff) (ADM-03)

**Wave 5** *(blocked on Waves 1, 4)*

- [x] 05-07-PLAN.md — Stats dashboard + cached ARTEMIDA read + balance alert (ADM-03, ADM-04)

**Wave 6** *(blocked on Waves 1, 4, 5; owner-gated on one-way D-75)*

- [x] 05-06-PLAN.md — Deploy: Dockerfile blockers, Compose/Nginx/Certbot, backup/rollback scripts, runbook (OPS-01)

### Phase 6: Email Auth

**Goal:** Пользователь регистрируется и входит по email, может связать Telegram-аккаунт, восстанавливает пароль по почте
**Mode:** mvp
**Depends on**: Phase 5
**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, AUTH-06
**Success Criteria** (what must be TRUE):

  1. Пользователь регистрируется по email + пароль без верификации и сразу входит; сессия — та же httpOnly cookie
  2. Пользователь входит по email + пароль; привязывает Telegram к email-аккаунту и наоборот
  3. Пользователь сбрасывает пароль через ссылку на email
  4. Trial для email-аккаунтов защищён от фарма
  5. Кнопка «Войти через Telegram» корректно позиционирована на десктопе

**Plans**: 13/13 plans executed + 10 gap-closure plans (UAT G-06-4a/G-06-4b/G-06-9; verification CR-01/CR-02 + AUTH-03/AUTH-06 widget regression + WR-01..WR-06; re-verification CR-01 reset-lockout DoS)

Plans:

**Wave 1** *(identity spine — tracer; owner-gated on one-way D-79)*

- [x] 06-01-PLAN.md — Schema + userId sessions + Argon2id + backoff + register/login/logout tracer (AUTH-01, AUTH-02)

**Wave 2** *(blocked on Wave 1)*

- [x] 06-02-PLAN.md — Link/merge + unlink + change-password, owner-gated on one-way D-81 (AUTH-03, AUTH-05)
- [x] 06-03-PLAN.md — SMTP mail + reset request/confirm, 1h one-time tokens (AUTH-04)

**Wave 3** *(blocked on Waves 1, 2)*

- [x] 06-04-PLAN.md — Login rework + reset pages + Account section, AUTH-06 layout fix (AUTH-01, AUTH-02, AUTH-06)

**Gap closure** *(UAT 2026-10-05: G-06-4a, G-06-4b, G-06-9)*

- [x] 06-05-PLAN.md — In-flow widget injector, off next/script (G-06-4a, AUTH-06)
- [x] 06-06-PLAN.md — Bot-redirect login spine: token + routes + /start bind (G-06-4b, AUTH-02)
- [x] 06-07-PLAN.md — Bot button on /login + email-only cabinet + userId trial (G-06-4b, G-06-9)

**Gap closure 2** *(verification 2026-10-05: CR-01, CR-02, AUTH-03/AUTH-06 widget regression, WR-01..WR-06)*

**Wave 1** *(independent fixes)*

- [x] 06-08-PLAN.md — Telegram widget callback fix: identifier-only data-onauth + eval regression test (AUTH-03, AUTH-06)
- [x] 06-09-PLAN.md — Bot-redirect login-CSRF fix: bot-delivered confirmation code required at consume (AUTH-02, AUTH-03)
- [x] 06-10-PLAN.md — Trusted client IP + per-email-only login lock + nginx Forwarded-For hardening (AUTH-02, AUTH-04)
- [x] 06-12-PLAN.md — Replay error honesty + race-hardened linkAccounts merge (AUTH-02, AUTH-03)

**Wave 2** *(blocked on Wave 1; shares schema/services)*

- [x] 06-11-PLAN.md — Session revocation on password change/reset/unlink + reset-token supersession (AUTH-01..AUTH-04)

**Wave 3** *(blocked on Waves 1–2; shares schema/rate-limit)*

- [x] 06-13-PLAN.md — Registration throttle + canonical-mailbox alias-farm block (AUTH-01, AUTH-05)

**Gap closure 3** *(re-verification 2026-10-06: new CR-01 reset→login account-lockout DoS)*

**Wave 1** *(standalone; fixes 06-10's shared account-wide counter)*

- [ ] 06-14-PLAN.md — Isolate reset-mail throttle namespace + atomic attempt counter (AUTH-02, AUTH-04)

**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 4/4 | Needs Review | 2026-09-30 |
| 2. Keys & Trial | 7/7 | Needs Review | 2026-10-02 |
| 3. Payments | 7/7 | Needs Review | 2026-10-03 |
| 4. Support & Retention | 8/8 | Needs Review | 2026-10-03 |
| 5. Admin & Deploy | 7/7 | Needs Review | 2026-10-03 |
| 6. Email Auth | 13/14 | In Progress | |
