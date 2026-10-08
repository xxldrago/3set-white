// POST /api/admin/users/[id]/reward — per-user inviter reward override
// (administrator-only). Body `{ amount: number | null }`: a fixed RUB sum
// this account's referrals earn it (instead of the global rate), or null to
// clear back to global. The internal `User.id` is the route param (never a
// telegram id, same as the profile page).
import { z } from "zod";
import { requireRole } from "../../../../../../lib/admin-auth";
import { logger } from "../../../../../../lib/logger";
import { prisma } from "../../../../../../lib/prisma";
import { AdminError, SessionError } from "../../../../../../lib/session";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  amount: z.number().int().min(0).max(1_000_000).nullable(),
  kind: z.enum(["percent", "fixed"]).nullable().optional(),
});

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    await requireRole("administrator");
  } catch (err) {
    if (err instanceof SessionError) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    if (err instanceof AdminError) {
      return Response.json({ error: "not_found" }, { status: 404 });
    }
    logger.error({ route: "admin-user-reward", outcome: "session_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }
  const { id } = await ctx.params;
  const userId = Number(id);
  if (!Number.isSafeInteger(userId)) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  try {
    const updated = await prisma.user.updateMany({
      where: { id: userId },
      data: {
        customInviterReward: parsed.data.amount,
        ...(parsed.data.kind === undefined ? {} : { customInviterKind: parsed.data.kind }),
      },
    });
    if (updated.count === 0) {
      return Response.json({ error: "not_found" }, { status: 404 });
    }
    return Response.json({ ok: true, amount: parsed.data.amount, kind: parsed.data.kind ?? null });
  } catch {
    logger.error({ route: "admin-user-reward", outcome: "save_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
