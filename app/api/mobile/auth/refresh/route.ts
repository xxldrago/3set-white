// POST /api/mobile/auth/refresh
// Mobile refresh token rotation → new JWT token pair.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyRefreshToken, issueTokenPair } from "@/lib/mobile-auth";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const refreshSchema = z.object({
  refreshToken: z.string().min(1, "refresh_token_required"),
});

export async function POST(req: NextRequest) {
  const started = Date.now();
  try {
    const body = await req.json();
    const parsed = refreshSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_request", details: parsed.error.flatten() }, { status: 400 });
    }

    const { refreshToken } = parsed.data;

    // Verify refresh token
    const claims = await verifyRefreshToken(refreshToken);
    if (!claims) {
      return NextResponse.json({ error: "invalid_token" }, { status: 401 });
    }

    // Issue new token pair (rotation + watermark bump)
    const tokenPair = await issueTokenPair(claims.userId, claims.telegramId);

    logger.info({ route: "/api/mobile/auth/refresh", userId: claims.userId, outcome: "success", durationMs: Date.now() - started });
    return NextResponse.json(tokenPair);
  } catch (err) {
    logger.error({ route: "/api/mobile/auth/refresh", error: String(err), durationMs: Date.now() - started });
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}