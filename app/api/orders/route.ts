// POST /api/orders — session-gated create-order BFF (D-33/D-42, PAY-01).
//
// The browser sends only `{kind, days, devices, keyId?}`. The telegram id is
// resolved server-side from the signed httpOnly cookie; the price is ALWAYS the
// ARTEMIDA `GET /pricing` quote, never a client value (T-03-amount). Success
// returns `{ url }` — the UI redirects same-tab to the Platega hosted page.
// Platega/ARTEMIDA provider text is never echoed; only a typed `code`.
import { z } from "zod";
import { ArtemidaError } from "../../../lib/artemida";
import { createOrder } from "../../../lib/orders-service";
import { logger } from "../../../lib/logger";
import { requireSession, SessionError } from "../../../lib/session";

export const dynamic = "force-dynamic";

const ALLOWED_DAYS = [7, 30, 90] as const;

const bodySchema = z.object({
  // Tracer scope: only `new` is wired end-to-end; renew/upgrade land in Wave 3
  // behind the 03-01 create/upgrade contract lock.
  kind: z.literal("new"),
  days: z
    .number()
    .int()
    .refine((v) => (ALLOWED_DAYS as readonly number[]).includes(v)),
  devices: z.number().int().min(2).max(10),
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
    const result = await createOrder({
      telegramId,
      kind: parsed.data.kind,
      days: parsed.data.days,
      devices: parsed.data.devices,
      userName: null,
    });
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
