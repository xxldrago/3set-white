// POST /api/admin/tickets/[id]/compensate — grant bonus days from a ticket.
//
// Role-gated like the reply route (administrator/support; a valid session
// without a support role gets 404, never 403). The grant and the user-visible
// support message are one serializable transaction in
// `lib/ticket-compensation.ts`; this handler only validates, maps outcomes and
// enqueues the durable Telegram push. `requestId` makes a retried confirm
// idempotent.
import { z } from "zod";
import { requireRole } from "../../../../../../lib/admin-auth";
import { logger } from "../../../../../../lib/logger";
import { NOTIFY_TICKET_REPLY, enqueueNotification } from "../../../../../../lib/outbox";
import { AdminError, SessionError } from "../../../../../../lib/session";
import {
  COMPENSATION_REASONS,
  COMPENSATION_MAX_DAYS,
} from "../../../../../../lib/ticket-compensation-reasons";
import { compensateTicketWithBonusDays } from "../../../../../../lib/ticket-compensation";

export const dynamic = "force-dynamic";

const idSchema = z.string().min(1).max(200);
const payloadSchema = z.object({
  days: z.number().int().min(1).max(COMPENSATION_MAX_DAYS),
  reason: z.enum(COMPENSATION_REASONS),
  comment: z.string().trim().max(500).optional(),
  requestId: z.string().uuid(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  let caller: { telegramId: number; role: string };
  try {
    caller = await requireRole("administrator", "support");
  } catch (err) {
    if (err instanceof SessionError) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    if (err instanceof AdminError) {
      return Response.json({ error: "not_found" }, { status: 404 });
    }
    logger.error({ route: "admin-ticket-compensate", outcome: "session_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }

  const { id } = await params;
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const parsed = payloadSchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  try {
    const outcome = await compensateTicketWithBonusDays({
      ticketId: parsedId.data,
      adminTelegramId: BigInt(caller.telegramId),
      days: parsed.data.days,
      reason: parsed.data.reason,
      comment: parsed.data.comment?.trim() ? parsed.data.comment.trim() : null,
      requestId: parsed.data.requestId,
    });

    if (!outcome.ok) {
      const status = outcome.reason === "not_found" ? 404 : outcome.reason === "conflict" ? 409 : 400;
      return Response.json({ error: outcome.reason }, { status });
    }

    // Upsert is idempotent: a retry of the same grant reuses the same messageId
    // and therefore the same dedupeKey. A push failure is logged but never
    // changes the grant result.
    try {
      await enqueueNotification({
        type: NOTIFY_TICKET_REPLY,
        dedupeKey: `ticket:${parsedId.data}:${outcome.messageId}`,
        ticketId: parsedId.data,
        ticketMessageId: outcome.messageId,
      });
    } catch {
      logger.error({ route: "admin-ticket-compensate", outcome: "notify_failed" });
    }

    logger.info({
      route: "admin-ticket-compensate",
      outcome: outcome.created ? "granted" : "duplicate",
      days: outcome.days,
    });
    return Response.json({
      ok: true,
      days: outcome.days,
      bonusDays: outcome.bonusDays,
      duplicate: !outcome.created,
    });
  } catch {
    logger.error({ route: "admin-ticket-compensate", outcome: "unexpected_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
