// Admin shell (template layout). The session + role gate here is UX/nav
// filtering ONLY — Next.js layouts are not a security boundary (partial
// rendering means a segment/RSC payload can be fetched without re-running the
// layout), so every /admin page and every /api/admin route re-checks
// requireRole (T-05-01).
//
// Signed-out → redirect('/login'). A signed-in caller with no staff role gets
// the same nav-less shell; the page below resolves to 404 (never a distinct
// forbidden page — D-51).
import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import AdminShell from './AdminShell';
import { loadAdminUnreadTicketCount } from '@/lib/admin-service';
import { can, getAdminRole, type AdminSection } from '@/lib/admin-auth';
import { requireTelegramSession, SessionError } from '@/lib/session';
import './admin.css';

export const dynamic = 'force-dynamic';

/** Nav destinations in display order — filtered server-side by `can()`. */
const NAV_SECTIONS: AdminSection[] = [
  'overview',
  'analytics',
  'users',
  'tickets',
  'broadcast',
  'segments',
  'pricing',
  'promos',
  'referrals',
  'partner',
  'partnerReferrals',
  'partnerPromos',
  'partnerPayouts',
  'partnerLinks',
  'partnerSupport',
  'wallet',
  'roles',
  'alerts',
  'providers',
  'fraud',
];

export default async function AdminLayout({ children }: { children: ReactNode }) {
  let telegramId: number;
  try {
    telegramId = await requireTelegramSession();
  } catch (err) {
    if (err instanceof SessionError) redirect('/login');
    throw err;
  }

  const role = await getAdminRole(telegramId);
  const allowed = role ? NAV_SECTIONS.filter((section) => can(role, section)) : [];
  // A failed count must never take the admin shell down — the badge is
  // cosmetic, the pages re-check authorization themselves.
  const unreadTickets =
    role && can(role, 'tickets')
      ? await loadAdminUnreadTicketCount().catch(() => 0)
      : 0;

  return (
    <AdminShell sections={allowed} role={role ?? 'client'} unreadTickets={unreadTickets}>
      {children}
    </AdminShell>
  );
}
