// POST /api/orders — session-gated create-order BFF (D-33/D-42, PAY-01..03).
//
// The browser sends only `{kind, keyId?, days?, devices?, addDevices?}`. The
// telegram id is resolved server-side from the signed httpOnly cookie; the price
// is ALWAYS the server quote (ARTEMIDA `GET /pricing` for new/renew, the derived
// prorated delta for upgrade), never a client value (T-03-amount/T-03-upgrade-amount).
// Success returns `{ url }` — the UI redirects same-tab to the Platega hosted
// page. Platega/ARTEMIDA provider text is never echoed; only a typed `code`.
//
// Renew/upgrade reuse the identical create path (D-42): before any provider call
// the target key is resolved through the ownership join and rejected cleanly if
// it is not owned (404) or is a trial key (409 `{error:'trial'}`, D-44).
import { z } from "zod";
import { ArtemidaError } from "../../../lib/artemida";
import {
  MAX_DEVICES,
  MIN_DEVICES,
  createOrder,
  keyDeviceLimit,
  precheckOwnedKey,
} from "../../../lib/orders-service";
import { logger } from "../../../lib/logger";
import { requireSession, SessionError } from "../../../lib/session";

export const dynamic = "force-dynamic";

const ALLOWED_DAYS = [7, 30, 90] as const;

const bodySchema = z
  .object({
    kind: z.enum(["new", "renew", "upgrade"]),
    // Renew/upgrade target key (required for both).
    keyId: z.string().min(1).optional(),
    // `new`/`renew` term in days; unused for upgrade.
    days: z
      .number()
      .int()
      .refine((v) => (ALLOWED_DAYS as readonly number[]).includes(v))
      .optional(),
    // `new` device count; ignored for renew/upgrade (server derives it from the key).
    devices: z.number().int().min(MIN_DEVICES).max(MAX_DEVICES).optional(),
    // Upgrade only: devices to add, bounded to the app ceiling.
    addDevices: z.number().int().min(1).max(MAX_DEVICES).optional(),
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

export async function POST(req: Request): Promise<Response> {
  let telegramId: number;
  try {
    telegramId = await requireSession();
  } catch (err) {
    if (err instanceof SessionError) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    logger.error({ route: "orders", outcome: "session_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  try {
    const result =
      parsed.data.kind === "new"
        ? await createOrder({
            telegramId,
            kind: "new",
            days: parsed.data.days ?? null,
            devices: parsed.data.devices ?? MIN_DEVICES,
            userName: null,
          })
        : await createMutationOrder(telegramId, parsed.data);

    if (result.kind === "provider_error") {
      const status =
        result.code === "unauthorized"
          ? 502
          : result.code === "bad_request"
            ? 400
            : 502;
      return Response.json({ error: result.code }, { status });
    }
    return Response.json({ url: result.url });
  } catch (err) {
    if (err instanceof OrderRequestError) {
      return Response.json({ error: err.code }, { status: err.status });
    }
    if (err instanceof ArtemidaError) {
      logger.warn({ route: "orders", code: err.code, requestId: err.requestId });
      const status =
        err.code === "rate_limited"
          ? 429
          : err.code === "payment_required"
            ? 402
            : err.code === "bad_gateway" || err.code === "unavailable"
              ? 502
              : 500;
      return Response.json({ error: err.code, retryAfter: err.retryAfterSec }, { status });
    }
    logger.error({ route: "orders", outcome: "unexpected_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }
}

type MutationBody = z.infer<typeof bodySchema>;

/**
 * Renew/upgrade branch of the shared pipeline. Ownership and trial are enforced
 * server-side before any provider call:
 * - non-owned/missing key → 404 (no oracle, T-03-idor);
 * - trial key → 409 `{error:'trial'}` (never a raw provider 409, D-44);
 * - upgrade past the device ceiling → 400 (T-03-device-ceiling).
 * The current device limit is taken from the joined key row, never the body.
 */
async function createMutationOrder(
  telegramId: number,
  body: MutationBody,
): Promise<Awaited<ReturnType<typeof createOrder>>> {
  const precheck = await precheckOwnedKey(telegramId, body.keyId ?? "");
  if (!precheck.ok) {
    // A discriminated failure is returned as-is; the caller maps it to HTTP.
    throw new OrderRequestError(precheck.reason === "trial" ? 409 : 404, precheck.reason);
  }

  const currentLimit = keyDeviceLimit(precheck.key);

  if (body.kind === "upgrade") {
    const addDevices = body.addDevices ?? 1;
    if (currentLimit + addDevices > MAX_DEVICES) {
      throw new OrderRequestError(400, "bad_request");
    }
    return createOrder({
      telegramId,
      kind: "upgrade",
      days: null,
      devices: currentLimit,
      addDevices,
      keyId: precheck.key.id,
      userName: null,
    });
  }

  return createOrder({
    telegramId,
    kind: "renew",
    days: body.days ?? 30,
    devices: currentLimit,
    keyId: precheck.key.id,
    userName: null,
  });
}

/** Clean, typed request rejection mapped to an HTTP status at the route edge. */
class OrderRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(`orders:${code}`);
    this.name = "OrderRequestError";
  }
}
