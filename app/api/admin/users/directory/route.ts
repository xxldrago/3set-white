// GET /api/admin/users/directory — paginated /admin/users list (BFF).
//
// The list page renders this server-side too, but the client island refetches
// here for search, filter, sort and pagination without a full document
// reload. Role gate matches the page (`users` section): SessionError→401,
// AdminError→404 — never 403, so a wrong-role probe cannot enumerate routes.
import { z } from "zod";
import { requireRole } from "../../../../../lib/admin-auth";
import {
  DIRECTORY_FILTERS,
  DIRECTORY_MAX_PAGE_SIZE,
  DIRECTORY_SORTS,
  adminUsersDirectory,
} from "../../../../../lib/admin-users-directory";
import { logger } from "../../../../../lib/logger";
import { AdminError, SessionError } from "../../../../../lib/session";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  q: z.string().trim().max(200).optional(),
  filter: z.enum(DIRECTORY_FILTERS as unknown as [string, ...string[]]).optional(),
  sort: z.enum(DIRECTORY_SORTS as unknown as [string, ...string[]]).optional(),
  dir: z.enum(["asc", "desc"]).optional(),
  page: z.coerce.number().int().min(1).max(100_000).optional(),
  pageSize: z.coerce.number().int().min(1).max(DIRECTORY_MAX_PAGE_SIZE).optional(),
  segment: z.string().trim().max(40).optional(),
});

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
    logger.error({ route: "admin-users-directory", outcome: "session_error" });
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
    segment: url.searchParams.get("segment") ?? undefined,
  });
  if (!parsed.success) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  let segment: string | undefined;
  if (parsed.data.segment) {
    const { SEGMENT_SLUGS } = await import("../../../../../lib/analytics/rfm");
    if (!(SEGMENT_SLUGS as readonly string[]).includes(parsed.data.segment)) {
      return Response.json({ error: "bad_request" }, { status: 400 });
    }
    segment = parsed.data.segment;
  }

  try {
    const page = await adminUsersDirectory({
      q: parsed.data.q,
      filter: parsed.data.filter as never,
      sort: parsed.data.sort as never,
      dir: parsed.data.dir as never,
      page: parsed.data.page,
      pageSize: parsed.data.pageSize,
      segment,
    });
    return Response.json(page);
  } catch {
    logger.error({ route: "admin-users-directory", outcome: "unexpected_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
