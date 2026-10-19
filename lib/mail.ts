// Phase 6 email delivery (D-87/D-90, T-06-08): the ONLY place that sends
// email. Server-only: nodemailer ships native SMTP — never import this module
// from client components.
//
// No-op-safe by design: without SMTP_HOST/SMTP_FROM configured the sender
// logs a skipped outcome and reports `{ sent: false }` — dev/test never need
// real credentials (production relay setup is an owner user_setup item).
// Tests inject a fake transport via `setMailTransportForTests` — no real
// network sends in tests, ever.
//
// PII discipline (cf. lib/logger.ts): logs carry the recipient DOMAIN plus
// outcome only — never the address, token, or link (credential-bearing).
// Only two templates exist in Phase 6: reset + welcome (D-90).
import nodemailer from "nodemailer";
import { env } from "./env";
import { logger } from "./logger";

/**
 * Typed send failure (T-06-08 mitigation): routes map this to a generic
 * `reset_error` — never SMTP/provider text, token, or hash in responses.
 */
export class MailError extends Error {
  readonly code = "send_failed" as const;

  constructor() {
    super("send_failed");
    this.name = "MailError";
  }
}

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  /** Stats tag for the provider dashboard (reset/welcome/verify). */
  tag?: string;
}

/** Injectable transport seam: SMTP in prod, fake capture in tests. */
export interface MailTransport {
  send(msg: MailMessage): Promise<void>;
}

export interface MailResult {
  sent: boolean;
}

let testTransport: MailTransport | null = null;

/** Test-only seam: swap the transport for a fake (cleared in afterAll). */
export function setMailTransportForTests(transport: MailTransport | null): void {
  testTransport = transport;
}

function toDomain(to: string): string {
  const at = to.lastIndexOf("@");
  return at > 0 ? to.slice(at + 1) : "invalid";
}

function isConfigured(): boolean {
  return !!env.SMTP_FROM && (!!env.SMTPBZ_API_KEY || !!env.SMTP_HOST);
}

function isSmtpBzConfigured(): boolean {
  return !!env.SMTPBZ_API_KEY && !!env.SMTP_FROM;
}

