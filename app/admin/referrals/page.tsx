// /admin/referrals — administrator-only referral program console.
//
// Enforcement lives HERE (layouts are not a boundary — a directly fetched RSC
// payload skips them): signed-out → /login, no/wrong role → 404. The page
// loads one snapshot from lib/admin-referrals and hands it to the client
// island, which owns the mutations through the role-gated BFF routes.
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireRole } from '@/lib/admin-auth';
import { loadAdminReferrals } from '@/lib/admin-referrals';
import { logger } from '@/lib/logger';
import { AdminError, SessionError } from '@/lib/session';
import ReferralsApp from './ReferralsApp';

export const dynamic = 'force-dynamic';

export default async function AdminReferralsPage() {
  try {
    await requireRole('administrator');
  } catch (err) {
    if (err instanceof SessionError) redirect('/login');
    if (err instanceof AdminError) notFound();
    throw err;
  }

  let data;
  try {
    data = await loadAdminReferrals();
  } catch {
    logger.error({ route: 'admin-referrals', outcome: 'load_failed' });
    return (
      <div className="anl">
        <div className="anl-card">
          <h3>Не удалось загрузить реферальную программу</h3>
          <p className="anl-hint">Обновите страницу — данные читаются заново при каждом запросе.</p>
          <Link className="anl-btn" href="/admin/referrals" style={{ marginTop: 12 }}>
            Повторить
          </Link>
        </div>
      </div>
    );
  }

  return <ReferralsApp initial={data} />;
}
