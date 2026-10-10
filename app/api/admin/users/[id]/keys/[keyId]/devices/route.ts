// GET /api/admin/users/[id]/keys/[keyId]/devices — bound-device list for
// one cached key (administrator + support, mirroring the profileKeys matrix
// section). Ownership resolves through the (userId, keyId) join — a key the
// user does not own is indistinguishable from a missing one (404, no
// oracle). Provider failures map to their status (never raw text); only
// addressable devices are returned.
import { z } from "zod";
import { listDevicesByUserId } from "../../../../../../../../lib/keys-service";
import { logger } from "../../../../../../../../lib/logger";
import { requireRole } from "../../../../../../../../lib/admin-auth";
import { AdminError, SessionError } from "../../../../../../../../lib/session";
import { ArtemidaError } from "../../../../../../../../lib/artemida";

export const dynamic = "force-dynamic";

const idSchema = z.string().min(1).max(200);

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; keyId: string }> },
): Promise<Response> {
  try {
    await requireRole("administrator", "support");
  } catch (err) {
    if (err instanceof SessionError) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    if (err instanceof AdminError) {
      return Response.json({ error: "not_found" }, { status: 404 });
    }
    logger.error({ route: "admin-key-devices", outcome: "session_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }
  const { id, keyId } = await params;
  const userId = Number(id);
  if (!Number.isSafeInteger(userId)) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const parsedKey = idSchema.safeParse(keyId);
  if (!parsedKey.success) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  try {
    const devices = await listDevicesByUserId(userId, parsedKey.data);
    if (devices === null) return Response.json({ error: "not_found" }, { status: 404 });
    return Response.json({
      devices: devices.map((device) => ({
        token: device.token,
        name: device.name ?? null,
      })),
    });
  } catch (err) {
    if (err instanceof ArtemidaError) {
      logger.warn({ route: "admin-key-devices", code: err.code });
      const status =
        err.code === "rate_limited"
          ? 429
          : err.code === "bad_gateway" || err.code === "unavailable"
            ? 502
            : 500;
      return Response.json({ error: err.code }, { status });
    }
    logger.error({ route: "admin-key-devices", outcome: "unexpected_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
