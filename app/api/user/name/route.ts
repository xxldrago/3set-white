// PATCH /api/user/name — rename the caller's account.
//
// Validates: non-empty, min 2 chars, no digits or <>{} characters (matches
// the template's client-side rule). Ownership is enforced server-side by the
// session-derived userId — never trusted from the client (T-04-20).
import { z } from 'zod';
import { requireSession, SessionError } from '@/lib/session';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const nameSchema = z
  .string()
  .min(2, 'Имя должно содержать минимум 2 символа')
  .max(24)
  .refine((v) => !/[0-9<>{}]/.test(v), 'Без цифр и спецсимволов');

export async function PATCH(req: Request): Promise<Response> {
  let userId: number;
  try {
    ({ userId } = await requireSession());
  } catch (err) {
    if (err instanceof SessionError) {
      return Response.json({ error: 'unauthorized' }, { status: 401 });
    }
    logger.error({ route: 'user-name', outcome: 'session_error' });
    return Response.json({ error: 'internal' }, { status: 500 });
  }

  const body = await req.json().catch(() => null);
  const parsed = nameSchema.safeParse(body?.name);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues.map((i) => i.message).join('; ') },
      { status: 400 }
    );
  }

  try {
    const name = parsed.data.trim().replace(/[0-9<>{}]/g, '').slice(0, 24);
    if (name.length < 2) {
      return Response.json({ error: 'Имя слишком короткое после очистки' }, { status: 400 });
    }
    await prisma.user.update({
      where: { id: userId },
      data: { firstName: name },
    });
    return Response.json({ ok: true, name }, { status: 200 });
  } catch {
    logger.error({ route: 'user-name', outcome: 'update_error' });
    return Response.json({ error: 'internal' }, { status: 500 });
  }
}
