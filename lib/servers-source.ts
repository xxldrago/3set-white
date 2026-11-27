// lib/servers-source.ts — cache-first subscription-links source (Phase 19,
// D-22). The ARTEMIDA `KeyCache` caches key metadata + subscriptionUrl, but NOT
// `links[]` (verified: prisma/schema.prisma KeyCache + lib/keys-service.ts).
// This module adds a small in-memory short-TTL cache keyed by keyId so a mobile
// refresh does not hit ARTEMIDA on every request, and degrades gracefully on
// provider errors (401/402/409/429/502/503, both error envelopes, Retry-After).
//
// SECURITY: raw links carry secrets. They are never logged, never returned to
// a client by this module, and only handed to lib/server-pool.ts for parsing.
import { ArtemidaError, type ArtemidaCode } from "./artemida";
import { getSubscriptionForUserId } from "./keys-service";

/** Short TTL for the in-memory `keyId → links[]` cache. */
export const LINKS_TTL_MS = 60_000;

export interface CacheEntry {
  links: string[];
  storedAt: number;
}

/** In-memory cache. Keyed by `${userId}:${keyId}` so entries are never shared
 * across owners even if a future caller passes an unvalidated keyId. */
export const linksCache = new Map<string, CacheEntry>();

export interface ServersSourceResult {
  links: string[];
  /** True when links came from cache after a provider failure. */
  stale: boolean;
  /** Provider error code (mapped from ArtemidaError), or null on success. */
  error: ArtemidaCode | null;
  /** Retry-After passthrough for rate_limited. */
  retryAfterSec?: number;
}

function errorResult(err: unknown, links: string[], stale: boolean): ServersSourceResult {
  if (err instanceof ArtemidaError) {
    const result: ServersSourceResult = { links, stale, error: err.code };
    if (err.code === "rate_limited" && err.retryAfterSec !== undefined) {
      result.retryAfterSec = err.retryAfterSec;
    }
    return result;
  }
  return { links, stale, error: "unknown" };
}

/**
 * Cache-first read of one owned key's subscription links.
 *
 * - Fresh cached links → served immediately (no provider call).
 * - Otherwise `getSubscriptionForUserId(userId, keyId)` (ownership-joined;
 *   `getSubscriptionForUserId`, NOT `getKeyWithLinks`; NOT ARTEMIDA `/pricing`).
 * - Provider error → cached copy with `stale: true` when present, else empty
 *   pools with an error code. Never throws, never 5xx at the route boundary.
 */
export async function getSubscriptionLinksCacheFirst(
  userId: number,
  keyId: string,
): Promise<ServersSourceResult> {
  if (typeof keyId !== "string" || keyId.length === 0) {
    return { links: [], stale: false, error: "not_found" };
  }

  // Namespace by owner so the cache itself enforces scope, not just the
  // caller's ownership-joined lookup (IN-02).
  const cacheKey = `${userId}:${keyId}`;
  const cached = linksCache.get(cacheKey);
  if (cached && Date.now() - cached.storedAt < LINKS_TTL_MS) {
    return { links: cached.links, stale: false, error: null };
  }

  try {
    const subscription = await getSubscriptionForUserId(userId, keyId);
    const links = Array.isArray(subscription?.links) ? subscription!.links : [];
    linksCache.set(cacheKey, { links, storedAt: Date.now() });
    return { links, stale: false, error: null };
  } catch (err) {
    // A provider failure must never corrupt a previously good cache entry.
    if (cached) return errorResult(err, cached.links, true);
    return errorResult(err, [], false);
  }
}
