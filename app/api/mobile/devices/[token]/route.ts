// DELETE /api/mobile/devices/[token] — JWT-gated removal of ONE device token
// (REQ-DEV-02, T-22-01/02/04). The path carries only an opaque token: the key is
// derived from claims.userId with the same connectable predicate as the list
// route, so the client never sends a keyId. Zod bounds the token BEFORE any
// provider call; a non-owned key and a failed ownership join collapse to the
// same HTTP 200 envelope as a missing key (no enumeration oracle).
//
// This route is reached only after the Flutter five-second undo window fires.
// There is no restore operation: once ARTEMIDA accepts the delete the row is
// gone and the client never reinserts it.
import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ArtemidaError } from "@/lib/artemida";
import { listKeysByUserId, removeDeviceByUserId } from "@/lib/keys-service";
import { logger } from "@/lib/logger";
import { verifyAccessToken } from "@/lib/mobile-auth";
import { isKeyConnectable } from "@/lib/subscription-view";

export const dynamic = "force-dynamic";

const ROUTE = "/api/mobile/devices/[token]";
const tokenSchema = z.string().min(1).max(300);

interface DeleteBody {
  ok: boolean;
  error?: string;
  retryAfterSec?: number;
}

function respond(
  body: DeleteBody,
  requestId: string,
  status = 200,
  retryAfterSec?: number,
) {
  const headers: Record<string, string> = { "x-request-id": requestId };
  if (retryAfterSec !== undefined) headers["Retry-After"] = String(retryAfterSec);
  return NextResponse.json(body, { status, headers });
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ token: string }> },
): Promise<Response> {
  const started = Date.now();
  const requestId = randomUUID();
  try {
    const claims = await verifyAccessToken(req);
    if (!claims) {
      logger.info({
        route: ROUTE, requestId, outcome: "unauthorized", durationMs: Date.now() - started,
      });
      return respond({ ok: false, error: "unauthorized" }, requestId, 401);
    }

    const { token } = await ctx.params;
    const parsed = tokenSchema.safeParse(token);
    if (!parsed.success) {
      // Rejected by zod before any DB/provider work; never echo the token.
      logger.info({
        route: ROUTE, requestId, userId: claims.userId,
        outcome: "bad_request", durationMs: Date.now() - started,
      });
      return respond({ ok: false, error: "bad_request" }, requestId, 400);
    }

    const keys = await listKeysByUserId(claims.userId);
    const active = keys.find(isKeyConnectable);
    if (!active) {
      logger.info({
        route: ROUTE, requestId, userId: claims.userId,
        outcome: "no_active_key", durationMs: Date.now() - started,
      });
      return respond({ ok: false, error: "no_active_key" }, requestId);
    }

    let owned: boolean;
    try {
      owned = await removeDeviceByUserId(claims.userId, active.id, parsed.data);
    } catch (err) {
      const providerError = err instanceof ArtemidaError ? err : null;
      const code = providerError?.code ?? "internal";
      const outcome = code === "unauthorized" ? "no_active_key" : code;
      const retryAfterSec =
        providerError?.retryAfterSec !== undefined && providerError.retryAfterSec > 0
          ? providerError.retryAfterSec
          : undefined;
      logger.info({
        route: ROUTE, requestId, userId: claims.userId,
        outcome, code, durationMs: Date.now() - started,
      });
      return respond(
        { ok: false, error: outcome, ...(retryAfterSec !== undefined ? { retryAfterSec } : {}) },
        requestId,
        200,
        retryAfterSec,
      );
    }

    if (!owned) {
      // Same stable outcome as a missing key; the key id is never client input.
      logger.info({
        route: ROUTE, requestId, userId: claims.userId,
        outcome: "no_active_key", durationMs: Date.now() - started,
      });
      return respond({ ok: false, error: "no_active_key" }, requestId);
    }

    logger.info({
      route: ROUTE, requestId, userId: claims.userId,
      outcome: "success", durationMs: Date.now() - started,
    });
    return respond({ ok: true }, requestId);
  } catch {
    logger.error({
      route: ROUTE, requestId, outcome: "internal", durationMs: Date.now() - started,
    });
    return respond({ ok: false, error: "internal" }, requestId);
  }
}
