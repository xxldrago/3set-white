// POST /api/admin/tickets/[id]/close — admin-gated ticket close (D-51).
//
// Same role gate as the reply route (D-67): `requireRole('administrator',
// 'support')`; a valid session without a ticket-viewing role gets 404.
// `closeTicket` is the conditional single-writer transition; a missing ticket
// returns false → 404 (no oracle).
import { z } from "zod";
import { requireRole } from "../../../../../../lib/admin-auth";
import { logger } from "../../../../../../lib/logger";
import { AdminError, SessionError } from "../../../../../../lib/session";
import { closeTicket } from "../../../../../../lib/tickets-service";

export const dynamic = "force-dynamic";

const idSchema = z.string().min(1).max(200);

export async function POST(
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
    logger.error({ route: "admin-ticket-close", outcome: "session_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }

  const { id } = await params;
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  try {
    const closed = await closeTicket(parsed.data);
    if (!closed) return Response.json({ error: "not_found" }, { status: 404 });
    return Response.json({ ok: true });
  } catch {
    logger.error({ route: "admin-ticket-close", outcome: "unexpected_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
