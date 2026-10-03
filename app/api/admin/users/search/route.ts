// GET /api/admin/users/search — ADM-02 admin user search (BFF).
//
// Role-gated for the `users` section (all three staff roles hold it, UI-SPEC §1).
// Mirrors the canonical admin route: requireRole → zod → service, with
// SessionError→401 and AdminError→404 (never 403 — no route/role enumeration,
// D-51/T-05-06). Returns ONLY `{ rows, count, truncated }`; the service already
// strips every PII/provider field (T-05-05).
import { z } from "zod";
import { requireRole } from "../../../../../lib/admin-auth";
import { adminSearchUsers } from "../../../../../lib/admin-service";
import { logger } from "../../../../../lib/logger";
import { AdminError, SessionError } from "../../../../../lib/session";

export const dynamic = "force-dynamic";

const querySchema = z.string().trim().min(1).max(200);

export async function GET(req: Request): Promise<Response> {
  try {
    await requireRole("administrator", "support", "manager");
  } catch (err) {
    if (err instanceof SessionError) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    if (err instanceof AdminError) {
      return Response.json({ error: "not_found" }, { status: 404 });
    }
    logger.error({ route: "admin-users-search", outcome: "session_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }

  const raw = new URL(req.url).searchParams.get("q") ?? "";
  const parsed = querySchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  try {
    const { rows, count, truncated } = await adminSearchUsers(parsed.data);
    return Response.json({ rows, count, truncated });
  } catch {
    logger.error({ route: "admin-users-search", outcome: "unexpected_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
