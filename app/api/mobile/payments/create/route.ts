// POST /api/mobile/payments/create — JWT-gated, thin wrapper over the ONE
// money pipeline (D-04, REQ-BE-04). The client sends only its intent:
// `{kind, days?, devices?, keyId?, addDevices?}`. The amount is ALWAYS quoted
// server-side by `createOrder`; there is no `amount`, discount, payload marker
// or provider binding on this boundary (T-21-02). The order is persisted with
// `payload = order.id` by the shared service, and the shared Platega callback →
// outbox → worker remains the sole key issuer (REQ-BE-05 superseded).
//
// Mobile envelope is `{ok, error?}`; provider failures degrade to a stable code
// (never a 5xx, never provider text). Logs carry route/outcome/code/requestId/
// durationMs only — never the payment URL, token, amount or header values.
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyAccessToken } from "@/lib/mobile-auth";
import {
  createOrder,
  keyDeviceLimit,
  precheckOwnedKeyByUserId,
  TRIAL_ERROR_CODE,
  type CreateOrderInput,
} from "@/lib/orders-service";
import { TARIFF_DAYS } from "@/lib/tariff-grid";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const ROUTE = "/api/mobile/payments/create";
/** Mobile storefront sells 2..10 devices (D-02); the backend grid allows more. */
const MOBILE_MIN_DEVICES = 2;
const MOBILE_MAX_DEVICES = 10;

/**
 * Strict schema: an unknown field (notably a client `amount` or `discount`)
 * fails closed with 400 instead of being silently forwarded to createOrder.
 */
const bodySchema = z
  .strictObject({
    kind: z.enum(["new", "renew", "upgrade"]),
    keyId: z.string().min(1).max(200).optional(),
    days: z
      .number()
      .int()
      .refine((v) => (TARIFF_DAYS as readonly number[]).includes(v))
      .optional(),
    devices: z.number().int().min(MOBILE_MIN_DEVICES).max(MOBILE_MAX_DEVICES).optional(),
    addDevices: z.number().int().min(1).max(MOBILE_MAX_DEVICES).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.kind === "new") {
      if (value.days === undefined) {
        ctx.addIssue({ code: "custom", message: "days is required for kind=new" });
      }
      if (value.devices === undefined) {
        ctx.addIssue({ code: "custom", message: "devices is required for kind=new" });
      }
      return;
    }
    if (value.keyId === undefined) {
      ctx.addIssue({ code: "custom", message: "keyId is required for renew/upgrade" });
    }
    if (value.kind === "renew" && value.days === undefined) {
      ctx.addIssue({ code: "custom", message: "days is required for kind=renew" });
    }
    if (value.kind === "upgrade" && value.addDevices === undefined) {
      ctx.addIssue({ code: "custom", message: "addDevices is required for kind=upgrade" });
    }
  });

interface CreateBody {
  ok: boolean;
  error?: string;
  orderId?: string;
  paymentUrl?: string;
  retryAfterSec?: number;
}

function respond(body: CreateBody, requestId: string, status = 200, retryAfterSec?: number) {
  const headers: Record<string, string> = { "x-request-id": requestId };
  if (retryAfterSec !== undefined) headers["Retry-After"] = String(retryAfterSec);
  return NextResponse.json(body, { status, headers });
}

export async function POST(req: Request): Promise<Response> {
  const started = Date.now();
  const requestId = randomUUID();

  let userId: number;
  try {
    const claims = await verifyAccessToken(req);
    if (!claims) {
      logger.info({ route: ROUTE, requestId, outcome: "unauthorized", durationMs: Date.now() - started });
      return respond({ ok: false, error: "unauthorized" }, requestId, 401);
    }
    userId = claims.userId;
  } catch {
    logger.error({ route: ROUTE, requestId, outcome: "auth_error", durationMs: Date.now() - started });
    return respond({ ok: false, error: "unauthorized" }, requestId, 401);
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    logger.info({ route: ROUTE, requestId, outcome: "bad_request", durationMs: Date.now() - started });
    return respond({ ok: false, error: "bad_request" }, requestId, 400);
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    logger.info({ route: ROUTE, requestId, outcome: "bad_request", durationMs: Date.now() - started });
    return respond({ ok: false, error: "bad_request" }, requestId, 400);
  }

  try {
    // Renew/upgrade resolve the target key through the ownership join BEFORE
    // any provider call: a trial key is a clean 409, a missing/non-owned key is
    // a 404 indistinguishable from "does not exist" (no enumeration oracle).
    let input: CreateOrderInput;
    if (parsed.data.kind === "new") {
      input = {
        userId,
        kind: "new",
        days: parsed.data.days ?? null,
        devices: parsed.data.devices ?? MOBILE_MIN_DEVICES,
        userName: null,
        channel: "web",
      };
    } else {
      const precheck = await precheckOwnedKeyByUserId(userId, parsed.data.keyId ?? "");
      if (!precheck.ok) {
        const code = precheck.reason === "trial" ? TRIAL_ERROR_CODE : "not_found";
        const status = precheck.reason === "trial" ? 409 : 404;
        logger.info({ route: ROUTE, requestId, outcome: code, durationMs: Date.now() - started });
        return respond({ ok: false, error: code }, requestId, status);
      }
      // Device counts for a mutation come from the OWNED key row, never the
      // client, and stay inside the mobile 2..10 contract (D-02).
      const currentLimit = keyDeviceLimit(precheck.key);
      if (currentLimit < MOBILE_MIN_DEVICES || currentLimit > MOBILE_MAX_DEVICES) {
        logger.info({ route: ROUTE, requestId, outcome: "bad_request", durationMs: Date.now() - started });
        return respond({ ok: false, error: "bad_request" }, requestId, 400);
      }
      if (parsed.data.kind === "upgrade") {
        const addDevices = parsed.data.addDevices ?? 1;
        if (currentLimit + addDevices > MOBILE_MAX_DEVICES) {
          logger.info({ route: ROUTE, requestId, outcome: "bad_request", durationMs: Date.now() - started });
          return respond({ ok: false, error: "bad_request" }, requestId, 400);
        }
        input = {
          userId,
          kind: "upgrade",
          days: null,
          devices: currentLimit,
          addDevices,
          keyId: precheck.key.id,
          userName: null,
          channel: "web",
        };
      } else {
        input = {
          userId,
          kind: "renew",
          days: parsed.data.days ?? null,
          devices: currentLimit,
          keyId: precheck.key.id,
          userName: null,
          channel: "web",
        };
      }
    }

    const result = await createOrder(input);
    if (result.kind === "provider_error") {
      logger.info({ route: ROUTE, requestId, outcome: "provider_error", code: result.code, durationMs: Date.now() - started });
      // Stable typed code, never provider text; never a 5xx (mobile contract).
      return respond({ ok: false, error: result.code }, requestId);
    }

    logger.info({ route: ROUTE, requestId, outcome: "success", durationMs: Date.now() - started });
    return respond(
      { ok: true, orderId: result.order.id, paymentUrl: result.url },
      requestId,
    );
  } catch {
    logger.error({ route: ROUTE, requestId, outcome: "internal", durationMs: Date.now() - started });
    return respond({ ok: false, error: "internal" }, requestId);
  }
}
