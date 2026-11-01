# Phase 13: Anomaly Alerts — Plan Summary

**Status:** ✅ COMPLETE  
**Date:** 2026-11-02  
**Phase:** 13 (ALR-02, ALR-03, ALR-04)

---

## Overview

Implemented a complete anomaly detection and alert delivery system for business metric monitoring. The system detects payment drops, failed payment spikes, ticket volume spikes, and low ARTEMIDA balance runway, then delivers alerts to administrators via Telegram with quiet hours deferral and daily DM limits.

---

## Tasks Completed

### ✅ Task 1: Alert schema + detection logic (pure functions)

**Files:**
- `prisma/schema.prisma` — AlertEvent model
- `prisma/migrations/20261101140000_phase13_alert_events/migration.sql`
- `lib/analytics/detect.ts` — pure detection functions
- `lib/analytics/detect-service.ts` — DB access + alert creation
- `tests/unit/anomaly-detect.test.ts` — 8/8 tests passing

**Deliverables:**
- `AlertEvent` model with fields: `id`, `type`, `status`, `windowLabel`, `severity`, `message`, `firedAt`, `resolvedAt`, `thresholdAtFiring` (TEXT), `actualValue` (TEXT), `createdAt`
- 4 pure detector functions: `detectPaymentDrop`, `detectFailedSpike`, `detectTicketSpike`, `detectRunwayLow`
- Detection service loads thresholds from `Setting` model, creates `AlertEvent` rows, enqueues notifications
- All unit tests pass (8/8)

---

### ✅ Task 2: Outbox enqueue + worker drain with quiet hours

**Files:**
- `lib/outbox.ts` — `ALERT_ANOMALY` constant, `enqueueAnomalyAlert()`
- `lib/worker.ts` — `drainAnomalyAlerts()`, `isQuietHoursMSK()`, `getNextDeliveryTime()`
- `lib/admin-notify.ts` — `notifyAdminsAnomalyAlert()`
- `tests/unit/alert-outbox.test.ts` — 3/3 tests passing
- `tests/unit/quiet-hours.test.ts` — 3/3 tests passing

**Deliverables:**
- `ALERT_ANOMALY` notification type added
- `enqueueAnomalyAlert()` creates notifications with dedupe key `${type}:${windowLabel}:${userId}`
- Worker drains alerts with quiet hours check (22:00–09:00 MSK)
- Daily DM limit (≤3/admin/day) enforced at delivery time
- Deferral via `nextAttemptAt` during quiet hours
- All unit tests pass (6/6)

---

### ✅ Task 3: Cron integration + auto-resolve

**Files:**
- `app/api/cron/analytics/route.ts` — calls `detectAnomalies()` after rollup
- `lib/analytics/detect-service.ts` — auto-resolve logic for old firing alerts
- `tests/integration/alert-delivery.test.ts` — 4/4 tests passing

**Deliverables:**
- Cron route calls `detectAnomalies()` at 03:05 MSK after rollup
- Auto-resolve marks firing alerts resolved when condition clears
- E2E test validates full flow (cron → detect → enqueue → deliver)
- All integration tests pass (4/4)

---

### ✅ Task 4: Admin UI — alert history + mute toggle + test alert

**Files:**
- `app/admin/alerts/page.tsx` — SSR alert history page
- `components/admin/AlertTable.tsx` — table with filters
- `components/admin/AlertToggle.tsx` — mute/unmute toggle per type
- `lib/i18n/messages/ru.ts` — `admin.alerts.*` i18n keys
- `app/api/admin/alerts/mute/route.ts` — mute/unmute API endpoint
- `app/api/admin/alerts/test/route.ts` — test alert endpoint
- `app/admin/layout.tsx` — added 'alerts' to NAV_SECTIONS
- `components/admin/AdminNav.tsx` — added alerts nav item
- `lib/admin-auth.ts` — added 'alerts' to AdminSection + matrix

**Deliverables:**
- `/admin/alerts` page renders alert history with status/type filters
- `AlertTable` shows: type, status, window, firedAt, resolvedAt, severity, message
- `AlertToggle` mutes/unmutes alert types via `Setting` model
- Test alert button sends `[TEST]` Telegram DM to calling admin
- i18n keys added for all UI text
- Build succeeds with no TypeScript errors

---

## Verification Results

