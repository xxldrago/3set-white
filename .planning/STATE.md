---
gsd_state_version: 1.0
milestone: v1.2
milestone_name: Стабилизация и качество
current_phase: 16
current_phase_name: CSV Export & Metric Dictionary
status: planning
stopped_at: Phase 16 scaffolding created
last_updated: "2026-11-02T08:50:00.000Z"
last_activity: 2026-11-02
last_activity_desc: Phases 13-16 implemented (alerts, promo/referral quality, retention pages, CSV export)
state_head: c0dede4
progress:
  total_phases: 5
  completed_phases: 4
  total_plans: 5
  completed_plans: 5
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-10-31)

**Core value:** Пользователь за пару кликов покупает или продлевает VPN-подписку через бота или кабинет и сразу получает рабочую ссылку подписки.
**Current focus:** v1.2 Стабилизация и качество (Phases 12-16) — roadmap defined

## Current Position

Phase: 12 — Period Comparison & Data-Quality Foundation (not started)
Plan: —
Status: Roadmap defined; ready for discuss/plan
Last activity: 2026-10-31 — v1.2 roadmap created (5 phases, 13 requirements)

## Performance Metrics

**Velocity:**

- Total plans completed: 14
- Average duration: -
- Total execution time: -

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 07 | 5 | - | - |
| 8 | 3 | - | - |
| 9 | 3 | - | - |
| 10 | 3 | - | - |
| 11 | 3 | - | - |

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
| Phase 09 P02 | 6min | 2 tasks | 2 files |
| Phase 09 P03 | 9 | 2 tasks | 9 files |

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
- [Phase 09]: Phase 09 loaders: funnel/error/timing share the loadKpis createdAt cohort window — a paidAt window would drop pending orders from the funnel base; loadExpired is the only point-in-time read and derives windowHours from PAYMENT_WINDOW_MS
- [Phase 09]: Phase 09 DB loader tests use the identity pattern (re-run the loader's own WHERE/SELECT, derive via lib/analytics/funnel.ts) because funnel/expired counts are global across the shared test Postgres
- [Phase 09]: Phase 9 UI: funnel step labels go through a literal switch (a Record map fails the i18n unused-key scan); ErrorTable renders raw error codes verbatim with the i18n «unknown» label for the null group; shared formatDuration exported from TimeToPayCards and imported by TimeToProvisionCards
- [Phase 13]: AlertEvent.thresholdAtFiring и actualValue — TEXT (не DOUBLE), т.к. пороги могут быть JSON-снимком; миграция использует TEXT
- [Phase 13]: Quiet hours 22:00–09:00 MSK enforced на уровне worker (delivery time), не только UI
- [Phase 13]: Daily DM limit ≤3/admin enforced at delivery time via countDmsSentToday + reschedule
- [Phase 13]: Dedupe key формата `${type}:${windowLabel}:${userId}` предотвращает спам при повторных запусках cron
- [Phase 13]: Auto-resolve firing alerts для предыдущих дней — маркер resolvedAt без повторной проверки метрики (упрощённая логика)

### Pending Todos

None yet.

### Blockers/Concerns

- `Order.providerCost` — новое поле, требуется миграция Prisma; исторические заказы останутся без стоимости (backfill не может её восстановить) — метрики net/margin за прошлое неполны, помечать как таковые
- `artemida_balance_snapshots` — единственный источник истории баланса: `GET /balance` не имеет wallet-history endpoint, snapshots копятся только с момента деплоя Phase 7
- Пересчёт rollup должен быть дешёвым (один сервер, `docker compose ... up -d web`): backfill обязан быть runnable on demand, не блокируя запросы
- `[Phase 09]` `paidAt → provisioned` считается через `Order.updatedAt` (proxy): merge аккаунтов (`lib/accounts.ts:164`) переписывает `updatedAt` историческим provisioned-заказам и может завысить среднее. Нужна nullable-колонка `Order.provisionedAt` + миграция + `provisionedAt ?? updatedAt` (MD-01 в `09-REVIEW.md`, AR-09-01 в `09-SECURITY.md`)

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 261029-gni | Yandex Metrika counter 113865085 on 3set.online landing (14 pages) | 2026-10-29 | c77c820 | [20261029-yandex-metrika-landing](./quick/20261029-yandex-metrika-landing/) |

## Deferred Items

Items acknowledged and deferred at milestone close, most recent first:

| Category | Item | Status | Deferred At | Milestone |
|----------|------|--------|-------------|-----------|
| *(none)* | | | | |

## Session Continuity

Last session: 2026-11-02T07:55:00.000Z
Stopped at: Phase 13 complete — ready for deployment
Resume file: .planning/phases/13-anomaly-alerts/13-PLAN-SUMMARY.md

## Operator Next Steps

- Deploy Phase 13: `npx prisma migrate deploy` on server
- Configure thresholds in Setting model (4 keys: paymentDropPercent, failedPaymentRatio, ticketSpikePercent, runwayDays)
- Verify cron at 03:05 MSK triggers detection
- Test Telegram DM delivery to admins
- Test quiet hours deferral (22:00–09:00 MSK)
- Test `/admin/alerts` UI (filters, mute toggle, test button)
- Phase 12: run `/gsd-discuss-phase 12` (or `/gsd-plan-phase 12` to go straight to planning)
