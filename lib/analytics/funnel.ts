// Payment-funnel + failure-analysis derivations — PURE module (no Prisma, no
// next/*, no React, no lib/env). Every number the Phase 9 blocks display
// derives from these functions; the DB loaders (09-02) own status/row
// filtering and hand this layer plain rows.
//
// Stage criteria are DERIVED from the verified order state machine
// (lib/orders-service.ts):
//   - pending → paid sets paidAt (applyConfirmedPayment, orders-service.ts:456)
//   - paid → provisioning claim (transitionToProvisioning, :483)
//   - provisioning → provisioned sets provisionedKeyId (markProvisioned,
//     :493-498 — the terminal-success transition; errorCode/nextAttemptAt are
//     cleared)
//   - provisioning → failed, with a paid → failed fallback for a failure
//     before the first claim (markProvisionFailed, :524-539; the fallback is
//     the second transitionOrder at :534)
//   - paid | provisioning | provisioned → refunded on CHARGEBACKED
//     (app/api/platega/callback/route.ts:75-83)
//
// DOCUMENTED APPROXIMATIONS (declared, not verified facts):
//   (a) failed-implies-provisioning. The paid→failed fallback at
//       orders-service.ts:534 never entered provisioning, yet at the schema
//       level it is byte-identical to a first-attempt provisioning→failed row.
//       attempts/nextAttemptAt are NOT a discriminator: a first-attempt
//       terminal failure in the worker (worker.ts:279-284/303 calls
//       markProvisionFailed directly, no markProvisionError ever ran) writes
//       attempts = 0 / nextAttemptAt = null, exactly like the fallback. The
//       funnel therefore over-counts provisioning by the fallback volume.
//   (b) keyless-refunded exclusion. A refunded row chargebacked FROM
//       provisioning that never got a key (callback route.ts:76-78 allows the
//       paid→refunded path too, so the two are schema-indistinguishable)
//       physically entered provisioning but fails the predicate. The funnel
//       therefore under-counts provisioning by that volume.
// Both paths are fixture-pinned as approximations, never presented as facts.
//
// Funnel semantics: REACH-based and monotone. Every order enters at pending
// (creation); a failed/refunded/canceled order counts toward every stage it
// physically reached — never derived from the current status alone. Counts
// only claim "at least this many orders got here" (subject to (a)/(b)).
//
// Timing proxy: paid→provisioned is measured as updatedAt − paidAt.
// markProvisioned is the terminal-success transition, and the
// status === 'provisioned' scope excludes any LATER updatedAt touch (a
// post-provision chargeback would move updatedAt to the refund instant), so
// the proxy stays honest for successful chains. Error breakdown consumes the
// RAW errorCode values written by markProvisionError/failOrder (provider codes
// such as 'attempts_exhausted', never translated here — the component owns
// the i18n label).
//
// Payment window (D-01): PAYMENT_WINDOW_MS is a hardcoded code constant,
// never env, never runtime-configurable. `expired` is point-in-time —
// pending AND created strictly before now − 24h. No status mutation, no new
// OrderStatus member, no enum change anywhere in this module.

/** D-01 — the 24h payment window. Hardcoded; never read from env/config. */
export const PAYMENT_WINDOW_MS = 24 * 60 * 60 * 1000;

/** The order slice the Phase 9 loaders hand to these pure derivations. */
export interface FunnelRow {
  id: string;
  status: string;
  createdAt: Date;
  paidAt: Date | null;
  provisionedKeyId: string | null;
  updatedAt: Date;
  errorCode: string | null;
}

/** Fixed funnel order (ANL-08): pending → paid → provisioning → provisioned. */
export const FUNNEL_STEPS = ["pending", "paid", "provisioning", "provisioned"] as const;

export type FunnelStep = (typeof FUNNEL_STEPS)[number];

export interface FunnelStepRow {
  step: FunnelStep;
  count: number;
  /** count / previous step's count; null on the first step or zero prev. */
  conversion: number | null;
  /** 1 − conversion; null whenever conversion is null. */
  dropOff: number | null;
}

/** Entered the funnel's paid stage (money captured). */
export function reachedPaid(o: FunnelRow): boolean {
  return o.paidAt !== null;
}

/**
 * Entered the provisioning stage — status claim OR a provisioned key. A
 * failed row counts here (DOCUMENTED APPROXIMATION (a) in the header); a
 * keyless refunded row does not (DOCUMENTED APPROXIMATION (b)).
 */
export function reachedProvisioning(o: FunnelRow): boolean {
  return (
    o.status === "provisioning" ||
    o.status === "provisioned" ||
    o.status === "failed" ||
    o.provisionedKeyId !== null
  );
}

/** Reached terminal success — status provisioned OR a provisioned key. */
export function reachedProvisioned(o: FunnelRow): boolean {
  return o.status === "provisioned" || o.provisionedKeyId !== null;
}

