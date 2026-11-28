// GET /api/mobile/devices — JWT-gated, ownership-joined device list (REQ-DEV-01,
// REQ-BE-06, T-22-01/02/07). One active key is derived from claims.userId with
// the SAME connectable predicate /subscription, /servers and /config use; the
// client never supplies a keyId. A missing/non-owned key and a null ownership
// join collapse to the same HTTP 200 {ok:false,error:no_active_key} so device
// ownership is never enumerable.
//
// Provider failures degrade to a stable HTTP 200 code with Retry-After on rate
// limits — never a 5xx and never provider text. Logs carry only
// route/requestId/userId/outcome/code/durationMs: no token, name, link or secret.
import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { ArtemidaError } from "@/lib/artemida";
import { listDevicesWithLabels, listKeysByUserId } from "@/lib/keys-service";
import { logger } from "@/lib/logger";
import { verifyAccessToken } from "@/lib/mobile-auth";
import { isKeyConnectable } from "@/lib/subscription-view";

export const dynamic = "force-dynamic";

const ROUTE = "/api/mobile/devices";

interface DeviceRow {
  token: string;
  label: string | null;
  name: string | null;
}

interface DevicesBody {
  ok: boolean;
  error?: string;
  devices?: DeviceRow[];
  deviceLimit?: number | null;
  retryAfterSec?: number;
}

function respond(
  body: DevicesBody,
  requestId: string,
  status = 200,
  retryAfterSec?: number,
) {
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
      // No JWT: no DB read and no provider call at all.
      logger.info({
        route: ROUTE, requestId, outcome: "unauthorized", durationMs: Date.now() - started,
      });
      return respond({ ok: false, error: "unauthorized" }, requestId, 401);
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

    let devices: Awaited<ReturnType<typeof listDevicesWithLabels>>;
    try {
      // Exactly one ownership-joined call, keyed by (userId, active.id).
      devices = await listDevicesWithLabels(claims.userId, active.id);
    } catch (err) {
      const providerError = err instanceof ArtemidaError ? err : null;
      const code = providerError?.code ?? "internal";
      // Provider unauthorized is no_active_key-safe: do not disclose that the
      // key exists at the provider. Only the stable code is ever logged.
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

    // null means "not owned" — indistinguishable from no active key.
    if (devices === null) {
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
    return respond(
      {
        ok: true,
        // Provider order is preserved verbatim; no client-side ranking and no
        // fabricated best device. label ?? name ?? 'Устройство' is client copy.
        devices: devices.map((device) => ({
          token: device.token,
          label: device.label,
          name: device.name,
        })),
        deviceLimit: active.deviceLimit,
      },
      requestId,
    );
  } catch {
    logger.error({
      route: ROUTE, requestId, outcome: "internal", durationMs: Date.now() - started,
    });
    return respond({ ok: false, error: "internal" }, requestId);
  }
}
