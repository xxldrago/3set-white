// POST /api/admin/partner/links/rate — partner-only: set the percent this
// partner pays ONE direct subpartner out of their own income (null clears it).
//
// Enforced server-side: the caller must hold the `partner` admin role, the
// target must be a DIRECT referral of the caller (scoped update), and the
// percent cannot exceed the partner's own percent entitlement.
import { z } from 'zod';
import { requireRole } from '@/lib/admin-auth';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { setPartnerSubRate } from '@/lib/referrals';
import { AdminError, SessionError } from '@/lib/session';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  subpartnerId: z.number().int().positive(),
  percent: z.number().int().min(0).max(100).nullable(),
});

export async function POST(req: Request): Promise<Response> {
  let telegramId: number;
  try {
    ({ telegramId } = await requireRole('partner'));
  } catch (err) {
    if (err instanceof SessionError) {
      return Response.json({ error: 'unauthorized' }, { status: 401 });
    }
    if (err instanceof AdminError) {
      return Response.json({ error: 'not_found' }, { status: 404 });
    }
    logger.error({ route: 'partner-sub-rate', outcome: 'session_error' });
    return Response.json({ error: 'internal' }, { status: 500 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: 'bad_request' }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: 'bad_request' }, { status: 400 });
  }

  const partner = await prisma.user.findUnique({
    where: { telegramId: BigInt(telegramId) },
    select: { id: true },
  });
  if (!partner) return Response.json({ error: 'not_found' }, { status: 404 });

  try {
    const result = await setPartnerSubRate(
      partner.id,
      parsed.data.subpartnerId,
      parsed.data.percent,
    );
    if (!result.ok) {
      const status = result.reason === 'not_found' ? 404 : 400;
      return Response.json({ error: result.reason }, { status });
    }
    return Response.json({ ok: true, percent: result.percent });
  } catch {
    logger.error({ route: 'partner-sub-rate', outcome: 'save_error' });
    return Response.json({ error: 'internal' }, { status: 500 });
  }
}
