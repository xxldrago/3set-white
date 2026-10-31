// lib/analytics/rfm.ts — PURE module (no Prisma / next / React imports).
//
// Per-user RFM snapshot derivation + rule-based segment assignment (D-01..D-06,
// D-09, D-13). Consumed by lib/analytics/rfm-service.ts (11-02) which owns DB
// reads and the user_rfm upsert; this file is unit-testable without Postgres.
import { mskDayLabel, mskDayStartInstant, addMonths } from "./time";

export const DAY_MS = 86_400_000;
export const TRAILING_12M_MONTHS = 12;

export type SegmentSlug =
  | "trial-only"
  | "new payer"
  | "VIP"
  | "active"
  | "at-risk"
  | "churned"
  | "sleeping";

export const SEGMENT_SLUGS: readonly SegmentSlug[] = [
  "trial-only", "new payer", "VIP", "active", "at-risk", "churned", "sleeping",
] as const;

export interface RfmThresholds {
  newPayerDays: number; // default 30
  activeDays: number;   // default 30
  atRiskDays: number;   // default 60
  churnedDays: number;  // default 60
  vipPercent: number;   // default 5, 1..100
}

export const DEFAULT_THRESHOLDS: RfmThresholds = {
  newPayerDays: 30,
  activeDays: 30,
  atRiskDays: 60,
  churnedDays: 60,
  vipPercent: 5,
};

export interface RfmUserInput {
  userId: number;
  createdAt: Date;
  trialUsed: boolean;
  // paid orders (status in paid/provisioning/provisioned) — ALL history
  paidOrders: { paidAt: Date; cash: number }[];
  // any non-trial KeyCache row with expiresAt > now
  coverageActive: boolean;
}

export interface RfmSnapshot {
  userId: number;
  recencyDays: number;       // trailing MSK days
  frequency: number;         // trailing 12 MSK months
  monetary: number | null;   // all-time cash; null when no paid orders
  segment: SegmentSlug;
}

/** MSK calendar-day difference (D-20). Never negative. */
export function daysBetweenMsk(a: Date, b: Date): number {
  const aDay = mskDayStartInstant(mskDayLabel(a)).getTime();
  const bDay = mskDayStartInstant(mskDayLabel(b)).getTime();
  return Math.max(0, Math.round((bDay - aDay) / DAY_MS));
}

export function recencyDaysOf(input: RfmUserInput, now: Date): number {
  if (input.paidOrders.length === 0) return daysBetweenMsk(input.createdAt, now);
  const lastPaid = input.paidOrders.reduce((m, o) =>
    o.paidAt.getTime() > m.getTime() ? o.paidAt : m, input.paidOrders[0]!.paidAt);
  return daysBetweenMsk(lastPaid, now);
}

export function frequencyOf(input: RfmUserInput, now: Date): number {
  // trailing 12 MSK months: orders with paidAt >= start of the MSK month 12 months ago
  const currentMonth = mskDayLabel(now).slice(0, 7) + "-01";
  const cutoffMonth = addMonths(currentMonth, -TRAILING_12M_MONTHS);
  const cutoffInstant = mskDayStartInstant(cutoffMonth);
  return input.paidOrders.filter((o) => o.paidAt.getTime() >= cutoffInstant.getTime()).length;
}

export function monetaryOf(input: RfmUserInput): number | null {
  if (input.paidOrders.length === 0) return null;
  return input.paidOrders.reduce((sum, o) => sum + o.cash, 0);
}

/** VIP = top vipPercent by monetary. Returns the set of userIds that are VIP. */
export function vipUserIds(
  entries: { userId: number; monetary: number }[],
  vipPercent: number,
): Set<number> {
  if (entries.length === 0) return new Set();
  const sorted = [...entries].sort((a, b) =>
    b.monetary - a.monetary || a.userId - b.userId);
  const k = Math.max(1, Math.round(sorted.length * (vipPercent / 100)));
  return new Set(sorted.slice(0, k).map((e) => e.userId));
}

