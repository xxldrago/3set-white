// POST /api/auth/email/register — email identity intake (AUTH-01, D-79/D-86).
//
// Strict zod boundary (email trim+lowercase max 254, password min 8 max 256):
// malformed → 400, duplicate email → 409, success mints the SAME httpOnly
// session cookie as Telegram auth (D-86) with a userId subject (D-82).
// No email verification in Phase 6 (owner decision, CONTEXT D-79..D-86).
import { z } from "zod";
import { buildSessionCookie, signSession } from "../../../../../lib/auth";
import { env } from "../../../../../lib/env";
import { logger } from "../../../../../lib/logger";
import { hashPassword } from "../../../../../lib/password";
import { prisma } from "../../../../../lib/prisma";

export const dynamic = "force-dynamic";

const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(8).max(256),
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
  const { email, password } = parsed.data;

  try {
    const existing = await prisma.user.findUnique({
      where: { email },
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
        data: { email, passwordHash },
        select: { id: true },
      });
    } catch (err: unknown) {
      // Race: two concurrent registers for the same email — the UNIQUE
      // constraint is the arbiter (never a client-side flag).
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
    // 06-03 (D-90): welcome mail via lib/mail — fire-and-forget hook point,
    // never blocks the 200.
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
