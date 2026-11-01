---
phase: 13
plan: '13'
type: execute
wave: 1
depends_on: []
files_modified:
  - prisma/schema.prisma
  - prisma/migrations/20261101140000_phase13_alert_events/migration.sql
  - lib/analytics/detect.ts
  - lib/analytics/detect-service.ts
  - app/api/cron/analytics/route.ts
  - lib/outbox.ts
  - lib/worker.ts
  - lib/admin-notify.ts
  - app/admin/alerts/page.tsx
  - components/admin/AlertTable.tsx
  - components/admin/AlertToggle.tsx
  - lib/i18n/messages/ru.ts
  - tests/unit/anomaly-detect.test.ts
  - tests/unit/alert-outbox.test.ts
  - tests/unit/quiet-hours.test.ts
  - tests/integration/alert-delivery.test.ts
autonomous: true
requirements: [ALR-02, ALR-03, ALR-04]

estimate:
  tokens: 80000
  raw_tokens: 80000
  tasks: 4
  confidence: medium

must_haves:
  truths:
    - "AlertEvent model stores type, status, windowLabel, severity, message, firedAt, resolvedAt, thresholdAtFiring, actualValue"
    - "Detection runs daily at 03:05 MSK in cron route, after rollup, calling detectAnomalies()"
    - "Four alert types: payment_drop (WoW/MoM delta > threshold), failed_spike (ratio > threshold), ticket_spike (WoW delta > threshold), runway_low (balance/dailyBurn < days)"
    - "Thresholds stored in Setting model with keys alert.threshold.* — editable without deploy"
    - "Notification outbox enqueued with type ALERT_ANOMALY, dedupeKey = `${type}:${windowLabel}`, userId null for admin broadcast"
    - "Worker drains ALERT_ANOMALY jobs, checks quiet hours (22:00–09:00 MSK), defers via nextAttemptAt if in quiet hours"
    - "Daily DM limit ≤3 per admin enforced at delivery time, not enqueue time"
    - "Admin UI at /admin/alerts shows table with filters (status, type), mute/unmute toggle per type"
    - "Test alert button sends real Telegram DM with [TEST] prefix to verify delivery"
    - "Auto-resolve: cron marks firing alerts resolved when current metric < threshold"
  artifacts:
    - prisma/schema.prisma — AlertEvent model + Notification.type enum extension
    - prisma/migrations/20261101140000_phase13_alert_events/migration.sql
    - lib/analytics/detect.ts — pure detection functions (compareFlow-based)
    - lib/analytics/detect-service.ts — DB access + alert creation + threshold loading
    - app/api/cron/analytics/route.ts — extended with detectAnomalies() call
    - lib/outbox.ts — ALERT_ANOMALY constant + enqueueAnomalyAlert()
    - lib/worker.ts — drainAnomalyAlerts() loop + quiet hours deferral
    - lib/admin-notify.ts — notifyAdminsAnomalyAlert() broadcast function
    - app/admin/alerts/page.tsx — alert history page (SSR)
    - components/admin/AlertTable.tsx — table with filters
    - components/admin/AlertToggle.tsx — mute/unmute toggle
    - lib/i18n/messages/ru.ts — admin.alerts.* keys
    - tests/unit/anomaly-detect.test.ts — detection logic (pure functions)
    - tests/unit/alert-outbox.test.ts — enqueue + dedupe
    - tests/unit/quiet-hours.test.ts — deferral logic
    - tests/integration/alert-delivery.test.ts — E2E cron → detect → enqueue → deliver
  key_links:
    - "cron route calls detectAnomalies() after rollup"
    - "detect-service loads thresholds from Setting, uses Phase 12 compareFlow"
    - "outbox enqueues with dedupeKey, worker drains with quiet hours check"
    - "admin UI queries AlertEvent table, uses AlertTable + AlertToggle components"
  prohibitions:
    - "no new npm dependencies (reuse existing outbox/worker/Setting patterns)"
    - "no silent suppression during quiet hours — always defer via nextAttemptAt"
    - "no hardcoded thresholds — all via Setting model"
    - "no direct Telegram send from cron — always queue via outbox"

---

**As an** administrator, **I want to** receive Telegram alerts when business metrics show anomalies (payment drops, failed payment spikes, ticket volume spikes, low ARTEMIDA balance runway), **so that** I can react quickly to business issues without manually monitoring dashboards.

## objective

Purpose: Implement anomaly detection and alert delivery system building on Phase 12 comparison infrastructure.

Output: Working alert system with cron detection, outbox delivery, quiet hours deferral, admin history UI, and configurable thresholds.

## execution_context

