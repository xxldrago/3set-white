// POST /api/mobile/auth/register
// Mobile email/password registration → JWT token pair.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { checkRegistrationRateLimit, recordRegistrationAttempt } from "@/lib/auth-rate-limit";
import { issueTokenPair } from "@/lib/mobile-auth";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const registerSchema = z
  .object({
    email: z.string().trim().toLowerCase().email({ message: "invalid_email" }).max(254),
    password: z.string().min(8, "password_too_short").max(256),
    confirmPassword: z.string().min(8).max(256),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "passwords_do_not_match",
    path: ["confirmPassword"],
  });

export async function POST(req: NextRequest) {
  const started = Date.now();
  try {
    const body = await req.json();
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_request", details: parsed.error.flatten() }, { status: 400 });
    }

    const { email, password } = parsed.data;

    // Get client IP for rate limiting
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

    // Rate limit check (registration throttle per trusted IP)
    const rateLimit = await checkRegistrationRateLimit(ip);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "rate_limited", retryAfterSec: rateLimit.retryAfterSec },
        { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSec ?? 1) } },
      );
    }

    // Check duplicate email
    const existing = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existing) {
      await recordRegistrationAttempt(ip);
      return NextResponse.json({ error: "email_exists" }, { status: 409 });
    }

    // Hash password and create user
    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: { email, passwordHash },
      select: { id: true, telegramId: true },
    });

    // Record attempt for rate limiting
    await recordRegistrationAttempt(ip);

    // Issue token pair
    const tokenPair = await issueTokenPair(user.id, user.telegramId ? Number(user.telegramId) : null);

    logger.info({ route: "/api/mobile/auth/register", userId: user.id, outcome: "success", durationMs: Date.now() - started });
    return NextResponse.json(tokenPair);
  } catch (err) {
    logger.error({ route: "/api/mobile/auth/register", error: String(err), durationMs: Date.now() - started });
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}