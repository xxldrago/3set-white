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

/** Personal subdomain handle: `<name>.3set.online`. */
export const SUBDOMAIN_RE = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/;
/** Never assignable — infrastructure + product surfaces. */
export const RESERVED_SUBDOMAINS = new Set([
  "www",
  "my",
  "api",
  "admin",
  "app",
  "status",
  "mail",
  "cdn",
  "static",
  "sub",
  "smtp",
  "ftp",
  "blog",
  "support",
  "pay",
]);

export function normalizeSubdomain(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isSubdomainAssignable(raw: string): boolean {
  const name = normalizeSubdomain(raw);
  return SUBDOMAIN_RE.test(name) && !RESERVED_SUBDOMAINS.has(name);
}

/** Resolve `<name>.3set.online` → the owner's referral code (null = free/unknown). */
export async function resolveSubdomainOwner(
  raw: string,
): Promise<{ userId: number; code: string } | null> {
  const name = normalizeSubdomain(raw);
  if (!isSubdomainAssignable(name)) return null;
  const owner = await prisma.user.findUnique({
    where: { customSubdomain: name },
    select: { id: true },
  });
  if (!owner) return null;
  const code = await ensureReferralCode(owner.id);
  return { userId: owner.id, code };
}

export type SubdomainOutcome = "ok" | "taken" | "invalid" | "not_found";

/**
 * Assign (or clear with null) a personal subdomain. Uniqueness is the arbiter
 * (P2002 → taken). Clearing is unconditional.
 */
export async function setCustomSubdomain(
  userId: number,
  raw: string | null,
): Promise<SubdomainOutcome> {
  if (raw === null || raw.trim().length === 0) {
    await prisma.user.update({ where: { id: userId }, data: { customSubdomain: null } }).catch(
      () => null,
    );
    return "ok";
  }
  const name = normalizeSubdomain(raw);
  if (!isSubdomainAssignable(name)) return "invalid";
  try {
    await prisma.user.update({ where: { id: userId }, data: { customSubdomain: name } });
    return "ok";
  } catch (err: unknown) {
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code: unknown }).code === "P2002"
    ) {
      return "taken";
    }
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code: unknown }).code === "P2025"
    ) {
      return "not_found";
    }
    throw err;
  }
}

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
  /** What regular (non-partner) users earn: bonus days or money. */
  userMode: "days" | "money";
  /** Bonus days for a non-partner inviter per referred first payment. */
  userDays: number;
  /** Bonus days for the invited account (always days, first payment only). */
  inviteeDays: number;
  minWithdraw: number;
}

const DEFAULTS: ReferralSettings = {
  inviterKind: "percent",
  inviterValue: 10,
  inviteeValue: 0,
  userMode: "money",
  userDays: 5,
  inviteeDays: 3,
  minWithdraw: 500,
};

const SETTING_KEYS = [
  "referral.inviterKind",
  "referral.inviterValue",
  "referral.inviteeValue",
  "referral.userMode",
  "referral.userDays",
  "referral.inviteeDays",
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
  const mode = byKey.get("referral.userMode");
  return {
    inviterKind: kind === "fixed" ? "fixed" : "percent",
    inviterValue: num("referral.inviterValue", DEFAULTS.inviterValue),
    inviteeValue: num("referral.inviteeValue", DEFAULTS.inviteeValue),
    userMode: mode === "days" ? "days" : "money",
    userDays: num("referral.userDays", DEFAULTS.userDays),
    inviteeDays: num("referral.inviteeDays", DEFAULTS.inviteeDays),
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
  if (input.userMode === "days" || input.userMode === "money") {
    entries.push(["referral.userMode", input.userMode]);
  }
  if (input.userDays !== undefined) {
    entries.push(["referral.userDays", String(Math.max(0, Math.floor(input.userDays)))]);
  }
  if (input.inviteeDays !== undefined) {
    entries.push(["referral.inviteeDays", String(Math.max(0, Math.floor(input.inviteeDays)))]);
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

export interface RateView {
  kind: string;
  value: number;
}

export interface ReferralSummary {
  code: string;
  referrals: number;
  earned: number;
  balance: number;
  bonusDays: number;
  /** What this account earns per referred deal (resolved effective rate). */
  myRate: RateView;
  /** What this account shares with its own referrals (null = global). */
  downline: RateView | null;
  isPartner: boolean;
  userMode: "days" | "money";
}

/** Cabinet + bot stats: code (ensured), referral count, lifetime earnings. */
export async function getReferralSummary(userId: number): Promise<ReferralSummary> {
  const code = await ensureReferralCode(userId);
  const [referrals, earned, balance, me, settings] = await Promise.all([
    prisma.user.count({ where: { referredById: userId } }),
    prisma.walletTx.aggregate({
      where: { userId, reason: "referral_bonus" },
      _sum: { amount: true },
    }),
    walletBalance(userId),
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        telegramId: true,
        referredById: true,
        bonusDays: true,
        customInviterReward: true,
        customInviterKind: true,
        subRateKind: true,
        subRateValue: true,
      },
    }),
    getReferralSettings(),
  ]);
  const partnerEarner = await isPartner(userId, me?.telegramId ?? null);
  const myRate: RateView = me
    ? await resolveEarnerRate(me, settings, partnerEarner).then((rate) => ({
        kind: rate.kind,
        value: rate.value,
      }))
    : { kind: "days", value: settings.userDays };
  return {
    code,
    referrals,
    earned: earned._sum.amount ?? 0,
    balance,
    bonusDays: Math.max(0, me?.bonusDays ?? 0),
    myRate,
    downline:
      me?.subRateKind && me.subRateValue !== null && me.subRateValue !== undefined
        ? { kind: me.subRateKind, value: me.subRateValue }
        : null,
    isPartner: partnerEarner,
    userMode: settings.userMode,
  };
}

