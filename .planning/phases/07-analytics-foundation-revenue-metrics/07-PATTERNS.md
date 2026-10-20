# Phase 7: Analytics Foundation & Revenue Metrics — Pattern Map

**Mapped:** 2026-10-20
**Files analyzed:** 26 (13 new + 10 modified + 3 test-first, tests count separately)
**Analogs found:** 25 / 26 (only `lib/analytics/time.ts`'s MSK helpers have no direct precedent — spec'd prescriptively in RESEARCH.md Pattern 1)

All analog paths below are git-TRACKED source (verified `git ls-files` — none are mirror/gitignored paths).

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `prisma/schema.prisma` (modify) | model | config | `prisma/schema.prisma` (Order, KeyCache, TicketCompensation) | exact (self) |
| `prisma/migrations/<ts>_analytics_foundation/migration.sql` | migration | batch | `prisma/migrations/20261019234438_ticket_unread_for_admin/migration.sql` | exact |
| `lib/analytics/time.ts` | utility | transform (pure) | no direct analog; pure-module shape from `lib/prisma-errors.ts` | partial (RESEARCH Pattern 1 is prescriptive) |
| `lib/analytics/series.ts` | service (pure) | transform | `lib/revenue.ts` (`cashOf` + aggregation loop) | role-match |
| `lib/analytics/rollup.ts` | service | batch | `lib/revenue.ts` (loadRevenue reads) + `lib/promo.ts:113` (`$queryRaw` tag) | role-match |
| `lib/analytics/mrr.ts` | service (pure) | transform | `lib/revenue.ts` (money derivation, PAID statuses) | role-match |
| `lib/analytics/waterfall.ts` | service (pure) | transform | `lib/revenue.ts` | partial |
| `lib/analytics/service.ts` | service | request-response | `lib/revenue.ts` (`loadRevenue`) | role-match |
| `app/api/cron/analytics/route.ts` | route | request-response | `app/api/cron/reconcile/route.ts` | exact |
| `app/admin/analytics/page.tsx` | page | request-response | `app/admin/page.tsx` | exact |
| `components/admin/AnalyticsKpi.tsx` | component (server) | request-response | `components/admin/RevenuePanel.tsx` | exact |
| `components/admin/MrrWaterfall.tsx` | component (server) | request-response | `components/admin/FunnelCharts.tsx` (SVG math, minus fetch) | role-match |
| `components/admin/MrrSparkline.tsx` | component (server) | request-response | `components/admin/FunnelCharts.tsx` (polyline) | role-match |
| `scripts/backfill-analytics.ts` | script | batch | `prisma/seed.ts` | exact |
| `lib/worker.ts` (modify) | service | event-driven | `lib/worker.ts` (`processFulfillOrder`) + `lib/admin-stats.ts:41-56` | exact (self) |
| `lib/orders-service.ts` (modify) | service | CRUD | `lib/orders-service.ts` (`transitionOrder`, `markProvisioned`) | exact (self) |
| `lib/admin-service.ts` (modify) | service | CRUD | `lib/admin-service.ts` (`loadAdminPayments`) | exact (self) |
| `lib/admin-auth.ts` (modify) | config | config | `lib/admin-auth.ts` (`AdminSection`, `MATRIX`) | exact (self) |
| `app/admin/layout.tsx` (modify) | component | config | `app/admin/layout.tsx` (`NAV_SECTIONS`) | exact (self) |
| `components/admin/AdminNav.tsx` (modify) | component | config | `components/admin/AdminNav.tsx` (`NavSection`, `ITEMS`, `itemLabel`) | exact (self) |
| `lib/i18n/messages/ru.ts` (modify) | config | config | `lib/i18n/messages/ru.ts` (`admin` block) | exact (self) |
| `app/admin/page.tsx` (modify) | page | request-response | `app/admin/page.tsx` (teaser insertion point) | exact (self) |
| `Dockerfile` (modify) | config | config | `Dockerfile` (`COPY` section, lines 44-49) | exact (self) |
| `docs/DEPLOY.md` (modify) | config | config | `docs/DEPLOY.md` §7 (cron entry) | exact (self) |
| `tests/unit/analytics-time|series|mrr|waterfall|metrics.test.ts` (new ×5) | test | pure | `tests/unit/i18n.test.ts` (no-DB harness) | role-match |
| `tests/unit/analytics-rollup|backfill|provider-cost.test.ts` (new ×3) | test | DB-backed | `tests/unit/outbox-worker.test.ts` | exact |
| `tests/unit/analytics-cron-route.test.ts` (new) | test | DB-backed | `tests/unit/cron-reconcile-route.test.ts` | exact |
| `tests/unit/admin-analytics-page.test.ts` (new) | test | DB-backed + source-contract | `tests/unit/admin-route.test.ts` | exact |

---

## Pattern Assignments

