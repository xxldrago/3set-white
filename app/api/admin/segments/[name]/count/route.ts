import { NextResponse } from 'next/server';
import { requireRole } from '../../../../../../lib/admin-auth';
import { logger } from '../../../../../../lib/logger';
import { SessionError, AdminError } from '../../../../../../lib/session';
import { prisma } from '../../../../../../lib/prisma';
import { SEGMENT_SLUGS } from '../../../../../../lib/analytics/rfm';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ name: string }> },
): Promise<Response> {
  try {
    await requireRole('administrator', 'manager');
  } catch (error) {
    if (error instanceof SessionError) return Response.json({ error: 'unauthorized' }, { status: 401 });
    if (error instanceof AdminError) return Response.json({ error: 'not_found' }, { status: 404 });
    logger.error({ route: 'admin-segments-count', outcome: 'session_error' });
    return Response.json({ error: 'internal' }, { status: 500 });
  }

  const { name } = await ctx.params;
  try {
    if (name === 'all') {
      const count = await prisma.user.count({ where: { chatId: { not: null } } });
      return Response.json({ count });
    }
    if (!(SEGMENT_SLUGS as readonly string[]).includes(name)) {
      return Response.json({ error: 'not_found' }, { status: 404 });
    }
    const count = await prisma.user.count({
      where: { chatId: { not: null }, rfm: { segment: name } },
    });
    return Response.json({ count });
  } catch (error) {
    logger.error({ route: 'admin-segments-count', outcome: 'unexpected_error' });
    return Response.json({ error: 'internal' }, { status: 500 });
  }
}