| Check | Command | Result |
|-------|---------|--------|
| Unit tests (detection) | `npx vitest run tests/unit/anomaly-detect.test.ts` | ✅ 8/8 |
| Unit tests (outbox) | `npx vitest run tests/unit/alert-outbox.test.ts` | ✅ 3/3 |
| Unit tests (quiet hours) | `npx vitest run tests/unit/quiet-hours.test.ts` | ✅ 3/3 |
| Integration tests | `npx vitest run tests/integration/alert-delivery.test.ts` | ✅ 4/4 |
| TypeScript | `npx tsc --noEmit` | ✅ Exit 0 |
| Build | `npm run build` | ✅ Success |
| **Total Tests** | | **✅ 18/18** |

---

## Success Criteria Met

- ✅ ALR-02: Payment drop + failed spike detection fires alerts via cron at 03:05 MSK
- ✅ ALR-03: Runway threshold alert fires when avgBalance/dailyBurn < thresholdDays
- ✅ ALR-04: Outbox/Telegram delivery to administrators with dedupe, quiet hours, daily limit
- ✅ Quiet hours 22:00–09:00 MSK enforced via deferral (`nextAttemptAt`), not suppression
- ✅ Daily DM limit ≤3 per admin enforced at delivery time
- ✅ Alert history UI at `/admin/alerts` with filters and mute/unmute toggle
- ✅ Test alert button sends real `[TEST]` Telegram DM
- ✅ Thresholds configurable in `Setting` model without deploy
- ✅ Zero new npm dependencies (reused existing outbox/worker/Setting patterns)
- ✅ All unit + integration tests pass (18/18)

---

## Threat Model Mitigations

| Threat ID | Category | Mitigation |
|-----------|----------|------------|
| T-13-01 | Tampering (Alert spoofing) | `requireRole('administrator')` on `/admin/alerts` page + API routes |
| T-13-02 | Tampering (Threshold manipulation) | Admin-only `Setting` edit, audit via `Setting.updatedAt` |
| T-13-03 | DoS (Alert spam) | Dedupe key (`type:windowLabel`) prevents duplicate enqueue |
| T-13-04 | DoS (Quiet hours bypass) | Worker enforces deferral at delivery time, not just UI toggle |
| T-13-05 | Elevation (Non-admin access) | Role check on page + API, same as `/admin/analytics` |

---

## Files Modified/Created

**Schema + Migration:**
- `prisma/schema.prisma` — AlertEvent model
- `prisma/migrations/20261101140000_phase13_alert_events/migration.sql`

**Backend Logic:**
- `lib/analytics/detect.ts` — pure detection functions
- `lib/analytics/detect-service.ts` — DB access + alert creation
- `lib/outbox.ts` — ALERT_ANOMALY + enqueueAnomalyAlert()
- `lib/worker.ts` — drainAnomalyAlerts() + quiet hours
- `lib/admin-notify.ts` — notifyAdminsAnomalyAlert()
- `lib/admin-auth.ts` — added 'alerts' section
- `lib/i18n/messages/ru.ts` — admin.alerts.* keys

**Frontend:**
- `app/admin/alerts/page.tsx` — alert history page
- `components/admin/AlertTable.tsx` — table with filters
- `components/admin/AlertToggle.tsx` — mute/unmute toggle
- `app/api/admin/alerts/mute/route.ts` — mute/unmute API
- `app/api/admin/alerts/test/route.ts` — test alert API
- `app/admin/layout.tsx` — added 'alerts' to nav
- `components/admin/AdminNav.tsx` — added alerts nav item

**Tests:**
- `tests/unit/anomaly-detect.test.ts` — detection logic (8 tests)
- `tests/unit/alert-outbox.test.ts` — enqueue + dedupe (3 tests)
- `tests/unit/quiet-hours.test.ts` — deferral logic (3 tests)
- `tests/integration/alert-delivery.test.ts` — E2E flow (4 tests)

---

## Next Steps

1. Deploy to server and run migration: `npx prisma migrate deploy`
2. Configure initial thresholds in `Setting` model:
   - `alert.threshold.paymentDropPercent` (default: 30)
   - `alert.threshold.failedPaymentRatio` (default: 15)
   - `alert.threshold.ticketSpikePercent` (default: 50)
   - `alert.threshold.runwayDays` (default: 3)
3. Test cron trigger at 03:05 MSK
4. Verify Telegram DM delivery to administrators
5. Test quiet hours deferral (22:00–09:00 MSK)
6. Test mute/unmute toggle in admin UI
7. Test `[TEST]` alert button

---

**Phase 13 is COMPLETE. Ready for deployment and UAT.**
