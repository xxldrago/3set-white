// lib/analytics/rfm-service.ts — DB loaders for Phase 11 RFM (SEG-01..05).
//
// Owns all Prisma reads/writes for the user_rfm snapshot + Setting thresholds.
// Pure derivation lives in ./rfm.ts; this module feeds plain rows into it.
import { prisma } from "../prisma";
import {
  DEFAULT_THRESHOLDS,
  SEGMENT_SLUGS,
  buildSnapshots,
  type RfmThresholds,
  type RfmUserInput,
  type SegmentSlug,
} from "./rfm";

const PAID = ["paid", "provisioning", "provisioned"] as const;

export interface SegmentSummary {
  segment: SegmentSlug;
  size: number;
  chatCount: number;
}

export interface SegmentsData {
  segments: SegmentSummary[];
  total: number;
}

export interface ThresholdsData {
  newPayerDays: number;
  activeDays: number;
  atRiskDays: number;
  churnedDays: number;
  vipPercent: number;
}

export interface RfmSnapshotRow {
  userId: number;
  recencyDays: number;
  frequency: number;
  monetary: number | null;
  segment: SegmentSlug;
  computedAt: Date;
}

/** Setting keys for thresholds. */
const THRESHOLD_KEYS = {
  newPayerDays: "rfm.threshold.newPayerDays",
  activeDays: "rfm.threshold.activeDays",
  atRiskDays: "rfm.threshold.atRiskDays",
  churnedDays: "rfm.threshold.churnedDays",
  vipPercent: "rfm.threshold.vipPercent",
} as const;

function parseIntSetting(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return fallback;
  return n;
}

export async function loadThresholds(): Promise<ThresholdsData> {
  try {
    const rows = await prisma.setting.findMany({
      where: { key: { in: Object.values(THRESHOLD_KEYS) } },
    });
    const map = new Map(rows.map((r) => [r.key, r.value]));
    const newPayerDays = parseIntSetting(map.get(THRESHOLD_KEYS.newPayerDays), DEFAULT_THRESHOLDS.newPayerDays);
    const activeDays = parseIntSetting(map.get(THRESHOLD_KEYS.activeDays), DEFAULT_THRESHOLDS.activeDays);
    const atRiskDays = parseIntSetting(map.get(THRESHOLD_KEYS.atRiskDays), DEFAULT_THRESHOLDS.atRiskDays);
    const churnedDays = parseIntSetting(map.get(THRESHOLD_KEYS.churnedDays), DEFAULT_THRESHOLDS.churnedDays);
    let vipPercent = parseIntSetting(map.get(THRESHOLD_KEYS.vipPercent), DEFAULT_THRESHOLDS.vipPercent);
    if (vipPercent < 1) vipPercent = DEFAULT_THRESHOLDS.vipPercent;
    if (vipPercent > 100) vipPercent = 100;
    return { newPayerDays, activeDays, atRiskDays, churnedDays, vipPercent };
  } catch {
    return { ...DEFAULT_THRESHOLDS };
  }
}

export async function saveThresholds(next: ThresholdsData): Promise<{
  thresholds: ThresholdsData;
  recompute: { users: number; upserted: number; computedAt: Date };
}> {
  const validated: ThresholdsData = {
    newPayerDays: Math.max(1, Math.trunc(next.newPayerDays)),
    activeDays: Math.max(1, Math.trunc(next.activeDays)),
    atRiskDays: Math.max(1, Math.trunc(next.atRiskDays)),
    churnedDays: Math.max(1, Math.trunc(next.churnedDays)),
    vipPercent: Math.min(100, Math.max(1, Math.trunc(next.vipPercent))),
  };

  await prisma.$transaction(
    Object.entries(THRESHOLD_KEYS).map(([field, key]) =>
      prisma.setting.upsert({
        where: { key },
        create: { key, value: String(validated[field as keyof ThresholdsData]) },
        update: { value: String(validated[field as keyof ThresholdsData]) },
      }),
    ),
  );

  const recompute = await recomputeAllRfm();
  const thresholds = await loadThresholds();
  return { thresholds, recompute };
}

