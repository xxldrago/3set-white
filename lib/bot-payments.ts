// Bot payment parity helpers (03-07 / PAY-01/PAY-04, UI-SPEC §6/§7).
//
// This module is deliberately free of any Telegraf handler wiring: it holds the
// PURE message builders (history reply, Platega URL button, provisioned/failed
// notification copy) and the notify-row DISPATCH function the outbox worker
// calls. The thin handlers in `lib/bot.ts` compose these, so the copy/rows/cap
// and the owning-chat targeting are unit-testable without a Telegram context.
//
// Security (T-03-sublink-leak / T-03-rawbot):
// - the subscription URL is sent ONLY to the owning chat id resolved server-side
//   (via the ownership-joined `getSubscriptionForUser`) and is NEVER logged;
// - every visible string resolves through `t()` — no Platega status/id, no
//   ARTEMIDA error, no raw `order.kind`/`order.status` is ever rendered.
import { getSubscriptionForUser } from "./keys-service";
import { t } from "./i18n";
import type { OrderHistoryRow } from "./orders-service";
import { renderSubscriptionQrPng } from "./qr";
import { prisma } from "./prisma";

/** Telegram length ceiling; replies are kept comfortably under it. */
export const TELEGRAM_MAX_CHARS = 4096;
/** History replies reserve room and stay under the hard cap. */
export const BOT_REPLY_CAP = 4000;
/** Max history rows rendered per reply. */
export const BOT_HISTORY_LIMIT = 30;

/**
 * The subset of an order row the bot renders. `OrderHistoryRow` satisfies it
 * structurally, so the shared read path is the single source of these values.
 */
export type OrderRowLike = Pick<
  OrderHistoryRow,
  "id" | "amount" | "currency" | "status" | "kind" | "keyId" | "createdAt"
>;

const priceFormatter = new Intl.NumberFormat("ru-RU");

/** `DD.MM.YYYY · HH:mm` (ru-RU) for a payment timestamp (UI-SPEC formatting). */
export function formatBotPaymentDate(value: Date | string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const day = new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
  const time = new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
  return `${day} · ${time}`;
}

/** Literal keyed kind label — never the raw `kind` (UI-SPEC §6). */
function kindLabel(kind: string): string {
  switch (kind) {
    case "renew":
      return t("pay.kindRenew");
    case "upgrade":
      return t("pay.kindUpgrade");
    default:
      return t("pay.kindNew");
  }
}

/** Literal keyed status label — never the raw `status` or a Platega status. */
function statusLabel(status: string): string {
  switch (status) {
    case "provisioned":
      return t("pay.statusProvisioned");
    case "paid":
      return t("pay.statusPaid");
    case "provisioning":
      return t("pay.statusProvisioning");
    case "pending":
      return t("pay.statusPending");
    case "canceled":
      return t("pay.statusCanceled");
    case "refunded":
      return t("pay.statusRefunded");
    case "failed":
      return t("pay.statusFailed");
    default:
      return t("pay.statusUnknown");
  }
}

/**
 * Build the «История платежей» reply (PAY-04 / D-47/D-48): one row per order as
 * `kind · amount · date · status`, newest first (the read path already orders
 * desc). Empty → `pay.historyEmpty`. The result is sliced to stay under
 * Telegram's 4096-char limit (T-03-reply-overflow). No provider field is ever
 * rendered (the rows are provider-free by construction).
 */
export function buildHistoryReply(rows: OrderRowLike[]): string {
  if (rows.length === 0) return t("pay.historyEmpty");

  const shown = rows.slice(0, BOT_HISTORY_LIMIT);
  const header = t("pay.historyTitle");
  const lines = shown.map((row) =>
    [
      `${kindLabel(row.kind)} · ${t("pay.amount", {
        price: priceFormatter.format(row.amount),
      })}`,
      `${t("pay.date", { date: formatBotPaymentDate(row.createdAt) })} · ${statusLabel(row.status)}`,
    ].join("\n"),
  );
  return [header, ...lines].join("\n\n").slice(0, BOT_REPLY_CAP);
}

