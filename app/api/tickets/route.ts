// POST /api/tickets — session-gated multipart ticket creation (SUP-01/SUP-02).
//
// The telegram id is resolved server-side from the signed httpOnly cookie; no
// client-supplied id is ever trusted (T-04-14). This route is a thin boundary:
// it validates the multipart fields, runs the optional image through the shared
// `lib/attachments.ts` pipeline (magic-byte format check + WebP downscale), and
// delegates the write to the single shared `lib/tickets-service.ts` path so the
// cabinet and bot cannot diverge (Pitfall 4). Only typed error codes are ever
// returned — no provider/DB text and no stored path (T-04-19).
//
// `runtime = "nodejs"` is mandatory: `sharp` is a native module and must never
// run on the edge runtime (Pitfall 8).
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  MAX_ATTACHMENT_BYTES,
  normalizeImage,
  saveAttachment,
  UnsupportedImageError,
} from "../../../lib/attachments";
import { logger } from "../../../lib/logger";
import { requireTelegramSession, SessionError } from "../../../lib/session";
import { createTicket, type AttachmentDescriptor } from "../../../lib/tickets-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const subjectSchema = z.string().trim().min(1).max(120);
const bodySchema = z.string().trim().min(1).max(4000);

export async function POST(req: Request): Promise<Response> {
  let telegramId: number;
  try {
    telegramId = await requireTelegramSession();
  } catch (err) {
    if (err instanceof SessionError) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    logger.error({ route: "tickets", outcome: "session_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  const subject = subjectSchema.safeParse(form.get("subject"));
  const body = bodySchema.safeParse(form.get("body"));
  if (!subject.success || !body.success) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  // Optional attachment: enforce the raw-byte cap BEFORE decode (D-54), then
  // decide the format from decoded bytes via `normalizeImage` (spoofed
  // filename/MIME is ignored). The storage scope is server-generated; only the
  // RELATIVE path reaches the DB (D-53/D-56).
  let attachment: AttachmentDescriptor | null = null;
  const file = form.get("attachment");
  if (file instanceof File) {
    if (file.size > MAX_ATTACHMENT_BYTES) {
      return Response.json({ error: "too_large" }, { status: 413 });
    }
    let normalized;
    try {
      normalized = await normalizeImage(Buffer.from(await file.arrayBuffer()));
    } catch (err) {
      if (err instanceof UnsupportedImageError) {
        return Response.json({ error: "bad_type" }, { status: 400 });
      }
      logger.error({ route: "tickets", outcome: "normalize_error" });
      return Response.json({ error: "internal" }, { status: 500 });
    }
    try {
      const path = await saveAttachment(randomUUID(), normalized);
      attachment = {
        path,
        mime: normalized.mime,
        sizeBytes: normalized.sizeBytes,
        width: normalized.width,
        height: normalized.height,
      };
    } catch {
      logger.error({ route: "tickets", outcome: "save_error" });
      return Response.json({ error: "internal" }, { status: 500 });
    }
  }

  try {
    const result = await createTicket({
      telegramId: BigInt(telegramId),
      subject: subject.data,
      body: body.data,
      attachment,
    });
    if (result.kind === "no_user") {
      // The session is valid but no identity row exists — treat as unauthorized.
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    return Response.json({ ok: true, id: result.id }, { status: 201 });
  } catch {
    logger.error({ route: "tickets", outcome: "unexpected_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
