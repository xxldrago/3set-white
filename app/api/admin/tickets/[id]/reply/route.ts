// POST /api/admin/tickets/[id]/reply — admin-gated support reply (D-51/D-57).
//
// Phase 4 admin auth is the server-only `ADMIN_TELEGRAM_IDS` allow-list behind
// `requireAdminSession()`: a valid non-admin session gets 404 (not 403) so the
// route cannot be enumerated (T-04-15). The reply is written through the shared
// service and delivered by ENQUEUEING a durable notification — this handler
// never calls Telegram inline, so a Bot API blip cannot lose the reply (D-57).
import { z } from "zod";
import { logger } from "../../../../../../lib/logger";
import { NOTIFY_TICKET_REPLY, enqueueNotification } from "../../../../../../lib/outbox";
import { AdminError, requireAdminSession, SessionError } from "../../../../../../lib/session";
import { addSupportMessage } from "../../../../../../lib/tickets-service";

export const dynamic = "force-dynamic";

const idSchema = z.string().min(1).max(200);
const bodySchema = z.string().trim().min(1).max(4000);

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    await requireAdminSession();
  } catch (err) {
    if (err instanceof SessionError) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    if (err instanceof AdminError) {
      return Response.json({ error: "not_found" }, { status: 404 });
    }
    logger.error({ route: "admin-ticket-reply", outcome: "session_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }

  const { id } = await params;
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  let rawBody: unknown;
  try {
    rawBody = ((await req.json()) as { body?: unknown } | null)?.body;
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const body = bodySchema.safeParse(typeof rawBody === "string" ? rawBody : "");
  if (!body.success) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  try {
    const message = await addSupportMessage(parsedId.data, body.data);
    if (!message) return Response.json({ error: "not_found" }, { status: 404 });

    // Enqueue ONLY — the worker resolves the owning chat and delivers (D-57).
    // dedupeKey is per-message, so a retried request with a new message id
    // enqueues a distinct delivery.
    await enqueueNotification({
      type: NOTIFY_TICKET_REPLY,
      dedupeKey: `ticket:${parsedId.data}:${message.id}`,
      ticketId: parsedId.data,
      ticketMessageId: message.id,
    });
    return Response.json({ ok: true });
  } catch {
    logger.error({ route: "admin-ticket-reply", outcome: "unexpected_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
