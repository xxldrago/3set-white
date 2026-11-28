// POST /api/mobile/promo/apply — read-only server-side promo preview (D-08,
// REQ-SHOP-03/05). The client sends only a code and receives ONLY a percentage;
// it never receives an authoritative amount and never holds a code as the
// source of truth. `consumePromo` is deliberately absent: the real code
// re-validation and atomic consumption stay inside `createOrder` at checkout.
// Invalid/malformed/unusable codes all collapse to one `promo_invalid` code so
// the route gives no oracle about which codes exist. Never a 5xx or raw text.
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { verifyAccessToken } from "@/lib/mobile-auth";
import { validatePromo } from "@/lib/promo";

export const dynamic = "force-dynamic";

const ROUTE = "/api/mobile/promo/apply";
/** Mirrors lib/promo's PROMO_CODE_RE — the boundary rejects malformed input early. */
const PROMO_CODE_FORMAT = /^[A-Z0-9-]{3,32}$/;

/** Strict body: a client `amount`/`discount` fails closed instead of being forwarded. */
const bodySchema = z.strictObject({
  code: z.string().trim().toUpperCase().min(1).max(32).regex(PROMO_CODE_FORMAT),
});

/**
 * Neutral probe amount for the read-only validator. Its `finalAmount` result is
 * deliberately discarded — checkout recomputes against the real order amount.
 */
const PREVIEW_PROBE_AMOUNT = 100;

interface PromoBody {
  ok: boolean;
  error?: string;
  code?: string;
  discountPercent?: number;
}

function respond(body: PromoBody, requestId: string, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "x-request-id": requestId },
  });
}

export async function POST(req: Request): Promise<Response> {
  const started = Date.now();
  const requestId = randomUUID();

  try {
    const claims = await verifyAccessToken(req);
    if (!claims) {
      logger.info({ route: ROUTE, requestId, outcome: "unauthorized", durationMs: Date.now() - started });
      return respond({ ok: false, error: "unauthorized" }, requestId, 401);
    }
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
    // Same code as an unknown or unusable code: no distinguishing oracle.
    logger.info({ route: ROUTE, requestId, outcome: "promo_invalid", durationMs: Date.now() - started });
    return respond({ ok: false, error: "promo_invalid" }, requestId);
  }

  try {
    // Preview ONLY. consumePromo is never imported or called here; the atomic
    // claim remains in createOrder, so this result cannot authorize a discount.
    const preview = await validatePromo(parsed.data.code, PREVIEW_PROBE_AMOUNT);
    // A fixed-RUB code cannot be expressed as a percentage for this client.
    if (!preview.ok || preview.row.type !== "percentage") {
      logger.info({ route: ROUTE, requestId, outcome: "promo_invalid", durationMs: Date.now() - started });
      return respond({ ok: false, error: "promo_invalid" }, requestId);
    }

    logger.info({ route: ROUTE, requestId, outcome: "preview", durationMs: Date.now() - started });
    return respond(
      { ok: true, code: preview.row.code, discountPercent: preview.row.discount },
      requestId,
    );
  } catch {
    // No 5xx and no raw validator/promo text in the body or logs.
    logger.error({ route: ROUTE, requestId, outcome: "internal", durationMs: Date.now() - started });
    return respond({ ok: false, error: "internal" }, requestId);
  }
}
