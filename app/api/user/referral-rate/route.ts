// POST /api/user/referral-rate — ставка, которую ваши рефералы получают,
// когда сами приведут покупателя (subRateKind / subRateValue own rate).
// anybody may narrow only their own share — residual math floors at zero,
// so no money is ever created out of thin air.
import { z } from 'zod';
import { requireSession, SessionError } from '@/lib/session';
import { logger } from '@/lib/logger';
import { setSubRate } from '@/lib/referrals';

export const dynamic = 'force-dynamic';

const schema = z.object({
  kind: z.enum(['percent', 'fixed', 'days']).optional().nullable(),
  value: z.number().int().nonnegative().max(1_000_000).optional(),
});

export async function POST(req: Request): Promise<Response> {
  let userId: number;
  try {
    ({ userId } = await requireSession());
  } catch (err) {
    if (err instanceof SessionError) {
      return Response.json({ error: 'unauthorized' }, { status: 401 });
    }
    logger.error({ route: 'user-referral-rate', outcome: 'session_error' });
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
    return Response.json({ error: 'bad_request' }, { status: 400 });
  }

  const { kind, value } = parsed.data;
  const rate = kind === null || kind === undefined ? null : { kind, value: value ?? 0 };
  try {
    await setSubRate(userId, rate);
    return Response.json({ ok: true }, { status: 200 });
  } catch {
    logger.error({ route: 'user-referral-rate', outcome: 'set_error', userId });
    return Response.json({ error: 'internal' }, { status: 500 });
  }
}
