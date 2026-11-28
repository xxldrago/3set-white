// GET /api/mobile/pricing?devices=2 — the mobile storefront's single price
// authority (D-01/D-02/D-03, REQ-SHOP-01/02/05). One batched response quotes
// all five terms through the SAME `resolveTariffQuote` helper the money
// pipeline uses, so a displayed price cannot drift from the charged amount.
// The client sends only a device count: no amount is accepted or returned
// from the client, and ARTEMIDA's key never leaves the server.
//
// Mobile-only bound: devices ∈ [2,10] (D-02). The shared tariff grid keeps
// TARIFF_MAX_DEVICES = 9999 for the web/admin backends. Provider failures map
// to stable 200 {ok:false,error} codes: never a 5xx, never provider text.
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { ArtemidaError } from "@/lib/artemida";
import { logger } from "@/lib/logger";
import { verifyAccessToken } from "@/lib/mobile-auth";
import { resolveTariffQuote } from "@/lib/pricing";
import { TARIFF_CURRENCY, TARIFF_DAYS } from "@/lib/tariff-grid";

export const dynamic = "force-dynamic";

const ROUTE = "/api/mobile/pricing";
const MOBILE_MIN_DEVICES = 2;
const MOBILE_MAX_DEVICES = 10;

/** The only client-controlled input is the device count. */
const querySchema = z.object({
  devices: z.coerce.number().int().min(MOBILE_MIN_DEVICES).max(MOBILE_MAX_DEVICES),
});

interface PricingTerm {
  days: number;
  amount: number;
}

interface PricingBody {
  ok: boolean;
  error?: string;
  currency?: string;
  terms?: PricingTerm[];
  retryAfterSec?: number;
}

function respond(body: PricingBody, requestId: string, status = 200, retryAfterSec?: number) {
  const headers: Record<string, string> = { "x-request-id": requestId };
  if (retryAfterSec !== undefined) headers["Retry-After"] = String(retryAfterSec);
  return NextResponse.json(body, { status, headers });
}

export async function GET(req: Request): Promise<Response> {
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

  const parsed = querySchema.safeParse({
    devices: new URL(req.url).searchParams.get("devices"),
  });
  if (!parsed.success) {
    logger.info({ route: ROUTE, requestId, outcome: "bad_request", durationMs: Date.now() - started });
    return respond({ ok: false, error: "bad_request" }, requestId, 400);
  }

  try {
    // One batched request of five terms (T-21-20). No client amount is ever
    // forwarded: every amount comes from the shared server-side quote.
    const terms: PricingTerm[] = [];
    for (const days of TARIFF_DAYS) {
      const quote = await resolveTariffQuote(days, parsed.data.devices);
      terms.push({ days, amount: quote.amount });
    }

    logger.info({
      route: ROUTE,
      requestId,
      userId,
      outcome: "success",
      durationMs: Date.now() - started,
    });
    return respond({ ok: true, currency: TARIFF_CURRENCY, terms }, requestId);
  } catch (err) {
    if (err instanceof ArtemidaError) {
      // Only typed codes and numeric Retry-After reach logs/bodies; the upstream
      // message, requestId and API key are never echoed (T-21-19).
      const code =
        err.code === "rate_limited"
          ? "rate_limited"
          : err.code === "payment_required"
            ? "payment_required"
            : "provider_error";
      logger.warn({
        route: ROUTE,
        requestId,
        outcome: "provider_error",
        code,
        retryAfterSec: err.retryAfterSec,
        durationMs: Date.now() - started,
      });
      return respond(
        {
          ok: false,
          error: code,
          ...(err.retryAfterSec !== undefined ? { retryAfterSec: err.retryAfterSec } : {}),
        },
        requestId,
        200,
        err.retryAfterSec,
      );
    }
    logger.error({ route: ROUTE, requestId, outcome: "internal", durationMs: Date.now() - started });
    return respond({ ok: false, error: "internal" }, requestId);
  }
}