/** Minimal HTML wrapper — the smtp.bz API requires an `html` part. */
function textToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<html><head></head><body><p>${escaped.replace(/\n\n/g, "</p><p>").replace(/\n/g, "<br>")}</p></body></html>`;
}

/**
 * smtp.bz HTTP delivery (`POST {base}/smtp/send`, multipart/form-data,
 * `Authorization: <key>` — no Bearer prefix per the provider contract).
 * Non-2xx and network failures both surface as `MailError` (the caller maps
 * it to a generic copy; provider text never leaks).
 */
async function sendViaSmtpBz(msg: MailMessage): Promise<void> {
  const form = new FormData();
  form.append("from", env.SMTP_FROM!);
  form.append("to", msg.to);
  form.append("subject", msg.subject);
  form.append("html", textToHtml(msg.text));
  form.append("text", msg.text);
  if (msg.tag) form.append("tag", msg.tag);
  const base = (env.SMTPBZ_API_BASE ?? "https://api.smtp.bz/v1").replace(/\/+$/, "");
  let res: Response;
  try {
    res = await fetch(`${base}/smtp/send`, {
      method: "POST",
      headers: { Authorization: env.SMTPBZ_API_KEY! },
      body: form,
    });
  } catch {
    throw new MailError();
  }
  if (!res.ok) throw new MailError();
}

/**
 * Send one transactional mail. Returns `{ sent: true }` on delivery (real or
 * fake), `{ sent: false }` when the relay is unconfigured (dev/test no-op),
 * throws `MailError` when the send itself fails.
 */
export async function sendMail(msg: MailMessage): Promise<MailResult> {
  const toDomainOnly = toDomain(msg.to);
  if (testTransport) {
    try {
      await testTransport.send(msg);
    } catch {
      logger.error({ route: "mail", outcome: "failed", toDomain: toDomainOnly });
      throw new MailError();
    }
    logger.info({ route: "mail", outcome: "sent", toDomain: toDomainOnly });
    return { sent: true };
  }
  if (!isConfigured()) {
    logger.warn({ route: "mail", outcome: "skipped_unconfigured", toDomain: toDomainOnly });
    return { sent: false };
  }
  // smtp.bz HTTP API wins when its key is present (no SMTP ports needed —
  // matters on hosts with filtered egress); otherwise the classic relay.
  if (isSmtpBzConfigured()) {
    try {
      await sendViaSmtpBz(msg);
    } catch {
      logger.error({ route: "mail", outcome: "failed", toDomain: toDomainOnly });
      throw new MailError();
    }
    logger.info({ route: "mail", outcome: "sent", toDomain: toDomainOnly });
    return { sent: true };
  }
  try {
    const transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth:
        env.SMTP_USER && env.SMTP_PASS
          ? { user: env.SMTP_USER, pass: env.SMTP_PASS }
          : undefined,
    });
    await transporter.sendMail({
      from: env.SMTP_FROM,
      to: msg.to,
      subject: msg.subject,
      text: msg.text,
    });
  } catch {
    logger.error({ route: "mail", outcome: "failed", toDomain: toDomainOnly });
    throw new MailError();
  }
  logger.info({ route: "mail", outcome: "sent", toDomain: toDomainOnly });
  return { sent: true };
}

/** Reset-link construction off the shared APP_BASE_URL (never hardcoded). */
export function resetLinkFor(token: string): string {
  return `${env.APP_BASE_URL}/reset/confirm?token=${encodeURIComponent(token)}`;
}

/** D-90 template 1/2: one-time reset link, 1h TTL stated in the body. */
export async function sendResetMail(to: string, token: string): Promise<MailResult> {
  return sendMail({
    to,
    tag: "reset",
    subject: "Сброс пароля — 3set",
    text: [
      "Вы запросили сброс пароля 3set.",
      "",
      `Ссылка (действует 1 час, одноразовая): ${resetLinkFor(token)}`,
      "",
      "Если это были не вы — просто проигнорируйте это письмо.",
    ].join("\n"),
  });
}

/** Verify-link construction off the shared APP_BASE_URL (never hardcoded). */
export function verifyLinkFor(token: string): string {
  return `${env.APP_BASE_URL}/verify?token=${encodeURIComponent(token)}`;
}

/** Confirmation link mail: 24h TTL, single-use, stated in the body. */
export async function sendVerifyMail(to: string, token: string): Promise<MailResult> {
  return sendMail({
    to,
    tag: "verify",
    subject: "Подтвердите email — 3set",
    text: [
      "Подтвердите адрес, чтобы получить пробный период 3set.",
      "",
      `Ссылка (действует 24 часа, одноразовая): ${verifyLinkFor(token)}`,
      "",
      "Если это были не вы — просто проигнорируйте это письмо.",
    ].join("\n"),
  });
}

/** Ticket created — confirms receipt, links to the thread. No PII beyond the user's own subject. */
export async function sendTicketCreatedMail(
  to: string,
  ticketId: string,
  subject: string,
): Promise<MailResult> {
  return sendMail({
    to,
    tag: "ticket-created",
    subject: `Обращение принято — 3set (#${ticketId.slice(0, 8)})`,
    text: [
      `Ваше обращение «${subject}» принято.`,
      "",
      "Мы ответим здесь и в Telegram-боте. Следить за статусом можно в кабинете:",
      `${env.APP_BASE_URL}/support/${ticketId}`,
    ].join("\n"),
  });
}

/** Support replied — nudges the user back to the thread with a short preview. */
export async function sendTicketReplyMail(
  to: string,
  ticketId: string,
  subject: string,
  preview: string,
): Promise<MailResult> {
  const short = preview.length > 300 ? `${preview.slice(0, 300)}…` : preview;
  return sendMail({
    to,
    tag: "ticket-reply",
    subject: `Ответ поддержки — 3set (#${ticketId.slice(0, 8)})`,
    text: [
      `По обращению «${subject}» пришёл ответ:`,
      "",
      short,
      "",
      `Продолжить диалог: ${env.APP_BASE_URL}/support/${ticketId}`,
    ].join("\n"),
  });
}

