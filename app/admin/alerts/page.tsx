// /admin/alerts (Phase 13) — anomaly alert history and configuration.
import { notFound, redirect } from 'next/navigation';
import AlertTable from '@/components/admin/AlertTable';
import AlertToggle from '@/components/admin/AlertToggle';
import { requireRole } from '@/lib/admin-auth';
import { AdminError, SessionError } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { t } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

export default async function AdminAlertsPage({
  searchParams,
}: {
  searchParams?: Promise<{ status?: string; type?: string }>;
} = {}) {
  try {
    await requireRole('administrator');
  } catch (err) {
    if (err instanceof SessionError) redirect('/login');
    if (err instanceof AdminError) notFound();
    throw err;
  }

  const params = (await (searchParams ?? Promise.resolve({}))) as Record<string, string | undefined>;
  const statusFilter = params.status || 'all';
  const typeFilter = params.type || 'all';

  const where: any = {};
  if (statusFilter !== 'all') {
    where.status = statusFilter;
  }
  if (typeFilter !== 'all') {
    where.type = typeFilter;
  }

  const [alerts, mutedSetting] = await Promise.all([
    prisma.alertEvent.findMany({
      where,
      orderBy: { firedAt: 'desc' },
      take: 100,
    }),
    prisma.setting.findUnique({ where: { key: 'alert.mutedTypes' } }),
  ]);

  let mutedTypes: string[] = [];
  if (mutedSetting?.value) {
    try {
      mutedTypes = JSON.parse(mutedSetting.value);
    } catch {
      mutedTypes = [];
    }
  }

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-foreground">{t('admin.alertsTitle')}</h2>
          <p className="text-sm text-muted">{t('admin.alertsDescription')}</p>
        </div>
        <form action="/api/admin/alerts/test" method="post">
          <button
            type="submit"
            className="rounded-lg bg-foreground px-4 py-2 text-sm text-lime transition-opacity hover:opacity-90"
          >
            {t('admin.alertsTestButton')}
          </button>
        </form>
      </header>

      <AlertToggle mutedTypes={mutedTypes} />

      <div className="flex flex-wrap gap-3">
        <a
          href={`/admin/alerts?status=${statusFilter}&type=all`}
          className="rounded-lg border border-line px-3 py-2 text-sm text-foreground hover:bg-foreground/5"
        >
          {t('admin.alertsFilterType')}: {typeFilter === 'all' ? t('admin.alertsFilterAll') : (typeFilter === 'payment_drop' ? t('admin.alertsTypePaymentDrop') : typeFilter === 'failed_spike' ? t('admin.alertsTypeFailedSpike') : typeFilter === 'ticket_spike' ? t('admin.alertsTypeTicketSpike') : t('admin.alertsTypeRunwayLow'))}
        </a>
        <a
          href={`/admin/alerts?status=all&type=${typeFilter}`}
          className="rounded-lg border border-line px-3 py-2 text-sm text-foreground hover:bg-foreground/5"
        >
          {t('admin.alertsFilterStatus')}: {statusFilter === 'all' ? t('admin.alertsFilterAll') : (statusFilter === 'firing' ? t('admin.alertsStatusFiring') : statusFilter === 'sent' ? t('admin.alertsStatusSent') : statusFilter === 'resolved' ? t('admin.alertsStatusResolved') : t('admin.alertsStatusMuted'))}
        </a>
      </div>

      <AlertTable alerts={alerts} />
    </section>
  );
}
