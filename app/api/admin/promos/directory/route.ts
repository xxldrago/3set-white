// GET /api/admin/promos/directory — promo registry read model (BFF).
//
// Serves the client island on /admin/promos: search, derived-status filter,
// sort and pagination in one round-trip, plus the KPI/chart aggregates. The
// status is DERIVED from usedCount/maxUses/expiresAt (there is no `active`
// column), so filtering happens in the read model rather than SQL.
//
// requireRole → 401/404 (never 403 — no role oracle, D-51); a malformed query
// → 400. Every field comes from `promo_codes` + `orders` + `users`.
import { z } from "zod";
import { requireRole } from "../../../../../lib/admin-auth";
import {
  PROMO_DEFAULT_PAGE_SIZE,
  PROMO_MAX_PAGE_SIZE,
  adminPromosDirectory,
} from "../../../../../lib/admin-promos-directory";
import { logger } from "../../../../../lib/logger";
import { AdminError, SessionError } from "../../../../../lib/session";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  q: z.string().trim().max(200).optional(),
  filter: z.enum(["all", "active", "soon", "expired", "exhausted", "personal"]).optional(),
  sort: z.enum(["created", "code", "used", "expires", "revenue", "clicks"]).optional(),
  page: z.coerce.number().int().min(1).max(10_000).optional(),
  pageSize: z.coerce.number().int().min(1).max(PROMO_MAX_PAGE_SIZE).optional(),
});

export async function GET(req: Request): Promise<Response> {
  try {
    await requireRole("administrator");
  } catch (err) {
    if (err instanceof SessionError) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    if (err instanceof AdminError) {
      return Response.json({ error: "not_found" }, { status: 404 });
    }
    logger.error({ route: "admin-promos-directory", outcome: "session_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }

  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    q: url.searchParams.get("q") ?? undefined,
    filter: url.searchParams.get("filter") ?? undefined,
    sort: url.searchParams.get("sort") ?? undefined,
    page: url.searchParams.get("page") ?? undefined,
    pageSize: url.searchParams.get("pageSize") ?? undefined,
  });
  if (!parsed.success) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  try {
    const directory = await adminPromosDirectory({
      q: parsed.data.q,
      filter: parsed.data.filter,
      sort: parsed.data.sort,
      page: parsed.data.page,
      pageSize: parsed.data.pageSize ?? PROMO_DEFAULT_PAGE_SIZE,
    });
    return Response.json(directory);
  } catch {
    logger.error({ route: "admin-promos-directory", outcome: "load_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
