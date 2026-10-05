// POST /api/auth/email/unlink — detach the Telegram identity (D-93,
// AUTH-03, T-06-06).
//
// Allowed even for the last auth method (lockout risk accepted by the
// owner; support restores manually). Two gates: the session, AND an
// explicit `{ confirm: true }` intent flag in the body — a bare POST never
// unlinks. The session is re-minted WITHOUT the tid claim so the old
// Telegram-keyed access stops with the same response (privilege change,
// T-06-03 follow-through).
//
// The confirmation_required 400 carries a `lastMethod` hint (true when no
// email+password remains) so the 06-04 Account UI can render the D-93
// lockout warning BEFORE the second explicit tap. Own-account metadata
// only — never another user's.
import { z } from "zod";
import { buildSessionCookie, signSession } from "../../../../../lib/auth";
import { AccountNotFoundError, unlinkTelegram } from "../../../../../lib/accounts";
import { env } from "../../../../../lib/env";
import { logger } from "../../../../../lib/logger";
import { prisma } from "../../../../../lib/prisma";
import { SessionError, requireSession } from "../../../../../lib/session";

export const dynamic = "force-dynamic";

const unlinkSchema = z.object({
  confirm: z.literal(true),
});

export async function POST(req: Request): Promise<Response> {
  let userId: number;
  try {
    ({ userId } = await requireSession());
  } catch (err) {
    if (err instanceof SessionError) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    logger.error({ route: "email-unlink", outcome: "session_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  if (!unlinkSchema.safeParse(raw).success) {
    // No explicit second-tap intent → refuse, but tell the UI whether this
    // would remove the last method so it can warn (D-93).
    const row = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, passwordHash: true },
    });
    const lastMethod = !row || !(row.email && row.passwordHash);
    logger.warn({ route: "email-unlink", outcome: "confirm_required" });
    return Response.json({ error: "confirmation_required", lastMethod }, { status: 400 });
  }

  try {
    const result = await unlinkTelegram(userId);
    // WR-01: detaching Telegram is a privilege change — bump the watermark so
    // every other session (and the just-detached tid claim) is revoked. Bump
    // BEFORE re-minting so the current session's iat is >= the floored
    // watermark second and survives.
    await prisma.user.update({
      where: { id: userId },
      data: { credentialsChangedAt: new Date() },
    });
    const token = await signSession(userId, null, env.SESSION_SECRET);
    logger.info({ route: "email-unlink", outcome: result.unlinked ? "unlinked" : "noop" });
    return Response.json(
      { ok: true, unlinked: result.unlinked },
      {
        headers: {
          "Set-Cookie": buildSessionCookie(token, env.NODE_ENV === "production"),
        },
      },
    );
  } catch (err) {
    if (err instanceof AccountNotFoundError) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    logger.error({ route: "email-unlink", outcome: "error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
