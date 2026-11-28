// PATCH /api/admin/promos/[id] — edit the manual switch, minimum amount and
// note of an existing code (administrator-only). Discount/expiry stay
// immutable: historic orders keep their own snapshot, and the code itself is
// never rewritten.
import { requireRole } from '../../../../../lib/admin-auth';
import { deletePromo, promoPatchSchema, updatePromo } from '../../../../../lib/promo';
import { logger } from '../../../../../lib/logger';
import { AdminError, SessionError } from '../../../../../lib/session';

export const dynamic = 'force-dynamic';

// DELETE /api/admin/promos/[id] — remove a code (administrator-only).
// Deleting never touches historic orders: they keep their own promoCode /
// finalAmount snapshot. Unknown id → 404 (indistinguishable from no-role).
export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    await requireRole('administrator');
  } catch (err) {
    if (err instanceof SessionError) {
      return Response.json({ error: 'unauthorized' }, { status: 401 });
    }
    if (err instanceof AdminError) {
      return Response.json({ error: 'not_found' }, { status: 404 });
    }
    logger.error({ route: 'admin-promos', outcome: 'session_error' });
    return Response.json({ error: 'internal' }, { status: 500 });
  }
  try {
    const { id } = await ctx.params;
    const deleted = await deletePromo(id);
    if (!deleted) return Response.json({ error: 'not_found' }, { status: 404 });
    return Response.json({ ok: true });
  } catch {
    logger.error({ route: 'admin-promos', outcome: 'delete_error' });
    return Response.json({ error: 'internal' }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    await requireRole('administrator');
  } catch (err) {
    if (err instanceof SessionError) {
      return Response.json({ error: 'unauthorized' }, { status: 401 });
    }
    if (err instanceof AdminError) {
      return Response.json({ error: 'not_found' }, { status: 404 });
    }
    logger.error({ route: 'admin-promos', outcome: 'session_error' });
    return Response.json({ error: 'internal' }, { status: 500 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'bad_request' }, { status: 400 });
  }
  const parsed = promoPatchSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: 'bad_request' }, { status: 400 });
  }
  try {
    const { id } = await ctx.params;
    const row = await updatePromo(id, parsed.data);
    if (!row) return Response.json({ error: 'not_found' }, { status: 404 });
    return Response.json({ promo: row });
  } catch {
    logger.error({ route: 'admin-promos', outcome: 'patch_error' });
    return Response.json({ error: 'internal' }, { status: 500 });
  }
}
