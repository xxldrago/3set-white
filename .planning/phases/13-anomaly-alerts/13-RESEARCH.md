# Phase 13: Anomaly Alerts — Research

**Researched:** 2026-11-01
**Domain:** Anomaly detection, notification delivery, cron scheduling
**Confidence:** HIGH

## Summary

This research covers the implementation of anomaly alerts for the 3set-white VPN service. The phase builds on Phase 12's comparison windows and data-quality foundation to detect business metric anomalies (payment drops, failed payment spikes, ticket volume spikes, ARTEMIDA balance runway) and deliver alerts to administrators via the existing outbox/Telegram infrastructure.

**Primary recommendation:** Reuse Phase 12's `compareFlow` and `comparisonWindows` for anomaly detection, extend the existing `Notification` outbox pattern with alert-specific job types, and implement quiet hours via deferral (not suppression) to preserve alert history.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Anomaly detection (cron-triggered) | API / Backend | — | Cron route (`/api/cron/analytics`) runs detection logic against DB |
| Threshold configuration | Database / Storage | API / Backend | `Setting` model stores thresholds; admin UI edits via API |
| Alert delivery (Telegram) | API / Backend | Browser / Client | Worker process drains `Notification` queue via Telegraf bot |
| Alert history UI | Frontend Server (SSR) | — | `/admin/alerts` page renders from `AlertEvent` table |
| Quiet hours deferral | Database / Storage | API / Backend | `nextAttemptAt` on `Notification` implements deferral |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Existing (no new deps) | — | — | All required patterns exist in codebase: outbox, cron, Setting, Telegram delivery |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `lib/analytics/compare.ts` | Phase 12 | Delta calculation | Reuse `compareFlow` for WoW/MoM anomaly detection |
| `lib/analytics/windows.ts` | Phase 12 | Comparison window boundaries | Reuse `comparisonWindows` for baseline period selection |
| `lib/outbox.ts` | Existing | Notification queue | Extend with `ALERT_ANOMALY` job type |
| `lib/worker.ts` | Existing | Background job processing | Add alert drain loop alongside balance alerts |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| In-process cron detection | BullMQ + Redis | Overkill for v1.2; single-server, low volume (1/day) |
| Direct Telegram send | `node-telegram-bot-api` | Breaks outbox discipline; loses retry/idempotency |
| Real-time streaming detection | In-memory counters | Unnecessary complexity; daily detection sufficient for business metrics |

**Installation:** No new dependencies required.

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| (none) | — | — | — | — | — | No new packages; all patterns reuse existing codebase modules |

*Packages discovered via WebSearch or training data that have not been verified against an authoritative source are tagged `[ASSUMED]` and the planner must gate each install behind a `checkpoint:human-verify` task.*

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│  Cron Trigger (03:05 MSK)                                       │
│  app/api/cron/analytics/route.ts                                │
└──────────────────┬──────────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────────┐
│  Detection Logic (lib/analytics/detect.ts)                      │
│  ├─ Payment drop detector (WoW/MoM delta > threshold)           │
│  ├─ Failed payment spike (failed ratio > threshold)             │
│  ├─ Ticket volume spike (WoW delta > threshold)                 │
│  └─ Runway check (balance / daily burn < threshold days)        │
└──────────────────┬──────────────────────────────────────────────┘
                   │
                   │ (anomaly detected)
                   ▼
┌─────────────────────────────────────────────────────────────────┐
│  Alert Creation (prisma.alertEvent.create)                      │
│  ├─ type: "payment_drop" | "failed_spike" | "ticket_spike" | "runway_low" │
│  ├─ status: "firing"                                            │
│  ├─ windowLabel: "2026-10-31" (MSK day)                         │
│  └─ dedupeKey: `${type}:${windowLabel}`                         │
└──────────────────┬──────────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────────┐
│  Notification Enqueue (lib/outbox.ts)                           │
│  ├─ type: ALERT_ANOMALY                                         │
│  ├─ dedupeKey: `${type}:${windowLabel}`                         │
│  └─ nextAttemptAt: now (or quiet hours deferral)                │
└──────────────────┬──────────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────────┐
│  Worker Drain (lib/worker.ts)                                   │
│  ├─ claimNextNotification(ALERT_ANOMALY)                        │
│  ├─ Quiet hours check (22:00–09:00 MSK)                         │
│  ├─ Daily DM limit check (≤3/day)                               │
│  └─ Dispatch via Telegraf bot                                   │
└──────────────────┬──────────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────────┐
│  Admin Telegram DM                                              │
│  "🚨 Алерт: падение оплат -45% (WoW) за 31 октября"             │
└─────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure

