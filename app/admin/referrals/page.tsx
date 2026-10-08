// /admin/referrals — administrator-only referral program control.
// Enforcement lives HERE (layouts are not a boundary — T-05-01): signed-out →
// /login, no/wrong role → 404. Settings + pending withdrawals resolve
// server-side; mutations live in the `ReferralAdminForm` island.
import { Suspense } from 'react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import ReferralAdminForm from '@/components/admin/ReferralAdminForm';
import { requireRole } from '@/lib/admin-auth';
import { t } from '@/lib/i18n';
import { logger } from '@/lib/logger';
import { getReferralSettings, listWithdrawals } from '@/lib/referrals';
import { AdminError, SessionError } from '@/lib/session';

export const dynamic = 'force-dynamic';

const CARD = 'flex flex-col gap-4 rounded-2xl border border-line p-6 border-line';
const SECONDARY =
  'flex h-11 items-center justify-center rounded-full border border-solid border-line px-4 text-sm transition-colors hover:bg-foreground/5 border-line ';

function SkeletonRows() {
  return (
    <section className="flex flex-col gap-4" aria-hidden>
      {Array.from({ length: 3 }, (_, index) => (
        <div
          key={index}
          className="h-16 animate-pulse rounded-2xl bg-foreground/5"
        />
      ))}
    </section>
  );
}

async function ReferralsSection() {
  let settings;
  let withdrawals;
  try {
    [settings, withdrawals] = await Promise.all([
      getReferralSettings(),
      listWithdrawals("pending"),
    ]);
  } catch {
    logger.error({ route: 'admin-referrals', outcome: 'load_failed' });
    return (
      <section className={CARD} role="alert">
        <p className="text-muted">{t('common.errorLoad')}</p>
        <Link href="/admin/referrals" className={SECONDARY}>
          {t('common.retry')}
        </Link>
      </section>
    );
  }
  return (
    <ReferralAdminForm
      initialSettings={settings}
      initialWithdrawals={withdrawals.map((row) => ({
        ...row,
        createdAt: row.createdAt.toISOString(),
      }))}
    />
  );
}

export default async function AdminReferralsPage() {
  try {
    await requireRole('administrator');
  } catch (err) {
    if (err instanceof SessionError) redirect('/login');
    if (err instanceof AdminError) notFound();
    throw err;
  }

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold text-foreground">{t('admin.refTitle')}</h2>
        <p className="text-sm text-muted">{t('admin.refSubtitle')}</p>
      </div>
      <Suspense fallback={<SkeletonRows />}>
        <ReferralsSection />
      </Suspense>
    </section>
  );
}