/**
 * Build the inline URL button that carries the Platega hosted page
 * (UI-SPEC §7): the label is `pay.cta`, the URL travels in the button — the
 * message never needs to show a raw provider URL.
 */
export function buildPayButton(url: string): { text: string; url: string } {
  return { text: t("pay.cta"), url };
}

export interface NotificationPush {
  /** Message text (keyed copy [+ the sub-link on success only]). */
  text: string;
  /** Whether the sender should attach the locally-generated QR PNG. */
  wantsQr: boolean;
}

/**
 * Provisioned push (UI-SPEC §7): `bot.payProvisioned` + the sub-link text. The
 * QR is generated server-side by the caller from `subscriptionUrl`. When the
 * sub-link is unreadable the copy degrades to the keyed `key.linkUnavailable`
 * and no QR is attached — never an empty/placeholder QR sent as if real.
 */
export function buildProvisionedPush(subscriptionUrl: string | null): NotificationPush {
  const lines = [t("bot.payProvisioned")];
  if (subscriptionUrl) {
    lines.push(subscriptionUrl);
    return { text: lines.join("\n"), wantsQr: true };
  }
  lines.push(t("key.linkUnavailable"));
  return { text: lines.join("\n"), wantsQr: false };
}

/** Failed push (UI-SPEC §7): keyed failure copy only — no raw error text. */
export function buildFailedPush(): NotificationPush {
  return { text: t("bot.payFailed"), wantsQr: false };
}

/** The Telegram send surface the dispatcher needs (kept minimal + injectable). */
export interface TelegramSender {
  sendMessage(
    chatId: number | string,
    text: string,
    extra?: Record<string, unknown>,
  ): Promise<unknown>;
  sendPhoto(
    chatId: number | string,
    photo: { source: Buffer },
    extra?: { caption?: string },
  ): Promise<unknown>;
}

export interface NotifyDispatchResult {
  outcome: "pushed" | "skipped" | "retryable_error";
}

/**
 * Dispatch one notification outbox row to the owning chat (D-38). Resolves the
 * order + its owner server-side; the subscription URL is fetched through the
 * ownership-joined `getSubscriptionForUser`, so it can only ever be sent to the
 * user who owns the key (T-03-sublink-leak). The URL/QR are never logged.
 *
 * The caller (worker drain) owns marking the row `done` on `pushed` and
 * rescheduling on `retryable_error`; a Telegram send failure is retryable.
 */
export async function dispatchNotification(
  orderId: string,
  type: string,
  send: TelegramSender,
): Promise<NotifyDispatchResult> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { user: { select: { telegramId: true, chatId: true } } },
  });
  if (!order) return { outcome: "skipped" };

  // The owning chat: prefer the stored chat id, else the telegram id (they
  // coincide for a private chat). Never any other chat. `String()` because the
  // Prisma id is a bigint and the Telegram API wants number|string.
  const chatId = String(order.user.chatId ?? order.user.telegramId);
  const telegramId = order.user.telegramId;

  try {
    if (type === "notify-provisioned") {
      let subscriptionUrl: string | null = null;
      // Only resolve the sub-link for the owning telegram id (ownership join).
      if (order.provisionedKeyId) {
        const subscription = await getSubscriptionForUser(telegramId, order.provisionedKeyId);
        subscriptionUrl = subscription?.subscriptionUrl ?? null;
      }
      const push = buildProvisionedPush(subscriptionUrl);
      await send.sendMessage(chatId, push.text);
      if (push.wantsQr && subscriptionUrl) {
        const png = await renderSubscriptionQrPng(subscriptionUrl);
        await send.sendPhoto(chatId, { source: png }, { caption: t("key.qrCaption") });
      }
      return { outcome: "pushed" };
    }

    if (type === "notify-failed") {
      const push = buildFailedPush();
      await send.sendMessage(chatId, push.text);
      return { outcome: "pushed" };
    }

    // Unknown notify type: nothing to push — do not spin the job forever.
    return { outcome: "skipped" };
  } catch {
    // A Telegram/network failure is retryable; the worker reschedules.
    return { outcome: "retryable_error" };
  }
}