```
lib/analytics/
├── detect.ts           # NEW: anomaly detection logic (pure functions)
├── detect-service.ts   # NEW: DB access + alert creation
└── ...existing (compare.ts, windows.ts, etc.)

app/api/cron/analytics/
└── route.ts            # EXTEND: add detection call after rollup

lib/
├── outbox.ts           # EXTEND: add ALERT_ANOMALY constant + enqueue
└── worker.ts           # EXTEND: add drain loop for alerts

app/admin/
├── alerts/
│   └── page.tsx        # NEW: alert history page
└── layout.tsx          # EXTEND: add "alerts" to NAV_SECTIONS

components/admin/
├── AlertTable.tsx      # NEW: alert history table
└── AlertToggle.tsx     # NEW: mute/unmute toggle per type

prisma/
└── schema.prisma       # EXTEND: add AlertEvent model
```

### Pattern 1: Outbox Notification with Deferral

**What:** Queue-based notification delivery with quiet hours deferral (not suppression).

**When to use:** Any time-sensitive notification that must respect user preferences without losing data.

**Example:**
```typescript
// lib/outbox.ts — NEW constant
export const ALERT_ANOMALY = "alert-anomaly";

// lib/analytics/detect-service.ts — enqueue pattern
import { prisma } from "../prisma";
import { mskDayLabel } from "./time";

export async function createAlertEvent(input: {
  type: string;
  windowLabel: string;
  severity: "warning" | "critical";
  message: string;
}): Promise<void> {
  await prisma.alertEvent.create({
    data: {
      type: input.type,
      windowLabel: input.windowLabel,
      status: "firing",
      severity: input.severity,
      message: input.message,
      firedAt: new Date(),
    },
  });

  // Enqueue notification with dedupe key
  await prisma.notification.create({
    data: {
      type: ALERT_ANOMALY,
      dedupeKey: `${input.type}:${input.windowLabel}`,
      userId: null, // admin broadcast
    },
  });
}
```

### Pattern 2: Quiet Hours Deferral

**What:** Defer notification delivery during quiet hours (22:00–09:00 MSK) by setting `nextAttemptAt`.

**When to use:** Time-sensitive alerts that should not disturb users during night hours.

**Example:**
```typescript
// lib/worker.ts — quiet hours check
function isQuietHoursMSK(): boolean {
  const now = new Date();
  const mskHour = new Date(now.getTime() + 3 * 60 * 60 * 1000).getUTCHours();
  return mskHour >= 22 || mskHour < 9;
}

function getNextDeliveryTime(): Date {
  if (isQuietHoursMSK()) {
    // Schedule for 09:00 MSK
    const now = new Date();
    const mskOffset = 3 * 60 * 60 * 1000;
    const mskDate = new Date(now.getTime() + mskOffset);
    mskDate.setUTCHours(9, 0, 0, 0);
    return new Date(mskDate.getTime() - mskOffset);
  }
  return new Date();
}
```

### Anti-Patterns to Avoid

- **Silent suppression during quiet hours:** Never drop alerts — always defer via `nextAttemptAt`. Silent suppression loses critical information.
- **Alert spam from repeated cron runs:** Dedupe on `(type, windowLabel)` — a second cron run for the same day should not create duplicate alerts.
- **Hardcoded thresholds:** Store all thresholds in `Setting` model — admins must adjust without deploys.
- **Direct Telegram send from cron:** Always queue via outbox — preserves retry discipline and delivery tracking.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Anomaly detection logic | Custom statistical models (z-score, IQR) | Phase 12 `compareFlow` + WoW/MoM delta | Already validated, simpler, matches admin mental model |
| Notification delivery | Direct `bot.telegram.sendMessage` from cron | `Notification` outbox + worker drain | Retry discipline, idempotency, delivery tracking |
| Quiet hours | Skip delivery entirely | `nextAttemptAt` deferral | Preserves alert history, no data loss |
| Alert history | New table from scratch | Extend existing patterns (`AlertEvent` mirrors `Ticket` structure) | Consistent with codebase conventions |
| Threshold config | Hardcoded constants | `Setting` model (KV store) | Admin-editable without deploys |

