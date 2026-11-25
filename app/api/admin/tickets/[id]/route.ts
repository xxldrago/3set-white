// GET /api/admin/tickets/[id] — one thread for the /admin/tickets split view.
//
// The full `/admin/tickets/[id]` page already exists for deep links, but the
// two-pane inbox opens a thread in place. This BFF returns exactly what that
// pane renders: the provider-free thread (messages + attachment descriptors),
// the requester identity, the user header used by the context card and the
// compensation usage for the ticket. Role gate matches the page:
// SessionError→401, AdminError→404 — never 403 (D-51/T-05-06).
import { z } from "zod";
import { requireRole } from "../../../../../lib/admin-auth";
import { loadAdminHeader } from "../../../../../lib/admin-service";
import { logger } from "../../../../../lib/logger";
import { AdminError, SessionError } from "../../../../../lib/session";
import { COMPENSATION_MAX_PER_TICKET } from "../../../../../lib/ticket-compensation-reasons";
import { loadTicketCompensationSummary } from "../../../../../lib/ticket-compensation";
import { getTicketById } from "../../../../../lib/tickets-service";

export const dynamic = "force-dynamic";

const idSchema = z.string().min(1).max(200);

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
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
    logger.error({ route: "admin-ticket-thread", outcome: "session_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }

  const { id } = await params;
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  try {
    const thread = await getTicketById(parsedId.data);
    if (!thread) return Response.json({ error: "not_found" }, { status: 404 });

    const [header, compensation] = thread.requester
      ? await Promise.all([
          loadAdminHeader(thread.requester.userId).catch(() => null),
          loadTicketCompensationSummary(parsedId.data).catch(() => ({
            used: 0,
            maxDays: COMPENSATION_MAX_PER_TICKET,
          })),
        ])
      : [null, null];

    return Response.json({ thread, header, compensation });
  } catch {
    logger.error({ route: "admin-ticket-thread", outcome: "unexpected_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
