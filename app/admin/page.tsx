// /admin — dashboard (template layout). Enforcement lives HERE: a directly
// fetched RSC payload skips layouts, so this page re-runs the same guard
// (T-05-01 / Pitfall 3). Staff without the overview section (partner, support)
// are sent to their own start section instead of a 404; callers with no role
// still get 404 — never a distinct forbidden page (D-51).
//
// The first screen is resolved server-side from `loadAdminOverview` (real
// aggregate queries), then the client island refetches
// `/api/admin/overview?period=` when the operator switches the window.
import { notFound, redirect } from 'next/navigation';
import { requireRole, type AdminRole } from '@/lib/admin-auth';
import { loadAdminOverview } from '@/lib/admin-overview';
import AdminApp from './AdminApp';
import { SessionError, AdminError } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function AdminOverviewPage() {
  let role: AdminRole;
  try {
    ({ role } = await requireRole('administrator', 'manager', 'partner', 'support'));
  } catch (err) {
    if (err instanceof SessionError) redirect('/login');
    if (err instanceof AdminError) notFound();
    throw err;
  }
  // `/admin` is the staff overview. Roles without it get their own landing
  // page (the shell's brand link points at /admin for everyone).
  if (role === 'partner') redirect('/admin/partner');
  if (role === 'support') redirect('/admin/users');

  const overview = await loadAdminOverview(30);
  return <AdminApp initial={overview} />;
}
