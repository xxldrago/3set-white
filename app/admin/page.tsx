// /admin — dark admin dashboard (ADM-01). Enforcement lives HERE: a directly
// fetched RSC payload skips layouts, so this page re-runs the same guard
// (T-05-01 / Pitfall 3). Everyone who is not a staff member (administrator /
// manager / support) gets 404 — never a distinct forbidden page (D-51).
import { notFound, redirect } from 'next/navigation';
import { requireRole } from '@/lib/admin-auth';
import AdminApp from './AdminApp';
import { SessionError, AdminError } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function AdminOverviewPage() {
  let role: string | null = null;
  try {
    ({ role } = await requireRole('administrator', 'manager'));
  } catch (err) {
    if (err instanceof SessionError) redirect('/login');
    if (err instanceof AdminError) notFound();
    throw err;
  }
  return <AdminApp />;
}