@/Users/alekseimikhalkin/.config/opencode/gsd-core/workflows/execute-plan.md
@/Users/alekseimikhalkin/.config/opencode/gsd-core/templates/summary.md

## context

@.planning/STATE.md
@.planning/ROADMAP.md
@.planning/phases/13-anomaly-alerts/13-CONTEXT.md
@.planning/phases/13-anomaly-alerts/13-RESEARCH.md
@.planning/phases/12-period-comparison-data-quality-foundation/12-CONTEXT.md
@lib/outbox.ts
@lib/worker.ts
@lib/admin-notify.ts
@lib/balance-alert.ts
@app/api/cron/analytics/route.ts
@lib/analytics/compare.ts
@lib/analytics/windows.ts

## tasks

<task type="auto" tdd="true">
  <name>Task 1: Alert schema + detection logic (pure functions)</name>
  <files>prisma/schema.prisma, prisma/migrations/20261101140000_phase13_alert_events/migration.sql, lib/analytics/detect.ts, lib/analytics/detect-service.ts, tests/unit/anomaly-detect.test.ts</files>
  <read_first>
    - prisma/schema.prisma (Notification, Setting, DailyMetric, ArtemidaBalanceSnapshot models)
    - lib/analytics/compare.ts (compareFlow function from Phase 12)
    - lib/analytics/windows.ts (comparisonWindows from Phase 12)
    - lib/balance-alert.ts (existing balance alert pattern)
  </read_first>
  <behavior>
    - Test 1: detectPaymentDrop returns firing alert when WoW delta < -threshold
    - Test 2: detectFailedSpike returns firing alert when failed ratio > threshold
    - Test 3: detectTicketSpike returns firing alert when WoW delta > threshold
    - Test 4: detectRunwayLow returns firing alert when avgBalance / dailyBurn < thresholdDays
    - Test 5: All detectors return null when metrics within thresholds
  </behavior>
  <action>
    Create AlertEvent model in prisma/schema.prisma:
    - id, type, status, windowLabel, severity, message, firedAt, resolvedAt, thresholdAtFiring, actualValue, createdAt
    
    Create migration prisma/migrations/20261101140000_phase13_alert_events/migration.sql
    
    Create lib/analytics/detect.ts with pure detection functions:
    - detectPaymentDrop(current: number, base: number, threshold: number): AlertPayload | null
    - detectFailedSpike(failed: number, total: number, threshold: number): AlertPayload | null
    - detectTicketSpike(current: number, base: number, threshold: number): AlertPayload | null
    - detectRunwayLow(avgBalance: number, dailyBurn: number, thresholdDays: number): AlertPayload | null
    
    Create lib/analytics/detect-service.ts with DB access:
    - loadAlertThresholds(): Promise<Thresholds>
    - detectAnomalies(): Promise<void> — main entry point called from cron
    - createAlertEvent(input): Promise<void> — creates AlertEvent + enqueues Notification
    
    Write tests/unit/anomaly-detect.test.ts covering all 4 detectors with edge cases.
  </action>
  <verify>
    <automated>cd /Users/alekseimikhalkin/Documents/bot-artemida && npx vitest run tests/unit/anomaly-detect.test.ts</automated>
    <fails_when>non-zero exit, or any test fails, or coverage < 80%</fails_when>
  </verify>
  <acceptance_criteria>
    - AlertEvent model with all required fields
    - 4 pure detector functions (payment_drop, failed_spike, ticket_spike, runway_low)
    - detect-service loads thresholds from Setting, creates AlertEvent rows
    - Unit tests pass for all detectors
  </acceptance_criteria>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Outbox enqueue + worker drain with quiet hours</name>
  <files>lib/outbox.ts, lib/worker.ts, lib/admin-notify.ts, tests/unit/alert-outbox.test.ts, tests/unit/quiet-hours.test.ts</files>
  <read_first>
    - lib/outbox.ts (existing enqueue patterns, Notification model)
    - lib/worker.ts (existing drain loops, claimNextNotification)
    - lib/admin-notify.ts (notifyAdminsNewTicket pattern)
    - lib/balance-alert.ts (existing balance alert enqueue pattern)
  </read_first>
  <behavior>
    - Test 1: enqueueAnomalyAlert creates Notification with correct dedupeKey
    - Test 2: Duplicate enqueue with same dedupeKey is skipped (skipDuplicates)
    - Test 3: isQuietHoursMSK returns true for 22:00–09:00 MSK
    - Test 4: getNextDeliveryTime returns 09:00 MSK when in quiet hours
    - Test 5: drainAnomalyAlerts respects daily DM limit (≤3/admin/day)
  </behavior>
  <action>
    Extend lib/outbox.ts:
    - Add ALERT_ANOMALY constant
    - Add enqueueAnomalyAlert(type, windowLabel, telegramIds) function
    
    Extend lib/worker.ts:
    - Add isQuietHoursMSK() helper
    - Add getNextDeliveryTime() helper
    - Add drainAnomalyAlerts(telegram) loop
    - Integrate drainAnomalyAlerts into main worker loop
    
    Extend lib/admin-notify.ts:
    - Add notifyAdminsAnomalyAlert(alertPayload) function
    - Query all administrator telegramIds, enqueue for each
    
    Write tests/unit/alert-outbox.test.ts — enqueue + dedupe
    Write tests/unit/quiet-hours.test.ts — quiet hours logic + deferral
  </action>
  <verify>
    <automated>cd /Users/alekseimikhalkin/Documents/bot-artemida && npx vitest run tests/unit/alert-outbox.test.ts tests/unit/quiet-hours.test.ts</automated>
    <fails_when>non-zero exit, or any test fails</fails_when>
  </verify>
  <acceptance_criteria>
    - ALERT_ANOMALY constant added to outbox
    - enqueueAnomalyAlert creates Notification with dedupeKey
    - Worker drains ALERT_ANOMALY jobs with quiet hours check
    - Daily DM limit enforced (≤3/admin/day)
    - Tests pass for enqueue, dedupe, quiet hours, deferral
  </acceptance_criteria>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Cron integration + auto-resolve</name>
  <files>app/api/cron/analytics/route.ts, tests/integration/alert-delivery.test.ts</files>
  <read_first>
    - app/api/cron/analytics/route.ts (existing cron structure)
    - lib/analytics/detect-service.ts (detectAnomalies entry point)
  </read_first>
  <behavior>
    - Test 1: Cron route calls detectAnomalies() after rollup
    - Test 2: Auto-resolve marks firing alerts resolved when metric < threshold
    - Test 3: E2E flow: cron → detect → enqueue → worker → Telegram DM
  </behavior>
  <action>
    Extend app/api/cron/analytics/route.ts:
    - Import detectAnomalies from lib/analytics/detect-service
    - Call detectAnomalies() after rollup, before response
    
    Add auto-resolve logic in detect-service.ts:
    - Query firing alerts from previous days
    - For each, check if current metric < threshold
    - If so, mark alert resolved (resolvedAt = now)
    
    Write tests/integration/alert-delivery.test.ts:
    - Mock cron POST request
    - Assert detectAnomalies called
    - Assert AlertEvent created
    - Assert Notification enqueued
    - Assert worker drains and sends Telegram DM
  </action>
  <verify>
    <automated>cd /Users/alekseimikhalkin/Documents/bot-artemida && npx vitest run tests/integration/alert-delivery.test.ts</automated>
    <fails_when>non-zero exit, or E2E flow fails</fails_when>
  </verify>
  <acceptance_criteria>
    - Cron route calls detectAnomalies() at 03:05 MSK
    - Auto-resolve logic marks alerts resolved when condition clears
    - E2E test passes (cron → detect → enqueue → deliver)
  </acceptance_criteria>
