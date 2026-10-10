// Referral program + wallet ledger.
//
// Earnings model:
// - Every account lazily owns a public code (`3SET-XXXXXX`, ensured on first
//   use). A code arriving via `?ref=` / register / bot `/start` pins
//   `referredById` once — first valid code wins, never rewritten, never self.
// - On the referred account's FIRST paid order, two credits land:
//   inviter: global percent-of-order | fixed, overridden per-user by
//   `customInviterReward` (fixed RUB); invitee: global fixed bonus (0 = off).
//   The [userId, reason, refId] unique makes the credit idempotent under
//   concurrent first payments (P2002 → already credited).
// - Balance is SUM(wallet_tx.amount). Orders may spend it (`order_spend`);
//   withdrawals reserve via `withdrawal_hold` and refund on reject.
//
// Globals live in `settings` (admin-editable, cached per process):
// `referral.inviterKind` percent|fixed (default percent),
// `referral.inviterValue` (default 10), `referral.inviteeValue` (default 0),
// `referral.minWithdraw` (default 500).
import { randomBytes } from "node:crypto";
import { prisma } from "./prisma";
import { logger } from "./logger";

export const REFERRAL_CODE_RE = /^3SET-[A-Z0-9]{6}$/;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export type WalletReason =
  | "referral_bonus"
  | "order_spend"
  | "order_spend_refund"
  | "withdrawal_hold"
  | "withdrawal_refund";

export interface ReferralSettings {
  inviterKind: "percent" | "fixed";
  inviterValue: number;
  inviteeValue: number;
  minWithdraw: number;
}

const DEFAULTS: ReferralSettings = {
  inviterKind: "percent",
  inviterValue: 10,
  inviteeValue: 0,
  minWithdraw: 500,
};

const SETTING_KEYS = [
  "referral.inviterKind",
  "referral.inviterValue",
  "referral.inviteeValue",
  "referral.minWithdraw",
] as const;

export async function getReferralSettings(): Promise<ReferralSettings> {
  const rows = await prisma.setting.findMany({
    where: { key: { in: [...SETTING_KEYS] } },
    select: { key: true, value: true },
  });
  const byKey = new Map(rows.map((row) => [row.key, row.value]));
  const kind = byKey.get("referral.inviterKind");
  const num = (key: string, fallback: number): number => {
    const raw = byKey.get(key);
    if (raw === undefined) return fallback;
    const parsed = Number(raw);
    return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : fallback;
  };
  return {
    inviterKind: kind === "fixed" ? "fixed" : "percent",
    inviterValue: num("referral.inviterValue", DEFAULTS.inviterValue),
    inviteeValue: num("referral.inviteeValue", DEFAULTS.inviteeValue),
    minWithdraw: num("referral.minWithdraw", DEFAULTS.minWithdraw),
  };
}

export async function setReferralSettings(
  input: Partial<ReferralSettings>,
): Promise<ReferralSettings> {
  const entries: [string, string][] = [];
  if (input.inviterKind === "percent" || input.inviterKind === "fixed") {
    entries.push(["referral.inviterKind", input.inviterKind]);
  }
  if (input.inviterValue !== undefined) {
    const v = Math.max(0, Math.floor(input.inviterValue));
    entries.push(["referral.inviterValue", String(Math.min(v, 1_000_000))]);
  }
  if (input.inviteeValue !== undefined) {
    entries.push(["referral.inviteeValue", String(Math.max(0, Math.floor(input.inviteeValue)))]);
  }
  if (input.minWithdraw !== undefined) {
    entries.push(["referral.minWithdraw", String(Math.max(0, Math.floor(input.minWithdraw)))]);
  }
  for (const [key, value] of entries) {
    await prisma.setting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
  }
  return getReferralSettings();
}

function randomCode(): string {
  const bytes = randomBytes(6);
  let suffix = "";
  for (const byte of bytes) suffix += CODE_ALPHABET[byte! % CODE_ALPHABET.length];
  return `3SET-${suffix}`;
}

/**
 * Lazily ensure the account's public referral code. Retries on P2002
 * collisions (6-char space is large; a retry loop with a cap is enough).
 */
