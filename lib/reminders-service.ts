// Expiry-reminder scan (PAY-05, D-60..D-63) — the batch/scan module that turns
// "a key is about to expire" into ONE durable `Notification` delivery row per
// key per UTC day. Mirrors `lib/keys-service.ts` conventions (no Next imports;
// pure batch + DB access), and re-exports the reminder dispatcher under the
// name the outbox worker's lazy loader expects (`dispatchExpiryReminder`).
//
// Why a UNIQUE dedupe key rather than a `remindedAt` column (RESEARCH D-61):
// the tick runs once on boot AND daily, and may overlap across processes. The
// `remind:{keyId}:{YYYY-MM-DD}` key makes a second same-day enqueue a no-op at
// the DB level, so "daily until expiry" is exactly-once without extra state
// (T-04-32 duplicate-reminder DoS/UX).
import { REMIND_EXPIRY, enqueueNotification } from "./outbox";
import { prisma } from "./prisma";

const DAY_MS = 86_400_000;
// Reminder horizon: a key with ≤3 days of validity is reminded (D-60). This is
// the SAME window the cabinet badge uses (`EXPIRING_WINDOW_MS`,
// lib/keys-service.ts), so the push and the «Истекает N дн.» badge agree.
const WINDOW_DAYS = 3;

export interface ExpiringKey {
  keyId: string;
  userId: number;
  isTrial: boolean;
  expiresAt: Date;
  telegramId: bigint;
  chatId: bigint | null;
}

/**
 * Select every cached key expiring strictly after `now` and within the 3-day
 * window. Trial keys are INCLUDED (D-63 — a trial user gets a buy nudge), an
 * already-expired key (`expiresAt <= now`) is EXCLUDED so reminders stop at
 * expiry, and a key more than 3 days out is excluded.
 */
export async function listExpiringKeys(now = new Date()): Promise<ExpiringKey[]> {
  const horizon = new Date(now.getTime() + WINDOW_DAYS * DAY_MS);
  const rows = await prisma.keyCache.findMany({
    where: { expiresAt: { gt: now, lte: horizon } },
    include: { user: { select: { telegramId: true, chatId: true } } },
    orderBy: { expiresAt: "asc" },
  });
  return rows.map((row) => ({
    keyId: row.keyId,
    userId: row.userId,
    isTrial: row.isTrial,
    // Non-null by the `gt`/`lte` predicate above (a null never matches).
    expiresAt: row.expiresAt as Date,
    telegramId: row.user.telegramId,
    chatId: row.user.chatId,
  }));
}

/**
 * Per-key, per-UTC-day identity. `now.toISOString()` is UTC, so the "day" is a
 * single fixed timezone (RESEARCH A6 LOCKED: UTC keeps the dedupe deterministic
 * regardless of server tz).
 */
export function reminderDedupeKey(keyId: string, now = new Date()): string {
  return `remind:${keyId}:${now.toISOString().slice(0, 10)}`;
}

/**
 * Enqueue one reminder per expiring key for the day of `now`. Every enqueue is
 * an idempotent upsert on the UNIQUE `dedupeKey`, so calling this twice in a
 * day (boot + interval, or a manual cron hit) leaves exactly one row per key.
 * Returns the keys scanned and the number of enqueue attempts made.
 */
export async function enqueueReminderScan(
  now = new Date(),
): Promise<{ scanned: number; enqueued: number }> {
  const keys = await listExpiringKeys(now);
  for (const key of keys) {
    await enqueueNotification({
      type: REMIND_EXPIRY,
      dedupeKey: reminderDedupeKey(key.keyId, now),
      userId: key.userId,
      keyId: key.keyId,
    });
  }
  return { scanned: keys.length, enqueued: keys.length };
}

/**
 * The worker's lazy loader (`lib/worker.ts` `loadReminderDispatcher`) imports
 * this module and looks for `dispatchExpiryReminder`. The owning-chat dispatch
 * itself lives in `lib/ticket-notify.ts` beside the other keyed builders; this
 * re-export keeps the 04-03 loader contract without a second implementation.
 */
export { dispatchReminder as dispatchExpiryReminder } from "./ticket-notify";