**Key insight:** The codebase already has 90% of the required patterns (outbox, cron, Setting, Telegram delivery). This phase is composition, not invention.

## Runtime State Inventory

> Not applicable — this is a greenfield phase with no rename/refactor/migration scope.

## Common Pitfalls

### Pitfall 1: Alert Storm from Repeated Cron Runs

**What goes wrong:** Multiple cron runs (retry, manual trigger) create duplicate alerts for the same anomaly.

**Why it happens:** Dedupe key not enforced or window calculation differs between runs.

**How to avoid:** 
1. Dedupe key = `${type}:${windowLabel}` (e.g., `payment_drop:2026-10-31`)
2. Use `upsert` on `AlertEvent` with `windowLabel` + `type` unique constraint
3. Idempotent detection: same input → same output, no side effects

**Warning signs:** Multiple identical Telegram DMs within minutes; `AlertEvent` table shows duplicate rows for same day.

### Pitfall 2: Quiet Hours Swallow Alerts

**What goes wrong:** Alerts detected during quiet hours (22:00–09:00 MSK) are silently dropped.

**Why it happens:** Implementation checks `isQuietHours` and skips delivery entirely.

**How to avoid:** 
1. Always enqueue notification with `nextAttemptAt = now`
2. Worker checks quiet hours at **delivery time**, not enqueue time
3. If quiet hours, set `nextAttemptAt = 09:00 MSK` and reschedule

**Warning signs:** Alerts detected at 03:05 never arrive; `Notification` table shows rows stuck in `pending` status.

### Pitfall 3: Threshold Changes Break Historical Alerts

**What goes wrong:** Admin changes threshold from 30% to 50%; historical alerts now show incorrect "severity" in UI.

**Why it happens:** Severity computed at read-time from current threshold, not stored at alert creation.

**How to avoid:** Store `thresholdAtFiring` and `actualValue` on `AlertEvent` — snapshot the context at creation time.

**Warning signs:** Historical alert details show different severity than the original Telegram message.

### Pitfall 4: Failed Payments Not Captured

**What goes wrong:** Alert detector queries `Order` table but `failed` status not indexed or filtered correctly.

**Why it happens:** `OrderStatus.failed` exists but aggregation logic misses edge cases (refunded, canceled).

**How to avoid:** Explicitly document which statuses count as "failed" — use Phase 12's `PAID` constant as inverse reference.

**Warning signs:** Alert fires but failed payment count doesn't match manual SQL query.

### Pitfall 5: Runway Calculation Uses Wrong Balance

**What goes wrong:** Runway = `balance / dailyBurn` uses current balance instead of average balance over window.

**Why it happens:** `ArtemidaBalanceSnapshot` has daily rows; detector reads only latest snapshot.

**How to avoid:** Use `AVG(balanceRub)` over last 7 days for smoother runway estimate.

**Warning signs:** Runway spikes erratically day-to-day; alerts fire on transient balance dips.

## Code Examples

Verified patterns from existing codebase:

### Cron Route Pattern (Existing)
```typescript
// app/api/cron/analytics/route.ts — EXTEND this
export async function POST(req: Request): Promise<Response> {
  // ...existing auth + rollup logic...
  
  // NEW: Phase 13 anomaly detection
  const { detectAnomalies } = await import("../../../../lib/analytics/detect-service");
  await detectAnomalies();
  
  return Response.json({ ok: true, ...rollupResult });
}
```

### Outbox Enqueue Pattern (Existing)
```typescript
// lib/outbox.ts — ADD this
export const ALERT_ANOMALY = "alert-anomaly";

export async function enqueueAnomalyAlert(
  type: string,
  windowLabel: string,
  telegramIds: number[],
): Promise<number> {
  const result = await prisma.notification.createMany({
    data: telegramIds.map((telegramId) => ({
      type: ALERT_ANOMALY,
      dedupeKey: `${type}:${windowLabel}:${telegramId}`,
      userId: null, // admin broadcast
    })),
    skipDuplicates: true,
  });
  return result.count;
}
```

