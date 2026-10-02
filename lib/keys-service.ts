// Keys/trial service — the SINGLE read/write path shared by the bot and the
// BFF routes (RESEARCH "Bot + PWA shared path"). Both call `startTrial`, so
// there is no duplicated Prisma or fetch logic between channels.
//
// Trial anti-abuse (D-21..D-24, PITFALLS §5):
// - The gate is an atomic `UPDATE ... WHERE trial_used=false`, not a client
//   flag (D-22). Two concurrent taps can never both win.
// - A provider failure rolls the claim back so the user can retry (D-23), but
//   the rollback is guarded by `trialKeyId: null` so a recorded success is
//   never reopened (Pitfall 5).
import { ArtemidaError, artemida, type NormalizedKey } from "./artemida";
import { prisma } from "./prisma";

export type StartTrialResult =
  | { kind: "created"; key: NormalizedKey }
  | { kind: "already_used" };

/**
 * Atomically claim the one-time trial for a telegram id. A SINGLE statement
 * (`updateMany`) makes the race safe (D-22): `count === 1` means we won the
 * claim, `count === 0` means the flag was already set (or the row is absent).
 */
export async function claimTrial(telegramId: bigint): Promise<boolean> {
  const { count } = await prisma.user.updateMany({
    where: { telegramId, trialUsed: false },
    data: { trialUsed: true },
  });
  return count === 1;
}

/**
 * Compensating rollback for a failed provider call (D-23). The
 * `trialKeyId: null` guard means only an in-flight claim (no key recorded
 * yet) is released — a concurrent success can never be clobbered (Pitfall 5).
 */
export async function releaseTrialOnFailure(telegramId: bigint): Promise<void> {
  await prisma.user.updateMany({
    where: { telegramId, trialUsed: true, trialKeyId: null },
    data: { trialUsed: false },
  });
}

function toBigIntOrNull(value: number | null): bigint | null {
  if (value === null || !Number.isFinite(value)) return null;
  return BigInt(Math.trunc(value));
}

function parseExpiry(value: string | null): Date | null {
  if (value === null) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Upsert a normalized provider key into the cache-first read mirror (D-29). */
async function upsertCachedKey(userId: number, key: NormalizedKey): Promise<void> {
  const data = {
    name: key.name,
    status: key.status,
    isTrial: key.isTrial,
    expiresAt: parseExpiry(key.expiresAt),
    deviceLimit: key.deviceLimit,
    devices: key.devices,
    trafficUsedBytes: toBigIntOrNull(key.trafficUsedBytes),
    trafficLimitBytes: toBigIntOrNull(key.trafficLimitBytes),
    subscriptionUrl: key.subscriptionUrl,
    customerRef: key.customerRef,
    lastSyncedAt: new Date(),
  };
  await prisma.keyCache.upsert({
    where: { userId_keyId: { userId, keyId: key.id } },
    update: data,
    create: { userId, keyId: key.id, ...data },
  });
}

/**
 * Claim → issue → persist, or a clean `already_used` signal.
 *
 * On a provider failure the claim is released and the error rethrown so the
 * route/bot can map it. A provider `conflict` (409) means the provider itself
 * already considers this account ineligible: that is terminal, not transient,
 * so we keep the claim and surface `already_used` rather than reopening a
 * retry loop (RESEARCH Open Q3, D-24).
 */
export async function startTrial(telegramId: bigint): Promise<StartTrialResult> {
  if (!(await claimTrial(telegramId))) {
    return { kind: "already_used" };
  }

  let key: NormalizedKey;
  try {
    key = await artemida.createTrial({ customerRef: String(telegramId) });
  } catch (err) {
    if (err instanceof ArtemidaError && err.code === "conflict") {
      // Provider already enforces one trial for this account: keep trialUsed
      // set (non-retryable) and report it as used.
      return { kind: "already_used" };
    }
    await releaseTrialOnFailure(telegramId);
    throw err;
  }

  // Provider success: record the success sentinel before the cache write so a
  // cache-upsert failure can never reopen the trial (D-23/Pitfall 5).
  const user = await prisma.user.update({
    where: { telegramId },
    data: { trialKeyId: key.id },
    select: { id: true },
  });
  await upsertCachedKey(user.id, key);

  return { kind: "created", key };
}
