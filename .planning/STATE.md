---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: Расширенная аналитика
current_phase: 07
current_phase_name: analytics-foundation-revenue-metrics
status: executing
stopped_at: Phase 7 UI-SPEC approved
last_updated: "2026-10-20T22:44:39.685Z"
last_activity: 2026-10-20
last_activity_desc: Roadmap v1.1 создан (5 фаз, 25 требований)
state_head: 52022197e61729f5f9a71f725ae82a3145b071b8
progress:
  total_phases: 5
  completed_phases: 0
  total_plans: 5
  completed_plans: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-10-20)

**Core value:** Пользователь за пару кликов покупает или продлевает VPN-подписку через бота или кабинет и сразу получает рабочую ссылку подписки.
**Current focus:** Milestone v1.1 — Расширенная аналитика (Phase 7 готов к планированию)

## Current Position

Phase: 07 (analytics-foundation-revenue-metrics) — READY TO EXECUTE
Plan: 0 of 0 in current phase
Status: Ready to execute
Last activity: 2026-10-20 — Roadmap v1.1 создан (5 фаз, 25 требований)

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**

- Total plans completed: 0
- Average duration: -
- Total execution time: -

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

**Recent Trend:**

- Last 5 plans: -
- Trend: -

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap v1.1]: Порядок фаз по зависимостям — фундамент rollup (`ANL-12`, `ANL-15`) в Phase 7 раньше метрик, потребляющих `providerCost` (`ANL-05`, `ANL-13`, `ANL-14`) в Phase 8
- [Roadmap v1.1]: Когорты (Phase 10) и сегменты (Phase 11) зависят от rollup Phase 7; сегменты питают существующий broadcast-composer
- [Roadmap v1.1]: Retention/churn считаем по подписке/ключу (`Order.keyId`, `kind='renew'`), не по аккаунту; `expired` = pending-by-age в аналитике, без нового OrderStatus
- [Roadmap v1.1]: Хранение = daily rollup-таблицы (`daily_metrics`, `user_rfm`, `artemida_balance_snapshots`) + nightly cron 03:00 + backfill-скрипт; без внешнего BI

### Pending Todos

None yet.

### Blockers/Concerns

- `Order.providerCost` — новое поле, требуется миграция Prisma; исторические заказы останутся без стоимости (backfill не может её восстановить) — метрики net/margin за прошлое неполны, помечать как таковые
- `artemida_balance_snapshots` — единственный источник истории баланса: `GET /balance` не имеет wallet-history endpoint, snapshots копятся только с момента деплоя Phase 7
- Пересчёт rollup должен быть дешёвым (один сервер, `docker compose ... up -d web`): backfill обязан быть runnable on demand, не блокируя запросы

## Deferred Items

Items acknowledged and deferred at milestone close, most recent first:

| Category | Item | Status | Deferred At | Milestone |
|----------|------|--------|-------------|-----------|
| *(none)* | | | | |

## Session Continuity

Last session: 2026-10-20T02:51:09.761Z
Stopped at: Phase 7 UI-SPEC approved
Resume file: .planning/phases/07-analytics-foundation-revenue-metrics/07-UI-SPEC.md
