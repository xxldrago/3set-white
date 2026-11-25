// POST /api/mobile/auth/telegram/nonce
// Generate a one-time nonce for Telegram deep-link authentication.
import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const NONCE_PREFIX = "nonce_";
const NONCE_BYTES = 16; // 32 hex chars
const NONCE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export async function POST() {
  const started = Date.now();
  try {
    const nonce = `${NONCE_PREFIX}${randomBytes(NONCE_BYTES).toString("hex")}`;

    await prisma.telegramLinkToken.create({
      data: {
        token: nonce,
        expiresAt: new Date(Date.now() + NONCE_TTL_MS),
      },
    });

    logger.info({ route: "/api/mobile/auth/telegram/nonce", outcome: "success", durationMs: Date.now() - started });
    return NextResponse.json({ nonce, expiresIn: Math.floor(NONCE_TTL_MS / 1000) });
  } catch (err) {
    logger.error({ route: "/api/mobile/auth/telegram/nonce", error: String(err), durationMs: Date.now() - started });
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}