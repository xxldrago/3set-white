// Daily aggregate series — PURE module (no Prisma import; the unit-test surface).
//
// One pass over paid orders / users / goodwill rows produces an exact
// aggregate per Europe/Moscow calendar day. The nightly cron, the backfill
// CLI and every later consumer call THIS function, so "метрики за любой
// прошлый день совпадают с ручной сверкой" (ANL-15) is a property of the
// design, not a hope.
//
// Money contract mirrors lib/revenue.ts verbatim (D-02):
//   cash = max(0, finalAmount - balanceUsed), statuses {paid, provisioning,
//   provisioned} — filtering belongs to the DB layer, the series builder
//   trusts its input rows.
//
// Term-chain semantics (A3): a renewal EXTENDS the key's expiry
// (cursor = max(cursor ?? paidAt, paidAt) + days), it never restarts it.
// Upgrades carry days = NULL (the delta buys devices/term on top of the
// base term) and take no part in the chain length. There is NO downgrade
// kind — any observed contraction later is pricing/promo-driven, not a
// missing order type. A KeyCache key deleted on the provider side produces
// the same outcome through the chain: its termEnd passes and no later op
// extends it.
import { mskDayLabel, mskDayStartInstant } from "./time";

/** The paid order slice rollup.ts loads and the series consumes. */
export interface PaidOrderRow {
  id: string;
  userId: number;
  kind: "new" | "renew" | "upgrade";
  days: number | null;
  devices: number;
  finalAmount: number;
  balanceUsed: number;
  providerCost: number | null;
  keyId: string | null;
  provisionedKeyId: string | null;
  paidAt: Date | null;
  status: string;
}

/** Extracted cash: balance-covered rubles never touched the provider. */
export function cashOf(row: { finalAmount: number; balanceUsed: number }): number {
  return Math.max(0, row.finalAmount - row.balanceUsed);
}

/** One MSK calendar day of raw aggregates (D-12: raw, derivations live elsewhere). */
export interface DailyAggregate {
  day: string; // "YYYY-MM-DD" MSK label
  paidOrders: number;
  paidCashRub: number;
  newOrders: number;
  renewOrders: number;
  upgradeOrders: number;
  providerCostRub: number;
  providerCostOrders: number;
  activeKeys: number;
  newUsers: number;
  goodwillDays: number;
}

/** The per-key term chain 07-04's mrr.ts/waterfall.ts also consume. */
export interface KeyTerm {
  keyRef: string; // COALESCE(keyId, provisionedKeyId) — keyId is NULL for kind=new until provisioning
  base: PaidOrderRow; // first new|renew op
  upgrades: PaidOrderRow[]; // upgrade ops ordered by paidAt (days are NULL there — never in the chain)
  termStart: Date;
  termEnd: Date;
}

const DAY_MS = 86_400_000;

/** The next MSK day label ("2026-05-10" → "2026-05-11") — pure UTC-midnight string math. */
export function nextDayLabel(label: string): string {
  return new Date(Date.parse(`${label}T00:00:00.000Z`) + DAY_MS).toISOString().slice(0, 10);
}

/**
 * Group paid orders into per-key term chains. keyRef = keyId ?? provisionedKeyId
 * (Pitfall 3: keyId is NULL on kind=new until provisionedKeyId is written).
 * Chain ops (new|renew, days non-null) ordered by paidAt build the cursor;
 * upgrades are recorded alongside. Rows without paidAt or a key ref are skipped.
 */