### `prisma/schema.prisma` + migration (model)

**Analog:** `prisma/schema.prisma:168-196` (Order), `prisma/migrations/20261019234438_ticket_unread_for_admin/migration.sql`

**Additive-only migration precedent** (`prisma/migrations/20261019234438_ticket_unread_for_admin/migration.sql`, full file):
```sql
-- AlterTable
ALTER TABLE "tickets" ADD COLUMN     "unread_for_admin" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "tickets_unread_for_admin_last_message_at_idx" ON "tickets"("unread_for_admin", "last_message_at");
```

**Field to add onto Order** (after line 190, `balanceUsed`): `providerCost Int? @map("provider_cost")` — nullable, no default, purely additive (safe on live DB). Do NOT default 0: D-08 requires null to mean "pre-implementation order".

**Key schema facts the analytics models depend on (do not change):**
- `Order.keyId` is `String?` (line 173) and is NULL for `kind='new'` until `markProvisioned` writes `provisionedKeyId` (line 182) → MRR join must use `COALESCE(key_id, provisioned_key_id)`.
- `Order.days` is `Int?` (line 174) and is NULL for every `kind='upgrade'` (route passes `days: null`) → upgrade MRR uses `cash / max(1, monthsRemaining)`, never `/(days/30)`.
- `Order.finalAmount` (189) / `balanceUsed` (190) are always set; `paidAt` (181) is set by `applyConfirmedPayment` at claim time.
- `User` has **no** `blocked`/`disabled`/`deletedAt` field (schema verified) → ARPU denominator is simply `prisma.user.count()`, documented as D-05 no-op.
- `TicketCompensation.days` is `Int` (line 314) — the goodwill-days source; referral grants store no day count (Open Question 1 → add `WalletTx.days Int?` if the planner accepts the recommendation).

**Landmines:** `day DateTime @id @db.Date` — every write must pass `mskDateKey()` (UTC midnight), never a MSK-instant; every raw-SQL param must be a `'YYYY-MM-DD'` string cast `$1::date`.

---

### `lib/analytics/time.ts` (utility, pure)

**Analog:** none exact. Module shape + "small pure lib, no Prisma import" convention from `lib/prisma-errors.ts` (48 lines, exported predicate functions, no side effects).

**RESEARCH.md Pattern 1 is the prescriptive source — copy verbatim, then unit-test:**
```ts
// lib/analytics/time.ts
export const MSK_OFFSET_MS = 3 * 60 * 60 * 1000; // Europe/Moscow, +03:00 since 2014-10-26

/** `2026-10-19T21:00Z` → "2026-10-20" (the Moscow calendar day of that instant). */
export function mskDayLabel(at: Date): string {
  return new Date(at.getTime() + MSK_OFFSET_MS).toISOString().slice(0, 10);
}

/** "2026-10-20" → `2026-10-19T21:00:00Z` — an INSTANT. Use for `timestamp` windows only. */
export function mskDayStartInstant(label: string): Date {
  return new Date(Date.parse(`${label}T00:00:00.000Z`) - MSK_OFFSET_MS);
}

/** "2026-10-20" → `2026-10-20T00:00:00Z` — a DATE KEY. Use only for `@db.Date` params. */
export function mskDateKey(label: string): Date {
  return new Date(`${label}T00:00:00.000Z`);
}

/** UTC wall-clock literal for a `timestamp(3)` column — session-TZ independent. */
export function pgTimestamp(instant: Date): string {
  return instant.toISOString().slice(0, 19).replace('T', ' '); // "2026-10-19 21:00:00"
}
```

**THE distribution landmine (do not collapse):** `mskDayStartInstant` and `mskDateKey` differ by one day; the adapter serializes JS `Date` params with UTC components → passing an MSK-start instant into a `date` column silently stores the *previous* day (verified empirically). Never let Postgres compute "today" (`CURRENT_DATE`/`date_trunc` — session TZ is `Asia/Vladivostok` locally, `UTC` in Docker, different buckets for the same data).

**Do not copy** `lib/referral-stats.ts:114-119` (`bucketStart` via local `setHours(0,0,0,0)`) or `components/admin/FunnelCharts.tsx:40-43` (`isoDay` via UTC) — both are non-MSK and out of scope to migrate.

---

### `lib/analytics/series.ts` (service, pure — no Prisma import)

**Analog:** `lib/revenue.ts` — `cashOf` (lines 24-26) and the in-memory aggregation loop (lines 36-52); day-bucketing skeleton from RESEARCH Code Examples.

**Money definition — copy exactly (D-02 mandates consistency with the existing dashboard):**
```ts
// lib/revenue.ts:10, 24-26
const PAID = ["paid", "provisioning", "provisioned"] as const;

function cashOf(row: { finalAmount: number; balanceUsed: number }): number {
  return Math.max(0, row.finalAmount - row.balanceUsed);
}
```

