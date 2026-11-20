// GET /api/tickets/unread — total unread support replies for the signed-in
// user. Powers the header badge on the «Поддержка» nav item.
//
// Ownership is enforced in the service by the session-derived user id: no
// caller-supplied scope, so the count can never reveal another user's tickets.
// Deliberately tiny (one aggregate) because the nav island calls it on every
// page load and on window focus.
import { logger } from "../../../../lib/logger";
import { requireSession, SessionError } from "../../../../lib/session";
import { unreadTicketCountForUser } from "../../../../lib/tickets-service";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  let userId: number;
  try {
    ({ userId } = await requireSession());
  } catch (err) {
    if (err instanceof SessionError) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    logger.error({ route: "tickets-unread", outcome: "session_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }

  try {
    const count = await unreadTicketCountForUser(userId);
    return Response.json({ count });
  } catch {
    logger.error({ route: "tickets-unread", outcome: "unexpected_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
