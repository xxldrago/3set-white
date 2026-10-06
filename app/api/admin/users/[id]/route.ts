// GET /api/admin/users/[id] — ADM-02 admin user profile (BFF).
//
// `id` is our internal `User.id` (A4), not a telegram id. Role-gated for the
// `users` section; an unknown id is a plain 404. The three sub-sections are read
// independently by the service, so one failing read (e.g. keys) does not blank
// the others. SessionError→401, AdminError→404, else 500 (D-51/T-05-06).
import { z } from "zod";
import { requireRole } from "../../../../../lib/admin-auth";
import { loadAdminProfile } from "../../../../../lib/admin-service";
import { logger } from "../../../../../lib/logger";
import { AdminError, SessionError } from "../../../../../lib/session";

export const dynamic = "force-dynamic";

const idSchema = z.coerce.number().int().positive();

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    await requireRole("administrator", "support", "manager");
  } catch (err) {
    if (err instanceof SessionError) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    if (err instanceof AdminError) {
      return Response.json({ error: "not_found" }, { status: 404 });
    }
    logger.error({ route: "admin-user-profile", outcome: "session_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }

  const { id } = await params;
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  try {
    const profile = await loadAdminProfile(parsedId.data);
    if (!profile) return Response.json({ error: "not_found" }, { status: 404 });
    return Response.json({ profile });
  } catch {
    logger.error({ route: "admin-user-profile", outcome: "unexpected_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
