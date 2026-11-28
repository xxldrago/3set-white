// POST /api/admin/tickets/[id]/read — admin-gated mark-read.
//
// Same role gate as reply/close (D-67): `requireRole('administrator',
// 'support')`; a valid session without a ticket-viewing role gets 404, never a
// distinct forbidden page (T-05-18). Clears `unreadForAdmin` only — the user's
// `unreadForUser` counter is owned by the owner-scoped read route.
import { z } from "zod";
import { requireRole } from "../../../../../../lib/admin-auth";
import { logger } from "../../../../../../lib/logger";
import { canPartnerAccessTicket } from "../../../../../../lib/partner-support";
import { AdminError, SessionError } from "../../../../../../lib/session";
import { markTicketReadForAdmin } from "../../../../../../lib/tickets-service";

export const dynamic = "force-dynamic";

const idSchema = z.string().min(1).max(200);

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  let actor: Awaited<ReturnType<typeof requireRole>>;
  try {
    actor = await requireRole("administrator", "support", "partner");
  } catch (err) {
    if (err instanceof SessionError) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    if (err instanceof AdminError) {
      return Response.json({ error: "not_found" }, { status: 404 });
    }
    logger.error({ route: "admin-ticket-read", outcome: "session_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }

  const { id } = await params;
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  // A partner may mark read only tickets opened by their direct referrals.
  if (
    actor.role === "partner" &&
    !(await canPartnerAccessTicket(actor.telegramId, parsed.data))
  ) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  try {
    const read = await markTicketReadForAdmin(parsed.data);
    if (!read) return Response.json({ error: "not_found" }, { status: 404 });
    return Response.json({ ok: true });
  } catch {
    logger.error({ route: "admin-ticket-read", outcome: "unexpected_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