export function buildKeyTerms(paid: PaidOrderRow[]): Map<string, KeyTerm> {
  const groups = new Map<string, PaidOrderRow[]>();
  for (const op of paid) {
    if (!op.paidAt) continue;
    const keyRef = op.keyId ?? op.provisionedKeyId;
    if (!keyRef) continue;
    const group = groups.get(keyRef) ?? [];
    group.push(op);
    groups.set(keyRef, group);
  }

  const terms = new Map<string, KeyTerm>();
  for (const [keyRef, ops] of groups) {
    const chain = ops
      .filter((op) => (op.kind === "new" || op.kind === "renew") && op.days !== null)
      .sort((a, b) => (a.paidAt as Date).getTime() - (b.paidAt as Date).getTime());
    const upgrades = ops
      .filter((op) => op.kind === "upgrade")
      .sort((a, b) => (a.paidAt as Date).getTime() - (b.paidAt as Date).getTime());
    if (chain.length === 0) continue;

    let cursorMs: number | null = null;
    for (const op of chain) {
      const paidAtMs = (op.paidAt as Date).getTime();
      // A renew extends from the current expiry (never earlier than its own
      // paidAt) instead of restarting the term.
      cursorMs = Math.max(cursorMs ?? paidAtMs, paidAtMs) + (op.days as number) * DAY_MS;
    }
    terms.set(keyRef, {
      keyRef,
      base: chain[0] as PaidOrderRow,
      upgrades,
      termStart: chain[0]!.paidAt as Date,
      termEnd: new Date(cursorMs as number),
    });
  }
  return terms;
}

function emptyAggregate(day: string): DailyAggregate {
  return {
    day,
    paidOrders: 0,
    paidCashRub: 0,
    newOrders: 0,
    renewOrders: 0,
    upgradeOrders: 0,
    providerCostRub: 0,
    providerCostOrders: 0,
    activeKeys: 0,
    newUsers: 0,
    goodwillDays: 0,
  };
}

/**
 * Build the daily series for MSK days [fromDay, toDay] inclusive. Every day in
 * the range is emitted (an empty day is a truthful zero row for the sparkline);
 * days outside the range are never emitted. Orders/users/goodwill outside the
 * range still feed the term-chain ledger — a key bought before the window
 * counts as active on in-range days — but their money counters bucket onto
 * their own (unemitted) days.
 */
export function buildDailySeries(
  orders: PaidOrderRow[],
  users: { createdAt: Date }[],
  goodwill: { at: Date; days: number }[],
  fromDay: string,
  toDay: string,
): DailyAggregate[] {
  if (fromDay > toDay) return [];
  const labels: string[] = [];
  for (let day = fromDay; day <= toDay; day = nextDayLabel(day)) {
    labels.push(day);
    if (day === toDay) break;
  }
  const inRange = new Set(labels);
  const buckets = new Map<string, DailyAggregate>();

  for (const o of orders) {
    if (!o.paidAt) continue;
    const day = mskDayLabel(o.paidAt);
    if (!inRange.has(day)) continue; // out-of-range rows never emit money counters
    const b = buckets.get(day) ?? emptyAggregate(day);
    b.paidOrders += 1;
    b.paidCashRub += cashOf(o);
    if (o.kind === "new") b.newOrders += 1;
    else if (o.kind === "renew") b.renewOrders += 1;
    else b.upgradeOrders += 1;
    if (o.providerCost !== null) {
      b.providerCostRub += o.providerCost;
      b.providerCostOrders += 1;
    }
    buckets.set(day, b);
  }

  for (const u of users) {
    const day = mskDayLabel(u.createdAt);
    if (!inRange.has(day)) continue;
    const b = buckets.get(day) ?? emptyAggregate(day);
    b.newUsers += 1;
    buckets.set(day, b);
  }

  for (const g of goodwill) {
    const day = mskDayLabel(g.at);
    if (!inRange.has(day)) continue;
    const b = buckets.get(day) ?? emptyAggregate(day);
    b.goodwillDays += g.days;
    buckets.set(day, b);
  }

  // A key is active at end-of-day t iff its term started by then and has not
  // passed: termStart <= t < termEnd (strict — t >= termEnd is inactive).
  const terms = buildKeyTerms(orders);
  const series: DailyAggregate[] = labels.map((day) => buckets.get(day) ?? emptyAggregate(day));
  for (const agg of series) {
    const endOfDay = mskDayStartInstant(nextDayLabel(agg.day));
    let activeKeys = 0;
    for (const term of terms.values()) {
      if (term.termStart.getTime() <= endOfDay.getTime() && endOfDay.getTime() < term.termEnd.getTime()) {
        activeKeys += 1;
      }
    }
    agg.activeKeys = activeKeys;
  }
  return series;
}
