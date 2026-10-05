// POST /api/tickets/[id]/messages — session-gated user reply (SUP-01/D-59).
//
// The telegram id is resolved server-side from the signed cookie (T-04-14) and
// the `id` path segment is zod-validated before any lookup. The ownership join
// lives in `appendUserMessage`: a non-owned ticket is indistinguishable from a
// missing one (`null` → 404, no oracle). A reply to an answered/closed ticket
// REOPENS THE SAME THREAD in place — this route never creates a ticket (D-59).
//
// Accepts JSON `{ body }` or multipart `body` + optional `attachment`; an image
// runs through the shared attachment pipeline with the same guardrails as the
// create route. `runtime = "nodejs"` because that pipeline uses native `sharp`.
import { z } from "zod";
import {
  MAX_ATTACHMENT_BYTES,
  normalizeImage,
  saveAttachment,
  UnsupportedImageError,
} from "../../../../../lib/attachments";
import { logger } from "../../../../../lib/logger";
import { requireTelegramSession, SessionError } from "../../../../../lib/session";
import {
  appendUserMessage,
  type AttachmentDescriptor,
} from "../../../../../lib/tickets-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const idSchema = z.string().min(1).max(200);
const bodySchema = z.string().max(4000);

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  let telegramId: number;
  try {
    telegramId = await requireTelegramSession();
  } catch (err) {
    if (err instanceof SessionError) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    logger.error({ route: "tickets-messages", outcome: "session_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }

  const { id } = await params;
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  const contentType = req.headers.get("content-type") ?? "";
  let rawBody: unknown;
  let file: unknown = null;
  try {
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      rawBody = form.get("body");
      file = form.get("attachment");
    } else {
      const json = (await req.json()) as { body?: unknown } | null;
      rawBody = json?.body;
    }
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  const body = bodySchema.safeParse(typeof rawBody === "string" ? rawBody : "");
  if (!body.success) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const bodyText = body.data.trim();

  let attachment: AttachmentDescriptor | null = null;
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
      logger.error({ route: "tickets-messages", outcome: "normalize_error" });
      return Response.json({ error: "internal" }, { status: 500 });
    }
    try {
      const path = await saveAttachment(parsedId.data, normalized);
      attachment = {
        path,
        mime: normalized.mime,
        sizeBytes: normalized.sizeBytes,
        width: normalized.width,
        height: normalized.height,
      };
    } catch {
      logger.error({ route: "tickets-messages", outcome: "save_error" });
      return Response.json({ error: "internal" }, { status: 500 });
    }
  }

  // A reply must carry either text or an image (an image-only reply is valid).
  if (bodyText.length === 0 && attachment === null) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  try {
    const result = await appendUserMessage(
      BigInt(telegramId),
      parsedId.data,
      bodyText,
      attachment,
    );
    if (!result) return Response.json({ error: "not_found" }, { status: 404 });
    return Response.json({ ok: true, messageId: result.messageId });
  } catch {
    logger.error({ route: "tickets-messages", outcome: "unexpected_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
