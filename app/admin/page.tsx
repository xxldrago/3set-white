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
import { Suspense } from 'react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireRole } from '@/lib/admin-auth';
import { t } from '@/lib/i18n';
import { AdminError, SessionError } from '@/lib/session';

export const dynamic = 'force-dynamic';

const CARD = 'flex flex-col gap-2 rounded-2xl border border-black/10 p-6 dark:border-white/15';
const CARD_GRID = 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3';
const SECONDARY =
  'flex h-11 items-center justify-center rounded-full border border-solid border-black/[.08] px-4 text-sm transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]';

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className={CARD}>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">{label}</p>
      <p className="text-3xl font-semibold tabular-nums text-black dark:text-zinc-50">{value}</p>
    </div>
  );
}

/** Loading fallback for one card group (UI-SPEC §2: h-24 skeleton cards). */
function SkeletonCards() {
  return (
    <section className={CARD_GRID} aria-hidden>
      {Array.from({ length: 3 }, (_, index) => (
        <div key={index} className="h-24 animate-pulse rounded-2xl bg-black/5 dark:bg-white/10" />
      ))}
    </section>
  );
}

/** Error state for ONE card group — the other group still renders (UI-SPEC §2). */
function GroupError() {
  return (
    <section className={`${CARD} border-black/10 dark:border-white/15`} role="alert">
      <p className="text-zinc-600 dark:text-zinc-400">{t('common.errorLoad')}</p>
      <Link href="/admin" className={SECONDARY}>
        {t('common.retry')}
      </Link>
    </section>
  );
}

/** Our-DB group: revenue / users / orders (plan 05-07 fills the aggregates). */
async function DbStatsGroup() {
  try {
    return (
      <div className={CARD_GRID}>
        <MetricCard label={t('admin.statsRevenue')} value="—" />
        <MetricCard label={t('admin.statsUsers')} value="—" />
        <MetricCard label={t('admin.statsOrders')} value="—" />
      </div>
    );
  } catch {
    return <GroupError />;
  }
}

/** ARTEMIDA group: keys / devices / balance (plan 05-07 fills the reads). */
async function ArtemidaStatsGroup() {
  try {
    return (
      <div className={CARD_GRID}>
        <MetricCard label={t('admin.statsKeys')} value="—" />
        <MetricCard label={t('admin.statsDevices')} value="—" />
        <MetricCard label={t('admin.statsBalance')} value="—" />
      </div>
    );
  } catch {
    return <GroupError />;
  }
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
    <section className="flex flex-col gap-6">
      <h2 className="text-xl font-semibold text-black dark:text-zinc-50">{t('admin.statsTitle')}</h2>

      {/* Independent boundaries: a failure in one group cannot blank the other. */}
      <Suspense fallback={<SkeletonCards />}>
        <DbStatsGroup />
      </Suspense>
      <Suspense fallback={<SkeletonCards />}>
        <ArtemidaStatsGroup />
      </Suspense>
    </section>
  );
}