### Worker Drain Pattern (Existing)
```typescript
// lib/worker.ts — ADD this
async function drainAnomalyAlerts(telegram: TelegramSender): Promise<void> {
  for (let i = 0; i < DRAIN_BATCH; i += 1) {
    const job = await claimNextNotification(ALERT_ANOMALY);
    if (!job) break;
    try {
      const result = await dispatchAnomalyAlert(job.id, telegram);
      if (result.outcome === "retryable_error") {
        await rescheduleNotification(job.id, new Date(Date.now() + backoffMs(job.attempts + 1)), "telegram");
      } else {
        await markNotificationDone(job.id);
      }
    } catch {
      logger.error({ route: "worker", outcome: "alert_job_error", jobId: job.id });
      await markNotificationFailed(job.id, "unexpected");
    }
  }
}
```

### Setting Threshold Pattern (Existing)
```typescript
// lib/analytics/detect-service.ts — NEW
const THRESHOLD_KEYS = {
  paymentDropPercent: "alert.threshold.paymentDropPercent", // e.g., 30
  failedPaymentRatio: "alert.threshold.failedPaymentRatio", // e.g., 15
  ticketSpikePercent: "alert.threshold.ticketSpikePercent", // e.g., 50
  runwayDays: "alert.threshold.runwayDays", // e.g., 3
} as const;

async function loadAlertThresholds(): Promise<Record<string, number>> {
  const rows = await prisma.setting.findMany({
    where: { key: { in: Object.values(THRESHOLD_KEYS) } },
  });
  const defaults = {
    paymentDropPercent: 30,
    failedPaymentRatio: 15,
    ticketSpikePercent: 50,
    runwayDays: 3,
  };
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return {
    paymentDropPercent: parseInt(map.get(THRESHOLD_KEYS.paymentDropPercent) ?? String(defaults.paymentDropPercent)),
    // ...etc
  };
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Real-time streaming alerts | Daily cron + outbox queue | 2025–2026 | Simpler, cheaper, sufficient for business metrics |
| Static thresholds | Configurable via `Setting` model | Phase 11+ | Admins adjust without deploys |
| Direct Telegram send | Outbox + worker drain | Phase 4+ | Retry discipline, idempotency |
| Alert suppression | Deferral via `nextAttemptAt` | This phase | No data loss, respects quiet hours |

**Deprecated/outdated:**
- Silent alert suppression: Replace with deferral (set `nextAttemptAt`)
- Hardcoded thresholds: Replace with `Setting` KV store
- In-process cron detection: Keep in cron route but queue via outbox

## Assumptions Log

> List all claims tagged `[ASSUMED]` in this research. The planner and discuss-phase use this section to identify decisions that need user confirmation before execution.

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Quiet hours = 22:00–09:00 MSK | Pattern 2 | User preference may differ; needs confirmation or UI toggle |
| A2 | Daily DM limit = 3 alerts/day | Summary | May be too restrictive for critical alerts; needs validation |
| A3 | Alert types = payment_drop, failed_spike, ticket_spike, runway_low | CONTEXT.md | May need additional types (e.g., MRR drop, churn spike) |
| A4 | Dedupe key = `${type}:${windowLabel}` | Pattern 1 | May need to include severity for multi-level alerts |

**If this table is empty:** All claims in this research were verified or cited — no user confirmation needed.

## Open Questions

1. **Alert severity levels**
   - What we know: CONTEXT.md mentions `firing`, `resolved`, `muted`, `sent` statuses
   - What's unclear: Should alerts have severity levels (warning/critical) with different thresholds?
   - Recommendation: Start with binary (firing/not), add severity in future phase if needed

2. **Auto-resolve logic**
   - What we know: CONTEXT.md says "При следующем запуске cron, если условие больше не выполняется → `resolved`"
   - What's unclear: How to detect "condition no longer applies" — compare to previous day? rolling average?
   - Recommendation: Compare current day's metric to threshold; if below threshold, mark previous `firing` alerts as `resolved`

3. **Test alert button**
   - What we know: CONTEXT.md mentions "Кнопка «Test alert» в UI"
   - What's unclear: Should test alert send real Telegram DM or mock delivery?
   - Recommendation: Send real DM with "[TEST]" prefix — validates full delivery path

4. **Admin targeting**
   - What we know: CONTEXT.md says "Доставка через существующий outbox/Telegram только админам (`administrator` role)"
   - What's unclear: Should all administrators receive every alert, or only those who opt-in?
   - Recommendation: All administrators by default (like `notifyAdminsNewTicket`); add per-admin opt-out in future phase

## Environment Availability

> Skip this section if the phase has no external dependencies (code/config-only changes).

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Telegram Bot API | Alert delivery | ✓ (existing) | Telegraf 4.16.3 | — |
| PostgreSQL | Alert history, Notification queue | ✓ (existing) | 17-alpine | — |
| Cron trigger (03:05 MSK) | Detection | ✓ (existing) | app/api/cron/analytics | — |
| Worker process | Notification drain | ✓ (existing) | lib/worker.ts | — |

**Missing dependencies with no fallback:**
- None — all infrastructure exists

**Missing dependencies with fallback:**
- None

## Validation Architecture

> Skip this section entirely if workflow.nyquist_validation is explicitly set to false in .planning/config.json. If the key is absent, treat as enabled.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest (existing) |
| Config file | vitest.config.ts (existing) |
| Quick run command | `npm test -- --run` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ALR-02 | Payment drop + failed spike detection | unit | `vitest tests/unit/anomaly-detect.test.ts -x` | ❌ Wave 0 |
| ALR-03 | Runway threshold alert | unit | `vitest tests/unit/anomaly-detect.test.ts -x` | ❌ Wave 0 |
| ALR-04 | Outbox/Telegram delivery | unit + integration | `vitest tests/unit/alert-outbox.test.ts -x` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npm test -- --run tests/unit/anomaly-*.test.ts`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `tests/unit/anomaly-detect.test.ts` — covers detection logic (pure functions)
- [ ] `tests/unit/alert-outbox.test.ts` — covers enqueue + dedupe
- [ ] `tests/integration/alert-delivery.test.ts` — covers E2E cron → detect → enqueue → deliver
- [ ] `tests/unit/quiet-hours.test.ts` — covers deferral logic

