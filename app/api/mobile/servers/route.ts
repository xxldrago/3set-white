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

export const dynamic = "force-dynamic";

const DISQUALIFIED_STATUSES = new Set(["expired", "revoked", "disabled", "trial-expired"]);

/**
 * D-21: `RenderedKey.id === keyId` (NOT `k.keyId`). `deriveStatusKind` alone is
 * insufficient — it reports "active" for raw `revoked`/`disabled` when
 * expiresAt is in the future — so the raw status is checked explicitly. A
 * trial key stays active until its expireAt; `isTrial` does not disqualify.
 */
export function isActiveKey(key: RenderedKey): boolean {
  const id = typeof key.id === "string" ? key.id.trim() : "";
  if (!id) return false;
  if (key.statusKind !== "active" && key.statusKind !== "expiring") return false;
  if (key.expiresAt) {
    const expiry = new Date(key.expiresAt).getTime();
    if (!Number.isNaN(expiry) && expiry <= Date.now()) return false;
  }
  const rawStatus = (typeof key.status === "string" ? key.status : "")
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-");
  if (DISQUALIFIED_STATUSES.has(rawStatus)) return false;
  return true;
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