export type EarningRate =
  | { kind: "percent" | "fixed"; value: number }
  | { kind: "days"; value: number };

export interface DownlineRate {
  kind: "percent" | "fixed" | "days";
  value: number;
}

function moneyOf(rate: EarningRate, finalAmount: number): number {
  if (rate.kind === "fixed") return Math.max(0, rate.value);
  if (rate.kind === "percent") {
    return Math.floor((Math.max(0, finalAmount) * Math.min(100, Math.max(0, rate.value))) / 100);
  }
  return 0;
}

async function isPartner(userId: number, telegramId: bigint | null): Promise<boolean> {
  if (telegramId === null) return false;
  const row = await prisma.adminUser
    .findUnique({ where: { telegramId }, select: { role: true } })
    .catch(() => null);
  return row?.role === "partner";
}

interface EarnerRow {
  id: number;
  telegramId: bigint | null;
  referredById: number | null;
  customInviterReward: number | null;
  customInviterKind: string | null;
}

/**
 * Effective earning rate of X for bringing a buyer:
 * admin custom (percent/fixed/days) → inviter-set downline rate →
 * partner global money → user mode (bonus days or global money).
 * Legacy amount-only customs keep the fixed-RUB meaning.
 */
async function resolveEarnerRate(
  earner: EarnerRow,
  settings: ReferralSettings,
  partnerEarner: boolean,
): Promise<EarningRate> {
  if (
    earner.customInviterKind === "percent" ||
    earner.customInviterKind === "fixed" ||
    earner.customInviterKind === "days"
  ) {
    return {
      kind: earner.customInviterKind,
      value: Math.max(0, earner.customInviterReward ?? 0),
    };
  }
  if (earner.customInviterReward !== null && earner.customInviterReward !== undefined) {
    return { kind: "fixed", value: Math.max(0, earner.customInviterReward) };
  }
  if (partnerEarner) {
    return { kind: settings.inviterKind, value: Math.max(0, settings.inviterValue) };
  }
  if (earner.referredById !== null) {
    const up = await prisma.user.findUnique({
      where: { id: earner.referredById },
      select: { subRateKind: true, subRateValue: true },
    });
    if (
      (up?.subRateKind === "percent" || up?.subRateKind === "fixed" || up?.subRateKind === "days") &&
      up.subRateValue !== null &&
      up.subRateValue !== undefined
    ) {
      return { kind: up.subRateKind, value: Math.max(0, up.subRateValue) };
    }
  }
  if (settings.userMode === "days") {
    return { kind: "days", value: Math.max(0, settings.userDays) };
  }
  return { kind: settings.inviterKind, value: Math.max(0, settings.inviterValue) };
}

async function creditDays(userId: number, days: number, refId: string): Promise<void> {
  if (days <= 0) return;
  await prisma.walletTx.create({
    data: { userId, amount: 0, reason: "referral_days", refId },
  });
  await prisma.user.update({
    where: { id: userId },
    data: { bonusDays: { increment: days } },
  });
}

/**
 * Credit both sides on a paid order. Called with the order's (userId,
 * finalAmount, orderId) AFTER the pending→paid claim wins, so it runs once
 * per order.
 *
 * Direct leg (B earns for bringing C): B's effective rate (admin custom →
 * inviter-set downline → partner-global money → user bonus days). Money
 * lands in the wallet, days in `bonusDays`. Non-partner B earns once (first
 * payment); partner B earns on every payment (order-scoped refId).
 *
 * Upline leg: when B itself was referred by a PARTNER A, A nets the
 * residual — A's money entitlement minus B's money share, floored at zero —
 * on every payment. Non-partner uplines earn nothing indirect. The invitee
 * gets `inviteeDays` bonus days (days-mode) or the fixed money bonus
 * (money-mode), first payment only.
 *
 * Every insert is idempotent via the wallet unique (P2002 → already
 * credited), so concurrent payments can never double-pay.
 */
