// POST /api/mobile/auth/login
// Mobile email/password login → JWT token pair (access 15m + refresh 30d).
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyPassword, dummyVerify, PASSWORD_MIN_LENGTH } from "@/lib/password";
import { checkLoginRateLimit, recordFailedLogin, resetLoginAttempts } from "@/lib/auth-rate-limit";
import { issueTokenPair } from "@/lib/mobile-auth";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email({ message: "invalid_email" }).max(254),
  password: z.string().min(PASSWORD_MIN_LENGTH, "password_too_short").max(256),
});

export async function POST(req: NextRequest) {
  const started = Date.now();
  try {
    const body = await req.json();
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_request", details: parsed.error.flatten() }, { status: 400 });
    }

    const { email, password } = parsed.data;

    // Get client IP for rate limiting
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

    // Rate limit check
    const rateLimit = await checkLoginRateLimit(email, ip);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "rate_limited", retryAfterSec: rateLimit.retryAfterSec },
        { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSec ?? 1) } },
      );
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, passwordHash: true, telegramId: true },
    });

    if (!user || !user.passwordHash) {
      // Timing-safe dummy verify to prevent account enumeration
      await dummyVerify(password);
      const decision = await recordFailedLogin(email, ip);
      return NextResponse.json(
        { error: "invalid_credentials" },
        { status: 401, headers: decision.retryAfterSec ? { "Retry-After": String(decision.retryAfterSec) } : {} },
      );
    }

    // Verify password
    const valid = await verifyPassword(user.passwordHash, password);
    if (!valid) {
      const decision = await recordFailedLogin(email, ip);
      return NextResponse.json(
        { error: "invalid_credentials" },
        { status: 401, headers: decision.retryAfterSec ? { "Retry-After": String(decision.retryAfterSec) } : {} },
      );
    }

    // Success: reset rate limit, issue tokens
    await resetLoginAttempts(email, ip);
    const tokenPair = await issueTokenPair(user.id, user.telegramId ? Number(user.telegramId) : null);

    logger.info({ route: "/api/mobile/auth/login", userId: user.id, outcome: "success", durationMs: Date.now() - started });
    return NextResponse.json(tokenPair);
  } catch (err) {
    logger.error({ route: "/api/mobile/auth/login", error: String(err), durationMs: Date.now() - started });
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}