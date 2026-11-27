// GET /api/mobile/payments/status/{id} — JWT-gated, ownership-scoped, DB-only
// poll for the in-app WebView flow (D-06, REQ-BE-04). It never calls Platega or
// ARTEMIDA: key issuance is the shared webhook → outbox → worker path alone.
//
// The order id is untrusted; it is zod-validated and resolved through
// `loadOrderForUserId`, so a missing or non-owned order returns the IDENTICAL
// 404 `{ok:false,error:'not_found'}` (no enumeration oracle, T-21-03). Only our
// own mapped fields are serialized — no plategaTxId, paymentUrl, amount,
// discount, token or provider text (T-21-07).
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyAccessToken } from "@/lib/mobile-auth";
import { loadOrderForUserId, type OrderStatus } from "@/lib/orders-service";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const ROUTE = "/api/mobile/payments/status/[id]";
const orderIdSchema = z.string().min(1).max(200);

interface StatusBody {
  ok: boolean;
  error?: string;
  status?: OrderStatus;
  paidAt?: string | null;
  provisionedKeyId?: string | null;
}

function respond(body: StatusBody, requestId: string, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "x-request-id": requestId },
  });
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const started = Date.now();
  const requestId = randomUUID();

  let userId: number;
  try {
    const claims = await verifyAccessToken(_req);
    if (!claims) {
      logger.info({ route: ROUTE, requestId, outcome: "unauthorized", durationMs: Date.now() - started });
      return respond({ ok: false, error: "unauthorized" }, requestId, 401);
    }
    userId = claims.userId;
  } catch {
    logger.error({ route: ROUTE, requestId, outcome: "auth_error", durationMs: Date.now() - started });
    return respond({ ok: false, error: "unauthorized" }, requestId, 401);
  }

  const { id } = await params;
  const parsed = orderIdSchema.safeParse(id);
  if (!parsed.success) {
    logger.info({ route: ROUTE, requestId, outcome: "bad_request", durationMs: Date.now() - started });
    return respond({ ok: false, error: "bad_request" }, requestId, 400);
  }

  try {
    const order = await loadOrderForUserId(userId, parsed.data);
    if (!order) {
      // Missing and non-owned are deliberately byte-identical (T-21-03).
      logger.info({ route: ROUTE, requestId, outcome: "not_found", durationMs: Date.now() - started });
      return respond({ ok: false, error: "not_found" }, requestId, 404);
    }
    // Success is read from OUR DB status written by the webhook; the poll itself
    // has no side effect and never reveals the provider transaction or URL.
    logger.info({ route: ROUTE, requestId, outcome: "success", durationMs: Date.now() - started });
    return respond(
      {
        ok: true,
        status: order.status as OrderStatus,
        paidAt: order.paidAt === null ? null : order.paidAt.toISOString(),
        provisionedKeyId: order.provisionedKeyId ?? null,
      },
      requestId,
    );
  } catch {
    logger.error({ route: ROUTE, requestId, outcome: "internal", durationMs: Date.now() - started });
    return respond({ ok: false, error: "internal" }, requestId);
  }
}
