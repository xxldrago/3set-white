// GET /api/keys/[id]/devices — session-gated, ownership-joined device list
// (CAB-03). The `id` path segment is untrusted (T-02-23): zod-validate it before
// any lookup. `listDevicesByUserId` joins on `(userId, keyId)`, so a non-owned key is
// indistinguishable from a missing one (404, no reason oracle — T-02-21). The
// provider shape for this endpoint is UNKNOWN (02-01 0-key probe): the client
// normalizer is tolerant and only addressable devices are returned.
import { z } from "zod";
import { ArtemidaError } from "../../../../../lib/artemida";
import { listDevicesByUserId } from "../../../../../lib/keys-service";
import { logger } from "../../../../../lib/logger";
import { requireSession, SessionError } from "../../../../../lib/session";

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
  let userId: number;
  try {
    ({ userId } = await requireSession());
  } catch (err) {
    if (err instanceof SessionError) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    logger.error({ route: "keys-devices", outcome: "session_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }

  const { id } = await params;
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  try {
    const devices = await listDevicesByUserId(userId, parsed.data);
    if (devices === null) return Response.json({ error: "not_found" }, { status: 404 });
    return Response.json({ devices });
  } catch (err) {
    if (err instanceof ArtemidaError) {
      logger.warn({ route: "keys-devices", code: err.code, requestId: err.requestId });
      return Response.json({ error: err.code }, { status: mapArtemidaStatus(err.code) });
    }
    logger.error({ route: "keys-devices", outcome: "unexpected_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
