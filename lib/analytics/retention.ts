// Term-end events + retention/churn window metrics — PURE module (no Prisma,
// no next/*, no React). Every number Phase 8 retention cards/table display
// derives from these functions.
//
// Money / term contract:
//   - Cursor is IDENTICAL to buildKeyTerms (series.ts:103-108): a renew
//     extends from max(cursor ?? paidAt, paidAt) + days (D-06). An invariant
//     test asserts events.at(-1).end === buildKeyTerms(...).termEnd per key.
//   - Upgrade ops (days null) never enter the chain and are never renewals
//     (D-09). nextPaidAt is the next chain op only.
//   - lostMrr uses the D-07 literal finalAmount × 30 / days (A1), NOT cashOf.
//     A fully wallet-covered churned term still contributes its finalAmount
//     equivalent; cashOf is reserved for margin/LTV (D-13).
//   - activeAtStart is order-bearing term coverage incl. 0 ₽ bonus terms (A7)
//     — deliberately NOT activeKeysAt, which drops mrr === 0 keys (Pitfall 3).
//   - ChurnedKeys and lostMrr are cohort-clamped to activeAtStart (A6) so rates
//     never exceed 100 %.
//
// Grace (D-05): inclusive 7-day boundary on epoch millis (`<=`). A term whose
// next chain paidAt lands at end + 7d is renewed; +1 ms is a win-back (the
// earlier term churns). pending (A5) exists only inside grace with no next
// paidAt — counted in expiring, in neither renewed nor churned.
//
// A2 bonus-day override: when liveExpiry is supplied and later than the LAST
// event's end for a keyRef, extend that last end only. Historical terms are
// never adjusted (documented approximation — redeemBonusDays writes no Order).
import type { PaidOrderRow } from "./series";
import { keyRefOf, totalMrrAt } from "./mrr";

const DAY_MS = 86_400_000;

export interface TermEvent {
  keyRef: string;
  start: Date;
  end: Date;
  days: number;
  op: PaidOrderRow;
  nextPaidAt: Date | null;
}

export type TermOutcome = "open" | "renewed" | "pending" | "churned";

export interface RetentionWindow {
  start: Date;
  endExclusive: Date;
  now: Date;
}

export interface RetentionResult {
  renewalRate: number | null;
  renewedKeys: number;
  expiringKeys: number;
  logoChurnRate: number | null;
  churnedKeys: number;
  activeKeysAtStart: number;
  revenueChurnRate: number | null;
  lostMrr: number;
  mrrAtStart: number;
}

/**
 * Classify a term-end event against `now` with an inclusive grace window.
 * Default grace = 7 × DAY_MS (D-05).
 */
export function classifyTerm(
  e: TermEvent,
  now: Date,
  graceMs: number = 7 * DAY_MS,
): TermOutcome {
  if (e.end.getTime() > now.getTime()) return "open";
  if (e.nextPaidAt && e.nextPaidAt.getTime() <= e.end.getTime() + graceMs) return "renewed";
  if (now.getTime() < e.end.getTime() + graceMs) return "pending";
  return "churned";
}

/**
 * Emit one TermEvent per new|renew chain op. Cursor math mirrors
 * buildKeyTerms (series.ts:103-108) byte-for-byte so the last event end
 * equals KeyTerm.termEnd. Optional liveExpiry extends only the latest event
 * per keyRef when KeyCache.expiresAt is later (A2 bonus-day override).
 */
