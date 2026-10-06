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
import {
  BOT_REPLY_CAP,
  TELEGRAM_MAX_CHARS,
  type NotifyDispatchResult,
  type TelegramSender,
} from "./bot-payments";
import { t } from "./i18n";
import { formatKeyDate } from "./keys-service";
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

// ---------------------------------------------------------------------------
// Expiry-reminder push (PAY-05, D-60..D-63). Same shape as the ticket-reply
// helpers: a PURE keyed builder plus the owning-chat dispatch the worker calls.
//
// Security / copy (T-04-35 / T-04-36):
// - the reminder is sent ONLY to the owning chat resolved server-side
//   (`String(user.chatId ?? user.telegramId)`) — never a caller-supplied chat;
// - the copy is literal `t()` keys + a formatted date and contains NO raw key
//   id, provider status, or error text;
// - a trial key offers ONLY the buy CTA (`tariff:start`); renew is never
//   attached to a trial (D-44/D-63) — the non-trial button carries the key id
//   so an asynchronously-opened button still targets the right key (A7).
// ---------------------------------------------------------------------------

export interface ReminderPush {
  text: string;
  keyboard: {
    inline_keyboard: Array<Array<{ text: string; callback_data: string }>>;
  };
}

/**
 * Build the keyed expiry-reminder message + inline button (UI-SPEC §Bot).
 * `{date}` is the key's expiry in `DD.MM.YYYY` (ru-RU). Trial → `tariff:start`
 * (days keyboard, buy); non-trial → `key:renew:{keyId}` (Phase 3 renew flow).
 * Text is sliced under Telegram's hard ceiling.
 */
export function buildReminderPush(key: {
  keyId: string;
  isTrial: boolean;
  expiresAt: Date;
}): ReminderPush {
  const date = formatKeyDate(key.expiresAt.toISOString());
  if (key.isTrial) {
    return {
      text: t("bot.expiryReminderTrial", { date }).slice(0, TELEGRAM_MAX_CHARS),
      keyboard: {
        inline_keyboard: [[{ text: t("key.buyCta"), callback_data: "tariff:start" }]],
      },
    };
  }
  return {
    text: t("bot.expiryReminder", { date }).slice(0, TELEGRAM_MAX_CHARS),
    keyboard: {
      inline_keyboard: [
        [{ text: t("renew.cta"), callback_data: `key:renew:${key.keyId}` }],
      ],
    },
  };
}

/**
 * Dispatch one `remind-expiry` notification row to its owning chat.
 *
 * Resolves the notification's key → `KeyCache` owner row, so the chat target is
 * ALWAYS `String(user.chatId ?? user.telegramId)` — never another chat
 * (T-04-35). A missing notification/key/owner/expiry is `skipped`; a thrown
 * Telegram error is `retryable_error` so the worker reschedules and the nudge is
 * never lost.
 */
export async function dispatchReminder(
  notificationId: string,
  send: TelegramSender,
): Promise<NotifyDispatchResult> {
  const notification = await prisma.notification.findUnique({
    where: { id: notificationId },
    select: { keyId: true, userId: true },
  });
  if (!notification?.keyId) return { outcome: "skipped" };

  const key = await prisma.keyCache.findFirst({
    where: {
      keyId: notification.keyId,
      ...(notification.userId === null ? {} : { userId: notification.userId }),
    },
    select: {
      keyId: true,
      isTrial: true,
      expiresAt: true,
      user: { select: { telegramId: true, chatId: true } },
    },
  });
  if (!key?.expiresAt) return { outcome: "skipped" };

  const chatId = String(key.user.chatId ?? key.user.telegramId);
  const push = buildReminderPush({
    keyId: key.keyId,
    isTrial: key.isTrial,
    expiresAt: key.expiresAt,
  });

  try {
    await send.sendMessage(chatId, push.text, { reply_markup: push.keyboard });
    return { outcome: "pushed" };
  } catch {
    // A Telegram/network failure is retryable; the worker reschedules.
    return { outcome: "retryable_error" };
  }
}
