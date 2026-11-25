// GET /api/admin/tickets/directory — paginated /admin/tickets inbox (BFF).
//
// The list page renders this server-side too, but the client island refetches
// here for search, filter, sort and pagination without a full document reload.
// Role gate matches the page (`tickets` section): SessionError→401,
// AdminError→404 — never 403, so a wrong-role probe cannot enumerate routes.
import { z } from "zod";
import { requireRole } from "../../../../../lib/admin-auth";
import {
  TICKET_QUEUE_FILTERS,
  TICKET_QUEUE_MAX_PAGE_SIZE,
  TICKET_QUEUE_SORTS,
  adminTicketsInbox,
} from "../../../../../lib/admin-tickets-directory";
import { logger } from "../../../../../lib/logger";
import { AdminError, SessionError } from "../../../../../lib/session";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  q: z.string().trim().max(200).optional(),
  filter: z.enum(TICKET_QUEUE_FILTERS as unknown as [string, ...string[]]).optional(),
  sort: z.enum(TICKET_QUEUE_SORTS as unknown as [string, ...string[]]).optional(),
  dir: z.enum(["asc", "desc"]).optional(),
  page: z.coerce.number().int().min(1).max(100_000).optional(),
  pageSize: z.coerce.number().int().min(1).max(TICKET_QUEUE_MAX_PAGE_SIZE).optional(),
});

export async function GET(req: Request): Promise<Response> {
  try {
    await requireRole("administrator", "support");
  } catch (err) {
    if (err instanceof SessionError) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    if (err instanceof AdminError) {
      return Response.json({ error: "not_found" }, { status: 404 });
    }
    logger.error({ route: "admin-tickets-directory", outcome: "session_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }

  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    q: url.searchParams.get("q") ?? undefined,
    filter: url.searchParams.get("filter") ?? undefined,
    sort: url.searchParams.get("sort") ?? undefined,
    dir: url.searchParams.get("dir") ?? undefined,
    page: url.searchParams.get("page") ?? undefined,
    pageSize: url.searchParams.get("pageSize") ?? undefined,
  });
  if (!parsed.success) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  try {
    const page = await adminTicketsInbox({
      q: parsed.data.q,
      filter: parsed.data.filter as never,
      sort: parsed.data.sort as never,
      dir: parsed.data.dir as never,
      page: parsed.data.page,
      pageSize: parsed.data.pageSize,
    });
    return Response.json(page);
  } catch {
    logger.error({ route: "admin-tickets-directory", outcome: "unexpected_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
