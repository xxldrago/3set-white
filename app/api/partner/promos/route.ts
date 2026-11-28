// POST /api/partner/promos — a partner creates their OWN promo code.
//
// Owner is always the caller (resolved from the signed session — never from
// the body), so a partner cannot mint codes for anyone else. Self-service is
// deliberately narrower than the admin console: percentage ≤ 50% and fixed
// ≤ 1000 ₽, with an optional use cap and expiry. requireRole → 401/404,
// invalid body → 400, duplicate code → 409.
import { z } from 'zod';
import { requireRole } from '@/lib/admin-auth';
import { prisma } from '@/lib/prisma';
import { createPromo, PROMO_CODE_RE } from '@/lib/promo';
import { logger } from '@/lib/logger';
import { AdminError, SessionError } from '@/lib/session';

export const dynamic = 'force-dynamic';

const PARTNER_MAX_PCT = 50;
const PARTNER_MAX_FIXED = 1000;

const partnerPromoSchema = z.object({
  code: z.string().trim().toUpperCase().min(3).max(32).regex(PROMO_CODE_RE),
  type: z.enum(['percentage', 'fixed']),
  discount: z.number().int().min(1),
  maxUses: z.number().int().min(1).max(100_000).nullable().optional(),
  expiresAt: z.string().datetime({ offset: true }).nullable().optional(),
});

function gateError(err: unknown): Response | null {
  if (err instanceof SessionError) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (err instanceof AdminError) return Response.json({ error: 'not_found' }, { status: 404 });
  return null;
}

export async function POST(req: Request): Promise<Response> {
  let telegramId: number;
  try {
    ({ telegramId } = await requireRole('partner'));
  } catch (err) {
    return (
      gateError(err) ??
      (() => {
        logger.error({ route: 'partner-promos', outcome: 'session_error' });
        return Response.json({ error: 'internal' }, { status: 500 });
      })()
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'bad_request' }, { status: 400 });
  }
  const parsed = partnerPromoSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: 'bad_request' }, { status: 400 });

  const limit = parsed.data.type === 'percentage' ? PARTNER_MAX_PCT : PARTNER_MAX_FIXED;
  if (parsed.data.discount > limit) return Response.json({ error: 'too_large' }, { status: 400 });

  const owner = await prisma.user.findUnique({
    where: { telegramId: BigInt(telegramId) },
    select: { id: true },
  });
  if (!owner) return Response.json({ error: 'not_found' }, { status: 404 });

  try {
    const row = await createPromo({ ...parsed.data, ownerUserId: owner.id });
    return Response.json({ promo: row }, { status: 201 });
  } catch (err: unknown) {
    if (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code: unknown }).code === 'P2002'
    ) {
      return Response.json({ error: 'code_taken' }, { status: 409 });
    }
    logger.error({ route: 'partner-promos', outcome: 'create_error' });
    return Response.json({ error: 'internal' }, { status: 500 });
  }
}
