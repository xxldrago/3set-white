// POST /api/support/intake — public support request from the static landing.
//
// The landing (3set.online) has no account system and no session, so this is
// deliberately the same shape as `POST /api/referrals/click`: a small public
// writer. What it does NOT do is create a ticket — the visitor is anonymous, and
// `Ticket` requires an authenticated `userId`. Instead it fans the request out
// to the ADMIN on both channels (Telegram DM + email inbox) and records nothing,
// because the user asked for exactly that delivery and nothing more.
//
// Flow mirrors the landing UI: the visitor first picks where they want the
// ANSWER (email or Telegram), then supplies that contact. The visitor's choice
// is data only — it never steers where the admin is notified, which is always
// both channels.
//
// Security posture:
//   - Throttled per TRUSTED client IP via the `__support__:` namespace (an
//     anonymous write to two admin inboxes is a spam-relay primitive otherwise).
//     Keyed on `clientIp()`, never on the visitor's own contact string.
//   - No persistence, no account lockout surface, no enumeration oracle: every
//     well-formed request answers the same `{ ok: true }`.
//   - No CORS headers and no OPTIONS handler: the landing posts same-origin
//     through the nginx `3set.online` vhost, which proxies `/api/support/` to
//     this app. A cross-site caller therefore gets no preflight grant, so the
//     endpoint is not usable as a third-party spam relay from a random page.
//   - Body bounds are applied twice: by zod here, and again at the rendering
//     boundaries in `lib/mail.ts` / `lib/admin-notify.ts`, so an over-long field
//     cannot smuggle itself past a later truncation.
import { z } from "zod";
import { clientIp } from "../../../../lib/client-ip";
import {
  checkSupportRateLimit,
  recordSupportAttempt,
} from "../../../../lib/auth-rate-limit";
import { env } from "../../../../lib/env";
import { logger } from "../../../../lib/logger";
import { SUPPORT_BODY_MAX } from "../../../../lib/support-intake";

export const dynamic = "force-dynamic";

// Telegram handles are 5–32 chars of [A-Za-z0-9_]; the leading `@` is optional
// so a visitor may paste either `@name` or `name`. Deliberately not
// `\w+`-only: `\w` admits Unicode letters, which Telegram usernames never use.
const telegramHandle = z
  .string()
  .trim()
  .min(5, "contact too short")
  .max(33, "contact too long")
  .regex(/^@?[A-Za-z0-9_]{5,32}$/, "contact is not a Telegram username");

const bodySchema = z
  .object({
    channel: z.enum(["email", "telegram"]),
    // Validated against the CHOSEN channel below, so a visitor cannot send
    // "telegram" as a channel and an unvalidated string as the contact.
    contact: z.string().trim().min(3).max(254),
    name: z.string().trim().max(64).optional(),
    message: z.string().trim().min(1, "message required").max(SUPPORT_BODY_MAX),
    // Honeypot: a field no human sees. Bots that fill every input get an
    // instant silent drop; humans leave it empty. It must therefore ACCEPT a
    // non-empty value during validation — rejecting it with 400 would tell the
    // bot it had been caught. The drop happens after parsing (see below), and
    // the value is never echoed in any error or log line.
    website: z.string().max(200).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.channel === "email") {
      const parsed = z.string().email().safeParse(value.contact);
      if (!parsed.success) {
        ctx.addIssue({ code: "custom", path: ["contact"], message: "contact is not an email" });
      }
      return;
    }
    const parsed = telegramHandle.safeParse(value.contact);
    if (!parsed.success) {
      ctx.addIssue({ code: "custom", path: ["contact"], message: "contact is not a Telegram username" });
    }
  });

const CHANNEL_LABEL: Record<z.infer<typeof bodySchema>["channel"], string> = {
  email: "Email",
  telegram: "Telegram",
};

/** Normalise the contact for delivery: emails lowercased, handles `@`-prefixed. */
function normalizeContact(channel: "email" | "telegram", contact: string): string {
  return channel === "email" ? contact.toLowerCase() : `@${contact.replace(/^@/, "")}`;
}

export async function POST(req: Request): Promise<Response> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  // Honeypot tripped — answer exactly like a success so the bot learns nothing,
  // and never touch the admin channels.
if (typeof parsed.data.website === "string" && parsed.data.website.length > 0) {
    return Response.json({ ok: true }, { status: 200 });
  }

  const ip = clientIp(req);
  // Throttle BEFORE any delivery work: an anonymous flood must never reach the
  // admin inbox or the Telegram DM, even once per attempt.
  const gate = await checkSupportRateLimit(ip);
  if (!gate.allowed) {
    logger.warn({ route: "support-intake", outcome: "rate_limited" });
    return Response.json(
      { error: "rate_limited", retryAfterSec: gate.retryAfterSec ?? 60 },
      { status: 429 },
    );
  }
  await recordSupportAttempt(ip);

  const { channel, message, name } = parsed.data;
  const contact = normalizeContact(channel, parsed.data.contact);
  const payload = { channelLabel: CHANNEL_LABEL[channel], contact, name: name ?? "", body: message };

  // Both admin channels are best-effort and neither blocks the response: the
  // visitor already has their answer channel, so the HTTP result only reports
  // that we accepted the request. Dynamic imports keep `lib/bot.ts` (and
  // nodemailer) off the hot path, mirroring `lib/tickets-service.ts`.
  void (async () => {
    try {
      const { notifyAdminsSupportIntake: notify } = await import("../../../../lib/admin-notify");
      notify(payload);
      if (env.SUPPORT_ADMIN_EMAIL) {
        const { sendSupportIntakeMail: send } = await import("../../../../lib/mail");
        void send(env.SUPPORT_ADMIN_EMAIL, payload).catch(() => undefined);
      } else {
        logger.warn({ route: "support-intake", outcome: "email_unconfigured" });
      }
      logger.info({ route: "support-intake", outcome: "accepted", channel });
    } catch {
      logger.warn({ route: "support-intake", outcome: "dispatch_failed" });
    }
  })();

  return Response.json({ ok: true }, { status: 200 });
}