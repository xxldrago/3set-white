// DELETE /api/user/account — hard-delete the caller's account.
//
// Requires the confirmation word "УДАЛИТЬ" in the body. Deletes the user row
// (cascades to keys, orders, tickets, wallet, referrals per schema relations).
// Ownership enforced server-side by session userId (T-04-20). Irreversible.
import { z } from 'zod';
import { requireSession, SessionError } from '@/lib/session';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const delSchema = z.object({
  confirm: z.string().refine((v) => v === 'УДАЛИТЬ', 'Введите слово УДАЛИТЬ для подтверждения'),
});

export async function DELETE(req: Request): Promise<Response> {
  let userId: number;
  try {
    ({ userId } = await requireSession());
  } catch (err) {
    if (err instanceof SessionError) {
      return Response.json({ error: 'unauthorized' }, { status: 401 });
    }
    logger.error({ route: 'user-account-delete', outcome: 'session_error' });
    return Response.json({ error: 'internal' }, { status: 500 });
  }

  const body = await req.json().catch(() => null);
  const parsed = delSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }

  try {
    await prisma.user.delete({ where: { id: userId } });
    logger.info({ route: 'user-account-delete', outcome: 'deleted', userId });
    return Response.json({ ok: true }, { status: 200 });
  } catch {
    logger.error({ route: 'user-account-delete', outcome: 'delete_error', userId });
    return Response.json({ error: 'internal' }, { status: 500 });
  }
}