export function buildKeyTermEvents(
  paid: PaidOrderRow[],
  liveExpiry?: Map<string, Date>,
): TermEvent[] {
  const groups = new Map<string, PaidOrderRow[]>();
  for (const op of paid) {
    if (!op.paidAt) continue;
    const ref = keyRefOf(op);
    if (!ref) continue;
    const list = groups.get(ref) ?? [];
    list.push(op);
    groups.set(ref, list);
  }

  const events: TermEvent[] = [];
  for (const [keyRef, ops] of groups) {
    const chain = ops
      .filter((op) => (op.kind === "new" || op.kind === "renew") && op.days !== null)
      .sort((a, b) => (a.paidAt as Date).getTime() - (b.paidAt as Date).getTime());
    if (chain.length === 0) continue;

    let cursorMs: number | null = null;
    for (let i = 0; i < chain.length; i++) {
      const op = chain[i]!;
      const paidAtMs = (op.paidAt as Date).getTime();
      // Identical to series.ts:103-108 — start = max(cursor ?? paidAt, paidAt),
      // end = start + days; cursor advances to end.
      const startMs = Math.max(cursorMs ?? paidAtMs, paidAtMs);
      const endMs = startMs + (op.days as number) * DAY_MS;
      events.push({
        keyRef,
        start: new Date(startMs),
        end: new Date(endMs),
        days: op.days as number,
        op,
        nextPaidAt: chain[i + 1]?.paidAt ?? null,
      });
      cursorMs = endMs;
    }

    // A2: extend ONLY the latest term when liveExpiry is later.
    // Events for this keyRef were just appended contiguously, so the last
    // matching index is the latest term.
    if (liveExpiry) {
      const live = liveExpiry.get(keyRef);
      if (live) {
        for (let i = events.length - 1; i >= 0; i--) {
          if (events[i]!.keyRef !== keyRef) continue;
          if (live.getTime() > events[i]!.end.getTime()) {
            events[i] = { ...events[i]!, end: live };
          }
          break;
        }
      }
    }
  }
  return events;
}

/**
 * Retention / churn metrics over a half-open window [start, endExclusive).
 * Rates are null on zero denominators (D-07/D-08/D-09 «—», never 0 % / ∞).
 * Exact rationals — no rounding in this module.
 */
export function retentionForWindow(
  events: TermEvent[],
  orders: PaidOrderRow[],
  window: RetentionWindow,
): RetentionResult {
  const startMs = window.start.getTime();
  const endExMs = window.endExclusive.getTime();

  const inWindow = events.filter(
    (e) => e.end.getTime() >= startMs && e.end.getTime() < endExMs,
  );
  const expiringKeys = inWindow.length;

  // A7: order-bearing coverage at window start, incl. 0 ₽ bonus terms.
  const activeAtStart = new Set<string>();
  for (const e of events) {
    if (e.start.getTime() <= startMs && startMs < e.end.getTime()) {
      activeAtStart.add(e.keyRef);
    }
  }

  let renewedKeys = 0;
  const churnedInWindow: TermEvent[] = [];
  for (const e of inWindow) {
    const outcome = classifyTerm(e, window.now);
    if (outcome === "renewed") renewedKeys += 1;
    else if (outcome === "churned") churnedInWindow.push(e);
  }

  // A6 cohort clamp: only keys active at start count toward logo/revenue churn.
  const churnedRefs = new Set<string>();
  let lostMrr = 0;
  for (const e of churnedInWindow) {
    if (!activeAtStart.has(e.keyRef)) continue;
    churnedRefs.add(e.keyRef);
    // A1 / D-07 literal — NOT cashOf.
    lostMrr += (e.op.finalAmount * 30) / e.days;
  }
  const churnedKeys = churnedRefs.size;

  const mrrAtStart = totalMrrAt(orders, window.start);

  const renewalRate = expiringKeys === 0 ? null : renewedKeys / expiringKeys;
  const logoChurnRate =
    activeAtStart.size === 0 ? null : churnedKeys / activeAtStart.size;
  const revenueChurnRate = mrrAtStart === 0 ? null : lostMrr / mrrAtStart;

  return {
    renewalRate,
    renewedKeys,
    expiringKeys,
    logoChurnRate,
    churnedKeys,
    activeKeysAtStart: activeAtStart.size,
    revenueChurnRate,
    lostMrr,
    mrrAtStart,
  };
}
