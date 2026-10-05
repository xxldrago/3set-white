// GET /api/keys/[id] — session-gated ownership-joined key detail (CAB-04).
//
// The `id` path segment is untrusted (T-02-20): validate it with zod before any
// lookup, resolve the telegram id server-side (T-02-12), and read through
// `getKeyForUser`, which joins on `(userId, keyId)` so a non-owned key is
// indistinguishable from a missing one (404, no reason oracle — T-02-17).
import { z } from "zod";
import { ArtemidaError } from "@/lib/artemida";
import { getKeyForUser } from "@/lib/keys-service";
import { logger } from "@/lib/logger";
import { requireTelegramSession, SessionError } from "@/lib/session";

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
    telegramId = await requireTelegramSession();
  } catch (err) {
    if (err instanceof SessionError) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    logger.error({ route: "keys-detail", outcome: "session_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }

  const { id } = await params;
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  try {
    const key = await getKeyForUser(BigInt(telegramId), parsed.data);
    if (!key) return Response.json({ error: "not_found" }, { status: 404 });
    return Response.json({ key });
  } catch (err) {
    if (err instanceof ArtemidaError) {
      logger.warn({
        route: "keys-detail",
        code: err.code,
        requestId: err.requestId,
      });
      return Response.json({ error: err.code }, { status: mapArtemidaStatus(err.code) });
    }
    logger.error({ route: "keys-detail", outcome: "unexpected_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