**Bucketing loop (RESEARCH Code Examples — matches existing Map-aggregation style):**
```ts
const buckets = new Map<string, DailyAggregate>();
for (const o of rows) {
  if (!o.paidAt) continue;
  const day = mskDayLabel(o.paidAt);          // instant → MSK label
  const b = buckets.get(day) ?? emptyAggregate(day);
  b.paidOrders += 1;
  b.paidCashRub += Math.max(0, o.finalAmount - o.balanceUsed);   // lib/revenue.ts cashOf
  if (o.kind === 'new') b.newOrders += 1;
  else if (o.kind === 'renew') b.renewOrders += 1;
  else b.upgradeOrders += 1;
  if (o.providerCost !== null) { b.providerCostRub += o.providerCost; b.providerCostOrders += 1; }
  buckets.set(day, b);
}
```

**Harness contract:** export `interface DailyAggregate` + `buildDailySeries(orders, users, goodwill, fromDay, toDay)` exactly as RESEARCH.md Pattern 3 — cron and backfill must call the SAME function so "метрики за любой прошлый день совпадают с ручной сверкой" is a property of the design.

---

### `lib/analytics/rollup.ts` (service, batch)

**Analog:** `lib/revenue.ts` (typed windowed read, lines 28-34) for the load; `lib/promo.ts:113` for the tagged raw-query precedent; RESEARCH Pattern 2 for the upsert SQL.

**Typed-window read (RESEARCH Code Examples — safe for `timestamp(3)`):**
```ts
const from = mskDayStartInstant(fromDay);
const to = mskDayStartInstant(nextDayLabel(toDay));
const rows = await prisma.order.findMany({
  where: { status: { in: ['paid', 'provisioning', 'provisioned'] },
           paidAt: { gte: from, lt: to } },
  select: { id: true, userId: true, kind: true, days: true, devices: true,
            finalAmount: true, balanceUsed: true, providerCost: true,
            keyId: true, provisionedKeyId: true, paidAt: true, status: true },
});
```

**Absolute-value upsert — `$executeRaw` with `$1::date` as a STRING (never a JS Date):**
```sql
INSERT INTO daily_metrics (
  day, paid_orders, paid_cash_rub, new_orders, renew_orders, upgrade_orders,
  provider_cost_rub, provider_cost_orders, active_keys, new_users,
  goodwill_days, computed_at
)
VALUES ($1::date, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())
ON CONFLICT (day) DO UPDATE SET
  paid_orders         = EXCLUDED.paid_orders,
  ...
  computed_at         = now()
```

**Verified raw-SQL landmines (RESEARCH):**
- `SET col = EXCLUDED.col` for EVERY column — incremental `+ EXCLUDED` double-counts under concurrent cron+backfill (verified: 12 concurrent same-key upserts, 0 conflicts, absolute last-writer-wins).
- Cast every `count(*)`/`sum(...)` to `::int` — `count(*)` returns BigInt (breaks RSC serialization), `sum()` returns `null` on empty.
- `$executeRaw*` with `RETURNING` returns the affected **count**, not rows — use `$queryRaw` when rows are needed.
- Multi-row `unnest(...)` upserts work but days must be deduped first (PG `21000` on a repeated key in one statement).
- Never cast `regclass` in a raw query through `@prisma/adapter-pg` (throws `UnsupportedNativeDataType`).
- **Re-roll window:** recompute last 7 MSK days (not just yesterday) — a 23:50 order provisioned at 00:10 lands `providerCost` after the run (Pitfall 9); absolute upsert makes re-roll free.
- **Balance snapshot:** `ON CONFLICT (day) DO NOTHING` (yesterday wins, never silently overwrite an earlier reading); `getBalance()` failure → `logger.warn`, never fails the rollup; `day = mskDateKey(yesterday)`.
- Module comment must note the cash-attribution caveat: a lost callback recovered by hourly reconcile shifts that order's `paidAt` forward (inherent; document, don't "fix").

---

### `lib/analytics/mrr.ts` + `lib/analytics/waterfall.ts` (pure derivation)

**Analog:** `lib/revenue.ts` (money definition, PAID statuses); `lib/artemida.ts` `deriveUpgradeQuote` for the upgrade denominator.

**The two schema facts forcing the model (quote in code comments):**
1. `key_ref = COALESCE(key_id, provisioned_key_id)` — strict `Order.keyId` join silently drops every new subscription (Pitfall 3).
2. Upgrades: `days` is NULL → contribute `cash(u) / max(1, (termEnd - u.paidAt) / 30 days)` — reuse the SAME rule already in the codebase (`lib/artemida.ts:259`):
```ts
// lib/artemida.ts:258-259 (inside deriveUpgradeQuote)
const months = Math.max(1, remainingDays / 30);
```