export async function creditReferralForPaidOrder(
  userId: number,
  finalAmount: number,
  orderId: string,
): Promise<void> {
  const referred = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, referredById: true },
  });
  const inviterId = referred?.referredById;
  if (!inviterId) return;

  const settings = await getReferralSettings();
  const inviter = await prisma.user.findUnique({
    where: { id: inviterId },
    select: {
      id: true,
      telegramId: true,
      referredById: true,
      customInviterReward: true,
      customInviterKind: true,
    },
  });
  if (!inviter) return;
  const inviterIsPartner = await isPartner(inviter.id, inviter.telegramId);

  // First-payment gate for the non-partner direct leg: any marker pointing
  // at this account means an earlier order already credited both sides.
  const orderRef = `${userId}:${orderId}`;
  if (!inviterIsPartner) {
    const existing = await prisma.walletTx.findFirst({
      where: {
        reason: { in: ["referral_bonus", "referral_days"] },
        refId: String(userId),
      },
      select: { id: true },
    });
    if (existing) return;
  }

  const rate = await resolveEarnerRate(inviter, settings, inviterIsPartner);
  const directRefId = inviterIsPartner ? orderRef : String(userId);

  try {
    let directMoneyShare = 0;
    if (rate.kind === "days") {
      await creditDays(inviter.id, rate.value, directRefId);
      if (rate.value > 0) {
        const { notifyReferralDays } = await import("./partner-notify");
        notifyReferralDays(inviter.id, rate.value);
      }
    } else {
      const amount = moneyOf(rate, finalAmount);
      directMoneyShare = amount;
      if (amount > 0) {
        await prisma.walletTx.create({
          data: {
            userId: inviter.id,
            amount,
            reason: "referral_bonus",
            refId: directRefId,
          },
        });
        // Best-effort partner push — never awaited, never throws (see module).
        const { notifyReferralCredited } = await import("./partner-notify");
        notifyReferralCredited(inviter.id, amount);
      }
    }

    // Upline leg: a partner above the direct inviter nets the residual.
    if (inviter.referredById !== null) {
      const up = await prisma.user.findUnique({
        where: { id: inviter.referredById },
        select: {
          id: true,
          telegramId: true,
          referredById: true,
          customInviterReward: true,
          customInviterKind: true,
        },
      });
      if (up && (await isPartner(up.id, up.telegramId))) {
        const upRate = await resolveEarnerRate(up, settings, true);
        if (upRate.kind !== "days") {
          const residual = Math.max(0, moneyOf(upRate, finalAmount) - directMoneyShare);
          if (residual > 0) {
            await prisma.walletTx.create({
              data: {
                userId: up.id,
                amount: residual,
                reason: "referral_bonus",
                refId: `${orderRef}:up`,
              },
            });
            const { notifyReferralCredited } = await import("./partner-notify");
            notifyReferralCredited(up.id, residual);
          }
        }
      }
    }

    // Invitee signup bonus, always first-only (keyed by account): bonus
    // days in days-mode, the fixed money bonus in money-mode.
    const inviteeCredited = await prisma.walletTx.findFirst({
      where: {
        userId,
        reason: { in: ["referral_bonus", "referral_days"] },
        refId: String(userId),
      },
      select: { id: true },
    });
    if (!inviteeCredited) {
      if (settings.userMode === "days") {
        if (settings.inviteeDays > 0) {
          await creditDays(userId, settings.inviteeDays, String(userId));
        }
      } else if (settings.inviteeValue > 0) {
        await prisma.walletTx.create({
          data: {
            userId,
            amount: settings.inviteeValue,
            reason: "referral_bonus",
            refId: String(userId),
          },
        });
      }
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
      return; // concurrent payment already credited
    }
    throw err;
  }
}

/**
 * Set (or clear with null) the caller's own downline rate — what THEIR
 * referrals earn when those bring buyers. Anyone may narrow only their own
 * share (the residual math floors at zero, so no money is ever created).
 */