</task>

<task type="auto" tdd="true">
  <name>Task 4: Admin UI — alert history + mute toggle + test alert</name>
  <files>app/admin/alerts/page.tsx, components/admin/AlertTable.tsx, components/admin/AlertToggle.tsx, lib/i18n/messages/ru.ts, app/admin/layout.tsx</files>
  <read_first>
    - app/admin/analytics/page.tsx (existing admin page structure)
    - components/admin/MetricCard.tsx (existing admin component patterns)
    - lib/i18n/messages/ru.ts (admin.* i18n keys)
    - app/admin/layout.tsx (NAV_SECTIONS extension)
  </read_first>
  <behavior>
    - Test 1: AlertTable renders AlertEvent rows with correct columns
    - Test 2: Status filter shows firing/resolved/muted
    - Test 3: Type filter shows payment_drop/failed_spike/ticket_spike/runway_low
    - Test 4: AlertToggle mutes/unmutes alert type via Setting
    - Test 5: Test alert button sends [TEST] Telegram DM
  </behavior>
  <action>
    Create app/admin/alerts/page.tsx:
    - SSR page loading AlertEvent rows with filters
    - Status filter (firing/resolved/muted), type filter
    - AlertTable component for rendering
    - AlertToggle component for mute/unmute per type
    
    Create components/admin/AlertTable.tsx:
    - Table columns: type, status, windowLabel, firedAt, resolvedAt, severity, message
    - Row styling by status (firing=amber, resolved=green, muted=gray)
    
    Create components/admin/AlertToggle.tsx:
    - Toggle button per alert type (mute/unmute)
    - Updates Setting model with muted types
    
    Extend lib/i18n/messages/ru.ts:
    - admin.alerts.* keys (title, table columns, filters, toggle labels, test button)
    
    Extend app/admin/layout.tsx:
    - Add "alerts" to NAV_SECTIONS
    
    Add test alert endpoint:
    - app/api/admin/alerts/test/route.ts — sends [TEST] DM to calling admin
  </action>
  <verify>
    <automated>cd /Users/alekseimikhalkin/Documents/bot-artemida && npm run build</automated>
    <fails_when>build fails, or TypeScript errors in new files</fails_when>
  </verify>
  <acceptance_criteria>
    - /admin/alerts page renders alert history
    - AlertTable shows correct columns and filters
    - AlertToggle mutes/unmutes alert types
    - Test alert button sends [TEST] Telegram DM
    - i18n keys added for all UI text
    - Build succeeds with no TypeScript errors
  </acceptance_criteria>