**Per-key term chain semantics (A3):** renews extend the existing expiry, they never restart it — `cursor = max(cursor ?? op.paidAt, op.paidAt)` then `cursor + op.days`. A key is active at `t` iff `t < termEnd`; MRR of a key = base-term cash/(days/30) + Σ upgrade deltas over the months they cover.

**Waterfall (RESEARCH, ANL-02):** month-end per-key `mrr(key, endOfMonth(m))` snapshots; classify `new` (0→>0), `expansion` (>0→larger), `contraction` (>0→smaller but >0), `churned` (>0→0). **Reconciliation identity as a test assertion, not a comment:**
```ts
// tests/unit/analytics-waterfall.test.ts (RESEARCH Code Examples)
it('waterfall components reconcile to the MRR delta for every month', () => {
  const months = sampleMonths();               // e.g. 2026-06 … 2026-10
  for (let i = 1; i < months.length; i++) {
    const w = waterfallFor(months[i], orders);
    const delta = totalMrrAt(endOfMonth(months[i])) - totalMrrAt(endOfMonth(months[i - 1]));
    expect(w.new + w.expansion - w.contraction - w.churned).toBeCloseTo(delta, 6);
  }
});
```
**Comment landmine:** no `downgrade` kind exists — any observed contraction is pricing/promo-driven (shorter terms, promo discounts, balance-covered renewals with `cash = 0`). Say so in the module comment so nobody searches for a missing order type.

**ARPU/ARPPU (RESEARCH):**
- ARPU denominator = `prisma.user.count()` (no blocked flag exists — document the D-05 no-op).
- ARPPU denominator = `COUNT(DISTINCT user_id)` over the paid-order set.
- Render `—` when denominator is 0, never `0 ₽`.

---

### `lib/analytics/service.ts` (service, request-response)

**Analog:** `lib/revenue.ts` `loadRevenue(periodDays)` — pure DB-read module consumed by an admin server component, degradation handled in the component.

**Pattern to copy:** typed period param `(7 | 30 | 90)`, `prisma.*` reads via the shared `prisma` singleton (`import { prisma } from "./prisma"`), return a plain serializable object (no BigInt, no raw lib/artemida types — they carry provider fields). Live "today" comes from a live query, everything else from `daily_metrics` (D-12). Waterfall limited to 12 months; KPI window capped at 90 days (security: unbounded query cost).

---

### `app/api/cron/analytics/route.ts` (route)

**Analog:** `app/api/cron/reconcile/route.ts` — copy the full shape (46 lines). This is the single strongest exact analog in the phase.

**Copy verbatim (reconcile lines 9-45; remind is byte-identical except the imported pass):**
```ts
import { timingSafeEqual } from "node:crypto";

export const dynamic = "force-dynamic";

/** Length-guarded constant-time compare (mirrors lib/platega.ts safeEq). */
function safeEq(received: string | null, expected: string): boolean {
  if (received === null) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export async function POST(req: Request): Promise<Response> {
  // Lazy imports: keep lib/env + lib/worker out of the build-time module graph
  // so `next build` never evaluates runtime secrets (mirrors instrumentation.ts).
  const { env } = await import("../../../../lib/env");
  const { logger } = await import("../../../../lib/logger");
  const expected = env.CRON_SECRET;
  // Unset secret → the route is closed rather than open (T-03-cronopen).
  if (!expected) {
    logger.warn({ route: "cron_reconcile", outcome: "disabled" });
    return Response.json({ error: "disabled" }, { status: 503 });
  }
  if (!safeEq(req.headers.get("x-cron-secret"), expected)) {
    logger.warn({ route: "cron_reconcile", outcome: "unauthorized" });
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const { reconcileOnce } = await import("../../../../lib/worker");
  const result = await reconcileOnce();
  logger.info({ route: "cron_reconcile", outcome: "ok", ...result });
  return Response.json({ ok: true, ...result });
}
```
Changes for this phase: route name `cron_analytics`, outcome `rollup`/`disabled`/`unauthorized`, lazy-import the rollup module (`lib/analytics/rollup`), return `{ ok: true, days, upserted, balance }` — ids/outcomes only, never DB URLs or provider payloads.

**Scheduling landmine:** host cron already runs `0 3 * * * scripts/backup.sh` (`docs/DEPLOY.md:130-132`) — schedule analytics at **`5 3 * * *`** (same nightly window, avoids racing `pg_dump`; RESEARCH A5). Add the line to `docs/DEPLOY.md` §7 next to the backup entry.

---

### `app/admin/analytics/page.tsx` (page)

**Analog:** `app/admin/page.tsx` — exact role-gate + period-normalization pattern (lines 1-33):

