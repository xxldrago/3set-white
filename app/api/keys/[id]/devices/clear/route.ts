// POST /api/keys/[id]/devices/clear — session-gated reset of ALL devices.
//
// The `id` path segment is zod-validated before any provider call (T-02-23).
// `clearDevices` joins ownership first; a non-owned key returns false and the
// route answers 404 exactly as for a missing key (T-02-21). The UI requires an
// explicit second confirmation before calling this (D-32).
import { z } from "zod";
import { ArtemidaError } from "../../../../../../lib/artemida";
import { clearDevices } from "../../../../../../lib/keys-service";
import { logger } from "../../../../../../lib/logger";
import { requireTelegramSession, SessionError } from "../../../../../../lib/session";

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

export async function POST(
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
    logger.error({ route: "keys-devices-clear", outcome: "session_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }

  const { id } = await params;
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  try {
    const owned = await clearDevices(BigInt(telegramId), parsed.data);
    if (!owned) return Response.json({ error: "not_found" }, { status: 404 });
    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof ArtemidaError) {
      logger.warn({ route: "keys-devices-clear", code: err.code, requestId: err.requestId });
      return Response.json({ error: err.code }, { status: mapArtemidaStatus(err.code) });
    }
    logger.error({ route: "keys-devices-clear", outcome: "unexpected_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
