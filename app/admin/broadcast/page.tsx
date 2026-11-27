// /admin/broadcast — Telegram broadcast composer + campaign history.
//
// Enforcement lives HERE, not only in the layout (layouts are not a security
// boundary — T-05-01): signed-out → /login, no staff role → 404, wrong role →
// 404, never 403 (D-51). Only `administrator` holds the `broadcast` section.
//
// The page resolves the first history page AND the real RFM segment sizes
// server-side (so the composer is usable without JS), then hands them to the
// client island which refetches `/api/admin/broadcast/directory` for search,
// status filter and pagination. Nothing is rendered from fixtures: every
// counter is a real query over `broadcasts` + `notifications` + `users` +
// `user_rfm`.
//
// The backend supports Telegram only, one segment per campaign, and sends the
// body verbatim. Capabilities it does not have (email, scheduling, drafts,
// templates, open/click tracking, variable substitution) are rendered as
// explicitly disabled controls — never simulated.
import { notFound, redirect } from 'next/navigation';
import BroadcastApp from './BroadcastApp';
import './broadcast.css';
import { requireRole } from '@/lib/admin-auth';
import { BROADCAST_DEFAULT_PAGE_SIZE, adminBroadcastDirectory } from '@/lib/admin-broadcast-directory';
import { loadSegments } from '@/lib/analytics/rfm-service';
import { t } from '@/lib/i18n';
import { AdminError, SessionError } from '@/lib/session';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: `${t('admin.navBroadcast')} — ${t('app.name')}`,
};

export default async function AdminBroadcastPage() {
  try {
    await requireRole('administrator');
  } catch (err) {
    if (err instanceof SessionError) redirect('/login');
    if (err instanceof AdminError) notFound();
    throw err;
  }

  // Segment sizes come from the same RFM read model the composer targets, so
  // the recipient count shown before sending is the count the POST will use.
  // A failed segment load must not take the page down: the composer then shows
  // only the "all" audience, which is still correct.
  const [initial, segments] = await Promise.all([
    adminBroadcastDirectory({ pageSize: BROADCAST_DEFAULT_PAGE_SIZE }),
    loadSegments().catch(() => ({ segments: [], total: 0 })),
  ]);

  return (
    <BroadcastApp
      initial={initial}
      segments={segments.segments}
    />
  );
}
