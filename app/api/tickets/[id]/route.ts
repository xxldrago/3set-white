// GET /api/tickets/[id] — session-gated ticket thread read (ownership-joined).
//
// The telegram id is resolved server-side from the signed cookie (T-04-14) and
// `getTicketForUserId` joins ownership: a ticket the caller does not own returns
// `null` exactly like a missing one — 404, no ownership oracle (T-04-24).
// Used by the SupportClient ticket-detail modal to render the thread.
import { z } from "zod";
import { logger } from "../../../../lib/logger";
import { requireSession, SessionError } from "../../../../lib/session";
import { getTicketForUserId } from "../../../../lib/tickets-service";

export const dynamic = "force-dynamic";

const idSchema = z.string().min(1).max(200);

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  let userId: number;
  try {
    ({ userId } = await requireSession());
  } catch (err) {
    if (err instanceof SessionError) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    logger.error({ route: "tickets", outcome: "session_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }

  const { id } = await params;
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  try {
    const thread = await getTicketForUserId(userId, parsed.data);
    if (!thread) return Response.json({ error: "not_found" }, { status: 404 });
    return Response.json({ ok: true, thread }, { status: 200 });
  } catch {
    logger.error({ route: "tickets", outcome: "unexpected_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
