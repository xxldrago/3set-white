// PATCH /api/admin/promos/bulk — switch many codes on/off in one call
// (administrator-only). Bulk enable is safe because checkout re-reads the row;
// bulk disable stops new redemptions while keeping history and click stats.
import { z } from 'zod';
import { requireRole } from '../../../../../lib/admin-auth';
import { setPromosActive } from '../../../../../lib/promo';
import { logger } from '../../../../../lib/logger';
import { AdminError, SessionError } from '../../../../../lib/session';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  ids: z.array(z.string().min(1).max(64)).min(1).max(200),
  active: z.boolean(),
});

export async function PATCH(req: Request): Promise<Response> {
  try {
    await requireRole('administrator');
  } catch (err) {
    if (err instanceof SessionError) {
      return Response.json({ error: 'unauthorized' }, { status: 401 });
    }
    if (err instanceof AdminError) {
      return Response.json({ error: 'not_found' }, { status: 404 });
    }
    logger.error({ route: 'admin-promos-bulk', outcome: 'session_error' });
    return Response.json({ error: 'internal' }, { status: 500 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'bad_request' }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: 'bad_request' }, { status: 400 });
  }
  try {
    const updated = await setPromosActive(parsed.data.ids, parsed.data.active);
    logger.info({ route: 'admin-promos-bulk', outcome: parsed.data.active ? 'enabled' : 'disabled', updated });
    return Response.json({ ok: true, updated });
  } catch {
    logger.error({ route: 'admin-promos-bulk', outcome: 'update_error' });
    return Response.json({ error: 'internal' }, { status: 500 });
  }
}
