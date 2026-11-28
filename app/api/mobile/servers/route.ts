// GET /api/mobile/servers — Phase 19 contract backbone (D-01/D-21/D-22).
// JWT + active key required. Source = subscription-links parsed server-side
// (getSubscriptionForUserId → artemida.getSubscriptionLinks); NOT /pricing,
// NOT getKeyWithLinks, no ARTEMIDA on the client. No `load`, no raw share-link
// or secret in the response, never logged.
import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { verifyAccessToken } from "@/lib/mobile-auth";
import { daysUntilExpiry, listKeysByUserId, type RenderedKey } from "@/lib/keys-service";
import { getSubscriptionLinksCacheFirst } from "@/lib/servers-source";
import { parsePools, type Server } from "@/lib/server-pool";
import { logger } from "@/lib/logger";
import { isKeyConnectable } from "@/lib/subscription-view";

export const dynamic = "force-dynamic";

/**
 * D-21 gate, now delegated to the one shared D-10 predicate. The id check and
 * raw-status exclusions (revoked/disabled/trial-expired/expired) are preserved
 * there verbatim; the only behaviour change is the 24h grace branch, which
 * keeps an expired-by-time, non-trial key connectable until `graceUntil`.
 * `/api/mobile/config` imports this same function — no inline duplicate.
 */
export function isActiveKey(key: RenderedKey): boolean {
  return isKeyConnectable(key);
}

interface KeyMeta {
  active: boolean;
  keyId: string;
  isTrial: boolean;
  remainingDays: number | null;
  expireAt: string | null;
}

interface ServersBody {
  ok: boolean;
  error?: string;
  simple: Server[];
  whitelist: Server[];
  key: KeyMeta | null;
  stale?: boolean;
  retryAfterSec?: number;
}

function respond(body: ServersBody, requestId: string, status = 200, retryAfterSec?: number) {
  const headers: Record<string, string> = { "x-request-id": requestId };
  if (retryAfterSec !== undefined) headers["Retry-After"] = String(retryAfterSec);
  return NextResponse.json(body, { status, headers });
}

const EMPTY_KEY: KeyMeta | null = null;

export async function GET(req: NextRequest) {
  const started = Date.now();
  const requestId = randomUUID();
  try {
    const claims = await verifyAccessToken(req);
    if (!claims) {
      logger.info({ route: "/api/mobile/servers", requestId, outcome: "unauthorized", durationMs: Date.now() - started });
      return respond(
        { ok: false, error: "unauthorized", simple: [], whitelist: [], key: EMPTY_KEY },
        requestId,
        401,
      );
    }

    const keys = await listKeysByUserId(claims.userId);
    const active = keys.find(isActiveKey);
    if (!active) {
      logger.info({ route: "/api/mobile/servers", requestId, userId: claims.userId, outcome: "no_active_key", durationMs: Date.now() - started });
      return respond(
        { ok: false, error: "no_active_key", simple: [], whitelist: [], key: EMPTY_KEY },
        requestId,
        403,
      );
    }

    const key: KeyMeta = {
      active: true,
      keyId: active.id,
      isTrial: active.isTrial === true,
      remainingDays: daysUntilExpiry(active.expiresAt),
      expireAt: active.expiresAt,
    };

    const source = await getSubscriptionLinksCacheFirst(claims.userId, active.id);
    const { simple, whitelist } = parsePools(source.links);

    // D-22: unauthorized from the provider is no_active_key-safe. No 5xx.
    if (source.error === "unauthorized") {
      return respond(
        { ok: false, error: "no_active_key", simple: [], whitelist: [], key: EMPTY_KEY },
        requestId,
        403,
      );
    }

    if (source.error !== null) {
      logger.info({
        route: "/api/mobile/servers", requestId, userId: claims.userId,
        outcome: "provider_error", error: source.error, stale: source.stale,
        durationMs: Date.now() - started,
      });
      return respond(
        {
          ok: false,
          error: source.error,
          simple,
          whitelist,
          key,
          stale: source.stale,
          ...(source.retryAfterSec !== undefined ? { retryAfterSec: source.retryAfterSec } : {}),
        },
        requestId,
        200,
        source.retryAfterSec,
      );
    }

    logger.info({
      route: "/api/mobile/servers", requestId, userId: claims.userId,
      outcome: "success", simpleCount: simple.length, whitelistCount: whitelist.length,
      stale: source.stale, durationMs: Date.now() - started,
    });
    return respond({ ok: true, simple, whitelist, key, stale: source.stale }, requestId);
  } catch {
    // Outer failure is degraded, not a 5xx (D-22). Never log provider text or
    // any links/secrets from the error — only a stable outcome code.
    logger.error({ route: "/api/mobile/servers", requestId, outcome: "internal", durationMs: Date.now() - started });
    return respond(
      { ok: false, error: "internal", simple: [], whitelist: [], key: EMPTY_KEY },
      requestId,
    );
  }
}
