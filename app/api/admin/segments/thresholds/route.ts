import { z } from 'zod';
import { requireRole } from '../../../../../lib/admin-auth';
import { logger } from '../../../../../lib/logger';
import { SessionError, AdminError } from '../../../../../lib/session';
import { loadThresholds, saveThresholds } from '../../../../../lib/analytics/rfm-service';

export const dynamic = 'force-dynamic';

const thresholdsSchema = z.object({
  newPayerDays: z.number().int().min(1),
  activeDays: z.number().int().min(1),
  atRiskDays: z.number().int().min(1),
  churnedDays: z.number().int().min(1),
  vipPercent: z.number().int().min(1).max(100),
});

export async function GET(_req: Request): Promise<Response> {
  try {
    await requireRole('administrator', 'manager');
  } catch (error) {
    if (error instanceof SessionError) return Response.json({ error: 'unauthorized' }, { status: 401 });
    if (error instanceof AdminError) return Response.json({ error: 'not_found' }, { status: 404 });
    logger.error({ route: 'admin-segments-thresholds', outcome: 'session_error' });
    return Response.json({ error: 'internal' }, { status: 500 });
  }
  try {
    const thresholds = await loadThresholds();
    return Response.json({ thresholds });
  } catch {
    logger.error({ route: 'admin-segments-thresholds', outcome: 'unexpected_error' });
    return Response.json({ error: 'internal' }, { status: 500 });
  }
}

export async function PUT(req: Request): Promise<Response> {
  try {
    await requireRole('administrator');
  } catch (error) {
    if (error instanceof SessionError) return Response.json({ error: 'unauthorized' }, { status: 401 });
    if (error instanceof AdminError) return Response.json({ error: 'not_found' }, { status: 404 });
    logger.error({ route: 'admin-segments-thresholds', outcome: 'session_error' });
    return Response.json({ error: 'internal' }, { status: 500 });
  }
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: 'bad_request' }, { status: 400 });
  }
  const parsed = thresholdsSchema.safeParse(raw);
  if (!parsed.success) return Response.json({ error: 'bad_request' }, { status: 400 });
  try {
    const result = await saveThresholds(parsed.data);
    return Response.json({ thresholds: result.thresholds, recompute: result.recompute });
  } catch {
    logger.error({ route: 'admin-segments-thresholds', outcome: 'unexpected_error' });
    return Response.json({ error: 'internal' }, { status: 500 });
  }
}
