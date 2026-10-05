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
// Race discipline (WR-06, T-06-12-01/-03): the loser row is re-read and the
// merge invariants are re-asserted INSIDE the transaction, and Prisma
// P2002/P2025/P2003 during the merge map to typed outcomes — a concurrent
// change can never attach a Telegram identity to a conflicting email
// account, and it can never escape as an uncaught 500.
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
 *
 * The merge decision is made on in-transaction reads; the no-loser fast path
 * attaches directly but re-enters the transactional merge path on a P2002
 * race (its pre-read loser is never trusted).
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

  // No-loser fast path: attach the identity directly when the account has no
  // Telegram identity yet and nothing currently holds this one. The
  // UNIQUE(telegram_id) constraint is the concurrency arbiter — a lost race
  // throws P2002 and sends us through the transactional merge path instead of
  // acting on the stale pre-read row.
  const existing = await prisma.user.findUnique({ where: { telegramId: tg } });
  if (!existing && survivor.telegramId === null) {
    try {
      await prisma.user.update({
        where: { id: survivor.id },
        data: { telegramId: tg },
      });
      return { merged: false, userId: survivor.id };
    } catch (err: unknown) {
      if (isErrorCode(err, "P2025")) throw new AccountNotFoundError();
      if (!isUniqueViolation(err)) throw err;
      // Race: a concurrent link created the TG row between our read and
      // write — fall through and merge inside the transaction, which re-reads
      // the loser rather than using the pre-read row.
    }
  }

  try {
    const merged = await mergeTelegramIdentity(survivor.id, tg);
    return { merged, userId: survivor.id };
  } catch (err: unknown) {
    // Typed failures pass straight through; Prisma codes map to typed
    // outcomes so the route can answer 409/401 instead of a generic 500.
    if (err instanceof AccountConflictError || err instanceof AccountNotFoundError) {
      throw err;
    }
    if (isErrorCode(err, "P2025")) throw new AccountNotFoundError();
    if (isErrorCode(err, "P2002") || isErrorCode(err, "P2003")) {
      throw new AccountConflictError();
    }
    throw err;
  }
}

/**
 * Re-point every loser-scoped row onto the survivor and delete the loser, all
 * inside one transaction. Invariants (T-06-12-01/-03) are re-asserted on the
 * in-transaction reads. Returns `true` only when a real merge happened;
 * `false` for an idempotent attach/no-op.
 */
async function mergeTelegramIdentity(survivorId: number, tg: bigint): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const survivor = await tx.user.findUnique({ where: { id: survivorId } });
    if (!survivor) throw new AccountNotFoundError();

    // Idempotent: a concurrent link attached this identity in the meantime.
    if (survivor.telegramId === tg) return false;

    const loser = await tx.user.findUnique({ where: { telegramId: tg } });
    if (!loser) {
      // The identity is free now (the pre-read row vanished). Attach it, but
      // only if the survivor's identity slot is still empty.
      if (survivor.telegramId !== null) throw new AccountConflictError();
      await tx.user.update({ where: { id: survivorId }, data: { telegramId: tg } });
      return false;
    }

    // Merge invariants re-asserted on the in-transaction rows: never merge
    // onto an email-bearing account and never overwrite a different identity
    // already bound to the survivor (T-06-12-01, T-06-12-03).
    if (loser.id === survivorId) return false;
    if (loser.email !== null) throw new AccountConflictError();
    if (survivor.telegramId !== null) throw new AccountConflictError();

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
    return true;
  });
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

function isErrorCode(err: unknown, code: string): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: unknown }).code === code
  );
}

function isUniqueViolation(err: unknown): boolean {
  return isErrorCode(err, "P2002");
}
