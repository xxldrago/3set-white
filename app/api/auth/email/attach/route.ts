// POST /api/auth/email/attach — add an email identity to a Telegram-signed
// account (Phase 6 follow-up: TG → email capability, AUTH-01 symmetric to
// email/link).
//
// Session gate first; the row must not carry an email yet (409
// `email_exists` — the Account section hides the form in that state, this is
// the defensive branch). The email + password are the SAME credential pair
// the login route accepts: canonical mailbox uniqueness (WR-04) is enforced
// by the read below and the UNIQUE(emailCanonical) arbiter on P2002, so an
// alias of an existing mailbox can never attach twice (no second
// `email:{userId}` customerRef). Rate-limited per trusted client IP on the
// SAME registration throttle (WR-02: this is account intake, not a profile
// edit — a farmer rotating emails hits the identical cap).
//
// Attaching a password is a credential change: the revocation watermark is
// bumped in the same write (WR-01) and the session is re-minted afterwards
// so the current browser stays signed in while every other session dies
// (same discipline as password/change).
//
// No email verification exists in Phase 6 (D-79 owner decision), so an
// unowned-but-real mailbox can be claimed here exactly as on register — the
// residual disclosure is the accepted register contract, not a new one.
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
import { revalidateKeys, revalidateKeysByUserId } from "../../../../../lib/keys-service";
import { hashPassword } from "../../../../../lib/password";
import { prisma } from "../../../../../lib/prisma";
import { SessionError, requireSession } from "../../../../../lib/session";

export const dynamic = "force-dynamic";

const attachSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(8).max(256),
});

export async function POST(req: Request): Promise<Response> {
  let userId: number;
  let telegramId: number | null;
  try {
    ({ userId, telegramId } = await requireSession());
  } catch (err) {
    if (err instanceof SessionError) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    logger.error({ route: "email-attach", outcome: "session_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const parsed = attachSchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const { email, password } = parsed.data;
  const ip = clientIp(req);

  try {
    // Account intake shares the registration throttle (WR-02/WR-04): gate
    // FIRST on the trusted IP so a flood never reaches the uniqueness reads.
    const gate = await checkRegistrationRateLimit(ip);
    if (!gate.allowed) {
      logger.warn({ route: "email-attach", outcome: "rate_limited" });
      return Response.json(
        { error: "rate_limited", retryAfterSec: gate.retryAfterSec ?? 1 },
        { status: 429 },
      );
    }
    await recordRegistrationAttempt(ip);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, telegramId: true },
    });
    if (!user) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    if (user.email !== null) {
      logger.warn({ route: "email-attach", outcome: "already_attached" });
      return Response.json({ error: "email_exists" }, { status: 409 });
    }

    const emailCanonical = canonicalizeEmail(email);
    const existing = await prisma.user.findFirst({
      where: { OR: [{ email }, { emailCanonical }] },
      select: { id: true },
    });
    if (existing) {
      logger.warn({ route: "email-attach", outcome: "duplicate" });
      return Response.json({ error: "email_taken" }, { status: 409 });
    }

    let passwordHash: string;
    try {
      passwordHash = await hashPassword(password);
    } catch {
      return Response.json({ error: "bad_request" }, { status: 400 });
    }

    // Single write: credential pair + revocation watermark (WR-01). The
    // UNIQUE(emailConstraint) race is caught below — never a 500.
    try {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          email,
          emailCanonical,
          passwordHash,
          credentialsChangedAt: new Date(),
        },
      });
    } catch (err: unknown) {
      if (
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        (err as { code: unknown }).code === "P2002"
      ) {
        logger.warn({ route: "email-attach", outcome: "duplicate" });
        return Response.json({ error: "email_taken" }, { status: 409 });
      }
      throw err;
    }

    // Re-mint after the bump: the current session predates the watermark and
    // would otherwise be revoked by its own attach.
    const token = await signSession(
      user.id,
      user.telegramId === null ? telegramId : Number(user.telegramId),
      env.SESSION_SECRET,
    );
    logger.info({ route: "email-attach", outcome: "attached" });
    // Fire-and-forget: refresh the keys cache so /subscription shows the
    // newly-owned customerRef after the identity change (no manual sync).
    const tid = user.telegramId === null ? telegramId : Number(user.telegramId);
    void (tid !== null ? revalidateKeys(BigInt(tid)) : revalidateKeysByUserId(user.id)).catch(
      () => undefined,
    );
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
