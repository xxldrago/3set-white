# Phase 5: Admin & Deploy - Context

**Gathered:** 2026-10-03
**Status:** Ready for planning

## Phase Boundary

Phase 5 — операционная зрелость и запуск. Команда входит в админ-панель по ролям (администратор / техподдержка / менеджер), ищет пользователей, видит статистику выручки и баланс ARTEMIDA, делает broadcast; subscription-ссылки отдаются через White Label поддомен; весь стек разворачивается на 64.188.97.106 под `my.3set.online` через Docker Compose + Nginx/HTTPS. Остальные фазы (бот, кабинет, ключи, платежи, тикеты, напоминания) уже реализованы.

## Implementation Decisions

### Roles & access

- **D-64:** Роли хранятся в таблице `admin_users` (привязка к `telegram_id` + поле `role`), не в env — **Reversibility:** one-way — перенос ролей в другое хранилище требует миграции и перепривязки доступов
- **D-65:** Стандартная матрица прав: администратор (всё), техподдержка (тикеты + просмотр ключей), менеджер (финансы + статистика) — как в PROJECT
- **D-66:** Управление ролями — только администратор (вход в админку по Telegram identity); роли других меняет админ из UI
- **D-67:** Bootstrap первого админа — из `ADMIN_TELEGRAM_IDS` (env) при первом входе; далее управление через UI/БД. Phase 4's `requireAdminSession` заменяется на ролевую проверку

### Admin features

- **D-68:** ADM-02 — поиск по `telegram-id` / ключу (`q`, `customerRef`) + карточка пользователя (ключи, платежи, тикеты)
- **D-69:** Статистика ADM-03/04 — из нашей БД (платежи/выручка/пользователи) и из ARTEMIDA API (баланс `GET /balance`, ключи, устройства)
- **D-70:** Алерт низкого баланса ARTEMIDA — порог в env; показ в админке + лог/пуш
- **D-71:** Broadcast — через outbox-worker батчами (учитывает rate limits/блокировки), не синхронно — **Reversibility:** costly — sync-рассылка ломает доставку при сбое Bot API и не масштабируется

### White Label

- **D-72:** Subscription-ссылки — через поддомен `sub.my.3set.online` (A-запись на `144.31.93.193`, без AAAA, DNS Only в Cloudflare, сертификат авто) — **Reversibility:** costly — смена бренд-домена затрагивает выданные ссылки и владельцев ключей
- **D-73:** Настройка бренда — ручной шаг владельца в кабинете ARTEMIDA + документированный чек-лист; код только читает/использует домен из provider-ответа
- **D-74:** Проверка на деплое: доступность sub-ссылки по HTTPS; fallback на дефолтный домен ARTEMIDA при сбое

### Deploy

- **D-75:** Docker Compose (web + db + nginx) на 64.188.97.106; Nginx терминирует HTTPS (Let's Encrypt); секреты только в `.env` на сервере — **Reversibility:** one-way — смена модели хостинга затрагивает домены/вебхуки/секреты
- **D-76:** Деплой — `git pull` → `docker compose build/up` → `prisma migrate deploy`; деплой-скрипт/чек-лист (без CI/CD в v1)
- **D-77:** Секреты и доступ — `.env` на сервере (не в git); root-пароль ротируется и в менеджер секретов; SSH-ключ вместо пароля
- **D-78:** Бэкап БД + скрипт отката + healthcheck; мониторинг баланса ARTEMIDA и воркера

### the agent's Discretion

None — все развилки закрыты явным выбором пользователя.

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project scope

- `.planning/PROJECT.md` — core value, constraints, Key Decisions (сервер, домен, White Label A-запись)
- `.planning/REQUIREMENTS.md` — Phase 5: ADM-01..04, OPS-01..02 (+OPS-03 в Phase 1)
- `.planning/ROADMAP.md` § Phase 5: Admin & Deploy — цель, success criteria (5 шт.), **UI hint: yes**

### Prior phases

- `.planning/phases/04-support-retention/04-CONTEXT.md` + `04-04-SUMMARY.md` — `ADMIN_TELEGRAM_IDS`/`requireAdminSession` (заменяется ролями)
- `.planning/phases/03-payments/03-CONTEXT.md` + `03-03-SUMMARY.md` — outbox/worker/instrumentation (основа для broadcast и алертов)
- `.planning/phases/02-keys-trial/02-CONTEXT.md` — ARTEMIDA client (баланс/ключи/устройства для ADM-04)
- `.planning/phases/01-foundation/01-CONTEXT.md` — Docker Compose (OPS-01 база)

### Research

- `.planning/research/ARCHITECTURE.md` — BFF, outbox, deploy topology (single VPS + Nginx)
- `.planning/research/PITFALLS.md` — White Label DNS (AAAA/proxy/неверная A), wallet depletion (402), секреты
- `docs/artemida-v1-contract.md` — ARTEMIDA contract (balance/sub-links)
- Platega docs — webhook host должен быть `my.3set.online`

## Existing Code Insights

### Reusable Assets

- `lib/session.ts` — `requireAdminSession`/`isAdmin` (Phase 4) → расширить до ролей (`requireRole`)
- `lib/artemida.ts` — `getBalance`, keys/devices (ADM-04)
- `lib/keys-service.ts`, `lib/orders-service.ts`, `lib/tickets-service.ts` — ownership joins/read models для админ-поиска
- `lib/outbox.ts` + `lib/worker.ts` + `instrumentation.ts` — broadcast и алерты через ту же очередь
- `lib/i18n/messages/ru.ts` + `t()`/`tp()` — строки админки
- `app/api/**/route.ts` — BFF-паттерн; `app/api/admin/tickets/**` — пример admin-роутов
- `components/*` — образцы UI; `app/**` route groups
- `prisma/schema.prisma` — `User`/`KeyCache`/`Order`/`Ticket`/`Notification`; сюда `AdminUser` (D-64)
- `docker-compose.yml`, `Dockerfile`, `next.config.ts` (`output: standalone`) — база деплоя

### Established Patterns

- Session-gated BFF + ownership joins; admin-роуты за `requireAdminSession`
- Outbox + worker для асинхронной доставки; атомарные claims
- Все строки через `t()` (RU); env-only секреты
- Тесты vitest: unit + integration (DB `setwhite`)

### Integration Points

- Новая модель `AdminUser` (+ миграция) — роли
- Новые admin BFF-роуты (users/search/stats/broadcast/roles) + админ-панель route group
- Замена `requireAdminSession` на ролевую проверку
- Broadcast/алерты — расширение `lib/worker.ts`
- Деплой: `docker-compose.prod.yml`, Nginx-конфиг, деплой-скрипт, `.env` на сервере
- White Label: проверка/использование `sub.my.3set.online` в sub-link пути

## Specific Ideas

- Админка — только по Telegram identity (без email/пароля)
- Секреты и root-доступ — только через менеджер секретов, ротация
- White Label DNS — по чек-листу, с верификацией (Pitfall 9)

## Deferred Ideas

None — discussion stayed within phase scope

---

*Phase: 5-Admin & Deploy*
*Context gathered: 2026-10-03*
