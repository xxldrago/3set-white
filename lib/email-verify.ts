// Email confirmation for the email-only trial gate.
//
// Email-only accounts (no linked Telegram) must prove mailbox ownership
// before the trial is issued; Telegram-linked accounts skip verification —
// the Telegram identity is the proof. Same token discipline as the password
// reset flow: 24h TTL, single-use, re-issue supersedes prior unused tokens.
import { randomBytes } from "node:crypto";
import { prisma } from "./prisma";
import { logger } from "./logger";
import { MailError, sendVerifyMail } from "./mail";

/** D-verify: confirmation link lifetime. */
const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;

export type VerifyIssue =
  | { ok: true }
  | { ok: false; reason: "no_email" | "already_verified" | "mail_error" };

/**
 * Issue a confirmation link to the account's email. Supersedes prior unused
 * tokens (only the newest link stays valid). Fire-and-forget the send at the
 * call site — this function awaits it and reports `mail_error` so the UI can
 * offer a retry.
 */
export async function requestVerification(userId: number): Promise<VerifyIssue> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, emailVerifiedAt: true },
  });
  if (!user?.email) return { ok: false, reason: "no_email" };
  if (user.emailVerifiedAt) return { ok: false, reason: "already_verified" };

  const token = randomBytes(32).toString("hex");
  await prisma.$transaction([
    prisma.emailVerification.deleteMany({ where: { userId: user.id, usedAt: null } }),
    prisma.emailVerification.create({
      data: {
        token,
        userId: user.id,
        expiresAt: new Date(Date.now() + VERIFY_TTL_MS),
      },
    }),
  ]);
  try {
    await sendVerifyMail(user.email, token);
  } catch (err) {
    if (err instanceof MailError) {
      logger.warn({ route: "email-verify", outcome: "mail_error" });
      return { ok: false, reason: "mail_error" };
    }
    throw err;
  }
  logger.info({ route: "email-verify", outcome: "issued" });
  return { ok: true };
}

export type VerifyConfirm =
  | { ok: true; userId: number }
  | { ok: false; reason: "invalid" | "expired" | "used" };

/**
 * Redeem a confirmation token: single-use, expiry-checked, stamps
 * `emailVerifiedAt`. Unknown tokens and consumed/expired ones are
 * distinguished for logging only — callers render one generic copy.
 */
export async function confirmVerification(token: string): Promise<VerifyConfirm> {
  const row = await prisma.emailVerification.findUnique({
    where: { token },
    select: { userId: true, expiresAt: true, usedAt: true },
  });
  if (!row) return { ok: false, reason: "invalid" };
  if (row.usedAt) return { ok: false, reason: "used" };
  if (row.expiresAt.getTime() <= Date.now()) return { ok: false, reason: "expired" };

  await prisma.$transaction([
    prisma.emailVerification.update({
      where: { token },
      data: { usedAt: new Date() },
    }),
    prisma.user.update({
      where: { id: row.userId },
      data: { emailVerifiedAt: new Date() },
    }),
  ]);
  logger.info({ route: "email-verify", outcome: "confirmed" });
  return { ok: true, userId: row.userId };
}
