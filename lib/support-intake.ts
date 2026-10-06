// Bot support-intake helpers (04-07 Task 2 / SUP-01) — PURE logic, no Telegraf
// import, so the flag/TTL gate and the subject/body bounds are unit-testable
// without a Telegram context. `lib/bot.ts` holds the thin handler wiring and
// composes these, mirroring the `lib/bot-payments.ts` "pure helpers + thin
// handlers" discipline.
//
// The gate is a read-only decision; the atomic CLAIM that guards against a
// retried/concurrent duplicate stays in `lib/tickets-service.clearSupportPrompt`
// (consumed as-is — never re-implemented here).
import { isSupportPromptFresh } from "./tickets-service";

/**
 * The persisted `User` fields the bot intake gate reads. A structural subset of
 * the Prisma row, so the caller passes the selection directly.
 */
export interface SupportIntakeState {
  awaitingSupport: boolean;
  supportPromptAt: Date | null;
}

/**
 * True only when the user row is armed AND the prompt is still fresh (< 30 min).
 * A missing row, a false flag, or a stale timestamp all return false, so an
 * unrelated text/photo falls through to the existing handlers untouched.
 */
export function isSupportIntakeArmed(
  state: SupportIntakeState | null,
  now: Date = new Date(),
): boolean {
  if (!state?.awaitingSupport) return false;
  return isSupportPromptFresh(state.supportPromptAt, now);
}

/** Ticket subject bound (RESEARCH §Security Domain: subject ≤120). */
export const SUPPORT_SUBJECT_MAX = 120;
/** Ticket body bound (RESEARCH §Security Domain: body ≤4000). */
export const SUPPORT_BODY_MAX = 4000;

/**
 * Build the ticket subject/body from untrusted Telegram text/caption: trim,
 * slice to the service bounds, and fall back to the caller-supplied KEYED
 * subject (e.g. `t("bot.menuSupport")`) when a photo has no caption — never a
 * hardcoded literal, so copy stays in the dictionary (D-16).
 */
export function buildSupportTicketContent(
  message: { text?: string; caption?: string },
  fallbackSubject: string,
): { subject: string; body: string } {
  const value = (message.text ?? message.caption ?? "").trim();
  return {
    subject: (value || fallbackSubject).slice(0, SUPPORT_SUBJECT_MAX),
    body: value.slice(0, SUPPORT_BODY_MAX),
  };
}