```tsx
// /admin overview (ADM-01). Enforcement lives HERE, not only in the layout: a
// directly fetched RSC payload skips layouts, so this page re-runs the same
// guard (T-05-01 / Pitfall 3).
import { notFound, redirect } from 'next/navigation';
import { requireRole } from '@/lib/admin-auth';
import { t } from '@/lib/i18n';
import { AdminError, SessionError } from '@/lib/session';
...
export const dynamic = 'force-dynamic';

export default async function AdminOverviewPage({ searchParams }: { searchParams?: Promise<{ period?: string }> } = {}) {
  let role: string | null = null;
  try {
    ({ role } = await requireRole('administrator', 'manager'));
  } catch (err) {
    if (err instanceof SessionError) redirect('/login');
    if (err instanceof AdminError) notFound();
    throw err;
  }

  const params = await (searchParams ?? Promise.resolve({ period: undefined }));
  const rawPeriod = Number(params.period ?? 30);
  const period = rawPeriod === 7 || rawPeriod === 90 ? rawPeriod : 30;
```

**Landmines:**
- D-11: `requireRole('administrator', 'manager')` re-run inside the page — RSC payloads skip layouts (documented in the `app/admin/page.tsx:1-6` comment; Pitfall 12).
- D-10 layout: KPI row → waterfall → sparkline; blocks for tariffs/order-kinds are out of scope.
- Source-contract test: page props must not carry `providerCost`/provider fields (Pitfall 5 — the RSC payload IS the new leak surface).
- Teaser on `/admin` (D-09): MRR value + «Подробнее» link to `/admin/analytics` — add to the existing `<StatsPanel/>`/`<RevenuePanel/>` section in `app/admin/page.tsx`.

---

### `components/admin/AnalyticsKpi.tsx` (server component)

**Analog:** `components/admin/RevenuePanel.tsx` — copy the card grid and the degradation pattern exactly:
```tsx
// RevenuePanel.tsx:7-19
const CARD = 'flex flex-col gap-2 rounded-2xl border border-line p-6 border-line';
const GRID = 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3';
const money = new Intl.NumberFormat('ru-RU');

function MetricCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className={CARD}>
      <span className="text-sm text-muted">{label}</span>
      <span className="text-2xl font-semibold tabular-nums text-foreground">{value}</span>
      {sub && <span className="text-xs text-muted">{sub}</span>}
    </div>
  );
}

// RevenuePanel.tsx:21-32 — independent degradation (one failing source never blanks the panel)
export default async function RevenuePanel({ period }: { period: 7 | 30 | 90 }) {
  let data;
  try {
    data = await loadRevenue(period);
  } catch {
    return (
      <div className="flex flex-col gap-4">
        <h3 className="text-xl font-semibold text-foreground">{t('admin.revenueTitle')}</h3>
        <p className="text-sm text-muted">{t('common.errorLoad')}</p>
      </div>
    );
  }
```
- Money formatting: `Intl.NumberFormat('ru-RU')`, whole rubles with ` ₽` suffix.
- Coverage KPI (D-08): `const coverage = paidOrders === 0 ? null : providerCostOrders / paidOrders;` → `null` renders `—`, plus sub-line `${providerCostOrders} / ${paidOrders}` — never fake zeros for the pre-implementation gap (D-08).
- No `'use client'` — fully server-rendered (removes an auth/validation surface; RESEARCH Pattern 4).

---

### `components/admin/MrrWaterfall.tsx` + `MrrSparkline.tsx` (server SVG)

**Analog:** `components/admin/FunnelCharts.tsx` SVG conventions — but **server components**, data passed as props, no fetch, no `'use client'`.

**Copy the SVG geometry (FunnelCharts.tsx:101-107, 220-227, 262-275):**
```tsx
const W = 560;
const H = 180;
const PAD = 28;
const n = Math.max(1, data?.series.length ?? 1);
const slot = (W - PAD * 2) / n;
const barW = Math.max(2, Math.min(18, slot / 4));
...
// bar: x = PAD + slot * index + slot / 2; base = H - PAD;
// height = Math.max(bar.value > 0 ? 2 : 0, ((H - PAD * 2) * bar.value) / bar.max)
// polyline (sparkline):
// y = H - PAD - ((H - PAD * 2) * bucket.revenue) / maxRevenue
// points = series.map(...).join(' ') → <polyline fill="none" stroke="#0e1512" strokeWidth={1.5} />
```
- Adaptive label step `Math.max(1, Math.ceil(series.length / 8))` (FunnelCharts:100) so 12-month waterfall labels never overlap.
- Waterfall bars: green (`#0c4f36`) positive, muted (`#e4dfd1`) contraction/churn, `role="img"` + `aria-label` via `t()` (FunnelCharts:202-204).
- **Do NOT copy** `isoDay()`/`shortLabel()` UTC date handling (FunnelCharts:40-51) — dates for analytics come from MSK-labeled `daily_metrics` rows passed as props; day/month switch uses `mskDayLabel`, never `toISOString().slice(0,10)` for MSK buckets.

---

