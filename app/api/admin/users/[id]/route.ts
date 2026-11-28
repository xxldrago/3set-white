// GET /api/admin/users/[id] — ADM-02 admin user profile (BFF).
//
// `id` is our internal `User.id` (A4), not a telegram id. Role-gated for the
// `users` section; an unknown id is a plain 404. The three sub-sections are read
// independently by the service, so one failing read (e.g. keys) does not blank
// the others. SessionError→401, AdminError→404, else 500 (D-51/T-05-06).
import { z } from "zod";
import { requireRole } from "../../../../../lib/admin-auth";
import { loadAdminProfile } from "../../../../../lib/admin-service";
import { logger } from "../../../../../lib/logger";
import { prisma } from "../../../../../lib/prisma";
import { AdminError, SessionError } from "../../../../../lib/session";

export const dynamic = "force-dynamic";

const idSchema = z.coerce.number().int().positive();

// DELETE /api/admin/users/[id] — permanently remove an account
// (administrator-only). Every user-owned relation is ON DELETE CASCADE (keys,
// orders, tickets, wallet, referrals, clicks, plan payouts), so one delete
// leaves no orphans. The staff row (keyed by telegram id, no FK) is removed
// too; self-deletion and deleting another administrator are refused.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  let caller: { telegramId: number };
  try {
    caller = await requireRole("administrator");
  } catch (err) {
    if (err instanceof SessionError) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    if (err instanceof AdminError) {
      return Response.json({ error: "not_found" }, { status: 404 });
    }
    logger.error({ route: "admin-user-delete", outcome: "session_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }

  const { id } = await params;
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const userId = parsedId.data;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { telegramId: true },
  });
  if (!user) return Response.json({ error: "not_found" }, { status: 404 });
  if (user.telegramId !== null && Number(user.telegramId) === caller.telegramId) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  if (user.telegramId !== null) {
    const staff = await prisma.adminUser.findUnique({
      where: { telegramId: user.telegramId },
      select: { role: true },
    });
    if (staff?.role === "administrator") {
      return Response.json({ error: "bad_request" }, { status: 400 });
    }
  }

  try {
    await prisma.$transaction(async (tx) => {
      if (user.telegramId !== null) {
        await tx.adminUser.deleteMany({ where: { telegramId: user.telegramId } });
      }
      await tx.user.delete({ where: { id: userId } });
    });
    logger.info({ route: "admin-user-delete", outcome: "deleted", userId });
    return Response.json({ ok: true });
  } catch {
    logger.error({ route: "admin-user-delete", outcome: "delete_error", userId });
    return Response.json({ error: "internal" }, { status: 500 });
  }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    await requireRole("administrator", "support", "manager");
  } catch (err) {
    if (err instanceof SessionError) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    if (err instanceof AdminError) {
      return Response.json({ error: "not_found" }, { status: 404 });
    }
    logger.error({ route: "admin-user-profile", outcome: "session_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }

  const { id } = await params;
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  try {
    const profile = await loadAdminProfile(parsedId.data);
    if (!profile) return Response.json({ error: "not_found" }, { status: 404 });
    return Response.json({ profile });
  } catch {
    logger.error({ route: "admin-user-profile", outcome: "unexpected_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
