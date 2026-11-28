// POST /api/admin/users/[id]/plans — per-duration partner payouts
// (administrator-only). Body `{ rows: [{ days, amount|null }] }`: the grid
// replaces the account's current payouts; a null amount removes that term.
// The internal `User.id` is the route param (never a telegram id).
import { z } from 'zod';
import { requireRole } from '../../../../../../lib/admin-auth';
import { logger } from '../../../../../../lib/logger';
import { setPartnerPlanRewards } from '../../../../../../lib/referrals';
import { AdminError, SessionError } from '../../../../../../lib/session';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  rows: z
    .array(
      z.object({
        days: z.number().int().min(1).max(3650),
        amount: z.number().int().min(0).max(1_000_000).nullable(),
      }),
    )
    .max(20),
});

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    await requireRole('administrator');
  } catch (err) {
    if (err instanceof SessionError) {
      return Response.json({ error: 'unauthorized' }, { status: 401 });
    }
    if (err instanceof AdminError) {
      return Response.json({ error: 'not_found' }, { status: 404 });
    }
    logger.error({ route: 'admin-user-plans', outcome: 'session_error' });
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
  try {
    const rows = await setPartnerPlanRewards(userId, parsed.data.rows);
    return Response.json({ ok: true, rows });
  } catch (err: unknown) {
    if (
      err instanceof Error &&
      (err.message === 'referral:bad_plan_days' || err.message === 'referral:bad_plan_amount')
    ) {
      return Response.json({ error: 'bad_request' }, { status: 400 });
    }
    logger.error({ route: 'admin-user-plans', outcome: 'save_error' });
    return Response.json({ error: 'internal' }, { status: 500 });
  }
}
