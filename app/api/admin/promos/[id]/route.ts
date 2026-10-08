// DELETE /api/admin/promos/[id] — remove a code (administrator-only).
// Deleting never touches historic orders: they keep their own promoCode /
// finalAmount snapshot. Unknown id → 404 (indistinguishable from no-role).
import { requireRole } from "../../../../../lib/admin-auth";
import { deletePromo } from "../../../../../lib/promo";
import { logger } from "../../../../../lib/logger";
import { AdminError, SessionError } from "../../../../../lib/session";

export const dynamic = "force-dynamic";

export async function DELETE(
  _req: Request,
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
    logger.error({ route: "admin-promos", outcome: "session_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }
  try {
    const { id } = await ctx.params;
    const deleted = await deletePromo(id);
    if (!deleted) return Response.json({ error: "not_found" }, { status: 404 });
    return Response.json({ ok: true });
  } catch {
    logger.error({ route: "admin-promos", outcome: "delete_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
