// GET /api/admin/overview — aggregated dashboard snapshot (administrator + manager).
//
// Mirrors the canonical admin BFF: requireRole → parse → service, with
// SessionError→401 and AdminError→404 (never 403 — no route/role enumeration).
// `?period=7|30|90` selects the revenue/funnel window; anything else falls back
// to 30 days. Every value comes from `loadAdminOverview` — no fixtures.
import { z } from "zod";
import { requireRole } from "@/lib/admin-auth";
import { loadAdminOverview } from "@/lib/admin-overview";
import { logger } from "@/lib/logger";
import { AdminError, SessionError } from "@/lib/session";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  period: z.coerce.number().int().optional(),
});

export async function GET(req: Request): Promise<Response> {
  try {
    await requireRole("administrator", "manager");
  } catch (err) {
    if (err instanceof SessionError) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    if (err instanceof AdminError) {
      return Response.json({ error: "not_found" }, { status: 404 });
    }
    logger.error({ route: "admin-overview", outcome: "session_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }

  const url = new URL(req.url);
  const parsed = querySchema.safeParse({ period: url.searchParams.get("period") ?? undefined });
  if (!parsed.success) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  try {
    const overview = await loadAdminOverview(parsed.data.period ?? 30);
    return Response.json(overview, { headers: { "Cache-Control": "no-store" } });
  } catch {
    logger.error({ route: "admin-overview", outcome: "load_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
