---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: Расширенная аналитика
current_phase: 09
current_phase_name: Payment Funnel & Failure Analysis
status: executing
stopped_at: Completed 09-01-PLAN.md (funnel derivation core)
last_updated: "2026-10-27T08:12:00.000Z"
last_activity: 2026-10-27
last_activity_desc: Plan 09-01 complete — pure funnel derivation core green
state_head: 5daa2f757566e3c53665ca54b1d050f2526e9d22
progress:
  total_phases: 5
  completed_phases: 2
  total_plans: 11
  completed_plans: 9
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-10-20)

**Core value:** Пользователь за пару кликов покупает или продлевает VPN-подписку через бота или кабинет и сразу получает рабочую ссылку подписки.
**Current focus:** Phase 09 — Payment Funnel & Failure Analysis

## Current Position

Phase: 09 (Payment Funnel & Failure Analysis) — EXECUTING
Plan: 2 of 3
Status: Executing Phase 09 — 09-01 complete, 09-02 (loaders) next
Last activity: 2026-10-27 — Plan 09-01 complete (pure funnel core, 16 fixtures green)

Progress: [█████████░] 82% (9/11 plans)

## Performance Metrics

**Velocity:**

- Total plans completed: 8
- Average duration: -
- Total execution time: -

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 07 | 5 | - | - |
| 8 | 3 | - | - |

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
| Phase 09 P01 | 3min | 2 tasks | 2 files |

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
- [Phase 09]: P01 funnel stages are reach-based (paidAt/key/status), never current-status-only; paid→failed fallback and keyless CHARGEBACKED-from-provisioning rows declared as DOCUMENTED APPROXIMATIONS in the module header
- [Phase 09]: P01 errorBreakdown keeps null errorCode (component owns «unknown» label); tie-break count desc, code asc with null as ''
- [Phase 09]: P01 timingStats = successful chains only; paidToProvisioned uses the updatedAt proxy, guarded by the status='provisioned' scope
- [Phase 09]: P01 PAYMENT_WINDOW_MS = 24h hardcoded code constant; expiredCount strict `<` (±1 ms boundary pinned)

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

Last session: 2026-10-27T08:12:00.000Z
Stopped at: Completed 09-01-PLAN.md (funnel derivation core)
Resume file: None
