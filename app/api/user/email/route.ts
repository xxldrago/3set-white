// POST /api/user/email — смена email аккаунта с подтверждением ящика.
//
// Сохраняет новый адрес (unverified) и высылает письмо со ссылкой
// подтверждения (узел email-verify, 24-часовой токен). Владелец аккаунта
// определяется сессией сервер-side — клиент не может чужой email поменять
// (T-04-20). Без SMTP в dev письмо не уходит, но адрес уже записан —
// подтверждение пройдёт, как только relay появится.
import { z } from 'zod';
import { requireSession, SessionError } from '@/lib/session';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { requestVerification } from '@/lib/email-verify';

export const dynamic = 'force-dynamic';

const schema = z.object({
  email: z.string().email('Некорректный адрес электронной почты'),
});

export async function POST(req: Request): Promise<Response> {
  let userId: number;
  try {
    ({ userId } = await requireSession());
  } catch (err) {
    if (err instanceof SessionError) {
      return Response.json({ error: 'unauthorized' }, { status: 401 });
    }
    logger.error({ route: 'user-email', outcome: 'session_error' });
    return Response.json({ error: 'internal' }, { status: 500 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'bad_request' }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues.map((i) => i.message).join('; ') },
      { status: 400 },
    );
  }

  const email = parsed.data.email.trim().toLowerCase();
  try {
    const taken = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (taken && taken.id !== userId) {
      return Response.json(
        { error: 'Этот email уже используется другим аккаунтом' },
        { status: 409 },
      );
    }

    await prisma.user.update({
      where: { id: userId },
      data: { email, emailCanonical: email, emailVerifiedAt: null },
    });

    const result = await requestVerification(userId);
    if (!result.ok && result.reason === 'mail_error') {
      logger.error({ route: 'user-email', outcome: 'mail_error', userId });
      return Response.json(
        { error: 'Не удалось отправить письмо подтверждения' },
        { status: 502 },
      );
    }
    return Response.json({ ok: true }, { status: 200 });
  } catch {
    logger.error({ route: 'user-email', outcome: 'update_error', userId });
    return Response.json({ error: 'internal' }, { status: 500 });
  }
}
