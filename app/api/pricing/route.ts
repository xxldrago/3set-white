// GET /api/pricing — session-gated BFF proxy for the ARTEMIDA live price
// (D-26/D-28). The browser calls only this route; ARTEMIDA_API_KEY never
// leaves the server (T-02-04).
//
// Query input is validated (days ∈ {7,30,90}, devices ∈ 2..10 — provider
// minDevices=2, contract lock 02-01). Provider failures map to their status;
// the provider message is never returned, only `code`.
import { z } from "zod";
import { ArtemidaError, artemida } from "../../../lib/artemida";
import { logger } from "../../../lib/logger";
import { requireSession, SessionError } from "../../../lib/session";

export const dynamic = "force-dynamic";

const ALLOWED_DAYS = [7, 30, 90] as const;

const pricingQuery = z.object({
  days: z.coerce
    .number()
    .int()
    .refine((v) => (ALLOWED_DAYS as readonly number[]).includes(v)),
  devices: z.coerce.number().int().min(2).max(10),
});

const unauthorized = () => Response.json({ error: "unauthorized" }, { status: 401 });

export async function GET(req: Request): Promise<Response> {
  try {
    await requireSession();
  } catch (err) {
    if (err instanceof SessionError) return unauthorized();
    logger.error({ route: "pricing", outcome: "session_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }

  const url = new URL(req.url);
  const parsed = pricingQuery.safeParse({
    days: url.searchParams.get("days"),
    devices: url.searchParams.get("devices"),
  });
  if (!parsed.success) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  try {
    const pricing = await artemida.getPricing(parsed.data);
    // D-28: return the exact provider amount, never a locally computed value.
    return Response.json({ price: pricing.price });
  } catch (err) {
    if (err instanceof ArtemidaError) {
      logger.warn({ route: "pricing", code: err.code, requestId: err.requestId });
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
    logger.error({ route: "pricing", outcome: "unexpected_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
