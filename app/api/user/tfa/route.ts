// GET/POST /api/user/tfa — двухфакторная аутентификация аккаунта.
// GET возвращает текущий флаг, POST переключает его и бьёт watermark
// WR-01 (смена метода auth — все сессии до этого момента аннулируются).
import { z } from 'zod';
import { requireSession, SessionError } from '@/lib/session';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const toggleSchema = z.object({ enable: z.boolean() });

async function gate(): Promise<{ userId: number } | Response> {
  try {
    const identity = await requireSession();
    return { userId: identity.userId };
  } catch (err) {
    if (err instanceof SessionError) {
      return Response.json({ error: 'unauthorized' }, { status: 401 });
    }
    logger.error({ route: 'user-tfa', outcome: 'session_error' });
    return Response.json({ error: 'internal' }, { status: 500 });
  }
}

export async function GET(): Promise<Response> {
  const gated = await gate();
  if (gated instanceof Response) return gated;
  const user = await prisma.user.findUnique({
    where: { id: gated.userId },
    select: { twoFactorEnabled: true },
  });
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });
  return Response.json({ enabled: user.twoFactorEnabled }, { status: 200 });
}

export async function POST(req: Request): Promise<Response> {
  const gated = await gate();
  if (gated instanceof Response) return gated;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'bad_request' }, { status: 400 });
  }
  const parsed = toggleSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: 'bad_request' }, { status: 400 });
  }

  try {
    const next = !!parsed.data.enable;
    await prisma.user.update({
      where: { id: gated.userId },
      data: { twoFactorEnabled: next, credentialsChangedAt: new Date() },
    });
    return Response.json({ enabled: next }, { status: 200 });
  } catch {
    logger.error({ route: 'user-tfa', outcome: 'update_error', userId: gated.userId });
    return Response.json({ error: 'internal' }, { status: 500 });
  }
}