export async function ensureReferralCode(userId: number): Promise<string> {
  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { referralCode: true },
  });
  if (existing?.referralCode) return existing.referralCode;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      // Re-read inside the loop: a concurrent ensure may have won already.
      const current = await prisma.user.findUnique({
        where: { id: userId },
        select: { referralCode: true },
      });
      if (current?.referralCode) return current.referralCode;
      const updated = await prisma.user.update({
        where: { id: userId },
        data: { referralCode: randomCode() },
        select: { referralCode: true },
      });
      if (updated.referralCode) return updated.referralCode;
    } catch (err: unknown) {
      if (
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        (err as { code: unknown }).code === "P2002"
      ) {
        continue;
      }
      throw err;
    }
  }
  const fallback = await prisma.user.findUnique({
    where: { id: userId },
    select: { referralCode: true },
  });
  if (fallback?.referralCode) return fallback.referralCode;
  throw new Error("referral:code_failed");
}

/**
 * Pin the inviter once. No-ops when the account already has one, when the
 * code is unknown/malformed, or when it resolves to self. Returns the
 * inviter userId when pinned, null otherwise.
 */
export async function pinReferrer(userId: number, rawCode: string): Promise<number | null> {
  const code = rawCode.trim().toUpperCase();
  if (!REFERRAL_CODE_RE.test(code)) return null;
  const inviter = await prisma.user.findUnique({
    where: { referralCode: code },
    select: { id: true },
  });
  if (!inviter || inviter.id === userId) return null;
  const claimed = await prisma.user.updateMany({
    where: { id: userId, referredById: null },
    data: { referredById: inviter.id },
  });
  // count === 0: already pinned (first wins) or the row is gone.
  if (claimed.count !== 1) return null;
  // Best-effort partner push — never awaited, never throws (see module).
  const { notifyReferralPinned } = await import("./partner-notify");
  notifyReferralPinned(inviter.id);
  return inviter.id;
}

/** Wallet balance = SUM(amount). Single-row aggregate, no caching. */
export async function walletBalance(userId: number): Promise<number> {
  const result = await prisma.walletTx.aggregate({
    where: { userId },
    _sum: { amount: true },
  });
  return result._sum.amount ?? 0;
}

export interface ReferralSummary {
  code: string;
  referrals: number;
  earned: number;
  balance: number;
}

/** Cabinet + bot stats: code (ensured), referral count, lifetime earnings. */
export async function getReferralSummary(userId: number): Promise<ReferralSummary> {
  const code = await ensureReferralCode(userId);
  const [referrals, earned, balance] = await Promise.all([
    prisma.user.count({ where: { referredById: userId } }),
    prisma.walletTx.aggregate({
      where: { userId, reason: "referral_bonus" },
      _sum: { amount: true },
    }),
    walletBalance(userId),
  ]);
  return {
    code,
    referrals,
    earned: earned._sum.amount ?? 0,
    balance,
  };
}

/**
 * Credit both sides on the referred account's first paid order. Called with
 * the order's (userId, finalAmount) AFTER the pending→paid claim wins, so it
 * runs once per order; the wallet unique makes it once per referral even if
 * two first orders race. P2002 on either insert → already credited.
 */
