// POST /api/keys/[id]/autorenew — balance auto-renew toggle (session-gated).
//
// Body `{ enabled: boolean }`. Ownership resolves through the (userId, keyId)
// join — a non-owned key is indistinguishable from a missing one (404, no
// oracle). Trial keys reject with 409 `trial` (autopay never attaches to a
// trial, D-44). The daily scan picks the flag up from here.
import { z } from "zod";
import { getKeyForUserId } from "../../../../../lib/keys-service";
import { logger } from "../../../../../lib/logger";
import { prisma } from "../../../../../lib/prisma";
import { requireSession, SessionError } from "../../../../../lib/session";

export const dynamic = "force-dynamic";

const idSchema = z.string().min(1).max(200);
const bodySchema = z.object({ enabled: z.boolean() });

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
    logger.error({ route: "keys-autorenew", outcome: "session_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }
  const { id } = await params;
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  try {
    const key = await getKeyForUserId(userId, parsedId.data);
    if (!key) return Response.json({ error: "not_found" }, { status: 404 });
    const row = await prisma.keyCache.findFirst({
      where: { userId, keyId: parsedId.data },
      select: { autoRenew: true },
    });
    return Response.json({ autoRenew: row?.autoRenew ?? false });
  } catch {
    logger.error({ route: "keys-autorenew", outcome: "read_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }
}

export async function POST(
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
    logger.error({ route: "keys-autorenew", outcome: "session_error" });
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
  const parsedBody = bodySchema.safeParse(body);
  if (!parsedBody.success) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  try {
    const key = await getKeyForUserId(userId, parsedId.data);
    if (!key) return Response.json({ error: "not_found" }, { status: 404 });
    if (key.isTrial) return Response.json({ error: "trial" }, { status: 409 });
    await prisma.keyCache.updateMany({
      where: { userId, keyId: parsedId.data },
      data: { autoRenew: parsedBody.data.enabled },
    });
    return Response.json({ ok: true, autoRenew: parsedBody.data.enabled });
  } catch {
    logger.error({ route: "keys-autorenew", outcome: "toggle_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
