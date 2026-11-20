// GET /api/sessions — session-gated list of the caller's active sessions.
//
// The cabinet keeps a single cookie-based session, so there is no server-side
// session registry. We synthesize one entry describing the current session
// (user-agent + IP from request headers, "now" as last activity) so the
// profile UI can show a real device list. Only the current session exists;
// revocation of individual rows is not supported — use POST /api/sessions/kill-all
// to revoke everything except the current device.
import { headers } from 'next/headers';
import { requireSession, SessionError } from '@/lib/session';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

interface SessionRow {
  id: string;
  name: string;
  meta: string;
  current: boolean;
}

export async function GET(): Promise<Response> {
  let userId: number;
  try {
    ({ userId } = await requireSession());
  } catch (err) {
    if (err instanceof SessionError) {
      return Response.json({ error: 'unauthorized' }, { status: 401 });
    }
    logger.error({ route: 'sessions', outcome: 'session_error' });
    return Response.json({ error: 'internal' }, { status: 500 });
  }

  const h = await headers();
  const ua = h.get('user-agent') ?? 'Неизвестный браузер';
  const ip = h.get('x-forwarded-for') ?? h.get('x-real-ip') ?? '—';
  const name = ua.includes('Mobile') ? 'Мобильное устройство' : 'Настольный компьютер';

  const now = new Date();
  const rel = 'сейчас';

  const row: SessionRow = {
    id: 'current',
    name: `${name} · ${ua.slice(0, 60)}`,
    meta: `${ip} · ${rel}`,
    current: true,
  };

  return Response.json({ sessions: [row] }, { status: 200 });
}
