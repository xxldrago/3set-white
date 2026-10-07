// GET /api/orders/[orderId] — session-gated, ownership-joined order status.
//
// This is the endpoint the `/payments/[orderId]` client poller hits every 3 s
// while the order is non-terminal (UI-SPEC §2). It is deliberately DB-only and
// side-effect-free: the `orderId` path segment is untrusted, so it is validated
// with zod, resolved server-side from the signed session cookie, and read
// through the ownership-joined `loadOrderForUser` — a non-owned order is
// indistinguishable from a missing one (404, no oracle — T-03-hist-idor /
// T-03-enumeration).
//
// The response emits ONLY our mapped fields; the Platega transaction id and any
// other provider field are never serialized (T-03-provider-leak, D-19/D-24).
import { z } from "zod";
import { loadOrderForUserId, toHistoryRow } from "../../../../lib/orders-service";
import { logger } from "../../../../lib/logger";
import { requireSession, SessionError } from "../../../../lib/session";

export const dynamic = "force-dynamic";

const orderIdSchema = z.string().min(1).max(200);

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ orderId: string }> },
): Promise<Response> {
  let userId: number;
  try {
    ({ userId } = await requireSession());
  } catch (err) {
    if (err instanceof SessionError) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    logger.error({ route: "order-status", outcome: "session_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }

  const { orderId } = await params;
  const parsed = orderIdSchema.safeParse(orderId);
  if (!parsed.success) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  try {
    const order = await loadOrderForUserId(userId, parsed.data);
    if (!order) {
      // Missing and non-owned are deliberately identical (no enumeration oracle).
      return Response.json({ error: "not_found" }, { status: 404 });
    }
    // `toHistoryRow` narrows to our own fields, dropping the provider
    // transaction id / payment URL; the poller only ever sees a terminal-safe
    // mapped shape.
    return Response.json({ order: toHistoryRow(order) });
  } catch {
    logger.error({ route: "order-status", outcome: "unexpected_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
