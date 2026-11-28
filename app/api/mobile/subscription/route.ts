// GET /api/mobile/subscription — REQ-SUB-01/02/06, REQ-BE-03, D-10/D-12.
// JWT-gated, ownership-joined read of ONE active owned key. The client receives
// statusKind/graceUntil from the shared server predicate and never derives the
// 24h window itself. No device mutation endpoint lives here (Phase 22 scope).
// No subscription link, key status or provider text is ever logged.
import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { ArtemidaError } from "@/lib/artemida";
import {
  daysUntilExpiry,
  getSubscriptionForUserId,
  listKeysByUserId,
} from "@/lib/keys-service";
import { verifyAccessToken } from "@/lib/mobile-auth";
import { ensureReferralCode } from "@/lib/referrals";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { deriveSubscriptionStatus, isKeyConnectable } from "@/lib/subscription-view";

export const dynamic = "force-dynamic";

const ROUTE = "/api/mobile/subscription";

interface UserIdentity {
  id: number;
  telegramId: number | null;
  email: string | null;
  /** Real nullable DB fields — never invented on the server or the client. */
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  /** Stored public code (already carries the `3SET-` prefix, verbatim). */
  referralCode: string | null;
}

interface SubscriptionBody {
  ok: boolean;
  error?: string;
  /** Kept so the Flutter session-restore fast path still validates tokens. */
  user?: UserIdentity;
  expiresAt?: string | null;
  remainingDays?: number | null;
  deviceLimit?: number | null;
  link?: string | null;
  /** Display-only count from RenderedKey; add/remove is Phase 22. */
  devices?: number | null;
  isTrial?: boolean;
  statusKind?: string;
  graceUntil?: string | null;
}

function respond(body: SubscriptionBody, requestId: string, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "x-request-id": requestId },
  });
}

export async function GET(req: NextRequest) {
  const started = Date.now();
  const requestId = randomUUID();
  try {
    const claims = await verifyAccessToken(req);
    if (!claims) {
      logger.info({ route: ROUTE, requestId, outcome: "unauthorized", durationMs: Date.now() - started });
      return respond({ ok: false, error: "unauthorized" }, requestId, 401);
    }

    // The existing user identity fields are retained: Flutter session restore
    // reads `user.id` from a 200 response to persist the userId fast path.
    const user = await prisma.user.findUnique({
      where: { id: claims.userId },
      select: {
        id: true,
        telegramId: true,
        email: true,
        firstName: true,
        lastName: true,
        username: true,
        referralCode: true,
      },
    });
    if (!user) {
      logger.info({
        route: ROUTE, requestId, userId: claims.userId,
        outcome: "user_not_found", durationMs: Date.now() - started,
      });
      return respond({ ok: false, error: "user_not_found" }, requestId, 404);
    }
    // A NULL legacy code is ensured on the AUTHENTICATED user's own row only.
    // The stored value already includes the public `3SET-` prefix and is
    // returned verbatim — never generated or double-prefixed here (T-22-14).
    const referralCode =
      user.referralCode ?? (await ensureReferralCode(claims.userId));
    const identity: UserIdentity = {
      id: user.id,
      telegramId: user.telegramId ? Number(user.telegramId) : null,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      username: user.username,
      referralCode,
    };

    // One owned, connectable key is picked by the SAME predicate /servers and
    // /config use; a missing/non-owned/raw-disqualified key is all "no key".
    const keys = await listKeysByUserId(claims.userId);
    const active = keys.find(isKeyConnectable);
    if (!active) {
      logger.info({
        route: ROUTE, requestId, userId: claims.userId,
        outcome: "no_active_key", durationMs: Date.now() - started,
      });
      return respond({ ok: false, error: "no_active_key", user: identity }, requestId);
    }

    // getSubscriptionForUserId is PER-KEY (userId, keyId): exactly one call,
    // never a loop and never a client-supplied key id (T-21-11 IDOR).
    let subscription;
    try {
      subscription = await getSubscriptionForUserId(claims.userId, active.id);
    } catch (err) {
      const code = err instanceof ArtemidaError ? err.code : "internal";
      // Unauthorized from the provider is no_active_key-safe. Only the stable
      // code is logged — never `err.message`, links, or a provider payload.
      const outcome = code === "unauthorized" ? "no_active_key" : "provider_error";
      logger.info({
        route: ROUTE, requestId, userId: claims.userId,
        outcome, code, durationMs: Date.now() - started,
      });
      return respond(
        { ok: false, error: outcome === "no_active_key" ? "no_active_key" : code, user: identity },
        requestId,
      );
    }
    if (!subscription) {
      logger.info({
        route: ROUTE, requestId, userId: claims.userId,
        outcome: "no_active_key", durationMs: Date.now() - started,
      });
      return respond({ ok: false, error: "no_active_key", user: identity }, requestId);
    }

    const view = deriveSubscriptionStatus(active);
    logger.info({
      route: ROUTE, requestId, userId: claims.userId,
      outcome: "success", durationMs: Date.now() - started,
    });
    return respond(
      {
        ok: true,
        user: identity,
        expiresAt: active.expiresAt,
        remainingDays: daysUntilExpiry(active.expiresAt),
        deviceLimit: active.deviceLimit,
        link: subscription.subscriptionUrl,
        devices: active.devices,
        isTrial: active.isTrial === true,
        statusKind: view.statusKind,
        graceUntil: view.graceUntil,
      },
      requestId,
    );
  } catch {
    // Never a 5xx and never a raw provider text/link in the log.
    logger.error({ route: ROUTE, requestId, outcome: "internal", durationMs: Date.now() - started });
    return respond({ ok: false, error: "internal" }, requestId);
  }
}
