// POST /api/auth/email/login — email credential intake (AUTH-02, D-84/D-85).
//
// Rate-limit gate FIRST (D-84): locked → 429 + server retryAfterSec.
// Wrong email AND wrong password → byte-identical 401 (no enumeration,
// T-06-04); unknown emails burn a dummy Argon2id verify for equal cost
// (T-06-01). TG-only accounts (no passwordHash) take the same 401 path.
// Success re-mints a fresh userId-subject session (anti-fixation, T-06-03)
// and resets the attempt counter.
import { z } from "zod";
import { buildSessionCookie, signSession } from "../../../../../lib/auth";
import { env } from "../../../../../lib/env";
import { logger } from "../../../../../lib/logger";
import { dummyVerify, verifyPassword } from "../../../../../lib/password";
import { prisma } from "../../../../../lib/prisma";
import {
  checkLoginRateLimit,
  recordFailedLogin,
  resetLoginAttempts,
} from "../../../../../lib/auth-rate-limit";

export const dynamic = "force-dynamic";

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(256),
});

const invalid = () => Response.json({ error: "invalid_credentials" }, { status: 401 });

function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first && first.length > 0 ? first : "direct";
}

export async function POST(req: Request): Promise<Response> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const { email, password } = parsed.data;
  const ip = clientIp(req);

  try {
    const gate = await checkLoginRateLimit(email, ip);
    if (!gate.allowed) {
      logger.warn({ route: "email-login", outcome: "rate_limited" });
      return Response.json(
        { error: "rate_limited", retryAfterSec: gate.retryAfterSec },
        { status: 429 },
      );
    }
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, passwordHash: true, telegramId: true },
    });
    if (!user || !user.passwordHash) {
      // Equal-cost path: no oracle on account existence or password presence.
      await dummyVerify(password);
      await recordFailedLogin(email, ip);
      logger.warn({ route: "email-login", outcome: "rejected" });
      return invalid();
    }
    if (!(await verifyPassword(user.passwordHash, password))) {
      await recordFailedLogin(email, ip);
      logger.warn({ route: "email-login", outcome: "rejected" });
      return invalid();
    }
    await resetLoginAttempts(email, ip);
    const token = await signSession(
      user.id,
      user.telegramId === null ? null : Number(user.telegramId),
      env.SESSION_SECRET,
    );
    logger.info({ route: "email-login", outcome: "issued" });
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
