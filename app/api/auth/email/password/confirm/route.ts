// POST /api/auth/email/password/confirm — reset completion (AUTH-04, D-88).
//
// Token states map to distinct typed errors (all 400, no oracle beyond the
// D-89-accepted request surface): malformed/unknown → `reset_invalid`,
// already-consumed → `reset_used`, past the 1h TTL → `reset_expired`.
// The token comparison is timing-safe (lib/auth.ts discipline); expiry and
// used checks run BEFORE any effect; hash-rotation plus mark-used happen in
// ONE transaction with a `count === 1` consume guard (T-06-07) so a raced
// double-confirm loses with `reset_used`.
//
// Success does NOT auto-login (no Set-Cookie) — the user signs in with the
// new password via the normal login route.
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { logger } from "../../../../../../lib/logger";
import { hashPassword } from "../../../../../../lib/password";
import { prisma } from "../../../../../../lib/prisma";

export const dynamic = "force-dynamic";

const confirmSchema = z.object({
  token: z.string().min(1).max(256),
  newPassword: z.string().min(8).max(256),
});

/** Issued tokens are 32 random bytes hex-encoded (lib: randomBytes(32)). */
const TOKEN_SHAPE = /^[0-9a-f]{64}$/;

/**
 * Length-guarded timing-safe comparison for reset tokens. Garbage input →
 * false, never a throw (mirrors `timingSafeEqualHex` discipline, which is
 * module-private to lib/auth.ts).
 */
function tokensEqual(stored: string, supplied: string): boolean {
  if (typeof supplied !== "string" || supplied.length === 0) return false;
  const a = Buffer.from(stored, "utf8");
  const b = Buffer.from(supplied, "utf8");
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export async function POST(req: Request): Promise<Response> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const parsed = confirmSchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const { token, newPassword } = parsed.data;

  try {
    if (!TOKEN_SHAPE.test(token)) {
      logger.warn({ route: "email-reset-confirm", outcome: "invalid" });
      return Response.json({ error: "reset_invalid" }, { status: 400 });
    }
    const row = await prisma.passwordReset.findUnique({
      where: { token },
      select: { token: true, userId: true, expiresAt: true, usedAt: true },
    });
    if (!row || !tokensEqual(row.token, token)) {
      logger.warn({ route: "email-reset-confirm", outcome: "invalid" });
      return Response.json({ error: "reset_invalid" }, { status: 400 });
    }
    if (row.usedAt !== null) {
      logger.warn({ route: "email-reset-confirm", outcome: "used" });
      return Response.json({ error: "reset_used" }, { status: 400 });
    }
    if (row.expiresAt.getTime() <= Date.now()) {
      logger.warn({ route: "email-reset-confirm", outcome: "expired" });
      return Response.json({ error: "reset_expired" }, { status: 400 });
    }
    let passwordHash: string;
    try {
      passwordHash = await hashPassword(newPassword);
    } catch {
      return Response.json({ error: "bad_request" }, { status: 400 });
    }
    // Atomic consume: mark-used ONLY if still unused; count !== 1 means a
    // concurrent confirm won the race → the loser reports `reset_used`.
    const consumed = await prisma.$transaction(async (tx) => {
      const marked = await tx.passwordReset.updateMany({
        where: { token, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (marked.count !== 1) return false;
      // WR-01: rotate the hash and bump the revocation watermark atomically —
      // this route intentionally does NOT auto-login, so every pre-reset
      // session is revoked here.
      await tx.user.update({
        where: { id: row.userId },
        data: { passwordHash, credentialsChangedAt: new Date() },
      });
      return true;
    });
    if (!consumed) {
      logger.warn({ route: "email-reset-confirm", outcome: "used" });
      return Response.json({ error: "reset_used" }, { status: 400 });
    }
    logger.info({ route: "email-reset-confirm", outcome: "rotated" });
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
