// POST /api/auth/email/password/request — reset intake (AUTH-04, D-88/D-89).
//
// Strict zod boundary (email trim+lowercase max 254): malformed → 400.
// Unknown email → honest 404 `reset_no_account` — the ONE accepted
// enumeration surface in the auth surface (D-89, T-06-04 accepted).
// Existing email → fresh one-time PasswordReset row (1h TTL) + reset mail,
// always 200-shaped `{ ok: true }` (a mail-transport failure maps to a
// generic 500 `reset_error`, never provider text — T-06-08).
//
// Abuse throttle reuses the login rate-limit counter per email+IP (D-84):
// locked → 429 + server `retryAfterSec`; the current request still completes,
// the lock bites on the next one (same discipline as login).
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { clientIp } from "../../../../../../lib/client-ip";
import { logger } from "../../../../../../lib/logger";
import { MailError, sendResetMail } from "../../../../../../lib/mail";
import { prisma } from "../../../../../../lib/prisma";
import { checkLoginRateLimit, recordFailedLogin } from "../../../../../../lib/auth-rate-limit";

export const dynamic = "force-dynamic";

const requestSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
});

/** D-88: one-time token lifetime. */
export const RESET_TTL_MS = 60 * 60 * 1000;

export async function POST(req: Request): Promise<Response> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const parsed = requestSchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const { email } = parsed.data;
  const ip = clientIp(req);

  try {
    const gate = await checkLoginRateLimit(email, ip);
    if (!gate.allowed) {
      logger.warn({ route: "email-reset-request", outcome: "rate_limited" });
      return Response.json(
        { error: "rate_limited", retryAfterSec: gate.retryAfterSec },
        { status: 429 },
      );
    }
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    // The shared per-email+IP counter also throttles reset-mail spam: after
    // MAX_ATTEMPTS rapid requests the NEXT one 429s (login discipline).
    await recordFailedLogin(email, ip);
    if (!user) {
      // Honest no-account answer (D-89) — accepted enumeration, owner-approved.
      logger.warn({ route: "email-reset-request", outcome: "no_account" });
      return Response.json({ error: "reset_no_account" }, { status: 404 });
    }
    const token = randomBytes(32).toString("hex");
    await prisma.passwordReset.create({
      data: {
        token,
        userId: user.id,
        expiresAt: new Date(Date.now() + RESET_TTL_MS),
      },
    });
    try {
      await sendResetMail(email, token);
    } catch (err) {
      if (err instanceof MailError) {
        return Response.json({ error: "reset_error" }, { status: 500 });
      }
      throw err;
    }
    logger.info({ route: "email-reset-request", outcome: "issued" });
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
