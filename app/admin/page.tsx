// /admin overview (ADM-01). Enforcement lives HERE, not only in the layout: a
// directly fetched RSC payload skips layouts, so this page re-runs the same
// guard (T-05-01 / Pitfall 3). Overview is administrator + manager (UI-SPEC
// §1); everyone else gets 404 — never a distinct forbidden page (D-51).
//
// The dashboard is two independently degrading card groups (our DB and
// ARTEMIDA), each behind its own Suspense boundary and its own catch, so one
// source failing never blanks the other (UI-SPEC §2). This plan renders the
// empty `—` baseline; plan 05-07 fills the real reads (and the balance chip)
// and must NOT import lib/artemida into this page scope until then.
import { notFound, redirect } from 'next/navigation';
import { requireRole } from '@/lib/admin-auth';
import { t } from '@/lib/i18n';
import { AdminError, SessionError } from '@/lib/session';
import RevenuePanel from '@/components/admin/RevenuePanel';
import FunnelCharts from '@/components/admin/FunnelCharts';
import StatsPanel from '@/components/admin/StatsPanel';

export const dynamic = 'force-dynamic';

export default async function AdminOverviewPage({ searchParams }: { searchParams?: Promise<{ period?: string }> } = {}) {
  let role: string | null = null;
  try {
    ({ role } = await requireRole('administrator', 'manager'));
  } catch (err) {
    if (err instanceof SessionError) redirect('/login');
    if (err instanceof AdminError) notFound();
    throw err;
  }

  const params = await (searchParams ?? Promise.resolve({ period: undefined }));
  const rawPeriod = Number(params.period ?? 30);
  const period = rawPeriod === 7 || rawPeriod === 90 ? rawPeriod : 30;
  return (
    <section className="flex flex-col gap-6">
      <h2 className="text-xl font-semibold text-foreground">{t('admin.statsTitle')}</h2>

      <StatsPanel period={period} />
      <RevenuePanel period={period} />
      {role === 'administrator' && (
        <section className="flex flex-col gap-3">
          <h3 className="text-xl font-semibold text-foreground">{t('admin.funnelTitle')}</h3>
          <FunnelCharts endpoint="/api/admin/referrals/stats" />
        </section>
      )}
    </section>
  );
}