export async function creditReferralForPaidOrder(
  userId: number,
  finalAmount: number,
): Promise<void> {
  const referred = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, referredById: true },
  });
  const inviterId = referred?.referredById;
  if (!inviterId) return;

  // First-paid-order gate: a referral_bonus already pointing at this account
  // means an earlier order credited both sides.
  const existing = await prisma.walletTx.findFirst({
    where: { reason: "referral_bonus", refId: String(userId) },
    select: { id: true },
  });
  if (existing) return;

  const settings = await getReferralSettings();
  const inviter = await prisma.user.findUnique({
    where: { id: inviterId },
    select: { id: true, customInviterReward: true, customInviterKind: true },
  });
  if (!inviter) return;

  // Per-user override (partner rate): an explicit kind wins; an amount
  // without a kind keeps the legacy fixed-RUB meaning; otherwise global.
  const kind =
    inviter.customInviterKind === "percent" || inviter.customInviterKind === "fixed"
      ? inviter.customInviterKind
      : inviter.customInviterReward !== null && inviter.customInviterReward !== undefined
        ? "fixed"
        : settings.inviterKind;
  const value = inviter.customInviterReward ?? settings.inviterValue;
  const inviterAmount =
    kind === "fixed"
      ? Math.max(0, value)
      : Math.floor((Math.max(0, finalAmount) * Math.min(100, Math.max(0, value))) / 100);

  try {
    if (inviterAmount > 0) {
      await prisma.walletTx.create({
        data: {
          userId: inviter.id,
          amount: inviterAmount,
          reason: "referral_bonus",
          refId: String(userId),
        },
      });
      // Best-effort partner push — never awaited, never throws (see module).
      const { notifyReferralCredited } = await import("./partner-notify");
      notifyReferralCredited(inviter.id, inviterAmount);
    }
    if (settings.inviteeValue > 0) {
      await prisma.walletTx.create({
        data: {
          userId,
          amount: settings.inviteeValue,
          reason: "referral_bonus",
          refId: String(userId),
        },
      });
    }
    logger.info({
      route: "referrals",
      outcome: "credited",
      referral: userId,
      inviter: inviter.id,
    });
  } catch (err: unknown) {
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code: unknown }).code === "P2002"
    ) {
      return; // concurrent first payment already credited
    }
    throw err;
  }
}

export interface WithdrawalRequest {
  id: string;
  amount: number;
  status: string;
}

/**
 * Reserve a payout: validates the minimum + balance, then atomically debits
 * the hold and creates the request. The hold row and the request are one
 * transaction — no half-reserved withdrawals.
 */
export async function requestWithdrawal(
  userId: number,
  amount: number,
  contact: string | null,
): Promise<WithdrawalRequest> {
  const settings = await getReferralSettings();
  const value = Math.floor(amount);
  if (!Number.isSafeInteger(value) || value < settings.minWithdraw) {
    throw new Error("withdrawal:too_small");
  }
  const balance = await walletBalance(userId);
  if (balance < value) throw new Error("withdrawal:insufficient");

  const withdrawal = await prisma.$transaction(async (tx) => {
    const row = await tx.withdrawal.create({
      data: { userId, amount: value, status: "pending", contact },
      select: { id: true, amount: true, status: true },
    });
    await tx.walletTx.create({
      data: { userId, amount: -value, reason: "withdrawal_hold", refId: row.id },
    });
    return row;
  });
  logger.info({ route: "referrals", outcome: "withdrawal_requested", userId });
  return withdrawal;
}

export async function listOwnWithdrawals(
  userId: number,
): Promise<{ id: string; amount: number; status: string; createdAt: Date }[]> {
  return prisma.withdrawal.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { id: true, amount: true, status: true, createdAt: true },
  });
}

export async function listWithdrawals(
  status: "pending" | "approved" | "rejected" | "all" = "pending",
): Promise<
  { id: string; userId: number; amount: number; status: string; contact: string | null; createdAt: Date }[]
> {
  return prisma.withdrawal.findMany({
    where: status === "all" ? {} : { status },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { id: true, userId: true, amount: true, status: true, contact: true, createdAt: true },
  });
}

/**
 * Decide a withdrawal (administrator). Approve keeps the hold debit;
 * reject refunds it. Both paths are idempotent on the pending→X claim —
 * a double-decide returns the current row unchanged.
 */
export async function decideWithdrawal(
  id: string,
  approve: boolean,
): Promise<{ id: string; status: string } | null> {
  const claimed = await prisma.withdrawal.updateMany({
    where: { id, status: "pending" },
    data: { status: approve ? "approved" : "rejected", decidedAt: new Date() },
  });
  if (claimed.count === 0) {
    const row = await prisma.withdrawal.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    return row;
  }
  if (!approve) {
    const row = await prisma.withdrawal.findUnique({
      where: { id },
      select: { userId: true, amount: true },
    });
    if (row) {
      await prisma.walletTx.create({
        data: {
          userId: row.userId,
          amount: row.amount,
          reason: "withdrawal_refund",
          refId: id,
        },
      });
    }
  }
  logger.info({ route: "referrals", outcome: approve ? "withdrawal_approved" : "withdrawal_rejected", id });
  return { id, status: approve ? "approved" : "rejected" };
}
