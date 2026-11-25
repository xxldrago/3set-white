// GET /api/mobile/subscription
// Mobile subscription status endpoint - validates Bearer token and returns user info.
import { NextRequest, NextResponse } from "next/server";
import { verifyAccessToken } from "@/lib/mobile-auth";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const started = Date.now();
  try {
    const claims = await verifyAccessToken(req);
    if (!claims) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    // Fetch user info and keys (stub - Phase 21 fills in ARTEMIDA keys)
    const user = await prisma.user.findUnique({
      where: { id: claims.userId },
      select: { id: true, telegramId: true, email: true },
    });

    if (!user) {
      return NextResponse.json({ error: "user_not_found" }, { status: 404 });
    }

    // Keys will be populated in Phase 21 from ARTEMIDA
    const keys: Array<{
      keyId: string;
      name: string | null;
      status: string;
      isTrial: boolean;
      expiresAt: string | null;
      deviceLimit: number | null;
      subscriptionUrl: string | null;
    }> = [];

    logger.info({ route: "/api/mobile/subscription", userId: claims.userId, outcome: "success", durationMs: Date.now() - started });
    return NextResponse.json({
      user: {
        id: user.id,
        telegramId: user.telegramId ? Number(user.telegramId) : null,
        email: user.email,
      },
      keys,
    });
  } catch (err) {
    logger.error({ route: "/api/mobile/subscription", error: String(err), durationMs: Date.now() - started });
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}