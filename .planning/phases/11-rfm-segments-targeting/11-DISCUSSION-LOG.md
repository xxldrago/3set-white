# Phase 11: RFM Segments & Targeting - Discussion Log

> **Audit trail only.** Decisions are captured in CONTEXT.md.

**Date:** 2026-10-29
**Phase:** 11-RFM Segments & Targeting
**Areas discussed:** RFM-расчёт, Сегменты и пороги, Хранение и обновление, Drill-down и рассылка, UI и композиция

---

## RFM-расчёт

| Option | Selected |
|--------|----------|
| Recency = дни с последней оплаты (trial-only → дни с регистрации) | ✓ |
| Frequency = число оплаченных заказов за trailing 12 мес | ✓ |
| Monetary = сумма cash за всё время | ✓ |
| Окно: Monetary — вся история; R/F — trailing 12 мес | ✓ |

## Сегменты и пороги

| Option | Selected |
|--------|----------|
| Rule-based (именованные сегменты) | ✓ |
| Пороги в Setting (key/value) | ✓ |
| Admin-UI для редактирования порогов | ✓ |
| VIP = топ 5% по Monetary | ✓ |

## Хранение и обновление

| Option | Selected |
|--------|----------|
| user_rfm: userId, recencyDays, frequency, monetary, segment, computedAt | ✓ |
| Отдельный cron 03:10 | ✓ |
| Backfill: scripts/backfill-rfm.ts | ✓ |
| Trial-only включены в user_rfm | ✓ |

## Drill-down и рассылка

| Option | Selected |
|--------|----------|
| Drill-down: /admin/users?segment= | ✓ |
| Preview count: GET /api/admin/segments/:name/count | ✓ |
| Broadcast: body { body, segment? } | ✓ |
| BroadcastComposer: dropdown «Аудитория» | ✓ |

## UI и композиция

| Option | Selected |
|--------|----------|
| Отдельная страница /admin/segments | ✓ |
| Карточки с числом (7 сегментов) | ✓ |
| Пороги редактируются на /admin/segments | ✓ |
| Нейтральные токены (без red/green) | ✓ |

## Deferred Ideas
- Алерты на изменение сегментов (ALR)
- CSV-экспорт (EXT-06)
- RFM-score (квантили) — отложен, выбран rule-based
