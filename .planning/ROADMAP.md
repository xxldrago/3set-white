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
**Plans**: 4 plans

Plans:
- [ ] 01-01-PLAN.md — Scaffold, green test runner, GitHub repo pushed (OPS-03)
- [ ] 01-02-PLAN.md — Postgres + Prisma schema, Compose, blocking migrate + seed (OPS-03)
- [ ] 01-03-PLAN.md — Unified Telegram identity, /start skeleton, webhook intake (CAB-02)
- [ ] 01-04-PLAN.md — Installable RU PWA shell, login + guides, i18n + icons (CAB-05)

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
**Plans**: TBD
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
**Plans**: TBD
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
**Plans**: TBD
**UI hint**: yes

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
**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 0/TBD | Not started | - |
| 2. Keys & Trial | 0/TBD | Not started | - |
| 3. Payments | 0/TBD | Not started | - |
| 4. Support & Retention | 0/TBD | Not started | - |
| 5. Admin & Deploy | 0/TBD | Not started | - |
