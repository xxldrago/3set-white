// Balance auto-renew scan: renews flagged keys from the referral wallet.
//
// Runs daily (worker reminder tick + the manual cron route). For every cached
// key with `autoRenew`, non-trial, expiring within 3 days: mint a `renew`
// order through the shared pipeline with `useBalance: true` (same term as
// the key's last order, fallback 30d). A covering balance pays + fulfills
// immediately; a short one leaves a pending Platega order and — when a
// Telegram sender is available — DMs the pay link to the owning chat.
//
// Guards: a pending order for the same key skips the scan (no duplicates
// across the 3-day window); provider/Artemida failures are per-key and never
// abort the pass.
import { createOrder, keyDeviceLimit } from "./orders-service";
import { buildPayButton, type TelegramSender } from "./bot-payments";
import { logger } from "./logger";
import { prisma } from "./prisma";

const DAY_MS = 86_400_000;
const WINDOW_DAYS = 3;

export interface AutoRenewOutcome {
  scanned: number;
  renewed: number;
  pending: number;
  skipped: number;
}

export async function runAutoRenewScan(
  now = new Date(),
  send?: TelegramSender,
): Promise<AutoRenewOutcome> {
  const horizon = new Date(now.getTime() + WINDOW_DAYS * DAY_MS);
  const keys = await prisma.keyCache.findMany({
    where: {
      autoRenew: true,
      isTrial: false,
      expiresAt: { gt: now, lte: horizon },
    },
    select: {
      userId: true,
      keyId: true,
      deviceLimit: true,
      devices: true,
      user: { select: { telegramId: true, chatId: true } },
    },
    orderBy: { expiresAt: "asc" },
  });

  const outcome: AutoRenewOutcome = { scanned: keys.length, renewed: 0, pending: 0, skipped: 0 };

  for (const key of keys) {
    try {
      // No duplicate renewals: a pending order for this key already covers it.
      const open = await prisma.order.findFirst({
        where: { userId: key.userId, keyId: key.keyId, status: "pending" },
        select: { id: true },
      });
      if (open) {
        outcome.skipped += 1;
        continue;
      }
      // Same term as the key's last purchase (fallback 30d).
      const last = await prisma.order.findFirst({
        where: { userId: key.userId, keyId: key.keyId, kind: { in: ["new", "renew"] } },
        orderBy: { createdAt: "desc" },
        select: { days: true },
      });
      const result = await createOrder({
        userId: key.userId,
        kind: "renew",
        days: last?.days ?? 30,
        devices: keyDeviceLimit({
          deviceLimit: key.deviceLimit,
          devices: key.devices,
        }),
        keyId: key.keyId,
        userName: null,
        useBalance: true,
      });
      if (result.kind === "provider_error") {
        outcome.skipped += 1;
        continue;
      }
      if (result.order.status === "paid") {
        outcome.renewed += 1;
        logger.info({ route: "autorenew", outcome: "renewed", orderId: result.order.id });
        continue;
      }
      outcome.pending += 1;
      logger.info({ route: "autorenew", outcome: "pending", orderId: result.order.id });
      // Short balance: DM the pay link when we can reach the owner on Telegram.
      const chatId =
        key.user.chatId !== null && key.user.chatId !== undefined
          ? String(key.user.chatId)
          : key.user.telegramId !== null
            ? String(key.user.telegramId)
            : null;
      if (send && chatId) {
        try {
          await send.sendMessage(chatId, "Баланса не хватило — оплатите продление по кнопке.", {
            reply_markup: { inline_keyboard: [[buildPayButton(result.url)]] },
          });
        } catch {
          // DM is best-effort; the pending order waits in the cabinet.
        }
      }
    } catch {
      outcome.skipped += 1;
      logger.warn({ route: "autorenew", outcome: "key_failed", keyId: key.keyId });
    }
  }
  return outcome;
}
