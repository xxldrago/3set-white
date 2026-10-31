# 3set-white — сервис продажи VPN

## What This Is

Сервис продажи VPN-подписок на базе ARTEMIDA Paid API (V1, `https://artemida.cc/v1`). Включает Telegram-бота, PWA личный кабинет на `dash.3set.online` (`panel.3set.online` — живой алиас), оплату через Platega.io, систему тикетов и админ-панель. Весь бэкенд — тонкая обертка над ARTEMIDA API: баланс, прайсинг, ключи, трафик, устройства, subscription-ссылки. Для русскоязычных пользователей, оплата в рублях.

## Core Value

Пользователь за пару кликов покупает или продлевает VPN-подписку через бота или кабинет и сразу получает рабочую ссылку подписки.

## Current Milestone: v1.1 Расширенная аналитика ✅ SHIPPED 2026-10-31

**Goal (achieved):** Дать владельцу измеримую картину бизнеса — выручка, юнит-экономика и удержание — с историей, когортами и сегментами, а не одним числом за период.

**Shipped (5 phases, 17 plans):**
- Phase 7: Analytics Foundation & Revenue Metrics (MRR/ARR, waterfall, ARPU/ARPPU, daily_metrics rollup, backfill, providerCost)
- Phase 8: Unit Economics & Retention (LTV gross/net, renewal, churn, margin, burn-rate/runway)
- Phase 9: Payment Funnel & Failure Analysis (funnel, errorCode, timing, expired-by-age)
- Phase 10: Cohorts & Retention Analytics (registration/payer matrices, channel & device slices)
- Phase 11: RFM Segments & Targeting (user_rfm, 7 named segments, drill-down, broadcast targeting, configurable thresholds)

**Next:** v1.2 (not started) — run `/gsd-new-milestone` to define scope.

## Requirements

### Validated

- ✓ Регистрация через Telegram с синхронизацией бота и PWA-кабинета — v1.0
- ✓ Trial-ключ, покупка, продление, апгрейд — v1.0
- ✓ Личный кабинет (PWA), тикеты, админ-панель с ролями — v1.0
- ✓ Деплой на single server, White Label — v1.0
- ✓ Analytics foundation: daily_metrics rollup, cron 03:00, backfill, providerCost — v1.1
- ✓ MRR/ARR/ARPU/ARPPU + waterfall — v1.1
- ✓ LTV gross/net, renewal, churn, margin, burn-rate/runway — v1.1
- ✓ Payment funnel + timing + expired-by-age — v1.1
- ✓ Cohort matrices (registration + payer) с channel/device slices — v1.1
- ✓ RFM segments (7 named) + drill-down + broadcast targeting + configurable thresholds — v1.1

### Active

(None — next milestone not yet defined; run `/gsd-new-milestone`)

### Out of Scope

- Английская локализация в v1 — только RU/RUB
- Лимитные тарифы трафика в v1 — по умолчанию безлимит (`trafficLimitGb=0`)
- Пополнение внутреннего баланса пользователя — оплата сразу за ключ
- White Label DNS-настройки вне кода (A-запись вручную) — в коде только сохранение/использование домена

## Context

- Стек: Node + Next.js (PWA-кабинет + API), Telegraf для Telegram-бота
- Внешние зависимости: ARTEMIDA Paid API V1 (`https://artemida.cc/v1`, авторизация `Authorization: Bearer $API_KEY`, `Idempotency-Key` для POST/DELETE), Platega.io (`https://docs.platega.io/`)
- Тарифы v1: периоды 7/30/90 дней, устройства 2–10 на выбор (провайдер требует минимум 2), прайсинг через `GET /pricing?devices=&days=`, trial фиксированный (1 день, 2 устройства, 2 ₽)
- Trial-ключи нельзя продлевать/апгрейдить (ограничение API) — в UI блокировать эти действия
- Аутентификация: Telegram Login Widget в PWA, единый идентификатор `telegram-id`; email/пароль не нужен
- Тикеты: создание из бота и кабинета, вложения (фото/скриншоты), ответы доставляются в оба канала
- Инфраструктура: single server 212.192.14.166 (root-доступ, секреты только в `.env`, никогда в git), домен `dash.3set.online` (+ алиас `panel.3set.online`) → этот сервер; White Label требует A-запись поддомена на `144.31.93.193` без AAAA, DNS Only в Cloudflare, сертификат автоматически
- Репозиторий: GitHub новый `3set-white` (remote еще не создан, `gh` доступ проверить), все изменения коммитить и пушить, затем деплой на сервер (Docker + Nginx + HTTPS)
- API-баланс: отдельный от кабинета ARTEMIDA, пополнение через `POST /wallet/topups` + проверка `GET /wallet/topups/{paymentId}`

## Constraints

- **Tech stack**: Node + Next.js + Telegraf — решение пользователя
- **API limits**: Trial нельзя renew/upgrade; permanent delete без возврата средств; учитывать коды 401/402/409/429/502/503 и `Retry-After`
- **Security**: `ARTEMIDA_API_KEY`, Platega-секреты, SSH/root-пароль — только env/секреты, запрет коммита секретов; root-пароль из чата перенести в менеджер секретов и ротировать
- **Compatibility**: PWA (installable, мобильный фокус), Telegram Bot API + Login Widget
- **Infrastructure**: Один сервер 212.192.14.166, домен dash.3set.online; HTTPS обязателен (Platega webhook + Telegram webhook)
- **Compliance**: RU/RUB, безлимит по умолчанию

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Trial 1 день через `POST /trial` | Ограничение ARTEMIDA API, 3 дня невозможны без кастомной покупки | — Pending |
| Стек Node + Next.js + Telegraf | Выбор пользователя, единый язык | — Pending |
| Оплата сразу за ключ (без баланса юзера) | Проще для MVP, меньше состояний | — Pending |
| Тарифы 7/30/90 дней, устройства 2–10 | Минимум провайдера — 2 устройства; покрывает спрос, прайсинг считает сервер ARTEMIDA | — Pending |
| Роли стандартные (админ/поддержка/менеджер) | Админ всё, поддержка тикеты+просмотр, менеджер финансы | — Pending |
| Всё на один сервер 64.188.97.106 | Простота и стоимость для MVP | — Pending |
| my.3set.online — только кабинет; sub-ссылки — дефолт ARTEMIDA | White Label отложен владельцем (WHITELABEL_HOST по умолчанию, fallback на provider URL) | — Pending |
| Безлимит трафика по умолчанию | Меньше support-нагрузки в v1 | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-10-31 — v1.1 milestone shipped (Phases 7-11)*
