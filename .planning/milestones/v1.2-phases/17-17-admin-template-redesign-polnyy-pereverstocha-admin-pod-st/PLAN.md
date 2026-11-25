---
phase: 17
plan: 1-6
name: Admin template redesign — полный переверсточа /admin под стилистику шаблона
requirements:
  - REQ-A1: Экраны Overview, Analytics, Users, Wallet, Promos, Referrals, Roles — стилистика шаблона и навигация между ними. (Tickets, Alerts — follow-up, см. открытый вопрос #1; Broadcasting/Segments/Pricing — минимальная стилистика, таблицы изписок-сервисов, если есть.)
  - REQ-A2: Данные — только из реальных BFF-эндпоинтов (`/api/admin/referrals/stats`, `/api/admin/wallet`, `/api/admin/promos`, `/api/admin/users/search`), нет hardcoded/гадалок, нет дублирования UI-кода.
  - REQ-A3: Гвардия: прямой fetch `/admin` без сессии/роли из `admin_users` (тестово для клиента: 404, сотрудник: страница) остаётся, как и прежде.
  - REQ-A4: `tsc --noEmit` зелёный, `next build` зелёный.
  - REQ-A5: Коммит в `origin/main`.
---

# Phase 17 — Admin template redesign — PLAN

**Goal:** Полный переверсточа `/admin` под стилистику шаблона (`app/admin/AdminApp.tsx` + `app/admin/admin.css`).

## Progress detection

- **Step 1:** `AdminApp.tsx` переписан под стилистику шаблона — воронка рефералов (bars), kpi-стрипы, таблицы, чипы периодов, статус-строки.
- **Step 2:** `admin.css` — чистый CSS, классы из шаблона.
- **Step 3:** Роли, рассылки, сегменты, тарифы — минимальная стилистика шаблона + реальные данные.
- **Step 4:** Деплой-чек на `dash.3set.online`, `tsc`, коммит.

## Ordered tasks

<task>
<title>Т1 — База: AdminApp.tsx + admin.css под шаблон</title>
<files>app/admin/AdminApp.tsx, app/admin/admin.css, app/admin/page.tsx</files>
<must_haves>
1. В компоненте появляются классы шаблона: kpi, chbars-with-values, kpi-grid, card, table-mobile, chip-with-count.
2. Нет `components/admin/*` в импортах `app/admin/page.tsx` (AdminApp самостоятельн).
3. Проверено `tsc` и eslint: 0 ошибок.
</must_haves>
<action>
- `AdminApp`: оставить хуки из текущего (data-fetch на 4 эндпоинта), сбросить поля на шаблон-стиль.
- `page.tsx`: убрать все imports StatsPanel/RevenuePanel/FunnelCharts/AnalyticsTeaser; сразу рендерить `<AdminApp />`.
</action>
<verify>`npx tsc --noEmit`; eslint на 2 файла: 0 ошибок (только старые warnings в существующем коде).</verify>
<done>Файлы переверстаны, старые импорты удалены.</done>
</task>

<task>
<title>Т2 — Пользователи (P2)</title>
<files>app/admin/AdminApp.tsx, app/admin/admin.css, app/admin/page.tsx, app/api/admin/users/search/route.ts (верификация), lib/admin-service.ts (верификация), tests/integration/admin-profile.test.ts (верификация)</files>
<must_haves>1. GET /api/admin/users/search?q=xxldr → 200 + rows с userId, telegramId, email, displayName, staffRole. 2. AdminApp: таблица `.tbl` с данными из эндпоинта; поиск-поле шаблона. 3. Тест admin-profile.test.ts: 0 failed, 0 skipped.</must_haves>
<action>Верифицировать реальные возвраты: pages селекта, `AdminUserTableRow` совпадают с таблицей. Прогресс обновлён под шаблон.</action>
<verify>TS: типы AdminUserTableRow — только userId, telegramId, email, username, displayName, role (P2: сейчас это пользователи, поведение — экспорт-поисковый, типы — как шаблон ждёт). Тест запущен.</verify>
<done>Таблица пользователей — реальные данные + шаблонная стилистика. Тест: зелёный.</done>
</task>

<task>
<title>Т3 — Промокоды (P2) + Просмотр токенов (P3, опционально)</title>
<files>app/admin/AdminApp.tsx, app/admin/admin.css</files>
<must_haves>1. GET /api/admin/promos → {promos[]} реальные ряды. 2. Таблица: code, type, discount, usedCount, maxUses, expiresAt, ownerUserId. 3. Просмотр token за пользователем: GET /api/admin/users/[id]/reward — status 200 или documented 404 (если нет данных, показано валидным P2).</must_haves>
<action>Подключить реальный вызов /api/admin/promos к таблице; использовать стили шаблона.</action>
<verify>tsc: проверено; curl GET /api/admin/promos — возвращает список промокодов.</verify>
<done>Промокоды — реальные, стилистика шаблона.</done>
</task>

<task>
<title>Т4 — Рефералы + Баланс API (P2) + Roles/Account/Integrations</title>
<files>app/admin/AdminApp.tsx, app/admin/admin.css, app/api/admin/referrals/stats/route.ts, app/api/admin/wallet/route.ts, app/api/admin/roles/route.ts, app/api/admin/wallet/route.ts, app/api/admin/referrals/withdrawals/route.ts, app/api/admin/fraud/route.ts, lib/referrals.ts, lib/admin-stats.ts, lib/admin-roles.ts, lib/admin-wallet.ts</files>
<must_haves>1. GET /api/admin/referrals/stats → FunnelStats (clicks, registrations, purchases, revenue, devices) реальные; GET /api/admin/wallet → balance реальный. 2. AdminApp: kpi-стрипы + функции (exp, floor для графиков как сейчас) заменены на стилистику шаблона. 3. Roles (P2): `GET /api/admin/roles` + таблица ролей из lib-форм (`AdminRoster`: ROLE_MATRIX из lib/admin-roles); Персонал/Сессии список из lib/admin-users. 4. Broadcasts/Segments/Pricing: минимальная стилистика (или ведущие только данные через новые BFF, если существуют).</must_haves>
<action>Подключить /api/admin/referrals/stats и /api/admin/wallet; Roles — через lib/admin-roles; добавить если есть GET /api/admin/wallet, GET /api/admin/users, GET /api/admin/roles. Все данные — реальные.</action>
<verify>tsc: 0 ошибок; curl GET /api/admin/referrals/stats, /api/admin/wallet — подтверждены структуры. Роли: документированные ответы admin/roles (404/401 везде, см. тестами); Персонал/Сессии — из lib-функций. .planning: verify обновлены в STATUS.md (ожидание v-track).</verify>
<done>Roles — реальные данные + шаблон. Рефералы/Баланс — реальные + стилистика.</done>
</task>

<task>
<title>Т5 — Roles + Топ-рефералы + Топ-промо (P3, финальная штурма)</title>
<files>app/admin/AdminApp.tsx, app/admin/admin.css, app/api/admin/referrals/stats/route.ts, lib/referrals.ts, lib/referral-stats.ts, lib/admin-roles.ts, lib/admin-users.ts</files>
<must_haves>1. Топ-рефералы — 5 кому начисляются платежи, реальные, из GET /api/admin/referrals/stats. 2. Roles (Версии А/B) — таблица ролей: name, description, users, max_users, features, priority, is_default, global_scope, protects_domain, apply (опционально), hidden. 3. Исполняющие листы сервисов (таблица списков): 4 листа: /api/admin/users/roles, /api/admin/users/permissions, /api/admin/broadcasts, /api/admin/segments — список обнаружения в шаблоне.</must_haves>
<action>Добавить таблицу Топ-рефералы и таблицу Roles в AdminApp (обе реальные). Версии — после принятия формы выберите один из вариантов ниже.</action>
<verify>tsc зелёный; скриншот после деплоя на dash.3set.online — проверено консолью. Roles — подтверждено тестом admin-roles.test.ts. Открытые вопросы из самопроверки: 1) Интерактив таблиц: изменение роли, импорт, создание воронки — пофазово (P3: change-role/import/public). 2) Визуальный каркас (как таблица будет выглядеть в формате @documentation-gantt) — визуально верифицирован конечным кодом. Оставлено на запрос пользователя.</verify>
<done>Roles + Top-Ref в AdminApp, стилистика шаблона.</done>
</task>

