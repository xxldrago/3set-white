# Phase 1: Foundation - Context

**Gathered:** 2026-09-30
**Status:** Ready for planning

## Phase Boundary

Phase 1 создает фундамент, на котором стоят все остальные фазы: пустой репозиторий превращается в запускаемое приложение — единый аккаунт по `telegram-id` работает в боте и PWA, бот отвечает на `/start`, PWA устанавливается на телефон. Никаких покупок, ключей ARTEMIDA и тикетов — только скелет, идентичность и инфраструктура.

## Implementation Decisions

### Bot runtime

- **D-01:** Прод — bot-in-Next: один Next.js-процесс, Telegraf через webhook-route `handleUpdate`, один контейнер + Postgres + Nginx — **Reversibility:** costly — сплит на отдельный bot-процесс меняет деплой (второй deployable, отдельные рестарты, общий доступ к БД)
- **D-02:** Dev — polling (`launch()` локально), прод — webhook; режим по env
- **D-03:** Два Bot API токена: прод-бот и отдельный тестовый бот для dev (исключить спам реальным юзерам)
- **D-04:** Структура — single Next app: `app/` + `lib/bot.ts` + webhook-route, без `apps/*` monorepo на старте

### DB setup

- **D-05:** Postgres 17 + Prisma 7 (`^7.10`, не v8-RC) в Docker с day one, локально тоже через Compose — **Reversibility:** one-way — смена СУБД/ORM позже требует миграции данных и переписывания всех запросов
- **D-06:** `docker-compose.yml` (web + db) создается в Phase 1, Nginx/HTTPS — по минимуму для локального запуска, полный прод-стенд в Phase 5
- **D-07:** Таблицы Phase 1: `users` (ключ `telegram_id`, `chat_id`, создан) + `keys_cache` (зеркало ARTEMIDA: ключ, статус, срок) — заказы/тикеты/outbox в своих фазах
- **D-08:** `prisma migrate` + минимальный seed (тестовый юзер, проверка коннекта)

### Auth (Telegram identity)

- **D-09:** Оба входа в одну сессию: Telegram Login Widget (web) + WebApp `initData` (вход из бота), один модуль `lib/auth.ts` — **Reversibility:** costly — разделение на две identity-системы ломает связку бот↔кабинет
- **D-10:** Сессии — подписанная httpOnly cookie (jose), никаких JWT в localStorage — **Reversibility:** costly — смена хранилища сессии затрагивает все auth-места (бота, BFF, кабинет)
- **D-11:** Окно `auth_date` 24 часа + одноразовый replay-cache (защита от переигрывания Login Widget)
- **D-12:** Ключ идентичности — `telegram-id`, один `users` на id, дубликаты запрещены на уровне БД (unique) — **Reversibility:** one-way — смена ключа идентичности требует миграции аккаунтов и перепривязки ключей/тикетов

### PWA shell

- **D-13:** Объем Phase 1 — manifest + базовый shell + install prompt; Serwist/offline отложен (проверяется только на прод-сборке, не в dev под Turbopack)
- **D-14:** PWA показывает: экран входа через Telegram + статические гайды подключения (v2rayNG/Streisand/Hiddify) как скелет кабинета
- **D-15:** `/start` бота — приветствие + меню-кнопки (скелет, без покупки/trial — они в Phase 2–3)
- **D-16:** Строки интерфейса — русские сразу, но через i18n-ключи (EN позже без рефакторинга)

### the agent's Discretion

None — все развилки закрыты явным выбором пользователя.

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project scope

- `.planning/PROJECT.md` — что строим, core value, constraints (Node+Next+Telegraf, single server, RU/RUB, секреты только в env)
- `.planning/REQUIREMENTS.md` — Phase 1 требования: OPS-03 (репо+пуш), CAB-02 (auth sync), CAB-05 (PWA installable)
- `.planning/ROADMAP.md` § Phase 1: Foundation — цель, зависимости (нет), success criteria (3 шт.)

### Research (phase-специфично)

- `.planning/research/SUMMARY.md` — синтез: bot-in-Next принят (расхождение STACK vs ARCHITECTURE закрыто D-01), порядок сборки, риски
- `.planning/research/STACK.md` — пины версий: Next 16.3.x, React 19.3, Telegraf 4.16.3, Prisma ^7.10, Tailwind 4.3, Serwist 9.5, Node 24, zod/pino/p-retry/jose
- `.planning/research/ARCHITECTURE.md` — паттерны: signed-proxy BFF, dual Telegram auth, outbox (аутбокс — Phase 3, здесь только учесть)
- `.planning/research/PITFALLS.md` — Phase-0/1 ловушки: секреты в git запрещены, разделение прод/тест токенов, trial-renew блокировать позже

## Existing Code Insights

### Reusable Assets

- Пустой репозиторий — переиспользуемых ассетов нет (только `.planning/`, `AGENTS.md`, `.git`)

### Established Patterns

- Паттерны не установлены — Phase 1 их задает (структура single Next app, `lib/` для server-only клиентов, Prisma-схема)

### Integration Points

- Внешние интеграции Phase 1 не трогает (ARTEMIDA/Platega — Phase 2–3); задел: `lib/` под будущих `artemida.ts`/`platega.ts`, env-каркас (`ARTEMIDA_API_KEY`, `BOT_TOKEN`, `BOT_TEST_TOKEN`, `DATABASE_URL` — только через env, в git не коммитить)

## Specific Ideas

- Репозиторий GitHub `3set-white` (remote создать в Phase 1, все изменения коммитить+пушить)
- Домен `my.3set.online` и сервер `64.188.97.106` — полный прод-стенд в Phase 5, в Phase 1 только воспроизводимый локальный Compose
- PWA install prompt и иконка с первого скелета; Serwist — позже

## Deferred Ideas

None — discussion stayed within phase scope

---

*Phase: 1-Foundation*
*Context gathered: 2026-09-30*
