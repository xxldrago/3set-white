// GET /api/mobile/config?serverId=... — Phase 20 public BFF contract
// (D-01/D-02/D-03/D-04). JWT + active owned key are re-evaluated on EVERY
// request (incl. reconnect). The backend re-parses the authenticated user's
// subscription links and returns a complete sing-box TUN config; the client
// sends only serverId and never assembles a config fragment.
//
// NOT /pricing, NOT getKeyWithLinks, NOT /servers.outbound as a config source.
// Raw links stay server-side; no link, outbound secret, config, or Authorization
// is ever logged. Provider failures degrade to stable codes, never 5xx.
import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyAccessToken } from "@/lib/mobile-auth";
import { listKeysByUserId } from "@/lib/keys-service";
// The active-key predicate is the phase-19 gate, reused verbatim (D-03).
import { isActiveKey } from "@/app/api/mobile/servers/route";
import { getSubscriptionLinksCacheFirst } from "@/lib/servers-source";
import { parsePools } from "@/lib/server-pool";
import { buildMobileConfig, serverMeta, type MobileConfigServerMeta } from "@/lib/mobile-config";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/** serverId is the ONLY server selector accepted from the client (D-02). */
const serverIdSchema = z.string().min(1);
const ROUTE = "/api/mobile/config";

interface ConfigBody {
  ok: boolean;
  error?: string;
  config?: ReturnType<typeof buildMobileConfig>;
  server?: MobileConfigServerMeta;
  stale?: boolean;
  retryAfterSec?: number;
}

function respond(body: ConfigBody, requestId: string, status = 200, retryAfterSec?: number) {
  const headers: Record<string, string> = { "x-request-id": requestId };
  if (retryAfterSec !== undefined) headers["Retry-After"] = String(retryAfterSec);
  return NextResponse.json(body, { status, headers });
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

    const keys = await listKeysByUserId(claims.userId);
    const active = keys.find(isActiveKey);
    if (!active) {
      logger.info({
        route: ROUTE, requestId, userId: claims.userId,
        outcome: "no_active_key", durationMs: Date.now() - started,
      });
      return respond({ ok: false, error: "no_active_key" }, requestId, 403);
    }

    const source = await getSubscriptionLinksCacheFirst(claims.userId, active.id);
    const { simple, whitelist } = parsePools(source.links);

    // D-22 parity with /servers: provider unauthorized is no_active_key-safe.
    if (source.error === "unauthorized") {
      return respond({ ok: false, error: "no_active_key" }, requestId, 403);
    }

    if (source.error !== null) {
      logger.info({
        route: ROUTE, requestId, userId: claims.userId,
        outcome: "provider_error", error: source.error, stale: source.stale,
        durationMs: Date.now() - started,
      });
      return respond(
        {
          ok: false,
          error: source.error,
          stale: source.stale,
          ...(source.retryAfterSec !== undefined ? { retryAfterSec: source.retryAfterSec } : {}),
        },
        requestId,
        200,
        source.retryAfterSec,
      );
    }

    const parsed = serverIdSchema.safeParse(new URL(req.url).searchParams.get("serverId"));
    if (!parsed.success) {
      logger.info({
        route: ROUTE, requestId, userId: claims.userId,
        outcome: "server_not_found", durationMs: Date.now() - started,
      });
      return respond({ ok: false, error: "server_not_found" }, requestId);
    }

    const server = [...simple, ...whitelist].find((candidate) => candidate.id === parsed.data);
    if (!server) {
      logger.info({
        route: ROUTE, requestId, userId: claims.userId,
        outcome: "server_not_found", durationMs: Date.now() - started,
      });
      return respond({ ok: false, error: "server_not_found" }, requestId);
    }

    logger.info({
      route: ROUTE, requestId, userId: claims.userId,
      outcome: "success", durationMs: Date.now() - started,
    });
    return respond(
      { ok: true, config: buildMobileConfig(server), server: serverMeta(server) },
      requestId,
    );
  } catch {
    // Never a 5xx and never raw provider text/links/config in the log.
    logger.error({ route: ROUTE, requestId, outcome: "internal", durationMs: Date.now() - started });
    return respond({ ok: false, error: "internal" }, requestId);
  }
}
