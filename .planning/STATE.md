---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: Расширенная аналитика
current_phase: 08
current_phase_name: Unit Economics & Retention
status: verifying
stopped_at: Completed 08-03-PLAN.md (phase 08 complete)
last_updated: "2026-10-24T12:40:18.598Z"
last_activity: 2026-10-24
last_activity_desc: Phase 08 execution started
state_head: b7378fd6e4adb7cf66d71c0dcdd121c1cf619e26
progress:
  total_phases: 5
  completed_phases: 1
  total_plans: 8
  completed_plans: 8
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-10-20)

**Core value:** Пользователь за пару кликов покупает или продлевает VPN-подписку через бота или кабинет и сразу получает рабочую ссылку подписки.
**Current focus:** Phase 08 — Unit Economics & Retention

## Current Position

Phase: 08 (Unit Economics & Retention) — EXECUTING
Plan: 3 of 3
Status: Phase complete — ready for verification
Last activity: 2026-10-24 — Completed 08-01 (retention + economics pure core)

Progress: [████████░░] 75% (6/8 plans)

## Performance Metrics

**Velocity:**

- Total plans completed: 6
- Average duration: -
- Total execution time: -

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 07 | 5 | - | - |

**Recent Trend:**

- Last 5 plans: -
- Trend: -

*Updated after each plan completion*
**Per-Plan Metrics:**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 08 P01 | 4min | 2 tasks | 4 files |
| Phase 08 P02 | 4 | 2 tasks | 2 files |
| Phase 08 P03 | 61 | 2 tasks | 9 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap v1.1]: Порядок фаз по зависимостям — фундамент rollup (`ANL-12`, `ANL-15`) в Phase 7 раньше метрик, потребляющих `providerCost` (`ANL-05`, `ANL-13`, `ANL-14`) в Phase 8
- [Roadmap v1.1]: Когорты (Phase 10) и сегменты (Phase 11) зависят от rollup Phase 7; сегменты питают существующий broadcast-composer
- [Roadmap v1.1]: Retention/churn считаем по подписке/ключу (`Order.keyId`, `kind='renew'`), не по аккаунту; `expired` = pending-by-age в аналитике, без нового OrderStatus
- [Roadmap v1.1]: Хранение = daily rollup-таблицы (`daily_metrics`, `user_rfm`, `artemida_balance_snapshots`) + nightly cron 03:00 + backfill-скрипт; без внешнего BI
- [Phase 08]: A1 lostMrr uses finalAmount×30/days (D-07 literal), not cashOf
- [Phase 08]: A2 liveExpiry extends only the latest term per keyRef
- [Phase 08]: A6/A7 activeAtStart is order-bearing coverage incl. 0₽ bonus terms; churn cohort-clamped
- [Phase 08]: Phase 08: trailingMonthLabels extracted from loadWaterfall — shared month-slot helper; reconciliation test pins output-identity
- [Phase 08]: Phase 08: loadBurnRunway calls artemida.getBalance() once with .then(unlimited→null).catch(() => null) — never rejects the loader
- [Phase 08]: Phase 08: costed-subset discipline — providerCost !== null filters net LTV / margin / burn; coverage counts reported, never zero-filled
- [Phase 08]: Phase 08: error body = single-CARD common.errorLoad per PATTERNS degradation skeleton (plan action text supersedes the UI-SPEC heading-survives variant)
- [Phase 08]: Phase 08: BurnRunwayCards source avoids the strings artemida/providerCost/userId even in comments — the component passes the strongest no-leak/no-provider scan

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

Last session: 2026-10-24T12:40:18.400Z
Stopped at: Completed 08-03-PLAN.md (phase 08 complete)
Resume file: None
