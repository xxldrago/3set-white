# Roadmap: 3set-white — сервис продажи VPN

## Milestones

- ✅ **v1.0 MVP** — Phases 1-6 (shipped 2026-10-06) — [archive](milestones/v1.0-ROADMAP.md)
- ✅ **v1.1 Расширенная аналитика** — Phases 7-11 (shipped 2026-10-31) — [archive](milestones/v1.1-ROADMAP.md)
- ✅ **v1.2 Стабилизация и качество** — Phase 12 (completed)

## Overview

Milestone v1.2 завершена Phase 12 — фундамент корректности аналитики: сравнение периодов (WoW/MoM) и флаги качества данных, чтобы ни один отчёт не опирался на degraded-ответы ARTEMIDA.

## Phases

**Phase Numbering:**

- Integer phases (12, 13, 14): Planned milestone work
- Decimal phases (12.1, 12.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

Numbering continues from v1.1 (last phase = 11).

- ✅ **Phase 12: Period Comparison & Data-Quality Foundation** - WoW/MoM-дельта и % для каждой метрики, флаги degraded-ответов ARTEMIDA, исключение их из агрегатов (completed)

## Phase Details

### Phase 12: Period Comparison & Data-Quality Foundation

**Goal**: As an admin, I want every analytics metric to show its WoW/MoM delta and to know when a metric is computed from degraded ARTEMIDA responses, so that I can trust the numbers and spot regressions before they become alerts.
**Mode:** mvp
**Depends on**: Nothing (first phase of milestone v1.2; переиспользует `lib/analytics/*` и `/api/cron/analytics` из v1.1)
**Requirements**: ALR-01, EXT-05 (+ capture-only основания для PRM-01/PRM-04; доставка самих требований — в Phase 14)
**Success Criteria** (what must be TRUE):

  1. Каждая метрика на `/admin/analytics` показывает дельту к предыдущей неделе и предыдущему месяцу (абсолют и %), с корректным поведением при нулевой базе
  2. Сравнение периодов считается на MSK-границах и совпадает с ручной сверкой двух соседних периодов
  3. Неполный текущий день не сравнивается с полным периодом: сравнение помечается `partial`, а при несопоставимом покрытии результат — `incomparable`, а не число
  4. Ответы ARTEMIDA, помеченные как degraded (таймаут/ошибка/частичные данные), фиксируются флагом и не попадают в агрегаты — это видно в UI
  5. Degraded-прогон rollup не может перезаписать здоровые значения `daily_metrics` (write-guard монотонности/качества)
  6. Метрика, затронутая degraded-данными, помечена в админке, и её значение можно объяснить (сколько записей исключено)
  7. Существующие значения v1.1 не меняются на «здоровых» данных (регрессионная сверка)
  8. Захват, который нельзя восстановить задним числом, запущен уже здесь: клики по промокодам (generic + партнёрские) и `User.signupIpHash` (sha256, без сырого IP, литерал `"direct"` исключён)
  9. `lib/analytics/metric-registry.ts` содержит каждую метрику (id, label, формула, источник, направление, ограничения) — единый источник для дашбордов и будущего словаря

**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phase 12 is the only phase of milestone v1.2.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 12. Period Comparison & Data-Quality Foundation | 5/5 | Completed | 2026-11-10 |
