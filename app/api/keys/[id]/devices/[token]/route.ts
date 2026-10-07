// DELETE /api/keys/[id]/devices/[token] — session-gated removal of ONE device.
//
// Both path segments are untrusted (T-02-23) and zod-validated before any
// provider call. `removeDevice` joins ownership first; a non-owned key returns
// false and the route answers 404 exactly as for a missing key, so a device can
// never be removed across users (T-02-21). The mutation reaches ARTEMIDA only
// after the UI's explicit second confirmation (D-32); this route performs it.
import { z } from "zod";
import { ArtemidaError } from "../../../../../../lib/artemida";
import { removeDeviceByUserId } from "../../../../../../lib/keys-service";
import { logger } from "../../../../../../lib/logger";
import { requireSession, SessionError } from "../../../../../../lib/session";

export const dynamic = "force-dynamic";

const idSchema = z.string().min(1).max(200);
const tokenSchema = z.string().min(1).max(300);

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

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; token: string }> },
): Promise<Response> {
  let userId: number;
  try {
    ({ userId } = await requireSession());
  } catch (err) {
    if (err instanceof SessionError) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    logger.error({ route: "keys-device-delete", outcome: "session_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }

  const { id, token } = await params;
  const parsedId = idSchema.safeParse(id);
  const parsedToken = tokenSchema.safeParse(token);
  if (!parsedId.success || !parsedToken.success) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  try {
    const owned = await removeDeviceByUserId(userId, parsedId.data, parsedToken.data);
    if (!owned) return Response.json({ error: "not_found" }, { status: 404 });
    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof ArtemidaError) {
      logger.warn({ route: "keys-device-delete", code: err.code, requestId: err.requestId });
      return Response.json({ error: err.code }, { status: mapArtemidaStatus(err.code) });
    }
    logger.error({ route: "keys-device-delete", outcome: "unexpected_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
