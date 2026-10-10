// Partner Telegram pushes: a new referral pin and a first-payment credit.
//
// Best-effort by contract: the caller never awaits (fire-and-forget) and
// every failure — missing Telegram on the inviter, Telegram outage —
// resolves silently. No pushes ever leave a `test` process (vitest suites
// exercise pin/credit paths constantly; Telegram must never be dialled).
// The chat target resolves server-side (chatId ?? telegramId), never from
// client input. Copy resolves through `t()` — no amounts beyond the credited
// sum, no key/order identifiers.
import { t } from "./i18n";
import { logger } from "./logger";
import { prisma } from "./prisma";

async function inviterChat(userId: number): Promise<string | null> {
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { telegramId: true, chatId: true },
  });
  if (!row) return null;
  if (row.chatId !== null) return String(row.chatId);
  if (row.telegramId !== null) return String(row.telegramId);
  return null;
}

async function push(chat: string, text: string): Promise<void> {
  if (process.env["NODE_ENV"] === "test") return;
  try {
    const { bot } = await import("./bot");
    await bot.telegram.sendMessage(chat, text.slice(0, 4000));
  } catch (err) {
    logger.warn({ route: "partner-notify", outcome: "send_failed" });
    void err;
  }
}

/** A new account just pinned this inviter — nudge them to follow up. */
export function notifyReferralPinned(inviterId: number): void {
  void (async () => {
    try {
      const chat = await inviterChat(inviterId);
      if (!chat) return;
      await push(chat, t("bot.refNewReferral"));
      logger.info({ route: "partner-notify", outcome: "pinned_sent" });
    } catch {
      // Best-effort only.
    }
  })();
}

/** The referred account's first payment credited this inviter. */
export function notifyReferralCredited(inviterId: number, amount: number): void {
  void (async () => {
    try {
      const chat = await inviterChat(inviterId);
      if (!chat) return;
      await push(chat, t("bot.refCredited", { amount }));
      logger.info({ route: "partner-notify", outcome: "credited_sent" });
    } catch {
      // Best-effort only.
    }
  })();
}
