// GET /api/tickets/[id]/attachments/[attachmentId] — gated attachment serve
// (D-56 / T-04-17). This is the ONLY way attachment bytes leave the server;
// there is no public URL and no stored path is ever emitted.
//
// The telegram id is resolved from the signed cookie (T-04-14). The caller's
// staff role is resolved from `admin_users` via `getAdminRole` (Phase 5 RBAC,
// D-67): staff = role ∈ {administrator, support} (a manager is NOT staff —
// research Open Q4). `getOwnedAttachment` joins the attachment → message →
// ticket and authorizes the owner OR staff; a non-owned, non-staff attachment
// is a 404 with no read at all (no oracle). Bytes are read back through
// `readAttachment`, which re-confines the resolved path to UPLOAD_DIR, and
// served `inline` with `X-Content-Type-Options: nosniff` and a private cache
// header so a renamed WebP can never be sniffed as script.
import { z } from "zod";
import { getAdminRole } from "../../../../../../lib/admin-auth";
import { readAttachment } from "../../../../../../lib/attachments";
import { logger } from "../../../../../../lib/logger";
import { requireSession, requireTelegramSession, SessionError } from "../../../../../../lib/session";
import {
  getOwnedAttachment,
  getOwnedAttachmentByUserId,
} from "../../../../../../lib/tickets-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const idSchema = z.string().min(1).max(200);

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; attachmentId: string }> },
): Promise<Response> {
  // Resolve identity: `userId` (owner) when a users row exists; `telegramId`
  // (staff, or legacy tid sessions with no row). Staff are telegram-keyed.
  let userId: number | null = null;
  let telegramId: number | null = null;
  try {
    ({ userId, telegramId } = await requireSession());
  } catch (err) {
    if (!(err instanceof SessionError)) {
      logger.error({ route: "ticket-attachment", outcome: "session_error" });
      return Response.json({ error: "internal" }, { status: 500 });
    }
    try {
      telegramId = await requireTelegramSession();
    } catch (err2) {
      if (err2 instanceof SessionError) {
        return Response.json({ error: "unauthorized" }, { status: 401 });
      }
      logger.error({ route: "ticket-attachment", outcome: "session_error" });
      return Response.json({ error: "internal" }, { status: 500 });
    }
  }

  const { id, attachmentId } = await params;
  if (!idSchema.safeParse(id).success || !idSchema.safeParse(attachmentId).success) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  try {
    // Staff = the ticket-viewing role set only; a manager or a non-staff caller
    // falls through to the owner join (T-05-17). Staff identity is telegram-based.
    const role = telegramId !== null ? await getAdminRole(telegramId) : null;
    const isStaff = role === "administrator" || role === "support";

    let attachment: { path: string; mime: string } | null = null;
    if (isStaff && telegramId !== null) {
      attachment = await getOwnedAttachment(BigInt(telegramId), id, attachmentId, true);
    } else if (userId !== null) {
      attachment = await getOwnedAttachmentByUserId(userId, id, attachmentId, false);
    }
    if (!attachment) return Response.json({ error: "not_found" }, { status: 404 });

    const bytes = await readAttachment(attachment.path);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": attachment.mime,
        "Content-Length": String(bytes.byteLength),
        "Cache-Control": "private, max-age=86400",
        "Content-Disposition": "inline",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    logger.error({ route: "ticket-attachment", outcome: "unexpected_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
