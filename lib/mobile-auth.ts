// Mobile auth shared utilities (Plan 02).
//
// Thin wrapper around lib/auth.ts for mobile API token pair issuance
// and verification. Exports server-only functions used by all mobile auth routes.
import { SignJWT, jwtVerify } from "jose";
import { prisma } from "./prisma";
import { env } from "./env";
import { logger } from "./logger";

const ACCESS_TTL = "15m";
const REFRESH_TTL = "30d";

/** Issue an access+refresh token pair for a mobile session. */
export async function issueTokenPair(
  userId: number,
  telegramId: number | null,
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
  const secret = new TextEncoder().encode(env.SESSION_SECRET);
  const now = Math.floor(Date.now() / 1000);
  const accessExp = now + 15 * 60; // 15 minutes

  const accessToken = await new SignJWT({ uid: userId, tid: telegramId, typ: "access" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(now)
    .setExpirationTime(ACCESS_TTL)
    .sign(secret);

  const refreshToken = await new SignJWT({ uid: userId, tid: telegramId, typ: "refresh" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(now)
    .setExpirationTime(REFRESH_TTL)
    .sign(secret);

  // Bump credentials watermark to revoke old tokens (WR-01).
  await prisma.user.update({
    where: { id: userId },
    data: { credentialsChangedAt: new Date() },
  });

  logger.info({ route: "mobile-auth", action: "issue_token_pair", userId, telegramId });
  return { accessToken, refreshToken, expiresIn: 900 };
}

/** Verify an access token and return userId + telegramId if valid. */
export async function verifyAccessToken(
  req: Request,
): Promise<{ userId: number; telegramId: number | null } | null> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);

  try {
    const secret = new TextEncoder().encode(env.SESSION_SECRET);
    const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"] });

    if (payload.typ !== "access") return null;
    const userId = typeof payload.uid === "number" ? payload.uid : null;
    const telegramId = typeof payload.tid === "number" ? payload.tid : null;
    if (userId === null) return null;

    // Check credentials watermark (WR-01): reject tokens issued before last rotation.
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { credentialsChangedAt: true },
    });
    if (user?.credentialsChangedAt) {
      const issuedAt = typeof payload.iat === "number" ? payload.iat : null;
      const floored = Math.floor(user.credentialsChangedAt.getTime() / 1000);
      if (issuedAt === null || issuedAt < floored) return null;
    }

    return { userId, telegramId };
  } catch {
    return null;
  }
}

/** Verify a refresh token and return userId + telegramId if valid (for rotation). */
export async function verifyRefreshToken(token: string): Promise<{ userId: number; telegramId: number | null } | null> {
  try {
    const secret = new TextEncoder().encode(env.SESSION_SECRET);
    const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"] });

    if (payload.typ !== "refresh") return null;
    const userId = typeof payload.uid === "number" ? payload.uid : null;
    const telegramId = typeof payload.tid === "number" ? payload.tid : null;
    if (userId === null) return null;

    // Check credentials watermark.
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { credentialsChangedAt: true },
    });
    if (user?.credentialsChangedAt) {
      const issuedAt = typeof payload.iat === "number" ? payload.iat : null;
      const floored = Math.floor(user.credentialsChangedAt.getTime() / 1000);
      if (issuedAt === null || issuedAt < floored) return null;
    }

    return { userId, telegramId };
  } catch {
    return null;
  }
}