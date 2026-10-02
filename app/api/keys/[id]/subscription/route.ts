// GET /api/keys/[id]/subscription — session-gated subscription link + traffic.
//
// The subscription URL is credential-bearing and is rendered to the owning user
// only (T-02-18): it is never logged. Ownership is joined before any provider
// call, so a non-owned key yields the same 404 as a missing one (T-02-17). The
// `id` path segment is zod-validated before any lookup (T-02-20).
import { z } from "zod";
import { ArtemidaError } from "@/lib/artemida";
import { getSubscriptionForUser } from "@/lib/keys-service";
import { logger } from "@/lib/logger";
import { requireSession, SessionError } from "@/lib/session";

export const dynamic = "force-dynamic";

const idSchema = z.string().min(1).max(200);

function mapArtemidaStatus(code: ArtemidaError["code"]): number {
  switch (code) {
    case "unauthorized":
      return 401;
    case "payment_required":
      return 402;
    case "not_found":
      return 404;
    case "conflict":
      return 409;
    case "rate_limited":
      return 429;
    case "bad_gateway":
    case "unavailable":
      return 502;
    default:
      return 500;
  }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  let telegramId: number;
  try {
    telegramId = await requireSession();
  } catch (err) {
    if (err instanceof SessionError) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    logger.error({ route: "keys-subscription", outcome: "session_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }

  const { id } = await params;
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  try {
    const subscription = await getSubscriptionForUser(BigInt(telegramId), parsed.data);
    if (!subscription) return Response.json({ error: "not_found" }, { status: 404 });
    return Response.json(subscription);
  } catch (err) {
    if (err instanceof ArtemidaError) {
      // Code + requestId only — the subscription URL never reaches the log.
      logger.warn({
        route: "keys-subscription",
        code: err.code,
        requestId: err.requestId,
      });
      return Response.json({ error: err.code }, { status: mapArtemidaStatus(err.code) });
    }
    logger.error({ route: "keys-subscription", outcome: "unexpected_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