export async function recomputeAllRfm(): Promise<{
  users: number;
  upserted: number;
  computedAt: Date;
}> {
  const now = new Date();

  const users = await prisma.user.findMany({
    select: { id: true, createdAt: true, trialUsed: true },
  });

  const paidOrders = await prisma.order.findMany({
    where: { status: { in: [...PAID] }, paidAt: { not: null } },
    select: { userId: true, paidAt: true, finalAmount: true, balanceUsed: true },
  });

  const keys = await prisma.keyCache.findMany({
    where: { isTrial: false, expiresAt: { not: null } },
    select: { userId: true, expiresAt: true },
  });

  const ordersByUser = new Map<number, { paidAt: Date; cash: number }[]>();
  for (const o of paidOrders) {
    if (!o.paidAt) continue;
    const list = ordersByUser.get(o.userId) ?? [];
    list.push({ paidAt: o.paidAt, cash: Math.max(0, o.finalAmount - o.balanceUsed) });
    ordersByUser.set(o.userId, list);
  }

  const coverageByUser = new Map<number, boolean>();
  for (const k of keys) {
    if (k.expiresAt && k.expiresAt.getTime() > now.getTime()) {
      coverageByUser.set(k.userId, true);
    }
  }

  const inputs: RfmUserInput[] = users.map((u) => ({
    userId: u.id,
    createdAt: u.createdAt,
    trialUsed: u.trialUsed,
    paidOrders: ordersByUser.get(u.id) ?? [],
    coverageActive: coverageByUser.get(u.id) ?? false,
  }));

  const thresholds = await loadThresholds();
  const snapshots = buildSnapshots(inputs, now, thresholds);

  const computedAt = now;
  let upserted = 0;
  await prisma.$transaction(
    snapshots.map((s) =>
      prisma.userRfm.upsert({
        where: { userId: s.userId },
        create: {
          userId: s.userId,
          recencyDays: s.recencyDays,
          frequency: s.frequency,
          monetary: s.monetary,
          segment: s.segment,
          computedAt,
        },
        update: {
          recencyDays: s.recencyDays,
          frequency: s.frequency,
          monetary: s.monetary,
          segment: s.segment,
          computedAt,
        },
      }),
    ),
  );
  upserted = snapshots.length;

  return { users: users.length, upserted, computedAt };
}

export async function loadSegments(): Promise<SegmentsData> {
  const rows = await prisma.userRfm.groupBy({
    by: ["segment"],
    _count: { _all: true },
  });
  const countMap = new Map(rows.map((r) => [r.segment, r._count._all]));

  // chatCount per segment: users in segment with chatId != null
  const chatRows = await prisma.user.findMany({
    where: { rfm: { isNot: null }, chatId: { not: null } },
    select: { rfm: { select: { segment: true } } },
  });
  const chatMap = new Map<string, number>();
  for (const u of chatRows) {
    const seg = u.rfm?.segment;
    if (seg) chatMap.set(seg, (chatMap.get(seg) ?? 0) + 1);
  }

  const segments: SegmentSummary[] = SEGMENT_SLUGS.map((seg) => ({
    segment: seg,
    size: countMap.get(seg) ?? 0,
    chatCount: chatMap.get(seg) ?? 0,
  }));

  const total = segments.reduce((s, x) => s + x.size, 0);
  return { segments, total };
}

export async function loadRfmForUser(userId: number): Promise<RfmSnapshotRow | null> {
  const row = await prisma.userRfm.findUnique({ where: { userId } });
  if (!row) return null;
  return {
    userId: row.userId,
    recencyDays: row.recencyDays,
    frequency: row.frequency,
    monetary: row.monetary,
    segment: row.segment as SegmentSlug,
    computedAt: row.computedAt,
  };
}