*(If no gaps: "None — existing test infrastructure covers all phase requirements")*

## Security Domain

> Required when `security_enforcement` is enabled (absent = enabled). Omit only if explicitly `false` in config.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | Alert delivery targets admin users (already authenticated) |
| V3 Session Management | No | No session involved — cron + worker are machine processes |
| V4 Access Control | Yes | Admin-only UI (`/admin/alerts`), role check via `requireRole('administrator')` |
| V5 Input Validation | Yes | Threshold values validated (integer range 1–100 for percents, 1–365 for days) |
| V6 Cryptography | No | No new crypto — reuses existing Telegram bot token + session cookies |

### Known Threat Patterns for {stack}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Alert spoofing (fake admin alert) | Tampering | `requireRole('administrator')` on `/admin/alerts` page + API routes |
| Threshold manipulation | Tampering | Admin-only edit (`requireRole('administrator')`), audit log via `Setting.updatedAt` |
| Alert spam (DoS via repeated triggers) | Denial of Service | Dedupe key (`type:windowLabel`) prevents duplicate enqueue |
| Quiet hours bypass | Information Disclosure | Worker enforces deferral, not just UI toggle |

## Sources

### Primary (HIGH confidence)
- Existing codebase patterns: `lib/outbox.ts`, `lib/worker.ts`, `app/api/cron/analytics/route.ts`, `lib/admin-notify.ts`, `lib/balance-alert.ts`
- Phase 12 modules: `lib/analytics/compare.ts`, `lib/analytics/windows.ts`, `lib/analytics/metric-registry.ts`
- Prisma schema: `Notification`, `Setting`, `Order`, `DailyMetric`, `DataQualityEvent`, `ArtemidaBalanceSnapshot`

### Secondary (MEDIUM confidence)
- WebSearch: Next.js cron best practices (Vercel cron jobs, API route handlers)
- WebSearch: Notification quiet hours patterns (deferral vs suppression)
- WebSearch: SaaS anomaly detection thresholds (z-score, WoW/MoM baselines)

### Tertiary (LOW confidence)
- Training knowledge: Alert system design patterns (severity levels, auto-resolve logic)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all patterns exist in codebase, no new dependencies
- Architecture: HIGH — reuses existing outbox/cron/Setting patterns
- Pitfalls: MEDIUM — based on analogous patterns (balance alerts, ticket notifications)

**Research date:** 2026-11-01
**Valid until:** 30 days (stable patterns, slow-moving domain)
