// GET /api/pricing — session-gated BFF proxy for the ARTEMIDA live price
// (D-26/D-28). The browser calls only this route; ARTEMIDA_API_KEY never
// leaves the server (T-02-04).
//
// Query input is validated (days ∈ {7,30,90}, devices ∈ 2..10 — provider
// minDevices=2, contract lock 02-01). `kind:'upgrade'` returns the locally
// derived prorated device delta (D-43; observed 2026-10-03, no provider quote
// endpoint). Provider failures map to their status; the provider message is
// never returned, only `code`.
import { z } from "zod";
import { ArtemidaError } from "../../../lib/artemida";
import { logger } from "../../../lib/logger";
import { resolveTariffQuote, resolveUpgradeQuote } from "../../../lib/pricing";
import { requireSession, SessionError } from "../../../lib/session";

export const dynamic = "force-dynamic";

const ALLOWED_DAYS = [7, 30, 90] as const;
const MAX_DEVICES = 10;

const pricingQuery = z
  .object({
    days: z.coerce
      .number()
      .int()
      .refine((v) => (ALLOWED_DAYS as readonly number[]).includes(v)),
    devices: z.coerce.number().int().min(2).max(MAX_DEVICES),
    kind: z.enum(["new", "renew", "upgrade"]).default("new"),
    addDevices: z.coerce.number().int().min(1).max(MAX_DEVICES - 2).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.kind !== "upgrade") return;
    if (value.addDevices === undefined) {
      ctx.addIssue({ code: "custom", message: "addDevices is required for kind=upgrade" });
      return;
    }
    if (value.devices + value.addDevices > MAX_DEVICES) {
      ctx.addIssue({
        code: "custom",
        message: `devices + addDevices must be <= ${MAX_DEVICES}`,
      });
    }
  });

const unauthorized = () => Response.json({ error: "unauthorized" }, { status: 401 });

export async function GET(req: Request): Promise<Response> {
  try {
    // Any authenticated session may read a price quote (email-only accounts
    // included — pricing carries no user-scoped data). Purchasing still
    // requires a linked Telegram (see /api/orders).
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
    kind: url.searchParams.get("kind") ?? undefined,
    addDevices: url.searchParams.get("addDevices") ?? undefined,
  });
  if (!parsed.success) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  try {
    if (parsed.data.kind === "upgrade" && parsed.data.addDevices !== undefined) {
      // D-43/D-28: the provider exposes no upgrade-quote endpoint; the delta
      // derives from the retail tariff grid (or the observed provider tier
      // method as fallback), never a fabricated number.
      const quote = await resolveUpgradeQuote({
        days: parsed.data.days,
        devices: parsed.data.devices,
        addDevices: parsed.data.addDevices,
      });
      return Response.json({ price: quote.amount });
    }
    // Displayed price: manual tariff row wins, otherwise the live provider
    // amount. The money pipeline resolves through the same helper.
    const pricing = await resolveTariffQuote(parsed.data.days, parsed.data.devices);
    return Response.json({ price: pricing.amount });
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