export async function setSubRate(
  userId: number,
  rate: DownlineRate | null,
): Promise<DownlineRate | null> {
  if (rate !== null) {
    if (rate.kind !== "percent" && rate.kind !== "fixed" && rate.kind !== "days") {
      throw new Error("referral:bad_rate");
    }
    if (!Number.isSafeInteger(rate.value) || rate.value < 0 || rate.value > 1_000_000) {
      throw new Error("referral:bad_rate");
    }
  }
  await prisma.user.update({
    where: { id: userId },
    data: {
      subRateKind: rate?.kind ?? null,
      subRateValue: rate ? Math.floor(rate.value) : null,
    },
  });
  return rate;
}

/** Spendable bonus-day balance (SUM-free counter, single row read). */
export async function bonusBalance(userId: number): Promise<number> {
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { bonusDays: true },
  });
  return Math.max(0, row?.bonusDays ?? 0);
}

export type RedeemOutcome =
  | { ok: true; days: number; expiresAt: string | null }
  | { ok: false; reason: "not_found" | "trial" | "insufficient" | "provider" };

/**
 * Extend one owned, non-trial key by bonus days. Provider renew goes first
 * (a provider failure spends nothing); the balance decrements only after a
 * successful renew + cache upsert. Ownership resolves through the
 * (userId, keyId) join — foreign keys read as `not_found`.
 */
export async function redeemBonusDays(
  userId: number,
  keyId: string,
  days: number,
): Promise<RedeemOutcome> {
  if (!Number.isSafeInteger(days) || days < 1 || days > 3650) {
    return { ok: false, reason: "insufficient" };
  }
  const key = await prisma.keyCache.findFirst({
    where: { userId, keyId },
    select: { deviceLimit: true, devices: true, isTrial: true },
  });
  if (!key) return { ok: false, reason: "not_found" };
  if (key.isTrial) return { ok: false, reason: "trial" };
  const claimed = await prisma.user.updateMany({
    where: { id: userId, bonusDays: { gte: days } },
    data: { bonusDays: { decrement: days } },
  });
  if (claimed.count === 0) return { ok: false, reason: "insufficient" };

  try {
    const { artemida } = await import("./artemida");
    const { upsertCachedKey } = await import("./keys-service");
    const renewed = await artemida.renewKey(
      keyId,
      { days, devices: Math.max(2, Math.min(10, key.deviceLimit ?? key.devices ?? 2)) },
      { idempotencyKey: `bonus:${userId}:${keyId}:${days}:${Date.now()}` },
    );
    await upsertCachedKey(userId, renewed);
    return { ok: true, days, expiresAt: renewed.expiresAt };
  } catch {
    // Provider failed after the debit — refund the days (append-only
    // discipline would double-spend here; a straight increment restores).
    await prisma.user
      .update({ where: { id: userId }, data: { bonusDays: { increment: days } } })
      .catch(() => undefined);
    return { ok: false, reason: "provider" };
  }
}

export interface DownlineRow {
  userId: number;
  displayName: string | null;
  email: string | null;
  createdAt: Date;
  downline: number;
  purchases: number;
  revenue: number;
  earnedFromThem: number;
}

/**
 * Extended per-referral stats for the inviter's dashboard: each direct
 * referral with THEIR downline size, attributed purchases/revenue (paid
 * orders of their referrals), and what this inviter earned off them
 * (bonus rows pointing at them, any order scope).
 */
export async function listDownlineDetails(ownerId: number): Promise<DownlineRow[]> {
  const referrals = await prisma.user.findMany({
    where: { referredById: ownerId },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      username: true,
      createdAt: true,
    },
  });
  return Promise.all(
    referrals.map(async (row) => {
      const full = [row.firstName, row.lastName]
        .map((part) => part?.trim() ?? "")
        .filter((part) => part.length > 0)
        .join(" ")
        .trim();
      const [downline, orders, earned] = await Promise.all([
        prisma.user.count({ where: { referredById: row.id } }),
        prisma.order.findMany({
          where: {
            user: { referredById: row.id },
            status: { in: ["paid", "provisioning", "provisioned"] },
          },
          select: { finalAmount: true, balanceUsed: true },
        }),
        prisma.walletTx.aggregate({
          where: {
            userId: ownerId,
            reason: { in: ["referral_bonus", "referral_days"] },
            OR: [{ refId: String(row.id) }, { refId: { startsWith: `${row.id}:` } }],
          },
          _sum: { amount: true },
        }),
      ]);
      return {
        userId: row.id,
        displayName: full.length > 0 ? full : (row.username ?? null),
        email: row.email,
        createdAt: row.createdAt,
        downline,
        purchases: orders.length,
        revenue: orders.reduce(
          (sum, order) => sum + Math.max(0, order.finalAmount - order.balanceUsed),
          0,
        ),
        earnedFromThem: earned._sum.amount ?? 0,
      };
    }),
  );
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
