// POST /api/auth/email/password/change — rotate the account password
// from inside the cabinet (D-92, AUTH-03-support, T-06-03).
//
// Session gate first; the CURRENT password is verified before anything
// rotates (wrong current → 401 current_password_wrong — never an existence
// or password-presence oracle: TG-only accounts take the identical path).
// New password enforces min-8 server-side. The session is re-minted after
// rotation (privilege change — same follow-through as login/link/unlink).
import { z } from "zod";
import { buildSessionCookie, signSession } from "../../../../../../lib/auth";
import { env } from "../../../../../../lib/env";
import { logger } from "../../../../../../lib/logger";
import { hashPassword, verifyPassword } from "../../../../../../lib/password";
import { prisma } from "../../../../../../lib/prisma";
import { SessionError, requireSession } from "../../../../../../lib/session";

export const dynamic = "force-dynamic";

const changeSchema = z.object({
  currentPassword: z.string().min(1).max(256),
  newPassword: z.string().min(8).max(256),
});

export async function POST(req: Request): Promise<Response> {
  let userId: number;
  try {
    ({ userId } = await requireSession());
  } catch (err) {
    if (err instanceof SessionError) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    logger.error({ route: "email-password-change", outcome: "session_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const parsed = changeSchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const { currentPassword, newPassword } = parsed.data;

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, passwordHash: true, telegramId: true },
    });
    // Identical 401 whether the row is gone, has no password (TG-only), or
    // the current password mismatches — no oracle on any of the three.
    if (!user || !(await verifyPassword(user.passwordHash, currentPassword))) {
      logger.warn({ route: "email-password-change", outcome: "rejected" });
      return Response.json({ error: "current_password_wrong" }, { status: 401 });
    }
    let passwordHash: string;
    try {
      passwordHash = await hashPassword(newPassword);
    } catch {
      return Response.json({ error: "bad_request" }, { status: 400 });
    }
    // WR-01: rotate the hash and bump the revocation watermark in one write so
    // every session issued before this second is rejected; the re-mint below
    // happens after the bump, so the current browser stays signed in.
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, credentialsChangedAt: new Date() },
    });
    const token = await signSession(
      user.id,
      user.telegramId === null ? null : Number(user.telegramId),
      env.SESSION_SECRET,
    );
    logger.info({ route: "email-password-change", outcome: "rotated" });
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
