// Per-key MRR / ARR derivation — PURE module (no Prisma import), D-12: every
// derived metric is computed on the fly from raw paid orders, so a formula
// change never requires re-rolling history.
//
// Base decision (D-01, resolved): "active keys" come from the per-key TERM
// CHAIN over orders — KeyCache has no history, and one key = one MRR row
// renewals never double-count (D-01). The key identity is
// COALESCE(keyId, provisionedKeyId): kind=new orders carry keyId = NULL until
// provisioning writes provisionedKeyId, so a strict keyId join would silently
// drop every new subscription (Pitfall 3, T-07-04-01).
//
// Term semantics (A3): the term chain (buildKeyTerms in series.ts — the one
// shared engine; never a second cursor implementation) extends a renewal from
// the CURRENT expiry (cursor = max(cursor ?? paidAt, paidAt), then += days),
// never restarts it. The boundary contract: a key is active at instant t iff
// termStart <= t < termEnd; t >= termEnd is expired/churned → 0 MRR.
//
// Per-instant segment base: the chain op whose term contains t (the last
// new|renew with paidAt <= t — D-01's "ключ → его последний paid-заказ")
// anchors the monthly equivalent cash × 30 / days. This is what makes the
// waterfall's contraction bucket observable (ANL-02): a renewal at a lower
// monthly equivalent (shorter term, promo discount) or a balance-covered
// renewal (cashOf = 0, D-03) lowers the segment equivalent from its paidAt
// — a base-frozen-first-op implementation could observe no contraction.
//
// Upgrade orders carry days = NULL (Pitfall 4): their cash is NOT run
// through /(days/30). Each upgrade spreads cash / max(1, remainingDays / 30)
// over the months it actually covers — the SAME rule ARTEMIDA itself uses to
// price the charge (lib/artemida.ts deriveUpgradeQuote: months =
// Math.max(1, remainingDays / 30)).
//
// D-04: MRR is computed in exact arithmetic as cash × 30 / days (whole-ruble
// display rounding happens in the UI via Math.round); a term is 30/90/180/…
// whole days, so equivalent values stay exact rationals. Bonus-day renewals
// (finalAmount − balanceUsed = 0) contribute 0 through cashOf (D-03) —
// goodwill is tracked separately (07-02's goodwillDays), never folded in.
// Order-less trials (A1) never appear: no paid order, no term, no MRR.
//
// Money contract mirrors lib/revenue.ts (D-02): cash =
// max(0, finalAmount − balanceUsed); the PAID status filter belongs to the DB
// layer — mrr.ts trusts its input rows.
import { buildKeyTerms, cashOf, type PaidOrderRow } from "./series";

const DAY_MS = 86_400_000;

/** COALESCE(key_id, provisioned_key_id) — null when the order is not yet provisioned. */
export function keyRefOf(o: { keyId: string | null; provisionedKeyId: string | null }): string | null {
  return o.keyId ?? o.provisionedKeyId ?? null;
}

/** Group paid orders by key ref — the same identity buildKeyTerms groups on. */
function byKey(orders: PaidOrderRow[]): Map<string, PaidOrderRow[]> {
  const groups = new Map<string, PaidOrderRow[]>();
  for (const op of orders) {
    const ref = keyRefOf(op);
    if (!ref || !op.paidAt) continue;
    const group = groups.get(ref);
    if (group) group.push(op);
    else groups.set(ref, [op]);
  }
  return groups;
}

/** Monthly equivalent of a chain op: cash × 30 / days (days non-null — never an upgrade). */
function equivalentOf(op: PaidOrderRow): number {
  return (cashOf(op) * 30) / (op.days as number);
}

/**
 * MRR of ONE key at instant t (0 when the key is not active at t). The
 * per-instant segment base is resolved through the shared engine on chain
 * suffixes: buildKeyTerms(chain[i..]).base is exactly the i-th chain op, so
 * the greatest i with termStart <= t yields the op whose term contains t —
 * the last new|renew paid by t (no duplicated cursor math).
 */
function keyMrrAt(ref: string, ops: PaidOrderRow[], t: Date): number {
  const tm = t.getTime();
  const full = buildKeyTerms(ops).get(ref);
  if (!full) return 0;
  if (tm < full.termStart.getTime() || tm >= full.termEnd.getTime()) return 0;

  // chain ops exactly as buildKeyTerms treats them (new|renew with days)
  const chain = ops
    .filter((op) => (op.kind === "new" || op.kind === "renew") && op.days !== null)
    .sort((a, b) => (a.paidAt as Date).getTime() - (b.paidAt as Date).getTime());
  let base = full.base;
  for (let i = 1; i < chain.length; i++) {
    const suffix = buildKeyTerms(chain.slice(i)).get(ref);
    if (!suffix || suffix.termStart.getTime() > tm) break; // starts only grow
    base = suffix.base;
  }

  let mrr = equivalentOf(base);
  for (const u of full.upgrades) {
    if (!u.paidAt) continue;
    const um = u.paidAt.getTime();
    if (um <= (full.base.paidAt as Date).getTime() || um > tm) continue;
    const remainingDays = (full.termEnd.getTime() - um) / DAY_MS;
    mrr += cashOf(u) / Math.max(1, remainingDays / 30);
  }
  return mrr;
}

/** Total MRR at instant t: Σ over keys of the per-key term-chain equivalent. */
export function mrrAt(orders: PaidOrderRow[], t: Date): number {
  let total = 0;
  for (const [ref, ops] of byKey(orders)) total += keyMrrAt(ref, ops, t);
  return total;
}

/** Total MRR at instant t (named spelling of the KPI figure). */
export function totalMrrAt(orders: PaidOrderRow[], t: Date): number {
  return mrrAt(orders, t);
}

/**
 * Active (paying) subscriptions at instant t: keys with mrr > 0 (which also
 * means termEnd > t). Keys alive but carrying a 0 ₽ segment (balance-covered
 * bonus renewal, D-03) are not paying subscriptions and do not count.
 */
export function activeKeysAt(orders: PaidOrderRow[], t: Date): number {
  let count = 0;
  for (const [ref, ops] of byKey(orders)) {
    if (keyMrrAt(ref, ops, t) > 0) count += 1;
  }
  return count;
}

/** Annualized run-rate: MRR × 12 (UI-SPEC: the ARR card states its derivation). */
export function arrAt(orders: PaidOrderRow[], t: Date): number {
  return totalMrrAt(orders, t) * 12;
}
