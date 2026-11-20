// POST /api/sessions/kill-all — revoke every session except the current one.
//
// There is no server-side session registry, so this is a no-op on the server
// side: the client simply redirects to /logout after a successful response,
// which clears the session cookie. Returning ok lets the client show a toast
// and navigate.
import { logger } from '@/lib/logger';
import { requireSession, SessionError } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function POST(): Promise<Response> {
  try {
    await requireSession();
  } catch (err) {
    if (err instanceof SessionError) {
      return Response.json({ error: 'unauthorized' }, { status: 401 });
    }
    logger.error({ route: 'sessions-kill-all', outcome: 'session_error' });
    return Response.json({ error: 'internal' }, { status: 500 });
  }

  return Response.json({ ok: true }, { status: 200 });
}