</task>

</tasks>

### <threat_model>
## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-13-01 | Tampering | Alert spoofing | medium | mitigate | `requireRole('administrator')` on /admin/alerts page + API routes |
| T-13-02 | Tampering | Threshold manipulation | medium | mitigate | Admin-only Setting edit, audit via Setting.updatedAt |
| T-13-03 | Denial of Service | Alert spam (repeated triggers) | low | mitigate | Dedupe key (`type:windowLabel`) prevents duplicate enqueue |
| T-13-04 | Information Disclosure | Quiet hours bypass | low | mitigate | Worker enforces deferral at delivery time, not just UI toggle |
| T-13-05 | Elevation | Non-admin alert access | medium | mitigate | Role check on page + API, same as /admin/analytics |
</threat_model>

### <verification>
- `npx vitest run tests/unit/anomaly-detect.test.ts` — detection logic green
- `npx vitest run tests/unit/alert-outbox.test.ts` — enqueue + dedupe green
- `npx vitest run tests/unit/quiet-hours.test.ts` — deferral logic green
- `npx vitest run tests/integration/alert-delivery.test.ts` — E2E flow green
- `npm run build` — Next build succeeds
- `npx tsc --noEmit` — exit 0 (no type errors)
- Manual test: cron trigger → Telegram DM received within 1 minute
- Manual test: quiet hours deferral → alert delivered at 09:00 MSK
- Manual test: test alert button → [TEST] DM received

### <success_criteria>
- ALR-02: Payment drop + failed spike detection fires alerts via cron at 03:05 MSK
- ALR-03: Runway threshold alert fires when avgBalance/dailyBurn < thresholdDays
- ALR-04: Outbox/Telegram delivery to administrators with dedupe, quiet hours, daily limit
- Quiet hours 22:00–09:00 MSK enforced via deferral (nextAttemptAt), not suppression
- Daily DM limit ≤3 per admin enforced at delivery time
- Alert history UI at /admin/alerts with filters and mute/unmute toggle
- Test alert button sends real [TEST] Telegram DM
- Thresholds configurable in Setting model without deploy
- Zero new npm dependencies
- All unit + integration tests pass

### <artifacts_this_phase_produces>
- `prisma/schema.prisma` — AlertEvent model
- `prisma/migrations/20261101140000_phase13_alert_events/migration.sql`
- `lib/analytics/detect.ts` — pure detection functions
- `lib/analytics/detect-service.ts` — DB access + alert creation
- `app/api/cron/analytics/route.ts` — extended with detectAnomalies()
- `lib/outbox.ts` — ALERT_ANOMALY + enqueueAnomalyAlert()
- `lib/worker.ts` — drainAnomalyAlerts() + quiet hours
- `lib/admin-notify.ts` — notifyAdminsAnomalyAlert()
- `app/admin/alerts/page.tsx` — alert history page
- `components/admin/AlertTable.tsx` — table with filters
- `components/admin/AlertToggle.tsx` — mute/unmute toggle
- `lib/i18n/messages/ru.ts` — admin.alerts.* keys
- `tests/unit/anomaly-detect.test.ts` — detection tests
- `tests/unit/alert-outbox.test.ts` — outbox tests
- `tests/unit/quiet-hours.test.ts` — quiet hours tests
- `tests/integration/alert-delivery.test.ts` — E2E tests
- `app/api/admin/alerts/test/route.ts` — test alert endpoint
</artifacts_this_phase_produces>

<output>
Create `.planning/phases/13-anomaly-alerts/13-PLAN.md` (PLAN complete).
Commit PLAN.md and present Next Up (`/gsd-execute-phase 13`).
</output>
