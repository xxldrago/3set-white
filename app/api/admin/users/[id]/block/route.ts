// POST /api/admin/users/[id]/block — block or unblock an account
// (administrator-only). Body `{ blocked: boolean }`.
//
// A block sets `users.blocked_at`, which every session gate treats as a
// revocation: existing cookies stop working on the next request and sign-in is
// refused by the login routes. Staff administrators cannot be blocked here
// (role changes live on /admin/roles), and self-blocking is refused.
import { z } from 'zod';
import { requireRole } from '../../../../../../lib/admin-auth';
import { logger } from '../../../../../../lib/logger';
import { prisma } from '../../../../../../lib/prisma';
import { AdminError, SessionError } from '../../../../../../lib/session';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({ blocked: z.boolean() });

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  let caller: { telegramId: number };
  try {
    caller = await requireRole('administrator');
  } catch (err) {
    if (err instanceof SessionError) {
      return Response.json({ error: 'unauthorized' }, { status: 401 });
    }
    if (err instanceof AdminError) {
      return Response.json({ error: 'not_found' }, { status: 404 });
    }
    logger.error({ route: 'admin-user-block', outcome: 'session_error' });
    return Response.json({ error: 'internal' }, { status: 500 });
  }
  const { id } = await ctx.params;
  const userId = Number(id);
  if (!Number.isSafeInteger(userId) || userId <= 0) {
    return Response.json({ error: 'bad_request' }, { status: 400 });
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

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { telegramId: true },
  });
  if (!user) return Response.json({ error: 'not_found' }, { status: 404 });
  if (user.telegramId !== null && Number(user.telegramId) === caller.telegramId) {
    return Response.json({ error: 'bad_request' }, { status: 400 });
  }
  if (user.telegramId !== null) {
    const staff = await prisma.adminUser.findUnique({
      where: { telegramId: user.telegramId },
      select: { role: true },
    });
    // Blocking an administrator could lock the panel out of its own staff;
    // demote them first on /admin/roles.
    if (staff?.role === 'administrator') {
      return Response.json({ error: 'bad_request' }, { status: 400 });
    }
  }

  try {
    await prisma.user.update({
      where: { id: userId },
      data: {
        blockedAt: parsed.data.blocked ? new Date() : null,
        // A block is a credential event: bumping the watermark also retires
        // every token issued before it, even if the block is lifted later.
        ...(parsed.data.blocked ? { credentialsChangedAt: new Date() } : {}),
      },
    });
    logger.info({
      route: 'admin-user-block',
      outcome: parsed.data.blocked ? 'blocked' : 'unblocked',
      userId,
    });
    return Response.json({ ok: true, blocked: parsed.data.blocked });
  } catch {
    logger.error({ route: 'admin-user-block', outcome: 'save_error' });
    return Response.json({ error: 'internal' }, { status: 500 });
  }
}
