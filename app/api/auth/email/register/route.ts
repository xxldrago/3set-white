// POST /api/auth/email/register — email identity intake (AUTH-01, D-79/D-86).
//
// Strict zod boundary (email trim+lowercase max 254, password min 8 max 256):
// malformed → 400, duplicate email → 409, success mints the SAME httpOnly
// session cookie as Telegram auth (D-86) with a userId subject (D-82).
// No email verification in Phase 6 (owner decision, CONTEXT D-79..D-86).
import { z } from "zod";
import { buildSessionCookie, signSession } from "../../../../../lib/auth";
import {
  checkRegistrationRateLimit,
  recordRegistrationAttempt,
} from "../../../../../lib/auth-rate-limit";
import { clientIp } from "../../../../../lib/client-ip";
import { canonicalizeEmail } from "../../../../../lib/email-canonical";
import { env } from "../../../../../lib/env";
import { logger } from "../../../../../lib/logger";
import { sendWelcomeMail } from "../../../../../lib/mail";
import { requestVerification } from "../../../../../lib/email-verify";
import { hashPassword } from "../../../../../lib/password";
import { prisma } from "../../../../../lib/prisma";
import { pinReferrer } from "../../../../../lib/referrals";

export const dynamic = "force-dynamic";

const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(8).max(256),
  // Optional inviter code (`?ref=` landing) — pinned best-effort, never
  // blocks registration.
  ref: z.string().trim().min(1).max(32).optional(),
});

export async function POST(req: Request): Promise<Response> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const parsed = registerSchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const { email, password, ref } = parsed.data;
  const ip = clientIp(req);

  try {
    // WR-02/WR-04: registration is a controlled surface, not a free oracle /
    // account factory. Throttle FIRST on the trusted client IP
    // (T-06-13-03/04) — nginx always sets `X-Real-IP` in production (06-10),
    // so distinct clients never share the `"direct"` fallback bucket.
    const gate = await checkRegistrationRateLimit(ip);
    if (!gate.allowed) {
      logger.warn({ route: "email-register", outcome: "rate_limited" });
      return Response.json(
        { error: "rate_limited", retryAfterSec: gate.retryAfterSec ?? 1 },
        { status: 429 },
      );
    }
    await recordRegistrationAttempt(ip);

    // WR-04: collapse plus/dot aliases to one canonical mailbox so a second
    // alias of an existing mailbox cannot mint another account (and therefore
    // another `email:{userId}` trial customerRef). The UNIQUE constraint on
    // `emailCanonical` is the race arbiter; this read is the fast path.
    const emailCanonical = canonicalizeEmail(email);

    // WR-02 residual disclosure (ACCEPTED and documented, not silently
    // ignored): the distinguishable 409 below is a SECOND account-existence
    // oracle alongside the login path. It mirrors the reset-request
    // enumeration surface the owner accepted under D-89 (CONTEXT D-89: the
    // honest no-account answer deliberately reveals account existence and the
    // enumeration risk was accepted consciously). D-89 is cited here as
    // PRECEDENT ONLY — it is NOT an owner decision that covers register, and no
    // separate owner sign-off for this register surface is claimed. Email
    // verification is deliberately NOT added (D-79 forbids it), so the residual
    // disclosure is documented rather than closed. Threat T-06-13-01.
    const existing = await prisma.user.findFirst({
      where: { OR: [{ email }, { emailCanonical }] },
      select: { id: true },
    });
    if (existing) {
      logger.warn({ route: "email-register", outcome: "duplicate" });
      return Response.json({ error: "email_taken" }, { status: 409 });
    }
    let passwordHash: string;
    try {
      passwordHash = await hashPassword(password);
    } catch {
      return Response.json({ error: "bad_request" }, { status: 400 });
    }
    let user;
    try {
      user = await prisma.user.create({
        data: { email, emailCanonical, passwordHash },
        select: { id: true },
      });
    } catch (err: unknown) {
      // Race: two concurrent registers for the same email — or the same
      // canonical mailbox — the UNIQUE constraint is the arbiter (never a
      // client-side flag).
      if (
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        (err as { code: unknown }).code === "P2002"
      ) {
        logger.warn({ route: "email-register", outcome: "duplicate" });
        return Response.json({ error: "email_taken" }, { status: 409 });
      }
      throw err;
    }
    // 06-03 (D-90): welcome mail — fire-and-forget, never blocks the 200.
    // A mail failure must not fail registration: sendMail logs the outcome
    // internally, the rejection is swallowed here by contract.
    void sendWelcomeMail(email).catch(() => {});
    // Trial gate companion: email-only accounts verify the mailbox before
    // the trial is issued. The link send is best-effort here — the cabinet
    // offers an explicit resend (see /api/auth/email/verify/request).
    void requestVerification(user.id).catch(() => undefined);
    // Referral pin — best-effort, never blocks the 200.
    if (ref) void pinReferrer(user.id, ref).catch(() => undefined);
    const token = await signSession(user.id, null, env.SESSION_SECRET);
    logger.info({ route: "email-register", outcome: "issued" });
    return Response.json(
      { ok: true },
      {
        headers: {
          "Set-Cookie": buildSessionCookie(token, env.NODE_ENV === "production"),
        },
      },
    );
  } catch {
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