export function vipThresholdValue(
  entries: { userId: number; monetary: number }[],
  vipPercent: number,
): number | null {
  const ids = vipUserIds(entries, vipPercent);
  if (ids.size === 0) return null;
  let min = Infinity;
  for (const e of entries) if (ids.has(e.userId) && e.monetary < min) min = e.monetary;
  return min === Infinity ? null : min;
}

export interface AssignSegmentArgs {
  trialUsed: boolean;
  paidOrderCount: number;   // all-time paid order count
  firstPaidAt: Date | null; // min paidAt
  lastPaidAt: Date | null;  // max paidAt
  monetary: number | null;
  coverageActive: boolean;
  now: Date;
  thresholds: RfmThresholds;
  isVip: boolean;
}

export function assignSegment(args: AssignSegmentArgs): SegmentSlug {
  const { trialUsed, paidOrderCount, firstPaidAt, lastPaidAt, coverageActive, now, thresholds } = args;

  // 1. trial-only (no paid orders) — includes the "no trial & no pay" fallback (D-06)
  if (paidOrderCount === 0) return "trial-only";

  // 2. new payer — first paid order within newPayerDays
  const firstPaidDays = firstPaidAt ? daysBetweenMsk(firstPaidAt, now) : Infinity;
  if (firstPaidDays <= thresholds.newPayerDays) return "new payer";

  // 3. VIP — top vipPercent by monetary (precomputed by caller)
  if (args.isVip) return "VIP";

  const lastPaidDays = lastPaidAt ? daysBetweenMsk(lastPaidAt, now) : Infinity;

  // 4. active — recent payment AND (coverage active OR renewed within 7 days)
  if (lastPaidDays <= thresholds.activeDays && (coverageActive || lastPaidDays <= 7)) {
    return "active";
  }

  // 5. at-risk — payment aging but coverage still active
  if (
    lastPaidDays > thresholds.activeDays &&
    lastPaidDays <= thresholds.atRiskDays &&
    coverageActive
  ) {
    return "at-risk";
  }

  // 6. churned — coverage expired
  if (!coverageActive) return "churned";

  // 7. sleeping — no recent payment but coverage still active (long tariff / bonus)
  if (lastPaidDays >= thresholds.churnedDays) return "sleeping";

  // Fallback for config where atRiskDays < churnedDays and coverage still active:
  // treat as at-risk rather than leaving unmatched.
  return "at-risk";
}

/** Build one snapshot from a user's raw inputs. VIP flag must be resolved by the caller (needs global monetary ranking). */
export function buildSnapshot(
  input: RfmUserInput,
  now: Date,
  thresholds: RfmThresholds,
  isVip: boolean,
): RfmSnapshot {
  const paidOrderCount = input.paidOrders.length;
  const firstPaidAt =
    paidOrderCount === 0
      ? null
      : input.paidOrders.reduce((m, o) =>
          o.paidAt.getTime() < m.getTime() ? o.paidAt : m, input.paidOrders[0]!.paidAt);
  const lastPaidAt =
    paidOrderCount === 0
      ? null
      : input.paidOrders.reduce((m, o) =>
          o.paidAt.getTime() > m.getTime() ? o.paidAt : m, input.paidOrders[0]!.paidAt);
  return {
    userId: input.userId,
    recencyDays: recencyDaysOf(input, now),
    frequency: frequencyOf(input, now),
    monetary: monetaryOf(input),
    segment: assignSegment({
      trialUsed: input.trialUsed,
      paidOrderCount,
      firstPaidAt,
      lastPaidAt,
      monetary: monetaryOf(input),
      coverageActive: input.coverageActive,
      now,
      thresholds,
      isVip,
    }),
  };
}

/** Resolve VIP flags across a cohort, then build snapshots. */
export function buildSnapshots(
  inputs: RfmUserInput[],
  now: Date,
  thresholds: RfmThresholds,
): RfmSnapshot[] {
  const vipEntries = inputs
    .map((i) => ({ userId: i.userId, monetary: monetaryOf(i) }))
    .filter((e): e is { userId: number; monetary: number } => e.monetary !== null);
  const vips = vipUserIds(vipEntries, thresholds.vipPercent);
  return inputs.map((i) => buildSnapshot(i, now, thresholds, vips.has(i.userId)));
}
