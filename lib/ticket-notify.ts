// Ticket reply fan-out helpers (SUP-03 / D-57) — the async delivery path a
// support reply travels instead of a synchronous Telegram send inside the reply
// request (which a Bot API blip would lose). Mirrors `lib/bot-payments.ts`
// deliberately: PURE keyed builders + the dispatch the outbox worker calls,
// with an injectable sender so both are unit-testable without Telegraf.
//
// Security (T-04-10 / T-04-13):
// - the reply is sent ONLY to the owning chat resolved server-side from the
//   message's ticket owner row (`String(user.chatId ?? user.telegramId)`) — a
//   caller-supplied or guessed chat is never used;
// - copy is literal `t()` keys only and sliced to `BOT_REPLY_CAP`; the body is
//   never logged.
import { BOT_REPLY_CAP, type NotifyDispatchResult, type TelegramSender } from "./bot-payments";
import { t } from "./i18n";
import { prisma } from "./prisma";

/**
 * Build the support-reply push: the keyed `bot.ticketReply` prefix + the raw
 * reply body, sliced to Telegram's safe reply cap (T-04-13). The body is the
 * admin-authored text stored on the `TicketMessage`; the caller never supplies a
 * chat.
 */
export function buildTicketReplyPush(body: string): string {
  return `${t("bot.ticketReply")}\n${body}`.slice(0, BOT_REPLY_CAP);
}

/**
 * Dispatch one `notify-ticket-reply` notification row to its owning chat.
 *
 * Resolves `Notification.ticketMessageId → TicketMessage → Ticket → User` so the
 * chat target is ALWAYS the owner row's `chatId ?? telegramId` — never another
 * chat (T-04-10). A missing notification/message/user is `skipped` (the worker
 * marks it done; there is nothing to deliver and no row to wait on). A thrown
 * Telegram/network error is `retryable_error` so the worker reschedules with the
 * shared backoff — a reply is never lost (T-04-12).
 */
export async function dispatchTicketNotification(
  notificationId: string,
  send: TelegramSender,
): Promise<NotifyDispatchResult> {
  const notification = await prisma.notification.findUnique({
    where: { id: notificationId },
    select: { ticketMessageId: true },
  });
  if (!notification?.ticketMessageId) return { outcome: "skipped" };

  const message = await prisma.ticketMessage.findUnique({
    where: { id: notification.ticketMessageId },
    select: {
      body: true,
      ticket: { select: { user: { select: { telegramId: true, chatId: true } } } },
    },
  });
  const owner = message?.ticket.user;
  if (!message || !owner) return { outcome: "skipped" };

  // The owning chat: prefer the stored chat id, else the telegram id. Never any
  // other chat. `String()` because the Prisma id is a bigint and the Telegram
  // API wants number|string.
  const chatId = String(owner.chatId ?? owner.telegramId);

  try {
    await send.sendMessage(chatId, buildTicketReplyPush(message.body ?? ""));
    return { outcome: "pushed" };
  } catch {
    // A Telegram/network failure is retryable; the worker reschedules.
    return { outcome: "retryable_error" };
  }
}
