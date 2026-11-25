// GET /api/mobile/auth/telegram/poll?nonce=xxx
// Poll for Telegram authentication status.
// Returns 202 (pending), 200 (success with token pair), 410 (expired), 409 (already consumed).
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { issueTokenPair } from "@/lib/mobile-auth";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const pollSchema = z.object({
  nonce: z.string().startsWith("nonce_", { message: "invalid_nonce_format" }),
});

export async function GET(req: NextRequest) {
  const started = Date.now();
  try {
    const { searchParams } = new URL(req.url);
    const parsed = pollSchema.safeParse({ nonce: searchParams.get("nonce") ?? "" });
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_request", details: parsed.error.flatten() }, { status: 400 });
    }

    const { nonce } = parsed.data;

    const row = await prisma.telegramLinkToken.findUnique({
      where: { token: nonce },
      select: { userId: true, telegramId: true, expiresAt: true, consumedAt: true },
    });

    if (!row) {
      return NextResponse.json({ error: "not_found" }, { status: 410 });
    }

    if (row.consumedAt !== null) {
      return NextResponse.json({ error: "already_consumed" }, { status: 409 });
    }

    if (row.expiresAt.getTime() <= Date.now()) {
      return NextResponse.json({ error: "expired" }, { status: 410 });
    }

    if (row.telegramId === null) {
      // Still waiting for user to bind in Telegram
      return NextResponse.json({ status: "pending" }, { status: 202 });
    }

    // Telegram bound: consume token and issue token pair
    const claimed = await prisma.telegramLinkToken.updateMany({
      where: { token: nonce, consumedAt: null },
      data: { consumedAt: new Date() },
    });

    if (claimed.count === 0) {
      // Race condition: another poll consumed it
      return NextResponse.json({ error: "already_consumed" }, { status: 409 });
    }

    // Determine userId: if null, upsert user via telegramId (mobile flow)
    let userId = row.userId;
    if (userId === null) {
      const user = await prisma.user.upsert({
        where: { telegramId: row.telegramId! },
        update: {},
        create: { telegramId: row.telegramId! },
        select: { id: true },
      });
      userId = user.id;
      // Update the token row with the userId for future reference
      await prisma.telegramLinkToken.update({
        where: { token: nonce },
        data: { userId },
      });
    }

    // Issue token pair for the user
    const tokenPair = await issueTokenPair(userId, Number(row.telegramId));

    logger.info({ route: "/api/mobile/auth/telegram/poll", userId, outcome: "success", durationMs: Date.now() - started });
    return NextResponse.json({ tokenPair });
  } catch (err) {
    logger.error({ route: "/api/mobile/auth/telegram/poll", error: String(err), durationMs: Date.now() - started });
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}