### `scripts/backfill-analytics.ts` (CLI script)

**Analog:** `prisma/seed.ts` — the only TS script in the repo; copy the runner shape:
```ts
// prisma/seed.ts:5-30 — RELATIVE imports (tsx), main().catch().finally(disconnect)
import { prisma } from "../lib/prisma";
...
async function main() {
  await prisma.$connect();
  ...
  console.log(`seed: upserted test user (telegram_id=${user.telegramId?.toString() ?? "null"})`);
}

main()
  .catch((e: unknown) => {
    console.error("seed: failed", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
```
- Relative imports (`"../lib/prisma"`, `"../lib/analytics/rollup"`) — the `@/` alias does not exist under tsx.
- Default range = first paid order day … yesterday (MSK); chunk by month for progress logging; print `days=… upserted=…` for the verify chain; re-runnable with identical results (D-14).
- Reuses `lib/analytics/rollup.ts`'s upsert path — never a second implementation.

**Deploy gap — `Dockerfile` (modify, add after line 49):**
```dockerfile
COPY --from=builder /app/scripts ./scripts
```
(Scripts currently aren't copied; the DB port is unpublished so the host can't run it → operator command must be `docker compose -f docker-compose.prod.yml exec web npx tsx scripts/backfill-analytics.ts`. Pitfall 10.)

---

### `lib/worker.ts` + `lib/orders-service.ts` (providerCost capture)

**Analog:** the file itself. `lib/worker.ts:134-152` is the exact insertion point (D-06: cost fixed at provisioning, the only point where the key exists and the order is terminal-success):

**Current sequence (worker.ts:134-152):**
```ts
try {
  const key = await provisionByKind({ ... });
  await upsertCachedKey(order.userId, key);
  // ...single-writer gate comment...
  const firstProvision = await markProvisioned(order.id, key.id);
  await enqueueNotifyProvisioned(order.id);
```
**Prescribed change (RESEARCH §providerCost Capture):** fetch the quote concurrently, write it in the same atomic transition:
```ts
const [key, quotedCost] = await Promise.all([
  provisionByKind({ ... }),
  quoteProviderCost(order).catch((err) => {
    logger.warn({ route: 'worker', outcome: 'provider_cost_unavailable', orderId: order.id,
                  code: err instanceof ArtemidaError ? err.code : 'unknown' });
    return null;
  }),
]);
await upsertCachedKey(order.userId, key);
const firstProvision = await markProvisioned(order.id, key.id, quotedCost);
```

**`lib/orders-service.ts` changes (copy the existing helpers, extend only the data bag):**
```ts
// orders-service.ts:315-326 — transitionOrder already accepts a Partial data bag
export async function transitionOrder(
  id: string,
  from: OrderStatus,
  to: OrderStatus,
  data: Partial<Pick<Order, "paidAt" | "provisionedKeyId" | "errorCode" | "attempts" | "nextAttemptAt">> = {},
): Promise<boolean> { ... }

// orders-service.ts:477-483 — markProvisioned, the single worker write to extend
export async function markProvisioned(orderId: string, keyId: string): Promise<boolean> {
  return transitionOrder(orderId, "provisioning", "provisioned", {
    provisionedKeyId: keyId,
    errorCode: null,
    nextAttemptAt: null,
  });
}
```
Add `"providerCost"` to the `Pick` union in `transitionOrder` and a `providerCost: number | null = null` third param in `markProvisioned` (verified: exactly ONE caller, worker.ts:152).

**Quote per kind (quote table from RESEARCH — never `resolveTariffQuote`):**
- `new`/`renew`: `artemida.getPricing({ days, devices })` — `days` non-null here.
- `upgrade`: `artemida.getUpgradeQuote({ days: 30, devices: baseDevices, addDevices: order.devices })` — with **base-device recovery**:
```ts
const cached = await prisma.keyCache.findFirst({ where: { keyId: order.keyId } });
const baseDevices = Math.max(1, (cached?.deviceLimit ?? order.devices) - order.devices);
```
Subtraction is required: a retry after partial success already sees the post-upgrade `deviceLimit` (Pitfall: tier lookup lands one tier too high).

