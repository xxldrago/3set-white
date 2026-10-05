// Account link/merge service (D-81/D-93, AUTH-03, T-06-05/T-06-06).
//
// Server-only: both the BFF link/unlink routes and any future caller share
// this module (bot call-sites unchanged per D-94 — the accounts layer
// resolves telegramId → userId internally). Merge discipline mirrors the
// atomic claim pattern in lib/keys-service.ts: one prisma.$transaction
// re-points every user-scoped row from loser → survivor, trialUsed is OR,
// trialKeyId keeps the first non-null, then the loser row is deleted.
// Un-merging merged rows without manual разборка is impossible (D-81,
// one-way) — the link route surfaces this before the call.
//
// Unlink-last-method is ALLOWED (D-93, T-06-06 accepted): this service never
// blocks, the UI warns (plan 06-04) via the `lastMethod` hint the unlink
// route returns on the confirmation_required path.
import { prisma } from "./prisma";

/** Telegram identity already bound to a different email account — no merge. */
export class AccountConflictError extends Error {
  constructor() {
    super("telegram_taken");
    this.name = "AccountConflictError";
  }
}

/** Session points at a row that no longer exists (deleted mid-flight). */
export class AccountNotFoundError extends Error {
  constructor() {
    super("account_not_found");
    this.name = "AccountNotFoundError";
  }
}

export interface LinkResult {
  merged: boolean;
  userId: number;
}

export interface UnlinkResult {
  unlinked: boolean;
}

/**
 * Link a Telegram identity to the session account (survivor).
 *
 * - No row with this telegramId → attach it to the survivor (no merge).
 * - Row exists and is the survivor → idempotent success (merged: false).
 * - Row exists with an email on it → AccountConflictError, NOTHING merges
 *   (stealing a linked identity from another email account is Elevation of
 *   privilege, T-06-05).
 * - Pure-TG row → full merge in one transaction: KeyCache / Order / Ticket
 *   (+ PasswordReset + Notification user pins) re-point to the survivor,
 *   trialUsed = OR, trialKeyId keeps first non-null, profile/chatId fields
 *   fill only when the survivor lacks them, then the loser row is deleted.
 */
export async function linkAccounts({
  userId,
  telegramId,
}: {
  userId: number;
  telegramId: number;
}): Promise<LinkResult> {
  const tg = BigInt(telegramId);
  const survivor = await prisma.user.findUnique({
    where: { id: userId },
  });
  if (!survivor) throw new AccountNotFoundError();
  if (survivor.telegramId === tg) return { merged: false, userId: survivor.id };

  let loser = await prisma.user.findUnique({ where: { telegramId: tg } });
  if (!loser) {
    try {
      await prisma.user.update({
        where: { id: survivor.id },
        data: { telegramId: tg },
      });
      return { merged: false, userId: survivor.id };
    } catch (err: unknown) {
      // Race: a concurrent link created the TG row between our read and
      // write — the UNIQUE constraint is the arbiter. Re-read and merge.
      if (!isUniqueViolation(err)) throw err;
      loser = await prisma.user.findUnique({ where: { telegramId: tg } });
      if (!loser) throw err;
    }
  }
  if (loser.id === survivor.id) return { merged: false, userId: survivor.id };
  if (loser.email !== null) throw new AccountConflictError();

  await prisma.$transaction(async (tx) => {
    // KeyCache @@unique([userId, keyId]): drop loser dupes the survivor
    // already holds so the bulk re-point cannot violate the constraint
    // (keyIds are globally unique in practice — this is defense-in-depth).
    const [loserKeys, survivorKeys] = await Promise.all([
      tx.keyCache.findMany({ where: { userId: loser.id }, select: { keyId: true } }),
      tx.keyCache.findMany({ where: { userId: survivor.id }, select: { keyId: true } }),
    ]);
    const survivorKeyIds = new Set(survivorKeys.map((k) => k.keyId));
    const dupes = loserKeys.map((k) => k.keyId).filter((k) => survivorKeyIds.has(k));
    if (dupes.length > 0) {
      await tx.keyCache.deleteMany({ where: { userId: loser.id, keyId: { in: dupes } } });
    }
    await tx.keyCache.updateMany({
      where: { userId: loser.id },
      data: { userId: survivor.id },
    });
    await tx.order.updateMany({
      where: { userId: loser.id },
      data: { userId: survivor.id },
    });
    await tx.ticket.updateMany({
      where: { userId: loser.id },
      data: { userId: survivor.id },
    });
    // User-scoped siblings: re-point so the loser delete (Cascade) cannot
    // destroy them. Outbox rows are order-scoped and travel with their order.
    await tx.passwordReset.updateMany({
      where: { userId: loser.id },
      data: { userId: survivor.id },
    });
    await tx.notification.updateMany({
      where: { userId: loser.id },
      data: { userId: survivor.id },
    });
    // Delete the loser BEFORE the survivor inherits its telegramId — both
    // orders violate the UNIQUE constraint (P2002), so the delete must land
    // first inside the same transaction.
    await tx.user.delete({ where: { id: loser.id } });
    await tx.user.update({
      where: { id: survivor.id },
      data: {
        // The survivor inherits the linked identity (the loser row is
        // deleted above — without this the telegramId would dangle).
        telegramId: tg,
        trialUsed: survivor.trialUsed || loser.trialUsed,
        trialKeyId: survivor.trialKeyId ?? loser.trialKeyId,
        chatId: survivor.chatId ?? loser.chatId,
        firstName: survivor.firstName ?? loser.firstName,
        lastName: survivor.lastName ?? loser.lastName,
        username: survivor.username ?? loser.username,
      },
    });
  });
  return { merged: true, userId: survivor.id };
}

/**
 * Detach the Telegram identity from the account (D-93). Allowed even for
 * the last auth method — the service never blocks (lockout risk accepted
 * by the owner; support restores manually). The unlink ROUTE gates the
 * call behind an explicit confirm flag so a bare POST never unlinks.
 */
export async function unlinkTelegram(userId: number): Promise<UnlinkResult> {
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, telegramId: true },
  });
  if (!row) throw new AccountNotFoundError();
  if (row.telegramId === null) return { unlinked: false };
  await prisma.user.update({ where: { id: userId }, data: { telegramId: null } });
  return { unlinked: true };
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: unknown }).code === "P2002"
  );
}
