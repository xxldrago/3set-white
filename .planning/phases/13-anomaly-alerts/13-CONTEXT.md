---
phase: 13
plan: null
type: context
---

# Phase 13 — Anomaly Alerts — CONTEXT.md

**Phase goal:** Админ получает алерты, когда бизнес-метрики выходят за порог, а не узнаёт об этом из ручного просмотра дашборда

**Mode:** mvp

**Depends on:** Phase 12 (comparison windows, metric registry, data quality events)

---

## Domain

Система детекции и доставки алертов об аномалиях бизнес-метрик.

**In scope:**
- Детекторы для 3 типов: оплаты (падение + failed payments), тикеты (всплеск), runway баланса ARTEMIDA
- Cron-запуск детекции (03:05 MSK, вместе с analytics cron)
- Доставка через существующий outbox/Telegram только админам (`administrator` role)
- Дедупликация по `(type, windowLabel)` — не спамить при повторном запуске
- Quiet hours 22:00–09:00 MSK + лимит ≤3 DM/сутки через deferral
- История алертов (`firing → resolved`) в админ-панели
- Пороги в `Setting` — настраиваются без деплоя

**Out of scope:**
- Новые типы метрик (будущие фазы)
- Мобильное приложение / push-уведомления
- Эскалация по уровням (manager — нет, только admin)

---

## Decisions

### Детекция аномалий

| Решение | Обоснование |
|---------|-------------|
| **Адаптивные пороги на основе Phase 12 сравнений** | WoW/MoM сравнения уже реализованы в Phase 12 (`comparisonWindows`, `compareFlow`). Используем их как базлайн для детекции отклонений. |
| **Статические пороги для runway** | Порог runway баланса — абсолютное значение в `Setting` (например, "минимум 3 дня баланса"). |
| **Детекция по 3 типам** | 1. Падение оплат + рост доли `failed` (Phase 12 delta). 2. Всплеск тикетов (Phase 12 delta). 3. Runway < порог (абсолютное значение). |

### Окно детекции

| Решение | Обоснование |
|---------|-------------|
| **Ежедневная детекция (cron 03:05 MSK)** | Синхронно с analytics cron. Один запуск в сутки. |
| **Окно: предыдущий MSK день** | Детекция по завершённому дню. Сегодняшний неполный день исключён (D-04 из Phase 12). |

### Состояния алерта

| Статус | Описание |
|--------|----------|
| `firing` | Алерт сработал, ожидает доставки |
| `sent` | Доставлен админу |
| `resolved` | Условие больше не выполняется (авто) |
| `muted` | Админ отключил этот тип алерта |

**Авто-закрытие:** При следующем запуске cron, если условие больше не выполняется → `resolved`.

### UI истории алертов

| Решение | Обоснование |
|---------|-------------|
| **Отдельная страница `/admin/alerts`** | Не перегружать `/admin/analytics`. Ясная навигация. |
| **Таблица с фильтрами** | Столбцы: type, status, windowLabel, firedAt, resolvedAt. Фильтры: status (firing/resolved/muted), type. |
| **Toggle вкл/выкл типа** | Кнопка mute/unmute для каждого типа алерта. |

### Тестирование алертов

| Решение | Обоснование |
|---------|-------------|
| **Кнопка «Test alert» в UI** | Отправляет тестовое сообщение админу для проверки доставки перед включением алерта. |

---

## Canonical refs

| Ref | Path |
|-----|------|
| ROADMAP.md (Phase 13) | `.planning/ROADMAP.md` |
| Phase 12 CONTEXT.md | `.planning/phases/12-period-comparison-data-quality-foundation/12-CONTEXT.md` |
| Phase 12 UI-SPEC.md | `.planning/phases/12-period-comparison-data-quality-foundation/12-UI-SPEC.md` |
| Setting model | `prisma/schema.prisma` (existing) |
| outbox/Telegram delivery | Existing delivery code (to be referenced in planning) |

---

## Code context

**Reusable assets from Phase 12:**
- `lib/analytics/windows.ts` — comparison windows
- `lib/analytics/compare.ts` — delta calculation
- `lib/analytics/quality.ts` — degraded classifier
- `lib/analytics/metric-registry.ts` — metric definitions
- `lib/analytics/service.ts` — KPI loaders
- `components/admin/MetricCard.tsx` — UI component (может быть адаптирован для alerts)
- `lib/i18n/messages/ru.ts` — i18n keys

**Existing infrastructure:**
- Cron route: `app/api/cron/analytics/route.ts` (03:05 MSK)
- Setting model: `prisma/schema.prisma` (для порогов)
- Telegram delivery: existing outbox/bot infrastructure

---

## Deferred ideas

| Идея | Причина отложенения |
|------|---------------------|
| Мобильные push-уведомления | Out of scope для MVP |
| Эскалация по уровням (manager) | ROADMAP явно указывает только admin |
| Дополнительные типы алертов | Будущие фазы |

---

**Next:** `/gsd-plan-phase 13` — разбить на планы и задачи.
