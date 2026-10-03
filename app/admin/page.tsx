// /admin overview (ADM-01). Enforcement lives HERE, not only in the layout: a
// directly fetched RSC payload skips layouts, so this page re-runs the same
// guard (T-05-01 / Pitfall 3). Overview is administrator + manager (UI-SPEC
// §1); everyone else gets 404 — never a distinct forbidden page (D-51).
//
// Stats in this plan render the empty baseline; plan 05-07 fills the DB and
// ARTEMIDA reads (and the balance chip).
import { notFound, redirect } from 'next/navigation';
import { requireRole } from '@/lib/admin-auth';
import { t } from '@/lib/i18n';
import { AdminError, SessionError } from '@/lib/session';

export const dynamic = 'force-dynamic';

const CARD = 'flex flex-col gap-2 rounded-2xl border border-black/10 p-6 dark:border-white/15';

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className={CARD}>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">{label}</p>
      <p className="text-3xl font-semibold tabular-nums text-black dark:text-zinc-50">{value}</p>
    </div>
  );
}

export default async function AdminOverviewPage() {
  try {
    await requireRole('administrator', 'manager');
  } catch (err) {
    if (err instanceof SessionError) redirect('/login');
    if (err instanceof AdminError) notFound();
    throw err;
  }

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold text-black dark:text-zinc-50">{t('admin.statsTitle')}</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard label={t('admin.statsRevenue')} value="—" />
        <MetricCard label={t('admin.statsUsers')} value="—" />
        <MetricCard label={t('admin.statsOrders')} value="—" />
        <MetricCard label={t('admin.statsKeys')} value="—" />
        <MetricCard label={t('admin.statsDevices')} value="—" />
        <MetricCard label={t('admin.statsBalance')} value="—" />
      </div>
    </section>
  );
}