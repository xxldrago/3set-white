// GET /api/admin/broadcast/directory — campaign history for /admin/broadcast (BFF).
//
// The page renders this server-side too, but the client island refetches here for
// search, status filter, pagination and live progress (the worker drains the
// outbox every 5s, so in-flight counters actually move).
// Role gate matches the page (`broadcast` section): SessionError→401,
// AdminError→404 — never 403, so a wrong-role probe cannot enumerate routes.
import { z } from "zod";
import { requireRole } from "../../../../../lib/admin-auth";
import {
  BROADCAST_MAX_PAGE_SIZE,
  BROADCAST_QUEUE_FILTERS,
  adminBroadcastDirectory,
} from "../../../../../lib/admin-broadcast-directory";
import { logger } from "../../../../../lib/logger";
import { AdminError, SessionError } from "../../../../../lib/session";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  q: z.string().trim().max(200).optional(),
  filter: z.enum(BROADCAST_QUEUE_FILTERS as unknown as [string, ...string[]]).optional(),
  page: z.coerce.number().int().min(1).max(100_000).optional(),
  pageSize: z.coerce.number().int().min(1).max(BROADCAST_MAX_PAGE_SIZE).optional(),
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
    logger.error({ route: "admin-broadcast-directory", outcome: "session_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }

  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    q: url.searchParams.get("q") ?? undefined,
    filter: url.searchParams.get("filter") ?? undefined,
    page: url.searchParams.get("page") ?? undefined,
    pageSize: url.searchParams.get("pageSize") ?? undefined,
  });
  if (!parsed.success) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  try {
    const page = await adminBroadcastDirectory({
      q: parsed.data.q,
      filter: parsed.data.filter as never,
      page: parsed.data.page,
      pageSize: parsed.data.pageSize,
    });
    return Response.json(page);
  } catch {
    logger.error({ route: "admin-broadcast-directory", outcome: "unexpected_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