**Landmine — retail-as-cost (Pitfall 6):** `resolveTariffQuote` returns the MANUAL grid amount when a row exists (`lib/pricing.ts:96-99`) — cost from it would be structurally zero margin. Cost must come from `artemida.getPricing`/`getUpgradeQuote` directly (which internally mirror ARTEMIDA's own `Math.max(1, remainingDays/30)` rule, `lib/artemida.ts:259`).

**Landmine — leak guard (Pitfall 5):** `toHistoryRow` (`lib/orders-service.ts:392-402`) feeds the customer cabinet, bot history, and `OrderStatusPanel` — do NOT add `providerCost` to `OrderHistoryRow`. Admin-only view goes in `lib/admin-service.ts`:
```ts
// admin-service.ts:370-376 today (map through the shared mapper, never re-map)
export async function loadAdminPayments(userId: number): Promise<OrderHistoryRow[]> {
  const orders = await prisma.order.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
  return orders.map(toHistoryRow);
}
// → Add: export type AdminPaymentRow = OrderHistoryRow & { providerCost: number | null };
//   and spread `{ ...toHistoryRow(o), providerCost: o.providerCost ?? null }`; render `—` for null.
```
Source-contract test: assert the string `providerCost` does NOT appear in `lib/orders-service.ts`'s mapper or customer components.

---

### `lib/admin-auth.ts`, `app/admin/layout.tsx`, `components/admin/AdminNav.tsx`, `lib/i18n/messages/ru.ts` (nav wiring — 5 places, Pitfall 11)

**The i18n test (`tests/unit/i18n.test.ts`) fails on ANY unused or missing key** — `I18nKey` is the literal key union of `ru.ts` (line 679: `export type I18nKey = LeafPaths<Messages>`), and `tp()` plural triplets are checked. Wiring the nav item must land in **five places in one task** (RESEARCH Pitfall 11):

1. `lib/admin-auth.ts:30-42` — add `"analytics"` to `AdminSection`.
2. `lib/admin-auth.ts:45-65` — add `"analytics"` to `MATRIX.administrator` and `MATRIX.manager` (D-11: administrator + manager).
3. `app/admin/layout.tsx:22` — `const NAV_SECTIONS: AdminSection[] = ['overview', 'users', ...]` → insert `'analytics'` (display order decides placement; keep `'overview'` first).
4. `components/admin/AdminNav.tsx:14-29` + `:36-57` — add `'analytics'` to the `NavSection` `Extract<...>` union and `ITEMS` (`{ section: 'analytics', href: '/admin/analytics' }`) + a `case 'analytics': return t('admin.navAnalytics')` — **literal switch, never an interpolated key**.
5. `lib/i18n/messages/ru.ts` `admin` block (near lines 345-393) — add `navAnalytics: 'Аналитика'` + all new page keys (`analyticsTitle`, KPI labels, waterfall/sparkline labels, coverage copy, goodwill copy).

**Landmine:** `Extract<AdminSection, …>` will NOT flag a missing union member — TypeScript compiles; only the i18n test catches it.

---

### Tests (10 new files)

**Pure unit tests** (`analytics-time|series|mrr|waterfall|metrics.test.ts`): harness = `tests/unit/i18n.test.ts` (no DB; `describe/it/expect` from vitest; no mocking). Verified values must appear in the time test (RESEARCH Pattern 1): `mskDayLabel(new Date('2026-10-19T21:00:00Z')) → "2026-10-20"`, `mskDayLabel('…T20:59:59Z') → "2026-10-19"`, `mskDayStartInstant('2026-10-20') → 2026-10-19T21:00:00.000Z`, `mskDateKey('2026-10-20') → 2026-10-20T00:00:00.000Z`, month start of Oct 2026 → `2026-09-30T21:00:00.000Z`; plus an Intl cross-check over 2020–2030. Wire plain relative imports from `../../lib/analytics/…`.

**DB-backed tests** (`analytics-rollup|backfill|provider-cost.test.ts`): harness = `tests/unit/outbox-worker.test.ts` — OWNER telegram id from the `2000003xx` range (e.g. `200000310` uses it; use a fresh `20000034x` id, RESEARCH Wave-0 note), `cleanup()` deleting `outbox → order → keyCache → user` in `beforeAll`/`afterEach`, `vi.spyOn(artemida, 'createKey').mockResolvedValue(providerKey(...))` with a `providerKey()` factory:
```ts
// outbox-worker.test.ts:19-50 (OWNER id + cleanup template)
const OWNER = BigInt("200000310");
async function cleanup(): Promise<void> {
  const user = await prisma.user.findUnique({ where: { telegramId: OWNER }, select: { id: true } });
  if (user) {
    await prisma.outbox.deleteMany({ where: { order: { userId: user.id } } });
    await prisma.order.deleteMany({ where: { userId: user.id } });
    await prisma.keyCache.deleteMany({ where: { userId: user.id } });
  }
  await prisma.user.deleteMany({ where: { telegramId: OWNER } });
}
```
provider-cost test must also spy `artemida.getPricing` (quote failure → `null`, still `provisioned`; success → `providerCost` written) and assert the no-leak contract via `readFileSync` source scan (pattern: `tests/unit/admin-route.test.ts:521-541`). Rollup test: run upsert twice → identical row; concurrency → one row.

**Cron route test** (`analytics-cron-route.test.ts`): harness = `tests/unit/cron-reconcile-route.test.ts` — `const SECRET = process.env['CRON_SECRET'] ?? 'unit-test-cron-secret-000000000000'`, `request(headers)` helper, 401 missing/forged header (assert no rollup run), 503 when `CRON_SECRET` unset (mock `lib/env`), 200 + idempotent with valid header.

**Page contract test** (`admin-analytics-page.test.ts`): harness = `tests/unit/admin-route.test.ts` — `statusFor()` mapping (401/404/200), `callOverviewPage()`-style digest capture (`NEXT_REDIRECT`→login, `NEXT_HTTP_ERROR_FALLBACK;404`), `beforeEach` removing the bootstrap admin row, `vi.hoisted(() => { process.env.ADMIN_TELEGRAM_IDS = '910000101'; })`, `vi.mock("next/headers", …)` session sign-in via `signSession`, and `readFileSync` source assertions (page contains `requireRole` re-check; no `providerCost` string in page props/components).

---

## Shared Patterns

### Money definition (D-02 — every file that touches rubles)
**Source:** `lib/revenue.ts:10,24-26` — `PAID = ["paid","provisioning","provisioned"]`; `cashOf = Math.max(0, finalAmount - balanceUsed)`. Unit test asserts consistency with the existing dashboard.
**Apply to:** `lib/analytics/series.ts`, `mrr.ts`, `waterfall.ts`, `metrics/ARPU-ARPPU`.

### MSK bucket discipline (D-15 — every file that reads/writes a day)
**Source:** `lib/analytics/time.ts` (new) — four helpers, never collapsed. Raw SQL: day as string + `::date`; `@db.Date` params: `mskDateKey`; `timestamp` window comparisons: `mskDayStartInstant`/`pgTimestamp`; labels: `mskDayLabel`. Never SQL-side `CURRENT_DATE`/`date_trunc`; never a JS Date into a raw `date` param.
**Apply to:** rollup, cron route, backfill, page, all tests.

### CRON_SECRET gate
**Source:** `app/api/cron/reconcile/route.ts:9-45` — lazy imports, 503-on-unset, 401 on bad header, `timingSafeEqual` + length guard.
**Apply to:** `app/api/cron/analytics/route.ts`.

### Role gate (D-11)
**Source:** `app/admin/page.tsx:11-29` — `requireRole('administrator','manager')` re-run in-page, `SessionError → redirect('/login')`, `AdminError → notFound()`.
**Apply to:** `app/admin/analytics/page.tsx`; nav visibility via `can(role, section)` in `MATRIX`.

### Independent degradation
**Source:** `components/admin/RevenuePanel.tsx:22-32` — per-card `try/catch → t('common.errorLoad')`; each analytics block behind its own Suspense boundary.
**Apply to:** `AnalyticsKpi`, `MrrWaterfall`, `MrrSparkline`, and the `/admin` page (teaser must never throw the overview).

### Error/secret logging
**Source:** `lib/logger.ts` (pino) + `lib/worker.ts:444-446` + `app/api/cron/reconcile/route.ts:34-44` — `{ route, outcome, ids }` only; never `DATABASE_URL`, `ARTEMIDA_API_KEY`, provider bodies, or raw DB errors in the UI.
**Apply to:** rollup (missing quote → `warn`), cron route, backfill (`console.log` for progress is the seed precedent, but structured `logger` for failures).

### Raw-query rethrow semantics
**Source:** `lib/prisma-errors.ts:32-47` — `isWriteConflict`/`isUniqueViolation` walk the `cause` chain (`originalCode`/`kind`). Available if the upsert path needs conflict handling; the absolute-value upsert is designed to make it unnecessary.

### Validation of query input
**Source:** `app/api/admin/referrals/stats/route.ts:14-19,54-62` — zod schema + `safeParse` → 400; 366-day cap. Phase 7 minimal: `?period=` normalized to `7|30|90` exactly like `app/admin/page.tsx:31-33` (custom ranges are deferred per RESEARCH Open Q2).

---

## No Analog Found

| File | Role | Data Flow | Reason / Guidance |
|------|------|-----------|-------------------|
| `lib/analytics/time.ts` | utility | transform | No MSK-bucketing precedent exists in the repo — `lib/referral-stats.ts` and `FunnelCharts.tsx` are explicitly NON-MSK and must not be copied. RESEARCH.md Pattern 1 is prescriptive and empirically verified; implement from it directly and pin with the verified-value unit test. |

## Metadata

**Analog search scope:** `lib/`, `app/api/cron/`, `app/api/admin/`, `app/admin/`, `components/admin/`, `tests/unit/`, `prisma/`, `scripts/`, `Dockerfile`, `docs/DEPLOY.md`
**Files scanned:** ~30 source files + 2 migrations + config
**Pattern extraction date:** 2026-10-20
**Tracked-source gate:** all named analogs verified via `git ls-files` (28/28 tracked)
**Zero new npm packages** — everything here is built from installed deps (RESEARCH Standard Stack).