/**
 * Four funnel steps in fixed order with reach-based counts. The first step
 * has no conversion (the base of the funnel); later steps convert from the
 * PREVIOUS step (D-02). Exact rationals — the component multiplies by 100.
 */
export function funnelOf(rows: FunnelRow[]): FunnelStepRow[] {
  const counts: Record<FunnelStep, number> = {
    pending: rows.length,
    paid: rows.filter(reachedPaid).length,
    provisioning: rows.filter(reachedProvisioning).length,
    provisioned: rows.filter(reachedProvisioned).length,
  };

  return FUNNEL_STEPS.map((step, index) => {
    const count = counts[step];
    if (index === 0) {
      return { step, count, conversion: null, dropOff: null };
    }
    const prev = counts[FUNNEL_STEPS[index - 1]!];
    // Division guard house style (mrr.ts): explicit === 0, never `||`.
    const conversion = prev === 0 ? null : count / prev;
    return {
      step,
      count,
      conversion,
      dropOff: conversion === null ? null : 1 - conversion,
    };
  });
}

/**
 * Point-in-time count of pending orders older than the payment window
 * (ANL-11/D-01). STRICT `<`: an order created exactly at now − windowMs is
 * not expired. No status mutation, no windowing by report period.
 */
export function expiredCount(
  rows: FunnelRow[],
  now: Date,
  windowMs: number = PAYMENT_WINDOW_MS,
): number {
  const cutoff = now.getTime() - windowMs;
  return rows.filter((o) => o.status === "pending" && o.createdAt.getTime() < cutoff).length;
}

/** One error-code group of the failure breakdown (ANL-09). */
export interface ErrorBreakdownRow {
  /** Raw stored errorCode; null means the order never recorded one. */
  code: string | null;
  count: number;
}

/**
 * Failed/canceled orders grouped by their RAW errorCode (D-03/ANL-09).
 * Only 'failed' and 'canceled' rows enter — a provisioned/pending row that
 * still carries a stale errorCode is ignored. `null` stays `null` in the
 * payload: the «unknown» label is the component's render decision (it keeps
 * the i18n key in use). Sorted by count DESC, ties by code ASC with null
 * treated as '' — so the unknown group leads its tie block.
 */
export function errorBreakdown(rows: FunnelRow[]): ErrorBreakdownRow[] {
  const counts = new Map<string | null, number>();
  for (const o of rows) {
    if (o.status !== "failed" && o.status !== "canceled") continue;
    const code = o.errorCode ?? null;
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => {
      if (a.count !== b.count) return b.count - a.count;
      // Documented tie-break: null sorts as '' (first among equal counts).
      const aCode = a.code ?? "";
      const bCode = b.code ?? "";
      return aCode < bCode ? -1 : aCode > bCode ? 1 : 0;
    });
}

/**
 * Median of a millisecond sample — exact rational, never rounded (ANL-10).
 * Even n → mean of the two middle values. Empty sample → null.
 */
export function medianMs(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid]!;
  return (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Arithmetic mean of a millisecond sample; empty sample → null. */
export function meanMs(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export interface TimingStatPair {
  medianMs: number | null;
  meanMs: number | null;
}

export interface TimingStats {
  createdToPaid: TimingStatPair;
  paidToProvisioned: TimingStatPair;
  orders: number;
}

/**
 * Timing statistics over SUCCESSFUL CHAINS ONLY (D-04/ANL-10):
 * status 'provisioned' AND paidAt AND provisionedKeyId all present. Failed,
 * canceled, refunded, pending and null-paidAt / null-key rows are excluded
 * defensively here — the 09-02 loader applies the same filter in SQL (belt
 * and braces).
 *
 * paidToProvisioned uses the documented updatedAt proxy: markProvisioned is
 * the terminal-success transition, and the status === 'provisioned' scope
 * excludes any later updatedAt touch (a chargeback would move updatedAt to
 * the refund instant), so the proxy cannot drift with refund activity.
 */
export function timingStats(rows: FunnelRow[]): TimingStats {
  const done = rows.filter(
    (o) => o.status === "provisioned" && o.paidAt !== null && o.provisionedKeyId !== null,
  );
  const createdToPaid = done.map((o) => o.paidAt!.getTime() - o.createdAt.getTime());
  const paidToProvisioned = done.map((o) => o.updatedAt.getTime() - o.paidAt!.getTime());
  return {
    createdToPaid: {
      medianMs: medianMs(createdToPaid),
      meanMs: meanMs(createdToPaid),
    },
    paidToProvisioned: {
      medianMs: medianMs(paidToProvisioned),
      meanMs: meanMs(paidToProvisioned),
    },
    orders: done.length,
  };
}