<task>
<title>Т6 — Деплой + чек на dash.3set.online</title>
<files>scripts/deploy-local.sh, .planning/STATE.md, .planning/phases/17-17-admin-template-redesign-polnyy-pereverstocha-admin-pod-st/STATUS.md, .planning/phases/17-17-admin-template-redesign-polnyy-pereverstocha-admin-pod-st/PLAN.md</files>
<must_haves>1. Деплой выполнен: контейнеры 3set-white-web-1, 3set-white-db-1, 3set-white-nginx-1 саморезаст — `/api/health` → 200 на dash.3set.online, /admin — скриншот-точка верификация через browser tool или фиксация `verification: { strc: admin page loads }` в STATUS.md. 2. tsc --noEmit 0 errors, eslint 0 errors (только существующие warnings). 3. Коммит в репозиторий. 4. Результат: `PASS` — реальные данные + шаблон выглядят так, как в шаблоне; `REVISE` с причинами — иначе фаза не закрывается.</must_haves>
<action>Деплой, записать STATUS.md, отчёт в выходе фазы (будущий execute-phase).</action>
<verify>Глазурек: tsc + консоль без ошибок, `git log --oneline -1` в main — новый коммит, контейнеры в healthy.</verify>
<done>STATUS.md обновлён до ready; PLAN — closed, commit — в origin/main.</done>
</task>

## Planning assumptions

- Data mapping: Overview → `/api/admin/referrals/stats` + `/api/admin/wallet`; Users → `/api/admin/users/search?q=` (q="", rows.userId); Promos → `/api/admin/promos`; Referrals → `/api/admin/referrals/stats`; Balance → `/api/admin/wallet`.
- **Open items (подтвердить/разрешить обратно или оставить):**
  1. Фраза из RESEARCH.md про "f-u-C2-68кест-light via ffrврендер" не найдена в репо (только `dark-mode` в class) — реализовать простое соответствие стилю, не используя несуществующие термины.
  2. Интерактив таблиц (reorder, column config) — пофазово: change-role/import/public в дополнение к P1 (исполняющие листы из самопроверки).

## What could go wrong

- E2E-замеры tsc/билда — быстрые на локальной машине, включены в must_haves.
- Риск деплоя на текущий сервер — фиксация в истории, выбрать по результатам.

- [x] `git push origin main` — план и доки в main.
- Локально закоммичено; push делается пользователем (SSH-доступ).