/** Key expiring soon — mirrors the bot reminder push (same 3-day horizon). */
export async function sendExpiryReminderMail(
  to: string,
  keyLabel: string,
  expiresAt: string,
  isTrial: boolean,
): Promise<MailResult> {
  let date = expiresAt;
  try {
    date = new Date(expiresAt).toLocaleDateString("ru-RU");
  } catch {
    // Keep the raw value — never fail the send on a date quirk.
  }
  return sendMail({
    to,
    tag: "expiry",
    subject: isTrial ? "Пробный период заканчивается — 3set" : "Подписка заканчивается — 3set",
    text: [
      isTrial
        ? `Пробный доступ «${keyLabel}» заканчивается ${date}.`
        : `Подписка «${keyLabel}» заканчивается ${date}.`,
      "",
      `Продлить без потери доступа: ${env.APP_BASE_URL}/subscription`,
    ].join("\n"),
  });
}

export interface PurchaseMailInput {
  kind: string;
  keyId: string;
  devices: number | null;
  days: number | null;
  amount: number;
  currency: string;
  subscriptionUrl: string | null;
  expiresAt: string | null;
  orderId: string;
}

/** Order fulfilled — receipt with the subscription data. Sent only on the
 * first successful provisioning transition (no resend on worker retries). */
export async function sendPurchaseMail(to: string, input: PurchaseMailInput): Promise<MailResult> {
  const kindLabel =
    input.kind === "renew" ? "Продление подписки" : input.kind === "upgrade" ? "Апгрейд" : "Новая подписка";
  let expiry = "—";
  if (input.expiresAt) {
    try {
      expiry = new Date(input.expiresAt).toLocaleDateString("ru-RU");
    } catch {
      expiry = input.expiresAt;
    }
  }
  const lines = [
    `${kindLabel} оформлена и активирована.`,
    "",
    `Ключ: ${input.keyId}`,
    `Устройства: ${input.devices ?? "—"}`,
    input.days !== null ? `Срок: ${input.days} дн.` : null,
    `Оплачено: ${input.amount} ${input.currency}`,
    `Действует до: ${expiry}`,
  ].filter((line): line is string => line !== null);
  if (input.subscriptionUrl) {
    lines.push("", `Ссылка подписки: ${input.subscriptionUrl}`);
  }
  lines.push("", `Детали заказа: ${env.APP_BASE_URL}/payments/${input.orderId}`);
  return sendMail({
    to,
    tag: "purchase",
    subject: `${kindLabel} — 3set`,
    text: lines.join("\n"),
  });
}

/** D-90 template 2/2: registration greeting, no credentials inside. */
export async function sendWelcomeMail(to: string): Promise<MailResult> {
  // Хост берём из APP_BASE_URL, а не из константы: переименование домена не должно
  // снова расходиться с env (см. resetLinkFor выше).
  const hostLabel = env.APP_BASE_URL.replace(/^https?:\/\//, "").replace(/\/$/, "");
  return sendMail({
    to,
    tag: "welcome",
    subject: "Добро пожаловать в 3set",
    text: [
      "Регистрация прошла успешно — добро пожаловать в 3set.",
      "",
      "Войти и управлять подпиской — в кабинете на " + hostLabel + ".",
      "Если забудете пароль — восстановите его ссылкой из письма на странице входа.",
    ].join("\n"),
  });
}

/**
 * ADMIN copy of a public landing support request (POST /api/support/intake).
 * Unlike every other template here the recipient is staff, and the body carries
 * visitor-supplied text — hence the explicit bounds, the no-credentials notice,
 * and the "reply on the channel the visitor picked" instruction. Returns
 * `{ sent: false }` (logged no-op) when no relay/admin inbox is configured, so
 * the caller treats email as best-effort and never loses the request.
 */
export async function sendSupportIntakeMail(
  to: string,
  payload: { channelLabel: string; contact: string; name: string; body: string },
): Promise<MailResult> {
  const clip = (v: string, max: number): string =>
    v.length > max ? `${v.slice(0, max)}…` : v;
  return sendMail({
    to,
    tag: "support-intake",
    subject: `Обращение с сайта — ответить: ${clip(payload.channelLabel, 40)}`,
    text: [
      "Новое обращение с лендинга 3set.online.",
      "",
      `Ответить через: ${payload.channelLabel}`,
      `Контакт для ответа: ${payload.contact}`,
      `Имя: ${payload.name || "—"}`,
      "",
      "Сообщение:",
      clip(payload.body, 4000),
      "",
      "Ответьте на указанный контакт — он выбран самим посетителем.",
      "Не отправляйте в это письмо пароли и ключи доступа.",
    ].join("\n"),
  });
}
