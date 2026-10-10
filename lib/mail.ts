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
  return !!env.SMTP_HOST && !!env.SMTP_FROM;
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

/** D-90 template 2/2: registration greeting, no credentials inside. */
export async function sendWelcomeMail(to: string): Promise<MailResult> {
  return sendMail({
    to,
    subject: "Добро пожаловать в 3set",
    text: [
      "Регистрация прошла успешно — добро пожаловать в 3set.",
      "",
      "Войти и управлять подпиской — в кабинете на my.3set.online.",
      "Если забудете пароль — восстановите его ссылкой из письма на странице входа.",
    ].join("\n"),
  });
}
