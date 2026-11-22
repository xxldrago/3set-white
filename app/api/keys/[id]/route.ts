// GET /api/keys/[id] — session-gated ownership-joined key detail (CAB-04).
//
// The `id` path segment is untrusted (T-02-20): validate it with zod before any
// lookup, resolve the telegram id server-side (T-02-12), and read through
// `getKeyForUser`, which joins on `(userId, keyId)` so a non-owned key is
// indistinguishable from a missing one (404, no reason oracle — T-02-17).
import { z } from "zod";
import { ArtemidaError } from "@/lib/artemida";
import { getKeyForUser, normalizeLabel, setKeyLabel, deleteKey, deleteKeyByUserId } from "@/lib/keys-service";
import { logger } from "@/lib/logger";
import { requireSession, requireTelegramSession, SessionError } from "@/lib/session";

export const dynamic = "force-dynamic";

const idSchema = z.string().min(1).max(200);
const patchSchema = z.object({
  // A string sets the label, an explicit null clears it. Length/emptiness is
  // normalized in the service so both entry points share one rule.
  label: z.union([z.string().max(200), z.null()]),
});

function mapArtemidaStatus(code: ArtemidaError["code"]): number {
  switch (code) {
    case "unauthorized":
      return 401;
    case "payment_required":
      return 402;
    case "not_found":
      return 404;
    case "conflict":
      return 409;
    case "rate_limited":
      return 429;
    case "bad_gateway":
    case "unavailable":
      return 502;
    default:
      return 500;
  }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  let telegramId: number;
  try {
    telegramId = await requireTelegramSession();
  } catch (err) {
    if (err instanceof SessionError) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    logger.error({ route: "keys-detail", outcome: "session_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }

  const { id } = await params;
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  try {
    const key = await getKeyForUser(BigInt(telegramId), parsed.data);
    if (!key) return Response.json({ error: "not_found" }, { status: 404 });
    return Response.json({ key });
  } catch (err) {
    if (err instanceof ArtemidaError) {
      logger.warn({
        route: "keys-detail",
        code: err.code,
        requestId: err.requestId,
      });
      return Response.json({ error: err.code }, { status: mapArtemidaStatus(err.code) });
    }
    logger.error({ route: "keys-detail", outcome: "unexpected_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }
}

/**
 * PATCH /api/keys/[id] — set or clear the owner's display label for a key.
 *
 * This is a LOCAL-only mutation: ARTEMIDA has no rename endpoint (verified:
 * PATCH/PUT /keys/{id} → 501, /keys/{id}/rename → 404), so nothing is sent to
 * the provider. The label is stored in our `keys_cache.label` column, which a
 * provider sync never overwrites. A non-owned key answers 404 like a missing
 * one (no oracle).
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  let userId: number;
  try {
    ({ userId } = await requireSession());
  } catch (err) {
    if (err instanceof SessionError) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    logger.error({ route: "keys-label", outcome: "session_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }

  const { id } = await params;
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  let label: string | null;
  try {
    label = parsed.data.label === null ? null : normalizeLabel(parsed.data.label);
  } catch {
    // Too long after trimming — a validation failure, not a server error.
    return Response.json({ error: "label_too_long" }, { status: 400 });
  }

  try {
    const owned = await setKeyLabel(userId, parsedId.data, label);
    if (!owned) return Response.json({ error: "not_found" }, { status: 404 });
    return Response.json({ ok: true, label });
  } catch (err) {
    if (err instanceof ArtemidaError) {
      logger.warn({ route: "keys-label", code: err.code, requestId: err.requestId });
      return Response.json({ error: err.code }, { status: mapArtemidaStatus(err.code) });
    }
    logger.error({ route: "keys-label", outcome: "unexpected_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }
}

/**
 * DELETE /api/keys/[id] — permanently delete an owned key.
 *
 * ARTEMIDA has no undo: the provider's `permanent` delete is irreversible and
 * does not refund. The caller must confirm in the UI before invoking this.
 * A non-owned key answers 404 (no oracle).
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  let userId: number;
  let telegramId: number | null = null;
  try {
    ({ userId } = await requireSession());
  } catch (err) {
    if (err instanceof SessionError) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    logger.error({ route: "keys-delete", outcome: "session_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }

  const { id } = await params;
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  // Resolve telegram id for the provider-scoped path; fall back to userId path.
  try {
    const sid = await requireTelegramSession().catch(() => null);
    telegramId = sid;
  } catch {
    telegramId = null;
  }

  try {
    const ok =
      telegramId !== null
        ? await deleteKey(BigInt(telegramId), parsedId.data)
        : await deleteKeyByUserId(userId, parsedId.data);
    if (!ok) return Response.json({ error: "not_found" }, { status: 404 });
    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof ArtemidaError) {
      logger.warn({ route: "keys-delete", code: err.code, requestId: err.requestId });
      return Response.json({ error: err.code }, { status: mapArtemidaStatus(err.code) });
    }
    logger.error({ route: "keys-delete", outcome: "unexpected_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
