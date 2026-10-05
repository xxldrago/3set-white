// Inline fake TelegramSender for notification-dispatch vectors (04-03).
//
// Mirrors the inline fake in `tests/unit/bot-payments.test.ts`, but extracted so
// the ticket-reply dispatch and (later) reminders can share one capture surface.
// It records every send and can be configured to fail on demand, so an owning-chat
// targeting assertion and a retryable-failure assertion need no live Telegram.
import type { TelegramSender } from "../../lib/bot-payments";

export interface CapturedSend {
  kind: "message" | "photo";
  chatId: number | string;
  text?: string;
  caption?: string;
}

export interface FakeSender extends TelegramSender {
  /** Every send attempted, in call order (a failed send is not recorded). */
  calls: CapturedSend[];
}

export type SenderFailure = "network" | "bad_request" | "forbidden" | "rate_limited" | "server";

/**
 * Build a capturing `TelegramSender`. `fail: true` makes both methods throw, to
 * exercise the dispatch's `retryable_error` branch (a Telegram/network blip).
 */
export function fakeSender(opts: { fail?: boolean; error?: SenderFailure } = {}): FakeSender {
  const calls: CapturedSend[] = [];

  const sendMessage: TelegramSender["sendMessage"] = async (chatId, text) => {
    if (opts.fail || opts.error) {
      const errorCode = opts.error === "bad_request" ? 400 : opts.error === "forbidden" ? 403 : opts.error === "rate_limited" ? 429 : opts.error === "server" ? 500 : undefined;
      const error = new Error("telegram_down") as Error & { response?: Record<string, unknown> };
      if (errorCode) {
        error.response = {
          error_code: errorCode,
          ...(opts.error === "rate_limited" ? { parameters: { retry_after: 7 } } : {}),
        };
      }
      throw error;
    }
    calls.push({ kind: "message", chatId, text });
    return { message_id: calls.length };
  };

  const sendPhoto: TelegramSender["sendPhoto"] = async (chatId, _photo, extra) => {
    if (opts.fail || opts.error) throw new Error("telegram_down");
    calls.push({ kind: "photo", chatId, caption: extra?.caption });
    return { message_id: calls.length };
  };

  return { calls, sendMessage, sendPhoto };
}
